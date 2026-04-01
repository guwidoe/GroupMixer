use crate::errors::{
    INFEASIBLE_SCENARIO_ERROR, INTERNAL_ERROR, INVALID_INPUT_ERROR, UNKNOWN_ERROR_CODE_ERROR,
    UNKNOWN_OPERATION_ERROR, UNKNOWN_SCHEMA_ERROR, UNSUPPORTED_CONSTRAINT_KIND_ERROR,
};
use crate::examples::{
    DEFAULT_SOLVER_CONFIGURATION_EXAMPLE_ID, EVALUATE_INPUT_EXAMPLE_ID, GET_SCHEMA_EXAMPLE_ID,
    INSPECT_RESULT_SUMMARY_EXAMPLE_ID, PUBLIC_ERROR_LOOKUP_EXAMPLE_ID,
    RECOMMEND_SETTINGS_EXAMPLE_ID, SOLVE_HAPPY_PATH_EXAMPLE_ID, SOLVE_PROGRESS_UPDATE_EXAMPLE_ID,
    VALIDATE_INVALID_CONSTRAINT_EXAMPLE_ID,
};
use crate::schemas::{
    PROGRESS_UPDATE_SCHEMA_ID, PUBLIC_ERROR_ENVELOPE_SCHEMA_ID,
    RECOMMEND_SETTINGS_REQUEST_SCHEMA_ID, RESULT_SUMMARY_SCHEMA_ID, SOLVER_CONFIGURATION_SCHEMA_ID,
    SOLVE_REQUEST_SCHEMA_ID, SOLVE_RESPONSE_SCHEMA_ID, VALIDATE_REQUEST_SCHEMA_ID,
    VALIDATE_RESPONSE_SCHEMA_ID,
};
use crate::types::{ErrorCode, ExampleId, OperationId, OperationKind, SchemaId};
use serde::Serialize;

pub const SOLVE_OPERATION_ID: &str = "solve";
pub const VALIDATE_SCENARIO_OPERATION_ID: &str = "validate-scenario";
pub const INSPECT_RESULT_OPERATION_ID: &str = "inspect-result";
pub const GET_SCHEMA_OPERATION_ID: &str = "get-schema";
pub const INSPECT_ERRORS_OPERATION_ID: &str = "inspect-errors";
pub const GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID: &str = "get-default-solver-configuration";
pub const RECOMMEND_SETTINGS_OPERATION_ID: &str = "recommend-settings";
pub const EVALUATE_INPUT_OPERATION_ID: &str = "evaluate-input";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OperationSpec {
    pub id: OperationId,
    pub summary: &'static str,
    pub description: &'static str,
    pub kind: OperationKind,
    pub family: &'static str,
    pub input_schema_ids: &'static [SchemaId],
    pub output_schema_ids: &'static [SchemaId],
    pub progress_schema_ids: &'static [SchemaId],
    pub error_codes: &'static [ErrorCode],
    pub related_operation_ids: &'static [OperationId],
    pub example_ids: &'static [ExampleId],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LocalHelpSpec {
    pub operation: &'static OperationSpec,
    pub related_operations: &'static [OperationId],
}

