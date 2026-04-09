pub mod contract_projection;
mod contract_runtime;
pub mod contract_surface;
mod public_errors;

use wasm_bindgen::prelude::*;

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
pub fn list_solvers() -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_projection::list_solvers_js()
}

#[wasm_bindgen]
pub fn get_solver_descriptor(solver_id: &str) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_projection::get_solver_descriptor_js(solver_id)
}

#[wasm_bindgen]
pub fn solve(input: JsValue) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::solve_contract_js(input)
}

#[wasm_bindgen]
pub fn solve_with_progress(
    input: JsValue,
    progress_callback: Option<js_sys::Function>,
) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::solve_with_progress_js(input, progress_callback)
}

#[wasm_bindgen]
pub fn solve_with_progress_snapshot(
    input: JsValue,
    progress_callback: Option<js_sys::Function>,
    best_schedule_callback: Option<js_sys::Function>,
) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::solve_with_progress_snapshot_js(
        input,
        progress_callback,
        best_schedule_callback,
    )
}

#[wasm_bindgen]
pub fn validate_scenario(input: JsValue) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::validate_scenario_contract_js(input)
}

#[wasm_bindgen]
pub fn get_default_solver_configuration() -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::get_default_solver_configuration_js()
}

#[wasm_bindgen]
pub fn recommend_settings(input: JsValue) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::recommend_settings_js(input)
}

#[wasm_bindgen]
pub fn evaluate_input(input: JsValue) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::evaluate_input_contract_js(input)
}

