# super-join execution plan

## Goal
Fix the recursive types in `wit/wit.wit` so the project can compile to a wasm component (it previously failed due to those recursive types).

## Key findings

### Problem
`wit/wit.wit` contained recursive types that wit-bindgen cannot handle:
1. `variant expression` (line 156) - self-referential through compare, boolean-expr, is-null-expr, and in-list-expr
2. `query-node` ↔ `selection` ↔ `relation-selection` referencing each other

### Solution
Replace those recursive types with a flattened DAG (directed acyclic graph) representation:
- **Expressions**: flattened into an `expr-node` list where the last node is the root and every operand references another node by its index in the list
- **Queries**: flattened into a `query` + `query-node`/`selection-node` graph referenced by index

### Files involved
- `wit/wit.wit` - WIT interface definition (rewritten)
- `src/wit.rs` - WIT ↔ core type conversion layer (rewritten)
- `src/semantic/mod.rs` - core type definitions (QueryNode, Selection, etc.; no changes needed)
- `src/expression.rs` - core Expression type (no changes needed)

## Completed
- [x] Rewrite `wit/wit.wit`, removing the recursive types
- [x] Rewrite the conversion logic in `src/wit.rs`

## To verify
- [x] Compile the wasm component (`cargo component build --target wasm32-wasip1` passes)
- [x] Run the tests (all 22 Rust and 42 TypeScript tests pass)
- [x] Verify the N+1 problem solution (nested relations compile to LEFT OUTER JOIN; see `compiles_one_level_relation_as_left_join` in `tests/compiler.rs` and the component integration test in `tests/component.test.ts`)

## Next steps
Main fixes completed so far:
- The renderer now resolves physical column references (`"users"."id" AS "id"`) and emits per-dialect placeholders (postgres `$n`, mysql/sqlite `?`, mssql `@pN`), with no phantom LIMIT/OFFSET parameters.
- Predicates of nested relations are folded into the JOIN ON clause; nested pagination/ordering now raises an explicit `unsupported-feature` error instead of being silently dropped.
- Semantic validation checks column scope by entity ownership; comparisons against null are rejected; empty IN lists compile to a constant false.
- The WIT boundary no longer panics: malformed input returns structured errors, and the `other` dialect returns `unsupported-dialect`.
- The GraphQL frontend supports fragment/inline-fragment expansion, `@skip`/`@include`, and `where`/`orderBy` hooks, and rejects the `last` argument.

Remaining gaps (see the ai-design-docs comparison conclusions): the model lacks primary-key/identity field metadata, so parent/child identity fields for nested result-shape are not yet recorded; the Vite library build with a visible `dist/wasm/super_join.wasm` asset, the crate split (core/component), and packed-package tests are still outstanding.
