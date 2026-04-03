use crate::api::contract_surface::{
    binding_for_operation_id, public_contract_bindings, HttpContractBinding,
};
use axum::{
    body::Bytes,
    extract::Path,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use gm_contracts::{
    bootstrap::bootstrap_spec,
    errors::{
        error_spec, error_specs, supported_constraint_kind_alternatives, PublicErrorSpec,
        INFEASIBLE_SCENARIO_ERROR, INVALID_INPUT_ERROR, UNKNOWN_ERROR_CODE_ERROR,
        UNKNOWN_OPERATION_ERROR, UNKNOWN_SCHEMA_ERROR, UNSUPPORTED_CONSTRAINT_KIND_ERROR,
        UNSUPPORTED_CONSTRAINT_KIND_PATH,
    },
    examples::example_spec,
    operations::{local_help, operation_spec, OperationSpec},
    schemas::{export_schema, schema_specs},
    types::{
        PublicError, PublicErrorEnvelope, RecommendSettingsRequest, ResultSummary,
        SolveRequest, SolverCatalogResponse, SolverDescriptorContract, ValidateRequest,
        ValidateResponse, ValidationIssue,
    },
};
use gm_core::{
    available_solver_descriptors, calculate_recommended_settings, default_solver_configuration,
    models::{ApiInput, SolverConfiguration, SolverKind, SolverResult},
    run_solver,
    solver_descriptor,
};
use schemars::Schema;
use serde::{de::DeserializeOwned, Serialize};

#[derive(Serialize)]
pub struct HelpOperationSummary {
    pub operation_id: &'static str,
    pub summary: &'static str,
    pub route: Option<RouteRef>,
    pub help_path: String,
}

#[derive(Serialize)]
pub struct BootstrapHelpResponse {
    pub title: &'static str,
    pub summary: &'static str,
    pub discovery_note: &'static str,
    pub operations: Vec<HelpOperationSummary>,
}

#[derive(Serialize)]
pub struct OperationHelpResponse {
    pub operation: OperationSpec,
    pub route: Option<RouteRef>,
    pub help_path: String,
    pub examples: Vec<OperationExampleSummary>,
    pub related_operations: Vec<HelpOperationSummary>,
}

#[derive(Serialize)]
pub struct OperationExampleSummary {
    pub id: &'static str,
    pub summary: &'static str,
    pub description: &'static str,
}

#[derive(Serialize)]
pub struct RouteRef {
    pub method: &'static str,
    pub path: &'static str,
}

#[derive(Serialize)]
pub struct SchemaSummary {
    pub id: &'static str,
    pub version: &'static str,
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    body: PublicErrorEnvelope,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body)).into_response()
    }
}

pub async fn bootstrap_help_handler() -> Json<BootstrapHelpResponse> {
    let bootstrap = bootstrap_spec();
    let operations = bootstrap
        .top_level_operation_ids
        .iter()
        .filter_map(|operation_id| {
            let operation = operation_spec(operation_id)?;
            Some(HelpOperationSummary {
                operation_id: operation.id,
                summary: operation.summary,
                route: route_for_operation(operation.id),
                help_path: help_path(operation.id),
            })
        })
        .collect();

    Json(BootstrapHelpResponse {
        title: bootstrap.title,
        summary: bootstrap.summary,
        discovery_note: bootstrap.discovery_note,
        operations,
    })
}

pub async fn operation_help_handler(
    Path(operation_id): Path<String>,
) -> Result<Json<OperationHelpResponse>, ApiError> {
    let help =
        local_help(&operation_id).ok_or_else(|| unknown_operation_api_error(&operation_id))?;
    let examples = help
        .operation
        .example_ids
        .iter()
        .filter_map(|example_id| example_spec(example_id))
        .map(|example| OperationExampleSummary {
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
            Some(HelpOperationSummary {
                operation_id: operation.id,
                summary: operation.summary,
                route: route_for_operation(operation.id),
                help_path: help_path(operation.id),
            })
        })
        .collect();

    Ok(Json(OperationHelpResponse {
        operation: help.operation.clone(),
        route: route_for_operation(help.operation.id),
        help_path: help_path(help.operation.id),
        examples,
        related_operations,
    }))
}

pub async fn schema_list_handler() -> Json<Vec<SchemaSummary>> {
    Json(
        schema_specs()
            .iter()
            .map(|spec| SchemaSummary {
                id: spec.id,
                version: spec.version,
            })
            .collect(),
    )
}

