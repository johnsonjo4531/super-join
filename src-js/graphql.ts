// GraphQL frontend: turns a GraphQL.js `ResolveInfo` plus Super-Join metadata
// into a serializable `CompilerRequest`.
//
// Contract (see ai-design-docs/architecture.md):
//   - Only the required parts of `resolveInfo` are read: operation, field nodes,
//     arguments, variable values, and (for nesting) the selection set.
//   - `resolveInfo` itself is never passed across the component boundary.
//   - `context` is frontend-local. Values such as a tenant id are NOT copied into
//     the request; they stay on the host. Only `context.model`,
//     `context.dialect`, and hook results feed the request.
//   - Fragment spreads, inline fragments, and `@skip`/`@include` are expanded
//     here; unsupported constructs (non-query operations, ambiguous metadata)
//     raise a structured `SuperJoinError` instead of leaking into Rust.
//
// GraphQL field/entity names are bridged to the numeric ids the compiler expects
// through the optional resolvers on `context`. When the model has a single
// entity, that entity is used implicitly; otherwise provide
// `context.entityForField`.

import type {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLResolveInfo,
  SelectionSetNode,
  ValueNode,
} from 'graphql';
import { ExpressionBuilder, type ExpressionSpec, type RawValue } from './expressions.js';
import { SuperJoinError } from './component.js';
import type {
  CompilerRequest,
  Expression,
  ExprNode,
  Model,
  OrderBy,
  Query,
  QueryNode,
  ScalarType,
  SelectionNode,
  SqlDialect,
} from './wit.js';

/** Maps a GraphQL field name to the id of the model entity backing it. */
export type EntityResolver = (fieldName: string) => bigint | undefined;
/** Maps (entity id, field name) to the id of the model field selected from it. */
export type FieldResolver = (entityId: bigint, fieldName: string) => bigint | undefined;
/** Maps (entity id, relation field name) to the id of the model relation. */
export type RelationResolver = (entityId: bigint, fieldName: string) => bigint | undefined;

export interface GraphQLContext {
  /** Super-Join model describing the entities, fields, and relations available. */
  model: Model;
  /** SQL dialect for the compiled artifact. Defaults to "other" when omitted. */
  dialect?: SqlDialect;
  /**
   * Bridge from GraphQL field names to model entity ids. Required whenever the
   * model has more than one entity and no convention can infer the entity.
   */
  entityForField?: EntityResolver;
  /** Override used to resolve a scalar field's id (and its data type). */
  fieldForEntity?: FieldResolver;
  /** Override used to resolve a nested relation field to a model relation id. */
  relationForField?: RelationResolver;
  /**
   * Frontend hooks keyed by GraphQL field name. Hooks run locally during
   * translation (before the component call) and may only contribute generic
   * expressions/ordering — never SQL text. See ai-design-docs/frontend-hooks.md.
   */
  hooks?: Record<string, FieldHooks>;
}

/** Environment handed to a hook while it executes in TypeScript. */
export interface HookEnvironment {
  args: Record<string, unknown>;
  context: GraphQLContext;
  expr: ExpressionBuilder;
  path: string[];
}

export type WhereHook = (env: HookEnvironment) => ExpressionSpec | undefined;
export type OrderByEntry = string | { field: string; direction?: 'asc' | 'desc' };
export type OrderByHook = (env: HookEnvironment) => OrderByEntry | Array<OrderByEntry> | undefined;

export interface FieldHooks {
  where?: WhereHook;
  orderBy?: OrderByHook;
}

export interface GraphQLToSqlArgs {
  resolveInfo: GraphQLResolveInfo;
  context: GraphQLContext;
}

const PAGINATION_ARGS = new Set(['limit', 'offset', 'first']);

/** True unless the selection is excluded by `@skip(if:)` / `@include(if:)`. */
function shouldInclude(
  node: { readonly directives?: ReadonlyArray<{ name: { value: string }; arguments?: ReadonlyArray<{ name: { value: string }; value: ValueNode }> }> },
  variables: Record<string, unknown>,
): boolean {
  for (const directive of node.directives ?? []) {
    if (directive.name.value !== 'skip' && directive.name.value !== 'include') {
      continue;
    }
    const condition = directive.arguments?.find((arg) => arg.name.value === 'if');
    if (!condition) {
      continue;
    }
    const value = Boolean(valueFromNode(condition.value, variables));
    if ((directive.name.value === 'skip' && value) || (directive.name.value === 'include' && !value)) {
      return false;
    }
  }
  return true;
}

/**
 * Expands fragment spreads and inline fragments into a flat list of field
 * nodes, honoring `@skip`/`@include` at every level. Response aliases are
 * preserved because field nodes are kept intact.
 */
