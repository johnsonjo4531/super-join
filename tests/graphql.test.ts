// GraphQL frontend tests: graphqlToSQL translation (src-js/graphql.ts).
//
// Builds real GraphQL AST via `graphql.parse` and hands structurally-accurate
// resolver info to graphqlToSQL. Asserts on the returned CompilerRequest shape.
// No Wasm component is required: graphqlToSQL only translates to the request.

import { describe, expect, test } from "vitest";

import { graphqlToSQL } from "../src-js/graphql.js";
import type { CompilerRequest } from "../src-js/wit.js";

import {
  makeContext,
  makeResolveInfo,
  modelWithNonSelectable,
} from "./__fixtures__/graphql.js";

const ROOT_TYPE = { name: "Query" };
const USER_TYPE = { name: "User" };
const POST_TYPE = { name: "Post" };

describe("graphqlToSQL single entity", () => {
  test("resolves the sole entity implicitly and selects scalar fields", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `query { users { id name } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context });
    console.log(
      JSON.stringify(
        request,
        (x, y) => (typeof y === "bigint" ? Number(y) : y),
        2,
      ),
    );
    assertUserQuery(request);
  });

  test("uses aliases for output keys", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `query { users { userId: id aliasName: name } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context });
    const root = request.query.queries[request.query.root];
    const keys = root.selection.map((s) =>
      "field" in s ? s.outputKey : undefined,
    );
    expect(keys).toEqual(["userId", "aliasName"]);
  });
});

describe("graphqlToSQL pagination and ordering", () => {
  test("maps first/limit to a limit and offset to an offset", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `query { users(first: 10, offset: 5) { id } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context });
    const root = request.query.queries[request.query.root];
    expect(root.limit).toBe(10n);
    expect(root.offset).toBe(5n);
  });

  test("rejects a negative pagination argument", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `query { users(first: -1) { id } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context })).rejects.toMatchObject({
      code: "invalid-request",
    });
  });

  test("maps orderBy to an ascending order-by on the resolved field", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `query { users(orderBy: ["name"]) { id } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context });
    const root = request.query.queries[request.query.root];
    expect(root.orderBy).toEqual([{ direction: "asc", field: 1n }]);
  });
});

describe("graphqlToSQL errors", () => {
  test("rejects an unknown field", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `query { users { nope } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context })).rejects.toMatchObject({
      code: "unknown-field",
    });
  });

  test("rejects a non-selectable field", async () => {
    const context = makeContext({
      fieldForEntity: undefined,
      model: modelWithNonSelectable(),
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users { password } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context })).rejects.toMatchObject({
      code: "invalid-request",
    });
  });

  test("rejects non-query operations", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `mutation { users { id } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context })).rejects.toMatchObject({
      code: "unsupported-feature",
    });
  });
});

describe("graphqlToSQL relations and variables", () => {
  test("expands a one-level relation into a nested query", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `query { users { posts { id title } } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context });
    // Root is the users query; the posts query is nested at index 0.
    expect(request.query.root).toBe(1n);
    expect(request.query.queries.length).toBe(2);
    expect(request.query.queries[0].entity).toBe(1n);
    expect(request.query.queries[1].entity).toBe(0n);
    const relation = request.query.queries[1].selection[0];
    expect("relation" in relation && relation.relation).toBe(0n);
  });

  test("rejects a relation without a resolver", async () => {
    const context = makeContext({ relationForField: undefined });
    const resolveInfo = makeResolveInfo({
      query: `query { users { posts { id } } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context })).rejects.toMatchObject({
      code: "invalid-request",
    });
  });

  test("expands a GraphQL variable argument to a parameter value", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `query ($limit: Int!) { users(first: $limit) { id } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
      variables: { limit: 25 },
    });
    const request = await graphqlToSQL({ resolveInfo, context });
    const root = request.query.queries[request.query.root];
    expect(root.limit).toBe(25n);
  });
});

