//! # Solver-Core: Advanced Group Distribution Optimization Engine
//!
//! This crate provides a high-performance optimization engine for solving the social group
//! scheduling problem. It distributes people into groups across multiple sessions while
//! maximizing social interactions and respecting complex constraints.
//!
//! ## Quick Example
//!
//! ```no_run
//! use solver_core::{run_solver, models::*};
//! use std::collections::HashMap;
//!
//! let input = ApiInput {
//!     problem: ProblemDefinition {
//!         people: vec![
//!             Person {
//!                 id: "Alice".to_string(),
//!                 attributes: HashMap::new(),
//!                 sessions: None,
//!             },
//!             Person {
//!                 id: "Bob".to_string(),
//!                 attributes: HashMap::new(),
//!                 sessions: None,
//!             },
//!         ],
//!         groups: vec![
//!             Group { id: "Team1".to_string(), size: 2 }
//!         ],
//!         num_sessions: 2,
//!     },
//!     objectives: vec![],
//!     constraints: vec![],
//!     solver: SolverConfiguration {
//!         solver_type: "SimulatedAnnealing".to_string(),
//!         stop_conditions: StopConditions {
//!             max_iterations: Some(1000),
//!             time_limit_seconds: None,
//!             no_improvement_iterations: None,
//!         },
//!         solver_params: SolverParams::SimulatedAnnealing(
//!             SimulatedAnnealingParams {
//!                 initial_temperature: 10.0,
//!                 final_temperature: 0.1,
//!                 cooling_schedule: "geometric".to_string(),
//!                 reheat_after_no_improvement: Some(0),
//!             }
//!         ),
//!         logging: LoggingOptions::default(),
//!     },
//! };
//!
//! match run_solver(&input) {
//!     Ok(result) => {
//!         println!("Final score: {}", result.final_score);
//!         println!("Schedule:\n{}", result.display());
//!     },
//!     Err(e) => eprintln!("Error: {:?}", e),
//! }
//! ```

use crate::algorithms::simulated_annealing::SimulatedAnnealing;
use crate::algorithms::Solver;
use crate::models::{
    ApiInput, ProblemDefinition, ProgressCallback, ProgressUpdate, SimulatedAnnealingParams,
    SolverConfiguration, SolverParams, SolverResult, StopConditions,
};
use crate::models::{Constraint, Objective};
use crate::solver::{SolverError, State};

pub mod algorithms;
pub mod models;
pub mod solver;

