pub mod contract_surface;
mod contract_projection;
mod contract_runtime;
mod public_errors;

use serde::Serialize;
use solver_core::models::{ApiInput, ProblemDefinition, ProgressUpdate};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet() {
    alert("Hello, solver-wasm!");
}

// When the `console_error_panic_hook` feature is enabled, we can call the
// `set_panic_hook` function at least once during initialization, and then
// we will get better error messages if our code ever panics.
//
// For more details see
// https://github.com/rustwasm/console_error_panic_hook#readme
#[cfg(feature = "console_error_panic_hook")]
fn set_panic_hook() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn init_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    set_panic_hook();
}

#[wasm_bindgen]
pub fn capabilities() -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_projection::capabilities_js()
}

#[wasm_bindgen]
pub fn get_operation_help(operation_id: &str) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_projection::get_operation_help_js(operation_id)
}

#[wasm_bindgen]
pub fn list_schemas() -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_projection::list_schemas_js()
}

#[wasm_bindgen]
pub fn get_schema(schema_id: &str) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_projection::get_schema_js(schema_id)
}

#[wasm_bindgen]
pub fn list_public_errors() -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_projection::list_public_errors_js()
}

#[wasm_bindgen]
pub fn get_public_error(error_code: &str) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_projection::get_public_error_js(error_code)
}

#[wasm_bindgen]
pub fn solve_contract(input: JsValue) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::solve_contract_js(input)
}

#[wasm_bindgen]
pub fn validate_problem_contract(input: JsValue) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::validate_problem_contract_js(input)
}

#[wasm_bindgen]
pub fn recommend_settings_contract(problem_definition: JsValue) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::recommend_settings_contract_js(problem_definition)
}

#[wasm_bindgen]
pub fn evaluate_input_contract(input: JsValue) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::evaluate_input_contract_js(input)
}

#[wasm_bindgen]
pub fn inspect_result_contract(result: JsValue) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::inspect_result_contract_js(result)
}

#[wasm_bindgen]
pub fn solve(problem_json: &str) -> Result<String, JsValue> {
    init_panic_hook();

    let api_input: ApiInput = serde_json::from_str(problem_json).map_err(|e| {
        JsValue::from(js_sys::Error::new(&format!(
            "Failed to parse problem: {}",
            e
        )))
    })?;

    let result = solver_core::run_solver(&api_input)
        .map_err(|e| JsValue::from(js_sys::Error::new(&format!("Solver error: {}", e))))?;

    let result_json = serde_json::to_string(&result).map_err(|e| {
        JsValue::from(js_sys::Error::new(&format!(
            "Failed to serialize result: {}",
            e
        )))
    })?;

    Ok(result_json)
}

#[wasm_bindgen]
pub fn solve_with_progress(
    problem_json: &str,
    progress_callback: Option<js_sys::Function>,
) -> Result<String, JsValue> {
    init_panic_hook();

    let api_input: ApiInput = serde_json::from_str(problem_json).map_err(|e| {
        JsValue::from(js_sys::Error::new(&format!(
            "Failed to parse problem: {}",
            e
        )))
    })?;

    let result = if let Some(js_callback) = progress_callback {
        // Create a Rust callback that calls the JavaScript callback
        let rust_callback = Box::new(move |progress: &ProgressUpdate| -> bool {
            let progress_json = match serde_json::to_string(progress) {
                Ok(json) => json,
                Err(e) => {
                    web_sys::console::error_1(
                        &format!("Failed to serialize progress: {}", e).into(),
                    );
                    return true; // Continue on serialization error
                }
            };

            // Call the JavaScript function with the JSON string
            let this = JsValue::null();
            let json_value = JsValue::from_str(&progress_json);

            match js_callback.call1(&this, &json_value) {
                Ok(result) => {
                    // Convert the result to boolean, defaulting to true
                    result.as_bool().unwrap_or(true)
                }
                Err(e) => {
                    web_sys::console::error_1(&format!("Progress callback error: {:?}", e).into());
                    true // Continue on callback error
                }
            }
        }) as Box<dyn Fn(&ProgressUpdate) -> bool>;

        // SAFETY: WASM is single-threaded, so we can safely transmute to add Send
        let rust_callback: Box<dyn Fn(&ProgressUpdate) -> bool + Send> =
            unsafe { std::mem::transmute(rust_callback) };

        solver_core::run_solver_with_progress(&api_input, Some(&rust_callback))
            .map_err(|e| JsValue::from(js_sys::Error::new(&format!("Solver error: {}", e))))?
    } else {
        solver_core::run_solver(&api_input)
            .map_err(|e| JsValue::from(js_sys::Error::new(&format!("Solver error: {}", e))))?
    };

    let result_json = serde_json::to_string(&result).map_err(|e| {
        JsValue::from(js_sys::Error::new(&format!(
            "Failed to serialize result: {}",
            e
        )))
    })?;

    Ok(result_json)
}

