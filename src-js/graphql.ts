// GraphQL frontend: turns a GraphQL.js `ResolveInfo` plus Super-Join metadata
// into a serializable `CompilerRequest`.
//
// Contract (see ai-design-docs/architecture.md):
//   - Only the required parts of `resolveInfo` are read: operation, field nodes,
//     arguments, variable values, and (for nesting) the selection set.
//   - `resolveInfo` itself is never passed across the component boundary.
//   - `context` (the GraphQL resolver context) is frontend-local. Values such
//     as a tenant id are NOT copied into the request; they stay on the host and
//     are only handed to hooks. Only `model.model`, `model.dialect`, and hook
//     results feed the request.
//   - Fragment spreads, inline fragments, and `@skip`/`@include` are expanded
//     here; unsupported constructs (non-query operations, ambiguous metadata)
//     raise a structured `SuperJoinError` instead of leaking into Rust.
//
// Which GraphQL arguments super-join recognizes is configured per field through
// `GraphQLModel.fields` (`FieldOptions`): an offset-pagination field recognizes
// `limit`/`offset`, a cursor-pagination field recognizes the Relay connection
// arguments `first`/`last`/`after`/`before`, and `filterArgs` opts into mapping
// named arguments onto model-field equality predicates. Arguments that are not
// recognized are ignored for SQL purposes but still handed to hooks in `args`.
//
// GraphQL field/entity names are bridged to the numeric ids the compiler expects
// through the optional resolvers on `model`. When the model has a single
// entity, that entity is used implicitly; otherwise provide
// `model.entityForField`.

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

/**
 * How a GraphQL field paginates. `offset` recognizes the `limit`/`offset`
 * arguments only; `cursor` recognizes the Relay connection arguments
 * `first`/`last`/`after`/`before`. Defaults to `offset`.
 */
export type PaginationMode = 'offset' | 'cursor';

/**
 * Field-level options controlling which GraphQL arguments super-join
 * recognizes for one GraphQL field (entity or relation field), and the hooks
 * registered on it. Unrecognized arguments are ignored by SQL translation but
 * remain available to hooks through `HookEnvironment.args`.
 */
export interface FieldOptions<TContext = unknown> {
  /** Pagination style for this field. Defaults to `"offset"`. */
  pagination?: PaginationMode;
  /** Recognize the `orderBy` argument (default `true`). */
  orderBy?: boolean;
  /**
   * Map recognized filter arguments to model-field equality predicates.
   * `true` maps every non-reserved argument by its own name; an object maps
   * specific GraphQL argument names to model field names. Default: no
   * argument-derived filters.
   */
  filterArgs?: boolean | Record<string, string>;
  /** Hooks for this field (entity or relation). Overrides `GraphQLModel.hooks`. */
  hooks?: FieldHooks<TContext>;
}

/**
 * Super-Join metadata for translating GraphQL into SQL: the model, the target
 * dialect, the name→id resolvers, per-field options, and the frontend hooks.
 *
 * `TContext` is the GraphQL resolver context type used by the hooks in this
 * configuration; it defaults to `unknown`.
 */
export interface GraphQLModel<TContext = unknown> {
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
   * Per-field GraphQL options keyed by GraphQL field name: pagination mode,
   * recognized arguments, and hooks. Applies to root and nested fields alike.
   */
  fields?: Record<string, FieldOptions<TContext>>;
  /**
   * Frontend hooks keyed by GraphQL field name (shorthand for the same-field
   * `fields[name].hooks`). Hooks run locally during translation (before the
   * component call) and may only contribute generic expressions/ordering —
   * never SQL text. See ai-design-docs/frontend-hooks.md.
   */
  hooks?: Record<string, FieldHooks<TContext>>;
}

/** Environment handed to a hook while it executes in TypeScript. */
export interface HookEnvironment<TContext = unknown> {
  args: Record<string, unknown>;
  /** Super-Join metadata (model, dialect, resolvers) for this translation. */
  model: GraphQLModel<TContext>;
  /** The GraphQL resolver context; frontend-local and never sent to Rust. */
  context: TContext;
  expr: ExpressionBuilder;
  path: string[];
}

/** A hook contributing a `where` predicate expression (or nothing). */
export type WhereHook<TContext = unknown> = (
  env: HookEnvironment<TContext>,
) => ExpressionSpec | undefined;
export type OrderByEntry = string | { field: string; direction?: 'asc' | 'desc' };
/** A hook contributing one or more ordering entries (or nothing). */
export type OrderByHook<TContext = unknown> = (
  env: HookEnvironment<TContext>,
) => OrderByEntry | Array<OrderByEntry> | undefined;

