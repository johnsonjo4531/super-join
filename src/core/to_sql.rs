use std::sync::Arc;

use graphql_parser::{
    parse_query,
    query::{Definition, Document, OperationDefinition, Selection, Value},
};
use sea_query::{GenericBuilder, SelectStatement};
use wasm_bindgen::JsValue;

use crate::core::{
    join_monster_schema::FnValue,
    schema::{AnyNode, BuilderType, ExtendsNode, Field, Node, Options, OrderDirection, Root},
    shared_schema::{self, Column, ColumnRef, Join, JoinExpr, JoinType, SqlExpr, WithAlias},
    sql_schema::{SqlJoin, SqlOrderDirection, SqlSelect},
};

fn resolve_node<'a>(any_node: &'a AnyNode, root: &'a Root) -> Result<&'a Node, String> {
    match any_node {
        AnyNode::AliasNode(node) => {
            let node = root
                .0
                .get(&node.extends)
                .ok_or(format!("Unable to resolve node"))?;
            Ok(node)
        }
        AnyNode::Node(node) => Ok(node),
    }
}

fn resolve_extends_node<'a>(any_node: &'a AnyNode) -> Option<&'a ExtendsNode> {
    match any_node {
        AnyNode::AliasNode(node) => Some(node),
        AnyNode::Node(_) => None,
    }
}

pub fn parse_gql(resolve_info: &str) -> Result<Document<&str>, String> {
    parse_query(resolve_info).map_err(|e| e.to_string())
}

pub fn build_sql_query(
    query: &str,
    metadata: Root,
    context: Option<JsValue>,
    options: Option<Options>,
) -> Result<String, String> {
    let doc = parse_gql(query)?;

    if let Some(selection) = doc.definitions.first() {
        if let Definition::Operation(op) = selection {
            if let OperationDefinition::SelectionSet(selection_set) = op {
                if let Some(Selection::Field(root_field)) = selection_set.items.first() {
                    let node = metadata
                        .0
                        .values()
                        .find(|node| node.field_name == root_field.name)
                        .ok_or(format!(
                            "no such field with field_name = {} in nodes",
                            root_field.name
                        ))?;

                    let node = AnyNode::Node(node.clone());
                    let sql_ast = build_sql_ast(
                        // TODO: can I avoid this clone?
                        node, root_field, &metadata, &context,
                    )?;
                    let sql = match options.map(|x| x.builder) {
                        Some(BuilderType::Postgres) => {
                            render_sql(sql_ast, sea_query::PostgresQueryBuilder)
                        }
                        Some(BuilderType::MySql) => {
                            render_sql(sql_ast, sea_query::MysqlQueryBuilder)
                        }
                        Some(BuilderType::Sqlite) => {
                            render_sql(sql_ast, sea_query::SqliteQueryBuilder)
                        }
                        None => render_sql(sql_ast, sea_query::PostgresQueryBuilder),
                    };
                    return Ok(sql);
                }
            }
        }
    }

    Err(String::from(
        "Invalid query structure must have a query definition in query",
    ))
}

fn render_sql<T>(select: SqlSelect, builder: T) -> String
where
    T: GenericBuilder,
{
    let select: SelectStatement = select.into();
    // Final SQL output
    let (sql, _params) = select.build(builder); // or MySqlQueryBuilder, etc.
    sql
}