#[wasm_bindgen]
pub fn validate_problem(problem_json: &str) -> Result<String, JsValue> {
    init_panic_hook();

    let api_input: ApiInput = serde_json::from_str(problem_json).map_err(|e| {
        JsValue::from(js_sys::Error::new(&format!(
            "Failed to parse problem: {}",
            e
        )))
    })?;

    // Basic validation
    let mut errors = Vec::new();

    if api_input.problem.people.is_empty() {
        errors.push("No people defined".to_string());
    }

    if api_input.problem.groups.is_empty() {
        errors.push("No groups defined".to_string());
    }

    if api_input.problem.num_sessions == 0 {
        errors.push("Number of sessions must be greater than 0".to_string());
    }

    // Check if people have valid session participation
    for person in &api_input.problem.people {
        if let Some(sessions) = &person.sessions {
            for &session_id in sessions {
                if session_id >= api_input.problem.num_sessions {
                    errors.push(format!(
                        "Person {} is assigned to invalid session {} (max: {})",
                        person.id,
                        session_id,
                        api_input.problem.num_sessions - 1
                    ));
                }
            }
        }
    }

    let valid = errors.is_empty();

    #[derive(Serialize)]
    struct ValidationResult {
        valid: bool,
        errors: Vec<String>,
    }

    let result = ValidationResult { valid, errors };
    let result_json = serde_json::to_string(&result).map_err(|e| {
        JsValue::from(js_sys::Error::new(&format!(
            "Failed to serialize validation result: {}",
            e
        )))
    })?;

    Ok(result_json)
}

#[wasm_bindgen]
pub fn get_default_settings() -> Result<String, JsValue> {
    init_panic_hook();

    use solver_core::models::{
        LoggingOptions, SimulatedAnnealingParams, SolverConfiguration, SolverParams, StopConditions,
    };

    let settings = SolverConfiguration {
        solver_type: "SimulatedAnnealing".to_string(),
        stop_conditions: StopConditions {
            max_iterations: Some(10000),
            time_limit_seconds: Some(30),
            no_improvement_iterations: Some(5000),
        },
        solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
            initial_temperature: 1.0,
            final_temperature: 0.01,
            cooling_schedule: "geometric".to_string(),
            reheat_cycles: Some(0),
            reheat_after_no_improvement: Some(0), // No reheat
        }),
        logging: LoggingOptions {
            log_frequency: Some(1000),
            log_initial_state: true,
            log_duration_and_score: true,
            display_final_schedule: true,
            log_initial_score_breakdown: true,
            log_final_score_breakdown: true,
            log_stop_condition: true,
            ..Default::default()
        },
        telemetry: Default::default(),
        seed: None,
        move_policy: None,
        allowed_sessions: None,
    };

    let settings_json = serde_json::to_string(&settings).map_err(|e| {
        JsValue::from(js_sys::Error::new(&format!(
            "Failed to serialize settings: {}",
            e
        )))
    })?;

    Ok(settings_json)
}

