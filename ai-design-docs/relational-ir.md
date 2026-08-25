# Relational IR

## Role

The relational IR converts requested meaning into database-relational operations. It decides how model relationships, projections, predicates, grouping, ordering, and pagination form a query plan before dialect-specific SQL syntax is selected.

```text
semantic request -> scan -> join -> filter -> project -> order/limit -> relational plan
```

Example:

```text
Project(User.id, User.name, Post.id, Post.title)
  Join(users.id = posts.author_id)
    Scan(users)
    Scan(posts)
```

## Responsibilities

This stage resolves relation traversal, join conditions, correlation, projection, predicate placement, and result-shape-supporting fields. It may perform safe logical optimization such as predicate pushdown when semantics are preserved.

### Suggested operators

Start with a small closed operator set: `Scan`, `Join`, `Filter`, `Project`, `Sort`, `LimitOffset`, and optionally `Correlate` when nested selections require it. Each operator should carry an output schema with stable field identities. The output schema is how a later renderer knows which selected SQL alias represents which logical field.

Choose join type from semantics, not convenience: a required relationship may use inner join, while an optional/nested relation commonly requires left join or a separately correlated query strategy. The selected strategy must preserve the requested null/list semantics and be captured in result-shape metadata.

## Planning rules

For v0, favor a correct and deterministic plan over sophisticated optimization. Define a stable alias allocation order and relation traversal order. Any optimization must preserve: returned rows, null behavior, parameter ordering, logical selected-field identities, and observable SQL artifact metadata.

## Boundaries

The relational IR must not depend on GraphQL. It should avoid dialect-specific surface syntax such as PostgreSQL placeholder numbers or identifier quotation. It may represent relational concepts that a later SQL IR maps differently for different dialects.

## Result shaping

Because nested frontend results often require flattened SQL rows to be reconstructed, the plan must preserve stable selected-field identities and relationship keys needed by `CompilerResult.result-shape`. It does not execute hydration itself unless that becomes a separately designed capability.
