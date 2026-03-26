use crate::public_errors::{
    evaluate_requires_initial_schedule_error, infeasible_problem_error, internal_error,
    parse_error, public_error_to_js_value,
};
use serde::Serialize;
use serde::de::DeserializeOwned;
use solver_contracts::types::{
    PublicErrorEnvelope, RecommendSettingsRequest, ResultSummary, ValidateResponse,
    ValidationIssue,
};
use solver_core::{
    calculate_recommended_settings, default_solver_configuration, run_solver, run_solver_with_progress,
    models::{ApiInput, ProgressUpdate, SolverConfiguration, SolverResult},
    solver::State,
};
use wasm_bindgen::JsValue;

const MAX_SAFE_JS_INTEGER: u64 = 9_007_199_254_740_991;

fn random_js_safe_seed() -> Result<u64, PublicErrorEnvelope> {
    let mut bytes = [0_u8; 8];
    getrandom::fill(&mut bytes).map_err(|error| {
        internal_error(
            "solve",
            format!("Failed to generate a browser-safe solver seed: {}", error),
        )
    })?;

    Ok(u64::from_le_bytes(bytes) & MAX_SAFE_JS_INTEGER)
}

fn ensure_browser_safe_seed(request: &ApiInput) -> Result<ApiInput, PublicErrorEnvelope> {
    if request.solver.seed.is_some() {
        return Ok(request.clone());
    }

    let mut adjusted = request.clone();
    adjusted.solver.seed = Some(random_js_safe_seed()?);
    Ok(adjusted)
}

pub fn solve_contract_js(input: JsValue) -> Result<JsValue, JsValue> {
    let request: ApiInput = parse_js_value(input, "solve", &["solve-request"])?;
    let result = solve_contract(&request).map_err(|error| public_error_to_js_value(&error))?;
    serialize_output(&result, "solve")
}

pub fn solve_with_progress_js(
    input: JsValue,
    progress_callback: Option<js_sys::Function>,
) -> Result<JsValue, JsValue> {
    let request: ApiInput = parse_js_value(input, "solve", &["solve-request"])?;
    let result = solve_with_progress_contract(&request, progress_callback)
        .map_err(|error| public_error_to_js_value(&error))?;
    serialize_output(&result, "solve")
}

pub fn validate_problem_contract_js(input: JsValue) -> Result<JsValue, JsValue> {
    let request: ApiInput = parse_js_value(input, "validate-problem", &["validate-request"])?;
    let response = validate_problem_contract(&request);
    serialize_output(&response, "validate-problem")
}

pub fn get_default_solver_configuration_js() -> Result<JsValue, JsValue> {
    let settings = get_default_solver_configuration();
    serialize_output(&settings, "get-default-solver-configuration")
}

pub fn recommend_settings_js(input: JsValue) -> Result<JsValue, JsValue> {
    let request: RecommendSettingsRequest = parse_js_value(
        input,
        "recommend-settings",
        &["recommend-settings-request"],
    )?;
    let settings = recommend_settings_contract(&request)
        .map_err(|error| public_error_to_js_value(&error))?;
    serialize_output(&settings, "recommend-settings")
}

pub fn evaluate_input_contract_js(input: JsValue) -> Result<JsValue, JsValue> {
    let request: ApiInput = parse_js_value(input, "evaluate-input", &["solve-request"])?;
    let result = evaluate_input_contract(&request)
        .map_err(|error| public_error_to_js_value(&error))?;
    serialize_output(&result, "evaluate-input")
}

pub fn inspect_result_contract_js(result: JsValue) -> Result<JsValue, JsValue> {
    let result: SolverResult = parse_js_value(result, "inspect-result", &["solve-response"])?;
    let summary = inspect_result_contract(&result);
    serialize_output(&summary, "inspect-result")
}

pub fn solve_contract(request: &ApiInput) -> Result<SolverResult, PublicErrorEnvelope> {
    let adjusted = ensure_browser_safe_seed(request)?;
    run_solver(&adjusted).map_err(|error| infeasible_problem_error("solve", error.to_string()))
}

pub fn solve_with_progress_contract(
    request: &ApiInput,
    progress_callback: Option<js_sys::Function>,
) -> Result<SolverResult, PublicErrorEnvelope> {
    let adjusted = ensure_browser_safe_seed(request)?;

    if let Some(js_callback) = progress_callback {
        let rust_callback = Box::new(move |progress: &ProgressUpdate| -> bool {
            let progress_value = match serde_wasm_bindgen::to_value(progress) {
                Ok(value) => value,
                Err(error) => {
                    web_sys::console::error_1(
                        &format!("Failed to serialize progress update: {}", error).into(),
                    );
                    return true;
                }
            };

            match js_callback.call1(&JsValue::NULL, &progress_value) {
                Ok(result) => result.as_bool().unwrap_or(true),
                Err(error) => {
                    web_sys::console::error_1(
                        &format!("Progress callback error: {:?}", error).into(),
                    );
                    true
                }
            }
        }) as Box<dyn Fn(&ProgressUpdate) -> bool>;

        let rust_callback: Box<dyn Fn(&ProgressUpdate) -> bool + Send> =
            unsafe { std::mem::transmute(rust_callback) };

        run_solver_with_progress(&adjusted, Some(&rust_callback))
            .map_err(|error| infeasible_problem_error("solve", error.to_string()))
    } else {
        run_solver(&adjusted).map_err(|error| infeasible_problem_error("solve", error.to_string()))
    }
}

