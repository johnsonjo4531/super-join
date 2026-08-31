//! Integration tests for the Super-Join compiler pipeline.
//!
//! These exercises build a complete `CompilerRequest`, drive it through the
//! stages, and assert on the rendered, parameterized SQL artifact. They also
//! cover the validation error surface so the typed error contract is
//! exercised end to end.

use super_join_core::compile;
use super_join_core::error::{CompilerError, ErrorCode};
use super_join_core::model::{EntityMetadata, FieldMetadata, Identifier, Model, ScalarType};
use super_join_core::semantic::{OrderDirection, QueryNode, Selection};
use super_join_core::sql::{Dialect, SqlArtifact};

/// Builds a minimal but valid model: a `users` entity with id + name fields.
fn simple_model() -> Model {
    Model {
        entities: vec![EntityMetadata {
            id: 0,
            source: Identifier {
                components: vec!["public".to_string(), "users".to_string()],
            },
            fields: vec![
                FieldMetadata {
                    id: 0,
                    identifier: Identifier {
                        components: vec!["id".to_string()],
                    },
                    type_: ScalarType::Int64,
                    nullable: false,
                    selectable: true,
                    computed: None,
                },
                FieldMetadata {
                    id: 1,
                    identifier: Identifier {
                        components: vec!["name".to_string()],
                    },
                    type_: ScalarType::Int64,
                    nullable: false,
                    selectable: true,
                    computed: None,
                },
            ],
            relations: vec![],
            identity: vec![0],
        }],
    }
}

fn user_root_selection() -> Vec<Selection> {
    vec![
        Selection::Field {
            field: 0,
            output_key: "id".to_string(),
            path: vec!["id".to_string()],
        },
        Selection::Field {
            field: 1,
            output_key: "name".to_string(),
            path: vec!["name".to_string()],
        },
    ]
}

#[test]
fn compiles_simple_select_for_postgres() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let request = super_join_core::CompilerRequest {
        model: model.clone(),
        root,
        dialect: Dialect::Postgres,
    };

    let result = compile(&request).expect("compile should succeed");
    let sql = result.artifact.sql();

    // SELECT list, correctly quoted per Postgres dialect.
    assert!(
        sql.contains("\"id\"") && sql.contains("\"name\""),
        "expected quoted identifiers in: {sql}"
    );
    // FROM uses the dotted, quoted table reference.
    assert!(
        sql.contains("\"public\".\"users\""),
        "expected quoted table in: {sql}"
    );
    assert!(sql.trim_start().starts_with("SELECT"));

    assert_eq!(result.artifact.dialect, Dialect::Postgres);
}

#[test]
fn applies_where_predicate_as_parameter() {
    use super_join_core::expression::{Expression, Parameter};

    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: Some(Expression::Compare {
            operator: super_join_core::expression::ComparisonOperator::Eq,
            left: Box::new(Expression::Parameter(Parameter {
                value: super_join_core::expression::Value::I64(42),
                type_: ScalarType::Int64,
            })),
            right: Box::new(Expression::Parameter(Parameter {
                value: super_join_core::expression::Value::I64(1),
                type_: ScalarType::Int64,
            })),
        }),
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let request = super_join_core::CompilerRequest {
        model: model.clone(),
        root,
        dialect: Dialect::Postgres,
    };

    let result = compile(&request).expect("compile should succeed");
    let sql = result.artifact.sql();

    // Postgres uses `$n` placeholders.
    assert!(
        sql.contains("WHERE"),
        "expected WHERE clause in: {sql}"
    );
    assert!(
        sql.contains("$"),
        "expected a placeholder parameter in: {sql}"
    );

    // Two parameters were bound (both sides of the equality).
    let params = result.artifact.parameters();
    assert_eq!(params.len(), 2, "params: {params:?}");
    assert!(matches!(params[0].type_, ScalarType::Int64));
    assert!(matches!(params[1].type_, ScalarType::Int64));
}

