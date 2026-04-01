use crate::operations::{
    GET_SCHEMA_OPERATION_ID, INSPECT_ERRORS_OPERATION_ID, INSPECT_RESULT_OPERATION_ID,
    SOLVE_OPERATION_ID, VALIDATE_SCENARIO_OPERATION_ID,
};
use crate::types::{ErrorCategory, ErrorCode, OperationId};
use serde::Serialize;

pub const INVALID_INPUT_ERROR: &str = "invalid-input";
pub const UNKNOWN_OPERATION_ERROR: &str = "unknown-operation";
pub const UNKNOWN_SCHEMA_ERROR: &str = "unknown-schema";
pub const UNKNOWN_ERROR_CODE_ERROR: &str = "unknown-error-code";
pub const INFEASIBLE_SCENARIO_ERROR: &str = "infeasible-scenario";
pub const UNSUPPORTED_CONSTRAINT_KIND_ERROR: &str = "unsupported-constraint-kind";
pub const PERMISSION_DENIED_ERROR: &str = "permission-denied";
pub const INTERNAL_ERROR: &str = "internal-error";
pub const UNSUPPORTED_CONSTRAINT_KIND_PATH: &str = "constraints[*].type";

const SUPPORTED_CONSTRAINT_KIND_NAMES: &[&str] = &[
    "RepeatEncounter",
    "AttributeBalance",
    "MustStayTogether",
    "ShouldStayTogether",
    "ShouldNotBeTogether",
    "ImmovablePerson",
    "ImmovablePeople",
    "PairMeetingCount",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PublicErrorSpec {
    pub code: ErrorCode,
    pub category: ErrorCategory,
    pub summary: &'static str,
    pub why: &'static str,
    pub recovery: &'static str,
    pub related_help_operation_ids: &'static [OperationId],
}

const ERROR_SPECS: &[PublicErrorSpec] = &[
    PublicErrorSpec {
        code: INVALID_INPUT_ERROR,
        category: ErrorCategory::InvalidInput,
        summary: "The provided request or payload shape is invalid.",
        why: "The caller supplied malformed JSON, a missing required field, or an unexpected value shape for the requested operation.",
        recovery: "Inspect the relevant input schema and local help for the targeted operation, then resend a valid request.",
        related_help_operation_ids: &[VALIDATE_SCENARIO_OPERATION_ID, GET_SCHEMA_OPERATION_ID],
    },
    PublicErrorSpec {
        code: UNKNOWN_OPERATION_ERROR,
        category: ErrorCategory::Unsupported,
        summary: "The requested operation is not part of the public solver contract.",
        why: "The caller referenced an operation ID or affordance name that is not registered in the shared contracts graph.",
        recovery: "Start from bootstrap help, then choose one of the registered top-level operations.",
        related_help_operation_ids: &[SOLVE_OPERATION_ID, VALIDATE_SCENARIO_OPERATION_ID, GET_SCHEMA_OPERATION_ID],
    },
    PublicErrorSpec {
        code: UNKNOWN_SCHEMA_ERROR,
        category: ErrorCategory::Unsupported,
        summary: "The requested schema ID is not registered.",
        why: "The caller requested a schema identifier that does not exist in the contract registry.",
        recovery: "Inspect the schema lookup/help affordance and request one of the registered schema IDs.",
        related_help_operation_ids: &[GET_SCHEMA_OPERATION_ID],
    },
    PublicErrorSpec {
        code: UNKNOWN_ERROR_CODE_ERROR,
        category: ErrorCategory::Unsupported,
        summary: "The requested public error code is not registered.",
        why: "The caller requested an error code identifier that does not exist in the contract registry.",
        recovery: "Inspect the error-catalog help affordance and request one of the registered public error codes.",
        related_help_operation_ids: &[INSPECT_ERRORS_OPERATION_ID],
    },
    PublicErrorSpec {
        code: INFEASIBLE_SCENARIO_ERROR,
        category: ErrorCategory::Infeasible,
        summary: "The scenario definition is internally inconsistent or infeasible.",
        why: "The solver cannot satisfy the required constraints, capacities, or session assignments for the provided scenario input.",
        recovery: "Validate the scenario, inspect constraint settings, and adjust the input so a valid schedule is possible.",
        related_help_operation_ids: &[VALIDATE_SCENARIO_OPERATION_ID, SOLVE_OPERATION_ID],
    },
    PublicErrorSpec {
        code: UNSUPPORTED_CONSTRAINT_KIND_ERROR,
        category: ErrorCategory::Unsupported,
        summary: "A constraint kind or similar enum-like value is not supported.",
        why: "The caller referenced a named domain feature that is not part of the currently supported public contract.",
        recovery: "Inspect the relevant schema and contract help, then replace the unsupported value with a supported one.",
        related_help_operation_ids: &[VALIDATE_SCENARIO_OPERATION_ID, GET_SCHEMA_OPERATION_ID],
    },
    PublicErrorSpec {
        code: PERMISSION_DENIED_ERROR,
        category: ErrorCategory::Permission,
        summary: "The caller lacks permission for the requested operation.",
        why: "The current transport/runtime surface rejected the action under its active rights model.",
        recovery: "Use a permitted read-only affordance, obtain the required credentials/scope, or switch to an allowed workflow.",
        related_help_operation_ids: &[SOLVE_OPERATION_ID, VALIDATE_SCENARIO_OPERATION_ID],
    },
    PublicErrorSpec {
        code: INTERNAL_ERROR,
        category: ErrorCategory::Internal,
        summary: "An unexpected internal failure occurred.",
        why: "The operation failed for a reason outside the normal public validation and feasibility model.",
        recovery: "Capture the error details, inspect local help for the attempted operation, and retry only if the failure is known to be transient.",
        related_help_operation_ids: &[
            SOLVE_OPERATION_ID,
            VALIDATE_SCENARIO_OPERATION_ID,
            INSPECT_RESULT_OPERATION_ID,
            INSPECT_ERRORS_OPERATION_ID,
        ],
    },
];

pub fn error_specs() -> &'static [PublicErrorSpec] {
    ERROR_SPECS
}

pub fn error_spec(code: &str) -> Option<&'static PublicErrorSpec> {
    ERROR_SPECS.iter().find(|spec| spec.code == code)
}

pub fn supported_constraint_kind_names() -> &'static [&'static str] {
    SUPPORTED_CONSTRAINT_KIND_NAMES
}

pub fn supported_constraint_kind_alternatives() -> Vec<String> {
    supported_constraint_kind_names()
        .iter()
        .map(|value| (*value).to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{error_spec, error_specs, supported_constraint_kind_names};
    use crate::operations::operation_spec;
    use std::collections::HashSet;

    #[test]
    fn error_codes_are_unique() {
        let codes: HashSet<_> = error_specs().iter().map(|spec| spec.code).collect();
        assert_eq!(codes.len(), error_specs().len());
    }

    #[test]
    fn related_help_targets_resolve() {
        for spec in error_specs() {
            for operation_id in spec.related_help_operation_ids {
                assert!(
                    operation_spec(operation_id).is_some(),
                    "missing related help operation: {operation_id}"
                );
            }
        }
    }

    #[test]
    fn lookup_returns_registered_error() {
        let spec = error_spec("invalid-input").expect("registered error");
        assert_eq!(spec.code, "invalid-input");
    }

    #[test]
    fn supported_constraint_kinds_are_unique() {
        let kinds: HashSet<_> = supported_constraint_kind_names().iter().copied().collect();
        assert_eq!(kinds.len(), supported_constraint_kind_names().len());
    }
}
