// GraphQL-specific decorator API for Super-Join metadata.
//
// `@GraphQLField(options)` attaches per-field GraphQL options (pagination
// mode, recognized arguments) to properties of classes that also carry core
// Super-Join entity metadata. `graphQLModelFromClasses` turns decorated classes
// into a ready-to-use `GraphQLModel`: the model itself, the name→id resolvers,
// and the per-field hooks/options. See ai-design-docs/typescript-decorators.md.

import type { FieldOptions, GraphQLModel } from '../graphql.js';
import type { SqlDialect } from '../wit.js';
import { entityMetadataOf, modelFromClasses, type EntityClassMetadata } from '../decorators.js';

// Per-prototype store of `@GraphQLField` options keyed by property name.
const GRAPHQL_FIELD_OPTIONS = new WeakMap<object, Map<string, FieldOptions>>();

/** Property decorator attaching GraphQL field options to a class property. */
export function GraphQLField(options: FieldOptions) {
  return function (target: object, propertyKey: string): void {
    let store = GRAPHQL_FIELD_OPTIONS.get(target);
    if (!store) {
      store = new Map();
      GRAPHQL_FIELD_OPTIONS.set(target, store);
    }
    store.set(String(propertyKey), options);
  };
}

function graphqlFieldOptionsOf<TContext>(cls: unknown, property: string): FieldOptions<TContext> | undefined {
  if (typeof cls !== 'function') {
    return undefined;
  }
  const proto = (cls as { prototype?: object }).prototype;
  return proto ? (GRAPHQL_FIELD_OPTIONS.get(proto)?.get(property) as FieldOptions<TContext> | undefined) : undefined;
}

/** Options for {@link graphQLModelFromClasses}. */
export interface GraphQLModelFromClassesOptions {
  /** SQL dialect for compiled artifacts. */
  dialect?: SqlDialect;
}

/**
 * Builds a `GraphQLModel` from decorated classes: the model metadata, name→id
 * resolvers (GraphQL names are the class and property names), and per-field
 * options/hooks. Relation hooks land on their relation field; entity hooks land
 * under the class name. Combine with explicit `model.fields` overrides when the
 * GraphQL schema uses different names.
 */
export function graphQLModelFromClasses<TContext = unknown>(
  classes: readonly unknown[],
  options: GraphQLModelFromClassesOptions = {},
): GraphQLModel<TContext> {
  const model = modelFromClasses(classes);

  const entityForField = (fieldName: string): bigint | undefined => {
    for (let i = 0; i < classes.length; i += 1) {
      const meta = entityMetadataOf(classes[i]);
      if (meta && (meta.entityName === fieldName || meta.entityName.toLowerCase() === fieldName.toLowerCase())) {
        return model.entities[i]?.id;
      }
    }
    // A relation field resolves to its target entity. The assigned relation is
    // found by class and declaration position (same rule as `relationForField`),
    // because ids may have been auto-assigned during model generation.
    for (let ci = 0; ci < classes.length; ci += 1) {
      const meta = entityMetadataOf(classes[ci]);
      if (!meta?.relations.has(fieldName)) {
        continue;
      }
      let position = 0;
      for (const relation of meta.relations.values()) {
        const assigned = model.entities[ci]?.relations[position];
        position += 1;
        if (relation.property === fieldName) {
          return assigned?.target;
        }
      }
    }
    return undefined;
  };

  const fieldForEntity = (entityId: bigint, fieldName: string): bigint | undefined => {
    const index = model.entities.findIndex((entity) => entity.id === entityId);
    if (index < 0) {
      return undefined;
    }
    const meta = entityMetadataOf(classes[index]);
    let position = 0;
    for (const field of meta?.fields.values() ?? []) {
      const assigned = model.entities[index]!.fields[position];
      position += 1;
      if (field.property === fieldName) {
        return assigned?.id;
      }
    }
    return undefined;
  };

  const relationForField = (entityId: bigint, fieldName: string): bigint | undefined => {
    const index = model.entities.findIndex((entity) => entity.id === entityId);
    if (index < 0) {
      return undefined;
    }
    const meta = entityMetadataOf(classes[index]);
    let position = 0;
    for (const relation of meta?.relations.values() ?? []) {
      const assigned = model.entities[index]!.relations[position];
      position += 1;
      if (relation.property === fieldName) {
        return assigned?.id;
      }
    }
    return undefined;
  };

  const fields: Record<string, FieldOptions<TContext>> = {};
  const asHooks = (hooks: EntityClassMetadata['hooks']) =>
    hooks as unknown as FieldOptions<TContext>['hooks'];
  for (const cls of classes) {
    const meta: EntityClassMetadata | undefined = entityMetadataOf(cls);
    if (!meta) {
      continue;
    }
    if (meta.hooks) {
      fields[meta.entityName] = { ...fields[meta.entityName], hooks: asHooks(meta.hooks) } as FieldOptions<TContext>;
    }
    for (const relation of meta.relations.values()) {
      const graphQL = graphqlFieldOptionsOf<TContext>(cls, relation.property);
      fields[relation.property] = {
        ...fields[relation.property],
        ...graphQL,
        ...(relation.hooks ? { hooks: asHooks(relation.hooks) } : {}),
      } as FieldOptions<TContext>;
    }
    for (const field of meta.fields.values()) {
      const graphQL = graphqlFieldOptionsOf<TContext>(cls, field.property);
      if (graphQL) {
        fields[field.property] = { ...fields[field.property], ...graphQL } as FieldOptions<TContext>;
      }
    }
  }

  return {
    model,
    dialect: options.dialect,
    entityForField,
    fieldForEntity,
    relationForField,
    fields,
  };
}