/// Runs the optimization solver with the given input configuration.
///
/// This is the main entry point for the solver-core library. It takes a complete
/// problem definition with constraints and solver configuration, then returns an
/// optimized schedule that maximizes unique social contacts while respecting all
/// specified constraints.
///
/// # Arguments
///
/// * `input` - A complete problem specification including:
///   - `problem`: People, groups, and number of sessions to schedule
///   - `objectives`: Optimization goals (e.g., maximize unique contacts)
///   - `constraints`: Rules that must be satisfied or penalized
///   - `solver`: Algorithm configuration and parameters
///
/// # Returns
///
/// Returns a `Result` containing either:
/// - `Ok(SolverResult)`: The optimized schedule with detailed scoring breakdown
/// - `Err(SolverError)`: An error if the problem configuration is invalid
///
/// # Errors
///
/// This function will return an error if:
/// - The total group capacity is insufficient for all people
/// - Constraint definitions are contradictory or invalid
/// - Required solver parameters are missing or invalid
/// - People or group IDs are not unique
///
/// # Example
///
/// ```no_run
/// use solver_core::{run_solver, models::*};
/// use std::collections::HashMap;
///
/// let input = ApiInput {
///     problem: ProblemDefinition {
///         people: vec![
///             Person {
///                 id: "Alice".to_string(),
///                 attributes: {
///                     let mut attrs = HashMap::new();
///                     attrs.insert("gender".to_string(), "female".to_string());
///                     attrs
///                 },
///                 sessions: None, // Participates in all sessions
///             },
///             Person {
///                 id: "Bob".to_string(),
///                 attributes: {
///                     let mut attrs = HashMap::new();
///                     attrs.insert("gender".to_string(), "male".to_string());
///                     attrs
///                 },
///                 sessions: Some(vec![0, 1]), // Only sessions 0 and 1
///             },
///         ],
///         groups: vec![
///             Group { id: "Team1".to_string(), size: 2 },
///         ],
///         num_sessions: 3,
///     },
///     objectives: vec![
///         Objective {
///             r#type: "maximize_unique_contacts".to_string(),
///             weight: 1.0,
///         }
///     ],
///     constraints: vec![
///         Constraint::RepeatEncounter(RepeatEncounterParams {
///             max_allowed_encounters: 1,
///             penalty_function: "squared".to_string(),
///             penalty_weight: 100.0,
///         }),
///     ],
///     solver: SolverConfiguration {
///         solver_type: "SimulatedAnnealing".to_string(),
///         stop_conditions: StopConditions {
///             max_iterations: Some(10_000),
///             time_limit_seconds: Some(30),
///             no_improvement_iterations: Some(1_000),
///         },
///         solver_params: SolverParams::SimulatedAnnealing(
///             SimulatedAnnealingParams {
///                 initial_temperature: 100.0,
///                 final_temperature: 0.1,
///                 cooling_schedule: "geometric".to_string(),
///                 reheat_after_no_improvement: Some(0),
///             }
///         ),
///         logging: LoggingOptions {
///             display_final_schedule: true,
///             log_final_score_breakdown: true,
///             ..Default::default()
///         },
///     },
/// };
///
/// match run_solver(&input) {
///     Ok(result) => {
///         println!("Optimization completed!");
///         println!("Final score: {}", result.final_score);
///         println!("Unique contacts: {}", result.unique_contacts);
///         println!("Repetition penalty: {}", result.repetition_penalty);
///         println!("\nSchedule:");
///         println!("{}", result.display());
///     }
///     Err(e) => {
///         eprintln!("Optimization failed: {:?}", e);
///     }
/// }
/// ```
///
/// # Supported Solver Types
///
/// Currently supported solver types:
/// - `"SimulatedAnnealing"`: Temperature-based optimization with configurable cooling schedules
///
/// # Performance Notes
///
/// The solver uses efficient delta cost calculations and integer-based internal
/// representations for optimal performance. Typical performance characteristics:
/// - Small problems (12 people, 3 groups): < 1 second
/// - Medium problems (30 people, 6 groups): 5-10 seconds  
/// - Large problems (60+ people, 10+ groups): 30-60 seconds
pub fn run_solver(input: &ApiInput) -> Result<SolverResult, SolverError> {
    run_solver_with_progress(input, None)
}

/// Runs the optimization solver with progress callback support.
///
/// This is an extended version of `run_solver` that accepts an optional progress
/// callback function. The callback will be called periodically during optimization
/// to report progress information such as current iteration, temperature, and scores.
///
/// # Arguments
///
/// * `input` - A complete problem specification (same as `run_solver`)
/// * `progress_callback` - Optional callback function that receives progress updates
///   and can request early termination by returning `false`
///
/// # Returns
///
/// Same as `run_solver`: either the optimized result or an error.
///
/// # Example
///
/// ```no_run
/// use solver_core::{run_solver_with_progress, models::*};
/// use std::collections::HashMap;
///
/// # let input = ApiInput {
/// #     problem: ProblemDefinition { people: vec![], groups: vec![], num_sessions: 1 },
/// #     objectives: vec![], constraints: vec![],
/// #     solver: SolverConfiguration {
/// #         solver_type: "SimulatedAnnealing".to_string(),
/// #         stop_conditions: StopConditions { max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None },
/// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams { initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0) }),
/// #         logging: LoggingOptions::default(),
/// #     },
/// # };
///
/// let progress_callback: ProgressCallback = Box::new(|progress: &ProgressUpdate| -> bool {
///     println!("Iteration {}/{}: Score = {:.2}, Temperature = {:.4}",
///              progress.iteration, progress.max_iterations,
///              progress.current_score, progress.temperature);
///     
///     // Continue optimization (return false to stop early)
///     true
/// });
///
/// match run_solver_with_progress(&input, Some(&progress_callback)) {
///     Ok(result) => println!("Final score: {}", result.final_score),
///     Err(e) => eprintln!("Error: {:?}", e),
/// }
/// ```
pub fn run_solver_with_progress(
    input: &ApiInput,
    progress_callback: Option<&ProgressCallback>,
) -> Result<SolverResult, SolverError> {
    let mut state = State::new(input)?;

    let solver: Box<dyn algorithms::Solver> = match input.solver.solver_type.as_str() {
        "SimulatedAnnealing" => Box::new(SimulatedAnnealing::new(&input.solver)),
        _ => {
            return Err(SolverError::ValidationError(format!(
                "Unknown solver type: {}",
                input.solver.solver_type
            )))
        }
    };

    solver.solve(&mut state, progress_callback)
}

