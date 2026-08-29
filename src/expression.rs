//! Expression model: a serializable, database-independent language produced by
//! frontend hooks and consumed by the compiler. It represents meaning, never
//! SQL syntax. Values become parameters; identifiers resolve to columns.

use crate::model::ScalarType;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(non_camel_case_types)]
pub enum ComparisonOperator {
    Eq,
    Ne,
    Lt,
    Lte,
    Gt,
    Gte,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BooleanOperator {
    And,
    Or,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IsNullOperator {
    IsNull,
    IsNotNull,
}

/// A runtime value bound as a SQL parameter.
#[derive(Debug, Clone)]
pub struct Parameter {
    pub value: Value,
    pub type_: ScalarType,
}

/// A scalar value supplied by a host. Values are always typed.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    I64(i64),
    F64(f64),
    Str(String),
    Bytes(Vec<u8>),
}

/// A recursive expression tree.
#[derive(Debug, Clone)]
pub enum Expression {
    Parameter(Parameter),
    Column(u64),
    ParentColumn { depth: u64, field: u64 },
    Compare {
        operator: ComparisonOperator,
        left: Box<Expression>,
        right: Box<Expression>,
    },
    Boolean {
        operator: BooleanOperator,
        terms: Vec<Expression>,
    },
    Not(Box<Expression>),
    IsNull {
        operator: IsNullOperator,
        term: Box<Expression>,
    },
    InList {
        term: Box<Expression>,
        values: Vec<Parameter>,
    },
}
