use graphql_parser::parse_query;
use graphql_parser::query::{Definition, Document, Field, OperationDefinition, Selection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Deserialize, Debug)]
pub struct SchemaMetadata {
    pub root_type: String,
    pub types: HashMap<String, HashMap<String, FieldMetadata>>,
}

#[derive(Deserialize, Debug)]
pub struct FieldMetadata {
    pub column: Option<String>,
    pub join: Option<JoinInfo>,
}

#[derive(Deserialize, Debug)]
pub struct JoinInfo {
    pub table: String,
    pub on_condition: String,
    pub target_type: String, // e.g., "Post" or "Comment"
}

#[derive(Debug, Serialize)]
pub struct SqlColumn {
    pub name: String,
    pub alias: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SqlJoin {
    pub table: String,
    pub on: String,
    pub columns: Vec<SqlColumn>,
    pub joins: Vec<SqlJoin>,
}

#[derive(Debug, Serialize)]
pub struct SqlSelect {
    pub table: String,
    pub columns: Vec<SqlColumn>,
    pub joins: Vec<SqlJoin>,
}

pub fn build_sql_query(resolve_info: &str, metadata_json: &str) -> Result<String, String> {
    let doc: Document<&str> = parse_query(resolve_info).map_err(|e| e.to_string())?;
    let metadata: SchemaMetadata =
        serde_json::from_str(metadata_json).map_err(|e| e.to_string())?;

    if let Some(selection) = doc.definitions.first() {
        if let Definition::Operation(op) = selection {
            if let OperationDefinition::SelectionSet(selection_set) = op {
                if let Some(Selection::Field(root_field)) = selection_set.items.first() {
                    let sql_ast = build_sql_ast(&metadata.root_type, root_field, &metadata);
                    let sql = render_sql(&sql_ast, None);
                    return Ok(sql);
                }
            }
        }
    }

    Err(String::from(
        "Invalid query structure must have a query definition in query",
    ))
}

fn render_sql(select: &SqlSelect, alias: Option<&str>) -> String {
    let alias = alias.unwrap_or(&select.table);
    let mut sql = format!("SELECT ");

    let mut column_exprs: Vec<String> = select
        .columns
        .iter()
        .map(|col| format!("{}.{}", alias, col.name))
        .collect();

    for join in &select.joins {
        for col in &join.columns {
            column_exprs.push(format!("{}.{}", join.table, col.name));
        }
    }

    sql += &column_exprs.join(", ");
    sql += &format!("\nFROM {} AS {}", select.table, alias);

    for join in &select.joins {
        sql += &format!("\nLEFT JOIN {} ON {}", join.table, join.on);
    }

    sql
}

fn build_sql_ast<'a>(
    gql_type: &str,
    field: &Field<'a, &'a str>,
    metadata: &SchemaMetadata,
) -> SqlSelect {
    let mut columns = vec![];
    let mut joins = vec![];

    if let Some(fields) = metadata.types.get(gql_type) {
        for sel in &field.selection_set.items {
            if let Selection::Field(subfield) = sel {
                if let Some(field_meta) = fields.get(subfield.name) {
                    if let Some(column) = &field_meta.column {
                        columns.push(SqlColumn {
                            name: column.clone(),
                            alias: None,
                        });
                    } else if let Some(join_info) = &field_meta.join {
                        let join_sql_ast =
                            build_sql_ast(&join_info.target_type, subfield, metadata);
                        joins.push(SqlJoin {
                            table: join_info.table.clone(),
                            on: join_info.on_condition.clone(),
                            columns: join_sql_ast.columns,
                            joins: join_sql_ast.joins,
                        });
                    }
                }
            }
        }
    }

    SqlSelect {
        table: "users".into(),
        columns,
        joins,
    }
}

#[wasm_bindgen]
pub fn hydrate_results(rows: String, _resolve_info: &str) -> Result<String, String> {
    // This is a stub for now; real hydration would map flat rows to nested JSON.
    Ok(rows)
}
