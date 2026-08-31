# TypeScript user API

## Goal

The initial TypeScript experience is an ergonomic GraphQL convenience API layered over the GraphQL frontend and Wasm Component. It must not expose internal compiler IRs as normal user concerns.

## Primary API

```ts
import { graphqlToSQL } from "super-join/graphql";

const artifact = await graphqlToSQL({
  resolveInfo,
  context,
  model,
});
```

Conceptually:

```text
graphqlToSQL()
  -> GraphQL frontend
  -> evaluated frontend hooks
  -> CompilerRequest
  -> WIT component
  -> Rust compiler
  -> SQL artifact
```

The API returns an artifact with SQL, parameters, and metadata. It does not execute the SQL.

## Generic API

A future lower-level convenience API may expose the WIT contract directly:

```ts
import { compile } from "super-join";

const artifact = await compile(request);
```

`compile` is generic and does not accept `GraphQLResolveInfo` or GraphQL context. `graphqlToSQL` is the GraphQL-specific adapter.

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

- `graphqlToSQL` accepts a normal GraphQL resolver's `resolveInfo`, the GraphQL server's context, and the Super-Join `GraphQLModel`.
- It evaluates metadata hooks locally and sends no function/context object through WIT.
- It returns SQL plus ordered parameters and result metadata.
- A consumer can execute the artifact with its own driver without importing an execution module from Super-Join.
- A malformed metadata mapping, hook failure, and compiler validation error are distinguishable.

## Explicit non-goal

A general TypeScript fluent query DSL is deferred. If introduced later, it is a separate frontend and must target the same generic `CompilerRequest` contract.
