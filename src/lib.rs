mod core;
pub mod wasm;

#[cfg(test)]
mod tests {

    use crate::core::{FieldMetadata, Fields, JoinInfo, SchemaMetadata, build_sql_query};

    macro_rules! hm {
        ($( $key:expr => $val:expr ),* $(,)?) => {{
            let mut map = std::collections::HashMap::new();
            $( map.insert($key.into(), $val); )*
            map
        }};
    }

    #[test]
    fn test_build_sql_query_1() {
        let query = "{ posts { title author } users {foo bar} }";

        let post = Fields {
            field_name: String::from("posts"),
            table: String::from("posts"),
            fields: hm! {
                "title" => FieldMetadata { column: Some("title".into()), join: None },
                "author" => FieldMetadata { column: Some("author".into()), join: None },
            },
        };

        let metadata = SchemaMetadata {
            types: hm! {
                "Post" => post
            },
        };

        let sql = build_sql_query(query, metadata).unwrap();

        assert!(sql.contains("SELECT"));
        assert!(sql.contains("posts.title"));
        assert!(sql.contains("posts.author"));
        assert!(!sql.contains("JOIN"));
        assert!(!sql.contains("user"));
    }

    #[test]
    fn test_build_sql_query_2() {
        let query = "{ user { posts { title author } } posts { foo bar } }";

        let user = Fields {
            field_name: String::from("user"),
            table: String::from("users"),
            fields: hm! {
                "id" => FieldMetadata {
                    column: Some(String::from("id")),
                    join: None
                },
                "name" => FieldMetadata { column: Some(String::from("name")), join: None },
                "posts" => FieldMetadata {
                    column: None,
                    join: Some(JoinInfo {
                        table: String::from("posts"),
                        on_clause: String::from("users.id = :post_author_id"),
                        root_type: String::from("Post"),
                    })
                }
            },
        };

        let post = Fields {
            field_name: String::from("posts"),
            table: String::from("posts"),
            fields: hm! {
                "title" => FieldMetadata { column: Some("title".into()), join: None },
                "author" => FieldMetadata { column: Some("author".into()), join: None },
            },
        };

        let metadata_json = SchemaMetadata {
            types: hm! {
                "User" => user,
                "Post" => post,
            },
        };

        let start = std::time::Instant::now();
        let sql = build_sql_query(query, metadata_json).unwrap();
        let duration = start.elapsed();
        panic!("Time elapsed: {:?}", duration);

        assert!(sql.contains("SELECT"));
        assert!(sql.contains("users.id"));
        assert!(sql.contains("posts.title"));
        assert!(sql.contains("posts.author"));
        assert!(sql.contains("LEFT JOIN posts"));
    }
}
