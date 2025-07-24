// Copyright (c) 2025 John Johnson
//
// Licensed under either of
// - Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0)
// - MIT license (https://opensource.org/licenses/MIT)
// at your option.
pub mod core;
pub mod wasm;

#[cfg(test)]
mod tests {

    use crate::core::{
        schema::{ExtendsNode, Field, JoinInfo, Node, Root},
        shared_schema::{Column, ColumnRef, Join, JoinExpr, JoinType, SqlExpr},
        to_sql::build_sql_query,
    };

    fn assert_contains(string: &str, substring: &str) {
        assert!(
            string.contains(substring),
            "Expected to find '{}'\nin:\n{}",
            substring,
            string
        );
    }

    macro_rules! hm {
        ($( $key:expr => $val:expr ),* $(,)?) => {{
            let mut map = std::collections::HashMap::new();
            $( map.insert($key.into(), $val); )*
            map
        }};
    }

    struct Aliases<'a> {
        pub user: &'a str,
        pub post: &'a str,
        pub post_author: &'a str,
        // pub comment: &'a str,
        // pub comment_author: &'a str,
    }

    struct Schema<'a> {
        aliases: Aliases<'a>,
        schema: Root,
    }

    fn get_schema<'a>() -> Schema<'a> {
        let user_alias = "user_1";
        let post_author_alias = "user_2";
        let post_alias = "post_1";
        let comment_alias = "comment_1";
        let comment_author_alias = "user_3";

        let comment = Node {
            alias: comment_alias.into(),
            field_name: "comments".into(),
            table: "comments".into(),
            fields: hm! {
                "title" => Field::Column(Column::Data(ColumnRef {
                    column: "title".into(),
                    alias: None,
                    table: None
                })),
                "content" => Field::Column(Column::Data(ColumnRef {
                    column: "content".into(),
                    alias: None,
                    table: None,
                })),
                "author" => Field::Join(JoinInfo {
                        join: JoinExpr::Join(Join {
                            on: SqlExpr::Raw(format!("{}.author_id = {}.id", comment_alias, comment_author_alias).into()),
                            kind: JoinType::LeftJoin
                        }),
                        extends: ExtendsNode {
                            extends: user_alias.into(),
                            alias: comment_author_alias.into(),
                            field_name: "author".into(),
                        },
                }),
            },
        };

        let post = Node {
            alias: post_alias.into(),
            field_name: "posts".into(),
            table: "posts".into(),
            fields: hm! {
                "title" => Field::Column(Column::Data(ColumnRef {
                    column: "title".into(),
                    alias: None,
                    table: None,
                })),
                "author" => Field::Join(JoinInfo {
                        join: JoinExpr::Join(Join {
                            on: SqlExpr::Raw(format!("\"{}\".author_id = \"{}\".id", post_alias, post_author_alias).into()),
                            kind: JoinType::LeftJoin
                        }),
                        extends: ExtendsNode {
                            extends: user_alias.into(),
                            alias: post_author_alias.into(),
                            field_name: "author".into(),
                        },
                }),
                // "comments" => FieldMetadata::Join(JoinInfo { on_clause: format!("\"{}\".comment_ids IN (SELECT \"{}\".id)", post_alias, comment_alias), extends: SuperJoinExtendsNode { alias: comment_alias.into(), field_name: "comments".into(), extends: comment_alias.into() } })
            },
        };

        let user = Node {
            alias: user_alias.into(),
            field_name: "user".into(),
            table: "users".into(),
            fields: hm! {
                "id" => Field::Column(Column::Data(ColumnRef {
                    column: "id".into(),
                    alias: None,
                    table: None,
                })),
                "name" => Field::Column(Column::Data(ColumnRef {
                    column: "name".into(),
                    alias: None,
                    table: None,
                })),
                "posts" => Field::Join(JoinInfo {
                        join: JoinExpr::Join(Join {
                            on: SqlExpr::Raw(format!("\"{}\".post_id = \"{}\".id", user_alias, post_alias).into()),
                            kind: JoinType::LeftJoin
                        }),
                        extends: ExtendsNode {
                            extends: post_alias.into(),
                            alias: post_alias.into(),
                            field_name: "posts".into(),
                        },

                }),
            },
        };

        Schema {
            aliases: Aliases {
                user: user_alias,
                post: post_alias,
                post_author: post_author_alias,
                // comment: comment_alias,
                // comment_author: comment_author_alias,
            },
            schema: Root::from(vec![user, post, comment]),
        }
    }

    #[test]
    fn test_build_sql_query_1() {
        // May be too permissive...with allowing the users {foo bar} part of the query
        // since that doesn't exist in the schema. Maybe the underlying code should be fixed...
        let query = "{ posts { title } users {foo bar} }";
        let schema = get_schema();
        let sql = build_sql_query(query, schema.schema, None, None).unwrap();

        assert_contains(&sql, "SELECT");
        assert_contains(&sql, &format!("\"{}\".\"title\"", &schema.aliases.post));
    }

    #[test]
    fn test_build_sql_query_2() {
        let query = "{ user { posts { title author { name } } } }";
        let schema = get_schema();
        let sql = build_sql_query(query, schema.schema, None, None).unwrap();

        assert_contains(&sql, "SELECT");
        assert_contains(&sql, &format!("\"{}\".\"title\"", &schema.aliases.post));
        assert_contains(
            &sql,
            &format!("\"{}\".\"name\"", &schema.aliases.post_author),
        );
        assert_contains(&sql, "JOIN");
        assert_contains(&sql, &format!("\"{}\".post_id", &schema.aliases.user));
        assert_contains(&sql, &format!("\"{}\".author_id", &schema.aliases.post));
        assert_contains(&sql, &schema.aliases.user);
    }

    #[test]
    fn test_build_sql_query_3() {
        let query = "{ user { id posts { title comments { author { name } } author { name } } } }";
        let schema = get_schema();
        let sql = build_sql_query(query, schema.schema, None, None).unwrap();

        assert_contains(&sql, "SELECT");
        assert_contains(&sql, &format!("\"{}\".\"id\"", schema.aliases.user));
        assert_contains(&sql, &format!("\"{}\".\"title\"", schema.aliases.post));
        assert_contains(
            &sql,
            &format!("\"{}\".\"name\"", schema.aliases.post_author),
        );
        assert_contains(&sql, "JOIN");
        assert_contains(&sql, schema.aliases.user);
    }
}
