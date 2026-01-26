use crate::jobs::manager::JobManager;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use serde::Serialize;
use solver_core::models::ApiInput;
use uuid::Uuid;

// The shared state that holds our JobManager
#[derive(Clone)]
pub struct AppState {
    pub job_manager: JobManager,
}

#[derive(Serialize)]
pub struct CreateJobResponse {
    job_id: Uuid,
}

pub async fn create_job_handler(
    State(state): State<AppState>,
    Json(payload): Json<ApiInput>,
) -> (StatusCode, Json<CreateJobResponse>) {
    let job_id = state.job_manager.create_job(payload);
    let response = CreateJobResponse { job_id };
    (StatusCode::CREATED, Json(response))
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