/** The `where`/`orderBy` hooks registered for a single GraphQL field. */
export interface FieldHooks<TContext = unknown> {
  where?: WhereHook<TContext>;
  orderBy?: OrderByHook<TContext>;
}

/** Arguments of {@link graphqlToSQL}. */
export interface GraphQLToSqlArgs<TContext = unknown> {
  resolveInfo: GraphQLResolveInfo;
  /** The GraphQL resolver context (graphql-js's own "context"). */
  context: TContext;
  /** Super-Join metadata for the translation. */
  model: GraphQLModel<TContext>;
}

/** Effective options for one field name, with defaults applied. */
interface ResolvedFieldOptions {
  pagination: PaginationMode;
  orderBy: boolean;
  filterArgs?: boolean | Record<string, string>;
}

function resolveFieldOptions<TContext>(
  model: GraphQLModel<TContext>,
  fieldName: string,
): ResolvedFieldOptions {
  const options = model.fields?.[fieldName];
  return {
    pagination: options?.pagination ?? 'offset',
    orderBy: options?.orderBy !== false,
    filterArgs: options?.filterArgs,
  };
}

/** The model field name a GraphQL argument filters on, if it filters at all. */
function filterFieldFor(options: ResolvedFieldOptions, argName: string): string | undefined {
  if (options.filterArgs === true) {
    return argName;
  }
  if (typeof options.filterArgs === 'object' && options.filterArgs !== null) {
    return options.filterArgs[argName];
  }
  return undefined;
}

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

/** The parts of {@link GraphQLModel} needed for name→id resolution. */
type ModelSource = Pick<GraphQLModel, "model" | "entityForField" | "fieldForEntity">;

function resolveEntityId(model: ModelSource, fieldName: string): bigint | undefined {
  if (model.entityForField) {
    return model.entityForField(fieldName);
  }
  if (model.model.entities.length === 1) {
    return model.model.entities[0]?.id;
  }
  return undefined;
}

