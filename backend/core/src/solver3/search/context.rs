use std::collections::VecDeque;

use crate::models::{
    MoveFamily, MoveFamilyBenchmarkTelemetry, MoveFamilyBenchmarkTelemetrySummary, MovePolicy,
    SolverConfiguration,
};
use crate::solver_support::SolverError;

use super::super::runtime_state::RuntimeState;

const DEFAULT_MAX_ITERATIONS: u64 = 10_000;
const RECENT_WINDOW: usize = 100;

#[derive(Debug, Clone)]
pub(crate) struct SearchRunContext {
    pub(crate) effective_seed: u64,
    pub(crate) move_policy: MovePolicy,
    pub(crate) max_iterations: u64,
    pub(crate) no_improvement_limit: Option<u64>,
    pub(crate) time_limit_seconds: Option<u64>,
    pub(crate) allowed_sessions: Vec<usize>,
}

impl SearchRunContext {
    pub(crate) fn from_solver(
        configuration: &SolverConfiguration,
        state: &RuntimeState,
        effective_seed: u64,
    ) -> Result<Self, SolverError> {
        let move_policy = configuration
            .move_policy
            .clone()
            .unwrap_or_default()
            .normalized()
            .map_err(SolverError::ValidationError)?;

        Ok(Self {
            effective_seed,
            move_policy,
            max_iterations: configuration
                .stop_conditions
                .max_iterations
                .unwrap_or(DEFAULT_MAX_ITERATIONS),
            no_improvement_limit: configuration.stop_conditions.no_improvement_iterations,
            time_limit_seconds: configuration.stop_conditions.time_limit_seconds,
            allowed_sessions: state
                .compiled
                .allowed_sessions
                .clone()
                .unwrap_or_else(|| (0..state.compiled.num_sessions).collect()),
        })
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
#[allow(dead_code)]
pub(crate) struct SearchPolicyMemory {
    pub(crate) tabu: Option<TabuPolicyMemory>,
    pub(crate) threshold: Option<ThresholdAcceptanceMemory>,
    pub(crate) late_acceptance: Option<LateAcceptanceMemory>,
    pub(crate) ils: Option<IteratedLocalSearchMemory>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TabuPolicyMemory {
    pub(crate) tenure_hint: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ThresholdAcceptanceMemory {
    pub(crate) threshold_score: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LateAcceptanceMemory {
    pub(crate) window_len: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct IteratedLocalSearchMemory {
    pub(crate) perturbation_round: u64,
}

#[derive(Debug, Clone)]
pub(crate) struct SearchProgressState {
    pub(crate) current_state: RuntimeState,
    pub(crate) best_state: RuntimeState,
    pub(crate) initial_score: f64,
    pub(crate) best_score: f64,
    pub(crate) no_improvement_count: u64,
    pub(crate) iterations_completed: u64,
    pub(crate) local_optima_escapes: u64,
    pub(crate) attempted_delta_sum: f64,
    pub(crate) accepted_delta_sum: f64,
    pub(crate) biggest_attempted_increase: f64,
    pub(crate) biggest_accepted_increase: f64,
    pub(crate) recent_acceptance: VecDeque<bool>,
    pub(crate) move_metrics: MoveFamilyBenchmarkTelemetrySummary,
    #[allow(dead_code)]
    pub(crate) policy_memory: SearchPolicyMemory,
}

impl SearchProgressState {
    pub(crate) fn new(initial_state: RuntimeState) -> Self {
        let initial_score = initial_state.total_score;
        Self {
            current_state: initial_state.clone(),
            best_state: initial_state,
            initial_score,
            best_score: initial_score,
            no_improvement_count: 0,
            iterations_completed: 0,
            local_optima_escapes: 0,
            attempted_delta_sum: 0.0,
            accepted_delta_sum: 0.0,
            biggest_attempted_increase: 0.0,
            biggest_accepted_increase: 0.0,
            recent_acceptance: VecDeque::with_capacity(RECENT_WINDOW),
            move_metrics: MoveFamilyBenchmarkTelemetrySummary::default(),
            policy_memory: SearchPolicyMemory::default(),
        }
    }

    pub(crate) fn record_preview_attempt(
        &mut self,
        family: MoveFamily,
        preview_seconds: f64,
        delta_score: f64,
    ) {
        let metrics = family_metrics_mut(&mut self.move_metrics, family);
        metrics.attempts += 1;
        metrics.preview_seconds += preview_seconds;
        self.attempted_delta_sum += delta_score;
        self.biggest_attempted_increase = self.biggest_attempted_increase.max(delta_score.max(0.0));
    }

    pub(crate) fn record_accepted_move(
        &mut self,
        family: MoveFamily,
        apply_seconds: f64,
        delta_score: f64,
        escaped_local_optimum: bool,
    ) {
        let metrics = family_metrics_mut(&mut self.move_metrics, family);
        metrics.accepted += 1;
        metrics.apply_seconds += apply_seconds;
        self.accepted_delta_sum += delta_score;
        if escaped_local_optimum {
            self.local_optima_escapes += 1;
            self.biggest_accepted_increase = self.biggest_accepted_increase.max(delta_score);
        }
    }

    pub(crate) fn record_rejected_move(&mut self, family: MoveFamily) {
        family_metrics_mut(&mut self.move_metrics, family).rejected += 1;
        self.no_improvement_count += 1;
        self.push_recent_acceptance(false);
    }

    pub(crate) fn record_no_candidate(&mut self) {
        self.no_improvement_count += 1;
        self.push_recent_acceptance(false);
    }

    pub(crate) fn refresh_best_from_current(&mut self) {
        if self.current_state.total_score < self.best_score {
            self.best_score = self.current_state.total_score;
            self.best_state = self.current_state.clone();
            self.no_improvement_count = 0;
        } else {
            self.no_improvement_count += 1;
        }
    }

    pub(crate) fn record_acceptance_result(&mut self, accepted: bool) {
        self.push_recent_acceptance(accepted);
    }

    pub(crate) fn finish_iteration(&mut self, iteration: u64) {
        self.iterations_completed = iteration + 1;
    }

    fn push_recent_acceptance(&mut self, accepted: bool) {
        if self.recent_acceptance.len() == RECENT_WINDOW {
            self.recent_acceptance.pop_front();
        }
        self.recent_acceptance.push_back(accepted);
    }
}

fn family_metrics_mut(
    summary: &mut MoveFamilyBenchmarkTelemetrySummary,
    family: MoveFamily,
) -> &mut MoveFamilyBenchmarkTelemetry {
    match family {
        MoveFamily::Swap => &mut summary.swap,
        MoveFamily::Transfer => &mut summary.transfer,
        MoveFamily::CliqueSwap => &mut summary.clique_swap,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::models::{
        ApiInput, Group, Objective, Person, ProblemDefinition, Solver3Params,
        SolverConfiguration, SolverParams, StopConditions,
    };

    use super::{SearchProgressState, SearchRunContext};
    use crate::solver3::runtime_state::RuntimeState;

    fn solver3_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: "solver3".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(123),
                time_limit_seconds: Some(9),
                no_improvement_iterations: Some(17),
            },
            solver_params: SolverParams::Solver3(Solver3Params::default()),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(7),
            move_policy: None,
            allowed_sessions: None,
        }
    }

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
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: solver3_config(),
        };
        RuntimeState::from_input(&input).unwrap()
    }

    #[test]
    fn run_context_captures_search_limits_and_allowed_sessions() {
        let state = simple_state();
        let context = SearchRunContext::from_solver(&solver3_config(), &state, 7).unwrap();
        assert_eq!(context.effective_seed, 7);
        assert_eq!(context.max_iterations, 123);
        assert_eq!(context.no_improvement_limit, Some(17));
        assert_eq!(context.time_limit_seconds, Some(9));
        assert_eq!(context.allowed_sessions, vec![0, 1]);
    }

    #[test]
    fn progress_state_tracks_acceptance_and_best_state() {
        let mut progress = SearchProgressState::new(simple_state());
        progress.record_preview_attempt(crate::models::MoveFamily::Swap, 0.25, 1.5);
        progress.record_accepted_move(crate::models::MoveFamily::Swap, 0.1, 1.5, true);
        progress.record_acceptance_result(true);
        progress.current_state.total_score -= 2.0;
        progress.refresh_best_from_current();
        progress.finish_iteration(4);

        assert_eq!(progress.move_metrics.swap.attempts, 1);
        assert_eq!(progress.move_metrics.swap.accepted, 1);
        assert_eq!(progress.local_optima_escapes, 1);
        assert_eq!(progress.iterations_completed, 5);
        assert_eq!(progress.no_improvement_count, 0);
        assert_eq!(progress.recent_acceptance.back(), Some(&true));
        assert_eq!(progress.best_state.total_score, progress.current_state.total_score);
    }
}
