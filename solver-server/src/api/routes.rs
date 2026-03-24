use super::handlers::{
    create_job_handler, get_job_result_handler, get_job_status_handler, AppState,
};
use axum::{
    routing::{get, post},
    Router,
};

pub fn create_router(app_state: AppState) -> Router {
    Router::new()
        .route("/api/v1/jobs", post(create_job_handler))
        .route("/api/v1/jobs/{job_id}/status", get(get_job_status_handler))
        .route("/api/v1/jobs/{job_id}/result", get(get_job_result_handler))
        .with_state(app_state)
}
