use graphql_parser::parse_query;
use graphql_parser::query::{Definition, Document, Field, OperationDefinition, Selection};
use sea_query::{Alias, Expr, GenericBuilder, Query, QueryBuilder};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tsify::Tsify;
use wasm_bindgen::prelude::*;

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct Options {
    pub builder: SuperJoinBuilder,
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub enum SuperJoinBuilder {
    #[serde(rename = "postgres")]
    Postgres,
    #[serde(rename = "mysql")]
    MySql,
    #[serde(rename = "sqlite")]
    Sqlite,
}

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct SuperJoinRootInput(pub Vec<SuperJoinNode>);

#[derive(Tsify, Deserialize, Debug)]
#[tsify(from_wasm_abi)]
pub struct SuperJoinRoot(
    #[tsify(type = "Record<string, SuperJoinAnyNode>")] pub HashMap<String, SuperJoinNode>,
);

impl From<Vec<SuperJoinNode>> for SuperJoinRoot {
    fn from(values: Vec<SuperJoinNode>) -> Self {
        let mut map = std::collections::HashMap::new();
        for value in values {
            map.insert(value.alias.clone(), value);
        }
        SuperJoinRoot(map)
    }
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub enum SuperJoinAnyNode {
    #[serde(rename = "alias")]
    AliasNode(SuperJoinExtendsNode),
    #[serde(rename = "node")]
    Node(SuperJoinNode),
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct SuperJoinExtendsNode {
    pub alias: String,
    pub field_name: String,
    /// The alias this node extends
    pub extends: String,
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct SuperJoinNode {
    /// The SuperJoin Identifier and SQL alias.
    pub alias: String,
    /// The GraphQL Field Name!
    pub field_name: String,
    /// The SQL table name
    pub table: String,
    /// Metadata about how to fetch the fields from SQL
    #[tsify(type = "Record<string, FieldMetadata>")]
    pub fields: HashMap<String, FieldMetadata>,
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
#[serde(tag = "kind")]
pub enum FieldMetadata {
    #[serde(rename = "column")]
    Column(ColumnInfo),
    #[serde(rename = "join")]
    Join(JoinInfo),
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct ColumnInfo {
    pub column: String,
}

impl From<String> for ColumnInfo {
    fn from(column: String) -> Self {
        ColumnInfo { column }
    }
}

impl From<&str> for ColumnInfo {
    fn from(column: &str) -> Self {
        String::from(column).into()
    }
}

#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
pub struct JoinInfo {
    pub on_clause: String,
    /// The id of a root type
    pub extends: SuperJoinExtendsNode,
}

/// TODO ADD THIS TO THE JOININFO!
#[derive(Tsify, Deserialize, Clone, Debug)]
#[tsify(from_wasm_abi)]
#[serde(tag = "kind")]
pub enum JoinType {
    #[serde(rename = "on")]
    On(String),
    #[serde(rename = "join")]
    Join(JoinInfo),
}

#[derive(Debug, Serialize)]
pub struct SqlColumn {
    pub name: String,
    pub table: String,
    pub alias: String,
}

#[derive(Debug, Serialize)]
pub struct SqlJoin {
    pub table: String,
    pub on: String,
    pub alias: String,
}

#[derive(Debug, Serialize)]
pub struct SqlSelect {
    // pub arguments: Option<>,
    pub table: String,
    pub alias: String,
    pub columns: Vec<SqlColumn>,
    pub joins: Vec<SqlJoin>,
}

fn resolve_node<'a>(
    any_node: &'a SuperJoinAnyNode,
    root: &'a SuperJoinRoot,
) -> Result<&'a SuperJoinNode, String> {
    match any_node {
        SuperJoinAnyNode::AliasNode(node) => {
            let node = root
                .0
                .get(&node.extends)
                .ok_or(format!("Unable to resolve node"))?;
            Ok(node)
        }
        SuperJoinAnyNode::Node(node) => Ok(node),
    }
}

fn resolve_extends_node(any_node: &SuperJoinAnyNode) -> Option<&SuperJoinExtendsNode> {
    match any_node {
        SuperJoinAnyNode::AliasNode(node) => Some(&node),
        SuperJoinAnyNode::Node(_) => None,
    }
}

pub fn parse_gql(resolve_info: &str) -> Result<Document<&str>, String> {
    parse_query(resolve_info).map_err(|e| e.to_string())
}

pub fn build_sql_query(
    query: &str,
    metadata: SuperJoinRoot,
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
                    let sql_ast = build_sql_ast(
                        // TODO: can I avoid this clone?
                        &SuperJoinAnyNode::Node(node.clone()),
                        root_field,
                        &metadata,
                    )?;
                    let sql = match options.map(|x| x.builder) {
                        Some(SuperJoinBuilder::Postgres) => {
                            render_sql(&sql_ast, sea_query::PostgresQueryBuilder)
                        }
                        Some(SuperJoinBuilder::MySql) => {
                            render_sql(&sql_ast, sea_query::MysqlQueryBuilder)
                        }
                        Some(SuperJoinBuilder::Sqlite) => {
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
    let mut stmt = Query::select();

    // FROM "table" AS "alias"
    stmt.from_as(Alias::new(&select.table), Alias::new(&select.alias));

    // SELECT columns: "table"."column" AS "alias"
    for col in &select.columns {
        let expr = Expr::col((Alias::new(&col.table), Alias::new(&col.name)));
        stmt.expr_as(expr, Alias::new(&col.alias));
    }

    // JOINs
    for join in &select.joins {
        stmt.join_as(
            sea_query::JoinType::LeftJoin,
            Alias::new(&join.table),
            Alias::new(&join.alias),
            Expr::cust(&join.on),
        );
    }

    // Final SQL output
    let (sql, _params) = stmt.build(builder); // or MySqlQueryBuilder, etc.
    sql
}

fn build_sql_ast<'a>(
    any_node: &SuperJoinAnyNode,
    field: &Field<'a, &'a str>,
    root: &SuperJoinRoot,
) -> Result<SqlSelect, String> {
    let mut columns = vec![];
    let mut joins = vec![];

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
                    FieldMetadata::Column(column) => {
                        let table = alias.clone();
                        columns.push(SqlColumn {
                            name: column.column.clone(),
                            table: table.clone(),
                            alias: format!("{}_{}", table, column.column),
                        });
                    }
                    FieldMetadata::Join(join_info) => {
                        let join_sql_ast = build_sql_ast(
                            &SuperJoinAnyNode::AliasNode(join_info.extends.clone()),
                            subfield,
                            root,
                        )?;
                        joins.push(SqlJoin {
                            table: join_sql_ast.table.clone(),
                            on: join_info.on_clause.clone(),
                            alias: join_sql_ast.alias.clone(),
                        });
                        for join in join_sql_ast.joins {
                            joins.push(join);
                        }
                        for column in join_sql_ast.columns {
                            columns.push(column);
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
    })
}

#[wasm_bindgen]
pub fn hydrate_results(rows: String, _resolve_info: &str) -> Result<String, String> {
    // This is a stub for now; real hydration would map flat rows to nested JSON.
    Ok(rows)
}