#[test]
fn honors_limit_and_offset() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: None,
        order_by: vec![],
        limit: Some(10),
        offset: Some(5),
        path: vec![],
    };
    let request = super_join_core::CompilerRequest {
        model: model.clone(),
        root,
        dialect: Dialect::Sqlite,
    };

    let result = compile(&request).expect("compile should succeed");
    let sql = result.artifact.sql();

    assert!(sql.contains("LIMIT 10"), "sql: {sql}");
    assert!(sql.contains("OFFSET 5"), "sql: {sql}");
    assert_eq!(result.artifact.dialect, Dialect::Sqlite);
}

#[test]
fn orders_by_direction() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: None,
        order_by: vec![super_join_core::semantic::OrderBy {
            field: 1,
            direction: OrderDirection::Desc,
        }],
        limit: None,
        offset: None,
        path: vec![],
    };
    let request = super_join_core::CompilerRequest {
        model: model.clone(),
        root,
        dialect: Dialect::Postgres,
    };

    let result = compile(&request).expect("compile should succeed");
    let sql = result.artifact.sql();

    assert!(sql.contains("ORDER BY"), "sql: {sql}");
    assert!(sql.contains("DESC"), "expected DESC in: {sql}");
}

#[test]
fn rejects_when_no_columns_selected() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: vec![],
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let request = super_join_core::CompilerRequest {
        model: model.clone(),
        root,
        dialect: Dialect::Postgres,
    };

    match compile(&request) {
        Err(e) => assert_eq!(e.code, ErrorCode::InvalidRequest),
        Ok(_) => panic!("expected InvalidRequest error, got Ok"),
    }
}

#[test]
fn rejects_unknown_field() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        // Field id 99 does not exist on the users entity.
        selection: vec![Selection::Field {
            field: 99,
            output_key: "ghost".to_string(),
            path: vec!["ghost".to_string()],
        }],
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let request = super_join_core::CompilerRequest {
        model: model.clone(),
        root,
        dialect: Dialect::Postgres,
    };

    match compile(&request) {
        Err(e) => assert_eq!(e.code, ErrorCode::UnknownField),
        Ok(_) => panic!("expected UnknownField error, got Ok"),
    }
}

