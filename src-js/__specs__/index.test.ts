import test from "ava";
import { buildSqlQuery } from "../index.js";
import { graphql } from "graphql";
// TODO see how fast join-monster is :D
import joinMonster from "join-monster";

test("runtime", (t) => {
  console.time("First run");
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
  console.timeEnd("First run");

  console.time("100 passes of buildSqlQuery");
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
  console.timeEnd("100 passes of buildSqlQuery");
  t.pass();
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
  t.assert(sql.includes("posts.title"));
  t.assert(sql.includes("posts.author"));
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
  t.assert(sql.includes("posts.title"));
  t.assert(sql.includes("posts.author"));
});