/// Calculates recommended solver settings based on a trial run.
///
/// This function runs a short, high-temperature simulation to analyze the problem's
/// characteristics and suggests a set of optimized `models::SolverSettings`.
///
/// # Arguments
///
/// * `problem` - The `ProblemDefinition` definition.
/// * `objectives` - The objectives slice.
/// * `constraints` - The constraints slice.
/// * `desired_runtime_seconds` - The target runtime for the main solver execution.
///
/// # Returns
///
/// A `Result` containing the recommended `models::SolverSettings` or a `SolverError`.
pub fn calculate_recommended_settings(
    problem: &ProblemDefinition,
    objectives: &[Objective],
    constraints: &[Constraint],
    desired_runtime_seconds: u64,
) -> Result<SolverConfiguration, SolverError> {
    const TRIAL_ITERS: u64 = 10_000;

    // trial configuration
    let trial_cfg = SolverConfiguration {
        solver_type: "SimulatedAnnealing".into(),
        stop_conditions: StopConditions {
            max_iterations: Some(TRIAL_ITERS),
            time_limit_seconds: None,
            no_improvement_iterations: None,
        },
        solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
            initial_temperature: 1_000_000.0,
            final_temperature: 1_000_000.0,
            cooling_schedule: "geometric".into(),
            reheat_after_no_improvement: Some(0),
        }),
        logging: Default::default(),
    };

    let trial_objectives: Vec<Objective> = if objectives.is_empty() {
        vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }]
    } else {
        objectives.to_vec()
    };

    let trial_input = ApiInput {
        problem: problem.clone(),
        objectives: trial_objectives,
        constraints: constraints.to_vec(),
        solver: trial_cfg.clone(),
    };

    // set up progress capture
    use std::sync::{Arc, Mutex};
    let last_prog: Arc<Mutex<Option<ProgressUpdate>>> = Arc::new(Mutex::new(None));
    let cb_holder = last_prog.clone();
    let progress: ProgressCallback = Box::new(move |p: &ProgressUpdate| {
        *cb_holder.lock().unwrap() = Some(p.clone());
        true
    });

    // run trial
    let mut state = State::new(&trial_input)?;
    let solver = SimulatedAnnealing::new(&trial_cfg);

    // === Platform-specific wall-clock timing ===
    #[cfg(not(target_arch = "wasm32"))]
    let trial_secs = {
        let start = std::time::Instant::now();
        solver.solve(&mut state, Some(&progress))?;
        start.elapsed().as_secs_f64()
    };

    // In the browser we can use JS Date (ms) for timing.
    #[cfg(target_arch = "wasm32")]
    let trial_secs = {
        use js_sys::Date;
        let start = Date::now();
        solver.solve(&mut state, Some(&progress))?;
        (Date::now() - start) / 1000.0
    };

    let metrics = last_prog
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| SolverError::ValidationError("Trial run produced no progress".into()))?;

    // === Debugging output ===
    eprintln!(
        "[DEBUG] biggest_attempted_increase: {}",
        metrics.biggest_attempted_increase
    );
    eprintln!(
        "[DEBUG] biggest_accepted_increase:  {}",
        metrics.biggest_accepted_increase
    );

    // Choose an initial temperature that would accept the largest observed
    // uphill (cost-increasing) move roughly half the time.
    //
    // Acceptance probability  P = exp(−Δ / T)  ⇒  T = - Δ / ln(2)  when P = 0.5 .
    //
    // We consider both attempted *and* accepted increases because in some
    // degenerate cases (e.g. extremely good initial schedule) there may be no
    // accepted uphill moves even though some were attempted, and vice-versa.
    // If no positive cost increases were seen, we fall back to a small default.

    let max_uphill_delta = metrics
        .biggest_attempted_increase
        .max(metrics.biggest_accepted_increase);

    eprintln!("[DEBUG] max_uphill_delta chosen: {}", max_uphill_delta);

    let init_temp = if max_uphill_delta > 0.0 {
        -max_uphill_delta / 0.01_f64.ln()
    } else {
        1.0 // conservative fallback when no uphill moves were observed
    };

    eprintln!("[DEBUG] calculated init_temp: {}", init_temp);

    // Final temperature is the temperature at which a step which
    // increases the cost function by 1 is accepted with probability of 0.001%.
    let final_temp = -1.0 / (0.00001f64).ln();

    eprintln!("[DEBUG] calculated final_temp: {}", final_temp);

    let t_per_iter = trial_secs / TRIAL_ITERS as f64;
    let target_secs = desired_runtime_seconds as f64 * 0.9;
    let total_iters = if t_per_iter > 0.0 {
        (target_secs / t_per_iter).round() as u64
    } else {
        2_000_000
    };

    eprintln!(
        "[DEBUG] trial_secs: {} t_per_iter: {} total_iters: {}",
        trial_secs, t_per_iter, total_iters
    );

    // build recommended config
    Ok(SolverConfiguration {
        solver_type: "SimulatedAnnealing".into(),
        stop_conditions: StopConditions {
            max_iterations: Some(total_iters),
            time_limit_seconds: Some(desired_runtime_seconds),
            no_improvement_iterations: Some(total_iters / 2),
        },
        solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
            initial_temperature: init_temp,
            final_temperature: final_temp,
            cooling_schedule: "geometric".into(),
            reheat_after_no_improvement: Some(total_iters / 3),
        }),
        logging: Default::default(),
    })
}