#[test]
fn rejects_unknown_entity() {
    let model = simple_model();
    let root = QueryNode {
        // Entity id 7 does not exist.
        entity: 7,
        selection: user_root_selection(),
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let request = super_join_core::CompilerRequest {
        model: model.clone(),
        root,
        dialect: Dialect::Postgres,
    };

    match compile(&request) {
        Err(e) => assert_eq!(e.code, ErrorCode::UnknownField),
        Ok(_) => panic!("expected UnknownField error, got Ok"),
    }
}

#[test]
fn errors_are_displayable() {
    let err = CompilerError::new(ErrorCode::UnsupportedDialect, "nope");
    let text = err.to_string();
    assert!(text.contains("unsupported-dialect"), "text: {text}");
}

#[test]
fn artifact_is_self_contained_and_serializable() {
    // A successful artifact must carry everything a downstream driver needs:
    // parameterized SQL, ordered parameters, dialect, and field metadata.
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let request = super_join_core::CompilerRequest {
        model: model.clone(),
        root,
        dialect: Dialect::Postgres,
    };

    let artifact: SqlArtifact = compile(&request).unwrap().artifact;
    assert!(!artifact.sql().is_empty());
    assert!(!artifact.selected_fields.is_empty());
    // The number of placeholders in the SQL matches the ordered parameters.
    let placeholders = artifact.sql().matches('$').count();
    assert!(
        placeholders == artifact.parameters().len(),
        "placeholders {placeholders} != params {}",
        artifact.parameters().len()
    );
}

// ---------------------------------------------------------------------------
// Required initial test matrix additions
// ---------------------------------------------------------------------------

use super_join_core::expression::{ComparisonOperator, Expression, IsNullOperator, Parameter, Value};

/// Model: users(id 0, name 1) -> posts(id 10, authorId 11, title 12).
fn blog_model() -> Model {
    let field = |id: u64, name: &str| FieldMetadata {
        id,
        identifier: Identifier { components: vec![name.to_string()] },
        type_: ScalarType::Int64,
        nullable: false,
        selectable: true,
        computed: None,
    };
    Model {
        entities: vec![
            EntityMetadata {
                id: 0,
                source: Identifier { components: vec!["public".to_string(), "users".to_string()] },
                fields: vec![field(0, "id"), field(1, "name")],
                relations: vec![super_join_core::model::RelationMetadata {
                    id: 100,
                    target: 1,
                    cardinality: super_join_core::model::Cardinality::Many,
                    join: Expression::Compare {
                        operator: ComparisonOperator::Eq,
                        left: Box::new(Expression::Column(11)),
                        right: Box::new(Expression::ParentColumn { depth: 1, field: 0 }),
                    },
                }],
                identity: vec![0],
            },
            EntityMetadata {
                id: 1,
                source: Identifier { components: vec!["public".to_string(), "posts".to_string()] },
                fields: vec![field(10, "id"), field(11, "author_id"), field(12, "title")],
                relations: vec![],
                identity: vec![10],
            },
        ],
    }
}

fn param(v: i64) -> Expression {
    Expression::Parameter(Parameter { value: Value::I64(v), type_: ScalarType::Int64 })
}

#[test]
fn exact_sql_for_simple_select() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres })
        .expect("compile should succeed")
        .artifact;
    assert_eq!(
        artifact.sql(),
        "SELECT \"users\".\"id\" AS \"id\", \"users\".\"name\" AS \"name\" FROM \"public\".\"users\" AS \"users\""
    );
}

#[test]
fn compiles_one_level_relation_as_left_join() {
    let model = blog_model();
    let root = QueryNode {
        entity: 0,
        selection: vec![
            Selection::Field { field: 0, output_key: "id".to_string(), path: vec!["id".to_string()] },
            Selection::Relation {
                relation: 100,
                output_key: "posts".to_string(),
                query: QueryNode {
                    entity: 1,
                    selection: vec![
                        Selection::Field { field: 10, output_key: "posts__id".to_string(), path: vec!["posts".to_string(), "id".to_string()] },
                        Selection::Field { field: 12, output_key: "posts__title".to_string(), path: vec!["posts".to_string(), "title".to_string()] },
                    ],
                    predicate: None,
                    order_by: vec![],
                    limit: None,
                    offset: None,
                    path: vec!["posts".to_string()],
                },
                path: vec!["posts".to_string()],
            },
        ],
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres })
        .expect("compile should succeed")
        .artifact;
    assert_eq!(
        artifact.sql(),
        "SELECT \"users\".\"id\" AS \"id\", \"posts\".\"id\" AS \"posts__id\", \"posts\".\"title\" AS \"posts__title\" \
         FROM \"public\".\"users\" AS \"users\" \
         LEFT OUTER JOIN \"public\".\"posts\" AS \"posts\" ON (\"posts\".\"author_id\" = \"users\".\"id\")"
    );
    assert_eq!(artifact.result_shape.kind, super_join_core::sql::ResultShapeKind::Nested);
}

#[test]
fn nested_predicate_is_folded_into_the_join() {
    let model = blog_model();
    let root = QueryNode {
        entity: 0,
        selection: vec![Selection::Relation {
            relation: 100,
            output_key: "posts".to_string(),
            query: QueryNode {
                entity: 1,
                selection: vec![Selection::Field { field: 12, output_key: "t".to_string(), path: vec![] }],
                predicate: Some(Expression::Compare {
                    operator: ComparisonOperator::Eq,
                    left: Box::new(Expression::Column(12)),
                    right: Box::new(param(7)),
                }),
                order_by: vec![],
                limit: None,
                offset: None,
                path: vec!["posts".to_string()],
            },
            path: vec!["posts".to_string()],
        }],
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres })
        .expect("compile should succeed")
        .artifact;
    // The nested filter must appear in the ON clause (not WHERE) and bind $1.
    assert!(
        artifact.sql().contains("ON ((\"posts\".\"author_id\" = \"users\".\"id\") AND (\"posts\".\"title\" = $1))"),
        "sql: {}",
        artifact.sql()
    );
    assert_eq!(artifact.parameters().len(), 1);
}

