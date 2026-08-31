---
title: Building a GraphQL server
group: Decorator guide
order: 3
---

# Building a GraphQL server

This guide walks through a complete GraphQL server built with [GraphQL.js](https://www.graphql-js.org/) in TypeScript, where the model metadata is declared with decorators and every query runs through `superjoin.graphql` — super-join's main API. One GraphQL query becomes one parameterized SQL statement, which is how Super-Join solves the n+1 problem.

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
resolver                       # your code: one call to superjoin.graphql
    |--- graphqlToSQL(info)    # ResolveInfo -> CompilerRequest (hooks run here)
    |--- compile(request)      # Wasm component: CompilerRequest -> SQL artifact
    |--- execute(artifact)     # YOUR driver callback — Super-Join never connects
    |--- hydrate(rows)         # regroup flattened rows into nested entities
    v
GraphQL response
```

`superjoin.graphql` runs all four steps for you; you supply the metadata and the driver callback. See [result-shape-and-hydration.md](result-shape-and-hydration.md) for what the artifact contains and how rows are regrouped.

## Requirements

- Node.js (the compiler ships as a Wasm Component and needs a WASI-capable host; browsers are not supported yet).
- TypeScript with `experimentalDecorators`.
- `graphql` — a peer dependency of the GraphQL entry point.

```sh
npm install super-join graphql
```

## Step 1: Declare your tables as decorated classes

The compiler knows your database through model metadata; decorators generate it for you. `@Entity` names the backing table, `@Field` declares columns (scalar types include `text` and `varchar`, so string columns are selectable), and `@Relation(() => Target, ...)` declares a join with `key: { from, to }` mapping local field name → target field name.

```ts
import { Entity, Field, Relation } from "super-join/decorators";

@Entity({ source: ["users"] })
class User {
  @Field({ dataType: "int64", identity: true })
  id!: bigint;

  @Field({ dataType: "text" })
  name!: string;

  @Relation(() => Post, { cardinality: "many", key: { from: "id", to: "authorId" } })
  posts!: Post[];
}

@Entity({ source: ["posts"] })
class Post {
  @Field({ dataType: "int64", identity: true })
  id!: bigint;

  // Not selectable: it can never leak into a GraphQL response. The physical
  // column is snake_case, so name it explicitly (the property is camelCase).
  @Field({ column: "author_id", dataType: "int64", selectable: false })
  authorId!: bigint;

  @Field({ dataType: "int64" })
  views!: number;
}
```

Rules that matter:

- `source` and `column` are dotted physical names. They become quoted SQL identifiers — never raw SQL text. Defaults: table = lowercased class name, column = property name.
- `identity: true` marks primary-key fields. Both endpoints of any nested relation must declare an identity so flattened rows can be regrouped later.
- Mark columns you never want exposed as `selectable: false`; selecting them then raises a structured error instead of leaking data.
- Ids are auto-assigned (entity ids by class order, field ids per entity, relation ids globally). Pin them with `{ id }` when hooks need to reference columns by constants.

## Step 2: Generate the GraphQLModel

One call turns decorated classes into a ready `GraphQLModel`: the model itself, the name→id resolvers (keyed by class and property names), and per-field options collected from `@GraphQLField`.

```ts
import { graphQLModelFromClasses } from "super-join/decorators/graphql";
import { entityIdOf } from "super-join/decorators";

const generated = graphQLModelFromClasses([User, Post], { dialect: "sqlite" });

// The generated resolvers key entities by class name; this schema's root query
// fields are plural ("users"), so extend the resolver for that one case.
const model = {
  ...generated,
  entityForField(fieldName: string): bigint | undefined {
    if (fieldName === "users") return entityIdOf(User);
    return generated.entityForField?.(fieldName);
  },
};
```

`entityForField` is consulted both for the root field and for nested relation fields — the generated resolver already maps a relation field (`posts`) to its target entity, so only genuinely different names (plural roots) need an override. The generated `GraphQLModel` is ordinary data: spread it and override whatever your schema's naming requires. If a nested field cannot be resolved, compilation fails with a structured `invalid-request` error naming the field.

## Step 3: Compile, run, and hydrate in one call

Only root resolvers need to do work. Each calls `superjoin.graphql`, which compiles the whole selection tree (nested selections included) into one SQL artifact, hands it to your driver callback, and hydrates the flattened rows. Nested fields then resolve from plain objects via GraphQL.js's default resolver — no extra queries, no n+1.

```ts
import { superjoin } from "super-join";
import type { SqlArtifact } from "super-join";

// The driver callback: super-join hands over the compiled artifact, this
// function runs it with node:sqlite and returns the flattened rows.
const execute = (artifact: SqlArtifact) => {
  const statement = db.prepare(artifact.sql);
  return statement.all(...artifact.parameters.map(toDriverValue));
};

async function queryUsers(_args: unknown, context: Context, info: GraphQLResolveInfo) {
  return superjoin.graphql({ resolveInfo: info, context, model, execute });
}
```

Unwrap the artifact's tagged parameters for your driver:

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

For this example the compiler produces exactly one statement:

```sql
SELECT "users"."id" AS "id", "users"."name" AS "name", "posts"."id" AS "postId", "posts"."views" AS "views"
FROM "users" AS "users"
LEFT OUTER JOIN "posts" AS "posts" ON ("posts"."author_id" = "users"."id")
LIMIT 10
```

Notice `posts { postId: id }`: aliasing the nested `id` keeps output column names unique across levels, and because you selected it, Super-Join reuses your alias as the child-identity alias instead of adding its own. If you select `posts { views }` without an id, the compiler auto-selects one under a `__sj_identity_posts_id` alias so rows remain regroupable — hydration handles that for you either way.

## Step 4: Wire up the server

With `buildSchema`, resolvers attached through `rootValue` are called as `(args, contextValue, info)` — that `info` is the `GraphQLResolveInfo` you hand to `superjoin.graphql`, and `contextValue` is the GraphQL context you pass alongside (hooks read from it).

```ts
import { buildSchema, graphql } from "graphql";
import { createServer } from "node:http";

const schema = buildSchema(`
  type Post { id: ID! views: Int! }
  type User { id: ID! name: String! posts: [Post!]! }
  type Query { users(limit: Int, offset: Int, orderBy: [String!]): [User!]!, user(id: ID!): User }
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
      contextValue: { minViews: Number(process.env.MIN_VIEWS ?? 0) },
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (error) {
    // A SuperJoinError that escaped a resolver is still safe to report.
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ errors: [{ message: error.message }] }));
  }
}).listen(4001);
```

## Handling errors

Every boundary failure — frontend translation or compilation — is a `SuperJoinError` with a stable `code`. Catch it inside resolvers and turn it into a GraphQL error so clients get a well-formed response:

```ts
import { SuperJoinError } from "super-join";

async function queryUsers(_args, context, info) {
  try {
    return await superjoin.graphql({ resolveInfo: info, context, model, execute });
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
- Arguments never become SQL filters unless the field opts in via `@GraphQLField({ filterArgs })` or `fields[name].filterArgs` (see [filtering-pagination-hooks.md](filtering-pagination-hooks.md#field-level-argument-options)).
- The GraphQL frontend expects the GraphQL.js v16 shape of `variableValues`; on GraphQL.js v17 pass the coerced map (see [filtering-pagination-hooks.md](filtering-pagination-hooks.md#variables)).

## Next steps

- [filtering-pagination-hooks.md](filtering-pagination-hooks.md) — arguments as filters, pagination, ordering, and hooks.
- [result-shape-and-hydration.md](result-shape-and-hydration.md) — what `superjoin.graphql` does under the hood.

A runnable version of this guide lives in the repository at `examples/decorators-graphql-js` (`make example_decorators-graphql-js`).
