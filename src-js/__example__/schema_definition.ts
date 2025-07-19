import { SuperJoinExtendsNode, SuperJoinNode } from "../index.js";
import { aliases } from "./schema_aliases.js";

export const post: SuperJoinNode = {
  alias: aliases.post,
  field_name: "posts",
  table: "posts",
  fields: {
    title: { kind: "column", column: "title" },
    author: {
      kind: "join",
      on_clause: `"${aliases.post}".author_id = "${aliases.post_author}".id`,
      extends: {
        alias: aliases.post_author,
        extends: aliases.user,
        field_name: aliases.user,
      },
    },
  },
};

export const user: SuperJoinNode = {
  alias: aliases.user,
  field_name: "user",
  table: "users",
  fields: {
    id: { kind: "column", column: "id" },
    name: { kind: "column", column: "name" },
    posts: {
      kind: "join",
      on_clause: `"${aliases.user}".post_id = "${aliases.post}".id`,
      extends: {
        alias: aliases.post,
        extends: aliases.post,
        field_name: "posts",
      },
    },
  },
};
