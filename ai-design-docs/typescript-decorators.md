# TypeScript decorators

## Purpose

Super-Join's model metadata is plain data, which is verbose to author by hand. The decorator API lets users declare entities, fields, and relations as TypeScript classes and generate that same serializable metadata from them. Decorators are a frontend-side authoring tool: the compiler boundary (WIT) never sees classes or decorators, only the resulting `Model`/`GraphQLModel` data.

## Placement

- Core decorators live in `src-js/decorators.ts` and are exported from the package root (`super-join`).
- GraphQL-specific decorators live in `src-js/graphql-decorators.ts`, exported at `super-join/graphql/decorators`.
- The API requires `experimentalDecorators` (legacy decorator semantics) in the consumer's `tsconfig.json`.

## Metadata ownership

Metadata attaches to the class itself, never to instances:

- A per-class record is stored under a well-known symbol (`Symbol.for('super-join.metadata')`) defined directly on the constructor; property decorators reach it through `target.constructor`.
- Model ids (entity, field, relation) are bigint and tied to the class. The underlying data may be any bigint, but the user-facing handle is the class: `entityIdOf(User)` returns the id assigned to `User`, not to a `user` instance.
- Subclasses inherit a copy of the nearest decorated ancestor's metadata; subclass annotations never mutate the parent.

## The decorators

```ts
@Entity(options?: EntityOptions)                 // class decorator
@Field(options: FieldOptions)                    // property decorator
@Relation(() => Target, options?: RelationOptions) // property decorator
```

- `EntityOptions`: `id` (pin the entity id), `source` (physical table as a string or dotted components; defaults to the lowercased class name), and `hooks` (entity-level where/orderBy hooks).
- `FieldOptions`: `id`, `column` (defaults to the property name), `dataType`, `nullable`, `selectable`, `identity`, and `computed` (a computed-field select definition built with `expr.select(...)`; see expression-model.md).
- `RelationOptions`: `id`, `cardinality` (default `many`), `key: { from, to }` (local field name → target field name; the static join expression is generated as `Column(target.to) = ParentColumn(1, local.from)`), and `hooks` (relation-level where/orderBy hooks).

Hooks are allowed on both entities and relations. They remain frontend-only values: they live in class metadata and are only ever handed to the GraphQL frontend, never serialized into a request (see frontend-hooks.md).

## Model generation

```ts
modelFromClasses(classes): Model
```

- Entity ids: explicit `EntityOptions.id` when present, otherwise assigned in class order. The assigned id is also stored on the class for `entityIdOf`.
- Field ids: explicit per field, otherwise assigned per entity in declaration order. All field ids are assigned before relation joins are built so a relation can reference target fields regardless of class order.
- Relation ids: globally unique (explicit or auto-assigned), because plan-level relation lookup is global.
- Identity fields come from `@Field({ identity: true })`.

Errors thrown at generation time: undecorated class, relation targeting an undecorated class, relation key naming a field that does not exist, missing join key.

## GraphQL bridge

`graphQLModelFromClasses(classes, { dialect })` produces a ready `GraphQLModel`:

- `model` from `modelFromClasses`.
- Resolvers keyed by the natural names: class name → entity id (also matching a relation field to its target entity), property name → field id within an entity, relation property name → relation id.
- `fields` (per-field GraphQL options) assembled from `@GraphQLField(options)` on properties plus hooks collected from entity/relation options.

`@GraphQLField(options)` takes the same `FieldOptions` the GraphQL frontend understands (`pagination`, `orderBy`, `filterArgs`) and attaches them to the property. When a GraphQL schema uses names that differ from class/property names, the returned `GraphQLModel` is ordinary data: users override resolvers or `fields` directly.

## Boundaries

- Decorators must not import anything that forces GraphQL.js or the Wasm component into the consumer; core decorators depend only on wit types and the expression builder.
- Generated metadata MUST be structurally identical to hand-written metadata — no hidden state leaks into compilation beyond the data itself.
- Decorated classes are not ORM entities: they carry no behavior, connections, or lifecycle. They are declarations of shape.
