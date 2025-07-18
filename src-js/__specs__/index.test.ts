import test from "ava";
import { buildSqlQuery } from "../index.js";
import { graphql } from "graphql";
// TODO see how fast join-monster is :D
import joinMonster from "join-monster";

test("foo", (t) => {
  t.pass();
});

test("bar", async (t) => {
  console.time("buildSqlQuery");
  const sql = buildSqlQuery(
    `{user { id name posts { title author }  } }`,
    JSON.stringify({
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
    }),
  );

  console.timeEnd("buildSqlQuery");
  // Cannot read properties of undefined (reading \'__wbindgen_malloc\')
  console.log({ sql });
  t.assert(sql.includes("users.id"));
  t.assert(sql.includes("users.name"));
  t.assert(sql.includes("posts.title"));
  t.assert(sql.includes("posts.author"));
});
