use crate::solver_support::SolverError;

use super::super::super::runtime_state::RuntimeState;
use super::super::context::{SearchProgressState, SearchRunContext};
use super::{run_local_improver, LocalImproverBudget, LocalImproverHooks};

const DIVERSIFICATION_BURST_STAGNATION_THRESHOLD: u64 = 25_000;
const DIVERSIFICATION_TOTAL_DONOR_POLISH_SECONDS: f64 = 2.0;
const DIVERSIFICATION_DONOR_COUNT: usize = 2;
const DIVERSIFICATION_MIN_REMAINING_TIME_SECONDS: f64 = 4.0;
const DIVERSIFICATION_PER_DONOR_ITERATION_DIVISOR: u64 = 10;
const DIVERSIFICATION_MIN_REMAINING_ITERATIONS: u64 = 50_000;

pub(super) struct DiversificationBurstOutcome {
    pub(super) best_offspring: Option<RuntimeState>,
    pub(super) iterations_consumed: u64,
}

pub(super) fn try_diversification_burst(
    recipient_state: &RuntimeState,
    run_context: &SearchRunContext,
    budget: LocalImproverBudget,
    iteration: u64,
) -> Result<DiversificationBurstOutcome, SolverError> {
    let mut best_offspring = None;
    let mut best_score = f64::INFINITY;
    let mut donor_best_states = Vec::with_capacity(DIVERSIFICATION_DONOR_COUNT);
    let mut iterations_consumed: u64 = 0;
    let remaining_iterations = budget.max_iterations.saturating_sub(iteration);

    for donor_ordinal in 0..DIVERSIFICATION_DONOR_COUNT {
        let donor_seed = diversify_seed(
            budget.effective_seed,
            iteration
                .saturating_add(1)
                .saturating_add(donor_ordinal as u64),
        );
        let Ok(donor_state) =
            RuntimeState::from_compiled_with_seed(recipient_state.compiled.clone(), donor_seed)
        else {
            continue;
        };
        let Ok(donor_outcome) = run_local_improver(
            donor_state,
            run_context,
            LocalImproverBudget {
                effective_seed: donor_seed,
                max_iterations: diversification_per_donor_iteration_budget(remaining_iterations),
                no_improvement_limit: None,
                time_limit_seconds: Some(diversification_per_donor_polish_seconds()),
                stop_on_optimal_score: budget.stop_on_optimal_score,
            },
            LocalImproverHooks {
                progress_callback: None,
                benchmark_observer: None,
            },
            false,
        ) else {
            continue;
        };
        iterations_consumed =
            iterations_consumed.saturating_add(donor_outcome.search.iterations_completed);
        donor_best_states.push(donor_outcome.search.best_state.clone());

        if let Some(offspring) = select_best_offspring_session(
            recipient_state,
            donor_best_states.last().expect("pushed donor state"),
            &run_context.allowed_sessions,
        )? {
            if offspring.total_score < best_score {
                best_score = offspring.total_score;
                best_offspring = Some(offspring);
            }
        }
    }

    if let Some(offspring) = select_best_cross_donor_bundle(
        recipient_state,
        &donor_best_states,
        &run_context.allowed_sessions,
    )? {
        if offspring.total_score < best_score {
            best_offspring = Some(offspring);
        }
    }

    Ok(DiversificationBurstOutcome {
        best_offspring,
        iterations_consumed,
    })
}

#[inline]
pub(super) fn should_attempt_diversification_burst(
    no_improvement_count: u64,
    time_limit_seconds: Option<f64>,
    elapsed_seconds: f64,
    remaining_iterations: u64,
) -> bool {
    if no_improvement_count < DIVERSIFICATION_BURST_STAGNATION_THRESHOLD {
        return false;
    }

    if remaining_iterations < DIVERSIFICATION_MIN_REMAINING_ITERATIONS {
        return false;
    }

    time_limit_seconds.is_some_and(|limit| {
        elapsed_seconds + DIVERSIFICATION_TOTAL_DONOR_POLISH_SECONDS + 0.5
            < limit - DIVERSIFICATION_MIN_REMAINING_TIME_SECONDS
    })
}

#[inline]
fn diversification_per_donor_polish_seconds() -> f64 {
    (DIVERSIFICATION_TOTAL_DONOR_POLISH_SECONDS / DIVERSIFICATION_DONOR_COUNT as f64).max(0.1)
}

#[inline]
fn diversification_per_donor_iteration_budget(remaining_iterations: u64) -> u64 {
    (remaining_iterations / DIVERSIFICATION_PER_DONOR_ITERATION_DIVISOR).max(1)
}

fn select_best_offspring_session(
    recipient_state: &RuntimeState,
    donor_state: &RuntimeState,
    allowed_sessions: &[usize],
) -> Result<Option<RuntimeState>, SolverError> {
    let mut best_offspring = None;
    let mut best_score = f64::INFINITY;

    for &session_idx in allowed_sessions {
        let mut offspring = recipient_state.clone();
        offspring.overwrite_session_from(donor_state, session_idx)?;
        offspring.rebuild_pair_contacts();
        offspring.sync_score_from_oracle()?;
        if offspring.total_score < best_score {
            best_score = offspring.total_score;
            best_offspring = Some(offspring);
        }
    }

    Ok(best_offspring)
}

fn select_best_cross_donor_bundle(
    recipient_state: &RuntimeState,
    donors: &[RuntimeState],
    allowed_sessions: &[usize],
) -> Result<Option<RuntimeState>, SolverError> {
    if donors.len() < 2 {
        return Ok(None);
    }

    let mut best_offspring = None;
    let mut best_score = f64::INFINITY;

    for left_donor_idx in 0..donors.len() {
        for right_donor_idx in (left_donor_idx + 1)..donors.len() {
            for (left_session_pos, &left_session_idx) in allowed_sessions.iter().enumerate() {
                for &right_session_idx in allowed_sessions.iter().skip(left_session_pos + 1) {
                    let offspring = transplant_mixed_donor_sessions(
                        recipient_state,
                        &donors[left_donor_idx],
                        left_session_idx,
                        &donors[right_donor_idx],
                        right_session_idx,
                    )?;
                    if offspring.total_score < best_score {
                        best_score = offspring.total_score;
                        best_offspring = Some(offspring);
                    }
                }
            }
        }
    }

    Ok(best_offspring)
}

fn transplant_mixed_donor_sessions(
    recipient_state: &RuntimeState,
    left_donor: &RuntimeState,
    left_session_idx: usize,
    right_donor: &RuntimeState,
    right_session_idx: usize,
) -> Result<RuntimeState, SolverError> {
    let mut offspring = recipient_state.clone();
    offspring.overwrite_session_from(left_donor, left_session_idx)?;
    offspring.overwrite_session_from(right_donor, right_session_idx)?;
    offspring.rebuild_pair_contacts();
    offspring.sync_score_from_oracle()?;
    Ok(offspring)
}

#[inline]
fn diversify_seed(base_seed: u64, salt: u64) -> u64 {
    base_seed ^ 0x9e37_79b9_7f4a_7c15u64.wrapping_mul(salt.saturating_add(1))
}

#[inline]
pub(super) fn extend_no_improvement_streak(search: &mut SearchProgressState, steps: u64) {
    if steps == 0 {
        return;
    }
    search.no_improvement_count = search.no_improvement_count.saturating_add(steps);
    search.max_no_improvement_streak = search
        .max_no_improvement_streak
        .max(search.no_improvement_count);
}