function expandSelections(
  selectionSet: SelectionSetNode | undefined,
  fragments: Record<string, FragmentDefinitionNode>,
  variables: Record<string, unknown>,
): FieldNode[] {
  const fields: FieldNode[] = [];
  for (const selection of selectionSet?.selections ?? []) {
    if (!shouldInclude(selection, variables)) {
      continue;
    }
    switch (selection.kind) {
      case 'Field':
        fields.push(selection);
        break;
      case 'InlineFragment':
        fields.push(...expandSelections(selection.selectionSet, fragments, variables));
        break;
      case 'FragmentSpread': {
        const name = selection.name.value;
        const fragment = fragments[name];
        if (!fragment) {
          throw new SuperJoinError('invalid-request', `unknown fragment "${name}"`);
        }
        fields.push(...expandSelections(fragment.selectionSet, fragments, variables));
        break;
      }
    }
  }
  return fields;
}

/**
 * Resolves a GraphQL value node to a runtime value, expanding variables against
 * the operation's variable values. Never interpolates raw text into SQL.
 */
function valueFromNode(node: ValueNode, variables: Record<string, unknown>): unknown {
  switch (node.kind) {
    case 'Variable':
      return variables[node.name.value];
    case 'IntValue':
      return Number.parseInt(node.value, 10);
    case 'FloatValue':
      return Number.parseFloat(node.value);
    case 'StringValue':
    case 'EnumValue':
      return node.value;
    case 'BooleanValue':
      return node.value;
    case 'NullValue':
      return null;
    case 'ListValue':
      return node.values.map((entry) => valueFromNode(entry, variables));
    default:
      return (node as { value?: unknown }).value;
  }
}

function resolveEntityId(context: GraphQLContext, fieldName: string): bigint | undefined {
  if (context.entityForField) {
    return context.entityForField(fieldName);
  }
  if (context.model.entities.length === 1) {
    return context.model.entities[0]?.id;
  }
  return undefined;
}

/** Resolves a model field (id + data type) by name on the given entity. */
function resolveFieldMeta(context: GraphQLContext, entityId: bigint, fieldName: string): {
  id: bigint;
  dataType: ScalarType;
} {
  const entity = context.model.entities.find((item) => item.id === entityId);
  if (!entity) {
    throw new SuperJoinError('invalid-request', `entity ${entityId} is not present in the model`);
  }
  if (context.fieldForEntity) {
    const id = context.fieldForEntity(entityId, fieldName);
    const field = entity.fields.find((item) => item.id === id);
    if (field) {
      return { id: field.id, dataType: field.dataType };
    }
  }
  const field = entity.fields.find(
    (item) => item.identifier.components[item.identifier.components.length - 1] === fieldName,
  );
  if (!field) {
    throw new SuperJoinError('unknown-field', `field "${fieldName}" not found on entity ${entityId}`);
  }
  if (!field.selectable) {
    throw new SuperJoinError(
      'invalid-request',
      `field "${fieldName}" on entity ${entityId} is not selectable`,
    );
  }
  return { id: field.id, dataType: field.dataType };
}

interface SelectionResult {
  selections: SelectionNode[];
  predicate: ExprNode[];
  orderBy: OrderBy[];
  limit?: bigint;
  offset?: bigint;
}

