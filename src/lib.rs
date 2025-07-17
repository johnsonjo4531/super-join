mod core;
pub mod wasm;

#[cfg(test)]
mod tests {
    use crate::core::build_sql_query;

    #[test]
    fn test_build_sql_query() {
        let query = "{ user { id name posts { title author } } }";
        let metadata_json = r#"{
            "root_type": "/user",
            "types": {
                "/user": {
                    "id": { "column": "id" },
                    "name": { "column": "name" },
                    "posts": {
                        "join": {
                            "table": "posts",
                            "on_condition": "users.id = posts.author_id",
                            "target_type": "/user/post"
                        }
                    }
                },
                "/user/post": {
                    "title": { "column": "title" },
                    "author": { "column": "author" }
                }
            }
        }"#;

        let sql = build_sql_query(query, metadata_json).unwrap();

        panic!("{}", sql); // only for seeing what the sql currently is comment out to actually run the tests.
        assert!(sql.contains("SELECT"));
        assert!(sql.contains("users.id"));
        assert!(sql.contains("posts.title"));
        assert!(sql.contains("posts.author"));
        assert!(sql.contains("LEFT JOIN posts"));
    }
}
