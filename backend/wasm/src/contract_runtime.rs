#![allow(clippy::result_large_err)]

use crate::public_errors::{
    evaluate_requires_initial_schedule_error, infeasible_scenario_error, internal_error,
    invalid_input_error, parse_error, public_error_to_js_value,
};
use gm_contracts::types::{
    PublicErrorEnvelope, RecommendSettingsRequest, ResultSummary, ValidateResponse, ValidationIssue,
};
use gm_core::{
    calculate_recommended_settings, default_solver_configuration,
    models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, ProgressUpdate,
        SolverConfiguration, SolverResult,
    },
    run_solver, run_solver_with_progress,
    solver::State,
};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde::Serialize;
use wasm_bindgen::JsValue;

const MAX_SAFE_JS_INTEGER: u64 = 9_007_199_254_740_991;

type WasmInitialSchedule =
    std::collections::HashMap<String, std::collections::HashMap<String, Vec<String>>>;

#[derive(Debug, Clone, Serialize)]
struct WasmProgressSnapshot {
    iteration: u64,
    max_iterations: u64,
    temperature: f64,
    current_score: f64,
    best_score: f64,
    current_contacts: i32,
    best_contacts: i32,
    repetition_penalty: i32,
    elapsed_seconds: f64,
    no_improvement_count: u64,
    clique_swaps_tried: u64,
    clique_swaps_accepted: u64,
    clique_swaps_rejected: u64,
    transfers_tried: u64,
    transfers_accepted: u64,
    transfers_rejected: u64,
    swaps_tried: u64,
    swaps_accepted: u64,
    swaps_rejected: u64,
    overall_acceptance_rate: f64,
    recent_acceptance_rate: f64,
    avg_attempted_move_delta: f64,
    avg_accepted_move_delta: f64,
    biggest_accepted_increase: f64,
    biggest_attempted_increase: f64,
    current_repetition_penalty: f64,
    current_balance_penalty: f64,
    current_constraint_penalty: f64,
    best_repetition_penalty: f64,
    best_balance_penalty: f64,
    best_constraint_penalty: f64,
    reheats_performed: u64,
    iterations_since_last_reheat: u64,
    local_optima_escapes: u64,
    avg_time_per_iteration_ms: f64,
    cooling_progress: f64,
    clique_swap_success_rate: f64,
    transfer_success_rate: f64,
    swap_success_rate: f64,
    score_variance: f64,
    search_efficiency: f64,
    #[serde(default)]
    effective_seed: Option<u64>,
    #[serde(default)]
    stop_reason: Option<gm_core::models::StopReason>,
}

#[derive(Debug, Clone, Deserialize)]
struct WasmScenarioContractInput {
    scenario: WasmScenario,
    #[serde(default)]
    initial_schedule: Option<WasmInitialSchedule>,
    #[serde(default)]
    construction_seed_schedule: Option<WasmInitialSchedule>,
}

#[derive(Debug, Clone, Deserialize)]
struct WasmScenarioRecommendSettingsRequest {
    scenario: WasmScenario,
    desired_runtime_seconds: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct WasmScenario {
    people: Vec<Person>,
    groups: Vec<Group>,
    num_sessions: u32,
    #[serde(default)]
    objectives: Vec<Objective>,
    #[serde(default)]
    constraints: Vec<Constraint>,
    settings: SolverConfiguration,
}

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
    let request = parse_wasm_scenario_input(input, "solve", &["solve-request"])?;
    let result = solve_contract(&request).map_err(|error| public_error_to_js_value(&error))?;
    serialize_output(&result, "solve")
}

pub fn solve_with_progress_js(
    input: JsValue,
    progress_callback: Option<js_sys::Function>,
) -> Result<JsValue, JsValue> {
    let request = parse_wasm_scenario_input(input, "solve", &["solve-request"])?;
    let result = solve_with_progress_contract(&request, progress_callback)
        .map_err(|error| public_error_to_js_value(&error))?;
    serialize_output(&result, "solve")
}

pub fn solve_with_progress_snapshot_js(
    input: JsValue,
    progress_callback: Option<js_sys::Function>,
) -> Result<JsValue, JsValue> {
    let request = parse_wasm_scenario_input(input, "solve", &["solve-request"])?;
    let result = solve_with_progress_snapshot_contract(&request, progress_callback)
        .map_err(|error| public_error_to_js_value(&error))?;
    serialize_output(&result, "solve")
}

pub fn validate_scenario_contract_js(input: JsValue) -> Result<JsValue, JsValue> {
    let request = parse_wasm_scenario_input(input, "validate-scenario", &["validate-request"])?;
    let response = validate_scenario_contract(&request);
    serialize_output(&response, "validate-scenario")
}