/// Evaluate a provided input (including an optional initial schedule) without running the solver.
///
/// Expects the same JSON shape as `models::ApiInput` (problem, objectives, constraints, solver),
/// and optionally `initial_schedule` in the `{"session_0": {"group_id": ["person_id", ...]}, ...}` format.
/// Returns a `SolverResult` JSON with score breakdown computed from the provided schedule.
#[wasm_bindgen]
pub fn evaluate_input(input_json: &str) -> Result<String, JsValue> {
    init_panic_hook();

    let api_input: ApiInput = serde_json::from_str(input_json).map_err(|e| {
        JsValue::from(js_sys::Error::new(&format!(
            "Failed to parse input for evaluation: {}",
            e
        )))
    })?;

    // Construct internal state and force full score recomputation from the provided schedule
    let mut state = solver_core::solver::State::new(&api_input)
        .map_err(|e| JsValue::from(js_sys::Error::new(&format!("State init error: {}", e))))?;

    // Ensure derived structures and scores match the schedule
    state._recalculate_locations_from_schedule();
    state._recalculate_scores();

    let result = state.to_solver_result(state.current_cost, 0);
    let result_json = serde_json::to_string(&result).map_err(|e| {
        JsValue::from(js_sys::Error::new(&format!(
            "Failed to serialize evaluation result: {}",
            e
        )))
    })?;

    Ok(result_json)
}

#[wasm_bindgen]
pub fn test_callback_consistency(problem_json: &str) -> Result<String, JsValue> {
    init_panic_hook();

    let api_input: ApiInput = serde_json::from_str(problem_json).map_err(|e| {
        JsValue::from(js_sys::Error::new(&format!(
            "Failed to parse problem: {}",
            e
        )))
    })?;

    // Capture all progress updates using Arc<Mutex<>> for thread safety
    use std::sync::{Arc, Mutex};
    let captured_updates = Arc::new(Mutex::new(Vec::new()));
    let captured_updates_clone = Arc::clone(&captured_updates);

    let rust_callback = Box::new(move |progress: &ProgressUpdate| -> bool {
        captured_updates_clone
            .lock()
            .unwrap()
            .push(progress.clone());
        true // Continue optimization
    }) as Box<dyn Fn(&ProgressUpdate) -> bool>;

    // SAFETY: WASM is single-threaded, so we can safely transmute to add Send
    let rust_callback: Box<dyn Fn(&ProgressUpdate) -> bool + Send> =
        unsafe { std::mem::transmute(rust_callback) };

    let result = solver_core::run_solver_with_progress(&api_input, Some(&rust_callback))
        .map_err(|e| JsValue::from(js_sys::Error::new(&format!("Solver error: {}", e))))?;

    let final_result_score = result.final_score;
    let captured_updates = captured_updates.lock().unwrap();

    // Analyze the results
    let mut analysis = serde_json::Map::new();

    if let Some(final_update) = captured_updates.last() {
        analysis.insert(
            "final_callback_score".to_string(),
            serde_json::Value::Number(
                serde_json::Number::from_f64(final_update.current_score).unwrap(),
            ),
        );
        analysis.insert(
            "final_result_score".to_string(),
            serde_json::Value::Number(serde_json::Number::from_f64(final_result_score).unwrap()),
        );
        analysis.insert(
            "scores_match".to_string(),
            serde_json::Value::Bool(
                (final_update.current_score - final_result_score).abs() < 0.001,
            ),
        );
        analysis.insert(
            "total_updates".to_string(),
            serde_json::Value::Number(serde_json::Number::from(captured_updates.len())),
        );

        // Check for score consistency throughout
        let mut score_jumps = Vec::new();
        for i in 1..captured_updates.len() {
            let prev_best = captured_updates[i - 1].best_score;
            let curr_best = captured_updates[i].best_score;
            if curr_best > prev_best + 0.001 {
                score_jumps.push(serde_json::json!({
                    "iteration": captured_updates[i].iteration,
                    "from": prev_best,
                    "to": curr_best,
                    "jump": curr_best - prev_best
                }));
            }
        }
        analysis.insert(
            "score_jumps".to_string(),
            serde_json::Value::Array(score_jumps),
        );
    } else {
        analysis.insert(
            "error".to_string(),
            serde_json::Value::String("No progress updates captured".to_string()),
        );
    }

    let analysis_json = serde_json::to_string(&analysis).map_err(|e| {
        JsValue::from(js_sys::Error::new(&format!(
            "Failed to serialize analysis: {}",
            e
        )))
    })?;

    Ok(analysis_json)
}