#[test]
fn rejects_nested_relation_pagination() {
    let model = blog_model();
    let root = QueryNode {
        entity: 0,
        selection: vec![Selection::Relation {
            relation: 100,
            output_key: "posts".to_string(),
            query: QueryNode {
                entity: 1,
                selection: vec![Selection::Field { field: 12, output_key: "t".to_string(), path: vec![] }],
                predicate: None,
                order_by: vec![],
                limit: Some(5),
                offset: None,
                path: vec!["posts".to_string()],
            },
            path: vec!["posts".to_string()],
        }],
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    match compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres }) {
        Err(e) => assert_eq!(e.code, ErrorCode::UnsupportedFeature),
        Ok(_) => panic!("expected UnsupportedFeature for nested limit"),
    }
}

#[test]
fn rejects_equality_against_null() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: Some(Expression::Compare {
            operator: ComparisonOperator::Eq,
            left: Box::new(Expression::Column(0)),
            right: Box::new(Expression::Parameter(Parameter { value: Value::Null, type_: ScalarType::Null })),
        }),
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    match compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres }) {
        Err(e) => assert_eq!(e.code, ErrorCode::InvalidExpression),
        Ok(_) => panic!("expected InvalidExpression for null equality"),
    }
}

#[test]
fn renders_null_test_predicate() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: Some(Expression::IsNull {
            operator: IsNullOperator::IsNotNull,
            term: Box::new(Expression::Column(1)),
        }),
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres })
        .expect("compile should succeed")
        .artifact;
    assert!(artifact.sql().ends_with("WHERE \"users\".\"name\" IS NOT NULL"), "sql: {}", artifact.sql());
}

#[test]
fn empty_in_list_compiles_to_constant_false() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: Some(Expression::InList {
            term: Box::new(Expression::Column(0)),
            values: vec![],
        }),
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres })
        .expect("compile should succeed")
        .artifact;
    assert!(artifact.sql().contains("(1 = 0)"), "sql: {}", artifact.sql());
    assert_eq!(artifact.parameters().len(), 0);
}

#[test]
fn in_list_binds_parameters_in_order() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: Some(Expression::InList {
            term: Box::new(Expression::Column(0)),
            values: vec![
                Parameter { value: Value::I64(1), type_: ScalarType::Int64 },
                Parameter { value: Value::I64(2), type_: ScalarType::Int64 },
                Parameter { value: Value::I64(3), type_: ScalarType::Int64 },
            ],
        }),
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres })
        .expect("compile should succeed")
        .artifact;
    assert!(artifact.sql().contains("\"users\".\"id\" IN ($1, $2, $3)"), "sql: {}", artifact.sql());
    let values: Vec<i64> = artifact.parameters().iter().map(|p| match p.value { Value::I64(v) => v, _ => panic!("int") }).collect();
    assert_eq!(values, vec![1, 2, 3]);
}

#[test]
fn mysql_uses_question_placeholders_and_backtick_quotes() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: Some(Expression::Compare {
            operator: ComparisonOperator::Eq,
            left: Box::new(Expression::Column(0)),
            right: Box::new(param(42)),
        }),
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::MySQL })
        .expect("compile should succeed")
        .artifact;
    assert!(artifact.sql().contains("`users`.`id` = ?"), "sql: {}", artifact.sql());
    assert_eq!(artifact.parameters().len(), 1);
}

