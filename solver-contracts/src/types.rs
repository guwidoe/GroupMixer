use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Stable identifier for a public operation exposed by solver-facing surfaces.
pub type OperationId = &'static str;

/// Stable identifier for a public schema exposed by solver-facing surfaces.
pub type SchemaId = &'static str;

/// Stable identifier for a public example exposed by solver-facing surfaces.
pub type ExampleId = &'static str;

/// Stable identifier for a public error code exposed by solver-facing surfaces.
pub type ErrorCode = &'static str;

/// The canonical solve request currently reuses `solver-core`'s public input model.
///
/// This is an explicit boundary decision: until a stricter external DTO split is
/// needed, the contracts layer treats `solver_core::models::ApiInput` as the
/// public request shape for solving and validation.
pub type SolveRequest = solver_core::models::ApiInput;

/// The canonical solve response currently reuses `solver-core`'s public result model.
pub type SolveResponse = solver_core::models::SolverResult;

/// Validation currently accepts the same request shape as a solve operation.
pub type ValidateRequest = SolveRequest;

/// High-level operation category for transport-neutral help/rendering.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum OperationKind {
    Read,
    Write,
    Compute,
    Inspect,
}

/// High-level public error category for transport-neutral projections.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCategory {
    InvalidInput,
    Unsupported,
    Conflict,
    Infeasible,
    Permission,
    Internal,
}

/// A lightweight validation issue shape suitable for transport-neutral reporting.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ValidationIssue {
    pub code: Option<String>,
    pub message: String,
    #[serde(default)]
    pub path: Option<String>,
}

/// Canonical transport-neutral validation response shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ValidateResponse {
    pub valid: bool,
    #[serde(default)]
    pub issues: Vec<ValidationIssue>,
}

/// Lightweight inspect/result metadata for discovery surfaces that need a stable
/// summary without the full schedule payload.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ResultSummary {
    pub final_score: f64,
    pub unique_contacts: i32,
    pub repetition_penalty: i32,
    pub attribute_balance_penalty: i32,
    pub constraint_penalty: i32,
    #[serde(default)]
    pub effective_seed: Option<u64>,
    #[serde(default)]
    pub stop_reason: Option<String>,
}

/// Canonical public error instance shape shared across CLI, HTTP, and WASM projections.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PublicError {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub where_path: Option<String>,
    #[serde(default)]
    pub why: Option<String>,
    #[serde(default)]
    pub valid_alternatives: Vec<String>,
    #[serde(default)]
    pub recovery: Option<String>,
    #[serde(default)]
    pub related_help: Vec<String>,
}

/// Envelope for public transport-level error responses.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PublicErrorEnvelope {
    pub error: PublicError,
}

impl From<&SolveResponse> for ResultSummary {
    fn from(value: &SolveResponse) -> Self {
        Self {
            final_score: value.final_score,
            unique_contacts: value.unique_contacts,
            repetition_penalty: value.repetition_penalty,
            attribute_balance_penalty: value.attribute_balance_penalty,
            constraint_penalty: value.constraint_penalty,
            effective_seed: value.effective_seed,
            stop_reason: value.stop_reason.map(|reason| format!("{reason:?}")),
        }
    }
}
