import { ExtendsNode, Node } from "../index.js";
import { aliases } from "./schema_aliases.js";

export const post: Node = {
  alias: aliases.post,
  field_name: "posts",
  table: "posts",
  fields: {
    title: { kind: "column", column: "title", table: aliases.post },
    author: {
      kind: "join",
      join: {
        kind: "left_join",
        on: {
          kind: "raw",
          value: `${aliases.post}".author_id = "${aliases.post_author}".id`,
        },
      },
      extends: {
        alias: aliases.post_author,
        extends: aliases.user,
        field_name: aliases.user,
      },
    },
  },
};

export const user: Node = {
  alias: aliases.user,
  field_name: "user",
  table: "users",
  fields: {
    id: { kind: "column", column: "id", table: aliases.user },
    name: { kind: "column", column: "name", table: aliases.user },
    posts: {
      kind: "join",
      join: {
        on: {
          kind: "raw",
          value: `"${aliases.user}".post_id = "${aliases.post}".id`,
        },
        kind: "left_join",
      },
      extends: {
        alias: aliases.post,
        extends: aliases.post,
        field_name: "posts",
      },
    },
  },
};
