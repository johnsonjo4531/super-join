---
title: TypeScript decorators
group: Guides
order: 5
---

# TypeScript decorators

Instead of hand-building model objects, declare your entities as plain classes with decorators and generate the Super-Join metadata from them. Enable `experimentalDecorators` in your `tsconfig.json`.

## The decorators

```ts
import { Entity, Field, Relation } from "super-join";

@Entity({ id: 0n, source: ["public", "users"] })
class User {
  @Field({ dataType: "int64", identity: true })
  id!: bigint;

  @Field({ column: "name", dataType: "jsonb" })
  name!: string;

  @Relation(() => Post, { cardinality: "many", key: { from: "id", to: "authorId" } })
  posts!: Post[];
}

@Entity({ id: 1n, source: ["public", "posts"] })
class Post {
  @Field({ dataType: "int64", identity: true })
  id!: bigint;

  @Field({ dataType: "jsonb" })
  title!: string;

  @Field({ dataType: "int64" })
  authorId!: bigint;
}
```

- `@Entity(options)` goes on a class. `source` names the backing table; `id` pins the model entity id to the class (the id belongs to the class, never an instance).
- `@Field(options)` goes on a property: scalar type, optional physical `column`, `nullable`/`selectable`, `identity: true` for primary-key fields, and `computed` for SELECT-expression fields.
- `@Relation(() => Target, options)` goes on a relation property. `key: { from, to }` maps the local field name to the target field name; the join expression is built for you.

## Building the model

```ts
import { modelFromClasses } from "super-join";

const model = modelFromClasses([User, Post]);
```

Entity ids come from `@Entity({ id })` when given and are otherwise assigned in class order; field ids are assigned per entity in declaration order; relation ids globally. The result is the plain serializable `Model` used by `GraphQLModel`. `entityIdOf(User)` returns the id tied to the class.

## Hooks on entities and relations

Hooks may be registered where metadata lives:

```ts
@Entity({ source: "users", hooks: { where: ({ expr }) => /* ... */ undefined } })
class User { /* ... */ }

@Relation(() => Post, {
  cardinality: "many",
  key: { from: "id", to: "authorId" },
  hooks: { orderBy: () => [{ field: "createdAt", direction: "desc" }] },
})
posts!: Post[];
```

Entity hooks apply wherever the entity is queried; relation hooks apply wherever the relation is nested (their `where` folds into the join condition, their `orderBy` sorts children within each parent group).

## GraphQL field options via decorators

GraphQL-specific options — pagination mode and recognized arguments — attach with `@GraphQLField`, and one call turns decorated classes into a ready `GraphQLModel`:

```ts
import { GraphQLField, graphQLModelFromClasses } from "super-join/graphql/decorators";

class User {
  @Field({ dataType: "jsonb" })
  @GraphQLField({ pagination: "cursor" })
  name!: string;
}

const gql = graphQLModelFromClasses([User, Post], { dialect: "postgres" });
// gql.model, gql.entityForField, gql.fieldForEntity, gql.relationForField, gql.fields
```

The generated resolvers key GraphQL names by class and property names. When your GraphQL schema uses different names, override the pieces you need — `gql` is a normal `GraphQLModel`, so pass it to `graphqlToSQL` directly or spread overrides into it.

## See also

- [filtering-and-hooks.md](filtering-and-hooks.md) — what each option does during translation.
- The design document: `ai-design-docs/typescript-decorators.md`.
