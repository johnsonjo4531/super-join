//! super-join turns GraphQL requests into SQL queries to solve the N+1 problem.
//!
//! Super-Join is a compiler: it produces SQL artifacts. It NEVER executes SQL —
//! the application owns the database driver, connections, and execution. The
//! Rust core compiles independently of Wasm/JS; the separate `super-join-component`
//! crate exposes this core to hosts through the versioned WIT boundary.
//!
//! Pipeline: request -> semantic IR -> relational IR -> SQL IR -> artifact.

pub mod compiler;
pub mod error;
pub mod expression;
pub mod model;
pub mod relational;
pub mod semantic;
pub mod sql;

pub use compiler::{build, Compiler};
pub use error::{CompilerError, CompilerResult, ErrorCode, SourceLocation};
pub use expression::{
    AggregateFunction, BooleanOperator, ComparisonOperator, Expression, IsNullOperator, Parameter,
    Value,
};
pub use model::{
    Cardinality, EntityMetadata, FieldMetadata, Identifier, Model, RelationMetadata, ScalarType,
    SelectSubquery,
};
pub use relational::{
    ColumnRef, JoinClause, JoinType, RelColumn, RelExpr, RelationalPlan, ScalarSubquery,
    SelectSource, TableRef,
};
pub use semantic::{SemanticQuery, Validator};
pub use sql::{
    Dialect, IdentityColumn, NestingLevel, Param, ResultShape, ResultShapeKind, SqlArtifact,
    SqlColumn, SqlQuery,
};

/// Convenience constructor for a compiler with default configuration.
pub fn compile(request: &CompilerRequest) -> Result<CompilerResult, CompilerError> {
    let dialect = request.dialect;
    let compiler = Compiler::new(dialect);
    compiler.compile(request)
}

/// The full request handed to the compiler.
#[derive(Debug, Clone)]
pub struct CompilerRequest {
    pub model: Model,
    pub root: crate::semantic::QueryNode,
    pub dialect: Dialect,
}
