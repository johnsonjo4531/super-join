# graphql-js example

A complete Node.js GraphQL server ([graphql-js](https://www.graphql-js.org/)) where every query is compiled by super-join into **one** parameterized SQL statement — the n+1 problem never appears. The database is SQLite via the built-in `node:sqlite` module, so there are no external services or native builds to install.

## Run it

From the repository root (builds super-join, installs the example's dependencies, starts the server):

```sh
make example_graphql-js
```

Or manually from this folder (requires a built `dist/` in super-join — see the repo README):

```sh
npm install
npm start          # listens on http://localhost:4000, override with PORT=
```

Requires Node.js >= 22.5 for `node:sqlite` (on Node 22.x add `--experimental-sqlite`).

super-join is linked from the source tree via the `file:../..` dependency in `package.json`; it is not published to npm yet.

## Try a query

```sh
curl -s localhost:4000/graphql \
  -d '{"query": "{ users(limit: 10) { id posts { postId: id views } } }"}'
```

```json
{"data":{"users":[
  {"id":"1","posts":[{"postId":"101","views":5},{"postId":"102","views":9}]},
  {"id":"2","posts":[{"postId":"103","views":7}]},
  {"id":"3","posts":[{"postId":"104","views":3}]}
]}}
```

One GraphQL query, one SQL statement:

```sql
SELECT "users"."id" AS "id", "posts"."id" AS "postId", "posts"."views" AS "views"
FROM "users" AS "users"
LEFT OUTER JOIN "posts" AS "posts" ON ("posts"."author_id" = "users"."id")
LIMIT 10
```

Argument filters become typed parameters, never SQL text:

```sh
curl -s localhost:4000/graphql \
  -d '{"query": "{ user(id: \"2\") { id posts { views } } }"}'
```

Pagination (`limit`, `offset`), ordering (`orderBy: ["id"]`), operation variables, and response aliases (`postId: id`) all work.

Hooks read the GraphQL server's own context — set `MIN_VIEWS` to see a where-hook contribute a predicate to every `posts` selection:

```sh
MIN_VIEWS=5 npm start   # then posts with views <= 5 disappear from responses
```

Failures are structured, not crashes. A value that cannot become a typed parameter fails cleanly at the compiler boundary:

```sh
curl -s localhost:4000/graphql -d '{"query": "{ user(id: \"abc\") { id } }"}'
# -> errors[].message reports the failed conversion; SQL text never leaks
```

## What's in here

| File | Role |
| --- | --- |
| `server.js` | Model metadata, the `GraphQLModel` name→id bridge + hooks, resolvers that compile → run → hydrate, HTTP wiring |
| `db.js` | The example-owned driver: in-memory SQLite, seeded tables, parameter unwrapping |
| `hydrate.js` | Regroups the artifact's flattened rows into nested entities from `resultShape` |

## Current limitations (super-join is alpha)

- Query operations only; mutations/subscriptions are rejected.
- No `text` scalar type yet, so string columns (`users.name`) are modeled but not selectable — they stay out of the GraphQL schema.
- Nested relations cannot be paginated/ordered; paginate the root instead.
- Selecting the same field name at two nesting levels without a response alias (e.g. `posts { id }` under `users { id }`) currently produces duplicate SQL aliases and garbled rows. Give nested ids an explicit alias (`postId: id`) — as the queries above do — until super-join disambiguates aliases itself.
