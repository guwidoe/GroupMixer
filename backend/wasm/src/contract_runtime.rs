use crate::public_errors::{
    evaluate_requires_initial_schedule_error, infeasible_problem_error, internal_error,
    parse_error, public_error_to_js_value,
};
use serde::Serialize;
use serde::de::DeserializeOwned;
use solver_contracts::types::{ResultSummary, ValidateResponse, ValidationIssue};
use solver_core::{
    calculate_recommended_settings,
    models::{ApiInput, ProblemDefinition, SolverConfiguration, SolverResult},
    solver::State,
};
use wasm_bindgen::JsValue;

const DEFAULT_RECOMMENDED_RUNTIME_SECONDS: u64 = 30;

pub fn solve_contract_js(input: JsValue) -> Result<JsValue, JsValue> {
    let request: ApiInput = parse_js_value(input, "solve", &["solve-request"])?;
    let result = solve_contract(&request)
        .map_err(|error| public_error_to_js_value(&error))?;
    serialize_output(&result, "solve")
}

pub fn validate_problem_contract_js(input: JsValue) -> Result<JsValue, JsValue> {
    let request: ApiInput = parse_js_value(input, "validate-problem", &["validate-request"])?;
    let response = validate_problem_contract(&request);
    serialize_output(&response, "validate-problem")
}

pub fn recommend_settings_contract_js(problem_definition: JsValue) -> Result<JsValue, JsValue> {
    let problem: ProblemDefinition = parse_js_value(
        problem_definition,
        "recommend-settings",
        &["problem-definition"],
    )?;
    let settings = recommend_settings_contract(&problem)
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

pub fn solve_contract(request: &ApiInput) -> Result<SolverResult, solver_contracts::types::PublicErrorEnvelope> {
    solver_core::run_solver(request)
        .map_err(|error| infeasible_problem_error("solve", error.to_string()))
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

pub fn recommend_settings_contract(
    problem: &ProblemDefinition,
) -> Result<SolverConfiguration, solver_contracts::types::PublicErrorEnvelope> {
    calculate_recommended_settings(problem, &[], &[], DEFAULT_RECOMMENDED_RUNTIME_SECONDS)
        .map_err(|error| infeasible_problem_error("recommend-settings", error.to_string()))
}

pub fn evaluate_input_contract(
    request: &ApiInput,
) -> Result<SolverResult, solver_contracts::types::PublicErrorEnvelope> {
    if request.initial_schedule.is_none() {
        return Err(evaluate_requires_initial_schedule_error());
    }

    let mut state = State::new(request)
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
    use super::{evaluate_input_contract, inspect_result_contract, solve_contract, validate_problem_contract};
    use solver_core::models::{
        Group, Objective, Person, ProblemDefinition, SimulatedAnnealingParams, SolverConfiguration,
        SolverParams, StopConditions,
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
    }

    #[test]
    fn validate_contract_returns_shared_validation_shape() {
        let response = validate_problem_contract(&valid_input());
        assert!(response.valid);
        assert!(response.issues.is_empty());
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
