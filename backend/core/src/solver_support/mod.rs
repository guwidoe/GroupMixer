pub(crate) mod construction;
pub mod validation;

use serde::Serialize;
use thiserror::Error;

/// Errors that can occur across solver-family selection, validation, and execution.
#[derive(Error, Debug, Serialize)]
pub enum SolverError {
    /// A constraint validation error with descriptive message.
    #[error("Constraint violation: {0}")]
    ValidationError(String),
}