#[test]
fn mssql_pagination_is_an_unsupported_feature() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: None,
        order_by: vec![],
        limit: Some(10),
        offset: None,
        path: vec![],
    };
    match compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::MsSql }) {
        Err(e) => assert_eq!(e.code, ErrorCode::UnsupportedFeature),
        Ok(_) => panic!("expected UnsupportedFeature for mssql LIMIT"),
    }
}

#[test]
fn rejects_out_of_scope_column_in_predicate() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        // Field 12 belongs to posts, not users.
        predicate: Some(Expression::Compare {
            operator: ComparisonOperator::Eq,
            left: Box::new(Expression::Column(12)),
            right: Box::new(param(3)),
        }),
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    match compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres }) {
        Err(e) => assert_eq!(e.code, ErrorCode::InvalidExpression),
        Ok(_) => panic!("expected InvalidExpression for out-of-scope column"),
    }
}

#[test]
fn unknown_relation_is_rejected() {
    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: vec![Selection::Relation {
            relation: 999,
            output_key: "ghost".to_string(),
            query: QueryNode {
                entity: 0,
                selection: user_root_selection(),
                predicate: None,
                order_by: vec![],
                limit: None,
                offset: None,
                path: vec!["ghost".to_string()],
            },
            path: vec!["ghost".to_string()],
        }],
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    match compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres }) {
        Err(e) => assert_eq!(e.code, ErrorCode::UnknownRelation),
        Ok(_) => panic!("expected UnknownRelation"),
    }
}

#[test]
fn duplicate_entity_ids_are_rejected() {
    let mut model = simple_model();
    model.entities.push(model.entities[0].clone());
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    match compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres }) {
        Err(e) => assert_eq!(e.code, ErrorCode::InvalidModel),
        Ok(_) => panic!("expected InvalidModel for duplicate entity ids"),
    }
}

// ---------------------------------------------------------------------------
// Identity metadata and nested result-shape
// ---------------------------------------------------------------------------

/// A model whose target entity declares no identity, for the nesting rule.
fn blog_model_without_child_identity() -> Model {
    let mut model = blog_model();
    model.entities[1].identity = vec![];
    model
}

fn one_level_relation_root() -> QueryNode {
    QueryNode {
        entity: 0,
        selection: vec![
            Selection::Field { field: 0, output_key: "id".to_string(), path: vec!["id".to_string()] },
            Selection::Relation {
                relation: 100,
                output_key: "posts".to_string(),
                query: QueryNode {
                    entity: 1,
                    selection: vec![Selection::Field {
                        field: 12,
                        output_key: "posts__title".to_string(),
                        path: vec!["posts".to_string(), "title".to_string()],
                    }],
                    predicate: None,
                    order_by: vec![],
                    limit: None,
                    offset: None,
                    path: vec!["posts".to_string()],
                },
                path: vec!["posts".to_string()],
            },
        ],
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    }
}

#[test]
fn records_nesting_identity_metadata_in_result_shape() {
    let artifact = compile(&super_join_core::CompilerRequest {
        model: blog_model(),
        root: one_level_relation_root(),
        dialect: Dialect::Postgres,
    })
    .expect("compile should succeed")
    .artifact;

    assert_eq!(artifact.result_shape.kind, super_join_core::sql::ResultShapeKind::Nested);
    assert_eq!(artifact.result_shape.nesting.len(), 1);
    let level = &artifact.result_shape.nesting[0];
    assert_eq!(level.path, vec!["posts".to_string()]);
    assert_eq!(level.parent_alias, "users");
    assert_eq!(level.child_alias, "posts");
    // The caller selected both identity fields, so their aliases are reused.
    assert_eq!(level.parent_identity.len(), 1);
    assert_eq!((level.parent_identity[0].field_id, level.parent_identity[0].alias.as_str()), (0, "id"));
    assert_eq!(level.child_identity.len(), 1);
    // posts.id was not selected, so it is auto-selected with a namespaced alias.
    assert_eq!(
        (level.child_identity[0].field_id, level.child_identity[0].alias.as_str()),
        (10, "__sj_identity_posts_id")
    );
    assert!(
        artifact.sql().contains("\"posts\".\"id\" AS \"__sj_identity_posts_id\""),
        "sql: {}",
        artifact.sql()
    );
}