/** Walks a field's selection set, emitting selections and a predicate. */
async function collectSelection(
  builder: ExpressionBuilder,
  context: GraphQLContext,
  field: FieldNode,
  entityId: bigint,
  variables: Record<string, unknown>,
  fragments: Record<string, FragmentDefinitionNode>,
  path: string[],
  queries: QueryNode[],
): Promise<SelectionResult> {
  const selections: SelectionNode[] = [];
  const orderBy: OrderBy[] = [];
  let limit: bigint | undefined;
  let offset: bigint | undefined;
  let rootExpr: ExpressionSpec | undefined;
  const resolvedArgs: Record<string, unknown> = {};

  for (const arg of field.arguments ?? []) {
    const name = arg.name.value;
    const raw = valueFromNode(arg.value, variables);
    if (raw === undefined || raw === null) {
      continue;
    }
    resolvedArgs[name] = raw;
    if (name === 'last') {
      throw new SuperJoinError(
        'unsupported-feature',
        'the "last" pagination argument is not supported; use "first"/"limit" and "offset"',
      );
    }
    if (PAGINATION_ARGS.has(name)) {
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
        throw new SuperJoinError('invalid-request', `pagination argument "${name}" must be a non-negative integer`);
      }
      const value = BigInt(raw);
      if (name === 'limit' || name === 'first') {
        limit = value;
      } else {
        offset = value;
      }
      continue;
    }
    if (name === 'orderBy') {
      const names = Array.isArray(raw) ? raw : [raw];
      for (const item of names) {
        if (typeof item !== 'string') {
          throw new SuperJoinError('invalid-request', 'orderBy must be an array of field names');
        }
        const meta = resolveFieldMeta(context, entityId, item);
        orderBy.push({ direction: 'asc', field: meta.id });
      }
      continue;
    }
    const meta = resolveFieldMeta(context, entityId, name);
    const step = builder.compare(
      'eq',
      builder.column(meta.id),
      builder.literal(raw as RawValue, meta.dataType),
    );
    rootExpr = rootExpr ? builder.and(rootExpr, step) : step;
  }

  // Hooks run once per field occurrence, after arguments/variables resolved,
  // in deterministic root-to-leaf order. They may only contribute generic
  // expressions and ordering; a thrown hook error is a frontend error naming
  // the GraphQL path.
  const hooks = context.hooks?.[field.name.value];
  if (hooks) {
    const env: HookEnvironment = { args: resolvedArgs, context, expr: builder, path };
    if (hooks.where) {
      let contribution: ExpressionSpec | undefined;
      try {
        contribution = hooks.where(env);
      } catch (error) {
        throw hookError('where', path, error);
      }
      if (contribution) {
        rootExpr = rootExpr ? builder.and(rootExpr, contribution) : contribution;
      }
    }
    if (hooks.orderBy) {
      let entries: OrderByEntry | Array<OrderByEntry> | undefined;
      try {
        entries = hooks.orderBy(env);
      } catch (error) {
        throw hookError('orderBy', path, error);
      }
      if (entries !== undefined) {
        for (const entry of Array.isArray(entries) ? entries : [entries]) {
          const name = typeof entry === 'string' ? entry : entry.field;
          const direction = typeof entry === 'string' ? 'asc' : entry.direction ?? 'asc';
          const meta = resolveFieldMeta(context, entityId, name);
          orderBy.push({ direction, field: meta.id });
        }
      }
    }
  }

  for (const sel of expandSelections(field.selectionSet, fragments, variables)) {
    const name = sel.name.value;
    const alias = sel.alias?.value ?? name;
    const nestedSelectionSet = sel.selectionSet;
    if (nestedSelectionSet && nestedSelectionSet.selections.length > 0) {
      const relationId = context.relationForField?.(entityId, name);
      const targetEntityId = resolveEntityId(context, name);
      if (relationId === undefined || targetEntityId === undefined) {
        throw new SuperJoinError(
          'invalid-request',
          `cannot resolve relation "${name}" for entity ${entityId} (provide context.relationForField)`,
        );
      }
      const nested = await collectSelection(
        builder,
        context,
        sel,
        targetEntityId,
        variables,
        fragments,
        [...path, name],
        queries,
      );
      queries.push({
        entity: targetEntityId,
        selection: nested.selections,
        predicate: nested.predicate,
        orderBy: nested.orderBy,
        limit: nested.limit,
        offset: nested.offset,
        path: [...path, name],
        nested: emptyBigUint64Array(),
      });
      selections.push({
        kind: 'relation',
        relation: relationId,
        outputKey: alias,
        path: [...path, name],
        queryRef: BigInt(queries.length - 1),
      });
    } else {
      const meta = resolveFieldMeta(context, entityId, name);
      selections.push({ kind: 'field', field: meta.id, outputKey: alias, path: [...path, name] });
    }
  }

  const predicate = rootExpr ? builder.build(rootExpr).nodes : [];
  return { selections, predicate, orderBy, limit, offset };
}

function hookError(kind: string, path: string[], error: unknown): SuperJoinError {
  const message = error instanceof Error ? error.message : String(error);
  return new SuperJoinError(
    'invalid-request',
    `${kind} hook at "${path.join('.')}" failed: ${message}`,
  );
}

/**
 * Maps a GraphQL.js `resolveInfo` and Super-Join context into a `CompilerRequest`
 * ready for the compiler component.
 */
export async function graphqlToSQL({ resolveInfo, context }: GraphQLToSqlArgs): Promise<CompilerRequest> {
  const operation = resolveInfo.operation;
  if (!operation || operation.operation !== 'query') {
    throw new SuperJoinError(
      'unsupported-feature',
      `super-join supports query operations only (got "${operation?.kind ?? 'unknown'}")`,
    );
  }

  const rootField = resolveInfo.fieldNodes[0];
  if (!rootField) {
    throw new SuperJoinError('invalid-request', 'operation did not select a root field');
  }

  const entityId = resolveEntityId(context, rootField.name.value);
  if (entityId === undefined) {
    throw new SuperJoinError(
      'invalid-request',
      `cannot map root field "${rootField.name.value}" to a model entity (provide context.entityForField)`,
    );
  }

  const variables = resolveInfo.variableValues;
  const builder = new ExpressionBuilder();
  const queries: QueryNode[] = [];
  const { selections, predicate, orderBy, limit, offset } = await collectSelection(
    builder,
    context,
    rootField,
    entityId,
    variables,
    resolveInfo.fragments ?? {},
    [rootField.name.value],
    queries,
  );

  queries.push({
    entity: entityId,
    selection: selections,
    predicate,
    orderBy,
    limit,
    offset,
    path: [rootField.name.value],
    nested: emptyBigUint64Array(),
  });

  return {
    model: context.model,
    query: { root: BigInt(queries.length - 1), queries } as Query,
    options: { dialect: context.dialect ?? 'other' },
  };
}

function emptyBigUint64Array(): BigUint64Array {
  return new BigUint64Array(0);
}
