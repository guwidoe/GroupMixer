use crate::api::contract_surface::{binding_for_operation_id, public_contract_bindings, HttpContractBinding};
use crate::jobs::manager::JobManager;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use schemars::schema::RootSchema;
use serde::{Deserialize, Serialize};
use solver_contracts::{
    bootstrap::bootstrap_spec,
    errors::{error_specs, PublicErrorSpec},
    examples::example_spec,
    operations::{local_help, operation_spec, OperationSpec},
    schemas::{export_schema, schema_specs},
    types::{ResultSummary, ValidateResponse},
};
use solver_core::{
    calculate_recommended_settings,
    models::{ApiInput, ProblemDefinition, SolverConfiguration, SolverResult},
    run_solver,
};
use uuid::Uuid;

// The shared state that holds our JobManager
#[derive(Clone)]
pub struct AppState {
    pub job_manager: JobManager,
}

#[derive(Serialize, Deserialize)]
pub struct CreateJobResponse {
    pub job_id: Uuid,
}

#[derive(Serialize)]
pub struct HelpOperationSummary {
    pub operation_id: &'static str,
    pub summary: &'static str,
    pub route: Option<RouteRef>,
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

pub async fn create_job_handler(
    State(state): State<AppState>,
    Json(payload): Json<ApiInput>,
) -> (StatusCode, Json<CreateJobResponse>) {
    let job_id = state.job_manager.create_job(payload);
    let response = CreateJobResponse { job_id };
    (StatusCode::CREATED, Json(response))
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
) -> Result<Json<OperationHelpResponse>, StatusCode> {
    let help = local_help(&operation_id).ok_or(StatusCode::NOT_FOUND)?;
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
            })
        })
        .collect();

    Ok(Json(OperationHelpResponse {
        operation: help.operation.clone(),
        route: route_for_operation(help.operation.id),
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

pub async fn schema_get_handler(Path(schema_id): Path<String>) -> Result<Json<RootSchema>, StatusCode> {
    export_schema(&schema_id)
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn error_list_handler() -> Json<Vec<PublicErrorSpec>> {
    Json(error_specs().to_vec())
}

pub async fn error_get_handler(
    Path(error_code): Path<String>,
) -> Result<Json<PublicErrorSpec>, StatusCode> {
    error_specs()
        .iter()
        .find(|spec| spec.code == error_code)
        .cloned()
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn solve_handler(Json(payload): Json<ApiInput>) -> Result<Json<SolverResult>, StatusCode> {
    let result = run_solver(&payload).map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)?;
    Ok(Json(result))
}

pub async fn validate_problem_handler(
    Json(payload): Json<ApiInput>,
) -> Json<ValidateResponse> {
    use solver_core::solver::State;
    let response = match State::new(&payload) {
        Ok(_) => ValidateResponse {
            valid: true,
            issues: Vec::new(),
        },
        Err(error) => ValidateResponse {
            valid: false,
            issues: vec![solver_contracts::types::ValidationIssue {
                code: Some("infeasible-problem".to_string()),
                message: format!("{:?}", error),
                path: None,
            }],
        },
    };
    Json(response)
}

pub async fn recommend_settings_handler(
    Json(problem): Json<ProblemDefinition>,
) -> Result<Json<SolverConfiguration>, StatusCode> {
    let recommended =
        calculate_recommended_settings(&problem, &[], &[], 30).map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)?;
    Ok(Json(recommended))
}

pub async fn evaluate_input_handler(
    Json(mut payload): Json<ApiInput>,
) -> Result<Json<SolverResult>, StatusCode> {
    if payload.initial_schedule.is_none() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    payload.solver.stop_conditions.max_iterations = Some(0);
    let result = run_solver(&payload).map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)?;
    Ok(Json(result))
}

pub async fn inspect_result_handler(
    Json(result): Json<SolverResult>,
) -> Json<ResultSummary> {
    Json(ResultSummary::from(&result))
}

#[axum::debug_handler]
pub async fn get_job_status_handler(
    State(state): State<AppState>,
    Path(job_id): Path<Uuid>,
) -> Result<Json<crate::jobs::manager::Job>, StatusCode> {
    if let Some(job) = state.job_manager.get_job(job_id) {
        Ok(Json(job))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

#[axum::debug_handler]
pub async fn get_job_result_handler(
    State(state): State<AppState>,
    Path(job_id): Path<Uuid>,
) -> Result<Json<crate::jobs::manager::Job>, StatusCode> {
    // For now, this is the same as the status handler.
    // In the future, it might return more detailed results.
    if let Some(job) = state.job_manager.get_job(job_id) {
        Ok(Json(job))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

fn route_for_operation(operation_id: &str) -> Option<RouteRef> {
    binding_for_operation_id(operation_id).map(route_ref)
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