#[test]
fn reuses_caller_selected_identity_aliases() {
    let root = QueryNode {
        entity: 0,
        selection: vec![Selection::Relation {
            relation: 100,
            output_key: "posts".to_string(),
            query: QueryNode {
                entity: 1,
                selection: vec![Selection::Field {
                    field: 10,
                    output_key: "pid".to_string(),
                    path: vec!["posts".to_string(), "id".to_string()],
                }],
                predicate: None,
                order_by: vec![],
                limit: None,
                offset: None,
                path: vec!["posts".to_string()],
            },
            path: vec!["posts".to_string()],
        }],
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest {
        model: blog_model(),
        root,
        dialect: Dialect::Postgres,
    })
    .expect("compile should succeed")
    .artifact;

    let level = &artifact.result_shape.nesting[0];
    assert_eq!(level.child_identity[0].alias, "pid");
    // No extra identity column was added for posts.id.
    assert!(!artifact.sql().contains("__sj_identity_posts_id"), "sql: {}", artifact.sql());
}

#[test]
fn rejects_nested_relation_without_identity() {
    match compile(&super_join_core::CompilerRequest {
        model: blog_model_without_child_identity(),
        root: one_level_relation_root(),
        dialect: Dialect::Postgres,
    }) {
        Err(e) => assert_eq!(e.code, ErrorCode::InvalidModel),
        Ok(_) => panic!("expected InvalidModel for missing identity"),
    }
}

#[test]
fn rejects_identity_field_that_is_not_on_the_entity() {
    let mut model = simple_model();
    model.entities[0].identity = vec![99];
    match compile(&super_join_core::CompilerRequest {
        model,
        root: QueryNode {
            entity: 0,
            selection: user_root_selection(),
            predicate: None,
            order_by: vec![],
            limit: None,
            offset: None,
            path: vec![],
        },
        dialect: Dialect::Postgres,
    }) {
        Err(e) => assert_eq!(e.code, ErrorCode::InvalidModel),
        Ok(_) => panic!("expected InvalidModel for unknown identity field"),
    }
}

#[test]
fn flat_queries_do_not_require_identity() {
    let mut model = simple_model();
    model.entities[0].identity = vec![];
    let artifact = compile(&super_join_core::CompilerRequest {
        model,
        root: QueryNode {
            entity: 0,
            selection: user_root_selection(),
            predicate: None,
            order_by: vec![],
            limit: None,
            offset: None,
            path: vec![],
        },
        dialect: Dialect::Postgres,
    })
    .expect("flat compile should succeed without identity")
    .artifact;
    assert_eq!(artifact.result_shape.kind, super_join_core::sql::ResultShapeKind::Flat);
    assert!(artifact.result_shape.nesting.is_empty());
}

// ---------------------------------------------------------------------------
// Nested ordering (relation hooks / orderBy arguments on nested fields)
// ---------------------------------------------------------------------------

#[test]
fn nested_ordering_appends_child_order_by_after_the_parents() {
    let model = blog_model();
    let root = QueryNode {
        entity: 0,
        selection: vec![Selection::Relation {
            relation: 100,
            output_key: "posts".to_string(),
            query: QueryNode {
                entity: 1,
                selection: vec![Selection::Field {
                    field: 12,
                    output_key: "title".to_string(),
                    path: vec!["posts".to_string(), "title".to_string()],
                }],
                predicate: None,
                order_by: vec![super_join_core::semantic::OrderBy {
                    field: 12,
                    direction: OrderDirection::Desc,
                }],
                limit: None,
                offset: None,
                path: vec!["posts".to_string()],
            },
            path: vec!["posts".to_string()],
        }],
        predicate: None,
        order_by: vec![super_join_core::semantic::OrderBy {
            field: 1,
            direction: OrderDirection::Asc,
        }],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres })
        .expect("nested ordering should be supported")
        .artifact;
    // Parent ordering first, then the child's qualified by the child alias.
    assert!(
        artifact.sql().contains("ORDER BY \"users\".\"name\" ASC, \"posts\".\"title\" DESC"),
        "sql: {}",
        artifact.sql()
    );
}

