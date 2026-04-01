use crate::contract_surface::binding_for_operation_id;
use anyhow::anyhow;
use anyhow::Error;
use gm_contracts::errors::{
    error_spec, supported_constraint_kind_alternatives, INFEASIBLE_SCENARIO_ERROR, INTERNAL_ERROR,
    INVALID_INPUT_ERROR, UNKNOWN_ERROR_CODE_ERROR, UNKNOWN_SCHEMA_ERROR,
    UNSUPPORTED_CONSTRAINT_KIND_ERROR, UNSUPPORTED_CONSTRAINT_KIND_PATH,
};

pub fn invalid_input_error(
    message: impl Into<String>,
    where_path: Option<String>,
    related_operation_id: &str,
    valid_alternatives: Vec<String>,
) -> Error {
    public_error(
        INVALID_INPUT_ERROR,
        message,
        where_path,
        valid_alternatives,
        Some(vec![related_operation_id.to_string()]),
    )
}

pub fn unknown_schema_error(schema_id: &str, valid_schema_ids: Vec<String>) -> Error {
    public_error(
        UNKNOWN_SCHEMA_ERROR,
        format!("Unknown schema id '{}'", schema_id),
        Some("schema_id".to_string()),
        valid_schema_ids,
        None,
    )
}

pub fn unknown_error_code_error(error_code: &str, valid_error_codes: Vec<String>) -> Error {
    public_error(
        UNKNOWN_ERROR_CODE_ERROR,
        format!("Unknown error code '{}'", error_code),
        Some("error_code".to_string()),
        valid_error_codes,
        None,
    )
}

pub fn infeasible_scenario_error(message: impl Into<String>, related_operation_id: &str) -> Error {
    public_error(
        INFEASIBLE_SCENARIO_ERROR,
        message,
        None,
        Vec::new(),
        Some(vec![related_operation_id.to_string()]),
    )
}

pub fn unsupported_constraint_kind_error(
    message: impl Into<String>,
    where_path: Option<String>,
    valid_alternatives: Vec<String>,
) -> Error {
    public_error(
        UNSUPPORTED_CONSTRAINT_KIND_ERROR,
        message,
        where_path,
        valid_alternatives,
        None,
    )
}

pub fn internal_error(message: impl Into<String>, related_operation_id: &str) -> Error {
    public_error(
        INTERNAL_ERROR,
        message,
        None,
        Vec::new(),
        Some(vec![related_operation_id.to_string()]),
    )
}

pub fn map_solver_error(message: impl Into<String>, related_operation_id: &str) -> Error {
    let message = message.into();
    if message.contains("unknown variant") || message.contains("expected one of") {
        return unsupported_constraint_kind_error(
            message,
            Some(UNSUPPORTED_CONSTRAINT_KIND_PATH.to_string()),
            supported_constraint_kind_alternatives(),
        );
    }

    infeasible_scenario_error(message, related_operation_id)
}

fn public_error(
    code: &str,
    message: impl Into<String>,
    where_path: Option<String>,
    valid_alternatives: Vec<String>,
    related_operation_override: Option<Vec<String>>,
) -> Error {
    let spec = error_spec(code).expect("registered public error spec");
    let message = message.into();
    let related_operations: Vec<String> = related_operation_override.unwrap_or_else(|| {
        spec.related_help_operation_ids
            .iter()
            .map(|value| (*value).to_string())
            .collect()
    });

    let mut rendered = String::new();
    rendered.push_str(&format!("error[{}]: {}\n", spec.code, message));
    if let Some(where_path) = where_path {
        rendered.push_str(&format!("where: {}\n", where_path));
    }
    rendered.push_str(&format!("why: {}\n", spec.why));
    if !valid_alternatives.is_empty() {
        rendered.push_str(&format!("valid: {}\n", valid_alternatives.join(", ")));
    }
    rendered.push_str(&format!("recovery: {}\n", spec.recovery));
    if !related_operations.is_empty() {
        rendered.push_str("see:\n");
        for operation_id in related_operations {
            if let Some(binding) = binding_for_operation_id(&operation_id) {
                rendered.push_str(&format!("  - gm-cli {} --help\n", binding.command_name));
            } else {
                rendered.push_str(&format!("  - {}\n", operation_id));
            }
        }
    }

    anyhow!(rendered.trim_end().to_string())
}
