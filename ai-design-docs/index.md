# Super-Join design documents

This directory defines the target architecture of Super-Join. It is written for implementers, including coding agents. These documents describe the intended system; they do not describe or constrain any pre-existing implementation.

## Architectural summary

Super-Join is a Rust SQL compiler. It accepts a serializable `CompilerRequest` and returns an SQL artifact. It does not connect to, pool, or execute against a database.

The stable cross-language boundary is a Wasm Component described by WIT. The Rust core is the canonical implementation and is usable without Wasm. TypeScript is the first consumer; its GraphQL integration is a frontend adapter, not compiler logic.

```text
GraphQL.js / another frontend
            |
            v
     serializable CompilerRequest
            |
            v
       WIT component boundary
            |
            v
        Rust compiler core
 semantic IR -> relational IR -> SQL IR
            |
            v
        SQL artifact (not execution)
            |
            v
 application-owned database driver
```

## Reading order

1. [architecture.md](architecture.md) — system purpose, boundaries, and dependency rules.
2. [component-model.md](component-model.md), [wit-interface.md](wit-interface.md), and [rust-core.md](rust-core.md) — public compiler contracts.
3. [frontend.md](frontend.md), [graphql-frontend.md](graphql-frontend.md), [frontend-hooks.md](frontend-hooks.md), and [expression-model.md](expression-model.md) — frontend responsibilities and dynamic metadata.
4. [model.md](model.md) — the database/model representation understood by the compiler.
5. [semantic-ir.md](semantic-ir.md), [relational-ir.md](relational-ir.md), [sql-ir.md](sql-ir.md), and [rust-codegen.md](rust-codegen.md) — internal compilation pipeline.
6. [generated-artifact.md](generated-artifact.md) and [execution.md](execution.md) — compiler output and the application-owned execution boundary.
7. [user-ts-api.md](user-ts-api.md), [typescript-build.md](typescript-build.md), and [typescript-testing.md](typescript-testing.md) — the TypeScript consumer API, npm/Vite/Wasm distribution, and Vitest test strategy.
8. [testing.md](testing.md) — cross-layer and Rust-first compiler verification.

## Normative vocabulary

The terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** state implementation requirements. Examples illustrate the design and are not yet a promise of exact syntax.

## Non-goals for the first implementation

- Database connectivity, transaction ownership, connection pooling, or SQL execution.
- Passing JavaScript functions, `GraphQLResolveInfo`, or arbitrary application context through WIT.
- A TypeScript query DSL that dictates compiler architecture.
- Cross-component callbacks from Rust into JavaScript during compilation.

## Recommended implementation sequence

Implementers MUST work from public contracts inward, not from SQL rendering outward. A completed phase should have executable tests before the next begins.

1. Define the Rust public types and the versioned WIT types from [wit-interface.md](wit-interface.md). Implement a no-op/minimal compiler that validates a request and returns a structured error for unimplemented features.
2. Implement the model and expression validators from [model.md](model.md) and [expression-model.md](expression-model.md), including source paths and parameter values.
3. Implement a deliberately small vertical slice: one root entity, scalar selection, one predicate, one SQL dialect, and a parameterized artifact.
4. Add semantic, relational, and SQL IR types and lower the vertical slice through all stages.
5. Add relations/nesting, aliases, ordering, pagination, and result-shape metadata one feature at a time.
6. Add the thin component wrapper and prove that native Rust and WIT results match.
7. Add the GraphQL frontend, expression builder, hooks, and end-to-end GraphQL tests.
8. Package the TypeScript API and visible Wasm Component artifact according to [typescript-build.md](typescript-build.md), then verify its Vitest and packed-package tests from [typescript-testing.md](typescript-testing.md).
9. Only after the contracts are stable, add more dialects, optimizations, optional hydration helpers, or future frontends.

## Definition of done for a feature

A feature is not complete merely because it renders an SQL example. It is complete when its request representation, validation/error behavior, semantic meaning, relational lowering, SQL rendering, SQL artifact metadata, WIT behavior (if public), and tests are all documented and implemented.