#[wasm_bindgen]
pub fn inspect_result(result: JsValue) -> Result<JsValue, JsValue> {
    init_panic_hook();
    contract_runtime::inspect_result_contract_js(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gm_core::models::{
        ApiInput, Group, Objective, Person, ProblemDefinition, SimulatedAnnealingParams,
        SolverConfiguration, SolverParams, StopConditions,
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

    fn valid_input_js() -> JsValue {
        serde_wasm_bindgen::to_value(&serde_json::json!({
            "scenario": {
                "people": valid_input().problem.people,
                "groups": valid_input().problem.groups,
                "num_sessions": valid_input().problem.num_sessions,
                "objectives": valid_input().objectives,
                "constraints": valid_input().constraints,
                "settings": valid_input().solver,
            }
        }))
        .unwrap()
    }

    fn invalid_problem_js() -> JsValue {
        serde_wasm_bindgen::to_value(&serde_json::json!({
            "scenario": {
                "people": [],
                "groups": [],
                "num_sessions": 0,
                "objectives": [],
                "constraints": [],
                "settings": valid_input().solver,
            }
        }))
        .unwrap()
    }

    fn js_error_message(error: JsValue) -> String {
        error.unchecked_into::<js_sys::Error>().message().into()
    }

    #[wasm_bindgen_test]
    fn solve_returns_structured_result() {
        let result_value = solve(valid_input_js()).expect("solve should succeed");
        let result: serde_json::Value = serde_wasm_bindgen::from_value(result_value).unwrap();

        assert!(result.get("schedule").is_some());
        assert!(result.get("final_score").is_some());
    }

    #[wasm_bindgen_test]
    fn solve_rejects_invalid_payload_with_public_error() {
        let error =
            solve(JsValue::from_str("{not-json")).expect_err("invalid payload should error");
        let message = js_error_message(error);
        assert!(
            message.contains("Failed to parse request payload"),
            "{message}"
        );
    }

    #[wasm_bindgen_test]
    fn solve_with_progress_invokes_callback_with_structured_updates() {
        let calls = Rc::new(RefCell::new(0usize));
        let payloads = Rc::new(RefCell::new(Vec::<serde_json::Value>::new()));

        let calls_clone = Rc::clone(&calls);
        let payloads_clone = Rc::clone(&payloads);
        let callback = Closure::wrap(Box::new(move |progress: JsValue| -> JsValue {
            *calls_clone.borrow_mut() += 1;
            payloads_clone
                .borrow_mut()
                .push(serde_wasm_bindgen::from_value(progress).unwrap());
            JsValue::from_bool(false)
        }) as Box<dyn FnMut(JsValue) -> JsValue>);

        let function: js_sys::Function = callback
            .as_ref()
            .unchecked_ref::<js_sys::Function>()
            .clone();
        let result_value = solve_with_progress(valid_input_js(), Some(function)).unwrap();
        let result: serde_json::Value = serde_wasm_bindgen::from_value(result_value).unwrap();

        assert!(*calls.borrow() >= 1);
        assert!(payloads
            .borrow()
            .iter()
            .all(|payload| payload.get("iteration").is_some()));
        assert!(result.get("schedule").is_some());
    }

    #[wasm_bindgen_test]
    fn solve_with_progress_snapshot_invokes_callback_with_scalar_payloads() {
        let calls = Rc::new(RefCell::new(0usize));
        let payloads = Rc::new(RefCell::new(Vec::<serde_json::Value>::new()));

        let calls_clone = Rc::clone(&calls);
        let payloads_clone = Rc::clone(&payloads);
        let callback = Closure::wrap(Box::new(move |progress: JsValue| -> JsValue {
            *calls_clone.borrow_mut() += 1;
            payloads_clone
                .borrow_mut()
                .push(serde_wasm_bindgen::from_value(progress).unwrap());
            JsValue::from_bool(false)
        }) as Box<dyn FnMut(JsValue) -> JsValue>);

        let function: js_sys::Function = callback
            .as_ref()
            .unchecked_ref::<js_sys::Function>()
            .clone();
        let result_value =
            solve_with_progress_snapshot(valid_input_js(), Some(function), None).unwrap();
        let result: serde_json::Value = serde_wasm_bindgen::from_value(result_value).unwrap();

        assert!(*calls.borrow() >= 1);
        assert!(payloads.borrow().iter().all(|payload| {
            payload.get("iteration").is_some()
                && payload.get("best_schedule").is_none()
                && payload.get("move_policy").is_none()
        }));
        assert!(result.get("schedule").is_some());
    }

    #[wasm_bindgen_test]
    fn solve_with_progress_snapshot_can_emit_best_schedule_separately() {
        let schedules = Rc::new(RefCell::new(Vec::<serde_json::Value>::new()));
        let schedules_clone = Rc::clone(&schedules);
        let progress_callback = Closure::wrap(Box::new(move |_progress: JsValue| -> JsValue {
            JsValue::from_bool(false)
        }) as Box<dyn FnMut(JsValue) -> JsValue>);
        let best_schedule_callback = Closure::wrap(Box::new(move |schedule: JsValue| {
            schedules_clone
                .borrow_mut()
                .push(serde_wasm_bindgen::from_value(schedule).unwrap());
        }) as Box<dyn FnMut(JsValue)>);

        let progress_function: js_sys::Function = progress_callback
            .as_ref()
            .unchecked_ref::<js_sys::Function>()
            .clone();
        let best_schedule_function: js_sys::Function = best_schedule_callback
            .as_ref()
            .unchecked_ref::<js_sys::Function>()
            .clone();

        solve_with_progress_snapshot(
            valid_input_js(),
            Some(progress_function),
            Some(best_schedule_function),
        )
        .unwrap();

        assert!(!schedules.borrow().is_empty());
        assert!(schedules.borrow().iter().all(|schedule| schedule.get("session_0").is_some()));
    }

    #[wasm_bindgen_test]
    fn validate_scenario_reports_expected_shape() {
        let result_value =
            validate_scenario(invalid_problem_js()).expect("validation should succeed");
        let result: serde_json::Value = serde_wasm_bindgen::from_value(result_value).unwrap();

        assert_eq!(result["valid"], serde_json::Value::Bool(false));
        assert!(!result["issues"].as_array().unwrap().is_empty());
    }

    #[wasm_bindgen_test]
    fn get_default_solver_configuration_returns_structured_settings() {
        let settings_value =
            get_default_solver_configuration().expect("default settings should serialize");
        let settings: serde_json::Value = serde_wasm_bindgen::from_value(settings_value).unwrap();

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
        let input = serde_wasm_bindgen::to_value(&serde_json::json!({
            "scenario": {
                "people": valid_input().problem.people,
                "groups": valid_input().problem.groups,
                "num_sessions": valid_input().problem.num_sessions,
                "objectives": valid_input().objectives,
                "constraints": valid_input().constraints,
                "settings": valid_input().solver,
            },
            "initial_schedule": {
                "session_0": {
                    "g0": ["p0", "p1"],
                    "g1": ["p2", "p3"]
                },
                "session_1": {
                    "g0": ["p0", "p2"],
                    "g1": ["p1", "p3"]
                }
            }
        }))
        .unwrap();

        let result_value = evaluate_input(input).expect("evaluate_input should succeed");
        let result: serde_json::Value = serde_wasm_bindgen::from_value(result_value).unwrap();

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
