---
title: Result shape and hydration
group: Core API guide
order: 9
---

# Result shape and hydration

A compiled artifact returns one flat SQL result set even when the GraphQL query nests relations. The parent row repeats for every child row. Hydration is the step that regroups those flattened rows into nested entities before you return them to GraphQL.js. Super-Join describes how rows regroup (`artifact.resultShape`) and ships a general hydrator; `superjoin()` runs it for you when you use the main API.

## Anatomy of an artifact

```ts
const { artifact } = await compile(request);
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

Both endpoints of a nested relation must declare an identity (primary key). If you select the child's id yourself, Super-Join reuses your alias for the identity — that's why `postId: id` appears in `childIdentity`. If you don't select it, the compiler auto-selects it under a namespaced `__sj_identity_*` alias so rows stay regroupable:

```sql
SELECT "users"."id" AS "id", "posts"."views" AS "views", "posts"."id" AS "__sj_identity_posts_id" ...
```

Auto aliases are never part of the GraphQL response; they exist only to make rows regroupable. Prefer selecting ids with explicit aliases when you can — it keeps output names unique across nesting levels.

## The built-in hydrator

`hydrate(rows, artifact)` is exported from `super-join` and handles any result shape: a `flat` shape returns the rows unchanged; nested shapes of any depth regroup parents and children purely from `resultShape` metadata — no hard-coded column names. Children with a null identity stay empty lists.

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

## Writing your own hydrator

If you need custom output shapes, drive the regrouping from `resultShape` yourself. `resultShape.nesting` carries one entry per relation occurrence, ordered root-to-leaf, and each entry's `path` is the full GraphQL path. A general algorithm walks `nesting` outermost-first: group rows by the concatenation of identity aliases seen so far, attach each child group under its parent's bucket, then drop helper columns. Key guarantees the compiler provides:

- Parent rows repeat exactly once per distinct child path; dedupe by identity, never by row equality.
- A `null` child identity column means "this parent had no child" — emit an empty list, not a null entry.
- Nested ordering is preserved in the SQL (children come back sorted within each parent group); see [filtering-pagination-hooks.md](filtering-pagination-hooks.md#ordering-arguments).

## See also

- [building-a-graphql-server.md](building-a-graphql-server.md) — the full server this hydration step plugs into.
- [filtering-pagination-hooks.md](filtering-pagination-hooks.md) — error codes to handle while compiling.
