//! Semantic IR: the request tree describing what data the caller requested,
//! independently of relational execution strategy and SQL dialect.

pub mod resolve;

pub use resolve::Validator;

use crate::expression::Expression;

#[derive(Debug, Clone)]
pub enum OrderDirection {
    Asc,
    Desc,
}

#[derive(Debug, Clone)]
pub struct OrderBy {
    pub field: u64,
    pub direction: OrderDirection,
}

/// A selection is either a scalar field or a nested relation.
#[derive(Debug, Clone)]
pub enum Selection {
    Field {
        field: u64,
        output_key: String,
        path: Vec<String>,
    },
    Relation {
        relation: u64,
        output_key: String,
        query: QueryNode,
        path: Vec<String>,
    },
}

/// A query rooted at one entity with selections, filters, and pagination.
#[derive(Debug, Clone)]
pub struct QueryNode {
    pub entity: u64,
    pub selection: Vec<Selection>,
    pub predicate: Option<Expression>,
    pub order_by: Vec<OrderBy>,
    pub limit: Option<u64>,
    pub offset: Option<u64>,
    pub path: Vec<String>,
}

/// Resolved semantic view of a request after validation.
#[derive(Debug, Clone)]
pub struct SemanticQuery {
    pub root: ResolvedQueryNode,
}

#[derive(Debug, Clone)]
pub struct ResolvedQueryNode {
    pub entity_id: u64,
    pub alias: String,
    pub selection: Vec<ResolvedSelection>,
    pub predicate: Option<Expression>,
    pub order_by: Vec<OrderBy>,
    pub limit: Option<u64>,
    pub offset: Option<u64>,
    pub path: Vec<String>,
}

#[derive(Debug, Clone)]
pub enum ResolvedSelection {
    Field {
        entity_id: u64,
        field_id: u64,
        alias: String,
        path: Vec<String>,
    },
    Relation {
        relation_id: u64,
        entity_id: u64,
        alias: String,
        path: Vec<String>,
        query: ResolvedQueryNode,
    },
}
