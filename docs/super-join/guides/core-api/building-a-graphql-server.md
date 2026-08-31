---
title: Building a GraphQL server
group: Core API guide
order: 7
---

# Building a GraphQL server

This guide walks through a complete, minimal GraphQL server built with [GraphQL.js](https://www.graphql-js.org/) where every query is compiled to SQL by Super-Join using hand-authored (core API) metadata. The server never runs a separate SQL query per nested field: one GraphQL query becomes one parameterized SQL statement, which is how Super-Join solves the n+1 problem.

By the end you will have a server answering this query with a single `SELECT ... LEFT OUTER JOIN`:

```graphql
query {
  users(limit: 10) {
    id
    name
    posts {
      postId: id
      views
    }
  }
}
```

## How the pieces fit

```text
HTTP request
    |
GraphQL.js execute()           # validates, resolves root fields
    |
resolver                       # your code: runs GraphQL frontend + compile + driver
    |--- graphqlToSQL(info)    # src-js GraphQL frontend: ResolveInfo -> CompilerRequest
    |--- compile(request)      # Wasm component: CompilerRequest -> SQL artifact
    |--- db.query(sql, params) # YOUR driver — Super-Join never connects to a database
    |--- hydrate(rows)         # regroup flattened rows into nested entities
    v
GraphQL response
```

Super-Join is a compiler only. It does not own a connection, a pool, or execution; you bring any SQL driver you like. See [result-shape-and-hydration.md](result-shape-and-hydration.md) for what the artifact contains and how to regroup its rows. (If you'd rather run all four steps in one call, `superjoin.graphql({ resolveInfo, context, model, execute })` does exactly this — see the [decorator guide's server page](../decorators/building-a-graphql-server.md) for that shape.)

## Requirements

- Node.js (the compiler ships as a Wasm Component and needs a WASI-capable host; browsers are not supported yet).
- `graphql` — a peer dependency of the GraphQL frontend entry point.

```sh
npm install super-join graphql
```

## Step 1: Describe your tables with model metadata

The compiler knows your database through a `Model`: entities (tables), fields (columns), and relations (joins). Ids are numeric (`bigint`) and unique within the model.

```ts
import type { Model } from "super-join";

const USER_ENTITY_ID = 0n;
const POST_ENTITY_ID = 1n;
const USER_ID = 0n;
const USER_NAME = 1n;
const POST_ID = 2n;
const POST_AUTHOR_ID = 3n;
const POST_VIEWS = 4n;
const USER_POSTS_RELATION_ID = 0n;

function column(fieldId: bigint) {
  return { kind: "column" as const, column: fieldId, operands: new BigUint64Array(0), values: [] };
}
function parentColumn(fieldId: bigint) {
  return { kind: "parent-column" as const, column: fieldId, depth: 1n, operands: new BigUint64Array(0), values: [] };
}

export const model: Model = {
  entities: [
    {
      id: USER_ENTITY_ID,
      source: { components: ["users"] },          // FROM "users"
      fields: [
        { id: USER_ID, identifier: { components: ["id"] }, dataType: "int64", nullable: false, selectable: true },
        { id: USER_NAME, identifier: { components: ["name"] }, dataType: "text", nullable: false, selectable: true },
      ],
      relations: [
        {
          id: USER_POSTS_RELATION_ID,
          target: POST_ENTITY_ID,
          cardinality: "many",
          // posts.author_id = users.id — the child column first, the parent via parent-column.
          join: {
            nodes: [
              column(POST_AUTHOR_ID),
              parentColumn(USER_ID),
              { kind: "compare", compareOp: "eq", operands: new BigUint64Array([0n, 1n]), values: [] },
            ],
          },
        },
      ],
      identity: new BigUint64Array([USER_ID]),    // primary key field ids
    },
    {
      id: POST_ENTITY_ID,
      source: { components: ["posts"] },
      fields: [
        { id: POST_ID, identifier: { components: ["id"] }, dataType: "int64", nullable: false, selectable: true },
        { id: POST_VIEWS, identifier: { components: ["views"] }, dataType: "int64", nullable: false, selectable: true },
        { id: POST_AUTHOR_ID, identifier: { components: ["author_id"] }, dataType: "int64", nullable: false, selectable: false },
      ],
      relations: [],
      identity: new BigUint64Array([POST_ID]),
    },
  ],
};
```

Rules that matter:

- `source` and `identifier.components` are dotted physical names. They become quoted SQL identifiers — never raw SQL text.
- A relation's `join` is a flattened expression (see [filtering-pagination-hooks.md](filtering-pagination-hooks.md)). `parent-column` refers to the parent entity occurrence; `column` refers to the target entity.
- `identity` declares the primary-key field ids. Both endpoints of any nested relation must declare an identity so flattened rows can be regrouped later.
- Mark columns you never want exposed as `selectable: false`; selecting them then raises a structured error instead of leaking data.
- `dataType` must be one of the compiler's scalar types, which include `text` and `varchar` for string columns (plus int/float families, decimal, date/time/timestamp variants, uuid, jsonb).

## Step 2: Bridge GraphQL names to model ids

The GraphQL schema speaks field names; the compiler speaks ids. A `GraphQLModel` carries the model, the dialect, and three small resolver functions that do the name→id bridging. It is separate from your GraphQL server's own context, which you pass alongside at call time.

