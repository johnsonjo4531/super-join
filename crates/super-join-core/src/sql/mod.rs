//! SQL IR and rendering.
//!
//! The SQL IR is a dialect-aware but still structured representation immediately
//! before SQL text generation. The renderer walks it deterministically and
//! maintains a single parameter collector. Values are always emitted as
//! parameters; identifiers are quoted per-dialect, one component at a time.

pub mod dialect;
pub mod render;

pub use crate::relational::{ColumnRef, RelExpr, ScalarSubquery, SelectSource};
pub use dialect::Dialect;
pub use render::{Param, SqlArtifact};

use crate::model::ScalarType;
use crate::relational::OrderBySql;

/// A single SELECT column: an output alias plus its resolved physical source
/// (a table column or a scalar sub-select).
#[derive(Debug, Clone)]
pub struct SqlColumn {
    pub alias: String,
    pub field_id: u64,
    pub path: Vec<String>,
    pub source: SelectSource,
}

/// The FROM source.
#[derive(Debug, Clone)]
pub struct SqlFrom {
    pub alias: String,
    pub table: Vec<String>,
}

/// A single rendered parameter reference.
#[derive(Debug, Clone)]
pub struct SqlParam {
    pub value: crate::expression::Value,
    pub type_: ScalarType,
}

/// The structured SQL query produced from the relational plan.
#[derive(Debug, Clone)]
pub struct SqlQuery {
    pub columns: Vec<SqlColumn>,
    pub from: SqlFrom,
    pub joins: Vec<JoinRef>,
    pub filters: Vec<RelExpr>,
    pub order_by: Vec<(ColumnRef, OrderBySql)>,
    pub limit: Option<u64>,
    pub offset: Option<u64>,
    pub dialect: Dialect,
    pub nesting: Vec<NestingLevel>,
}

/// How selected rows correspond to the requested entities.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResultShapeKind {
    Flat,
    Nested,
    Json,
}

/// One identity (primary-key) column of an entity occurrence, as it appears in
/// a flattened row: the logical field and the output alias carrying its value.
#[derive(Debug, Clone)]
pub struct IdentityColumn {
    pub field_id: u64,
    pub alias: String,
}

/// One nested relation occurrence: which table aliases are joined, and which
/// selected columns carry the parent/child identity fields needed to regroup
/// flattened rows back into entities.
#[derive(Debug, Clone)]
pub struct NestingLevel {
    /// Relation path from the root selection (e.g. `["users", "posts"]`).
    pub path: Vec<String>,
    pub parent_alias: String,
    pub child_alias: String,
    pub parent_identity: Vec<IdentityColumn>,
    pub child_identity: Vec<IdentityColumn>,
}

/// Describes how result rows map to requested entities and nested fields.
#[derive(Debug, Clone)]
pub struct ResultShape {
    pub kind: ResultShapeKind,
    pub rows: Vec<SqlColumn>,
    /// One entry per nested relation occurrence (outermost parents first).
    /// Empty for flat artifacts.
    pub nesting: Vec<NestingLevel>,
}

#[derive(Debug, Clone)]
pub struct JoinRef {
    pub alias: String,
    pub table: Vec<String>,
    pub on: RelExpr,
    pub join_type: crate::relational::JoinType,
}

/// Builds the SQL IR from a relational plan. The plan is dialect-independent;
/// the resulting `SqlQuery` remains structured (not text).
pub fn build_sql_query(plan: &crate::relational::RelationalPlan, dialect: Dialect) -> SqlQuery {
    SqlQuery {
        columns: plan
            .columns
            .iter()
            .map(|c| SqlColumn {
                alias: c.alias.clone(),
                field_id: c.field_id,
                path: c.path.clone(),
                source: c.source.clone(),
            })
            .collect(),
        from: SqlFrom {
            alias: plan.from.alias.clone(),
            table: plan.from.table.clone(),
        },
        joins: plan
            .joins
            .iter()
            .map(|j| JoinRef {
                alias: j.table.alias.clone(),
                table: j.table.table.clone(),
                on: j.on.clone(),
                join_type: j.join_type,
            })
            .collect(),
        filters: plan.filters.clone(),
        order_by: plan.order_by.clone(),
        limit: plan.limit,
        offset: plan.offset,
        dialect,
        nesting: plan.nesting.clone(),
    }
}

/// Renders the SQL query to text plus ordered parameters.
pub fn render_query(query: &SqlQuery) -> Result<SqlArtifact, crate::error::CompilerError> {
    render::render(query)
}
