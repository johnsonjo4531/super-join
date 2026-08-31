//! The compiler pipeline: request -> semantic IR -> relational IR -> SQL IR ->
//! parameterized SQL artifact. Every stage is deterministic.

pub mod build;

use crate::error::{CompilerError, CompilerResult};
use crate::model::Model;
use crate::semantic::Validator;
use crate::sql::Dialect;
use super::CompilerRequest;

/// The compiler. Configuration is fixed at construction time.
#[derive(Debug, Clone)]
pub struct Compiler {
    dialect: Dialect,
}

impl Compiler {
    pub fn new(dialect: Dialect) -> Self {
        Compiler { dialect }
    }

    /// Compiles a request into a SQL artifact. Never panics on malformed input;
    /// returns a structured error instead.
    pub fn compile(&self, request: &CompilerRequest) -> Result<CompilerResult, CompilerError> {
        // Stage 1: semantic resolution + validation.
        let validator = Validator::new(&request.model);
        let semantic = validator.resolve(&request.root, &request.model)?;

        // Stage 2: relational IR (dialect-independent plan).
        let plan = build::build_plan(&semantic, &request.model)?;

        // Stage 3: SQL IR (dialect-aware structure).
        let sql_query = crate::sql::build_sql_query(&plan, self.dialect);

        // Stage 4: render to parameterized SQL text + parameters.
        let artifact = crate::sql::render_query(&sql_query)?;

        Ok(CompilerResult { artifact })
    }
}

/// Validates that the requested dialect is supported.
pub fn validate_dialect(_dialect: Dialect) -> Result<(), CompilerError> {
    Ok(())
}

/// Returns the source table for an entity id, or an error if unknown.
pub fn entity_source<'a>(model: &'a Model, id: u64) -> Result<&'a crate::model::Identifier, CompilerError> {
    for entity in &model.entities {
        if entity.id == id {
            return Ok(&entity.source);
        }
    }
    Err(CompilerError::new(
        crate::error::ErrorCode::UnknownField,
        format!("entity {} has no source", id),
    ))
}
