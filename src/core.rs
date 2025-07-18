use graphql_parser::parse_query;
use graphql_parser::query::{Definition, Document, Field, OperationDefinition, Selection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tsify::Tsify;
use wasm_bindgen::prelude::*;

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct SchemaMetadata {
    #[tsify(type = "Record<string, Fields>")]
    pub types: Types,
}

type Types = HashMap<String, Fields>;

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct Fields {
    /// The GraphQL Field Name!!
    pub field_name: String,
    /// The SQL table name
    pub table: String,
    /// Metadata about how to fetch the fields from SQL
    #[tsify(type = "Record<string, FieldMetadata>")]
    pub fields: HashMap<String, FieldMetadata>,
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct FieldMetadata {
    #[tsify(optional)]
    pub column: Option<String>,
    #[tsify(optional)]
    pub join: Option<JoinInfo>,
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct JoinInfo {
    pub table: String,
    pub on_clause: String,
    pub root_type: String, // e.g., "Post" or "Comment"
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

pub fn parse_gql(resolve_info: &str) -> Result<Document<&str>, String> {
    parse_query(resolve_info).map_err(|e| e.to_string())
}

pub fn build_sql_query(query: &str, metadata: SchemaMetadata) -> Result<String, String> {
    let doc = parse_gql(query)?;

    if let Some(selection) = doc.definitions.first() {
        if let Definition::Operation(op) = selection {
            if let OperationDefinition::SelectionSet(selection_set) = op {
                if let Some(Selection::Field(root_field)) = selection_set.items.first() {
                    let root_field_name = root_field.name;
                    let root_type = metadata
                        .types
                        .iter()
                        .find(|(_, type_meta)| type_meta.field_name == root_field_name)
                        .map(|(ty, _)| ty.clone());
                    if let Some(root_type) = root_type {
                        let sql_ast = build_sql_ast(root_type, root_field, &metadata)?;
                        let sql = render_sql(&sql_ast, None);
                        return Ok(sql);
                    }
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
    root_type: String,
    field: &Field<'a, &'a str>,
    metadata: &SchemaMetadata,
) -> Result<SqlSelect, String> {
    let mut columns = vec![];
    let mut joins = vec![];
    let types = &metadata.types;

    if let Some(inner_types) = types.get(&root_type) {
        for sel in &field.selection_set.items {
            if let Selection::Field(subfield) = sel {
                if let Some(field_meta) = inner_types.fields.get(subfield.name) {
                    if let Some(column) = &field_meta.column {
                        columns.push(SqlColumn {
                            name: column.clone(),
                            alias: None,
                        });
                    } else if let Some(join_info) = &field_meta.join {
                        let join_sql_ast =
                            build_sql_ast(join_info.root_type.clone(), subfield, &metadata)?;
                        joins.push(SqlJoin {
                            table: join_info.table.clone(),
                            on: join_info.on_clause.clone(),
                            columns: join_sql_ast.columns,
                            joins: join_sql_ast.joins,
                        });
                    }
                }
            }
        }

        Ok(SqlSelect {
            table: String::from(&inner_types.table),
            columns,
            joins,
        })
    } else {
        Err(format!("Type {} does not exist on Root", root_type))
    }
}

#[wasm_bindgen]
pub fn hydrate_results(rows: String, _resolve_info: &str) -> Result<String, String> {
    // This is a stub for now; real hydration would map flat rows to nested JSON.
    Ok(rows)
}
