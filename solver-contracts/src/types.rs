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
