const { test } = Deno;
import { expect } from "jsr:@std/expect";
import { buildSqlQuery } from "../index.js";
import { graphql } from "graphql";

test("runtime", async (t) => {
  console.time("First run of buildSqlQuery");
  const sql = buildSqlQuery(`{posts { title author  } }`, {
    types: {
      // User: {
      //   field_name: "user",
      //   table: "users",
      //   fields: {
      //     id: { column: "id" },
      //     name: { column: "name" },
      //     posts: {
      //       join: {
      //         table: "posts",
      //         on_clause: "users.id = :post_author_id",
      //         root_type: "Post",
      //       },
      //     },
      //   },
      // },
      Post: {
        field_name: "posts",
        table: "posts",
        fields: {
          title: { column: "title" },
          author: { column: "author" },
        },
      },
    },
  });
  console.timeEnd("First run of buildSqlQuery");

  console.time("Next 100 passes of buildSqlQuery");
  for (const i of new Array(100)) {
    const sql2 = buildSqlQuery(`{ user { posts { title author  } } }`, {
      types: {
        User: {
          field_name: "user",
          table: "users",
          fields: {
            id: { column: "id" },
            name: { column: "name" },
            posts: {
              join: {
                table: "posts",
                on_clause: "users.id = :post_author_id",
                root_type: "Post",
              },
            },
          },
        },
        Post: {
          field_name: "posts",
          table: "posts",
          fields: {
            title: { column: "title" },
            author: { column: "author" },
          },
        },
      },
    });
  }
  console.timeEnd("Next 100 passes of buildSqlQuery");
  expect(true).toBe(true);
});

test("posts", async (t) => {
  console.time("buildSqlQuery");
  const sql = buildSqlQuery(`{posts { title author  } }`, {
    types: {
      // User: {
      //   field_name: "user",
      //   table: "users",
      //   fields: {
      //     id: { column: "id" },
      //     name: { column: "name" },
      //     posts: {
      //       join: {
      //         table: "posts",
      //         on_clause: "users.id = :post_author_id",
      //         root_type: "Post",
      //       },
      //     },
      //   },
      // },
      Post: {
        field_name: "posts",
        table: "posts",
        fields: {
          title: { column: "title" },
          author: { column: "author" },
        },
      },
    },
  });

  console.timeEnd("buildSqlQuery");
  // Cannot read properties of undefined (reading \'__wbindgen_malloc\')
  console.log({ sql });
  // t.assert(sql.includes("users.id"));
  // t.assert(sql.includes("users.name"));
  expect(sql.includes("posts.title")).toBe(true);
  expect(sql.includes("posts.author")).toBe(true);
});

test("user", async (t) => {
  console.time("buildSqlQuery");
  const sql = buildSqlQuery(`{ user { posts { title author  } } }`, {
    types: {
      User: {
        field_name: "user",
        table: "users",
        fields: {
          id: { column: "id" },
          name: { column: "name" },
          posts: {
            join: {
              table: "posts",
              on_clause: "users.id = :post_author_id",
              root_type: "Post",
            },
          },
        },
      },
      Post: {
        field_name: "posts",
        table: "posts",
        fields: {
          title: { column: "title" },
          author: { column: "author" },
        },
      },
    },
  });

  console.timeEnd("buildSqlQuery");
  // Cannot read properties of undefined (reading \'__wbindgen_malloc\')
  console.log({ sql });
  // t.assert(sql.includes("users.id"));
  // t.assert(sql.includes("users.name"));
  expect(sql.includes("posts.title")).toBe(true);
  expect(sql.includes("posts.author")).toBe(true);
});
