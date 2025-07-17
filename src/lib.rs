mod core;
pub mod wasm;

#[cfg(test)]
mod tests {
    use crate::core::build_sql_query;

    #[test]
    fn test_build_sql_query_1() {
        let query = "{ posts { title author } users {foo bar} }";
        let metadata_json = r#"{
            "types": {
                "Post": {
                    "field_name": "posts",
                    "table": "posts",
                    "fields": {
                        "title": { "column": "title" },
                        "author": { "column": "author" }
                    }
                }
            }
        }"#;

        let sql = build_sql_query(query, metadata_json).unwrap();

        assert!(sql.contains("SELECT"));
        assert!(sql.contains("posts.title"));
        assert!(sql.contains("posts.author"));
        assert!(!sql.contains("JOIN"));
        assert!(!sql.contains("user"));
    }

    #[test]
    fn test_build_sql_query_2() {
        let query = "{ user { posts { title author } } posts { foo bar } }";
        let metadata_json = r#"{
            "types": {
                "User": {
                    "field_name": "user",
                    "table": "users",
                    "fields": {
                        "id": { "column": "id" },
                        "name": { "column": "name" },
                        "posts": {
                            "join": {
                                "table": "posts",
                                "on_clause": "users.id = :post_author_id",
                                "root_type": "Post"
                            }
                        }
                    }
                },
                "Post": {
                    "field_name": "posts",
                    "table": "posts",
                    "fields": {
                        "title": { "column": "title" },
                        "author": { "column": "author" }
                    }
                }
            }
        }"#;

        let sql = build_sql_query(query, metadata_json).unwrap();

        assert!(sql.contains("SELECT"));
        assert!(sql.contains("users.id"));
        assert!(sql.contains("posts.title"));
        assert!(sql.contains("posts.author"));
        assert!(sql.contains("LEFT JOIN posts"));
    }
}
