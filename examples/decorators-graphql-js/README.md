# decorators-graphql-js example

A complete **TypeScript** GraphQL server ([graphql-js](https://www.graphql-js.org/)) where the model metadata is declared with super-join's TypeScript decorators and every query runs through `superjoin.graphql` — super-join's main API. Each query compiles to **one** parameterized SQL statement (the n+1 problem never appears), your driver callback executes it, and super-join hydrates the flattened rows back into nested entities. The database is SQLite via the built-in `node:sqlite` module, so there are no external services or native builds to install.

## Run it

From the repository root (builds super-join, installs the example's dependencies, compiles the example's TypeScript, starts the server):

```sh
make example_decorators-graphql-js
```

Or manually from this folder (requires a built `dist/` in super-join — see the repo README):

```sh
npm install
npm start          # listens on http://localhost:4001, override with PORT=
```

Requires Node.js >= 22.5 for `node:sqlite` (on Node 22.x add `--experimental-sqlite`).

super-join is linked from the source tree via the `file:../..` dependency in `package.json`; it is not published to npm yet. This example compiles with `tsc` (`npm run build`) because decorator metadata needs TypeScript's legacy decorators (`experimentalDecorators`).

## Try a query

```sh
curl -s localhost:4001/graphql \
  -d '{"query": "{ users(limit: 10) { id name posts { postId: id views } } }"}'
```

```json
{"data":{"users":[
  {"id":"1","name":"ada","posts":[{"postId":"101","views":5},{"postId":"102","views":9}]},
  {"id":"2","name":"grace","posts":[{"postId":"103","views":7}]},
  {"id":"3","name":"linus","posts":[{"postId":"104","views":3}]}
]}}
```

One GraphQL query, one SQL statement:

```sql
SELECT "users"."id" AS "id", "users"."name" AS "name", "posts"."id" AS "postId", "posts"."views" AS "views"
FROM "users" AS "users"
LEFT OUTER JOIN "posts" AS "posts" ON ("posts"."author_id" = "users"."id")
LIMIT 10
```

Argument filters become typed parameters, never SQL text:

```sh
curl -s localhost:4001/graphql \
  -d '{"query": "{ user(id: \"2\") { id name } }"}'
```

Hooks read the GraphQL server's own context — set `MIN_VIEWS` to see a where-hook contribute a predicate to every `posts` selection:

```sh
MIN_VIEWS=5 npm start   # then posts with views <= 5 disappear from responses
```

## What's in here

| File | Role |
| --- | --- |
| `src/entities.ts` | The model declared with decorators: `@Entity`, `@Field` (with the `text` scalar), and `@Relation` including a where-hook |
| `src/server.ts` | `graphQLModelFromClasses` → `GraphQLModel`, resolvers that call `superjoin.graphql`, HTTP wiring |
| `src/db.ts` | The example-owned driver: in-memory SQLite, seeded tables, parameter unwrapping |

The whole server-side pipeline is one function call per root resolver:

```ts
const users = await superjoin.graphql({ resolveInfo: info, context, model, execute });
```

`execute` receives the compiled SQL artifact and returns the flattened rows; `superjoin.graphql` compiles (via the Wasm Component), waits for your callback, and hydrates the rows using the artifact's result shape.

## Current limitations (super-join is alpha)

- Query operations only; mutations/subscriptions are rejected.
- Nested relations cannot be paginated; paginate the root instead.
- Selecting the same field name at two nesting levels without a response alias (e.g. `posts { id }` under `users { id }`) currently produces duplicate SQL aliases and garbled rows. Give nested ids an explicit alias (`postId: id`) — as the queries above do — until super-join disambiguates aliases itself.
