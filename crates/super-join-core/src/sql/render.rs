//! Dialect-aware SQL text rendering.

use crate::error::{CompilerError, ErrorCode};
use crate::expression::{
    AggregateFunction, BooleanOperator, ComparisonOperator, IsNullOperator, Parameter, Value,
};
use crate::model::ScalarType;
use crate::relational::{ColumnRef, JoinType, OrderBySql, RelExpr, ScalarSubquery, SelectSource};
use crate::sql::dialect::Dialect;
use crate::sql::{ResultShapeKind, SqlColumn, SqlFrom, SqlQuery};

/// One bound parameter, in the order it appears in the rendered SQL.
#[derive(Debug, Clone)]
pub struct Param {
    pub value: Value,
    pub type_: ScalarType,
}

/// The final artifact: parameterized SQL plus ordered parameters and metadata.
#[derive(Debug, Clone)]
pub struct SqlArtifact {
    pub sql: String,
    pub parameters: Vec<Param>,
    pub dialect: Dialect,
    pub selected_fields: Vec<SqlColumn>,
    pub result_shape: crate::sql::ResultShape,
}

impl SqlArtifact {
    pub fn sql(&self) -> &str {
        &self.sql
    }

    pub fn parameters(&self) -> &[Param] {
        &self.parameters
    }
}

/// Renders the query. Parameters are appended in exactly the order their
/// placeholders appear in the SQL text.
pub fn render(query: &SqlQuery) -> Result<SqlArtifact, CompilerError> {
    let dialect = query.dialect;
    let mut params: Vec<Param> = Vec::new();
    let mut sql = String::new();

    // SELECT list
    sql.push_str("SELECT ");
    let mut cols: Vec<String> = Vec::with_capacity(query.columns.len());
    for c in &query.columns {
        cols.push(render_column(c, &dialect, &mut params)?);
    }
    let cols = cols;
    sql.push_str(&cols.join(", "));

    // FROM
    sql.push_str(" FROM ");
    sql.push_str(&render_table_ref(&query.from, &dialect));

    // JOINs
    for join in &query.joins {
        sql.push(' ');
        sql.push_str(&render_join(join, &dialect, &mut params)?);
    }

    // WHERE
    if !query.filters.is_empty() {
        let mut parts: Vec<String> = Vec::with_capacity(query.filters.len());
        for e in &query.filters {
            parts.push(render_expr(e, &dialect, &mut params)?);
        }
        sql.push_str(" WHERE ");
        sql.push_str(&parts.join(" AND "));
    }

    // ORDER BY
    if !query.order_by.is_empty() {
        let mut parts: Vec<String> = Vec::with_capacity(query.order_by.len());
        for (column, dir) in &query.order_by {
            parts.push(format!(
                "{} {}",
                render_column_ref(column, &dialect),
                match dir {
                    OrderBySql::Asc => "ASC",
                    OrderBySql::Desc => "DESC",
                }
            ));
        }
        sql.push_str(" ORDER BY ");
        sql.push_str(&parts.join(", "));
    }

    // LIMIT / OFFSET. These are compiler-supplied unsigned integers, not host
    // values, so they render as literals; dialects whose pagination syntax the
    // renderer does not implement must fail explicitly.
    if query.limit.is_some() || query.offset.is_some() {
        if dialect == Dialect::MsSql {
            return Err(CompilerError::new(
                ErrorCode::UnsupportedFeature,
                "LIMIT/OFFSET pagination is not implemented for the mssql dialect",
            ));
        }
        if let Some(limit) = query.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        }
        if let Some(offset) = query.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }
    }

    let selected_fields: Vec<SqlColumn> = query.columns.clone();
    let kind = if query.joins.is_empty() {
        ResultShapeKind::Flat
    } else {
        ResultShapeKind::Nested
    };
    let result_shape = crate::sql::ResultShape {
        kind,
        rows: selected_fields.clone(),
        nesting: query.nesting.clone(),
    };

    Ok(SqlArtifact {
        sql: sql.trim().to_string(),
        parameters: params,
        dialect,
        selected_fields,
        result_shape,
    })
}

fn render_column(col: &SqlColumn, dialect: &Dialect, params: &mut Vec<Param>) -> Result<String, CompilerError> {
    let source = match &col.source {
        SelectSource::Column(column) => render_column_ref(column, dialect),
        SelectSource::Scalar(subquery) => render_scalar_subquery(subquery, dialect, params)?,
    };
    Ok(format!("{} AS {}", source, quote_ident(&col.alias, dialect)))
}

/// Renders one scalar sub-select: `(SELECT <projection> FROM <table> AS <alias>
/// [WHERE <predicate>])`. Sub-selects only read model columns and correlated
/// parent columns; any parameter they carry is collected in SQL text order.
fn render_scalar_subquery(
    subquery: &ScalarSubquery,
    dialect: &Dialect,
    params: &mut Vec<Param>,
) -> Result<String, CompilerError> {
    let mut s = String::from("(SELECT ");
    s.push_str(&render_expr(&subquery.projection, dialect, params)?);
    let name = subquery
        .table
        .iter()
        .map(|c| quote_ident(c, dialect))
        .collect::<Vec<_>>()
        .join(".");
    s.push_str(&format!(
        " FROM {} AS {}",
        name,
        quote_ident(&subquery.alias, dialect)
    ));
    if let Some(pred) = &subquery.predicate {
        s.push_str(" WHERE ");
        s.push_str(&render_expr(pred, dialect, params)?);
    }
    s.push(')');
    Ok(s)
}