// ---------------------------------------------------------------------------
// Computed fields: scalar SELECT expressions (e.g. COUNT sub-selects)
// ---------------------------------------------------------------------------

/// users(id 0, name 1, postCount computed = COUNT(*) of posts where author=users.id)
fn model_with_computed_count() -> Model {
    let mut model = blog_model();
    model.entities[0].fields.push(FieldMetadata {
        id: 5,
        identifier: Identifier { components: vec!["post_count".to_string()] },
        type_: ScalarType::Int64,
        nullable: false,
        selectable: true,
        computed: Some(super_join_core::model::SelectSubquery {
            entity: 1,
            projection: Expression::Aggregate {
                function: super_join_core::expression::AggregateFunction::Count,
                term: None,
            },
            predicate: Some(Expression::Compare {
                operator: ComparisonOperator::Eq,
                left: Box::new(Expression::Column(11)),
                right: Box::new(Expression::ParentColumn { depth: 1, field: 0 }),
            }),
        }),
    });
    model
}

#[test]
fn computed_field_renders_as_scalar_subselect() {
    let model = model_with_computed_count();
    let root = QueryNode {
        entity: 0,
        selection: vec![Selection::Field {
            field: 5,
            output_key: "postCount".to_string(),
            path: vec!["postCount".to_string()],
        }],
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres })
        .expect("computed field should compile")
        .artifact;
    assert_eq!(
        artifact.sql(),
        "SELECT (SELECT COUNT(*) FROM \"public\".\"posts\" AS \"__sj_sub_posts\" WHERE (\"__sj_sub_posts\".\"author_id\" = \"users\".\"id\")) AS \"postCount\" \
         FROM \"public\".\"users\" AS \"users\""
    );
}

#[test]
fn computed_field_max_projection_binds_parameters_in_order() {
    let mut model = blog_model();
    model.entities[0].fields.push(FieldMetadata {
        id: 5,
        identifier: Identifier { components: vec!["latest_post_id".to_string()] },
        type_: ScalarType::Int64,
        nullable: false,
        selectable: true,
        computed: Some(super_join_core::model::SelectSubquery {
            entity: 1,
            projection: Expression::Aggregate {
                function: super_join_core::expression::AggregateFunction::Max,
                term: Some(Box::new(Expression::Column(10))),
            },
            predicate: None,
        }),
    });
    let root = QueryNode {
        entity: 0,
        selection: vec![Selection::Field {
            field: 5,
            output_key: "latest".to_string(),
            path: vec!["latest".to_string()],
        }],
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres })
        .expect("computed max should compile")
        .artifact;
    assert!(
        artifact.sql().contains("(SELECT MAX(\"__sj_sub_posts\".\"id\") FROM \"public\".\"posts\" AS \"__sj_sub_posts\")"),
        "sql: {}",
        artifact.sql()
    );
}

#[test]
fn computed_field_referencing_unknown_entity_is_rejected() {
    let mut model = simple_model();
    model.entities[0].fields.push(FieldMetadata {
        id: 5,
        identifier: Identifier { components: vec!["ghost_count".to_string()] },
        type_: ScalarType::Int64,
        nullable: false,
        selectable: true,
        computed: Some(super_join_core::model::SelectSubquery {
            entity: 99,
            projection: Expression::Aggregate {
                function: super_join_core::expression::AggregateFunction::Count,
                term: None,
            },
            predicate: None,
        }),
    });
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    match compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres }) {
        Err(e) => assert_eq!(e.code, ErrorCode::InvalidModel),
        Ok(_) => panic!("expected InvalidModel for unknown computed source"),
    }
}