/** Resolves a model field (id + data type) by name on the given entity. */
function resolveFieldMeta(model: ModelSource, entityId: bigint, fieldName: string): {
  id: bigint;
  dataType: ScalarType;
} {
  const entity = model.model.entities.find((item) => item.id === entityId);
  if (!entity) {
    throw new SuperJoinError('invalid-request', `entity ${entityId} is not present in the model`);
  }
  if (model.fieldForEntity) {
    const id = model.fieldForEntity(entityId, fieldName);
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

/** The declared data type of a field id (used for cursor value literals). */
function fieldTypeById(model: ModelSource, entityId: bigint, fieldId: bigint): ScalarType {
  const entity = model.model.entities.find((item) => item.id === entityId);
  const field = entity?.fields.find((item) => item.id === fieldId);
  if (!field) {
    throw new SuperJoinError('invalid-request', `ordering field ${fieldId} is not on entity ${entityId}`);
  }
  return field.dataType;
}

// ---------------------------------------------------------------------------
// Relay-compatible cursor pagination helpers.
// ---------------------------------------------------------------------------

/** Opaque Relay-style cursor: base64url JSON of the ordering column values. */
export function encodeCursor(values: unknown[]): string {
  const json = JSON.stringify({ v: values });
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes an {@link encodeCursor} cursor back into its ordering values. */
export function decodeCursor(cursor: string): unknown[] {
  let value: unknown;
  try {
    const base64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const parsed = JSON.parse(json) as { v?: unknown };
    if (!parsed || !Array.isArray(parsed.v)) {
      throw new Error('cursor payload is not an array');
    }
    value = parsed.v;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SuperJoinError('invalid-request', `malformed cursor "${cursor}": ${message}`);
  }
  return value as unknown[];
}

interface CursorArgs {
  first?: bigint;
  last?: bigint;
  after?: string;
  before?: string;
}

/**
 * Applies Relay connection semantics to one query node. `last`/`before` flip the
 * ordering (the driver reverses rows back); `after`/`before` become a strict
 * tuple comparison against the decoded cursor; `first`/`last` set the limit to
 * pageSize+1 so the driver can detect hasNextPage/hasPreviousPage and trim.
 */
function applyCursorPagination<TContext>(
  builder: ExpressionBuilder,
  model: GraphQLModel<TContext>,
  entityId: bigint,
  cursorArgs: CursorArgs,
  orderBy: OrderBy[],
): { limit?: bigint; predicate?: ExpressionSpec } {
  const { first, last, after, before } = cursorArgs;
  if (first !== undefined && last !== undefined) {
    throw new SuperJoinError('invalid-request', 'cursor pagination accepts either "first" or "last", not both');
  }
  if ((after ?? before) !== undefined && first === undefined && last === undefined) {
    throw new SuperJoinError('invalid-request', 'cursor arguments "after"/"before" require "first" or "last"');
  }
  if (after !== undefined && before !== undefined) {
    throw new SuperJoinError('invalid-request', 'cursor pagination accepts either "after" or "before", not both');
  }

  // Backward pass: flip every ordering direction; the driver reverses rows.
  if (last !== undefined) {
    for (const entry of orderBy) {
      entry.direction = entry.direction === 'asc' ? 'desc' : 'asc';
    }
  }

  let predicate: ExpressionSpec | undefined;
  const cursor = after ?? before;
  if (cursor !== undefined) {
    if (orderBy.length === 0) {
      throw new SuperJoinError(
        'invalid-request',
        'cursor pagination requires an ordering (pass orderBy or register an orderBy hook)',
      );
    }
    const values = decodeCursor(cursor);
    if (values.length !== orderBy.length) {
      throw new SuperJoinError(
        'invalid-request',
        `cursor has ${values.length} value(s) but the ordering has ${orderBy.length} field(s)`,
      );
    }
    predicate = tupleAfter(builder, model, entityId, orderBy, values);
  }

  const pageSize = first ?? last;
  // One extra row (LIMIT pageSize+1) reveals whether another page exists.
  const limit = pageSize === undefined ? undefined : pageSize + 1n;
  return { limit, predicate };
}

/**
 * Strict lexicographic "after the cursor" predicate over the ordering tuple:
 * `OR_i( AND_{j<i}(col_j = v_j) AND cmp_i(col_i, v_i) )`, where `cmp_i` is `>`
 * for ascending and `<` for descending.
 */
function tupleAfter<TContext>(
  builder: ExpressionBuilder,
  model: GraphQLModel<TContext>,
  entityId: bigint,
  orderBy: OrderBy[],
  values: unknown[],
): ExpressionSpec {
  const alternatives: ExpressionSpec[] = [];
  for (let i = 0; i < orderBy.length; i += 1) {
    const parts: ExpressionSpec[] = [];
    for (let j = 0; j < i; j += 1) {
      parts.push(equalityOn(builder, model, entityId, orderBy[j]!, values[j]));
    }
    const entry = orderBy[i]!;
    const column = builder.column(entry.field);
    const literal = valueLiteral(builder, model, entityId, entry.field, values[i]);
    parts.push(entry.direction === 'asc' ? builder.gt(column, literal) : builder.lt(column, literal));
    alternatives.push(parts.length === 1 ? parts[0]! : builder.and(...parts));
  }
  return alternatives.length === 1 ? alternatives[0]! : builder.or(...alternatives);
}

function equalityOn<TContext>(
  builder: ExpressionBuilder,
  model: GraphQLModel<TContext>,
  entityId: bigint,
  entry: OrderBy,
  value: unknown,
): ExpressionSpec {
  return builder.eq(
    builder.column(entry.field),
    valueLiteral(builder, model, entityId, entry.field, value),
  );
}

function valueLiteral<TContext>(
  builder: ExpressionBuilder,
  model: GraphQLModel<TContext>,
  entityId: bigint,
  fieldId: bigint,
  value: unknown,
): ExpressionSpec {
  const dataType = fieldTypeById(model, entityId, fieldId);
  return builder.literal(value as RawValue, dataType);
}

interface SelectionResult {
  selections: SelectionNode[];
  predicate: ExprNode[];
  orderBy: OrderBy[];
  limit?: bigint;
  offset?: bigint;
}

/** Walks a field's selection set, emitting selections and a predicate. */
async function collectSelection<TContext>(
  builder: ExpressionBuilder,
  model: GraphQLModel<TContext>,
  context: TContext,
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
  const options = resolveFieldOptions(model, field.name.value);
  const cursorArgs: CursorArgs = {};

  for (const arg of field.arguments ?? []) {
    const name = arg.name.value;
    const raw = valueFromNode(arg.value, variables);
    if (raw === undefined || raw === null) {
      continue;
    }
    resolvedArgs[name] = raw;

    // Offset pagination: limit & offset only.
    if (options.pagination === 'offset' && (name === 'limit' || name === 'offset')) {
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
        throw new SuperJoinError('invalid-request', `pagination argument "${name}" must be a non-negative integer`);
      }
      if (name === 'limit') {
        limit = BigInt(raw);
      } else {
        offset = BigInt(raw);
      }
      continue;
    }

    // Cursor pagination: the Relay connection arguments.
    if (options.pagination === 'cursor' && (name === 'first' || name === 'last')) {
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
        throw new SuperJoinError('invalid-request', `pagination argument "${name}" must be a non-negative integer`);
      }
      cursorArgs[name] = BigInt(raw);
      continue;
    }
    if (options.pagination === 'cursor' && (name === 'after' || name === 'before')) {
      if (typeof raw !== 'string') {
        throw new SuperJoinError('invalid-request', `cursor argument "${name}" must be a string`);
      }
      cursorArgs[name] = raw;
      continue;
    }

    if (name === 'orderBy' && options.orderBy) {
      const names = Array.isArray(raw) ? raw : [raw];
      for (const item of names) {
        if (typeof item !== 'string') {
          throw new SuperJoinError('invalid-request', 'orderBy must be an array of field names');
        }
        const meta = resolveFieldMeta(model, entityId, item);
        orderBy.push({ direction: 'asc', field: meta.id });
      }
      continue;
    }

    // Recognized filter arguments become equality predicates.
    const filterField = filterFieldFor(options, name);
    if (filterField !== undefined) {
      const meta = resolveFieldMeta(model, entityId, filterField);
      const step = builder.compare(
        'eq',
        builder.column(meta.id),
        builder.literal(raw as RawValue, meta.dataType),
      );
      rootExpr = rootExpr ? builder.and(rootExpr, step) : step;
      continue;
    }

    // Anything else is not recognized by super-join: it stays out of the SQL
    // but remains available to hooks through `args`.
  }

  // Hooks run once per field occurrence, after arguments/variables resolved,
  // in deterministic root-to-leaf order. They may only contribute generic
  // expressions and ordering; a thrown hook error is a frontend error naming
  // the GraphQL path. Relation fields get hooks exactly like entity fields:
  // their `where` folds into the join condition and their `orderBy` orders the
  // nested rows within each parent group.
  const hooks = model.fields?.[field.name.value]?.hooks ?? model.hooks?.[field.name.value];
  if (hooks) {
    const env: HookEnvironment<TContext> = { args: resolvedArgs, model, context, expr: builder, path };
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
          const meta = resolveFieldMeta(model, entityId, name);
          orderBy.push({ direction, field: meta.id });
        }
      }
    }
  }

  // Cursor pagination is applied after hooks so hook-contributed ordering
  // participates in the cursor comparison.
  if (options.pagination === 'cursor') {
    const applied = applyCursorPagination(builder, model, entityId, cursorArgs, orderBy);
    limit = applied.limit;
    if (applied.predicate) {
      rootExpr = rootExpr ? builder.and(rootExpr, applied.predicate) : applied.predicate;
    }
  }

  for (const sel of expandSelections(field.selectionSet, fragments, variables)) {
    const name = sel.name.value;
    const alias = sel.alias?.value ?? name;
    const nestedSelectionSet = sel.selectionSet;
    if (nestedSelectionSet && nestedSelectionSet.selections.length > 0) {
      const relationId = model.relationForField?.(entityId, name);
      const targetEntityId = resolveEntityId(model, name);
      if (relationId === undefined || targetEntityId === undefined) {
        throw new SuperJoinError(
          'invalid-request',
          `cannot resolve relation "${name}" for entity ${entityId} (provide model.relationForField)`,
        );
      }
      const nested = await collectSelection(
        builder,
        model,
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
      const meta = resolveFieldMeta(model, entityId, name);
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
 * Maps a GraphQL.js `resolveInfo`, its resolver `context`, and Super-Join
 * metadata into a `CompilerRequest` ready for the compiler component.
 */
export async function graphqlToSQL<TContext = unknown>({
  resolveInfo,
  context,
  model,
}: GraphQLToSqlArgs<TContext>): Promise<CompilerRequest> {
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

  const entityId = resolveEntityId(model, rootField.name.value);
  if (entityId === undefined) {
    throw new SuperJoinError(
      'invalid-request',
      `cannot map root field "${rootField.name.value}" to a model entity (provide model.entityForField)`,
    );
  }

  const variables: Record<string, unknown> = { ...resolveInfo.variableValues };
  const builder = new ExpressionBuilder();
  const queries: QueryNode[] = [];
  const { selections, predicate, orderBy, limit, offset } = await collectSelection(
    builder,
    model,
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
    model: model.model,
    query: { root: BigInt(queries.length - 1), queries } as Query,
    options: { dialect: model.dialect ?? 'other' },
  };
}

function emptyBigUint64Array(): BigUint64Array {
  return new BigUint64Array(0);
}
