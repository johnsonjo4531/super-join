//! Relational IR: a dialect-independent, flat plan describing how to read
//! rows. Produced by lowering a `SemanticQuery`; consumed by the SQL renderer.
//!
//! Expressions at this stage are already resolved against the model: every
//! column reference carries its physical table alias and column identifier, so
//! the renderer never has to guess which physical name a logical field means.

use crate::expression::{
    AggregateFunction, BooleanOperator, ComparisonOperator, IsNullOperator, Parameter,
};
use crate::model::Identifier;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JoinType {
    Inner,
    LeftOuter,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrderBySql {
    Asc,
    Desc,
}

/// A scanned or joined table occurrence.
#[derive(Debug, Clone)]
pub struct TableRef {
    pub alias: String,
    pub table: Vec<String>,
}

/// A resolved physical column reference: the table alias in this plan plus the
/// column identifier from the model.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ColumnRef {
    pub table_alias: String,
    pub column: Identifier,
}

/// A relational expression with every column already resolved to a physical
/// reference and every value kept as a parameter.
#[derive(Debug, Clone)]
pub enum RelExpr {
    Param(Parameter),
    Column(ColumnRef),
    Compare {
        operator: ComparisonOperator,
        left: Box<RelExpr>,
        right: Box<RelExpr>,
    },
    Boolean {
        operator: BooleanOperator,
        terms: Vec<RelExpr>,
    },
    Not(Box<RelExpr>),
    IsNull {
        operator: IsNullOperator,
        term: Box<RelExpr>,
    },
    InList {
        term: Box<RelExpr>,
        values: Vec<Parameter>,
    },
    /// SQL aggregate over one resolved term (`*` when `term` is `None`).
    Aggregate {
        function: AggregateFunction,
        term: Option<Box<RelExpr>>,
    },
}

#[derive(Debug, Clone)]
pub struct JoinClause {
    pub join_type: JoinType,
    pub table: TableRef,
    pub on: RelExpr,
}

/// A resolved scalar sub-select used as a SELECT source for a computed field:
/// `(SELECT projection FROM table AS alias [WHERE predicate])`.
#[derive(Debug, Clone)]
pub struct ScalarSubquery {
    pub alias: String,
    pub table: Vec<String>,
    pub projection: Box<RelExpr>,
    pub predicate: Option<Box<RelExpr>>,
}

/// The physical source of one projected output column.
#[derive(Debug, Clone)]
pub enum SelectSource {
    Column(ColumnRef),
    Scalar(ScalarSubquery),
}

/// One projected output column.
#[derive(Debug, Clone)]
pub struct RelColumn {
    pub alias: String,
    pub field_id: u64,
    pub path: Vec<String>,
    pub source: SelectSource,
}

/// The flat relational plan.
#[derive(Debug, Clone)]
pub struct RelationalPlan {
    pub from: TableRef,
    pub joins: Vec<JoinClause>,
    pub filters: Vec<RelExpr>,
    pub columns: Vec<RelColumn>,
    pub order_by: Vec<(ColumnRef, OrderBySql)>,
    pub limit: Option<u64>,
    pub offset: Option<u64>,
    /// Identity metadata for each nested relation occurrence, recorded while
    /// lowering so the artifact can describe how rows regroup into entities.
    pub nesting: Vec<crate::sql::NestingLevel>,
}
