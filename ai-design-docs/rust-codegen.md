# Rust code generation

## Scope

This document describes how the Rust compiler implements compilation. It is not a public ABI document; external callers depend on `CompilerRequest` and the SQL artifact, not the internal stages below.

## Pipeline

```text
CompilerRequest
  -> validation
  -> semantic IR
  -> relational IR
  -> SQL IR
  -> dialect renderer
  -> SQL artifact
```

Each phase should have explicit input/output types and focused tests. Avoid a single pass that simultaneously interprets GraphQL-like semantics, chooses joins, and concatenates SQL strings.

## Renderer requirements

The renderer is responsible for:

- Correct identifier quoting for the selected dialect.
- Stable, collision-free aliases.
- Parameter collection and placeholder numbering/order.
- SQL syntax specific to dialect capabilities.
- Producing field/result-shape metadata consistent with the select list.

An SQL AST library (for example, a Rust SQL builder) MAY help construct/render SQL IR, but it must remain behind the Rust core abstraction. Do not allow a library's AST to become the cross-language request format.

## Optimization

Optimization passes are optional and must preserve semantic result shape and parameter meaning. Begin with correctness, deterministic output, and clear errors. Introduce join reordering, predicate pushdown, projection pruning, and dialect optimizations only with plan-level tests.

## Diagnostics

When possible, propagate source paths from request through IR nodes so code-generation errors can identify the frontend field, model node, or expression responsible. Never expose Rust panics as expected compile errors.

## Phase contracts

Each lowering phase must have a single public-to-the-crate function with a typed input/output and no side effects outside diagnostics/metrics:

```text
validate_request(request) -> ValidatedRequest
build_semantic(validated) -> SemanticQuery
lower_relational(semantic) -> RelationalPlan
lower_sql(plan, dialect) -> SqlStatement
render(statement, dialect) -> SqlArtifact
```

This separation is mandatory for testability. A coding agent should not bypass phases by rendering SQL directly from `CompilerRequest`, even for an initial feature, except in a temporary spike that is discarded before implementation work is accepted.