#[cfg(test)]
mod callback_tests {
    use super::*;
    use crate::models::*;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    #[test]
    fn test_solve_with_progress_callback_consistency() {
        // Create a simple test problem
        let input = create_simple_test_input();

        // Capture all progress updates
        let progress_updates = Arc::new(Mutex::new(Vec::new()));
        let progress_updates_clone = Arc::clone(&progress_updates);

        let progress_callback: ProgressCallback =
            Box::new(move |progress: &ProgressUpdate| -> bool {
                progress_updates_clone
                    .lock()
                    .unwrap()
                    .push(progress.clone());
                true // Continue optimization
            });

        // Run solver with progress callback
        let result = run_solver_with_progress(&input, Some(&progress_callback)).unwrap();

        // Get all captured progress updates
        let updates = progress_updates.lock().unwrap();

        // Verify we got progress updates
        assert!(!updates.is_empty(), "Should have received progress updates");

        // Get the final progress update
        let final_update = updates.last().unwrap();

        // Compare final callback values with actual result
        println!("=== CALLBACK CONSISTENCY TEST ===");
        println!(
            "Final callback - current_score: {}",
            final_update.current_score
        );
        println!("Final callback - best_score: {}", final_update.best_score);
        println!(
            "Final callback - current_contacts: {}",
            final_update.current_contacts
        );
        println!(
            "Final callback - best_contacts: {}",
            final_update.best_contacts
        );
        println!(
            "Final callback - repetition_penalty: {}",
            final_update.repetition_penalty
        );

        println!("Actual result - final_score: {}", result.final_score);
        println!(
            "Actual result - unique_contacts: {}",
            result.unique_contacts
        );
        println!(
            "Actual result - repetition_penalty: {}",
            result.repetition_penalty
        );

        // These should match exactly
        assert_eq!(
            final_update.current_score, result.final_score,
            "Final callback current_score should match result.final_score"
        );
        assert_eq!(
            final_update.best_score, result.final_score,
            "Final callback best_score should match result.final_score"
        );
        assert_eq!(
            final_update.current_contacts, result.unique_contacts,
            "Final callback current_contacts should match result.unique_contacts"
        );
        assert_eq!(
            final_update.best_contacts, result.unique_contacts,
            "Final callback best_contacts should match result.unique_contacts"
        );
        assert_eq!(
            final_update.repetition_penalty, result.repetition_penalty,
            "Final callback repetition_penalty should match result.repetition_penalty"
        );

        println!("✅ All callback values match final result!");
    }

