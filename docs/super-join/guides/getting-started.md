---
title: Getting started
group: Guides
order: 1
---

# Getting started

Super-Join compiles a GraphQL query (plus model metadata) into a parameterized SQL artifact. It never executes SQL — your application owns the driver.

## Install

```sh
npm install super-join graphql
```

`graphql` is an optional peer dependency, required only for the GraphQL frontend entry point.

## Compile a GraphQL query to SQL

Build a `GraphQLModel` from your model metadata, hand it (plus the resolver info and your GraphQL server's context) to `graphqlToSQL`, then compile the resulting request through the Wasm component:

```ts
import { graphqlToSQL } from "super-join/graphql";
import { compile } from "super-join";

const request = await graphqlToSQL({ resolveInfo, context, model });
const artifact = await compile(request);

// artifact.sql is parameterized text; run it with your own driver.
await db.query(artifact.sql, artifact.parameters);
```

The `model` bridges GraphQL names to model ids and may carry hooks; `context` is the GraphQL server's own resolver context, handed to hooks but never sent to the compiler:

```ts
import type { GraphQLModel } from "super-join/graphql";

const model: GraphQLModel = {
  model, // entities, fields, relations (see the API reference)
  dialect: "postgres",
  entityForField: (fieldName) => (fieldName === "users" ? 0n : undefined),
  fieldForEntity: (entityId, fieldName) =>
    fieldName === "id" ? 0n : fieldName === "name" ? 1n : undefined,
  hooks: {
    users: {
      where: ({ args, expr }) =>
        args.active === true ? expr.eq("active", true) : undefined,
    },
  },
};
```

## Errors

Every boundary failure is a structured `SuperJoinError` with a stable `code` (`invalid-request`, `unknown-field`, ...) and an optional request-relative `path`. Catch it; no host exception types are required.

## Next steps

- Follow the [GraphQL server guide](graphql-server.md) to build a complete graphql-js server around this flow.
- Browse the TypeScript API reference in the sidebar for every exported symbol.
- Rust embedders: use `super-join-core` directly and read its rustdoc pages (`cargo doc`, served from `docs/super-join/rust-api/index.html`).
