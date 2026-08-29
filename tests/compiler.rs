//! Integration tests for the Super-Join compiler pipeline.
//!
//! These exercises build a complete `CompilerRequest`, drive it through the
//! stages, and assert on the rendered, parameterized SQL artifact. They also
//! cover the validation error surface so the typed error contract is
//! exercised end to end.

use super_join::compile;
use super_join::error::{CompilerError, ErrorCode};
use super_join::model::{EntityMetadata, FieldMetadata, Identifier, Model, ScalarType};
use super_join::semantic::{OrderDirection, QueryNode, Selection};
use super_join::sql::{Dialect, SqlArtifact};

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
                },
                FieldMetadata {
                    id: 1,
                    identifier: Identifier {
                        components: vec!["name".to_string()],
                    },
                    type_: ScalarType::Int64,
                    nullable: false,
                    selectable: true,
                },
            ],
            relations: vec![],
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
    let request = super_join::CompilerRequest {
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
    use super_join::expression::{Expression, Parameter};

    let model = simple_model();
    let root = QueryNode {
        entity: 0,
        selection: user_root_selection(),
        predicate: Some(Expression::Compare {
            operator: super_join::expression::ComparisonOperator::Eq,
            left: Box::new(Expression::Parameter(Parameter {
                value: super_join::expression::Value::I64(42),
                type_: ScalarType::Int64,
            })),
            right: Box::new(Expression::Parameter(Parameter {
                value: super_join::expression::Value::I64(1),
                type_: ScalarType::Int64,
            })),
        }),
        order_by: vec![],
        limit: None,
        offset: None,
        path: vec![],
    };
    let request = super_join::CompilerRequest {
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
    let request = super_join::CompilerRequest {
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
        order_by: vec![super_join::semantic::OrderBy {
            field: 1,
            direction: OrderDirection::Desc,
        }],
        limit: None,
        offset: None,
        path: vec![],
    };
    let request = super_join::CompilerRequest {
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
    let request = super_join::CompilerRequest {
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
    let request = super_join::CompilerRequest {
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
    let request = super_join::CompilerRequest {
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
    let request = super_join::CompilerRequest {
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

use super_join::expression::{ComparisonOperator, Expression, IsNullOperator, Parameter, Value};

/// Model: users(id 0, name 1) -> posts(id 10, authorId 11, title 12).
fn blog_model() -> Model {
    let field = |id: u64, name: &str| FieldMetadata {
        id,
        identifier: Identifier { components: vec![name.to_string()] },
        type_: ScalarType::Int64,
        nullable: false,
        selectable: true,
    };
    Model {
        entities: vec![
            EntityMetadata {
                id: 0,
                source: Identifier { components: vec!["public".to_string(), "users".to_string()] },
                fields: vec![field(0, "id"), field(1, "name")],
                relations: vec![super_join::model::RelationMetadata {
                    id: 100,
                    target: 1,
                    cardinality: super_join::model::Cardinality::Many,
                    join: Expression::Compare {
                        operator: ComparisonOperator::Eq,
                        left: Box::new(Expression::Column(11)),
                        right: Box::new(Expression::ParentColumn { depth: 1, field: 0 }),
                    },
                }],
            },
            EntityMetadata {
                id: 1,
                source: Identifier { components: vec!["public".to_string(), "posts".to_string()] },
                fields: vec![field(10, "id"), field(11, "author_id"), field(12, "title")],
                relations: vec![],
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
    let artifact = compile(&super_join::CompilerRequest { model, root, dialect: Dialect::Postgres })
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
    let artifact = compile(&super_join::CompilerRequest { model, root, dialect: Dialect::Postgres })
        .expect("compile should succeed")
        .artifact;
    assert_eq!(
        artifact.sql(),
        "SELECT \"users\".\"id\" AS \"id\", \"posts\".\"id\" AS \"posts__id\", \"posts\".\"title\" AS \"posts__title\" \
         FROM \"public\".\"users\" AS \"users\" \
         LEFT OUTER JOIN \"public\".\"posts\" AS \"posts\" ON (\"posts\".\"author_id\" = \"users\".\"id\")"
    );
    assert_eq!(artifact.result_shape.kind, super_join::sql::ResultShapeKind::Nested);
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
    let artifact = compile(&super_join::CompilerRequest { model, root, dialect: Dialect::Postgres })
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
    match compile(&super_join::CompilerRequest { model, root, dialect: Dialect::Postgres }) {
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
    match compile(&super_join::CompilerRequest { model, root, dialect: Dialect::Postgres }) {
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
    let artifact = compile(&super_join::CompilerRequest { model, root, dialect: Dialect::Postgres })
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
    let artifact = compile(&super_join::CompilerRequest { model, root, dialect: Dialect::Postgres })
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
    let artifact = compile(&super_join::CompilerRequest { model, root, dialect: Dialect::Postgres })
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
    let artifact = compile(&super_join::CompilerRequest { model, root, dialect: Dialect::MySQL })
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
    match compile(&super_join::CompilerRequest { model, root, dialect: Dialect::MsSql }) {
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
    match compile(&super_join::CompilerRequest { model, root, dialect: Dialect::Postgres }) {
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
    match compile(&super_join::CompilerRequest { model, root, dialect: Dialect::Postgres }) {
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
    match compile(&super_join::CompilerRequest { model, root, dialect: Dialect::Postgres }) {
        Err(e) => assert_eq!(e.code, ErrorCode::InvalidModel),
        Ok(_) => panic!("expected InvalidModel for duplicate entity ids"),
    }
}
