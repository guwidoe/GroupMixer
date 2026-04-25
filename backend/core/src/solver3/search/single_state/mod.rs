#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(target_arch = "wasm32")]
use js_sys;

mod correctness;
mod default_loop;
mod diversification;
mod driver;
mod general_loop;
mod result;

use super::context::SearchProgressState;
pub(crate) use correctness::maybe_run_sampled_correctness_check;
use diversification::{
    extend_no_improvement_streak, should_attempt_diversification_burst, try_diversification_burst,
};
#[cfg(any(
    test,
    feature = "solver3-experimental-memetic",
    feature = "solver3-experimental-recombination"
))]
pub(crate) use driver::polish_state;
pub(crate) use driver::{run, LocalImproverBudget, LocalImproverRunResult};
use driver::{run_local_improver, LocalImproverHooks};
pub(crate) use result::{apply_previewed_move, build_solver_result, should_emit_progress_callback};

const TIME_REFRESH_INTERVAL: u64 = 64;

#[cfg(not(target_arch = "wasm32"))]
fn get_current_time() -> Instant {
    Instant::now()
}

#[cfg(target_arch = "wasm32")]
fn get_current_time() -> f64 {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn get_elapsed_seconds(start: Instant) -> f64 {
    start.elapsed().as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn get_elapsed_seconds(start: f64) -> f64 {
    (js_sys::Date::now() - start) / 1000.0
}

#[cfg(not(target_arch = "wasm32"))]
fn get_elapsed_seconds_between(start: Instant, end: Instant) -> f64 {
    end.duration_since(start).as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn get_elapsed_seconds_between(start: f64, end: f64) -> f64 {
    (end - start) / 1000.0
}

#[inline]
fn time_limit_exceeded(elapsed_seconds: f64, time_limit_seconds: Option<f64>) -> bool {
    time_limit_seconds.is_some_and(|limit| elapsed_seconds >= limit)
}

#[inline]
fn runtime_scaled_no_improvement_limit_reached(
    search: &SearchProgressState,
    elapsed_seconds: f64,
    budget: LocalImproverBudget,
) -> bool {
    let Some(config) = budget.runtime_scaled_no_improvement_stop else {
        return false;
    };
    let incumbent_found_at_seconds = search
        .best_score_timeline
        .last()
        .map(|point| point.elapsed_seconds)
        .unwrap_or(0.0);
    let no_improvement_seconds = (elapsed_seconds - incumbent_found_at_seconds).max(0.0);
    let dynamic_limit_seconds =
        incumbent_found_at_seconds * config.runtime_scale_factor + config.grace_seconds;
    no_improvement_seconds >= dynamic_limit_seconds
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::models::{
        ApiInput, BestScoreTimelinePoint, Group, Objective, Person, ProblemDefinition,
        SolverConfiguration, SolverParams, StopConditions,
    };
    use crate::solver3::runtime_state::RuntimeState;

    use super::super::context::{RuntimeScaledNoImprovementStopConfig, SearchProgressState};
    use super::{runtime_scaled_no_improvement_limit_reached, LocalImproverBudget};

    fn simple_state() -> RuntimeState {
        let input = ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 2,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: SolverConfiguration {
                solver_type: "solver3".into(),
                stop_conditions: StopConditions {
                    max_iterations: Some(10),
                    time_limit_seconds: None,
                    no_improvement_iterations: None,
                    stop_on_optimal_score: false,
                },
                solver_params: SolverParams::Solver3(Default::default()),
                logging: Default::default(),
                telemetry: Default::default(),
                seed: Some(1),
                move_policy: None,
                allowed_sessions: None,
            },
        };
        RuntimeState::from_input(&input).unwrap()
    }

    fn budget_with_scale(runtime_scale_factor: f64) -> LocalImproverBudget {
        LocalImproverBudget {
            effective_seed: 1,
            max_iterations: 10,
            no_improvement_limit: None,
            time_limit_seconds: None,
            stop_on_optimal_score: false,
            runtime_scaled_no_improvement_stop: Some(RuntimeScaledNoImprovementStopConfig {
                runtime_scale_factor,
                grace_seconds: 0.1,
            }),
        }
    }

    fn budget() -> LocalImproverBudget {
        budget_with_scale(1.0)
    }

    #[test]
    fn runtime_scaled_no_improvement_stop_uses_search_time_since_incumbent() {
        let mut search = SearchProgressState::new(simple_state());

        assert!(!runtime_scaled_no_improvement_limit_reached(
            &search,
            0.099,
            budget()
        ));
        assert!(runtime_scaled_no_improvement_limit_reached(
            &search,
            0.100,
            budget()
        ));

        search.best_score_timeline.push(BestScoreTimelinePoint {
            iteration: 5,
            elapsed_seconds: 0.5,
            best_score: search.best_score - 1.0,
        });
        assert!(!runtime_scaled_no_improvement_limit_reached(
            &search,
            1.099,
            budget()
        ));
        assert!(runtime_scaled_no_improvement_limit_reached(
            &search,
            1.100,
            budget()
        ));

        assert!(!runtime_scaled_no_improvement_limit_reached(
            &search,
            1.599,
            budget_with_scale(2.0)
        ));
        assert!(runtime_scaled_no_improvement_limit_reached(
            &search,
            1.600,
            budget_with_scale(2.0)
        ));
    }
}
