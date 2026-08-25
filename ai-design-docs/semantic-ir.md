# Semantic IR

## Role

The semantic IR represents what data the caller requested, independently of relational execution strategy and SQL dialect. It is internal to the Rust compiler and must not be exposed as the public WIT contract.

Example meaning:

```text
fetch User
  id
  name
  posts
    id
    title
```

## Inputs and outputs

The compiler builds semantic IR from a validated `CompilerRequest`, generic model, and serializable expressions. It then lowers semantic intent to relational operations.

### Suggested node structure

```text
SemanticQuery
  entity: resolved entity
  scalar_selections: resolved fields with output keys
  relations: resolved relation -> SemanticQuery
  predicate: validated Expression
  order_by, limit, offset
  path and diagnostic metadata
```

At this stage every logical identifier must be resolved to a model definition, but no physical SQL alias needs to exist. A semantic query should be immutable after validation so lowering cannot accidentally modify requested meaning.

Semantic nodes should retain:

- Entity/field identity rather than rendered physical SQL names where possible.
- Nested requested result shape.
- Filters, ordering, limits, offsets, and expressions in generic form.
- Source paths for diagnostics.
- Alias and selection identity needed for eventual result metadata.

## Non-responsibilities

Semantic IR must not choose SQL quoting, placeholder syntax, concrete table aliases, join order, or renderer-specific AST nodes. Those belong to later stages.

## Invariants

- Every semantic field resolves to a model field or a defined computed concept.
- Every relation resolves to a model relation.
- Expressions are valid for their semantic scope.
- The IR remains frontend-neutral: no GraphQL AST or TypeScript values are retained.

## Initial scope

The first semantic implementation should support a single root entity, scalar fields, a conjunctive predicate, and direct relations. Aggregates, polymorphic entities, computed fields, subscriptions, mutations, and cross-root batching are explicitly deferred until each has request-level semantics.
