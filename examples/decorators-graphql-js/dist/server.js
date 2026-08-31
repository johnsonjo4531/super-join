// A complete GraphQL server written in TypeScript where every query compiles
// through super-join into one parameterized SQL statement — no n+1. The pieces:
//
//   graphql-js (schema + execution)
//     -> superjoin.graphql from super-join   (the main API: translate, compile,
//                                             hand the artifact to your driver
//                                             callback, hydrate the rows)
//     -> node:sqlite                         (YOUR driver; super-join never connects)
//
// The model metadata is declared with decorators in `entities.ts` and turned
// into a ready GraphQLModel by graphQLModelFromClasses. Run it from the
// repository root with `make example_decorators-graphql-js`, or here with
// `npm start`. Then try the curl examples in this folder's README.md.
import { createServer } from 'node:http';
import { buildSchema, graphql } from 'graphql';
import { superjoin, SuperJoinError } from 'super-join';
import { entityIdOf } from 'super-join/decorators';
import { graphQLModelFromClasses } from 'super-join/decorators/graphql';
import { openDatabase, toDriverValue } from './db.js';
import { Post, User } from './entities.js';
const PORT = Number(process.env.PORT ?? 4001);
const db = openDatabase();
// One call turns the decorated classes into a ready GraphQLModel: the model
// itself, the name→id resolvers (class/property names), and per-field options.
const generated = graphQLModelFromClasses([User, Post], { dialect: 'sqlite' });
// The generated resolvers key entities by class name; this schema's root query
// fields are plural ("users"), so extend the resolver for that one case.
const model = {
    ...generated,
    entityForField(fieldName) {
        if (fieldName === 'users')
            return entityIdOf(User);
        return generated.entityForField?.(fieldName);
    },
    fields: {
        ...generated.fields,
        // `user(id:)` opts into argument-derived filters.
        user: { ...generated.fields?.['user'], filterArgs: true },
    },
};
// The driver callback: super-join hands over the compiled artifact, this
// function runs it with node:sqlite and returns the flattened rows.
const execute = (artifact) => {
    const statement = db.prepare(artifact.sql);
    return statement.all(...artifact.parameters.map(toDriverValue));
};
async function queryUsers(_args, context, info) {
    return superjoin.graphql({ resolveInfo: info, context, model, execute });
}
async function queryUser(_args, context, info) {
    const users = await superjoin.graphql({ resolveInfo: info, context, model, execute });
    return users[0] ?? null;
}
const schema = buildSchema(`
  type Post { id: ID! views: Int! }
  type User { id: ID! name: String! posts: [Post!]! }
  type Query { users(limit: Int, offset: Int, orderBy: [String!]): [User!]!, user(id: ID!): User }
`);
const rootValue = { users: queryUsers, user: queryUser };
async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request)
        chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
const server = createServer(async (request, response) => {
    if (request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('super-join decorators-graphql-js example: POST /graphql with {"query": "..."} — see README.md\n');
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
            source: query ?? '',
            variableValues: variables,
            rootValue,
            contextValue: { minViews },
        });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(result));
    }
    catch (error) {
        // A SuperJoinError that escaped a resolver is still safe to report.
        const code = error instanceof SuperJoinError ? ` (${error.code})` : '';
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ errors: [{ message: `${error.message}${code}` }] }));
    }
});
server.listen(PORT, () => {
    console.log(`super-join decorators-graphql-js example listening on http://localhost:${PORT}`);
    console.log('try: curl -s localhost:' + PORT + '/graphql -d \'{"query":"{ users(limit: 10) { id name posts { postId: id views } } }"}\'');
});
