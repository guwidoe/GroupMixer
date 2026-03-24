use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde::de::DeserializeOwned;
use serde_json::json;
use solver_core::models::{
    ApiInput, Group, Objective, Person, ProblemDefinition, SimulatedAnnealingParams,
    SolverConfiguration, SolverParams, StopConditions,
};
use solver_server::api::handlers::{AppState, CreateJobResponse};
use solver_server::api::routes::create_router;
use solver_server::jobs::manager::{Job, JobManager, JobStatus};
use std::collections::HashMap;
use std::time::Duration;
use tower::util::ServiceExt;
use uuid::Uuid;

fn valid_input() -> ApiInput {
    ApiInput {
        initial_schedule: None,
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "p0".to_string(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "p1".to_string(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "p2".to_string(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "p3".to_string(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
            ],
            groups: vec![
                Group {
                    id: "g0".to_string(),
                    size: 2,
                },
                Group {
                    id: "g1".to_string(),
                    size: 2,
                },
            ],
            num_sessions: 2,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![],
        solver: SolverConfiguration {
            solver_type: "SimulatedAnnealing".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(100),
                time_limit_seconds: None,
                no_improvement_iterations: Some(25),
            },
            solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                initial_temperature: 5.0,
                final_temperature: 0.1,
                cooling_schedule: "geometric".to_string(),
                reheat_after_no_improvement: Some(0),
                reheat_cycles: Some(0),
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            allowed_sessions: None,
        },
    }
}

fn invalid_input() -> ApiInput {
    let mut input = valid_input();
    input.problem.groups = vec![Group {
        id: "g0".to_string(),
        size: 1,
    }];
    input
}

async fn json_response<T: DeserializeOwned>(response: axum::response::Response) -> T {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

async fn wait_for_terminal_job(manager: &JobManager, job_id: Uuid) -> Job {
    for _ in 0..100 {
        if let Some(job) = manager.get_job(job_id) {
            match job.status {
                JobStatus::Completed | JobStatus::Failed => return job,
                JobStatus::Pending | JobStatus::Running => {}
            }
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    panic!("job {job_id} did not reach a terminal state in time");
}

#[tokio::test]
async fn router_creates_jobs_and_serves_status_and_result() {
    let job_manager = JobManager::new();
    let app_state = AppState {
        job_manager: job_manager.clone(),
    };
    let app = create_router(app_state);

    let create_request = Request::builder()
        .method("POST")
        .uri("/api/v1/jobs")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&valid_input()).unwrap()))
        .unwrap();

    let create_response = app.clone().oneshot(create_request).await.unwrap();
    assert_eq!(create_response.status(), StatusCode::CREATED);

    let create_body: CreateJobResponse = json_response(create_response).await;
    let completed_job = wait_for_terminal_job(&job_manager, create_body.job_id).await;
    assert_eq!(completed_job.status, JobStatus::Completed);
    assert!(completed_job
        .result
        .as_deref()
        .is_some_and(|result| result.contains("schedule")));

    let status_request = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/jobs/{}/status", create_body.job_id))
        .body(Body::empty())
        .unwrap();
    let status_response = app.clone().oneshot(status_request).await.unwrap();
    assert_eq!(status_response.status(), StatusCode::OK);
    let status_job: Job = json_response(status_response).await;
    assert_eq!(status_job.status, JobStatus::Completed);
    assert_eq!(status_job.id, create_body.job_id);

    let result_request = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/jobs/{}/result", create_body.job_id))
        .body(Body::empty())
        .unwrap();
    let result_response = app.oneshot(result_request).await.unwrap();
    assert_eq!(result_response.status(), StatusCode::OK);
    let result_job: Job = json_response(result_response).await;
    assert_eq!(result_job.status, JobStatus::Completed);
    assert_eq!(result_job.id, create_body.job_id);
    assert_eq!(result_job.result, status_job.result);
}

#[tokio::test]
async fn router_rejects_invalid_json_and_unknown_jobs() {
    let app = create_router(AppState {
        job_manager: JobManager::new(),
    });

    let invalid_json_request = Request::builder()
        .method("POST")
        .uri("/api/v1/jobs")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"problem":"nope"}"#))
        .unwrap();
    let invalid_json_response = app.clone().oneshot(invalid_json_request).await.unwrap();
    assert_eq!(
        invalid_json_response.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );

    let missing_id = Uuid::new_v4();
    let status_request = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/jobs/{missing_id}/status"))
        .body(Body::empty())
        .unwrap();
    let status_response = app.clone().oneshot(status_request).await.unwrap();
    assert_eq!(status_response.status(), StatusCode::NOT_FOUND);

    let result_request = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/jobs/{missing_id}/result"))
        .body(Body::empty())
        .unwrap();
    let result_response = app.oneshot(result_request).await.unwrap();
    assert_eq!(result_response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn job_manager_tracks_success_failure_and_multiple_jobs() {
    let manager = JobManager::new();

    let ok_job_id = manager.create_job(valid_input());
    let failed_job_id = manager.create_job(invalid_input());
    let second_ok_job_id = manager.create_job(valid_input());

    assert_ne!(ok_job_id, failed_job_id);
    assert_ne!(ok_job_id, second_ok_job_id);
    assert_ne!(failed_job_id, second_ok_job_id);

    let ok_job = wait_for_terminal_job(&manager, ok_job_id).await;
    let failed_job = wait_for_terminal_job(&manager, failed_job_id).await;
    let second_ok_job = wait_for_terminal_job(&manager, second_ok_job_id).await;

    assert_eq!(ok_job.status, JobStatus::Completed);
    assert_eq!(second_ok_job.status, JobStatus::Completed);
    assert_eq!(failed_job.status, JobStatus::Failed);

    assert!(ok_job
        .result
        .as_deref()
        .is_some_and(|result| result.contains("schedule")));
    assert!(failed_job.result.as_deref().is_some_and(
        |result| result.contains("ValidationError") || result.contains("Constraint violation")
    ));
}

#[tokio::test]
async fn job_status_progresses_beyond_pending_after_creation() {
    let manager = JobManager::new();
    let job_id = manager.create_job(valid_input());

    let mut saw_non_pending = false;
    for _ in 0..50 {
        let job = manager.get_job(job_id).expect("job should exist");
        if job.status != JobStatus::Pending {
            saw_non_pending = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    assert!(saw_non_pending, "job should progress past Pending");
}

#[tokio::test]
async fn create_job_route_returns_parseable_uuid_payload() {
    let app = create_router(AppState {
        job_manager: JobManager::new(),
    });

    let request = Request::builder()
        .method("POST")
        .uri("/api/v1/jobs")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&valid_input()).unwrap()))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    let body: serde_json::Value = json_response(response).await;
    assert!(body.get("job_id").is_some());
    assert!(Uuid::parse_str(body.get("job_id").unwrap().as_str().unwrap()).is_ok());
    assert_eq!(body, json!({ "job_id": body["job_id"].clone() }));
}
