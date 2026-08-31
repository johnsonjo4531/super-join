---
title: Result shape and hydration
group: Decorator guide
order: 5
---

# Result shape and hydration

When you call `superjoin.graphql`, the last step it performs is hydration: regrouping the artifact's flattened SQL rows back into nested entities. This page explains what happens under the hood, so you can rely on it — or replace it.

A compiled artifact returns one flat SQL result set even when the GraphQL query nests relations. The parent row repeats for every child row. Super-Join describes how rows regroup (`artifact.resultShape`) and ships a general hydrator that performs the regrouping; `superjoin.graphql` runs both compile and hydrate for you.

## Anatomy of an artifact

```ts
const { artifact } = await compile(request); // or let superjoin do it for you
```

| Field | Meaning |
| --- | --- |
| `artifact.sql` | parameterized SQL text, dialect-specific placeholders (`$n`, `?`, `@pN`) |
| `artifact.parameters` | ordered typed values matching the placeholders |
| `artifact.dialect` | the dialect it was rendered for |
| `artifact.selectedFields` | every output column: `{ alias, field, path }` |
| `artifact.resultShape` | how rows map back to entities (below) |

For `query { users(limit: 10) { id posts { postId: id views } } }` the compiler produced:

```sql
SELECT "users"."id" AS "id", "posts"."id" AS "postId", "posts"."views" AS "views"
FROM "users" AS "users"
LEFT OUTER JOIN "posts" AS "posts" ON ("posts"."author_id" = "users"."id")
LIMIT 10
```

and this `resultShape`:

```json
{
  "kind": "nested",
  "rows": [
    { "alias": "id",     "field": 0, "path": ["users", "id"] },
    { "alias": "postId", "field": 3, "path": ["users", "posts", "id"] },
    { "alias": "views",  "field": 4, "path": ["users", "posts", "views"] }
  ],
  "nesting": [
    {
      "path": ["users", "posts"],
      "parentAlias": "users",
      "childAlias": "posts",
      "parentIdentity": [{ "field": 0, "alias": "id" }],
      "childIdentity": [{ "field": 3, "alias": "postId" }]
    }
  ]
}
```

Reading it:

- `kind` is `"flat"` when nothing is nested (one row = one entity) and `"nested"` otherwise. (`"json"` is reserved for a future JSON-aggregation strategy.)
- `rows` lists every output column with its logical field id and GraphQL path. The last path component is the GraphQL field name — use it to key hydrated objects, because SQL aliases may differ (response aliases like `postId: id`).
- Each `nesting` entry describes one relation occurrence. `parentIdentity`/`childIdentity` give the aliases carrying the primary-key values needed to dedupe parents and children. A missing LEFT JOIN child shows up as `null` in the child identity columns.

## Identity aliases

Both endpoints of a nested relation must declare an identity (primary key) — with decorators, that's `@Field({ identity: true })`. If you select the child's id yourself, Super-Join reuses your alias for the identity — that's why `postId: id` appears in `childIdentity`. If you don't select it, the compiler auto-selects it under a namespaced `__sj_identity_*` alias so rows stay regroupable:

```sql
SELECT "users"."id" AS "id", "posts"."views" AS "views", "posts"."id" AS "__sj_identity_posts_id" ...
```

Auto aliases are never part of the GraphQL response; they exist only to make rows regroupable. Prefer selecting ids with explicit aliases when you can — it keeps output names unique across nesting levels.

## The built-in hydrator

`superjoin.graphql` (and `superjoin`) calls `hydrate(rows, artifact)` for you — exported from `super-join` if you drive the steps yourself. It is driven entirely by `resultShape`: no hard-coded column names, any relation name, any nesting depth. A `flat` shape returns the rows unchanged; children with a null identity stay empty lists.

```ts
import { hydrate } from "super-join";

const entities = hydrate(rows, artifact); // plain objects keyed by GraphQL field name
```

Keying hydrated objects by the last path component (the GraphQL field name) rather than the SQL alias is what makes response aliases work: `postId` arrives as a column, but `Post.id` resolves from `id`. Extra keys such as auto-selected identity columns are simply ignored by GraphQL.js's default resolver.

Given rows

```json
[
  { "id": 1, "postId": 101, "views": 5 },
  { "id": 1, "postId": 102, "views": 9 }
]
```

the hydrator returns one user with two posts, and the GraphQL response is:

```json
{
  "data": {
    "users": [
      { "id": "1", "posts": [ { "postId": "101", "views": 5 }, { "postId": "102", "views": 9 } ] }
    ]
  }
}
```

Keep in mind what the compiler already guarantees for you:

- Parent rows repeat exactly once per distinct child path; dedupe by identity, never by row equality.
- A `null` child identity column means "this parent had no child" — emit an empty list, not a null entry.
- Nested ordering is preserved in the SQL (children come back sorted within each parent group); see [filtering-pagination-hooks.md](filtering-pagination-hooks.md#ordering-arguments).

## See also

- [building-a-graphql-server.md](building-a-graphql-server.md) — the full server this hydration step plugs into.
- Hand-authored metadata, same result shape: [core API result shape and hydration](../core-api/result-shape-and-hydration.md).