#[wasm_bindgen]
pub fn get_recommended_settings(
    problem_json: &str,
    desired_runtime_seconds: u64,
) -> Result<String, JsValue> {
    init_panic_hook();

    #[derive(serde::Deserialize)]
    struct ProblemWrapper {
        people: Vec<solver_core::models::Person>,
        groups: Vec<solver_core::models::Group>,
        num_sessions: u32,
        #[serde(default)]
        constraints: Vec<solver_core::models::Constraint>,
        #[serde(default)]
        objectives: Vec<solver_core::models::Objective>,
    }

    let wrapper: ProblemWrapper = match serde_json::from_str(problem_json) {
        Ok(p) => p,
        Err(e) => {
            return Err(JsValue::from(js_sys::Error::new(&format!(
                "Failed to parse problem JSON: {}",
                e
            ))))
        }
    };

    let problem_def = ProblemDefinition {
        people: wrapper.people,
        groups: wrapper.groups,
        num_sessions: wrapper.num_sessions,
    };

    match solver_core::calculate_recommended_settings(
        &problem_def,
        &wrapper.objectives,
        &wrapper.constraints,
        desired_runtime_seconds,
    ) {
        Ok(settings) => {
            let settings_json = serde_json::to_string(&settings).map_err(|e| {
                JsValue::from(js_sys::Error::new(&format!(
                    "Failed to serialize settings: {}",
                    e
                )))
            })?;
            Ok(settings_json)
        }
        Err(e) => Err(JsValue::from(js_sys::Error::new(&format!(
            "Failed to calculate settings: {}",
            e
        )))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use solver_core::models::{
        Group, Objective, Person, ProblemDefinition, SimulatedAnnealingParams, SolverConfiguration,
        SolverParams, StopConditions,
    };
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::rc::Rc;
    use wasm_bindgen::closure::Closure;
    use wasm_bindgen::JsCast;
    use wasm_bindgen_test::*;

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
                    max_iterations: Some(50),
                    time_limit_seconds: None,
                    no_improvement_iterations: Some(10),
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

    fn valid_input_json() -> String {
        serde_json::to_string(&valid_input()).unwrap()
    }

    fn invalid_problem_json() -> String {
        serde_json::json!({
            "problem": {
                "people": [],
                "groups": [],
                "num_sessions": 0
            },
            "objectives": [],
            "constraints": [],
            "solver": {
                "solver_type": "SimulatedAnnealing",
                "stop_conditions": { "max_iterations": 10 },
                "solver_params": {
                    "solver_type": "SimulatedAnnealing",
                    "initial_temperature": 1.0,
                    "final_temperature": 0.1,
                    "cooling_schedule": "geometric"
                },
                "logging": {}
            }
        })
        .to_string()
    }

    fn js_error_message(error: JsValue) -> String {
        error.unchecked_into::<js_sys::Error>().message().into()
    }

    #[wasm_bindgen_test]
    fn solve_returns_valid_serialized_result() {
        let result_json = solve(&valid_input_json()).expect("solve should succeed");
        let result: serde_json::Value = serde_json::from_str(&result_json).unwrap();

        assert!(result.get("schedule").is_some());
        assert!(result.get("final_score").is_some());
    }

    #[wasm_bindgen_test]
    fn solve_rejects_invalid_json_with_js_error() {
        let error = solve("{not-json").expect_err("invalid JSON should error");
        let message = js_error_message(error);
        assert!(message.contains("Failed to parse problem"), "{message}");
    }

    #[wasm_bindgen_test]
    fn solve_with_progress_invokes_callback_and_honors_false_return() {
        let calls = Rc::new(RefCell::new(0usize));
        let payloads = Rc::new(RefCell::new(Vec::<String>::new()));

        let calls_clone = Rc::clone(&calls);
        let payloads_clone = Rc::clone(&payloads);
        let callback = Closure::wrap(Box::new(move |progress_json: JsValue| -> JsValue {
            *calls_clone.borrow_mut() += 1;
            payloads_clone
                .borrow_mut()
                .push(progress_json.as_string().unwrap());
            JsValue::from_bool(false)
        }) as Box<dyn FnMut(JsValue) -> JsValue>);

        let function: js_sys::Function = callback
            .as_ref()
            .unchecked_ref::<js_sys::Function>()
            .clone();
        let result_json = solve_with_progress(&valid_input_json(), Some(function)).unwrap();
        let result: serde_json::Value = serde_json::from_str(&result_json).unwrap();

        assert!(*calls.borrow() >= 1);
        assert!(payloads
            .borrow()
            .iter()
            .all(|payload| payload.contains("iteration")));
        assert!(result.get("schedule").is_some());
    }

    #[wasm_bindgen_test]
    fn solve_with_progress_survives_callback_exceptions() {
        let throwing_callback =
            js_sys::Function::new_with_args("payload", "throw new Error(`boom:${payload.length}`)");

        let result_json = solve_with_progress(&valid_input_json(), Some(throwing_callback))
            .expect("callback exceptions should not break solving");
        let result: serde_json::Value = serde_json::from_str(&result_json).unwrap();

        assert!(result.get("schedule").is_some());
    }

    #[wasm_bindgen_test]
    fn validate_problem_reports_expected_shape() {
        let result_json =
            validate_problem(&invalid_problem_json()).expect("validation should succeed");
        let result: serde_json::Value = serde_json::from_str(&result_json).unwrap();

        assert_eq!(result["valid"], serde_json::Value::Bool(false));
        assert!(result["errors"].as_array().unwrap().len() >= 3);
    }

    #[wasm_bindgen_test]
    fn get_default_settings_returns_serialized_solver_configuration() {
        let settings_json = get_default_settings().expect("default settings should serialize");
        let settings: serde_json::Value = serde_json::from_str(&settings_json).unwrap();

        assert_eq!(
            settings["solver_type"],
            serde_json::Value::String("SimulatedAnnealing".to_string())
        );
        assert_eq!(
            settings["stop_conditions"]["max_iterations"],
            serde_json::Value::from(10000)
        );
        assert_eq!(
            settings["stop_conditions"]["time_limit_seconds"],
            serde_json::Value::from(30)
        );
    }

    #[wasm_bindgen_test]
    fn evaluate_input_returns_structured_result_for_supplied_schedule() {
        let mut input = valid_input();
        input.initial_schedule = Some(HashMap::from([
            (
                "session_0".to_string(),
                HashMap::from([
                    ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                    ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                ]),
            ),
            (
                "session_1".to_string(),
                HashMap::from([
                    ("g0".to_string(), vec!["p0".to_string(), "p2".to_string()]),
                    ("g1".to_string(), vec!["p1".to_string(), "p3".to_string()]),
                ]),
            ),
        ]));

        let result_json = evaluate_input(&serde_json::to_string(&input).unwrap())
            .expect("evaluate_input should succeed");
        let result: serde_json::Value = serde_json::from_str(&result_json).unwrap();

        assert_eq!(
            result["schedule"]["session_0"]["g0"][0],
            serde_json::Value::String("p0".to_string())
        );
        assert_eq!(
            result["schedule"]["session_1"]["g1"][1],
            serde_json::Value::String("p3".to_string())
        );
        assert!(result.get("final_score").is_some());
    }
}