pub fn validate_problem_contract(request: &ApiInput) -> ValidateResponse {
    match State::new(request) {
        Ok(_) => ValidateResponse {
            valid: true,
            issues: Vec::new(),
        },
        Err(error) => ValidateResponse {
            valid: false,
            issues: vec![ValidationIssue {
                code: Some("infeasible-problem".to_string()),
                message: error.to_string(),
                path: None,
            }],
        },
    }
}

pub fn get_default_solver_configuration() -> SolverConfiguration {
    default_solver_configuration()
}

pub fn recommend_settings_contract(
    request: &RecommendSettingsRequest,
) -> Result<SolverConfiguration, PublicErrorEnvelope> {
    calculate_recommended_settings(
        &request.problem_definition,
        &request.objectives,
        &request.constraints,
        request.desired_runtime_seconds,
    )
    .map_err(|error| infeasible_problem_error("recommend-settings", error.to_string()))
}

pub fn evaluate_input_contract(
    request: &ApiInput,
) -> Result<SolverResult, PublicErrorEnvelope> {
    let adjusted = ensure_browser_safe_seed(request)?;

    if request.initial_schedule.is_none() {
        return Err(evaluate_requires_initial_schedule_error());
    }

    let mut state = State::new(&adjusted)
        .map_err(|error| infeasible_problem_error("evaluate-input", error.to_string()))?;
    state._recalculate_locations_from_schedule();
    state._recalculate_scores();
    Ok(state.to_solver_result(state.current_cost, 0))
}

pub fn inspect_result_contract(result: &SolverResult) -> ResultSummary {
    ResultSummary::from(result)
}

fn parse_js_value<T: DeserializeOwned>(
    value: JsValue,
    operation_id: &str,
    schema_ids: &[&str],
) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(value).map_err(|error| {
        public_error_to_js_value(&parse_error(
            operation_id,
            format!("Failed to parse request payload: {}", error),
            schema_ids,
        ))
    })
}

fn serialize_output<T: Serialize>(value: &T, operation_id: &str) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value).map_err(|error| {
        public_error_to_js_value(&internal_error(
            operation_id,
            format!("Failed to serialize response payload: {}", error),
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::{
        evaluate_input_contract, get_default_solver_configuration, inspect_result_contract,
        recommend_settings_contract, solve_contract, solve_with_progress_contract,
        validate_problem_contract,
        MAX_SAFE_JS_INTEGER,
    };
    use solver_contracts::types::RecommendSettingsRequest;
    use solver_core::models::{
        Group, Objective, Person, ProblemDefinition, SimulatedAnnealingParams,
        SolverConfiguration, SolverParams, StopConditions,
    };
    use std::collections::HashMap;

    fn valid_input() -> solver_core::models::ApiInput {
        solver_core::models::ApiInput {
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
                    max_iterations: Some(10),
                    time_limit_seconds: None,
                    no_improvement_iterations: Some(5),
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

    #[test]
    fn solve_contract_returns_structured_result() {
        let result = solve_contract(&valid_input()).expect("solve succeeds");
        assert!(!result.schedule.is_empty());
        assert!(result.final_score.is_finite());
        assert!(result.effective_seed.unwrap_or_default() <= MAX_SAFE_JS_INTEGER);
    }

    #[test]
    fn solve_with_progress_contract_runs_without_callback() {
        let result = solve_with_progress_contract(&valid_input(), None).expect("solve succeeds");
        assert!(!result.schedule.is_empty());
        assert!(result.final_score.is_finite());
        assert!(result.effective_seed.unwrap_or_default() <= MAX_SAFE_JS_INTEGER);
    }

    #[test]
    fn validate_contract_returns_shared_validation_shape() {
        let response = validate_problem_contract(&valid_input());
        assert!(response.valid);
        assert!(response.issues.is_empty());
    }

    #[test]
    fn default_solver_configuration_uses_public_defaults() {
        let configuration = get_default_solver_configuration();
        assert_eq!(configuration.solver_type, "SimulatedAnnealing");
        assert_eq!(configuration.stop_conditions.max_iterations, Some(10_000));
        assert_eq!(configuration.stop_conditions.time_limit_seconds, Some(30));
    }

    #[test]
    fn recommend_settings_contract_uses_explicit_runtime_request() {
        let input = valid_input();
        let request = RecommendSettingsRequest {
            problem_definition: input.problem,
            objectives: input.objectives,
            constraints: input.constraints,
            desired_runtime_seconds: 11,
        };
        let configuration = recommend_settings_contract(&request).expect("recommend succeeds");
        assert_eq!(configuration.stop_conditions.time_limit_seconds, Some(11));
    }

    #[test]
    fn evaluate_contract_requires_initial_schedule() {
        let envelope = evaluate_input_contract(&valid_input()).expect_err("missing schedule errors");
        assert_eq!(envelope.error.code, "invalid-input");
        assert_eq!(envelope.error.where_path.as_deref(), Some("initial_schedule"));
        assert!(envelope.error.related_help.iter().any(|target| target == "evaluate-input"));
    }

    #[test]
    fn inspect_result_contract_returns_summary_shape() {
        let solve_result = solver_core::run_solver(&valid_input()).expect("solve result");
        let summary = inspect_result_contract(&solve_result);
        assert!(summary.final_score.is_finite());
        assert!(summary.unique_contacts >= 0);
    }
}
