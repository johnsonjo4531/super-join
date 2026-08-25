# Model

## Purpose

The model is Super-Join's generic description of the data it can query. It separates database/model knowledge from a frontend's schema. A GraphQL schema may be translated into this model, but it is not the model itself.

```text
GraphQL schema + Super-Join metadata -> Super-Join model -> compiler
```

## Required concepts

The model must describe:

- Entities and their stable logical identifiers.
- Physical tables or other source relations.
- Scalar fields and their physical columns/types.
- Relations, including cardinality and join mapping.
- Primary or identity fields where required for result shaping.
- Optional mapping between frontend field names and model identifiers.

### Conceptual schema

```rust
struct Model { entities: Vec<Entity> }
struct Entity {
    id: EntityId,
    source: TableRef,
    fields: Vec<Field>,
    relations: Vec<Relation>,
}
struct Field {
    id: FieldId,
    column: ColumnRef,
    value_type: ValueType,
    nullable: bool,
    selectable: bool,
}
struct Relation {
    id: RelationId,
    target: EntityId,
    cardinality: OneOrMany,
    join: ExpressionTemplate,
}
```

`EntityId`, `FieldId`, and `RelationId` are logical stable identifiers; physical names are distinct fields. `TableRef` and `ColumnRef` must be identifier components, not raw SQL fragments. The initial relation representation should be restricted to equality mappings between known source/target fields. General arbitrary join expressions can be added later using the expression model with clearly defined scopes.

Example:

```text
User -> table users
  id       -> users.id
  name     -> users.name
  posts    -> relation Post, users.id = posts.author_id

Post -> table posts
  id       -> posts.id
  authorId -> posts.author_id
  title    -> posts.title
```

## Responsibilities

The model is declarative. It must not contain a database connection, ORM instance, executable callback, or rendered SQL. Dynamic behavior belongs to frontend hooks, which produce expressions that reference model concepts.

## Validation

Before SQL rendering, the compiler validates that requested entities/fields/relations exist, relation endpoints are valid, physical identifiers are safe model identifiers, and expressions refer to columns available in their scope.

Validation must additionally reject duplicate logical IDs, duplicate physical output aliases after planning, relations without a usable key mapping, nonselectable requested fields, and values incompatible with declared field types where type checking is available. Model validation should happen once per request before semantic lowering, so later compiler stages can rely on it.

## Design constraint

Do not assume `GraphQL schema == database schema`. The model must be expressive enough to map differing names, relationships, and frontend presentation choices to a relational source.
