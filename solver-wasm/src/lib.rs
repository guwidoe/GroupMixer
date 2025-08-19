use serde::Serialize;
use solver_core::models::{
    ApiInput, ProblemDefinition, ProgressCallback, ProgressUpdate, SolverResult,
};
use solver_core::run_solver_with_progress;
use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

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
    };

    let settings_json = serde_json::to_string(&settings).map_err(|e| {
        JsValue::from(js_sys::Error::new(&format!(
            "Failed to serialize settings: {}",
            e
        )))
    })?;

    Ok(settings_json)
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