#[test]
fn computed_identity_field_is_rejected() {
    let mut model = simple_model();
    model.entities[0].fields.push(FieldMetadata {
        id: 5,
        identifier: Identifier { components: vec!["seq".to_string()] },
        type_: ScalarType::Int64,
        nullable: false,
        selectable: true,
        computed: Some(super_join_core::model::SelectSubquery {
            entity: 0,
            projection: Expression::Aggregate {
                function: super_join_core::expression::AggregateFunction::Count,
                term: None,
            },
            predicate: None,
        }),
    });
    model.entities[0].identity = vec![5];
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    match compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres }) {
        Err(e) => assert_eq!(e.code, ErrorCode::InvalidModel),
        Ok(_) => panic!("expected InvalidModel for computed identity field"),
    }
}

// ---------------------------------------------------------------------------
// Alias disambiguation
// ---------------------------------------------------------------------------

#[test]
fn duplicate_output_aliases_are_renamed_not_rejected() {
    // users.id AS id joined with posts.id AS id: both requested under one name.
    let model = blog_model();
    let root = QueryNode {
        entity: 0,
        selection: vec![
            Selection::Field { field: 0, output_key: "id".to_string(), path: vec!["id".to_string()] },
            Selection::Relation {
                relation: 100,
                output_key: "posts".to_string(),
                query: QueryNode {
                    entity: 1,
                    selection: vec![Selection::Field {
                        field: 10,
                        output_key: "id".to_string(),
                        path: vec!["posts".to_string(), "id".to_string()],
                    }],
                    predicate: None,
                    order_by: vec![],
                    limit: None,
                    offset: None,
                    path: vec!["posts".to_string()],
                },
                path: vec!["posts".to_string()],
            },
        ],
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres })
        .expect("same-named fields must not conflict")
        .artifact;
    // First occurrence keeps `id`; the later one is path-qualified.
    assert!(artifact.sql().contains("\"users\".\"id\" AS \"id\""), "sql: {}", artifact.sql());
    assert!(artifact.sql().contains("AS \"posts_id\""), "sql: {}", artifact.sql());
    // Identity metadata follows the renamed alias.
    let level = &artifact.result_shape.nesting[0];
    assert_eq!(level.child_identity[0].alias, "posts_id");
}

#[test]
fn duplicate_table_aliases_get_numeric_suffixes() {
    // Two relations from users to posts both aliased `items`.
    let mut model = blog_model();
    model.entities[0].relations.push(super_join_core::model::RelationMetadata {
        id: 101,
        target: 1,
        cardinality: super_join_core::model::Cardinality::Many,
        join: Expression::Compare {
            operator: ComparisonOperator::Eq,
            left: Box::new(Expression::Column(12)),
            right: Box::new(Expression::ParentColumn { depth: 1, field: 1 }),
        },
    });
    let nested = |rel: u64| Selection::Relation {
        relation: rel,
        output_key: "items".to_string(),
        query: QueryNode {
            entity: 1,
            selection: vec![Selection::Field { field: 12, output_key: format!("t{rel}"), path: vec![] }],
            predicate: None,
            order_by: vec![],
            limit: None,
            offset: None,
            path: vec!["items".to_string()],
        },
        path: vec!["items".to_string()],
    };
    let root = QueryNode {
        entity: 0,
        selection: vec![nested(100), nested(101)],
        predicate: None,
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let artifact = compile(&super_join_core::CompilerRequest { model, root, dialect: Dialect::Postgres })
        .expect("duplicate relation names must not conflict")
        .artifact;
    assert!(artifact.sql().contains("AS \"items\""), "sql: {}", artifact.sql());
    assert!(artifact.sql().contains("AS \"items_1\""), "sql: {}", artifact.sql());
}
