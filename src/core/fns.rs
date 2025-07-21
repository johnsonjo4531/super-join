use graphql_parser::{
    parse_query,
    query::{Definition, Document, OperationDefinition, Selection},
};
use sea_query::{GenericBuilder, SelectStatement};

use crate::core::{
    schema::{AnyNode, BuilderType, ExtendsNode, Field, Node, Options, OrderDirection, Root},
    shared_schema::SqlExpr,
    sql_schema::{SqlColumn, SqlJoin, SqlOrderDirection, SqlSelect},
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

fn resolve_extends_node(any_node: &AnyNode) -> Option<&ExtendsNode> {
    match any_node {
        AnyNode::AliasNode(node) => Some(&node),
        AnyNode::Node(_) => None,
    }
}

pub fn parse_gql(resolve_info: &str) -> Result<Document<&str>, String> {
    parse_query(resolve_info).map_err(|e| e.to_string())
}

pub fn build_sql_query(
    query: &str,
    metadata: Root,
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
                        &AnyNode::Node(node.clone()),
                        root_field,
                        &metadata,
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
    any_node: &AnyNode,
    field: &graphql_parser::query::Field<'a, &'a str>,
    root: &Root,
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
                        let table = alias.clone();
                        columns.push(SqlColumn {
                            name: column.column.clone(),
                            table: table.clone(),
                            alias: format!("{}_{}", table, column.column),
                        });
                    }
                    Field::Join(join_info) => {
                        let join_sql_ast = build_sql_ast(
                            &AnyNode::AliasNode(join_info.extends.clone()),
                            subfield,
                            root,
                        )?;
                        joins.push(SqlJoin {
                            table: join_sql_ast.table,
                            alias: join_sql_ast.alias,
                            join: join_info.join.clone(),
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
                        order_by.push(crate::core::sql_schema::SqlOrderBy {
                            expr: SqlExpr::Raw(_order_by.expr.column.clone().into()),
                            direction: match _order_by.direction {
                                OrderDirection::Asc => SqlOrderDirection::Asc,
                                OrderDirection::Desc => SqlOrderDirection::Desc,
                            },
                        });
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

// pub fn hydrate_results(rows: String, _resolve_info: &str) -> Result<String, String> {
//     // This is a stub for now; real hydration would map flat rows to nested JSON.
//     Ok(rows)
// }
