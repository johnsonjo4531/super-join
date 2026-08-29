//! Relational IR: a dialect-independent, flat plan describing how to read
//! rows. Produced by lowering a `SemanticQuery`; consumed by the SQL renderer.

pub mod plan;

pub use plan::{
    ColumnRef, JoinClause, JoinType, OrderBySql, RelColumn, RelExpr, RelationalPlan, TableRef,
};
