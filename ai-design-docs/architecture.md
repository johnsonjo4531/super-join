# Architecture

## Purpose

Super-Join compiles a frontend-neutral request into an SQL artifact. It is intended to make a nested data request, initially from GraphQL, available as parameterized SQL without making SQL execution part of the library.

> WIT defines the boundary, Rust defines the implementation, and TypeScript defines the first consumer experience.

## Ownership boundaries

| Layer | Owns | Must not own |
| --- | --- | --- |
| Frontend | Native input interpretation and creation of a serializable request | SQL rendering or database execution |
| Rust compiler | Validation, IR lowering, planning, SQL generation | GraphQL runtime objects, JavaScript callbacks, database connections |
| Wasm component | Stable ABI adaptation to the Rust compiler | Material compiler logic |
| Application/runtime host | Component instantiation and execution of returned SQL | Compiler internals |

```text
Frontend -> CompilerRequest -> Rust compiler -> SQL Artifact -> application's driver -> database
```

Super-Join MUST NOT own a driver, a pool, a connection, query execution, or transaction handling. An application is free to use any driver or ORM as the SQL artifact consumer.

## Primary public contracts

The architecture centers on four contracts:

1. `CompilerRequest`: serializable frontend input, model metadata, options, parameters, and evaluated expressions.
2. `CompilerResult`: an SQL artifact containing SQL text, ordered parameters, and output metadata.
3. WIT `compile`: the stable component operation that carries those contracts across language boundaries.
4. Frontend translation: a frontend converts its native representation into the request; it does not leak native runtime objects below this boundary.

Internal IRs are implementation details. They MAY evolve without breaking the public request/result model.

## TypeScript distribution and verification

The TypeScript package is the first consumer of the WIT component contract, but it is not a compiler layer. Its Vite library build produces the public JavaScript entry points and ships the Wasm Component as a visible package artifact; see [typescript-build.md](typescript-build.md). This packaging choice does not constrain native Rust or future non-TypeScript hosts.

TypeScript tests verify frontend translation, expression/hooks, component loading, public package exports, and the packaged Wasm asset. They do not replace Rust-core compilation tests or database execution tests; see [typescript-testing.md](typescript-testing.md) and [testing.md](testing.md).

## Dependency direction

```text
TypeScript API
     |
GraphQL frontend --------------------+
     |                                |
     v                                |
WIT contract                          |
     |                                |
Wasm component -> Rust core           |
                      |               |
                      v               |
 semantic IR -> relational IR -> SQL IR
                      |
                      v
                 SQL generation
```

Dependencies flow downward. In particular, GraphQL MUST NOT appear in the Rust core or any IR below the frontend boundary. The component depends on the Rust core, never the reverse.

Vite and Vitest are build/test tooling adjacent to the TypeScript API. They MUST NOT be dependencies of the compiler core, WIT interface, or Wasm Component.

Likewise, `wasm-pack` and its `wasm-bindgen`-oriented JavaScript packaging workflow are not part of this architecture. Super-Join's cross-language ABI is WIT and the Wasm Component Model, not a raw Wasm module plus generated JavaScript glue. The component build must use WIT/component tooling such as `cargo-component`/`wit-bindgen` or an equivalent supported `wasm32-wasip2` Rust workflow.

## Core invariants

- Rust compilation is deterministic from `CompilerRequest` plus explicit compiler configuration.
- Every component operation is representable as a direct Rust-core operation.
- SQL generation is parameterized; frontend values must become parameters rather than interpolated SQL text.
- A frontend hook executes in its own runtime and sends only its serializable result to Rust.
- Compiler errors are structured and must cross the component boundary without host-language exceptions being required for normal failures.

## Security and correctness rules

Super-Join is a compiler, so its most important security property is preserving the distinction between identifiers and values. Values always become typed parameters. Identifiers only come from validated model metadata and compiler-generated aliases. Raw strings supplied by application context, GraphQL arguments, or hooks must never enter an SQL syntax position.

Compilation must also be deterministic: equivalent normalized requests and configuration produce equivalent artifacts, including parameter order and selected-field metadata. This makes artifacts testable and avoids surprising cache behavior for hosts.

## Deferred decisions

The architecture deliberately does not yet commit to hydration, multi-query planning, SQL JSON aggregation, mutations, subscription support, authorization policy language, or an ORM adapter API. A proposal for any of these must first state how it changes `CompilerRequest`, `CompilerResult`, WIT compatibility, execution ownership, and the IR pipeline.

## Design decisions before IR work

Before adding significant IR implementation, settle the request shape, artifact shape, WIT interface, and GraphQL-to-request translation. IR design then serves those contracts rather than becoming the public architecture.
