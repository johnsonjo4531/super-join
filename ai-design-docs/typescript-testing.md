# TypeScript testing with Vitest

## Purpose

This document defines the test strategy for Super-Join's TypeScript package. It complements, but does not replace, native Rust compiler tests. TypeScript tests verify the frontend adapter, expression builder, component loader, public API, and published package behavior.

Vitest is the selected TypeScript test runner because it is Vite-powered and can read the existing Vite configuration, while still permitting a dedicated test configuration. [Vitest guide](https://vitest.dev/guide/)

## Scope and boundaries

| Test layer | Owns | Does not prove |
| --- | --- | --- |
| Expression-builder unit tests | Serializable expression objects and normalization | Rust SQL rendering |
| Hook tests | Context/argument use and hook return values | WIT/component bindings |
| GraphQL frontend tests | `GraphQLResolveInfo` to `CompilerRequest` translation | Rust planning/rendering correctness |
| Component-adapter tests | Request/result conversion and errors at the loader boundary | Every Rust compiler feature |
| Package smoke tests | Published exports, declarations, and Wasm asset resolution | Database execution |

Database execution is explicitly outside this suite. Rust tests remain the primary place to prove generic compiler behavior, SQL dialect output, parameter numbering, and relational planning.

## Test layout

Place tests beside the TypeScript package source or in a dedicated package-local test directory. The target structure is:

```text
packages/typescript/
  src/
    expressions.test.ts
    component.test.ts
    graphql.test.ts
    __fixtures__/
      schema.ts
      compiler-requests.ts
      component-stub.ts
  test/
    package-smoke.test.ts
    type-exports.test-d.ts
  vitest.config.ts
```

Use `.test.ts` for executable Vitest tests. Keep small fixtures local and deterministic; do not import source-tree output paths in package tests.

## Vitest configuration

Vitest may read `vite.config.ts`, but Super-Join should use a dedicated `vitest.config.ts` when test-only settings are needed. It must explicitly set the test environment, include patterns, setup files, coverage policy, and path aliases if the package needs them. Vitest recognizes `.test.` and `.spec.` test names by default and supports a one-shot CI command through `vitest run`. [Vitest guide](https://vitest.dev/guide/)

The default environment SHOULD be `node`. The package is a library, not a browser UI. Add a separate browser/worker project only when the component loader claims support for that host. A Node test must not pretend to validate browser Wasm/component loading.

Conceptual configuration:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__fixtures__/**"],
    },
  },
});
```

This is illustrative. An implementation must choose and pin a supported coverage provider and required Node/Vite/Vitest versions. Current Vitest documentation states that Vitest requires Node 20+ and Vite 6+; the package's supported-engine policy must be checked when dependencies are selected. [Vitest installation requirements](https://vitest.dev/guide/)

## Test commands

The package manifest should provide distinct commands:

```text
test          interactive local Vitest mode
test:run      single-run CI mode: vitest run
test:coverage single-run coverage report
test:types    TypeScript declaration/type-level validation
test:package  tests that run against a staged or packed package
```

`test:run` must be the command used by CI. It must not depend on watch mode, a developer's global tool installation, or a prior build unless the script performs that build deterministically.

## Unit tests: expression builder

The expression builder must be tested as a pure TypeScript API. Tests should assert exact serializable expression values, not rendered SQL.

Required cases:

- `column`, `parentColumn`, `value`/parameter, comparisons, null tests, `and`, `or`, and `not` create the documented tagged variants.
- Optional/undefined terms are omitted according to expression-model normalization rules.
- Nested `and`/`or` nodes flatten deterministically.
- Comparison with a null value rejects with a clear frontend error or forces the caller to use a null test.
- Empty `in` list behavior matches the expression-model document.
- A builder cannot construct a raw SQL fragment or a dialect placeholder.
- Output contains ordinary serializable values only; functions and native GraphQL objects cannot appear in the result.

## Unit tests: frontend hooks

Test hooks directly with fixture arguments, fixture context, and the real expression builder:

```ts
const output = metadata.where?.({
  args: { status: "ACTIVE" },
  context: { tenantId: 123 },
  info: fakeResolveInfo,
  field: fixtureField,
  parent: fixtureParent,
  expr,
});

expect(output).toEqual(/* serializable Expression */);
```

Tests must prove that context-derived values become expression parameters, not interpolated SQL strings. Test hook errors separately from compiler errors: a thrown hook error is a frontend error and should preserve the GraphQL metadata/path where available.

## GraphQL frontend tests

Construct actual GraphQL schemas with the `graphql` package and execute/obtain resolver information through a controlled resolver. Do not hand-author a partial `GraphQLResolveInfo` for normal translation tests; it is too easy to omit behavior that real GraphQL.js provides.

Inject a fake compiler/component adapter that records the generated `CompilerRequest` and returns a fixture artifact. The test target is the request passed to that adapter, not the SQL text.

Required cases:

- Root field maps to the declared model entity.
- Scalar and nested relation selections map to generic `QueryNode` selections.
- Response aliases become output keys without changing model field identity.
- Named and inline fragments are expanded correctly.
- Variables resolve to plain serializable argument values.
- `@skip` and `@include` affect the selected request shape.
- Context and arguments are available to hooks only before component invocation.
- Missing metadata, unknown model mapping, unsupported union/interface behavior, and hook failure yield structured frontend errors.

## Component-adapter and loader tests

The TypeScript adapter needs two kinds of tests.

First, inject a test double that implements the minimal component-facing `compile(request)` interface. Verify that the adapter converts input/output/error shapes correctly and does not expose generated binding details as public API.

Second, run a small integration suite against the real built component in every officially supported host. It must prove that the packaged Wasm artifact can be loaded and that a known request produces the expected fixture artifact. Keep this suite small: core compiler scenarios belong in Rust tests.

Avoid mocks that recreate the compiler. A fake component should record requests and return fixed artifacts/errors only. Otherwise the TypeScript test suite becomes an untrusted duplicate implementation of Rust logic.

## Package and distribution tests

Run these tests after the full package build, against a staged directory or `npm pack` tarball:

- Import the root entry point and GraphQL subpath using their public package names.
- Confirm the root import does not load or require GraphQL.
- Confirm declaration files resolve for both entry points.
- Confirm the `.wasm` component is in the package contents at the documented path.
- Confirm the loader finds the packaged asset rather than a repository-relative source file.
- Confirm unpublished internal paths cannot be imported through package exports.

The test harness should create a temporary consumer package/directory. It must not resolve the package by a source alias, because that would bypass the exact export and asset layout users receive.

## Type-level API tests

Runtime tests do not prove declarations are useful. Add type-level tests that compile example consumer code for:

- `compile(request)` request/result/error types.
- Expression builder return types.
- `graphqlToSQL({ resolveInfo, context })` input and artifact result types.
- GraphQL as a peer dependency only for the GraphQL subpath.
- Rejection of invalid public API usage that should fail at compile time.

Use `tsc --noEmit` or a deliberately selected type-test tool. Do not rely on `@ts-expect-error` alone without enforcing that the fixture is compiled in CI.

## Mocking rules

- Prefer real pure functions and real GraphQL.js schema fixtures over mocks.
- Mock only host boundaries: component instantiation, file/asset resolution, and unavoidable environment capabilities.
- Reset/restore mocks after every test. Never let component-loader global state leak between tests.
- Freeze or clone fixture requests when a test needs to detect mutation.
- Do not mock `graphqlToSQL` when testing GraphQL translation; inject the lower component adapter instead.

## Coverage and quality gates

Coverage is a signal, not proof. Require coverage for `expressions.ts`, `graphql.ts`, and `component.ts`, but prioritize the required behavior matrix over an arbitrary global percentage. Exclude generated bindings and fixture-only code from package coverage. Any new public branch (host selection, export path, hook error, serialization guard) must include direct tests.

## Definition of done

The TypeScript end is ready for a feature when:

1. Pure expression/hook behavior has deterministic Vitest tests.
2. GraphQL translation tests inspect the resulting generic request.
3. Native Rust/component behavior is tested separately; TypeScript does not duplicate compiler SQL tests.
4. A real component smoke test passes in every documented TypeScript host.
5. Packed-package tests validate exports, declarations, and the Wasm asset.
6. `test:run`, `test:types`, and `test:package` are run in CI.

