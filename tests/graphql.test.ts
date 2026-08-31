// GraphQL frontend tests: graphqlToSQL translation (src-js/graphql.ts).
//
// Builds real GraphQL AST via `graphql.parse` and hands structurally-accurate
// resolver info to graphqlToSQL. Asserts on the returned CompilerRequest shape.
// No Wasm component is required: graphqlToSQL only translates to the request.

import { describe, expect, test } from "vitest";

import { graphqlToSQL, encodeCursor } from "../src-js/graphql.js";
import type { CompilerRequest } from "../src-js/wit.js";

import {
  makeModel,
  makeResolveInfo,
  modelWithNonSelectable,
} from "./__fixtures__/graphql.js";

const ROOT_TYPE = { name: "Query" };
const USER_TYPE = { name: "User" };
const POST_TYPE = { name: "Post" };

/** Stand-in for the GraphQL server context handed to `graphqlToSQL`. */
const context = { tenantId: 123 };

describe("graphqlToSQL single entity", () => {
  test("resolves the sole entity implicitly and selects scalar fields", async () => {
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `query { users { id name } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
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
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `query { users { userId: id aliasName: name } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    const keys = root.selection.map((s) =>
      "field" in s ? s.outputKey : undefined,
    );
    expect(keys).toEqual(["userId", "aliasName"]);
  });
});

describe("graphqlToSQL pagination and ordering", () => {
  test("maps limit/offset to a limit and an offset", async () => {
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `query { users(limit: 10, offset: 5) { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    expect(root.limit).toBe(10n);
    expect(root.offset).toBe(5n);
  });

  test("rejects a negative pagination argument", async () => {
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `query { users(limit: -1) { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context, model })).rejects.toMatchObject({
      code: "invalid-request",
    });
  });

  test("regular pagination does not recognize first/last", async () => {
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `query { users(first: 10, last: 3) { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    // Unrecognized arguments stay out of the SQL entirely.
    expect(root.limit).toBeUndefined();
    expect(root.offset).toBeUndefined();
    expect(root.predicate.length).toBe(0);
  });

  test("maps orderBy to an ascending order-by on the resolved field", async () => {
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `query { users(orderBy: ["name"]) { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    expect(root.orderBy).toEqual([{ direction: "asc", field: 1n }]);
  });
});

describe("graphqlToSQL errors", () => {
  test("rejects an unknown field", async () => {
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `query { users { nope } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context, model })).rejects.toMatchObject({
      code: "unknown-field",
    });
  });

  test("rejects a non-selectable field", async () => {
    const model = makeModel({
      fieldForEntity: undefined,
      model: modelWithNonSelectable(),
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users { password } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context, model })).rejects.toMatchObject({
      code: "invalid-request",
    });
  });

  test("rejects non-query operations", async () => {
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `mutation { users { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context, model })).rejects.toMatchObject({
      code: "unsupported-feature",
    });
  });
});

describe("graphqlToSQL relations and variables", () => {
  test("expands a one-level relation into a nested query", async () => {
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `query { users { posts { id title } } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    // Root is the users query; the posts query is nested at index 0.
    expect(request.query.root).toBe(1n);
    expect(request.query.queries.length).toBe(2);
    expect(request.query.queries[0].entity).toBe(1n);
    expect(request.query.queries[1].entity).toBe(0n);
    const relation = request.query.queries[1].selection[0];
    expect("relation" in relation && relation.relation).toBe(0n);
  });

  test("rejects a relation without a resolver", async () => {
    const model = makeModel({ relationForField: undefined });
    const resolveInfo = makeResolveInfo({
      query: `query { users { posts { id } } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context, model })).rejects.toMatchObject({
      code: "invalid-request",
    });
  });

  test("expands a GraphQL variable argument to a parameter value", async () => {
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `query ($limit: Int!) { users(limit: $limit) { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
      variables: { limit: 25 },
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
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
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `
        fragment UserCore on User { id name }
        query { users { ...UserCore } }
      `,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    expect(root.selection.map((s) => "outputKey" in s && s.outputKey)).toEqual([
      "id",
      "name",
    ]);
  });

  test("expands an inline fragment into the selection list", async () => {
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `query { users { ... on User { id } } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    expect(root.selection.map((s) => "outputKey" in s && s.outputKey)).toEqual([
      "id",
    ]);
  });

  test("@skip(if:) removes the selection and @include(if:false) too", async () => {
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `
        query ($off: Boolean!) {
          users { id name @skip(if: true) title @include(if: $off) }
        }
      `,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
      variables: { off: false },
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    expect(root.selection.map((s) => "outputKey" in s && s.outputKey)).toEqual([
      "id",
    ]);
  });

  test("offset-mode fields ignore first/last instead of erroring", async () => {
    const model = makeModel();
    const resolveInfo = makeResolveInfo({
      query: `query { users(last: 3) { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    expect(root.limit).toBeUndefined();
  });
});

describe("graphqlToSQL cursor pagination", () => {
  test("first/after become a limit and a strict tuple comparison", async () => {
    const model = makeModel({
      fields: { users: { pagination: "cursor" } },
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users(orderBy: ["name"], first: 5, after: "${encodeCursor([101])}") { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    // pageSize + 1 probe row so the driver can detect hasNextPage.
    expect(root.limit).toBe(6n);
    expect(root.orderBy).toEqual([{ direction: "asc", field: 1n }]);
    // The cursor predicate compares the ordering column against the value.
    const kinds = root.predicate.map((node) => node.kind);
    expect(kinds).toContain("compare");
    const intParam = root.predicate.find(
      (node) => node.kind === "parameter" && node.value?.tag === "integer",
    );
    expect(intParam?.value).toEqual({ tag: "integer", val: 101n });
  });

  test("last/before flip the ordering for the backward pass", async () => {
    const model = makeModel({
      fields: { users: { pagination: "cursor" } },
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users(orderBy: ["name"], last: 2, before: "${encodeCursor([999])}") { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    expect(root.limit).toBe(3n);
    expect(root.orderBy).toEqual([{ direction: "desc", field: 1n }]);
    expect(root.predicate.length).toBeGreaterThan(0);
  });

  test("rejects first and last together", async () => {
    const model = makeModel({ fields: { users: { pagination: "cursor" } } });
    const resolveInfo = makeResolveInfo({
      query: `query { users(first: 2, last: 3) { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context, model })).rejects.toMatchObject({
      code: "invalid-request",
    });
  });

  test("requires an ordering when a cursor is supplied", async () => {
    const model = makeModel({ fields: { users: { pagination: "cursor" } } });
    const resolveInfo = makeResolveInfo({
      query: `query { users(first: 2, after: "${encodeCursor([])}") { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context, model })).rejects.toMatchObject({
      code: "invalid-request",
    });
  });
});

describe("graphqlToSQL field-level argument options", () => {
  test("filterArgs maps recognized arguments to equality predicates", async () => {
    const model = makeModel({
      fields: { users: { filterArgs: true } },
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users(id: 7) { id name } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    // column + parameter + compare.
    expect(root.predicate.length).toBe(3);
    const last = root.predicate[root.predicate.length - 1];
    expect(last.kind).toBe("compare");
  });

  test("unrecognized arguments are ignored but visible to hooks", async () => {
    let seenArgs: Record<string, unknown> | undefined;
    const model = makeModel({
      fields: {
        users: {
          hooks: {
            where: ({ args }) => {
              seenArgs = args;
              return undefined;
            },
          },
        },
      },
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users(tenantSlug: "acme", unknownArg: 42) { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    expect(root.predicate.length).toBe(0);
    expect(seenArgs).toEqual({ tenantSlug: "acme", unknownArg: 42 });
  });

  test("orderBy:false stops recognizing the orderBy argument", async () => {
    const model = makeModel({ fields: { users: { orderBy: false } } });
    const resolveInfo = makeResolveInfo({
      query: `query { users(orderBy: ["name"]) { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    expect(root.orderBy).toEqual([]);
  });
});

describe("graphqlToSQL relation hooks", () => {
  test("a where hook on a relation field filters the nested query", async () => {
    const model = makeModel({
      fields: {
        posts: {
          hooks: {
            where: ({ expr }) => expr.eq(expr.column(3n), expr.literal(7, "int64")),
          },
        },
      },
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users { posts { title } } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const nested = request.query.queries[0];
    expect(nested.entity).toBe(1n);
    expect(nested.predicate.length).toBe(3);
  });

  test("an orderBy hook on a relation field orders the nested query", async () => {
    const model = makeModel({
      fields: {
        posts: {
          hooks: { orderBy: () => [{ field: "title", direction: "desc" }] },
        },
      },
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users { posts { title } } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const nested = request.query.queries[0];
    expect(nested.orderBy).toEqual([{ direction: "desc", field: 3n }]);
  });
});

describe("graphqlToSQL hooks", () => {
  test("a where hook turns a context value into an expression parameter", async () => {
    const model = makeModel({
      hooks: {
        users: {
          where: ({ expr, context }) =>
            expr.eq(
              expr.column(0n),
              expr.literal((context as { tenantId: number }).tenantId, "int64"),
            ),
        },
      },
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    // column(0) + parameter(123) + compare = three flattened nodes.
    expect(root.predicate.length).toBe(3);
    const last = root.predicate[root.predicate.length - 1];
    expect(last.kind).toBe("compare");
    const valueNode = root.predicate.find((n) => n.kind === "parameter");
    expect(valueNode?.value).toEqual({ tag: "integer", val: 123n });
  });

  test("an orderBy hook contributes explicit directions", async () => {
    const model = makeModel({
      hooks: {
        users: { orderBy: () => [{ field: "name", direction: "desc" }] },
      },
    });
    const resolveInfo = makeResolveInfo({
      query: `query { users { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    const request = await graphqlToSQL({ resolveInfo, context, model });
    const root = request.query.queries[request.query.root];
    expect(root.orderBy).toEqual([{ direction: "desc", field: 1n }]);
  });

  test("a thrown hook becomes a structured frontend error naming the path", async () => {
    const model = makeModel({
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
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
    });
    await expect(graphqlToSQL({ resolveInfo, context, model })).rejects.toMatchObject({
      code: "invalid-request",
      message: expect.stringContaining('where hook at "users"'),
    });
  });

  test("hooks receive resolved args plus model and context, once per occurrence", async () => {
    let calls = 0;
    let seenArgs: Record<string, unknown> | undefined;
    let seenModel: unknown;
    let seenContext: unknown;
    const model = makeModel({
      hooks: {
        users: {
          where: ({ args, model, context }) => {
            calls += 1;
            seenArgs = args;
            seenModel = model;
            seenContext = context;
            return undefined;
          },
        },
      },
    });
    const resolveInfo = makeResolveInfo({
      query: `query ($limit: Int!) { users(id: 7, first: $limit) { id } }`,
      fieldName: "users",
      parentType: ROOT_TYPE,
      returnType: USER_TYPE,
      variables: { limit: 5 },
    });
    await graphqlToSQL({ resolveInfo, context, model });
    expect(calls).toBe(1);
    expect(seenArgs).toEqual({ id: 7, first: 5 });
    expect(seenModel).toBe(model);
    expect(seenContext).toBe(context);
  });
});
