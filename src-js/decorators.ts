// TypeScript decorator API for Super-Join model metadata.
//
// Decorators attach Super-Join `Model` metadata to plain TypeScript classes:
// `@Entity(options)` on a class, `@Field(options)` on a property, and
// `@Relation(() => Target, options)` on a relation property. Metadata belongs
// to the class itself (not instances): entity ids, field ids, and relation ids
// are bigint model ids keyed by the class constructor. See
// ai-design-docs/typescript-decorators.md for the full design.

import type { EntityMetadata, Expression, FieldMetadata, Identifier, Model } from './wit.js';
import type { ComputedFieldSpec } from './expressions.js';
import { ExpressionBuilder } from './expressions.js';
import type { FieldHooks } from './graphql.js';

/** Options for the {@link Entity} class decorator. */
export interface EntityOptions {
  /** Explicit model entity id. Auto-assigned by `modelFromClasses` when omitted. */
  id?: bigint;
  /** Physical source table, e.g. `"users"` or `["public", "users"]`. */
  source?: string | readonly string[];
  /** Hooks on the entity itself (where/orderBy applied wherever it is queried). */
  hooks?: FieldHooks<unknown>;
}

/** Options for the {@link Field} property decorator. */
export interface FieldOptions {
  /** Explicit model field id. Auto-assigned per entity when omitted. */
  id?: bigint;
  /** Physical column, e.g. `"name"` or `["users", "name"]`. Defaults to the property name. */
  column?: string | readonly string[];
  /** Declared scalar type of the field. */
  dataType: import('./wit.js').ScalarType;
  /** Whether the field may be null (default `false`). */
  nullable?: boolean;
  /** Whether the field may be selected (default `true`). */
  selectable?: boolean;
  /** Marks the field as part of the entity identity (primary key). */
  identity?: boolean;
  /**
   * A computed SELECT expression that satisfies this field instead of a
   * physical column, e.g. `expr.select(POST_ENTITY_ID, expr.count(), { where })`.
   */
  computed?: ComputedFieldSpec;
}

/** Options for the {@link Relation} property decorator. */
export interface RelationOptions {
  /** Explicit model relation id. Auto-assigned by `modelFromClasses` when omitted. */
  id?: bigint;
  /** Cardinality of this relation endpoint (default `"many"`). */
  cardinality?: 'one' | 'many';
  /**
   * Join key: `from` is a field name on the declaring entity, `to` is a field
   * name on the target entity (e.g. `key: { from: "id", to: "authorId" }`).
   */
  key?: { from: string; to: string };
  /** Hooks on the relation (where/orderBy applied wherever it is nested). */
  hooks?: FieldHooks<unknown>;
}

/** Per-class metadata attached by the decorators. */
export interface EntityClassMetadata {
  entityName: string;
  id?: bigint;
  source?: Identifier;
  hooks?: FieldHooks<unknown>;
  fields: Map<string, FieldOptions & { property: string }>;
  relations: Map<string, RelationOptions & { property: string; target: () => unknown }>;
}

const METADATA = Symbol.for('super-join.metadata');
const ENTITY_ID = Symbol.for('super-join.entity-id');

type MetadataCarrier = Record<symbol, EntityClassMetadata | undefined> & { name?: string };

/** The class a decorator applies to: the constructor itself or a prototype's. */
function ownerClass(target: object): Function {
  return typeof target === 'function' ? (target as Function) : ((target as { constructor: Function }).constructor as Function);
}

function metadataOf(target: object): EntityClassMetadata {
  const cls = ownerClass(target);
  const carrier = cls as unknown as MetadataCarrier;
  let meta = carrier[METADATA];
  if (!meta) {
    meta = {
      entityName: cls.name,
      fields: new Map(),
      relations: new Map(),
    };
    Object.defineProperty(cls, METADATA, { value: meta, configurable: true });
  }
  return meta;
}

/** Reads metadata declared directly on a class (own property only). */
function ownMetadata(cls: unknown): EntityClassMetadata | undefined {
  if (typeof cls !== 'function') {
    return undefined;
  }
  const carrier = cls as unknown as MetadataCarrier;
  return Object.prototype.hasOwnProperty.call(carrier, METADATA) ? carrier[METADATA] : undefined;
}

/** Returns the Super-Join metadata attached to a decorated class. */
export function entityMetadataOf(cls: unknown): EntityClassMetadata | undefined {
  const own = ownMetadata(cls);
  if (own) {
    return own;
  }
  if (typeof cls !== 'function') {
    return undefined;
  }
  // Inherit the nearest decorated ancestor's metadata (copied so subclass
  // annotations never mutate the parent).
  const proto = Object.getPrototypeOf(cls);
  if (proto && proto !== Function.prototype) {
    const inherited = entityMetadataOf(proto);
    if (inherited) {
      const copy: EntityClassMetadata = {
        entityName: cls.name,
        id: inherited.id,
        source: inherited.source ? { components: [...inherited.source.components] } : undefined,
        hooks: inherited.hooks,
        fields: new Map(inherited.fields),
        relations: new Map(inherited.relations),
      };
      Object.defineProperty(cls, METADATA, { value: copy, configurable: true });
      return copy;
    }
  }
  return undefined;
}

/** Returns the model entity id assigned to a decorated class, if any. */
export function entityIdOf(cls: unknown): bigint | undefined {
  if (typeof cls !== 'function') {
    return undefined;
  }
  const carrier = cls as unknown as Record<symbol, bigint | undefined>;
  return carrier[ENTITY_ID] ?? entityMetadataOf(cls)?.id;
}