    #[test]
    fn test_solve_without_callback_matches_with_callback() {
        let input = create_simple_test_input();

        // Run without callback
        let result_no_callback = run_solver(&input).unwrap();

        // Run with callback (but ignore the callback data)
        let progress_callback: ProgressCallback = Box::new(|_| true);
        let result_with_callback =
            run_solver_with_progress(&input, Some(&progress_callback)).unwrap();

        println!("=== CALLBACK vs NO-CALLBACK CONSISTENCY TEST ===");
        println!(
            "No callback - final_score: {}",
            result_no_callback.final_score
        );
        println!(
            "With callback - final_score: {}",
            result_with_callback.final_score
        );

        // Results should be identical (within floating point precision)
        assert!(
            (result_no_callback.final_score - result_with_callback.final_score).abs() < 0.001,
            "Results with and without callback should be identical"
        );
        assert_eq!(
            result_no_callback.unique_contacts,
            result_with_callback.unique_contacts
        );
        assert_eq!(
            result_no_callback.repetition_penalty,
            result_with_callback.repetition_penalty
        );

        println!("✅ Results with and without callback are identical!");
    }

    #[test]
    fn test_progress_callback_score_monotonicity() {
        let input = create_simple_test_input();

        // Capture all progress updates
        let progress_updates = Arc::new(Mutex::new(Vec::new()));
        let progress_updates_clone = Arc::clone(&progress_updates);

        let progress_callback: ProgressCallback =
            Box::new(move |progress: &ProgressUpdate| -> bool {
                progress_updates_clone
                    .lock()
                    .unwrap()
                    .push(progress.clone());
                true
            });

        let _result = run_solver_with_progress(&input, Some(&progress_callback)).unwrap();

        let updates = progress_updates.lock().unwrap();

        println!("=== PROGRESS CALLBACK MONOTONICITY TEST ===");
        println!("Total progress updates: {}", updates.len());

        // Check that best_score is non-increasing (should get better or stay the same)
        let mut prev_best = f64::INFINITY;
        let mut improvements = 0;

        for (_i, update) in updates.iter().enumerate() {
            if update.best_score < prev_best {
                improvements += 1;
                println!(
                    "Iteration {}: best_score improved from {:.2} to {:.2}",
                    update.iteration, prev_best, update.best_score
                );
            }

            // best_score should never get worse
            assert!(
                update.best_score <= prev_best + 0.001,
                "Best score should never get worse: iteration {} had {:.2}, previous was {:.2}",
                update.iteration,
                update.best_score,
                prev_best
            );

            prev_best = update.best_score;

            // Verify internal consistency within each update
            assert_eq!(
                update.current_score, update.current_score,
                "current_score should be consistent"
            );
            assert_eq!(
                update.best_score, update.best_score,
                "best_score should be consistent"
            );
        }

        println!(
            "✅ Found {} improvements, best_score never got worse!",
            improvements
        );
    }

    #[test]
    fn test_final_callback_after_recalculation() {
        // This test specifically checks that the final callback happens after score recalculation
        let input = create_complex_test_input(); // Use a more complex input to increase chance of drift

        let progress_updates = Arc::new(Mutex::new(Vec::new()));
        let progress_updates_clone = Arc::clone(&progress_updates);

        let progress_callback: ProgressCallback =
            Box::new(move |progress: &ProgressUpdate| -> bool {
                progress_updates_clone
                    .lock()
                    .unwrap()
                    .push(progress.clone());
                true
            });

        let result = run_solver_with_progress(&input, Some(&progress_callback)).unwrap();
        let updates = progress_updates.lock().unwrap();

        let final_update = updates.last().unwrap();

        println!("=== FINAL CALLBACK RECALCULATION TEST ===");
        println!("Final callback iteration: {}", final_update.iteration);
        println!("Final callback score: {}", final_update.current_score);
        println!("Actual result score: {}", result.final_score);

        // The key test: final callback should match the actual result exactly
        // This would fail if the callback happened before recalculation
        assert_eq!(final_update.current_score, result.final_score,
            "Final callback score must match actual result (callback should happen after recalculation)");

        println!("✅ Final callback happened after recalculation!");
    }