fn render_table_ref(r: &SqlFrom, dialect: &Dialect) -> String {
    let name = r
        .table
        .iter()
        .map(|c| quote_ident(c, dialect))
        .collect::<Vec<_>>()
        .join(".");
    format!("{} AS {}", name, quote_ident(&r.alias, dialect))
}

fn render_join(join: &crate::sql::JoinRef, dialect: &Dialect, params: &mut Vec<Param>) -> Result<String, CompilerError> {
    let join_type = match join.join_type {
        JoinType::Inner => "INNER JOIN",
        JoinType::LeftOuter => "LEFT OUTER JOIN",
    };
    let name = join
        .table
        .iter()
        .map(|c| quote_ident(c, dialect))
        .collect::<Vec<_>>()
        .join(".");
    let mut s = format!("{} {} AS {}", join_type, name, quote_ident(&join.alias, dialect));
    s.push_str(" ON ");
    s.push_str(&render_expr(&join.on, dialect, params)?);
    Ok(s)
}

fn render_expr(expr: &RelExpr, dialect: &Dialect, params: &mut Vec<Param>) -> Result<String, CompilerError> {
    let mut out = String::new();
    render_into(expr, dialect, params, &mut out)?;
    Ok(out)
}

fn render_into(
    expr: &RelExpr,
    dialect: &Dialect,
    params: &mut Vec<Param>,
    out: &mut String,
) -> Result<(), CompilerError> {
    match expr {
        RelExpr::Param(p) => render_parameter(p, dialect, params, out),
        RelExpr::Column(column) => out.push_str(&render_column_ref(column, dialect)),
        RelExpr::Compare {
            operator,
            left,
            right,
        } => {
            out.push('(');
            render_into(left, dialect, params, out)?;
            out.push(' ');
            out.push_str(cmp_sql(*operator));
            out.push(' ');
            render_into(right, dialect, params, out)?;
            out.push(')');
        }
        RelExpr::Boolean { operator, terms } => {
            let op = match operator {
                BooleanOperator::And => " AND ",
                BooleanOperator::Or => " OR ",
            };
            out.push('(');
            for (i, term) in terms.iter().enumerate() {
                if i > 0 {
                    out.push_str(op);
                }
                render_into(term, dialect, params, out)?;
            }
            out.push(')');
        }
        RelExpr::Not(inner) => {
            out.push_str("NOT (");
            render_into(inner, dialect, params, out)?;
            out.push(')');
        }
        RelExpr::IsNull { operator, term } => {
            let keyword = match operator {
                IsNullOperator::IsNull => "IS NULL",
                IsNullOperator::IsNotNull => "IS NOT NULL",
            };
            render_into(term, dialect, params, out)?;
            out.push(' ');
            out.push_str(keyword);
        }
        RelExpr::InList { term, values } => {
            if values.is_empty() {
                // Defined semantic for an empty membership list: constant false.
                out.push_str("(1 = 0)");
                return Ok(());
            }
            out.push('(');
            render_into(term, dialect, params, out)?;
            out.push_str(" IN (");
            for (i, v) in values.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                render_parameter(v, dialect, params, out);
            }
            out.push_str("))");
        }
        RelExpr::Aggregate { function, term } => {
            let name = match function {
                AggregateFunction::Count => "COUNT",
                AggregateFunction::Sum => "SUM",
                AggregateFunction::Min => "MIN",
                AggregateFunction::Max => "MAX",
                AggregateFunction::Avg => "AVG",
            };
            out.push_str(name);
            out.push('(');
            match term {
                Some(inner) => render_into(inner, dialect, params, out)?,
                None => out.push('*'),
            }
            out.push(')');
        }
    }
    Ok(())
}

fn render_parameter(p: &Parameter, dialect: &Dialect, params: &mut Vec<Param>, out: &mut String) {
    params.push(Param {
        value: p.value.clone(),
        type_: p.type_,
    });
    let n = params.len();
    out.push_str(&dialect.placeholder(n));
}

fn render_column_ref(column: &ColumnRef, dialect: &Dialect) -> String {
    let name = column
        .column
        .components
        .iter()
        .map(|c| quote_ident(c, dialect))
        .collect::<Vec<_>>()
        .join(".");
    format!(
        "{}.{}",
        quote_ident(&column.table_alias, dialect),
        name
    )
}

fn cmp_sql(op: ComparisonOperator) -> &'static str {
    match op {
        ComparisonOperator::Eq => "=",
        ComparisonOperator::Ne => "<>",
        ComparisonOperator::Lt => "<",
        ComparisonOperator::Lte => "<=",
        ComparisonOperator::Gt => ">",
        ComparisonOperator::Gte => ">=",
    }
}

fn quote_ident(component: &str, dialect: &Dialect) -> String {
    dialect.quote_ident(component)
}
