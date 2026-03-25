use super::handlers::{
    bootstrap_help_handler, create_job_handler, default_solver_configuration_handler,
    error_get_handler, error_list_handler, evaluate_input_handler, get_job_result_handler,
    get_job_status_handler, inspect_result_handler, operation_help_handler,
    recommend_settings_handler, schema_get_handler, schema_list_handler, solve_handler,
    validate_problem_handler, AppState,
};
use axum::{
    routing::{get, post},
    Router,
};

pub fn create_router(app_state: AppState) -> Router {
    Router::new()
        .route("/api/v1/help", get(bootstrap_help_handler))
        .route("/api/v1/help/{operation_id}", get(operation_help_handler))
        .route("/api/v1/solve", post(solve_handler))
        .route("/api/v1/validate-problem", post(validate_problem_handler))
        .route("/api/v1/default-solver-configuration", get(default_solver_configuration_handler))
        .route("/api/v1/recommend-settings", post(recommend_settings_handler))
        .route("/api/v1/evaluate-input", post(evaluate_input_handler))
        .route("/api/v1/inspect-result", post(inspect_result_handler))
        .route("/api/v1/schemas", get(schema_list_handler))
        .route("/api/v1/schemas/{schema_id}", get(schema_get_handler))
        .route("/api/v1/errors", get(error_list_handler))
        .route("/api/v1/errors/{error_code}", get(error_get_handler))
        .route("/api/v1/jobs", post(create_job_handler))
        .route("/api/v1/jobs/{job_id}/status", get(get_job_status_handler))
        .route("/api/v1/jobs/{job_id}/result", get(get_job_result_handler))
        .with_state(app_state)
}
