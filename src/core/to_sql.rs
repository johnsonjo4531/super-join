use graphql_parser::{
    parse_query,
    query::{Definition, Document, OperationDefinition, Selection, Type, Value},
};
use sea_query::{GenericBuilder, SelectStatement};
use wasm_bindgen::JsValue;

use crate::core::{
    join_monster_schema::FnValue,
    schema::{
        AnyNode, AnyNodeRef, BuilderType, ExtendsNode, Field, JoinInfo, Node, Options,
        OrderDirection, Root,
    },
    shared_schema::{IRParseError, Join, JoinExpr, JoinType, SqlExpr},
    sql_schema::{SqlColumn, SqlJoin, SqlOrderDirection, SqlSelect},
};

fn resolve_node<'a>(any_node: &'a AnyNodeRef, root: &'a Root) -> Result<&'a Node, String> {
    match any_node {
        AnyNodeRef::AliasNode(node) => {
            let node = root
                .0
                .get(&node.extends)
                .ok_or(format!("Unable to resolve node"))?;
            Ok(node)
        }
        AnyNodeRef::Node(node) => Ok(node),
    }
}

fn resolve_extends_node<'a>(any_node: &'a AnyNodeRef) -> Option<&'a ExtendsNode> {
    match any_node {
        AnyNodeRef::AliasNode(node) => Some(node),
        AnyNodeRef::Node(_) => None,
    }
}

pub fn parse_gql(resolve_info: &str) -> Result<Document<&str>, String> {
    parse_query(resolve_info).map_err(|e| e.to_string())
}

pub fn build_sql_query(
    query: &str,
    metadata: Root,
    options: Option<Options>,
    context: JsValue,
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
                    let sql_ast = build_sql_ast(
                        // TODO: can I avoid this clone?
                        &AnyNodeRef::Node(&node.clone()),
                        root_field,
                        &metadata,
                        &context,
                    )?;
                    let sql = match options.map(|x| x.builder) {
                        Some(BuilderType::Postgres) => {
                            render_sql(&sql_ast, sea_query::PostgresQueryBuilder)
                        }
                        Some(BuilderType::MySql) => {
                            render_sql(&sql_ast, sea_query::MysqlQueryBuilder)
                        }
                        Some(BuilderType::Sqlite) => {
                            render_sql(&sql_ast, sea_query::SqliteQueryBuilder)
                        }
                        None => render_sql(&sql_ast, sea_query::PostgresQueryBuilder),
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

fn render_sql<T>(select: &SqlSelect, builder: T) -> String
where
    T: GenericBuilder,
{
    let select: SelectStatement = select.into();
    // Final SQL output
    let (sql, _params) = select.build(builder); // or MySqlQueryBuilder, etc.
    sql
}

fn build_sql_ast<'a>(
    any_node: &AnyNodeRef,
    field: &graphql_parser::query::Field<'a, &'a str>,
    root: &Root,
    context: &JsValue,
) -> Result<SqlSelect, String> {
    let mut columns = vec![];
    let mut joins = vec![];
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
                match &field_meta {
                    Field::Column(column) => {
                        columns.push(*column);
                    }
                    Field::Join(join_info) => {
                        let join_sql_ast = build_sql_ast(
                            &AnyNodeRef::AliasNode(&join_info.extends.clone()),
                            subfield,
                            root,
                            context,
                        )?;

                        let root_table_alias: JsValue = alias.into();
                        let other_table_alias = join_sql_ast.alias.into();
                        let arguments = js_sys::Array::new();
                        for value in field.arguments.iter() {
                            let value: JsValue = value_into_js_value(&value.1);
                            arguments.push(&value);
                        }
                        let arguments: JsValue = arguments.into();
                        let sql_ast_node = JsValue::null();
                        let value_array: [JsValue; 5] = [
                            root_table_alias,
                            other_table_alias,
                            arguments,
                            *context,
                            sql_ast_node,
                        ];

                        // Create an array of arguments
                        let args = js_sys::Array::new();
                        for value in value_array.iter() {
                            args.push(value);
                        }
                        // TODO: possibly add more join_types!
                        let join_type: JoinType = JoinType::LeftJoin;
                        let join_expr: String = match join_info.join {
                            JoinExpr::Fn(FnValue::Fn(js_function)) => {
                                let value = js_function.apply(&JsValue::null(), &args);

                                let value = match value {
                                    Ok(value) => Ok(value.as_string()),
                                    _ => Err(IRParseError::FnValueExpected),
                                };
                                let value = value.or(Err(IRParseError::ExpectedStringValue))?;
                                SqlExpr::Raw(value)
                            }
                            JoinExpr::Fn(FnValue::Value(value)) => SqlExpr::Raw(value.into()),
                            JoinExpr::Join(join) => {
                                join_type = join.kind;
                                join.on
                            }
                        };
                        let parsed_join = SqlExpr::Raw(join_expr.into());

                        joins.push(SqlJoin {
                            table: join_sql_ast.table,
                            alias: join_sql_ast.alias,
                            join: Join {
                                on: parsed_join,
                                kind: join_type,
                            },
                        });
                        for join in join_sql_ast.joins {
                            joins.push(join);
                        }
                        for column in join_sql_ast.columns {
                            columns.push(column);
                        }
                    }
                    Field::Where(_where) => {
                        where_clause = Some(SqlExpr::Raw(_where.clone().into()));
                    }
                    Field::Limit(_limit) => limit = Some(_limit.clone()),
                    Field::OrderBy(_order_by) => {
                        for _order_by in _order_by {
                            order_by.push(crate::core::sql_schema::SqlOrderBy {
                                expr: SqlExpr::Raw(_order_by.expr.column.clone().into()),
                                direction: match _order_by.direction {
                                    OrderDirection::Asc => SqlOrderDirection::Asc,
                                    OrderDirection::Desc => SqlOrderDirection::Desc,
                                },
                            });
                        }
                    }
                };
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

pub fn get_named_type(ty: &Type<'_, String>) -> Option<String> {
    match ty {
        Type::NamedType(name) => Some(name.to_string()),
        Type::ListType(inner) => get_named_type(inner),
        Type::NonNullType(inner) => get_named_type(inner),
    }
}

// pub fn hydrate_results(rows: String, _resolve_info: &str) -> Result<String, String> {
//     // This is a stub for now; real hydration would map flat rows to nested JSON.
//     Ok(rows)
// }