pub async fn schema_get_handler(Path(schema_id): Path<String>) -> Result<Json<Schema>, ApiError> {
    export_schema(&schema_id)
        .map(Json)
        .ok_or_else(|| unknown_schema_api_error(&schema_id))
}

pub async fn error_list_handler() -> Json<Vec<PublicErrorSpec>> {
    Json(error_specs().to_vec())
}

pub async fn error_get_handler(
    Path(error_code): Path<String>,
) -> Result<Json<PublicErrorSpec>, ApiError> {
    error_specs()
        .iter()
        .find(|spec| spec.code == error_code)
        .cloned()
        .map(Json)
        .ok_or_else(|| unknown_error_code_api_error(&error_code))
}

pub async fn solve_handler(body: Bytes) -> Result<Json<SolverResult>, ApiError> {
    let payload: SolveRequest = parse_json_body(&body, "solve", &["solve-request"])?;
    let payload: ApiInput = payload.into();
    let result =
        run_solver(&payload).map_err(|error| map_solver_error(format!("{:?}", error), "solve"))?;
    Ok(Json(result))
}

pub async fn list_solvers_handler() -> Json<SolverCatalogResponse> {
    Json(SolverCatalogResponse {
        solvers: available_solver_descriptors()
            .iter()
            .map(SolverDescriptorContract::from)
            .collect(),
    })
}

pub async fn get_solver_descriptor_handler(
    Path(solver_id): Path<String>,
) -> Result<Json<SolverDescriptorContract>, ApiError> {
    let kind = SolverKind::parse_config_id(&solver_id).map_err(|error| {
        api_error(
            INVALID_INPUT_ERROR,
            StatusCode::UNPROCESSABLE_ENTITY,
            error,
            Some("solver_id".to_string()),
            available_solver_descriptors()
                .iter()
                .map(|descriptor| descriptor.kind.canonical_id().to_string())
                .collect(),
            Some(vec![help_path("get-solver-descriptor")]),
        )
    })?;

    Ok(Json(SolverDescriptorContract::from(solver_descriptor(kind))))
}

pub async fn validate_scenario_handler(body: Bytes) -> Result<Json<ValidateResponse>, ApiError> {
    let payload: ValidateRequest =
        parse_json_body(&body, "validate-scenario", &["validate-request"])?;
    let payload: ApiInput = payload.into();
    use gm_core::solver::State;
    let response = match State::new(&payload) {
        Ok(_) => ValidateResponse {
            valid: true,
            issues: Vec::new(),
        },
        Err(error) => ValidateResponse {
            valid: false,
            issues: vec![ValidationIssue {
                code: Some("infeasible-scenario".to_string()),
                message: format!("{:?}", error),
                path: None,
            }],
        },
    };
    Ok(Json(response))
}

pub async fn default_solver_configuration_handler() -> Json<SolverConfiguration> {
    Json(default_solver_configuration())
}

pub async fn recommend_settings_handler(
    body: Bytes,
) -> Result<Json<SolverConfiguration>, ApiError> {
    let request: RecommendSettingsRequest =
        parse_json_body(&body, "recommend-settings", &["recommend-settings-request"])?;
    let scenario_definition: gm_core::models::ProblemDefinition = (&request.scenario).into();
    let recommended = calculate_recommended_settings(
        &scenario_definition,
        &request.objectives,
        &request.constraints,
        request.desired_runtime_seconds,
    )
    .map_err(|error| map_solver_error(format!("{:?}", error), "recommend-settings"))?;
    Ok(Json(recommended))
}

pub async fn evaluate_input_handler(body: Bytes) -> Result<Json<SolverResult>, ApiError> {
    let payload: SolveRequest = parse_json_body(&body, "evaluate-input", &["solve-request"])?;
    let mut payload: ApiInput = payload.into();
    if payload.initial_schedule.is_none() {
        return Err(api_error(
            INVALID_INPUT_ERROR,
            StatusCode::UNPROCESSABLE_ENTITY,
            "Evaluate input requires initial_schedule in the request body",
            Some("initial_schedule".to_string()),
            vec!["provide initial_schedule".to_string()],
            Some(vec![help_path("evaluate-input")]),
        ));
    }
    payload.solver.stop_conditions.max_iterations = Some(0);
    let result = run_solver(&payload)
        .map_err(|error| map_solver_error(format!("{:?}", error), "evaluate-input"))?;
    Ok(Json(result))
}

pub async fn inspect_result_handler(body: Bytes) -> Result<Json<ResultSummary>, ApiError> {
    let result: SolverResult = parse_json_body(&body, "inspect-result", &["solve-response"])?;
    Ok(Json(ResultSummary::from(&result)))
}

