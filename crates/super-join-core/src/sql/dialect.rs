//! SQL dialect definitions and per-dialect quoting/placeholder behavior.

use crate::model::ScalarType;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dialect {
    Postgres,
    MySQL,
    Sqlite,
    MsSql,
}

impl Dialect {
    pub fn as_str(&self) -> &'static str {
        match self {
            Dialect::Postgres => "postgres",
            Dialect::MySQL => "mysql",
            Dialect::Sqlite => "sqlite",
            Dialect::MsSql => "mssql",
        }
    }

    /// Returns true if the dialect supports declaring a scalar type natively.
    /// Unsupported declarations yield an `unsupported-dialect` error at render.
    pub fn supports_scalar(&self, scalar: ScalarType) -> bool {
        match scalar {
            ScalarType::Null => false,
            ScalarType::Bool
            | ScalarType::Int8
            | ScalarType::Int16
            | ScalarType::Int32
            | ScalarType::Int64
            | ScalarType::Uint8
            | ScalarType::Uint16
            | ScalarType::Uint32
            | ScalarType::Uint64
            | ScalarType::Float32
            | ScalarType::Float64
            | ScalarType::Decimal
            | ScalarType::Date
            | ScalarType::Time
            | ScalarType::TimeTz
            | ScalarType::Timestamp
            | ScalarType::TimestampTz
            | ScalarType::Uuid
            | ScalarType::Jsonb => true,
        }
    }

    /// Quotes a single identifier component. Never quotes a whole dotted
    /// identifier as one component.
    pub fn quote_ident(&self, component: &str) -> String {
        match self {
            Dialect::Postgres | Dialect::Sqlite => {
                format!("\"{}\"", component.replace('"', "\"\""))
            }
            Dialect::MsSql => format!("[{}]", component.replace(']', "]]")),
            Dialect::MySQL => format!("`{}`", component.replace('`', "``")),
        }
    }

    /// Placeholder syntax for the n-th bound parameter (1-based). Rendering a
    /// value always yields exactly one placeholder and one collected parameter.
    pub fn placeholder(&self, n: usize) -> String {
        match self {
            Dialect::Postgres => format!("${}", n),
            Dialect::MySQL | Dialect::Sqlite => "?".to_string(),
            Dialect::MsSql => format!("@p{}", n),
        }
    }
}

impl std::fmt::Display for Dialect {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}
