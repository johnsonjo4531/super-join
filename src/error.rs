//! Structured compiler errors that cross the component boundary.

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(non_camel_case_types)]
pub enum ErrorCode {
    InvalidRequest,
    InvalidModel,
    UnknownField,
    UnknownRelation,
    InvalidExpression,
    UnsupportedFeature,
    UnsupportedDialect,
}

impl ErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            ErrorCode::InvalidRequest => "invalid-request",
            ErrorCode::InvalidModel => "invalid-model",
            ErrorCode::UnknownField => "unknown-field",
            ErrorCode::UnknownRelation => "unknown-relation",
            ErrorCode::InvalidExpression => "invalid-expression",
            ErrorCode::UnsupportedFeature => "unsupported-feature",
            ErrorCode::UnsupportedDialect => "unsupported-dialect",
        }
    }
}

#[derive(Debug, Clone)]
pub struct SourceLocation {
    pub path: String,
    pub line: u64,
    pub column: u64,
    pub length: u64,
}

#[derive(Debug, Clone)]
pub struct CompilerError {
    pub code: ErrorCode,
    pub message: String,
    pub path: Option<String>,
    pub source: Option<SourceLocation>,
}

impl CompilerError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        CompilerError {
            code,
            message: message.into(),
            path: None,
            source: None,
        }
    }

    pub fn with_path(mut self, path: impl Into<String>) -> Self {
        self.path = Some(path.into());
        self
    }

    pub fn with_source(mut self, source: SourceLocation) -> Self {
        self.source = Some(source);
        self
    }
}

impl fmt::Display for CompilerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code.as_str(), self.message)
    }
}

impl std::error::Error for CompilerError {}

/// The successful compilation result. `artifact` is the SQL artifact handed to
/// an application-owned driver.
#[derive(Debug, Clone)]
pub struct CompilerResult {
    pub artifact: crate::sql::SqlArtifact,
}