fn route_for_operation(operation_id: &str) -> Option<RouteRef> {
    binding_for_operation_id(operation_id).map(route_ref)
}

fn help_path(operation_id: &str) -> String {
    format!("/api/v1/help/{operation_id}")
}

#[allow(clippy::result_large_err)]
fn parse_json_body<T: DeserializeOwned>(
    body: &Bytes,
    operation_id: &str,
    schema_ids: &[&str],
) -> Result<T, ApiError> {
    serde_json::from_slice::<T>(body).map_err(|error| {
        let message = format!("Failed to parse request JSON: {}", error);
        if message.contains("unknown variant") || message.contains("expected one of") {
            return api_error(
                UNSUPPORTED_CONSTRAINT_KIND_ERROR,
                StatusCode::UNPROCESSABLE_ENTITY,
                message,
                Some(UNSUPPORTED_CONSTRAINT_KIND_PATH.to_string()),
                supported_constraint_kind_alternatives(),
                Some(vec![
                    help_path("validate-scenario"),
                    help_path("get-schema"),
                ]),
            );
        }

        api_error(
            INVALID_INPUT_ERROR,
            StatusCode::UNPROCESSABLE_ENTITY,
            message,
            Some(format!("line {}, column {}", error.line(), error.column())),
            schema_ids.iter().map(|value| value.to_string()).collect(),
            Some(vec![help_path(operation_id)]),
        )
    })
}

fn api_error(
    code: &str,
    status: StatusCode,
    message: impl Into<String>,
    where_path: Option<String>,
    valid_alternatives: Vec<String>,
    related_help_override: Option<Vec<String>>,
) -> ApiError {
    let spec = error_spec(code).expect("registered error spec");
    ApiError {
        status,
        body: PublicErrorEnvelope {
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
                        .map(|operation_id| help_path(operation_id))
                        .collect()
                }),
            },
        },
    }
}

fn unknown_schema_api_error(schema_id: &str) -> ApiError {
    api_error(
        UNKNOWN_SCHEMA_ERROR,
        StatusCode::NOT_FOUND,
        format!("Unknown schema id '{}'", schema_id),
        Some("schema_id".to_string()),
        schema_specs()
            .iter()
            .map(|spec| spec.id.to_string())
            .collect(),
        Some(vec![help_path("get-schema")]),
    )
}

fn unknown_error_code_api_error(error_code: &str) -> ApiError {
    api_error(
        UNKNOWN_ERROR_CODE_ERROR,
        StatusCode::NOT_FOUND,
        format!("Unknown error code '{}'", error_code),
        Some("error_code".to_string()),
        error_specs()
            .iter()
            .map(|spec| spec.code.to_string())
            .collect(),
        Some(vec![help_path("inspect-errors")]),
    )
}

fn unknown_operation_api_error(operation_id: &str) -> ApiError {
    api_error(
        UNKNOWN_OPERATION_ERROR,
        StatusCode::NOT_FOUND,
        format!("Unknown operation '{}'", operation_id),
        Some("operation_id".to_string()),
        bootstrap_spec()
            .top_level_operation_ids
            .iter()
            .map(|value| value.to_string())
            .collect(),
        Some(vec!["/api/v1/help".to_string()]),
    )
}

fn map_solver_error(message: String, operation_id: &str) -> ApiError {
    if message.contains("unknown variant") || message.contains("expected one of") {
        return api_error(
            UNSUPPORTED_CONSTRAINT_KIND_ERROR,
            StatusCode::UNPROCESSABLE_ENTITY,
            message,
            Some(UNSUPPORTED_CONSTRAINT_KIND_PATH.to_string()),
            supported_constraint_kind_alternatives(),
            Some(vec![
                help_path("validate-scenario"),
                help_path("get-schema"),
            ]),
        );
    }

    api_error(
        INFEASIBLE_SCENARIO_ERROR,
        StatusCode::UNPROCESSABLE_ENTITY,
        message,
        None,
        Vec::new(),
        Some(vec![
            help_path(operation_id),
            help_path("validate-scenario"),
        ]),
    )
}

fn route_ref(binding: &HttpContractBinding) -> RouteRef {
    RouteRef {
        method: binding.method,
        path: binding.route_path,
    }
}

#[allow(dead_code)]
fn _public_routes_for_docs() -> Vec<RouteRef> {
    public_contract_bindings().map(route_ref).collect()
}