const OPERATION_SPECS: &[OperationSpec] = &[
    OperationSpec {
        id: SOLVE_OPERATION_ID,
        summary: "Run the solver for a complete optimization input.",
        description: "Accept a full solver input, execute the optimization engine, and return the resulting schedule plus final metrics.",
        kind: OperationKind::Compute,
        family: "solver",
        input_schema_ids: &[SOLVE_REQUEST_SCHEMA_ID],
        output_schema_ids: &[SOLVE_RESPONSE_SCHEMA_ID],
        progress_schema_ids: &[PROGRESS_UPDATE_SCHEMA_ID],
        error_codes: &[
            INVALID_INPUT_ERROR,
            INFEASIBLE_SCENARIO_ERROR,
            UNSUPPORTED_CONSTRAINT_KIND_ERROR,
            INTERNAL_ERROR,
        ],
        related_operation_ids: &[
            VALIDATE_SCENARIO_OPERATION_ID,
            INSPECT_RESULT_OPERATION_ID,
            GET_SCHEMA_OPERATION_ID,
            INSPECT_ERRORS_OPERATION_ID,
            GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID,
            RECOMMEND_SETTINGS_OPERATION_ID,
        ],
        example_ids: &[SOLVE_HAPPY_PATH_EXAMPLE_ID, SOLVE_PROGRESS_UPDATE_EXAMPLE_ID],
    },
    OperationSpec {
        id: VALIDATE_SCENARIO_OPERATION_ID,
        summary: "Validate a scenario input without running optimization.",
        description: "Check whether a scenario request is structurally and semantically acceptable before invoking the solver.",
        kind: OperationKind::Inspect,
        family: "validation",
        input_schema_ids: &[VALIDATE_REQUEST_SCHEMA_ID],
        output_schema_ids: &[VALIDATE_RESPONSE_SCHEMA_ID],
        progress_schema_ids: &[],
        error_codes: &[
            INVALID_INPUT_ERROR,
            UNSUPPORTED_CONSTRAINT_KIND_ERROR,
            INFEASIBLE_SCENARIO_ERROR,
            INTERNAL_ERROR,
        ],
        related_operation_ids: &[
            SOLVE_OPERATION_ID,
            GET_SCHEMA_OPERATION_ID,
            INSPECT_ERRORS_OPERATION_ID,
        ],
        example_ids: &[VALIDATE_INVALID_CONSTRAINT_EXAMPLE_ID],
    },
    OperationSpec {
        id: INSPECT_RESULT_OPERATION_ID,
        summary: "Inspect lightweight metadata for an existing solver result.",
        description: "Return summary-level result fields that are useful for follow-up inspection and discovery without requiring a full schedule walk.",
        kind: OperationKind::Inspect,
        family: "results",
        input_schema_ids: &[SOLVE_RESPONSE_SCHEMA_ID],
        output_schema_ids: &[RESULT_SUMMARY_SCHEMA_ID],
        progress_schema_ids: &[],
        error_codes: &[INVALID_INPUT_ERROR, INTERNAL_ERROR],
        related_operation_ids: &[SOLVE_OPERATION_ID, GET_SCHEMA_OPERATION_ID, INSPECT_ERRORS_OPERATION_ID],
        example_ids: &[INSPECT_RESULT_SUMMARY_EXAMPLE_ID],
    },
    OperationSpec {
        id: GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID,
        summary: "Get the canonical default solver configuration.",
        description: "Return the baseline solver configuration that callers can use as a clean starting point before applying scenario-aware tuning or manual edits.",
        kind: OperationKind::Read,
        family: "configuration",
        input_schema_ids: &[],
        output_schema_ids: &[SOLVER_CONFIGURATION_SCHEMA_ID],
        progress_schema_ids: &[],
        error_codes: &[INTERNAL_ERROR],
        related_operation_ids: &[
            RECOMMEND_SETTINGS_OPERATION_ID,
            SOLVE_OPERATION_ID,
            GET_SCHEMA_OPERATION_ID,
        ],
        example_ids: &[DEFAULT_SOLVER_CONFIGURATION_EXAMPLE_ID],
    },
    OperationSpec {
        id: RECOMMEND_SETTINGS_OPERATION_ID,
        summary: "Recommend solver settings from an explicit recommendation request.",
        description: "Analyze a scenario definition plus runtime target and return a recommended solver configuration without executing the main solve workflow.",
        kind: OperationKind::Compute,
        family: "configuration",
        input_schema_ids: &[RECOMMEND_SETTINGS_REQUEST_SCHEMA_ID],
        output_schema_ids: &[SOLVER_CONFIGURATION_SCHEMA_ID],
        progress_schema_ids: &[],
        error_codes: &[INVALID_INPUT_ERROR, INFEASIBLE_SCENARIO_ERROR, INTERNAL_ERROR],
        related_operation_ids: &[
            GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID,
            SOLVE_OPERATION_ID,
            VALIDATE_SCENARIO_OPERATION_ID,
            GET_SCHEMA_OPERATION_ID,
        ],
        example_ids: &[RECOMMEND_SETTINGS_EXAMPLE_ID],
    },
    OperationSpec {
        id: EVALUATE_INPUT_OPERATION_ID,
        summary: "Evaluate an existing scheduled input without running search.",
        description: "Accept a solve request that already includes an initial schedule, recompute scores, and return the resulting solver result payload.",
        kind: OperationKind::Inspect,
        family: "results",
        input_schema_ids: &[SOLVE_REQUEST_SCHEMA_ID],
        output_schema_ids: &[SOLVE_RESPONSE_SCHEMA_ID],
        progress_schema_ids: &[],
        error_codes: &[INVALID_INPUT_ERROR, INFEASIBLE_SCENARIO_ERROR, INTERNAL_ERROR],
        related_operation_ids: &[INSPECT_RESULT_OPERATION_ID, SOLVE_OPERATION_ID, GET_SCHEMA_OPERATION_ID],
        example_ids: &[EVALUATE_INPUT_EXAMPLE_ID],
    },
    OperationSpec {
        id: GET_SCHEMA_OPERATION_ID,
        summary: "Inspect a named public schema from the contract registry.",
        description: "Return machine-readable schema metadata for one stable schema identifier.",
        kind: OperationKind::Read,
        family: "introspection",
        input_schema_ids: &[],
        output_schema_ids: &[],
        progress_schema_ids: &[],
        error_codes: &[UNKNOWN_SCHEMA_ERROR, INTERNAL_ERROR],
        related_operation_ids: &[
            SOLVE_OPERATION_ID,
            VALIDATE_SCENARIO_OPERATION_ID,
            INSPECT_RESULT_OPERATION_ID,
            GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID,
            RECOMMEND_SETTINGS_OPERATION_ID,
            INSPECT_ERRORS_OPERATION_ID,
        ],
        example_ids: &[GET_SCHEMA_EXAMPLE_ID],
    },
    OperationSpec {
        id: INSPECT_ERRORS_OPERATION_ID,
        summary: "Inspect the canonical public error catalog.",
        description: "Return the stable error-code catalog so callers can understand failure meanings and follow related-help pointers.",
        kind: OperationKind::Read,
        family: "introspection",
        input_schema_ids: &[],
        output_schema_ids: &[PUBLIC_ERROR_ENVELOPE_SCHEMA_ID],
        progress_schema_ids: &[],
        error_codes: &[UNKNOWN_OPERATION_ERROR, UNKNOWN_ERROR_CODE_ERROR, INTERNAL_ERROR],
        related_operation_ids: &[
            SOLVE_OPERATION_ID,
            VALIDATE_SCENARIO_OPERATION_ID,
            INSPECT_RESULT_OPERATION_ID,
            GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID,
            RECOMMEND_SETTINGS_OPERATION_ID,
            GET_SCHEMA_OPERATION_ID,
        ],
        example_ids: &[PUBLIC_ERROR_LOOKUP_EXAMPLE_ID],
    },
];

