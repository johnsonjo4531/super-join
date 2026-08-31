---
title: Filtering, pagination, and hooks
group: Core API guide
order: 8
---

# Filtering, pagination, and hooks

The GraphQL frontend turns arguments into SQL predicates without ever putting values in SQL text. Which arguments a field recognizes is configured per field through `GraphQLModel.fields`; everything else stays out of the SQL but remains visible to hooks. This page covers argument recognition, both pagination styles, the hook API, and the error codes you'll handle.

## Field-level argument options

`GraphQLModel.fields` maps GraphQL field names (root or nested) to `FieldOptions`:

```ts
import type { GraphQLModel } from "super-join/graphql";

const model: GraphQLModel = {
  ...superJoinModel,
  fields: {
    users: { pagination: "offset" },              // limit/offset arguments
    posts: { pagination: "cursor", orderBy: true } // Relay connection arguments
  },
};
```

| Option | Default | Meaning |
| --- | --- | --- |
| `pagination` | `"offset"` | `"offset"` recognizes `limit`/`offset`; `"cursor"` recognizes the Relay arguments `first`/`last`/`after`/`before` |
| `orderBy` | `true` | recognize the `orderBy` argument (a list of field names, ascending) |
| `filterArgs` | none | `true` maps every non-reserved argument by its own name to an equality predicate; an object maps specific argument names to model field names |

Arguments that are not recognized are ignored for SQL purposes — they never become predicates and never cause errors. They are still handed to hooks in `env.args`, so a field can accept schema arguments that only your hooks interpret.

## Filter arguments

With `filterArgs` enabled, a recognized argument becomes an equality predicate, combined with `AND` when several are present. Given:

```graphql
query { user(id: 7) { id } }
```

and `fields: { user: { filterArgs: true } }`, the compiler emits:

```sql
SELECT "user"."id" AS "id" FROM "users" AS "user" WHERE ("user"."id" = $1)
```

with parameters `[{ value: { tag: "integer", val: 7n }, dataType: "int64" }]`. The value crossed the boundary as a typed parameter, never as SQL text. Without `filterArgs`, the same query compiles with no `WHERE` clause and `id: 7` is only visible to hooks.

## Offset pagination

The default style recognizes exactly two arguments:

| Argument | Meaning |
| --- | --- |
| `limit` | `LIMIT n` |
| `offset` | `OFFSET n` |

Negative or non-integer values are rejected with `invalid-request`. `first`/`last`/`after`/`before` are not recognized in this mode (configure the field with `pagination: "cursor"` for those). Nested relations cannot be paginated at all (the flat join strategy would change their meaning) — that is an `unsupported-feature` error. Paginate the root query instead.

```graphql
query { users(orderBy: ["id"], limit: 5, offset: 10) { id } }
```

```sql
SELECT "users"."id" AS "id" FROM "users" AS "users" ORDER BY "users"."id" ASC LIMIT 5 OFFSET 10
```

## Cursor pagination (Relay-compatible)

A field with `pagination: "cursor"` accepts the GraphQL Relay connection arguments `first`, `last`, `after`, and `before`. Cursors are opaque strings produced by `encodeCursor` and decoded by the frontend; they carry the ordering column values of one row.

```ts
import { encodeCursor } from "super-join/graphql";

// A cursor for the last row your driver returned, aligned with the ordering.
const nextCursor = encodeCursor([row.id]);
```

| Argument | Meaning |
| --- | --- |
| `first: n` | forward pass; compiles to `LIMIT n + 1` so you can detect `hasNextPage` and trim |
| `last: n` | backward pass; flips every ordering direction, compiles to `LIMIT n + 1`, reverse the rows in your driver |
| `after: cursor` | keep rows strictly after the cursor in the current ordering |
| `before: cursor` | used with `last`; keeps rows before the cursor (the flip above makes it a forward scan) |

The cursor becomes a strict lexicographic comparison over the ordering columns, e.g. for `ORDER BY name ASC, id DESC`:

```sql
WHERE ("users"."name" > $1) OR (("users"."name" = $1) AND ("users"."id" < $2))
```

Rules enforced with `invalid-request`: `first` and `last` together, `after` and `before` together, a cursor without `first`/`last`, and a cursor when the field has no ordering (add an `orderBy` argument or an `orderBy` hook). Your driver computes `pageInfo` from the probe row: if it returned `pageSize + 1` rows there is another page.

## Ordering arguments

`orderBy` accepts a list of field names; each becomes an ascending `ORDER BY` term. For directions, use the hook below — argument-driven ordering is always `asc`. Nested relations may be ordered too: their entries are appended after the parent's so child rows come back sorted within each parent group.

## Variables

The frontend expands `$variables` from `resolveInfo.variableValues`. On GraphQL.js v16 that map is a plain `{ name: value }` object and works directly. On GraphQL.js v17 the shape changed to `{ sources, coerced }`, so pass the coerced values explicitly:

```ts
const resolveInfo = info.variableValues.coerced
  ? { ...info, variableValues: info.variableValues.coerced }
  : info; // GraphQL.js v17 hands back { sources, coerced }
const request = await graphqlToSQL({ resolveInfo, context, model });
```

Inline literal arguments work on both versions without any adaptation.

## Fragments and directives

Fragment spreads, inline fragments, `@skip(if:)`, and `@include(if:)` are all expanded by the frontend during translation, so resolvers see a flat field list:

```graphql
query { users { ...core } }
fragment core on User { id }
```

compiles to the same SQL as selecting `{ id }` directly. An unknown fragment name raises `invalid-request`.