```ts
import type { GraphQLModel } from "super-join/graphql";

export const superJoinModel: GraphQLModel = {
  model,
  dialect: "postgres",
  entityForField(fieldName) {
    switch (fieldName) {
      case "users":
      case "user":
        return USER_ENTITY_ID;
      case "posts":
        return POST_ENTITY_ID;
      default:
        return undefined;
    }
  },
  fieldForEntity(entityId, fieldName) {
    if (entityId === USER_ENTITY_ID) {
      switch (fieldName) {
        case "id": return USER_ID;
        case "name": return USER_NAME;
        default: return undefined;
      }
    }
    switch (fieldName) {
      case "id": return POST_ID;
      case "views": return POST_VIEWS;
      default: return undefined;
    }
  },
  relationForField(entityId, fieldName) {
    if (entityId === USER_ENTITY_ID && fieldName === "posts") return USER_POSTS_RELATION_ID;
    return undefined;
  },
};
```

`entityForField` is consulted both for the root field and for nested relation fields — it must map every GraphQL field that names an entity, including nested ones like `posts`. With a single-entity model the mapping is implicit, but provide it as soon as you have relations. If a nested field cannot be resolved, compilation fails with a structured `invalid-request` error naming the field.

## Step 3: Compile and run in the resolver

Only root resolvers need to do work. Each one compiles the whole selection tree (nested selections included) into one SQL artifact, runs it through your driver, and hydrates the flattened rows. Nested fields then resolve from plain objects via GraphQL.js's default resolver — no extra queries, no n+1.

```ts
import { graphqlToSQL } from "super-join/graphql";
import { compile, hydrate } from "super-join";

async function queryUsers(_args, context, info) {
  const request = await graphqlToSQL({ resolveInfo: info, context, model: context.superJoin });
  const { artifact } = await compile(request);

  // Your driver. Parameters are tagged values; unwrap them first (see below).
  const { rows } = await db.query(artifact.sql, artifact.parameters.map(toDriverValue));

  return hydrate(rows, artifact); // the built-in general hydrator
}
```

For this example the compiler produces exactly one statement:

```sql
SELECT "users"."id" AS "id", "users"."name" AS "name", "posts"."id" AS "postId", "posts"."views" AS "views"
FROM "users" AS "users"
LEFT OUTER JOIN "posts" AS "posts" ON ("posts"."author_id" = "users"."id")
LIMIT 10
```

Notice `posts { postId: id }`: aliasing the nested `id` keeps output column names unique across levels, and because you selected it, Super-Join reuses your alias as the child-identity alias instead of adding its own. If you select `posts { views }` without an id, the compiler auto-selects one under a `__sj_identity_posts_id` alias so rows remain regroupable.

Unwrap the artifact's parameters for your driver:

```ts
function toDriverValue(parameter) {
  switch (parameter.value.tag) {
    case "null":    return null;
    case "boolean": return parameter.value.val;
    case "integer": return parameter.value.val; // bigint
    case "float":   return parameter.value.val; // number
    case "text":    return parameter.value.val; // string
    case "binary":  return parameter.value.val; // Uint8Array
  }
}
```

Placeholders are dialect-specific: `$n` for postgres, `?` for mysql/sqlite, `@pN` for mssql. The `parameters` array is ordered to match them.

## Step 4: Wire up the server

With `buildSchema`, resolvers attached through `rootValue` are called as `(args, contextValue, info)` — that `info` is the `GraphQLResolveInfo` you hand to `graphqlToSQL`, and `contextValue` is the GraphQL context you pass alongside. Put the Super-Join model into the GraphQL server's context so every resolver can reach it.

```ts
import { buildSchema, graphql } from "graphql";
import { createServer } from "node:http";

const schema = buildSchema(`
  type Post { id: ID! views: Int! }
  type User { id: ID! name: String! posts: [Post!]! }
  type Query { users(limit: Int, offset: Int): [User!]!, user(id: ID!): User }
`);

const rootValue = { users: queryUsers };

createServer(async (req, res) => {
  const { query, variables } = await readJsonBody(req);
  try {
    const result = await graphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue,
      contextValue: { superJoin: superJoinModel },
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (error) {
    // A SuperJoinError that escaped a resolver is still safe to report.
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ errors: [{ message: error.message }] }));
  }
}).listen(4000);
```

## Handling errors

Every boundary failure — frontend translation or compilation — is a `SuperJoinError` with a stable `code`. Catch it inside resolvers and turn it into a GraphQL error so clients get a well-formed response:

```ts
import { SuperJoinError } from "super-join";

async function queryUsers(_args, context, info) {
  try {
    const request = await graphqlToSQL({ resolveInfo: info, context, model: context.superJoin });
    const { artifact } = await compile(request);
    // ...run + hydrate
  } catch (error) {
    if (error instanceof SuperJoinError) {
      throw new Error(`query cannot be compiled (${error.code}): ${error.message}`);
    }
    throw error;
  }
}
```

The full code table lives in [filtering-pagination-hooks.md](filtering-pagination-hooks.md#the-error-code-table).

## Current limitations

Super-Join is an alpha prototype. At the time of writing:

- Query operations only — mutations and subscriptions are rejected with `unsupported-feature`.
- `limit`/`offset` on nested relations are rejected (the flat join strategy cannot preserve them); paginate the root instead. Nested ordering is supported and sorts children within each parent group.
- Arguments never become SQL filters unless the field opts in via `fields[name].filterArgs` (see [filtering-pagination-hooks.md](filtering-pagination-hooks.md#field-level-argument-options)).
- The GraphQL frontend expects the GraphQL.js v16 shape of `variableValues`; on GraphQL.js v17 pass the coerced map (see [filtering-pagination-hooks.md](filtering-pagination-hooks.md#variables)).

## Next steps

- [filtering-pagination-hooks.md](filtering-pagination-hooks.md) — arguments as filters, pagination, ordering, and hooks.
- [result-shape-and-hydration.md](result-shape-and-hydration.md) — reading the artifact and regrouping rows at any nesting depth.

A runnable version of this guide lives in the repository at `examples/graphql-js` (`make example_graphql-js`).
