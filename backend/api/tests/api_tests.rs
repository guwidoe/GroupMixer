use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde::de::DeserializeOwned;
use serde_json::json;
use solver_core::models::{
    ApiInput, Group, Objective, Person, ProblemDefinition, SimulatedAnnealingParams,
    SolverConfiguration, SolverParams, StopConditions,
};
use solver_contracts::types::{RecommendSettingsRequest, ResultSummary, ValidateResponse};
use solver_server::api::{contract_surface::public_contract_bindings, handlers::{AppState, CreateJobResponse}};
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
                    session_sizes: None,
                },
                Group {
                    id: "g1".to_string(),
                    size: 2,
                    session_sizes: None,
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
            seed: None,
            move_policy: None,
            allowed_sessions: None,
        },
    }
}

fn invalid_input() -> ApiInput {
    let mut input = valid_input();
    input.problem.groups = vec![Group {
        id: "g0".to_string(),
        size: 1,
        session_sizes: None,
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

#[tokio::test]
async fn bootstrap_help_and_schema_endpoints_are_discoverable() {
    let app = create_router(AppState {
        job_manager: JobManager::new(),
    });

    let help_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/help")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(help_response.status(), StatusCode::OK);
    let help_json: serde_json::Value = json_response(help_response).await;
    assert_eq!(help_json["title"], "GroupMixer solver contracts");
    assert!(help_json["operations"].as_array().unwrap().iter().any(|entry| entry["operation_id"] == "solve"));

    let operation_help_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/help/solve")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(operation_help_response.status(), StatusCode::OK);
    let operation_help_json: serde_json::Value = json_response(operation_help_response).await;
    assert_eq!(operation_help_json["operation"]["id"], "solve");
    assert!(operation_help_json["examples"].as_array().unwrap().len() >= 1);
    assert_eq!(operation_help_json["help_path"], "/api/v1/help/solve");
    assert!(operation_help_json["related_operations"].as_array().unwrap().iter().any(|entry| entry["help_path"] == "/api/v1/help/validate-problem"));

    let schema_list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/schemas")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(schema_list_response.status(), StatusCode::OK);
    let schemas_json: serde_json::Value = json_response(schema_list_response).await;
    assert!(schemas_json.as_array().unwrap().iter().any(|entry| entry["id"] == "solve-request"));

    let schema_response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/schemas/solve-request")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(schema_response.status(), StatusCode::OK);
    let schema_json: serde_json::Value = json_response(schema_response).await;
    assert_eq!(schema_json["title"], "ApiInput");
}

#[tokio::test]
async fn contract_solver_endpoints_return_public_shapes() {
    let app = create_router(AppState {
        job_manager: JobManager::new(),
    });

    let solve_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/solve")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&valid_input()).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(solve_response.status(), StatusCode::OK);
    let solve_body: solver_core::models::SolverResult = json_response(solve_response).await;
    assert!(solve_body.schedule.contains_key("session_0"));

    let validate_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/validate-problem")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&valid_input()).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(validate_response.status(), StatusCode::OK);
    let validate_body: ValidateResponse = json_response(validate_response).await;
    assert!(validate_body.valid);

    let default_config_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/default-solver-configuration")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(default_config_response.status(), StatusCode::OK);
    let default_config_body: solver_core::models::SolverConfiguration =
        json_response(default_config_response).await;
    assert_eq!(default_config_body.stop_conditions.time_limit_seconds, Some(30));

    let recommend_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/recommend-settings")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::to_vec(&RecommendSettingsRequest {
                        problem_definition: valid_input().problem,
                        objectives: Vec::new(),
                        constraints: Vec::new(),
                        desired_runtime_seconds: 11,
                    })
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(recommend_response.status(), StatusCode::OK);
    let recommend_body: solver_core::models::SolverConfiguration = json_response(recommend_response).await;
    assert_eq!(recommend_body.solver_type, "SimulatedAnnealing");
    assert_eq!(recommend_body.stop_conditions.time_limit_seconds, Some(11));

    let evaluate_input = {
        let mut input = valid_input();
        input.initial_schedule = Some(
            serde_json::from_value(json!({"session_0": {"g0": ["p0", "p1"], "g1": ["p2", "p3"]}, "session_1": {"g0": ["p0", "p2"], "g1": ["p1", "p3"]}})).unwrap(),
        );
        input
    };
    let evaluate_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/evaluate-input")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&evaluate_input).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(evaluate_response.status(), StatusCode::OK);
    let evaluate_body: solver_core::models::SolverResult = json_response(evaluate_response).await;
    assert!(evaluate_body.schedule.contains_key("session_0"));

    let inspect_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/inspect-result")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&solve_body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(inspect_response.status(), StatusCode::OK);
    let summary: ResultSummary = json_response(inspect_response).await;
    assert_eq!(summary.unique_contacts, solve_body.unique_contacts);
}

#[tokio::test]
async fn error_catalog_endpoints_are_available() {
    let app = create_router(AppState {
        job_manager: JobManager::new(),
    });

    let errors_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/errors")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(errors_response.status(), StatusCode::OK);
    let errors_json: serde_json::Value = json_response(errors_response).await;
    assert!(errors_json.as_array().unwrap().iter().any(|entry| entry["code"] == "invalid-input"));

    let error_response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/errors/invalid-input")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(error_response.status(), StatusCode::OK);
    let error_json: serde_json::Value = json_response(error_response).await;
    assert_eq!(error_json["code"], "invalid-input");
}

#[tokio::test]
async fn contract_endpoints_emit_canonical_error_envelopes() {
    let app = create_router(AppState {
        job_manager: JobManager::new(),
    });

    let invalid_json_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/solve")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"problem": "#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(invalid_json_response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let invalid_json_body: serde_json::Value = json_response(invalid_json_response).await;
    assert_eq!(invalid_json_body["error"]["code"], "invalid-input");
    assert!(invalid_json_body["error"]["related_help"]
        .as_array()
        .unwrap()
        .iter()
        .any(|value| value == "/api/v1/help/solve"));

    let unsupported_constraint_input = json!({
        "problem": {
            "people": [
                {"id": "alice", "attributes": {}},
                {"id": "bob", "attributes": {}}
            ],
            "groups": [
                {"id": "team-1", "size": 2}
            ],
            "num_sessions": 1
        },
        "initial_schedule": null,
        "objectives": [],
        "constraints": [
            {"type": "ShouldBeTogether", "people": ["alice", "bob"]}
        ],
        "solver": {
            "solver_type": "SimulatedAnnealing",
            "stop_conditions": {"max_iterations": 1, "time_limit_seconds": null, "no_improvement_iterations": null},
            "solver_params": {"solver_type": "SimulatedAnnealing", "initial_temperature": 1.0, "final_temperature": 0.1, "cooling_schedule": "geometric", "reheat_cycles": 0, "reheat_after_no_improvement": 0},
            "logging": {},
            "telemetry": {},
            "seed": null,
            "move_policy": null,
            "allowed_sessions": null
        }
    });
    let unsupported_constraint_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/solve")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&unsupported_constraint_input).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unsupported_constraint_response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let unsupported_constraint_body: serde_json::Value = json_response(unsupported_constraint_response).await;
    assert_eq!(unsupported_constraint_body["error"]["code"], "unsupported-constraint-kind");
    assert!(unsupported_constraint_body["error"]["related_help"]
        .as_array()
        .unwrap()
        .iter()
        .any(|value| value == "/api/v1/help/validate-problem"));

    let unknown_schema_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/schemas/does-not-exist")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unknown_schema_response.status(), StatusCode::NOT_FOUND);
    let unknown_schema_body: serde_json::Value = json_response(unknown_schema_response).await;
    assert_eq!(unknown_schema_body["error"]["code"], "unknown-schema");
    assert!(unknown_schema_body["error"]["valid_alternatives"].as_array().unwrap().len() >= 1);

    let unknown_operation_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/help/does-not-exist")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unknown_operation_response.status(), StatusCode::NOT_FOUND);
    let unknown_operation_body: serde_json::Value = json_response(unknown_operation_response).await;
    assert_eq!(unknown_operation_body["error"]["code"], "unknown-operation");

    let unknown_error_response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/errors/does-not-exist")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unknown_error_response.status(), StatusCode::NOT_FOUND);
    let unknown_error_body: serde_json::Value = json_response(unknown_error_response).await;
    assert_eq!(unknown_error_body["error"]["code"], "unknown-error-code");
}

#[tokio::test]
async fn help_and_error_navigation_targets_resolve_locally() {
    let app = create_router(AppState {
        job_manager: JobManager::new(),
    });

    let solve_help_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/help/solve")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let solve_help: serde_json::Value = json_response(solve_help_response).await;
    let related_help_targets = solve_help["related_operations"].as_array().unwrap();
    assert!(!related_help_targets.is_empty());
    for target in related_help_targets {
        let help_path = target["help_path"].as_str().unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(help_path)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "related help path should resolve: {}", help_path);
    }

    let bad_schema_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/schemas/nope")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let bad_schema_body: serde_json::Value = json_response(bad_schema_response).await;
    for target in bad_schema_body["error"]["related_help"].as_array().unwrap() {
        let help_path = target.as_str().unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(help_path)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "error related help path should resolve: {}", help_path);
    }
}

#[tokio::test]
async fn public_contract_routes_stay_in_parity_with_contract_registry() {
    let app = create_router(AppState {
        job_manager: JobManager::new(),
    });

    let binding_operation_ids: Vec<_> = public_contract_bindings()
        .filter_map(|binding| binding.operation_id)
        .collect();
    assert!(binding_operation_ids.contains(&"solve"));
    assert!(binding_operation_ids.contains(&"get-schema"));
    assert!(binding_operation_ids.contains(&"inspect-errors"));

    for operation_id in binding_operation_ids {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/v1/help/{operation_id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "help route missing for operation {}", operation_id);
    }
}