fn build_sql_ast<'a>(
    any_node: AnyNode,
    field: &'a graphql_parser::query::Field<'a, &'a str>,
    root: &'a Root,
    context: &'a Option<JsValue>,
) -> Result<SqlSelect, String> {
    let mut columns: Vec<shared_schema::Column> = vec![];
    let mut joins: Vec<SqlJoin> = vec![];
    let mut where_clause = None;
    let mut limit = None;
    let mut order_by = vec![];

    let aliased_node = resolve_extends_node(&any_node);
    let parent_node = resolve_node(&any_node, &root)?;
    let alias = match aliased_node {
        Some(node) => node.alias.clone(),
        None => parent_node.alias.clone(),
    };

    for sel in &field.selection_set.items {
        if let Selection::Field(subfield) = sel {
            if let Some(field_meta) = parent_node.fields.get(subfield.name) {
                let result: Result<(), String> = match &field_meta {
                    &Field::Column(column) => {
                        let col: Column = match column.clone() {
                            Column::Expr(WithAlias { alias: None, data }) => {
                                Column::Expr(WithAlias {
                                    alias: Some(alias.clone()),
                                    data,
                                })
                            }
                            Column::Data(ColumnRef {
                                alias: inner_alias,
                                column,
                                table,
                            }) => Column::Data(ColumnRef {
                                alias: inner_alias,
                                table: table.clone(),
                                column,
                            }),
                            _ => column.clone(),
                        };
                        columns.push(col.into());
                        Ok(())
                    }
                    &Field::Join(join_info) => {
                        let extends = join_info.extends.clone();
                        let node = AnyNode::AliasNode(Arc::new(extends));
                        let join_sql_ast = build_sql_ast(node, subfield, &root, &context)?;
                        // TODO: possibly add more join_types!
                        let mut join_type: JoinType = JoinType::LeftJoin;
                        let join_expr: Result<SqlExpr, String> = match &join_info.join {
                            JoinExpr::FromJs(shared_schema::Value {
                                value: FnValue::Func(js_function),
                            }) => match context {
                                Some(context) => {
                                    let root_table_alias: &JsValue = &alias.clone().into();
                                    let other_table_alias: JsValue =
                                        join_sql_ast.alias.clone().into();
                                    let arguments = js_sys::Array::new();
                                    for value in field.arguments.iter() {
                                        let value: &JsValue = &value_into_js_value(&value.1);
                                        arguments.push(value);
                                    }
                                    let arguments: &JsValue = &arguments.into();
                                    let sql_ast_node = &JsValue::null();
                                    let value_array: [&JsValue; 5] = [
                                        root_table_alias,
                                        &other_table_alias,
                                        arguments,
                                        &context,
                                        sql_ast_node,
                                    ];
                                    let args = js_sys::Array::new();
                                    for value in value_array.iter() {
                                        args.push(value);
                                    }
                                    let value = js_function
                                        .apply(&JsValue::null(), &args)
                                        .or(Err("Cannot call js_function..."))?;
                                    if let Some(str) = value.as_string() {
                                        Ok(SqlExpr::Raw(str.into()))
                                    } else {
                                        Err("Foo".into())
                                    }
                                }
                                None => Err("Bar".into()),
                            },
                            JoinExpr::FromJs(shared_schema::Value {
                                value: FnValue::Value(value),
                            }) => Ok(SqlExpr::Raw(shared_schema::Value {
                                value: value.clone(),
                            })),
                            JoinExpr::Join(join) => {
                                join_type = join.kind.clone();
                                Ok(join.on.clone())
                            }
                        };

                        let join_expr = join_expr?;

                        joins.push(SqlJoin {
                            table: join_sql_ast.table,
                            alias: join_sql_ast.alias,
                            join: Join {
                                on: join_expr,
                                kind: join_type,
                            },
                        });
                        for join in join_sql_ast.joins {
                            joins.push(join);
                        }
                        for column in join_sql_ast.columns {
                            columns.push(column);
                        }
                        Ok(())
                    }
                    &Field::Where(_where) => {
                        where_clause = Some(SqlExpr::Raw(_where.clone().into()));
                        Ok(())
                    }
                    Field::Limit(_limit) => {
                        limit = Some(_limit.clone());
                        Ok(())
                    }
                    &Field::OrderBy(_order_by) => {
                        for _order_by in _order_by {
                            order_by.push(crate::core::sql_schema::SqlOrderBy {
                                expr: SqlExpr::Raw(_order_by.expr.column.clone().into()),
                                direction: match _order_by.direction {
                                    OrderDirection::Asc => SqlOrderDirection::Asc,
                                    OrderDirection::Desc => SqlOrderDirection::Desc,
                                },
                            });
                        }
                        Ok(())
                    }
                };
                result?;
            }
        }
    }

    Ok(SqlSelect {
        table: parent_node.table.clone(),
        columns,
        joins,
        alias,
        limit,
        order_by,
        where_clause,
    })
}

pub fn value_into_js_value<'a>(value: &'a Value<&'a str>) -> JsValue {
    match value {
        Value::Variable(v) => JsValue::from_str(v.as_ref()),

        Value::Int(i) => match i.as_i64() {
            Some(n) => JsValue::from_f64(n as f64),
            None => js_sys::Number::NAN.into(),
        },

        Value::Float(f) => JsValue::from_f64(*f),

        Value::String(s) => JsValue::from_str(s.as_ref()),
        Value::Boolean(b) => JsValue::from_bool(*b),
        Value::Null => JsValue::NULL,
        Value::Enum(e) => JsValue::from_str(e.as_ref()),

        Value::List(l) => {
            let array = js_sys::Array::new();
            for item in l {
                array.push(&value_into_js_value(item));
            }
            array.into()
        }

        Value::Object(o) => {
            let obj = js_sys::Object::new();
            for (k, v) in o {
                let _ = js_sys::Reflect::set(
                    &obj,
                    &JsValue::from_str(k.as_ref()),
                    &value_into_js_value(v),
                );
            }
            obj.into()
        }
    }
}

// pub fn hydrate_results(rows: String, _resolve_info: &str) -> Result<String, String> {
//     // This is a stub for now; real hydration would map flat rows to nested JSON.
//     Ok(rows)
// }
