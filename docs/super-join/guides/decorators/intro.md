---
title: Intro — why decorators
group: Decorator guide
order: 2
---

# Intro: why the decorator pattern

This is the **preferred** way to use Super-Join from TypeScript. You declare your model as plain classes with decorators, generate the compiler's metadata from them, and call `superjoin.graphql` in your resolvers. The alternative — hand-authoring the serializable model objects — is covered in the [Core API guide](../core-api/intro.md).

## What you choose by using decorators

- **Authoring**: entities, fields, and relations become classes and properties (`@Entity`, `@Field`, `@Relation`), so metadata lives next to the types your server code already has. GraphQL-specific options (pagination mode, recognized arguments) attach with `@GraphQLField`.
- **Generation, not magic**: one call — `graphQLModelFromClasses([User, Post], { dialect })` — produces exactly the same plain serializable `GraphQLModel` the core API would have you build by hand: model metadata, name→id resolvers, per-field options and hooks. Decorators never reach the compiler; the WIT boundary only ever sees data.
- **Ergonomics**: ids are assigned for you (or pinned explicitly when hooks need to reference columns), subclasses inherit metadata, and every generated piece is ordinary data you can override.

Choose the [core API](../core-api/intro.md) instead when you want zero decorator tooling, when your metadata comes from another source (introspection, a config file, codegen), or when you are authoring in JavaScript without a build step.

## Requirements

- TypeScript with `experimentalDecorators` (legacy decorator semantics) in your `tsconfig.json`.
- The decorators are exported at `super-join/decorators`; the GraphQL-specific ones at `super-join/decorators/graphql`.

```jsonc
// tsconfig.json
{ "compilerOptions": { "experimentalDecorators": true } }
```

## A taste

```ts
import { Entity, Field, Relation } from "super-join/decorators";

@Entity({ source: ["users"] })
class User {
  @Field({ dataType: "int64", identity: true })
  id!: bigint;

  @Field({ dataType: "text" })
  name!: string;

  @Relation(() => Post, { cardinality: "many", key: { from: "id", to: "authorId" } })
  posts!: Post[];
}
```

and in a resolver:

```ts
import { superjoin } from "super-join";

const users = await superjoin.graphql({ resolveInfo, context, model, execute });
```

## Next steps

1. [Building a GraphQL server](building-a-graphql-server.md) — the complete decorator-pattern server.
2. [Filtering, pagination, and hooks](filtering-pagination-hooks.md) — argument options and hooks declared on classes.
3. [Result shape and hydration](result-shape-and-hydration.md) — what `superjoin.graphql` does under the hood.

A runnable version of this guide lives in the repository at `examples/decorators-graphql-js` (`make example_decorators-graphql-js`).