pub fn get_default_solver_configuration_js() -> Result<JsValue, JsValue> {
    let settings = get_default_solver_configuration();
    serialize_output(&settings, "get-default-solver-configuration")
}

pub fn recommend_settings_js(input: JsValue) -> Result<JsValue, JsValue> {
    let request = parse_wasm_recommend_settings_request(
        input,
        "recommend-settings",
        &["recommend-settings-request"],
    )?;
    let settings =
        recommend_settings_contract(&request).map_err(|error| public_error_to_js_value(&error))?;
    serialize_output(&settings, "recommend-settings")
}

pub fn evaluate_input_contract_js(input: JsValue) -> Result<JsValue, JsValue> {
    let request = parse_wasm_scenario_input(input, "evaluate-input", &["solve-request"])?;
    let result =
        evaluate_input_contract(&request).map_err(|error| public_error_to_js_value(&error))?;
    serialize_output(&result, "evaluate-input")
}

pub fn inspect_result_contract_js(result: JsValue) -> Result<JsValue, JsValue> {
    let result: SolverResult = parse_js_value(result, "inspect-result", &["solve-response"])?;
    let summary = inspect_result_contract(&result);
    serialize_output(&summary, "inspect-result")
}

pub fn solve_contract(request: &ApiInput) -> Result<SolverResult, PublicErrorEnvelope> {
    let adjusted = ensure_browser_safe_seed(request)?;
    run_solver(&adjusted).map_err(|error| infeasible_scenario_error("solve", error.to_string()))
}

pub fn solve_with_progress_contract(
    request: &ApiInput,
    progress_callback: Option<js_sys::Function>,
) -> Result<SolverResult, PublicErrorEnvelope> {
    solve_with_mapped_progress_contract(request, progress_callback, |progress| progress.clone())
}

pub fn solve_with_progress_snapshot_contract(
    request: &ApiInput,
    progress_callback: Option<js_sys::Function>,
) -> Result<SolverResult, PublicErrorEnvelope> {
    solve_with_mapped_progress_contract(request, progress_callback, |progress| {
        WasmProgressSnapshot::from(progress)
    })
}

