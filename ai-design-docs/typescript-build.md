# TypeScript package build and distribution

## Purpose

This document defines how Super-Join's TypeScript package is built and published. It applies only to the TypeScript/JavaScript consumer package and its packaged Wasm Component artifact. It does not define the Rust compiler, WIT contract, or runtime architecture.

Vite library mode is the selected JavaScript bundler. Vite is a distribution/build tool, not a runtime architectural dependency: the same Wasm Component must remain usable by non-TypeScript hosts.

## Package composition

The published npm package is two first-class artifacts shipped together:

```text
TypeScript/JavaScript frontend
            +
Wasm Component artifact
            =
       super-join npm package
```

The JavaScript layer supplies the generic convenience API, GraphQL adapter, expression builder, component loader, and generated TypeScript declarations. The Wasm artifact implements the WIT compiler API. JavaScript MUST NOT duplicate the Rust compiler or hide the component inside an opaque bundled implementation.

## Intended repository structure

This is the target layout for the TypeScript and Rust package boundaries; implementation work may introduce the directories incrementally.

```text
super-join/
  crates/
    super-join-core/
    super-join-component/
  wit/
    super-join.wit
  packages/
    typescript/
      src/
        index.ts          # generic public API: compile, expr, public types
        graphql.ts        # GraphQL-specific public API: graphqlToSQL
        expressions.ts    # serializable expression builder
        component.ts      # component loading and WIT binding adapter
      vite.config.ts
      tsconfig.json
      package.json
```

`src/graphql.ts` is a public subpath entry point. It interprets `GraphQLResolveInfo`, GraphQL extensions, dynamic frontend hooks, and application context locally, then produces a `CompilerRequest` for `component.ts`. It MUST NOT put GraphQL types or dependencies in the generic entry point.

## Public package entry points

The package MUST initially expose exactly these import paths:

```ts
import { compile, expr } from "super-join";
import { graphqlToSQL } from "super-join/graphql";
```

- `super-join` provides generic request/result types, expression construction, component initialization/loading, and generic `compile(request)`.
- `super-join/graphql` provides only GraphQL-facing types and `graphqlToSQL`.

`graphql` MUST be a peer dependency and MUST be externalized from the bundle. It is not a dependency of the generic compiler API. Other large runtime dependencies must likewise be deliberately classified as bundled, peer, or optional dependencies; do not rely on Vite defaults to make this decision.

## Vite responsibility

Vite library mode builds TypeScript source to distributable JavaScript and supports multiple library entry points. Configure it with named entries for `index.ts` and `graphql.ts`, an explicit output directory, and externalization for peer dependencies. Vite's official documentation describes `build.lib` and multiple-entry library builds. [Vite library-mode documentation](https://vite.dev/guide/build#library-mode)

Vite is responsible for:

- TypeScript/JavaScript bundling for package entry points.
- Resolving TypeScript-side dependencies.
- Emitting ESM package JavaScript; CommonJS output is optional and must be a deliberate compatibility decision.
- Development watch/build workflow for the TypeScript source.

Vite is not responsible for:

- Building Rust crates.
- Generating WIT bindings.
- Constructing or validating the Wasm Component.
- Generating `.d.ts` declarations.
- Defining compiler semantics or executing SQL.

The Rust/Wasm producer is a WIT-aware Component Model toolchain, initially expected to use `cargo-component`/`wit-bindgen` or an equivalent supported `wasm32-wasip2` workflow. It produces a Wasm Component artifact from the versioned WIT world. `wasm-pack` MUST NOT be used for this package: its `wasm-bindgen`-oriented raw-Wasm-plus-JavaScript-glue model is not Super-Join's WIT Component boundary.

## Build inputs and outputs

The complete package build has two independent producers followed by one packaging step:

```text
Rust/WIT toolchain                  TypeScript toolchain
        |                                    |
Wasm Component (.wasm)              Vite library build (JS)
        |                                    |
        +------------- staging --------------+
                          |
             declaration generation (.d.ts)
                          |
                          v
                  publishable dist/
```

The Rust/WIT producer must complete before packaging, but it does not need to be invoked by Vite itself. A top-level orchestrator script is responsible for ordering these steps and failing the build if any required artifact is absent.