function assertUserQuery(request: CompilerRequest): void {
  expect(request.query.queries.length).toBe(1);
  const root = request.query.queries[request.query.root];
  expect(root.entity).toBe(0n);
  expect(
    root.selection.map((s) => ("field" in s ? s.outputKey : undefined)),
  ).toEqual(["id", "name"]);
  expect(request.options.dialect).toBe("postgres");
}

describe("graphqlToSQL fragments and directives", () => {
  test("expands a named fragment spread into the selection list", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `
        fragment UserCore on User { id name }
        query { users { ...UserCore } }
      `,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context });
    const root = request.query.queries[request.query.root];
    expect(root.selection.map((s) => "outputKey" in s && s.outputKey)).toEqual([
      "id",
      "name",
    ]);
  });

  test("expands an inline fragment into the selection list", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `query { users { ... on User { id } } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context });
    const root = request.query.queries[request.query.root];
    expect(root.selection.map((s) => "outputKey" in s && s.outputKey)).toEqual([
      "id",
    ]);
  });

  test("@skip(if:) removes the selection and @include(if:false) too", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `
        query ($off: Boolean!) {
          users { id name @skip(if: true) title @include(if: $off) }
        }
      `,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
      variables: { off: false },
    });
    const request = await graphqlToSQL({ resolveInfo, context });
    const root = request.query.queries[request.query.root];
    expect(root.selection.map((s) => "outputKey" in s && s.outputKey)).toEqual([
      "id",
    ]);
  });

  test("rejects the unsupported 'last' pagination argument", async () => {
    const context = makeContext();
    const resolveInfo = makeResolveInfo({
      query: `query { users(last: 3) { id } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context })).rejects.toMatchObject({
      code: "unsupported-feature",
    });
  });
});

describe("graphqlToSQL hooks", () => {
  test("a where hook turns a context value into an expression parameter", async () => {
    const context = makeContext({
      hooks: {
        users: {
          where: ({ expr }) =>
            expr.eq(expr.column(0n), expr.literal(123, "int64")),
        },
      },
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users { id } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context });
    const root = request.query.queries[request.query.root];
    // column(0) + parameter(123) + compare = three flattened nodes.
    expect(root.predicate.length).toBe(3);
    const last = root.predicate[root.predicate.length - 1];
    expect(last.kind).toBe("compare");
    const valueNode = root.predicate.find((n) => n.kind === "parameter");
    expect(valueNode?.value).toEqual({ tag: "integer", val: 123n });
  });

  test("an orderBy hook contributes explicit directions", async () => {
    const context = makeContext({
      hooks: {
        users: { orderBy: () => [{ field: "name", direction: "desc" }] },
      },
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users { id } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context });
    const root = request.query.queries[request.query.root];
    expect(root.orderBy).toEqual([{ direction: "desc", field: 1n }]);
  });

  test("a thrown hook becomes a structured frontend error naming the path", async () => {
    const context = makeContext({
      hooks: {
        users: {
          where: () => {
            throw new Error("boom");
          },
        },
      },
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users { id } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context })).rejects.toMatchObject({
      code: "invalid-request",
      message: expect.stringContaining('where hook at "users"'),
    });
  });

  test("hooks receive resolved args and run once per occurrence", async () => {
    let calls = 0;
    let seenArgs: Record<string, unknown> | undefined;
    const context = makeContext({
      hooks: {
        users: {
          where: ({ args }) => {
            calls += 1;
            seenArgs = args;
            return undefined;
          },
        },
      },
    });
    const resolveInfo = makeResolveInfo({
      query: `query ($limit: Int!) { users(id: 7, first: $limit) { id } }`,
      context,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
      variables: { limit: 5 },
    });
    await graphqlToSQL({ resolveInfo, context });
    expect(calls).toBe(1);
    expect(seenArgs).toEqual({ id: 7, first: 5 });
  });
});
