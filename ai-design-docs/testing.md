# Testing strategy

## Principle

The Rust compiler must be easy to test before Wasm or TypeScript integration. Most behavioral coverage belongs in native Rust tests against `CompilerRequest` and `CompilerResult`.

## Test layers

```text
1. Rust unit/plan tests
   CompilerRequest -> CompilerResult

2. Component contract tests
   WIT request -> component -> WIT result

3. TypeScript frontend tests
   GraphQL resolve info + metadata/hooks -> CompilerRequest

4. End-to-end integration tests
   GraphQL -> hooks -> WIT -> Rust -> SQL artifact
```

## Rust tests

Test validation, semantic lowering, relational planning, SQL IR construction, dialect rendering, parameter order, aliases, errors, and result-shape metadata. Use direct core calls:

```rust
#[test]
fn compiles_a_nested_query() {
    let result = Compiler::new(config).compile(request).unwrap();
    assert_eq!(result.artifact.sql, expected_sql);
}
```

Snapshot tests are suitable for stable SQL and plan output; pair them with structural assertions so snapshots do not hide semantic regressions.

## Frontend-hook tests

Test hooks as normal TypeScript functions with controlled `args`, `context`, and `expr`. Assert their serializable expression output. Hooks must be testable without Wasm and without a real database.

## Component tests

Keep the component suite comparatively small. It verifies bindings, type conversion, errors, ownership, and equality with direct Rust-core results; it does not duplicate all compiler behavior.

## End-to-end tests

Use representative GraphQL scenarios: aliases, fragments, variables, directives, nested relations, context-based authorization predicates, null behavior, and parameterization. Assertions should confirm that no raw user/context value is interpolated into SQL text.

## Required initial test matrix

Before declaring the first vertical slice complete, add tests for: unknown entity/field/relation; invalid column scope; an equality predicate with a parameter; `null` rejection for equality and correct null-test output; deterministic parameter ordering; quoted identifier rendering; aliases; a one-level relation; no-Wasm Rust compilation; WIT/native result equivalence; a GraphQL variable; and a context-derived hook parameter.

Every bug fix should add a test at the lowest layer that can reproduce it. Do not use a database integration test to validate compiler behavior that can be asserted as an artifact.
