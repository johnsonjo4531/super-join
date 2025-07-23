use sea_query::{Alias, Expr, Query, SelectStatement, SimpleExpr};
use serde::Serialize;

use crate::core::shared_schema::{Column, Join, SqlExpr};

#[derive(Debug, Serialize)]
pub struct SqlColumn {
    pub name: String,
    pub table: String,
    pub alias: String,
}

#[derive(Debug, Serialize)]
pub struct SqlJoin {
    pub table: String,
    pub alias: String,
    pub join: Join,
}

#[derive(Debug, Serialize)]
pub struct SqlSelect {
    pub table: String,
    pub alias: String,
    pub columns: Vec<Column>,
    pub joins: Vec<SqlJoin>,
    pub where_clause: Option<SqlExpr>,
    pub order_by: Vec<SqlOrderBy>,
    pub limit: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct SqlColumnRef {
    pub table: Option<String>,
    pub column: String,
}

#[derive(Debug, Serialize)]
pub struct SqlOrderBy {
    pub expr: SqlExpr,
    pub direction: SqlOrderDirection,
}

#[derive(Debug, Clone, Serialize)]
pub enum SqlOrderDirection {
    Asc,
    Desc,
}

impl From<&SqlSelect> for SelectStatement {
    fn from(ast: &SqlSelect) -> Self {
        let mut select = Query::select();

        // FROM "table" AS "alias"
        select.from_as(Alias::new(&ast.table), Alias::new(&ast.alias));

        // SELECT columns: "table"."column" AS "alias"
        for col in &ast.columns {
            let expr: SimpleExpr = match col {
                Column::Data(col) => match col.table {
                    Some(ref table) => {
                        Expr::column((Alias::new(table), Alias::new(col.column.clone())))
                    }
                    None => Expr::column(Alias::new(col.column.clone())),
                },
                Column::Expr(expr) => (&expr.data).into(),
            };
            // select.expr(expr);
            let alias = match col {
                Column::Expr(col) => &col.alias,
                Column::Data(col) => &col.alias,
            };

            match alias {
                Some(alias) => select.expr_as(expr, Alias::new(alias)),
                None => select.expr(expr),
            };
        }

        // JOINs
        for join in &ast.joins {
            let join_type: sea_query::JoinType = (&join.join.kind).into();
            let join_on: SimpleExpr = (&join.join.on).into();
            select.join_as(
                join_type,
                Alias::new(&join.table),
                Alias::new(&join.alias),
                join_on,
            );
        }

        select
    }
}
