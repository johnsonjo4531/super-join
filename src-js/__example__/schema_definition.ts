import { ExtendsNode, Node } from "../index.js";
import { aliases } from "./schema_aliases.js";

export const post: Node = {
  alias: aliases.post,
  field_name: "posts",
  table: "posts",
  fields: {
    title: {
      field_type: "column",
      column_type: "data",
      column: "title",
      table: null,
      // table: aliases.post,
      alias: null,
    },
    author: {
      field_type: "join",
      join: {
        join_type: "from_js",
        // value_type: "value",
        value: {
          value_type: "value",
          value: `"${aliases.post}".author_id = "${aliases.post_author}".id`,
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
    id: {
      field_type: "column",
      column_type: "data",
      column: "id",
      table: null,
      alias: null,
    },
    name: {
      field_type: "column",
      column_type: "data",
      column: "name",
      table: null,
      alias: null,
    },
    posts: {
      field_type: "join",
      join: {
        join_type: "from_js",
        // value_type: "fn",
        value: {
          value_type: "value",
          value: `"${aliases.user}".post_id = "${aliases.post}".id`,
        },
      },
      extends: {
        alias: aliases.post,
        extends: aliases.post,
        field_name: "posts",
      },
    },
  },
};
