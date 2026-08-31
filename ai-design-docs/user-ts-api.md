# TypeScript user API

## Goal

The initial TypeScript experience is an ergonomic GraphQL convenience API layered over the GraphQL frontend and Wasm Component. It must not expose internal compiler IRs as normal user concerns.

## Primary API

The main API users should call is `superjoin` (and its GraphQL-shaped front, `superjoin.graphql`). It encompasses compile and hydrate: the user provides a callback that they call their db driver with, and receives hydrated entities back.

```ts
import { superjoin } from "super-join";

const users = await superjoin(request, async (artifact) => {
  const rows = await db.query(artifact.sql, artifact.parameters);
  return rows;
});
```

For GraphQL servers:

```ts
import { superjoin } from "super-join";

const users = await superjoin.graphql({ resolveInfo, context, model, execute });
```

Conceptually:

```text
superjoin() / superjoin.graphql()
  -> GraphQL frontend (graphql variant only)
  -> evaluated frontend hooks
  -> CompilerRequest
  -> WIT component
  -> Rust compiler
  -> SQL artifact
  -> application's driver callback (the user's own code)
  -> hydrate (regroup flattened rows into nested entities)
```

`superjoin` never executes SQL: the callback owns the driver call. The lower-level pieces it composes (`compile`, `graphqlToSQL`, `hydrate`) remain exported individually for hosts that need to drive the steps separately.

## GraphQL adapter

```ts
import { graphqlToSQL } from "super-join/graphql";

const request = await graphqlToSQL({
  resolveInfo,
  context,
  model,
});
```

`graphqlToSQL` translates a GraphQL.js `ResolveInfo` plus metadata into the request; it does not compile or execute. It returns nothing but the request: SQL, parameters, and metadata arrive from `compile`, and entity regrouping arrives from `hydrate`.

## Generic API

The lower-level convenience API exposes the WIT contract directly:

```ts
import { compile } from "super-join";

const { artifact } = await compile(request);
```

`compile` is generic and does not accept `GraphQLResolveInfo` or GraphQL context. `graphqlToSQL` is the GraphQL-specific adapter. `hydrate(rows, artifact)` regroups an artifact's flattened rows into nested entities at any nesting depth; it is driven entirely by the artifact's result-shape metadata.

## Expression API

Users configuring metadata may import an expression builder:

```ts
import { expr } from "super-join";

where: ({ context }) =>
  expr.eq(expr.column("tenant_id"), expr.value(context.tenantId));
```

The builder creates serializable expression nodes. It must not offer SQL string construction as its normal path.

## Initialization and errors

The package should hide component loading/instantiation behind a documented initialization strategy while allowing advanced hosts to provide a component instance if needed. API errors must distinguish frontend translation failures from compiler errors and retain structured codes where possible.

### Proposed error boundary

```ts
type SuperJoinError =
  | { kind: "frontend"; code: string; message: string; path?: string }
  | { kind: "compiler"; code: string; message: string; path?: string };
```

The TypeScript package may throw these errors for ergonomic JavaScript use, but it must preserve the underlying component error code and path. It must not turn a structured compiler failure into an opaque Wasm exception.

## First API acceptance criteria

- `superjoin` compiles a request, hands the artifact to the user's driver callback, and returns hydrated entities; `superjoin.graphql` does the same starting from a GraphQL resolver's `resolveInfo`.
- `graphqlToSQL` accepts a normal GraphQL resolver's `resolveInfo`, the GraphQL server's context, and the Super-Join `GraphQLModel`.
- It evaluates metadata hooks locally and sends no function/context object through WIT.
- It returns SQL plus ordered parameters and result metadata.
- A consumer can execute the artifact with its own driver without importing an execution module from Super-Join.
- A malformed metadata mapping, hook failure, and compiler validation error are distinguishable.

## Explicit non-goal

A general TypeScript fluent query DSL is deferred. If introduced later, it is a separate frontend and must target the same generic `CompilerRequest` contract.