fn solve_with_mapped_progress_contract<T, F>(
    request: &ApiInput,
    progress_callback: Option<js_sys::Function>,
    map_progress: F,
) -> Result<SolverResult, PublicErrorEnvelope>
where
    T: Serialize + 'static,
    F: Fn(&ProgressUpdate) -> T + 'static,
{
    let adjusted = ensure_browser_safe_seed(request)?;

    if let Some(js_callback) = progress_callback {
        let rust_callback = Box::new(move |progress: &ProgressUpdate| -> bool {
            let payload = map_progress(progress);
            let progress_value = match serde_wasm_bindgen::to_value(&payload) {
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
            .map_err(|error| infeasible_scenario_error("solve", error.to_string()))
    } else {
        run_solver(&adjusted).map_err(|error| infeasible_scenario_error("solve", error.to_string()))
    }
}

impl From<&ProgressUpdate> for WasmProgressSnapshot {
    fn from(progress: &ProgressUpdate) -> Self {
        Self {
            iteration: progress.iteration,
            max_iterations: progress.max_iterations,
            temperature: progress.temperature,
            current_score: progress.current_score,
            best_score: progress.best_score,
            current_contacts: progress.current_contacts,
            best_contacts: progress.best_contacts,
            repetition_penalty: progress.repetition_penalty,
            elapsed_seconds: progress.elapsed_seconds,
            no_improvement_count: progress.no_improvement_count,
            clique_swaps_tried: progress.clique_swaps_tried,
            clique_swaps_accepted: progress.clique_swaps_accepted,
            clique_swaps_rejected: progress.clique_swaps_rejected,
            transfers_tried: progress.transfers_tried,
            transfers_accepted: progress.transfers_accepted,
            transfers_rejected: progress.transfers_rejected,
            swaps_tried: progress.swaps_tried,
            swaps_accepted: progress.swaps_accepted,
            swaps_rejected: progress.swaps_rejected,
            overall_acceptance_rate: progress.overall_acceptance_rate,
            recent_acceptance_rate: progress.recent_acceptance_rate,
            avg_attempted_move_delta: progress.avg_attempted_move_delta,
            avg_accepted_move_delta: progress.avg_accepted_move_delta,
            biggest_accepted_increase: progress.biggest_accepted_increase,
            biggest_attempted_increase: progress.biggest_attempted_increase,
            current_repetition_penalty: progress.current_repetition_penalty,
            current_balance_penalty: progress.current_balance_penalty,
            current_constraint_penalty: progress.current_constraint_penalty,
            best_repetition_penalty: progress.best_repetition_penalty,
            best_balance_penalty: progress.best_balance_penalty,
            best_constraint_penalty: progress.best_constraint_penalty,
            reheats_performed: progress.reheats_performed,
            iterations_since_last_reheat: progress.iterations_since_last_reheat,
            local_optima_escapes: progress.local_optima_escapes,
            avg_time_per_iteration_ms: progress.avg_time_per_iteration_ms,
            cooling_progress: progress.cooling_progress,
            clique_swap_success_rate: progress.clique_swap_success_rate,
            transfer_success_rate: progress.transfer_success_rate,
            swap_success_rate: progress.swap_success_rate,
            score_variance: progress.score_variance,
            search_efficiency: progress.search_efficiency,
            effective_seed: progress.effective_seed,
            stop_reason: progress.stop_reason,
        }
    }
}

pub fn validate_scenario_contract(request: &ApiInput) -> ValidateResponse {
    match State::new(request) {
        Ok(_) => ValidateResponse {
            valid: true,
            issues: Vec::new(),
        },
        Err(error) => ValidateResponse {
            valid: false,
            issues: vec![ValidationIssue {
                code: Some("infeasible-scenario".to_string()),
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
    let scenario_definition: ProblemDefinition = (&request.scenario).into();
    calculate_recommended_settings(
        &scenario_definition,
        &request.objectives,
        &request.constraints,
        request.desired_runtime_seconds,
    )
    .map_err(|error| infeasible_scenario_error("recommend-settings", error.to_string()))
}

pub fn evaluate_input_contract(request: &ApiInput) -> Result<SolverResult, PublicErrorEnvelope> {
    let adjusted = ensure_browser_safe_seed(request)?;

    if request.construction_seed_schedule.is_some() {
        return Err(invalid_input_error(
            "evaluate-input",
            "Evaluate input does not accept construction_seed_schedule; provide a complete initial_schedule instead",
            Some("construction_seed_schedule".to_string()),
            vec!["remove construction_seed_schedule".to_string(), "provide initial_schedule".to_string()],
        ));
    }
    if request.initial_schedule.is_none() {
        return Err(evaluate_requires_initial_schedule_error());
    }

    let mut state = State::new(&adjusted)
        .map_err(|error| infeasible_scenario_error("evaluate-input", error.to_string()))?;
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

fn parse_wasm_scenario_input(
    value: JsValue,
    operation_id: &str,
    schema_ids: &[&str],
) -> Result<ApiInput, JsValue> {
    parse_js_value::<WasmScenarioContractInput>(value, operation_id, schema_ids).map(Into::into)
}

fn parse_wasm_recommend_settings_request(
    value: JsValue,
    operation_id: &str,
    schema_ids: &[&str],
) -> Result<RecommendSettingsRequest, JsValue> {
    parse_js_value::<WasmScenarioRecommendSettingsRequest>(value, operation_id, schema_ids)
        .map(Into::into)
}

fn serialize_output<T: Serialize>(value: &T, operation_id: &str) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value).map_err(|error| {
        public_error_to_js_value(&internal_error(
            operation_id,
            format!("Failed to serialize response payload: {}", error),
        ))
    })
}

impl WasmScenario {
    fn into_api_input(
        self,
        initial_schedule: Option<WasmInitialSchedule>,
        construction_seed_schedule: Option<WasmInitialSchedule>,
    ) -> ApiInput {
        ApiInput {
            problem: ProblemDefinition {
                people: self.people,
                groups: self.groups,
                num_sessions: self.num_sessions,
            },
            initial_schedule,
            construction_seed_schedule,
            objectives: default_objectives(self.objectives),
            constraints: self.constraints,
            solver: self.settings,
        }
    }
}

impl From<WasmScenarioContractInput> for ApiInput {
    fn from(value: WasmScenarioContractInput) -> Self {
        value
            .scenario
            .into_api_input(value.initial_schedule, value.construction_seed_schedule)
    }
}

impl From<WasmScenarioRecommendSettingsRequest> for RecommendSettingsRequest {
    fn from(value: WasmScenarioRecommendSettingsRequest) -> Self {
        let WasmScenarioRecommendSettingsRequest {
            scenario,
            desired_runtime_seconds,
        } = value;

        RecommendSettingsRequest {
            scenario: ProblemDefinition {
                people: scenario.people,
                groups: scenario.groups,
                num_sessions: scenario.num_sessions,
            }
            .into(),
            objectives: default_objectives(scenario.objectives),
            constraints: scenario.constraints,
            desired_runtime_seconds,
        }
    }
}

fn default_objectives(objectives: Vec<Objective>) -> Vec<Objective> {
    if objectives.is_empty() {
        vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }]
    } else {
        objectives
    }
}

#[cfg(test)]
mod tests {
    use super::{
        evaluate_input_contract, get_default_solver_configuration, inspect_result_contract,
        recommend_settings_contract, solve_contract, solve_with_progress_contract,
        validate_scenario_contract, WasmProgressSnapshot, MAX_SAFE_JS_INTEGER,
    };
    use gm_contracts::types::RecommendSettingsRequest;
    use gm_core::models::{
        Group, Objective, Person, ProblemDefinition, ProgressUpdate, SimulatedAnnealingParams,
        SolverConfiguration, SolverParams, StopConditions, StopReason,
    };
    use std::collections::HashMap;

    fn valid_input() -> gm_core::models::ApiInput {
        gm_core::models::ApiInput {
            initial_schedule: None,
            construction_seed_schedule: None,
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
        let response = validate_scenario_contract(&valid_input());
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
            scenario: input.problem.into(),
            objectives: input.objectives,
            constraints: input.constraints,
            desired_runtime_seconds: 11,
        };
        let configuration = recommend_settings_contract(&request).expect("recommend succeeds");
        assert_eq!(configuration.stop_conditions.time_limit_seconds, Some(11));
    }

    #[test]
    fn evaluate_contract_requires_initial_schedule() {
        let envelope =
            evaluate_input_contract(&valid_input()).expect_err("missing schedule errors");
        assert_eq!(envelope.error.code, "invalid-input");
        assert_eq!(
            envelope.error.where_path.as_deref(),
            Some("initial_schedule")
        );
        assert!(envelope
            .error
            .related_help
            .iter()
            .any(|target| target == "evaluate-input"));
    }

    #[test]
    fn inspect_result_contract_returns_summary_shape() {
        let solve_result = gm_core::run_solver(&valid_input()).expect("solve result");
        let summary = inspect_result_contract(&solve_result);
        assert!(summary.final_score.is_finite());
        assert!(summary.unique_contacts >= 0);
    }

    #[test]
    fn progress_snapshot_conversion_drops_heavy_progress_fields() {
        let progress = ProgressUpdate {
            iteration: 5,
            max_iterations: 100,
            temperature: 0.25,
            current_score: 12.0,
            best_score: 10.0,
            current_contacts: 3,
            best_contacts: 4,
            repetition_penalty: 1,
            elapsed_seconds: 1.5,
            no_improvement_count: 2,
            clique_swaps_tried: 1,
            clique_swaps_accepted: 1,
            clique_swaps_rejected: 0,
            transfers_tried: 2,
            transfers_accepted: 1,
            transfers_rejected: 1,
            swaps_tried: 3,
            swaps_accepted: 2,
            swaps_rejected: 1,
            overall_acceptance_rate: 0.5,
            recent_acceptance_rate: 0.4,
            avg_attempted_move_delta: -0.1,
            avg_accepted_move_delta: -0.2,
            biggest_accepted_increase: 1.0,
            biggest_attempted_increase: 2.0,
            current_repetition_penalty: 1.0,
            current_balance_penalty: 2.0,
            current_constraint_penalty: 3.0,
            best_repetition_penalty: 0.5,
            best_balance_penalty: 1.5,
            best_constraint_penalty: 2.5,
            reheats_performed: 0,
            iterations_since_last_reheat: 5,
            local_optima_escapes: 1,
            avg_time_per_iteration_ms: 0.01,
            cooling_progress: 0.25,
            clique_swap_success_rate: 1.0,
            transfer_success_rate: 0.5,
            swap_success_rate: 0.66,
            score_variance: 0.1,
            search_efficiency: 0.2,
            best_schedule: Some(HashMap::from([(
                "session_0".to_string(),
                HashMap::from([("g0".to_string(), vec!["p0".to_string()])]),
            )])),
            effective_seed: Some(42),
            move_policy: None,
            stop_reason: Some(StopReason::MaxIterationsReached),
        };

        let snapshot = WasmProgressSnapshot::from(&progress);
        let value = serde_json::to_value(&snapshot).expect("snapshot serializes");

        assert_eq!(value["iteration"], serde_json::Value::from(5));
        assert_eq!(value["effective_seed"], serde_json::Value::from(42));
        assert_eq!(value["stop_reason"], serde_json::Value::from("max_iterations_reached"));
        assert!(value.get("best_schedule").is_none());
        assert!(value.get("move_policy").is_none());
    }
}
