// A complete GraphQL server where every query compiles through super-join into
// one parameterized SQL statement — no n+1. The pieces:
//
//   graphql-js (schema + execution)
//     -> super-join/graphql  (ResolveInfo -> CompilerRequest, hooks run here)
//     -> super-join          (CompilerRequest -> SQL artifact via the Wasm component)
//     -> node:sqlite         (YOUR driver; super-join never connects)
//     -> hydrate.js          (flattened rows -> nested entities)
//
// Run it from the repository root with `make example_graphql-js`, or here with
// `npm start`. Then try the curl examples in this folder's README.md.

import { createServer } from 'node:http';
import { buildSchema, graphql } from 'graphql';
import { graphqlToSQL } from 'super-join/graphql';
import { compile, SuperJoinError } from 'super-join';

import { openDatabase, toDriverValue } from './db.js';
import { hydrate } from './hydrate.js';

const PORT = Number(process.env.PORT ?? 4000);
const db = openDatabase();

// ---------------------------------------------------------------------------
// Step 1: describe the database with super-join model metadata.
// Ids are numeric (bigint) and unique within the model. `author_id` is not
// selectable so it can never leak into a GraphQL response.
// ---------------------------------------------------------------------------

const USER_ENTITY_ID = 0n;
const POST_ENTITY_ID = 1n;
const USER_ID = 0n;
const POST_ID = 2n;
const POST_AUTHOR_ID = 3n;
const POST_VIEWS = 4n;
const USER_POSTS_RELATION_ID = 0n;

const column = (fieldId) => ({
  kind: 'column',
  column: fieldId,
  operands: new BigUint64Array(0),
  values: [],
});
const parentColumn = (fieldId) => ({
  kind: 'parent-column',
  column: fieldId,
  depth: 1n,
  operands: new BigUint64Array(0),
  values: [],
});

const sjModel = {
  entities: [
    {
      id: USER_ENTITY_ID,
      source: { components: ['users'] }, // FROM "users"
      fields: [
        { id: USER_ID, identifier: { components: ['id'] }, dataType: 'int64', nullable: false, selectable: true },
      ],
      relations: [
        {
          id: USER_POSTS_RELATION_ID,
          target: POST_ENTITY_ID,
          cardinality: 'many',
          // posts.author_id = users.id — child column first, parent via parent-column.
          join: {
            nodes: [
              column(POST_AUTHOR_ID),
              parentColumn(USER_ID),
              { kind: 'compare', compareOp: 'eq', operands: new BigUint64Array([0n, 1n]), values: [] },
            ],
          },
        },
      ],
      identity: new BigUint64Array([USER_ID]), // primary key field ids
    },
    {
      id: POST_ENTITY_ID,
      source: { components: ['posts'] },
      fields: [
        { id: POST_ID, identifier: { components: ['id'] }, dataType: 'int64', nullable: false, selectable: true },
        { id: POST_AUTHOR_ID, identifier: { components: ['author_id'] }, dataType: 'int64', nullable: false, selectable: false },
        { id: POST_VIEWS, identifier: { components: ['views'] }, dataType: 'int64', nullable: false, selectable: true },
      ],
      relations: [],
      identity: new BigUint64Array([POST_ID]),
    },
  ],
};

// ---------------------------------------------------------------------------
// Step 2: bridge GraphQL names to model ids. `GraphQLModel` is separate from
// the GraphQL server's own context, which is passed alongside at call time
// and handed to hooks (see the `posts` where-hook below).
// ---------------------------------------------------------------------------

const superJoinModel = {
  model: sjModel,
  dialect: 'sqlite',
  entityForField(fieldName) {
    switch (fieldName) {
      case 'users':
      case 'user':
        return USER_ENTITY_ID;
      case 'posts':
      case 'post':
        return POST_ENTITY_ID;
      default:
        return undefined;
    }
  },
  fieldForEntity(entityId, fieldName) {
    if (entityId === USER_ENTITY_ID) {
      switch (fieldName) {
        case 'id':
          return USER_ID;
        default:
          return undefined;
      }
    }
    switch (fieldName) {
      case 'id':
        return POST_ID;
      case 'views':
        return POST_VIEWS;
      default:
        return undefined;
    }
  },
  relationForField(entityId, fieldName) {
    if (entityId === USER_ENTITY_ID && fieldName === 'posts') {
      return USER_POSTS_RELATION_ID;
    }
    return undefined;
  },
  // Field-level options: `user(id:)` opts into argument-derived filters.
  fields: {
    user: { filterArgs: true },
  },
  hooks: {
    // Tenant-scoping-style filter fed from the GraphQL server's own context:
    // MIN_VIEWS=5 makes every `posts` selection only match views > 5.
    posts: {
      where: ({ expr, context }) => {
        const minViews = Number(context?.minViews ?? 0);
        if (!Number.isFinite(minViews) || minViews <= 0) return undefined;
        return expr.gt(expr.column(POST_VIEWS), expr.literal(Math.trunc(minViews), 'int64'));
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Step 3: compile and run in the root resolvers. Each root resolver compiles
// the whole selection tree into ONE SQL statement, runs it through the driver,
// and hydrates the flattened rows. Nested fields then resolve from plain
// objects via graphql-js's default resolver — no extra queries.
// ---------------------------------------------------------------------------

async function compileAndRun(resolveInfo, context) {
  const request = await graphqlToSQL({ resolveInfo, context, model: superJoinModel });
  const { artifact } = await compile(request);
  const statement = db.prepare(artifact.sql);
  const rows = statement.all(...artifact.parameters.map(toDriverValue));
  return hydrate(rows, artifact);
}

async function queryUsers(_args, context, info) {
  return compileAndRun(info, context);
}

async function queryUser(_args, context, info) {
  const users = await compileAndRun(info, context);
  return users[0] ?? null;
}

// ---------------------------------------------------------------------------
// Step 4: wire up the HTTP server. Resolvers attached through `rootValue` are
// called as `(args, contextValue, info)`; that `info` is the
// GraphQLResolveInfo handed to graphqlToSQL, and `contextValue` travels to it
// unchanged (the hooks read `minViews` from it).
// ---------------------------------------------------------------------------

const schema = buildSchema(`
  type Post { id: ID! views: Int! }
  type User { id: ID! posts: [Post!]! }
  type Query { users(limit: Int, offset: Int, orderBy: [String!]): [User!]!, user(id: ID!): User }
`);

const rootValue = { users: queryUsers, user: queryUser };

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('super-join graphql-js example: POST /graphql with {"query": "..."} — see README.md\n');
    return;
  }
  if (request.method !== 'POST' || !request.url?.startsWith('/graphql')) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ errors: [{ message: 'not found: POST /graphql' }] }));
    return;
  }

  const minViews = Number(process.env.MIN_VIEWS ?? 0);
  try {
    const { query, variables } = await readJsonBody(request);
    const result = await graphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue,
      contextValue: { minViews },
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(result));
  } catch (error) {
    // A SuperJoinError that escaped a resolver is still safe to report.
    const code = error instanceof SuperJoinError ? ` (${error.code})` : '';
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ errors: [{ message: `${error.message}${code}` }] }));
  }
});

server.listen(PORT, () => {
  console.log(`super-join graphql-js example listening on http://localhost:${PORT}`);
  console.log('try: curl -s localhost:' + PORT + '/graphql -d \'{"query":"{ users(limit: 10) { id posts { postId: id views } } }"}\'');
});