/** Class decorator attaching Super-Join entity metadata to a class. */
export function Entity(options: EntityOptions = {}) {
  return function (target: Function): void {
    const meta = metadataOf(target);
    meta.entityName = target.name;
    if (options.id !== undefined) {
      meta.id = options.id;
    }
    if (options.source !== undefined) {
      meta.source = toIdentifier(options.source, target.name.toLowerCase());
    }
    if (options.hooks) {
      meta.hooks = options.hooks as FieldHooks<unknown>;
    }
  };
}

/** Property decorator attaching Super-Join field metadata to a class property. */
export function Field(options: FieldOptions) {
  return function (target: object, propertyKey: string): void {
    const meta = metadataOf(target);
    meta.fields.set(propertyKey, { ...options, property: String(propertyKey) });
  };
}

/** Property decorator attaching a Super-Join relation to a class property. */
export function Relation(targetType: () => unknown, options: RelationOptions = {}) {
  return function (target: object, propertyKey: string): void {
    const meta = metadataOf(target);
    meta.relations.set(propertyKey, { ...options, property: String(propertyKey), target: targetType });
  };
}

function toIdentifier(value: string | readonly string[] | undefined, fallback: string): Identifier {
  if (value === undefined) {
    return { components: [fallback] };
  }
  const components = typeof value === 'string' ? [value] : [...value];
  return { components };
}

function nextId(explicit: bigint | undefined, used: bigint[], counter: () => bigint): bigint {
  if (explicit !== undefined) {
    used.push(explicit);
    return explicit;
  }
  let candidate = counter();
  while (used.includes(candidate)) {
    candidate += 1n;
  }
  used.push(candidate);
  return candidate;
}

/**
 * Builds the Super-Join `Model` metadata from decorated classes. Entity ids are
 * taken from `@Entity({ id })` when present and otherwise assigned in class
 * order; field ids are assigned per entity in declaration order, and relation
 * ids globally. The resulting model is plain serializable data ready for a
 * `GraphQLModel`.
 */
export function modelFromClasses(classes: readonly unknown[]): Model {
  const entities: EntityMetadata[] = [];
  const usedEntityIds: bigint[] = [];
  let nextEntityId = 0n;
  const usedRelationIds: bigint[] = [];
  let nextRelationId = 0n;

  const entityIds = new Map<unknown, bigint>();
  for (const cls of classes) {
    const meta = entityMetadataOf(cls);
    if (!meta) {
      throw new TypeError(`class "${nameOf(cls)}" is not decorated with @Entity`);
    }
    const id = nextId(meta.id, usedEntityIds, () => nextEntityId++);
    entityIds.set(cls, id);
    (cls as unknown as Record<symbol, bigint>)[ENTITY_ID] = id;
  }

  // Assign every field id up front so relation joins can reference the target
  // entity's assigned ids regardless of class order.
  const fieldIds = new Map<unknown, Map<string, bigint>>();
  for (const cls of classes) {
    const meta = entityMetadataOf(cls)!;
    const usedFieldIds: bigint[] = [];
    let nextFieldId = 0n;
    const perClass = new Map<string, bigint>();
    for (const field of meta.fields.values()) {
      perClass.set(field.property, nextId(field.id, usedFieldIds, () => nextFieldId++));
    }
    fieldIds.set(cls, perClass);
  }

  for (const cls of classes) {
    const meta = entityMetadataOf(cls)!;
    const entityId = entityIds.get(cls)!;
    const perClass = fieldIds.get(cls)!;
    const fields: FieldMetadata[] = [];
    const identity: bigint[] = [];
    for (const field of meta.fields.values()) {
      const id = perClass.get(field.property)!;
      fields.push({
        id,
        identifier: toIdentifier(field.column, field.property),
        dataType: field.dataType,
        nullable: field.nullable ?? false,
        selectable: field.selectable ?? true,
        computed: field.computed,
      });
      if (field.identity) {
        identity.push(id);
      }
    }
    const relations: import('./wit.js').RelationMetadata[] = [];
    for (const relation of meta.relations.values()) {
      const targetCls = relation.target();
      const targetId = entityIds.get(targetCls);
      if (targetId === undefined) {
        throw new TypeError(
          `relation "${relation.property}" on "${meta.entityName}" targets an undecorated class`,
        );
      }
      relations.push({
        id: nextId(relation.id, usedRelationIds, () => nextRelationId++),
        target: targetId,
        cardinality: relation.cardinality ?? 'many',
        join: buildJoinExpression(cls, targetCls, meta, relation, fieldIds),
      });
    }
    entities.push({
      id: entityId,
      source: meta.source ?? toIdentifier(undefined, meta.entityName.toLowerCase()),
      fields,
      relations,
      identity: new BigUint64Array(identity),
    });
  }

  return { entities };
}

function nameOf(value: unknown): string {
  if (typeof value === 'function' && value.name) {
    return value.name;
  }
  return String(value);
}

/** Builds the static join expression from a relation's declared key. */
function buildJoinExpression(
  localCls: unknown,
  targetCls: unknown,
  localMeta: EntityClassMetadata,
  relation: RelationOptions & { property: string },
  fieldIds: Map<unknown, Map<string, bigint>>,
): Expression {
  if (!relation.key) {
    throw new TypeError(`relation "${relation.property}" requires a key ({ from, to })`);
  }
  const builder = new ExpressionBuilder();
  const localFieldId = fieldIds.get(localCls)?.get(relation.key.from);
  const targetFieldId = fieldIds.get(targetCls)?.get(relation.key.to);
  if (localFieldId === undefined || targetFieldId === undefined) {
    throw new TypeError(
      `relation "${relation.property}" on "${localMeta.entityName}" references unknown key fields`,
    );
  }
  return builder.build(
    builder.eq(builder.column(targetFieldId), builder.parentColumn(1, localFieldId)),
  );
}
