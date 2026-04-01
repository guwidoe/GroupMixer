use gm_contracts::{
    bootstrap::bootstrap_spec,
    errors::{
        error_spec, error_specs, supported_constraint_kind_alternatives, INFEASIBLE_SCENARIO_ERROR,
        INTERNAL_ERROR, INVALID_INPUT_ERROR, UNKNOWN_ERROR_CODE_ERROR, UNKNOWN_OPERATION_ERROR,
        UNKNOWN_SCHEMA_ERROR, UNSUPPORTED_CONSTRAINT_KIND_ERROR, UNSUPPORTED_CONSTRAINT_KIND_PATH,
    },
    schemas::schema_specs,
    types::{PublicError, PublicErrorEnvelope},
};
use wasm_bindgen::JsValue;

pub fn public_error_to_js_value(error: &PublicErrorEnvelope) -> JsValue {
    serde_wasm_bindgen::to_value(error).unwrap_or_else(|serialization_error| {
        js_sys::Error::new(&format!(
            "Failed to serialize public error: {}",
            serialization_error
        ))
        .into()
    })
}

pub fn invalid_input_error(
    operation_id: &str,
    message: impl Into<String>,
    where_path: Option<String>,
    valid_alternatives: Vec<String>,
) -> PublicErrorEnvelope {
    api_error(
        INVALID_INPUT_ERROR,
        message,
        where_path,
        valid_alternatives,
        Some(vec![operation_id.to_string()]),
    )
}

pub fn unsupported_constraint_kind_error(message: impl Into<String>) -> PublicErrorEnvelope {
    api_error(
        UNSUPPORTED_CONSTRAINT_KIND_ERROR,
        message,
        Some(UNSUPPORTED_CONSTRAINT_KIND_PATH.to_string()),
        supported_constraint_kind_alternatives(),
        Some(vec![
            "validate-scenario".to_string(),
            "get-schema".to_string(),
        ]),
    )
}

pub fn unknown_operation_error(operation_id: &str) -> PublicErrorEnvelope {
    api_error(
        UNKNOWN_OPERATION_ERROR,
        format!("Unknown operation '{}'", operation_id),
        Some("operation_id".to_string()),
        bootstrap_spec()
            .top_level_operation_ids
            .iter()
            .map(|value| value.to_string())
            .collect(),
        None,
    )
}

pub fn unknown_schema_error(schema_id: &str) -> PublicErrorEnvelope {
    api_error(
        UNKNOWN_SCHEMA_ERROR,
        format!("Unknown schema id '{}'", schema_id),
        Some("schema_id".to_string()),
        schema_specs()
            .iter()
            .map(|spec| spec.id.to_string())
            .collect(),
        Some(vec!["get-schema".to_string()]),
    )
}

pub fn unknown_error_code_error(error_code: &str) -> PublicErrorEnvelope {
    api_error(
        UNKNOWN_ERROR_CODE_ERROR,
        format!("Unknown error code '{}'", error_code),
        Some("error_code".to_string()),
        error_specs()
            .iter()
            .map(|spec| spec.code.to_string())
            .collect(),
        Some(vec!["inspect-errors".to_string()]),
    )
}

pub fn infeasible_scenario_error(
    operation_id: &str,
    message: impl Into<String>,
) -> PublicErrorEnvelope {
    api_error(
        INFEASIBLE_SCENARIO_ERROR,
        message,
        None,
        Vec::new(),
        Some(vec![
            operation_id.to_string(),
            "validate-scenario".to_string(),
        ]),
    )
}

pub fn internal_error(operation_id: &str, message: impl Into<String>) -> PublicErrorEnvelope {
    api_error(
        INTERNAL_ERROR,
        message,
        None,
        Vec::new(),
        Some(vec![operation_id.to_string(), "inspect-errors".to_string()]),
    )
}

pub fn evaluate_requires_initial_schedule_error() -> PublicErrorEnvelope {
    invalid_input_error(
        "evaluate-input",
        "Evaluate input requires initial_schedule in the request payload",
        Some("initial_schedule".to_string()),
        vec!["provide initial_schedule".to_string()],
    )
}

pub fn parse_error(
    operation_id: &str,
    message: impl Into<String>,
    schema_ids: &[&str],
) -> PublicErrorEnvelope {
    let message = message.into();
    if message.contains("unknown variant") || message.contains("expected one of") {
        return unsupported_constraint_kind_error(message);
    }

    invalid_input_error(
        operation_id,
        message,
        None,
        schema_ids.iter().map(|id| id.to_string()).collect(),
    )
}

fn api_error(
    code: &str,
    message: impl Into<String>,
    where_path: Option<String>,
    valid_alternatives: Vec<String>,
    related_help_override: Option<Vec<String>>,
) -> PublicErrorEnvelope {
    let spec = error_spec(code).expect("registered public error spec");
    PublicErrorEnvelope {
        error: PublicError {
            code: spec.code.to_string(),
            message: message.into(),
            where_path,
            why: Some(spec.why.to_string()),
            valid_alternatives,
            recovery: Some(spec.recovery.to_string()),
            related_help: related_help_override.unwrap_or_else(|| {
                spec.related_help_operation_ids
                    .iter()
                    .map(|operation_id| operation_id.to_string())
                    .collect()
            }),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{evaluate_requires_initial_schedule_error, parse_error, unknown_schema_error};

    #[test]
    fn unknown_schema_error_exposes_registered_alternatives() {
        let envelope = unknown_schema_error("nope");
        assert_eq!(envelope.error.code, "unknown-schema");
        assert!(envelope
            .error
            .valid_alternatives
            .iter()
            .any(|value| value == "solve-request"));
        assert_eq!(envelope.error.related_help, vec!["get-schema".to_string()]);
    }

    #[test]
    fn parse_errors_promote_unknown_variants_to_supported_constraint_error() {
        let envelope = parse_error(
            "solve",
            "unknown variant `ShouldBeTogether`, expected one of `ShouldStayTogether`",
            &["solve-request"],
        );
        assert_eq!(envelope.error.code, "unsupported-constraint-kind");
        assert!(envelope
            .error
            .valid_alternatives
            .iter()
            .any(|value| value == "ShouldStayTogether"));
    }

    #[test]
    fn evaluate_requires_schedule_points_to_exact_field() {
        let envelope = evaluate_requires_initial_schedule_error();
        assert_eq!(envelope.error.code, "invalid-input");
        assert_eq!(
            envelope.error.where_path.as_deref(),
            Some("initial_schedule")
        );
    }
}