The TypeScript loader must consume the output as a Component Model artifact through the selected host/runtime binding layer. It must not expect the `wasm-bindgen` initialization module that `wasm-pack` would generate.

The staged publish directory MUST contain the component as a visible package file:

```text
dist/
  index.js
  index.d.ts
  graphql.js
  graphql.d.ts
  wasm/
    super_join.wasm
```

Actual filenames may include `.mjs`/`.cjs` according to the selected output formats. The package manifest must match the emitted names exactly.

## Wasm asset policy

The component is a package asset, not an accidental Vite asset import. The packaging step copies the known component output to `dist/wasm/super_join.wasm` (or a documented versioned replacement path). The TypeScript loader resolves this asset through a stable package-relative mechanism.

The first implementation SHOULD support an explicit initialization/load API in addition to lazy loading. This gives server, browser, worker, bundler, and test hosts a clear way to select the correct loading strategy. The loader must report a structured initialization error when the component artifact or host capability is unavailable.

Do not assume that every JavaScript runtime can instantiate every Wasm Component directly. The loader/binding implementation must document its supported hosts and any required component-runtime dependency. This is a packaging/runtime compatibility question, not a reason to change the WIT contract.

## Declaration generation

Vite's JavaScript build does not itself define the package declaration strategy. Run the TypeScript compiler in declaration-only mode or use an explicitly chosen declaration-generation tool after TypeScript source type-checking. The declaration step must emit declarations for both public entry points and all types referenced from their signatures.

Generated WIT binding types may be internal implementation details, but public generic request, result, error, expression-builder, and GraphQL API types must be exported intentionally. A package build MUST fail if a public export has no declaration output.

## Package manifest and exports

Use `package.json` `exports` to make public paths explicit. The following is a conceptual ESM-first shape; emitted extension names and optional `require` conditions must match the actual Vite output.

```json
{
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./graphql": {
      "types": "./dist/graphql.d.ts",
      "import": "./dist/graphql.js"
    },
    "./wasm/super_join.wasm": "./dist/wasm/super_join.wasm"
  }
}
```

Do not expose internal files such as `component.ts`, generated binding modules, or arbitrary `dist/*` paths. Adding an exported subpath is a public API/versioning decision.

## Suggested Vite configuration requirements

The eventual `vite.config.ts` must:

- Use `build.lib.entry` with named `index` and `graphql` entries.
- Use explicit output filenames that match package exports.
- Externalize `graphql` and any other peer dependencies.
- Produce the selected ESM output; add CommonJS only if supported/tested.
- Avoid bundling the Wasm Component into JavaScript.
- Keep source maps and minification decisions explicit for published libraries.

Vite's documented multi-entry library output normally supports ES and CommonJS formats; configure `build.lib.formats` explicitly instead of relying on a changing default. [Vite library-mode documentation](https://vite.dev/guide/build#library-mode)

## Build script contract

The top-level package build should conceptually perform:

1. Check and type-check TypeScript source.
2. Build the Rust component from the versioned WIT interface.
3. Build the Vite library entries.
4. Generate declaration files.
5. Copy the component into the exact `dist/wasm` package path.
6. Validate `package.json` exports against real files.
7. Run package-level smoke tests against the packed/staged package.

Steps may be optimized or combined by tooling, but none may be skipped. Cleaning output must occur only in the scoped package `dist` directory and must never remove Rust build outputs unless the Rust build explicitly owns those outputs.

## Required package tests

Before publishing, tests must verify:

- `import "super-join"` exposes generic APIs without requiring `graphql` at runtime.
- `import "super-join/graphql"` resolves and loads the GraphQL adapter with `graphql` supplied by the consumer.
- Declarations resolve for both entry points.
- The packaged `.wasm` file is included in an npm pack/tarball.
- The component loader uses the packaged artifact rather than a source-tree path.
- A generic compile call and a GraphQL `graphqlToSQL` call reach the same WIT/component contract for equivalent input.
- Unsupported hosts or missing component assets fail with a useful initialization error.

## Non-goals and deferred work

- Vite is not a required dependency for Rust, Python, Go, or other Wasm hosts.
- A browser-specific loading strategy is not automatically a Node/server strategy; support must be documented and tested per host.
- Bundling/minifying the component into JavaScript is not part of the initial package design.
- A TypeScript query DSL remains a future frontend and must not influence this package's generic WIT contract.
