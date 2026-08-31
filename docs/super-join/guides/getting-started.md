---
title: Getting started
group: Guides
order: 1
---

# Getting started

Super-Join compiles a nested data request — initially GraphQL — into a parameterized SQL artifact, runs it through your own driver callback, and hydrates the flattened rows back into entities. It never executes SQL itself — your application owns the driver.

## Install

```sh
npm install super-join graphql
```

`graphql` is an optional peer dependency, required only for the GraphQL entry point.

## The main API: `superjoin`

`superjoin` encompasses compile and hydrate in one call. You provide a callback that you call your db driver with; super-join hands it the compiled artifact and returns hydrated entities:

```ts
import { superjoin } from "super-join";

const users = await superjoin(request, async (artifact) => {
  // artifact.sql is parameterized text; run it with your own driver.
  return db.query(artifact.sql, artifact.parameters);
});
```

For GraphQL servers there is a GraphQL-shaped front of the same pipeline — `superjoin.graphql` translates a resolver's `ResolveInfo`, compiles, calls your driver callback, and hydrates:

```ts
import { superjoin } from "super-join";

async function queryUsers(_args, context, info) {
  return superjoin.graphql({ resolveInfo: info, context, model, execute });
}
```

## Choosing a guide

Super-Join ships two first-class ways to author the model metadata it compiles against. Both guides walk the same three steps (building a GraphQL server; filtering, pagination, and hooks) plus result shape and hydration:

- **[Decorator guide](decorators/intro.md)** — *the preferred pattern*. Declare entities, fields, and relations as TypeScript classes with `@Entity`, `@Field`, and `@Relation`; generate the metadata from them.
- **[Core API guide](core-api/intro.md)** — hand-author the serializable model objects directly for full control, no decorators required.

## Errors

Every boundary failure is a structured `SuperJoinError` with a stable `code` (`invalid-request`, `unknown-field`, ...) and an optional request-relative `path`. Catch it; no host exception types are required.

## Next steps

- Browse the TypeScript API reference in the sidebar for every exported symbol.
- Rust embedders: use `super-join-core` directly and read its rustdoc pages (`cargo doc`, served from `docs/super-join/rust-api/index.html`).
