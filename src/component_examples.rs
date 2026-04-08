/// Component implementation tests
///
/// Tests the component model API with example inputs, mirroring the
/// standard library tests but using the WIT-exposed interface.

#[cfg(feature = "component")]
#[cfg(test)]
mod component_tests {
    use crate::bindings::Guest;
    use crate::component::SuperJoinComponent;
    use serde_json::json;

    fn assert_contains(string: &str, substring: &str) {
        assert!(
            string.contains(substring),
            "Expected to find '{}'\nin:\n{}",
            substring,
            string
        );
    }

    #[test]
    fn test_component_build_sql_query_simple() {
        // Simple query: fetch posts with just title column
        let metadata_json = json!([
            {
                "alias": "post_1",
                "table": "posts",
                "field_name": "posts",
                "fields": {
                    "title": { "kind": "column", "column": "title" }
                }
            },
            {
                "alias": "user_1",
                "table": "users",
                "field_name": "user",
                "fields": {
                    "id": { "kind": "column", "column": "id" },
                    "posts": {
                        "kind": "join",
                        "extends": {
                            "alias": "post_1",
                            "extends": "post_1",
                            "field_name": "posts"
                        },
                        "join": {
                            "on": { "kind": "raw", "value": "\"user_1\".post_id = \"post_1\".id" },
                            "kind": "left_join"
                        }
                    }
                }
            }
        ]);

        let query = "{ posts { title } }";
        let result =
            SuperJoinComponent::build_sql_query(query.to_string(), metadata_json.to_string(), None);

        assert!(result.is_ok(), "build_sql_query failed: {:?}", result.as_ref().unwrap_err());
        let sql = result.unwrap();
        assert_contains(&sql, "SELECT");
        assert_contains(&sql, "post_1");
        assert_contains(&sql, "title");
    }

    #[test]
    fn test_component_build_sql_query_with_nested_join() {
        // Query: user -> posts -> author (nested join)
        // Mirrors test_build_sql_query_2 from lib.rs
        let metadata_json = json!([
            {
                "alias": "post_1",
                "table": "posts",
                "field_name": "posts",
                "fields": {
                    "title": { "kind": "column", "column": "title" },
                    "author": {
                        "kind": "join",
                        "extends": {
                            "alias": "user_2",
                            "extends": "user_2",
                            "field_name": "author"
                        },
                        "join": {
                            "on": { "kind": "raw", "value": "\"post_1\".author_id = \"user_2\".id" },
                            "kind": "left_join"
                        }
                    }
                }
            },
            {
                "alias": "user_1",
                "table": "users",
                "field_name": "user",
                "fields": {
                    "id": { "kind": "column", "column": "id" },
                    "name": { "kind": "column", "column": "name" },
                    "posts": {
                        "kind": "join",
                        "extends": {
                            "alias": "post_1",
                            "extends": "post_1",
                            "field_name": "posts"
                        },
                        "join": {
                            "on": { "kind": "raw", "value": "\"user_1\".post_id = \"post_1\".id" },
                            "kind": "left_join"
                        }
                    }
                }
            },
            {
                "alias": "user_2",
                "table": "users",
                "field_name": "author",
                "fields": {
                    "name": { "kind": "column", "column": "name" }
                }
            }
        ]);

        // Query user with their posts and each post's author name
        let query = "{ user { posts { title author { name } } } }";
        let result =
            SuperJoinComponent::build_sql_query(query.to_string(), metadata_json.to_string(), None);

        assert!(result.is_ok(), "build_sql_query failed: {:?}", result.as_ref().unwrap_err());
        let sql = result.unwrap();
        assert_contains(&sql, "SELECT");
        assert_contains(&sql, "title");
        assert_contains(&sql, "name");
        assert_contains(&sql, "JOIN");
        assert_contains(&sql, "post_1");
        assert_contains(&sql, "user_2");
    }

    #[test]
    fn test_component_build_sql_query_with_options() {
        let metadata_json = json!([
            {
                "alias": "post_1",
                "table": "posts",
                "field_name": "posts",
                "fields": {
                    "title": { "kind": "column", "column": "title" }
                }
            }
        ]);

        // BuilderType is serialized as a simple string variant
        let options_json = json!({
            "builder": "postgres"
        });

        let query = "{ posts { title } }";
        let result = SuperJoinComponent::build_sql_query(
            query.to_string(),
            metadata_json.to_string(),
            Some(options_json.to_string()),
        );

        assert!(result.is_ok(), "build_sql_query failed: {:?}", result.as_ref().unwrap_err());
        let sql = result.unwrap();
        assert_contains(&sql, "SELECT");
    }

    #[test]
    fn test_component_build_sql_query_invalid_metadata() {
        let metadata_json = "not valid json";
        let query = "{ posts { title } }";
        let result = SuperJoinComponent::build_sql_query(
            query.to_string(),
            metadata_json.to_string(),
            None,
        );

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_contains(&err, "metadata");
    }

    #[test]
    fn test_component_hydrate_results() {
        let rows_json = json!([
            { "id": 1, "name": "Alice" },
            { "id": 2, "name": "Bob" }
        ]);

        let metadata_json = json!({});
        let result = SuperJoinComponent::hydrate_results(
            rows_json.to_string(),
            metadata_json.to_string(),
        );

        assert!(result.is_ok());
        let parsed: serde_json::Value = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(parsed, rows_json);
    }
}
