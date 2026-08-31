# Expression model

## Purpose

The expression model is the serializable, database-independent language produced by frontend hooks and consumed by the compiler. It represents meaning, not SQL syntax.

```text
hook(args, context) -> Expression -> CompilerRequest -> Rust -> SQL
```

## Core nodes

The model should support a tagged union with at least:

- `literal`: a SQL-independent literal when appropriate.
- `parameter`: a runtime value that becomes an ordered SQL parameter.
- `column`: a column reference in the current entity/relation scope.
- `parent-column`: a correlated reference to a parent scope.
- Boolean composition: `and`, `or`, `not`.
- Comparisons: `eq`, `ne`, `lt`, `lte`, `gt`, `gte`.
- Null predicates: `is-null`, `is-not-null`.
- Membership and pattern operations as explicitly supported.
- Function call, `case`, and subquery nodes only once their semantics are fully specified.

Example:

```text
and(
  eq(column("tenant_id"), parameter(123)),
  eq(column("status"), parameter("ACTIVE"))
)
```

This could render as `WHERE "tenant_id" = $1 AND "status" = $2` for a PostgreSQL-like dialect, but parameter numbering and quoting are Rust responsibilities.

### Canonical node shape

Use a discriminated union/variant, never an implicit object convention. A useful initial shape is:

```text
Expression =
  Parameter { value, type? }
| Column { field_id }
| ParentColumn { depth, field_id }
| Compare { operator, left, right }
| Boolean { operator: and|or, terms[] }
| Not { term }
| NullTest { operator: is_null|is_not_null, term }
| In { term, values[] }
| Aggregate { function: count|sum|min|max|avg, term? }
```

`Column` references a resolved logical field ID rather than a text identifier when it crosses the compiler boundary. The frontend builder may accept friendly names only while it has enough metadata to resolve them. `ParentColumn` must use an explicit correlation depth and can only be used in a relation/subquery scope that defines a parent.

`Aggregate` renders as `COUNT(*)` (no term, count only), `SUM(x)`, `MIN(x)`, `MAX(x)`, or `AVG(x)`. Aggregates exist to build computed-field select expressions; they are meaningful inside a sub-select projection (see model.md's `SelectSubquery`).

### Select expressions (computed fields)

The builder exposes the parts of SQL a `SELECT` needs — and only those:

```ts
expr.select(fromEntityId, projection /* after SELECT */, { where })
```

The result is a `ComputedField` definition (`{ entity, projection, predicate }`) used in model metadata. Inside it, `column` resolves against `fromEntityId` and `parentColumn(1, ...)` correlates to the field's owning occurrence. This deliberately does not expose the full SQL dialect: no joins, group-by, unions, or raw text — only one projection expression, one model entity as FROM, and an optional predicate.

### Normalization rules

The frontend builder and Rust validator should agree on these rules:

- `and` and `or` remove absent optional terms; zero remaining terms are not emitted as SQL predicates.
- `and`/`or` flatten nested nodes of the same operator.
- Comparisons against `null` are invalid; callers must use null-test nodes.
- An empty `in` list has an explicitly defined semantic (recommended: a constant false predicate) rather than invalid SQL.
- Parameter values are ordered only during SQL rendering; expressions never contain `$1`, `?`, or similar placeholders.
- No expression variant permits raw SQL strings.

## Builder API

TypeScript should expose an ergonomic builder that only constructs model nodes:

```ts
expr.and(
  expr.eq(expr.column("tenant_id"), expr.value(context.tenantId)),
  args.status && expr.eq(expr.column("status"), expr.value(args.status)),
)
```

The builder may normalize absent optional terms. It must never execute SQL or interpolate user values into strings.

## Validation

The compiler validates scope, column existence, operand compatibility, parameter representability, and supported operations against the model/dialect. Invalid expression shapes return structured compiler errors.

## Extensibility

New variants are additive only when older consumers can reject them safely. Do not add raw SQL escape hatches to the portable expression model; any tightly controlled dialect extension requires its own explicit design.
