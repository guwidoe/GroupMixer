use crate::contract_surface::binding_for_operation_id;
use crate::public_errors::{
    internal_error, public_error_to_js_value, unknown_error_code_error, unknown_operation_error,
    unknown_schema_error,
};
use schemars::schema::RootSchema;
use serde::Serialize;
use solver_contracts::{
    bootstrap::{bootstrap_spec, BootstrapSpec},
    errors::{error_spec, error_specs, PublicErrorSpec},
    examples::example_spec,
    operations::{local_help, operation_spec, OperationSpec},
    schemas::{export_schema, schema_spec, schema_specs},
};
use wasm_bindgen::JsValue;

#[derive(Debug, Clone, Serialize)]
pub struct WasmCapabilityOperationSummary {
    pub operation_id: &'static str,
    pub summary: &'static str,
    pub family: &'static str,
    pub kind: solver_contracts::types::OperationKind,
    pub help_export_name: &'static str,
    #[serde(default)]
    pub export_name: Option<&'static str>,
    pub help_target: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct WasmBootstrapResponse {
    pub bootstrap: BootstrapSpec,
    pub help_export_name: &'static str,
    pub schema_list_export_name: &'static str,
    pub schema_lookup_export_name: &'static str,
    pub error_list_export_name: &'static str,
    pub error_lookup_export_name: &'static str,
    pub top_level_operations: Vec<WasmCapabilityOperationSummary>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WasmOperationExampleSummary {
    pub id: &'static str,
    pub summary: &'static str,
    pub description: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct WasmRelatedOperationSummary {
    pub operation_id: &'static str,
    pub summary: &'static str,
    pub help_export_name: &'static str,
    #[serde(default)]
    pub export_name: Option<&'static str>,
    pub help_target: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct WasmOperationHelpResponse {
    pub operation: OperationSpec,
    pub help_export_name: &'static str,
    #[serde(default)]
    pub export_name: Option<&'static str>,
    pub help_target: &'static str,
    pub examples: Vec<WasmOperationExampleSummary>,
    pub related_operations: Vec<WasmRelatedOperationSummary>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WasmSchemaSummary {
    pub id: &'static str,
    pub version: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct WasmSchemaLookupResponse {
    pub id: &'static str,
    pub version: &'static str,
    pub schema: RootSchema,
}

#[derive(Debug, Clone, Serialize)]
pub struct WasmErrorLookupResponse {
    pub error: PublicErrorSpec,
    pub help_export_name: &'static str,
    pub related_help_targets: Vec<&'static str>,
}

pub fn capabilities_js() -> Result<JsValue, JsValue> {
    to_js_value(&build_capabilities_response())
}

pub fn get_operation_help_js(operation_id: &str) -> Result<JsValue, JsValue> {
    to_js_value(&build_operation_help_response(operation_id)?)
}

pub fn list_schemas_js() -> Result<JsValue, JsValue> {
    to_js_value(&build_schema_summaries())
}

pub fn get_schema_js(schema_id: &str) -> Result<JsValue, JsValue> {
    to_js_value(&build_schema_lookup_response(schema_id)?)
}

pub fn list_public_errors_js() -> Result<JsValue, JsValue> {
    to_js_value(&build_error_catalog())
}

pub fn get_public_error_js(error_code: &str) -> Result<JsValue, JsValue> {
    to_js_value(&build_error_lookup_response(error_code)?)
}

pub fn build_capabilities_response() -> WasmBootstrapResponse {
    let bootstrap = bootstrap_spec();
    let top_level_operations = bootstrap
        .top_level_operation_ids
        .iter()
        .filter_map(|operation_id| {
            let operation = operation_spec(operation_id)?;
            Some(WasmCapabilityOperationSummary {
                operation_id: operation.id,
                summary: operation.summary,
                family: operation.family,
                kind: operation.kind,
                help_export_name: "get_operation_help",
                export_name: binding_for_operation_id(operation.id).map(|binding| binding.export_name),
                help_target: operation.id,
            })
        })
        .collect();

    WasmBootstrapResponse {
        bootstrap,
        help_export_name: "get_operation_help",
        schema_list_export_name: "list_schemas",
        schema_lookup_export_name: "get_schema",
        error_list_export_name: "list_public_errors",
        error_lookup_export_name: "get_public_error",
        top_level_operations,
    }
}

pub fn build_operation_help_response(operation_id: &str) -> Result<WasmOperationHelpResponse, JsValue> {
    let help = local_help(operation_id)
        .ok_or_else(|| public_error_to_js_value(&unknown_operation_error(operation_id)))?;
    let examples = help
        .operation
        .example_ids
        .iter()
        .filter_map(|example_id| example_spec(example_id))
        .map(|example| WasmOperationExampleSummary {
            id: example.id,
            summary: example.summary,
            description: example.description,
        })
        .collect();
    let related_operations = help
        .related_operations
        .iter()
        .filter_map(|related_id| {
            let operation = operation_spec(related_id)?;
            Some(WasmRelatedOperationSummary {
                operation_id: operation.id,
                summary: operation.summary,
                help_export_name: "get_operation_help",
                export_name: binding_for_operation_id(operation.id).map(|binding| binding.export_name),
                help_target: operation.id,
            })
        })
        .collect();

    Ok(WasmOperationHelpResponse {
        operation: help.operation.clone(),
        help_export_name: "get_operation_help",
        export_name: binding_for_operation_id(help.operation.id).map(|binding| binding.export_name),
        help_target: help.operation.id,
        examples,
        related_operations,
    })
}

pub fn build_schema_summaries() -> Vec<WasmSchemaSummary> {
    schema_specs()
        .iter()
        .map(|spec| WasmSchemaSummary {
            id: spec.id,
            version: spec.version,
        })
        .collect()
}

pub fn build_schema_lookup_response(schema_id: &str) -> Result<WasmSchemaLookupResponse, JsValue> {
    let spec = schema_spec(schema_id)
        .ok_or_else(|| public_error_to_js_value(&unknown_schema_error(schema_id)))?;
    let schema = export_schema(schema_id).ok_or_else(|| {
        public_error_to_js_value(&internal_error(
            "get-schema",
            format!("Failed to export schema '{}'", schema_id),
        ))
    })?;
    Ok(WasmSchemaLookupResponse {
        id: spec.id,
        version: spec.version,
        schema,
    })
}

pub fn build_error_catalog() -> Vec<WasmErrorLookupResponse> {
    error_specs()
        .iter()
        .cloned()
        .map(|error| WasmErrorLookupResponse {
            help_export_name: "get_operation_help",
            related_help_targets: error.related_help_operation_ids.to_vec(),
            error,
        })
        .collect()
}

pub fn build_error_lookup_response(error_code: &str) -> Result<WasmErrorLookupResponse, JsValue> {
    let error = error_spec(error_code)
        .cloned()
        .ok_or_else(|| public_error_to_js_value(&unknown_error_code_error(error_code)))?;
    Ok(WasmErrorLookupResponse {
        help_export_name: "get_operation_help",
        related_help_targets: error.related_help_operation_ids.to_vec(),
        error,
    })
}

fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value)
        .map_err(|error| {
            public_error_to_js_value(&internal_error(
                "get-schema",
                format!("Failed to serialize JS value: {}", error),
            ))
        })
}

#[cfg(test)]
mod tests {
    use super::{
        build_capabilities_response, build_error_lookup_response, build_operation_help_response,
        build_schema_lookup_response, build_schema_summaries,
    };

    #[test]
    fn capabilities_response_exposes_bootstrap_and_top_level_bindings() {
        let response = build_capabilities_response();
        assert_eq!(response.help_export_name, "get_operation_help");
        assert!(response.top_level_operations.iter().any(|operation| operation.operation_id == "solve"));
        assert!(response.top_level_operations.iter().any(|operation| operation.export_name == Some("solve_contract")));
        assert!(response.top_level_operations.iter().all(|operation| operation.help_export_name == "get_operation_help"));
    }

    #[test]
    fn operation_help_response_includes_examples_and_related_operations() {
        let response = build_operation_help_response("solve").expect("solve help");
        assert_eq!(response.operation.id, "solve");
        assert_eq!(response.help_export_name, "get_operation_help");
        assert_eq!(response.export_name, Some("solve_contract"));
        assert!(response.examples.iter().any(|example| example.id == "solve-happy-path"));
        assert!(response.related_operations.iter().any(|operation| operation.operation_id == "validate-problem"));
    }

    #[test]
    fn related_help_targets_resolve_from_help_and_error_surfaces() {
        let help = build_operation_help_response("solve").expect("solve help");
        for related in help.related_operations {
            let related_help = build_operation_help_response(related.help_target)
                .expect("related help target should resolve");
            assert_eq!(related.help_export_name, "get_operation_help");
            assert_eq!(related_help.operation.id, related.help_target);
        }

        let error = build_error_lookup_response("invalid-input").expect("error lookup");
        assert_eq!(error.help_export_name, "get_operation_help");
        for target in error.related_help_targets {
            let related_help = build_operation_help_response(target)
                .expect("error related help target should resolve");
            assert_eq!(related_help.operation.id, target);
        }
    }

    #[test]
    fn schema_exports_are_available_by_stable_id() {
        let schemas = build_schema_summaries();
        assert!(schemas.iter().any(|schema| schema.id == "solve-request"));

        let solve_schema = build_schema_lookup_response("solve-request").expect("solve-request schema");
        assert_eq!(solve_schema.id, "solve-request");
        assert!(solve_schema.schema.schema.object.is_some() || solve_schema.schema.schema.subschemas.is_some());
    }
}