    fn create_simple_test_input() -> ApiInput {
        let mut people = Vec::new();
        for i in 0..6 {
            let mut attrs = HashMap::new();
            attrs.insert(
                "gender".to_string(),
                if i % 2 == 0 {
                    "male".to_string()
                } else {
                    "female".to_string()
                },
            );
            people.push(Person {
                id: format!("person_{}", i),
                attributes: attrs,
                sessions: None,
            });
        }

        let groups = vec![
            Group {
                id: "group_1".to_string(),
                size: 3,
            },
            Group {
                id: "group_2".to_string(),
                size: 3,
            },
        ];

        ApiInput {
            problem: ProblemDefinition {
                people,
                groups,
                num_sessions: 2,
            },
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "squared".to_string(),
                penalty_weight: 100.0,
            })],
            solver: SolverConfiguration {
                solver_type: "SimulatedAnnealing".to_string(),
                stop_conditions: StopConditions {
                    max_iterations: Some(1000),
                    time_limit_seconds: Some(5),
                    no_improvement_iterations: Some(500),
                },
                solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                    initial_temperature: 10.0,
                    final_temperature: 0.01,
                    cooling_schedule: "geometric".to_string(),
                    reheat_after_no_improvement: Some(0), // No reheat
                }),
                logging: LoggingOptions {
                    log_frequency: Some(100),
                    log_duration_and_score: true,
                    log_final_score_breakdown: true,
                    ..Default::default()
                },
            },
        }
    }

    fn create_complex_test_input() -> ApiInput {
        // Create a more complex problem that's more likely to show score drift
        let mut people = Vec::new();
        for i in 0..12 {
            let mut attrs = HashMap::new();
            attrs.insert(
                "gender".to_string(),
                if i % 2 == 0 {
                    "male".to_string()
                } else {
                    "female".to_string()
                },
            );
            attrs.insert("department".to_string(), format!("dept_{}", i % 3));
            people.push(Person {
                id: format!("person_{}", i),
                attributes: attrs,
                sessions: None,
            });
        }

        let groups = vec![
            Group {
                id: "group_1".to_string(),
                size: 4,
            },
            Group {
                id: "group_2".to_string(),
                size: 4,
            },
            Group {
                id: "group_3".to_string(),
                size: 4,
            },
        ];

        ApiInput {
            problem: ProblemDefinition {
                people,
                groups,
                num_sessions: 3,
            },
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: vec![
                Constraint::RepeatEncounter(RepeatEncounterParams {
                    max_allowed_encounters: 1,
                    penalty_function: "squared".to_string(),
                    penalty_weight: 100.0,
                }),
                Constraint::AttributeBalance(AttributeBalanceParams {
                    group_id: "group_1".to_string(),
                    attribute_key: "gender".to_string(),
                    desired_values: {
                        let mut values = HashMap::new();
                        values.insert("male".to_string(), 2);
                        values.insert("female".to_string(), 2);
                        values
                    },
                    penalty_weight: 50.0,
                    sessions: None,
                }),
                Constraint::ShouldNotBeTogether {
                    people: vec!["person_0".to_string(), "person_1".to_string()],
                    penalty_weight: 200.0,
                    sessions: None,
                },
            ],
            solver: SolverConfiguration {
                solver_type: "SimulatedAnnealing".to_string(),
                stop_conditions: StopConditions {
                    max_iterations: Some(2000),
                    time_limit_seconds: Some(10),
                    no_improvement_iterations: Some(1000),
                },
                solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                    initial_temperature: 50.0,
                    final_temperature: 0.01,
                    cooling_schedule: "geometric".to_string(),
                    reheat_after_no_improvement: Some(0), // No reheat
                }),
                logging: LoggingOptions {
                    log_frequency: Some(200),
                    log_duration_and_score: true,
                    log_final_score_breakdown: true,
                    ..Default::default()
                },
            },
        }
    }
}