## Hooks

Hooks run in your TypeScript process while the frontend translates, once per field occurrence, after arguments and variables are resolved. They exist for logic that doesn't belong in the schema — tenant scoping, soft-delete filters, computed ordering. A hook may only contribute expressions or ordering; it cannot emit SQL text, and its return value crosses the boundary as data. Register them on `GraphQLModel.hooks` (by field name) or per-field via `fields[name].hooks`.

```ts
import type { GraphQLModel } from "super-join/graphql";

const model: GraphQLModel = {
  ...superJoinModel,
  fields: {
    users: {
      // WHERE users.active = $1 (field id 1n on the users entity)
      hooks: { where: ({ expr }) => expr.eq(expr.column(1n), expr.literal(true, "boolean")) },
    },
  },
};
```

produces:

```sql
SELECT "users"."id" AS "id" FROM "users" AS "users" WHERE ("users"."active" = $1)
```

The hook environment is `{ args, model, context, expr, path }`: `args` are the resolved (variable-expanded) arguments for this occurrence — including any argument super-join itself ignored — `model` is the Super-Join metadata in use, `context` is your GraphQL server's own resolver context (typed via `GraphQLModel<TContext>`; it never reaches the compiler), `expr` is the shared `ExpressionBuilder`, and `path` is the GraphQL field path such as `["users", "posts"]`. Hooks keyed by a GraphQL field name run for every occurrence of that field.

### Hooks on relations

Relation fields get hooks exactly like entity fields. Their `where` contribution folds into the relation's `ON` clause (so it filters nested rows without changing the outer join's null semantics), and their `orderBy` appends ordering qualified by the nested table:

```ts
fields: {
  posts: {
    hooks: {
      // ON (... AND posts.published_at IS NOT NULL) — field id 21n on posts
      where: ({ expr }) => expr.isNotNull(expr.column(21n)),
      // ORDER BY ... posts.created_at DESC (within each parent group)
      orderBy: () => [{ field: "created_at", direction: "desc" }],
    },
  },
},
```

The `orderBy` hook resolves its entries by GraphQL field name against the entity; `expr.column(...)` in a hook always takes the numeric model field id.

### The expression builder

`expr` builds flattened expressions: values become typed parameters, columns are numeric model ids. Available operations:

| Builder | SQL meaning |
| --- | --- |
| `expr.literal(value, dataType)` / `expr.value(...)` | bound parameter |
| `expr.column(fieldId)` | column of the current entity |
| `expr.parentColumn(depth, fieldId)` | correlated parent column |
| `expr.and(...)` / `expr.or(...)` / `expr.not(x)` | boolean combinators (nested same-operator operands flatten) |
| `expr.eq/ne/lt/lte/gt/gte(left, right)` | comparisons |
| `expr.isNull(x)` / `expr.isNotNull(x)` | null tests |
| `expr.inList(column, values)` | `IN (...)`; an empty list compiles to constant false |
| `expr.count(term?)` / `expr.sum/min/max/avg(term)` | SQL aggregates (`count()` renders `COUNT(*)`) |
| `expr.select(fromEntityId, projection, { where })` | a computed-field select definition (see below) |

Comparing against a JS `null`/`undefined` value is rejected — use `isNull`/`isNotNull`.

A hook that throws never crashes the server: it becomes a structured `invalid-request` error naming the kind and path, e.g. `where hook at "users" failed: boom`.

## Computed fields (SELECT expressions)

A model field can be satisfied by a scalar SELECT expression instead of a physical column — for example a correlated count. Declare it with `expr.select(fromEntityId, projection, { where })`; inside the definition, columns resolve against `fromEntityId` and `parentColumn(1, ...)` correlates to the entity that owns the field:

```ts
// users.postCount = (SELECT COUNT(*) FROM posts WHERE posts.author_id = users.id)
{
  id: 5n,
  identifier: { components: ["post_count"] },
  dataType: "int64",
  nullable: false,
  selectable: true,
  computed: expr.select(1n, expr.count(), {
    where: expr.eq(expr.column(11n), expr.parentColumn(1, 0n)),
  }),
}
```

Selecting the field renders `(SELECT COUNT(*) FROM "posts" AS "__sj_sub_posts" WHERE ("__sj_sub_posts"."author_id" = "users"."id")) AS "postCount"`. Only the parts of SQL a `SELECT` needs are expressible (projection, one model entity as `FROM`, optional predicate); there is no raw-SQL escape hatch.

## The error code table

Every failure is a `SuperJoinError` (or carries an equivalent payload) with one of these stable codes:

| Code | Raised when |
| --- | --- |
| `invalid-request` | malformed request, unmapped field/entity, bad pagination value, hook failure |
| `invalid-model` | model metadata is inconsistent (identity fields, relation endpoints, computed sources) |
| `unknown-field` | a selected field does not exist on the entity |
| `unknown-relation` | a nested selection has no matching relation |
| `invalid-expression` | an expression references operands or columns out of scope |
| `unsupported-feature` | mutation/subscription, nested limit/offset, mssql pagination |
| `unsupported-dialect` | dialect/host unsupported (e.g. loading the component in a browser) |

Errors are safe to surface: they carry a request-relative `path` when available and never contain SQL text or driver details.

## Next steps

- [result-shape-and-hydration.md](result-shape-and-hydration.md) — turn the artifact's flattened rows back into nested entities.
- The same topics with decorator-declared metadata: [decorator filtering, pagination, and hooks](../decorators/filtering-pagination-hooks.md).