pub fn operation_specs() -> &'static [OperationSpec] {
    OPERATION_SPECS
}

pub fn operation_spec(id: &str) -> Option<&'static OperationSpec> {
    OPERATION_SPECS.iter().find(|spec| spec.id == id)
}

pub fn top_level_operation_ids() -> &'static [OperationId] {
    &[
        SOLVE_OPERATION_ID,
        VALIDATE_SCENARIO_OPERATION_ID,
        INSPECT_RESULT_OPERATION_ID,
        GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID,
        RECOMMEND_SETTINGS_OPERATION_ID,
        EVALUATE_INPUT_OPERATION_ID,
        GET_SCHEMA_OPERATION_ID,
        INSPECT_ERRORS_OPERATION_ID,
    ]
}

pub fn local_help(id: &str) -> Option<LocalHelpSpec> {
    let operation = operation_spec(id)?;
    Some(LocalHelpSpec {
        operation,
        related_operations: operation.related_operation_ids,
    })
}

#[cfg(test)]
mod tests {
    use super::{local_help, operation_spec, operation_specs};
    use std::collections::HashSet;

    #[test]
    fn operation_ids_are_unique() {
        let ids: HashSet<_> = operation_specs().iter().map(|spec| spec.id).collect();
        assert_eq!(ids.len(), operation_specs().len());
    }

    #[test]
    fn related_operation_links_resolve() {
        for operation in operation_specs() {
            for related in operation.related_operation_ids {
                assert!(
                    operation_spec(related).is_some(),
                    "missing related op: {related}"
                );
            }
        }
    }

    #[test]
    fn local_help_returns_single_operation_scope() {
        let help = local_help("solve").expect("local help");
        assert_eq!(help.operation.id, "solve");
        assert!(help.related_operations.contains(&"validate-scenario"));
    }
}
