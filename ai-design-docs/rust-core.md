# Rust core

## Role

The Rust core is the canonical Super-Join implementation. It contains compiler contracts, validation, IR transformations, SQL generation, and native tests. It must compile without Wasm, JavaScript, GraphQL, or a database driver.

## Public API target

```rust
pub struct Compiler;

impl Compiler {
    pub fn new(config: CompilerConfig) -> Self;

    pub fn compile(
        &self,
        request: CompilerRequest,
    ) -> Result<CompilerResult, CompilerError>;
}
```

A convenience `compile(request)` function MAY construct a default compiler. `CompilerRequest`, `CompilerResult`, and `CompilerError` must be semantically equivalent to their WIT counterparts.

## Crate boundaries

Prefer the following dependency structure:

```text
super-join-core        public contracts + compiler + IRs + renderer
super-join-component   WIT bindings; depends on core
super-join-graphql-ts  TypeScript frontend package; consumes component
```

The core must not depend on the component or any frontend package.

## Lifecycle and configuration

`Compiler` configuration is immutable after construction and includes supported dialect configuration and stable compilation options. Per-request behavior belongs in `CompilerRequest.options`. Compilation must avoid global mutable state so it can be tested safely and used concurrently where Rust types permit.

## Error handling

Use `Result`, never panic for malformed caller input. Errors should preserve their classification and relevant path/source information through all lowering stages. Component bindings map these errors to the WIT error type; they do not reinterpret them.

## Acceptance criteria

- A Rust test can construct a complete `CompilerRequest`, call `Compiler::compile`, and assert the artifact without Wasm.
- The component produces the same result as a direct core call for equivalent input.
- No public core module imports GraphQL or database-driver types.

## Suggested module layout

```text
core/
  contract/       CompilerRequest, CompilerResult, errors, values
  model/          model validation and identifiers
  expression/     expression types and validation
  semantic/       semantic IR and construction
  relational/     relational IR and lowering
  sql/            SQL IR, dialects, renderer
  compiler/       orchestration only
```

This is a suggested responsibility split, not a required file tree. The key rule is that contract and compiler logic remain independently testable, and the component crate remains an adapter.

## Implementation discipline

Do not expose an internal IR as a public escape hatch merely to speed up early implementation. If a capability needs a public input, design it in `CompilerRequest` and WIT first. Keep `unsafe` out of the core unless a separately documented performance requirement makes it unavoidable.
