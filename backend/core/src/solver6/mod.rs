use crate::models::{
    ApiInput, Solver6CacheMissPolicy, SolverConfiguration, SolverParams, SolverResult, StopReason,
};
use crate::solver5::atoms::{
    query_construction_atom_from_solver6_input, Solver5AtomSpanRequest, Solver5ConstructionAtom,
};
use crate::solver_support::SolverError;
use std::time::Instant;

pub mod catalog;
mod problem;
pub mod reporting;
mod result;
mod scaffolding;
pub mod score;
mod search;
mod seed;

#[cfg(test)]
mod tests;

use crate::models::Solver6SeedStrategy;
use catalog::{
    lookup_cache_incumbent, store_cache_incumbent, Solver6CacheHit, Solver6CacheIncumbentStatus,
    Solver6CacheLookup,
};
use problem::PureSgpProblem;
use result::build_solver_result;
use scaffolding::ReservedExecutionPlan;
use search::{run_configured_local_search, state::LocalSearchState, RepeatAwareLocalSearchOutcome};
use seed::mixed::{build_preferred_mixed_seed, MixedSeedSelection};

pub const SOLVER6_NOTES: &str =
    "Hybrid pure-SGP repeat-minimization solver family. Solver6 combines solver5 exact constructions with deterministic exact-block relabeling, explicit mixed-tail seed selection (dominant-prefix, requested-tail atom, heuristic tail), an optional explicit offline seed catalog for expensive seed builds, and deterministic best-improving same-week hill climbing by default for impossible pure-SGP cases, while still failing explicitly for unsupported seed families.";

#[derive(Debug, Clone)]
struct ExecutedSolver6Run {
    problem: PureSgpProblem,
    effective_seed: u64,
    active_penalty_model: crate::models::Solver6PairRepeatPenaltyModel,
    final_schedule: Vec<Vec<Vec<usize>>>,
    stop_reason: StopReason,
    exact_handoff_atom: Option<Solver5ConstructionAtom>,
    cache_hit: Option<Solver6CacheHit>,
    cache_store_outcome: Option<catalog::Solver6CacheStoreOutcome>,
    seed_selection: Option<MixedSeedSelection>,
    local_search_outcome: Option<RepeatAwareLocalSearchOutcome>,
}

#[derive(Clone)]
pub struct SearchEngine {
    configuration: SolverConfiguration,
}

impl SearchEngine {
    pub fn new(configuration: &SolverConfiguration) -> Self {
        Self {
            configuration: configuration.clone(),
        }
    }

    pub fn solve(&self, input: &ApiInput) -> Result<SolverResult, SolverError> {
        let executed = execute_solver6_run(input, &self.configuration)?;
        build_solver_result(
            input,
            &executed.problem,
            &executed.final_schedule,
            executed.effective_seed,
            executed.stop_reason,
        )
    }
}

fn execute_solver6_run(
    input: &ApiInput,
    configuration: &SolverConfiguration,
) -> Result<ExecutedSolver6Run, SolverError> {
    let problem = PureSgpProblem::from_input(input)?;
    let params = match &configuration.solver_params {
        SolverParams::Solver6(params) => params,
        _ => {
            return Err(SolverError::ValidationError(
                "solver6 expected solver6 params after solver selection validation".into(),
            ));
        }
    };

    let effective_seed = input.solver.seed.unwrap_or(42);
    if params.exact_construction_handoff_enabled {
        if let Ok(atom) =
            query_construction_atom_from_solver6_input(input, Solver5AtomSpanRequest::RequestedSpan)
        {
            return Ok(ExecutedSolver6Run {
                problem,
                effective_seed,
                active_penalty_model: params.pair_repeat_penalty_model,
                final_schedule: atom.schedule.clone(),
                stop_reason: StopReason::OptimalScoreReached,
                exact_handoff_atom: Some(atom),
                cache_hit: None,
                cache_store_outcome: None,
                seed_selection: None,
                local_search_outcome: None,
            });
        }
    }

    let plan = ReservedExecutionPlan::from_params(params);
    if params.seed_strategy != Solver6SeedStrategy::Solver5ExactBlockComposition {
        return Err(SolverError::ValidationError(plan.reserved_message(
            problem.num_groups,
            problem.group_size,
            problem.num_weeks,
        )));
    }

    let mut cache_hit = None;
    let mut seed_runtime_micros = None;
    let (selection, seed_schedule) = if let Some(cache) = params.cache.as_ref() {
        match lookup_cache_incumbent(cache, &problem)? {
            Solver6CacheLookup::Hit(hit) if hit.entry.status.is_complete() => {
                let stop_reason = stop_reason_for_cache_status(hit.entry.status);
                return Ok(ExecutedSolver6Run {
                    problem,
                    effective_seed,
                    active_penalty_model: params.pair_repeat_penalty_model,
                    final_schedule: hit.entry.schedule.clone(),
                    stop_reason,
                    exact_handoff_atom: None,
                    cache_hit: Some(hit),
                    cache_store_outcome: None,
                    seed_selection: None,
                    local_search_outcome: None,
                });
            }
            Solver6CacheLookup::Hit(hit) => {
                let schedule = hit.entry.schedule.clone();
                cache_hit = Some(hit);
                (None, schedule)
            }
            Solver6CacheLookup::Miss { reason } => match cache.miss_policy {
                Solver6CacheMissPolicy::Error => {
                    return Err(SolverError::ValidationError(format!(
                        "solver6 cache miss for '{}': {reason}",
                        cache.root_path
                    )));
                }
                Solver6CacheMissPolicy::BuildFresh => {
                    let seed_started = Instant::now();
                    let selection = build_preferred_mixed_seed(input)?;
                    seed_runtime_micros = Some(seed_started.elapsed().as_micros() as u64);
                    let schedule = selection.seed.schedule.clone();
                    (Some(selection), schedule)
                }
            },
        }
    } else {
        let seed_started = Instant::now();
        let selection = build_preferred_mixed_seed(input)?;
        seed_runtime_micros = Some(seed_started.elapsed().as_micros() as u64);
        let schedule = selection.seed.schedule.clone();
        (Some(selection), schedule)
    };
    let mut state = LocalSearchState::new(
        problem.clone(),
        seed_schedule,
        params.pair_repeat_penalty_model,
    )?;
    let local_search_started = Instant::now();
    let mut local_search_stop_conditions = configuration.stop_conditions.clone();
    local_search_stop_conditions.time_limit_seconds = params.local_search_time_limit_seconds;
    let outcome = run_configured_local_search(
        &mut state,
        params.search_strategy,
        &local_search_stop_conditions,
        &problem,
        effective_seed,
    )?;
    let local_search_runtime_micros = local_search_started.elapsed().as_micros() as u64;
    let cache_store_outcome = if let Some(cache) = params.cache.as_ref() {
        Some(store_cache_incumbent(
            cache,
            &problem,
            outcome.best_schedule.clone(),
            cache_status_for_stop_reason(outcome.stop_reason),
            None,
            seed_runtime_micros,
            Some(local_search_runtime_micros),
        )?)
    } else {
        None
    };

    Ok(ExecutedSolver6Run {
        problem,
        effective_seed,
        active_penalty_model: params.pair_repeat_penalty_model,
        final_schedule: outcome.best_schedule.clone(),
        stop_reason: outcome.stop_reason,
        exact_handoff_atom: None,
        cache_hit,
        cache_store_outcome,
        seed_selection: selection,
        local_search_outcome: Some(outcome),
    })
}

fn cache_status_for_stop_reason(stop_reason: StopReason) -> Solver6CacheIncumbentStatus {
    match stop_reason {
        StopReason::OptimalScoreReached => Solver6CacheIncumbentStatus::KnownOptimal,
        StopReason::NoImprovementLimitReached => Solver6CacheIncumbentStatus::LocallyOptimal,
        StopReason::MaxIterationsReached | StopReason::TimeLimitReached => {
            Solver6CacheIncumbentStatus::SearchTimedOut
        }
        _ => Solver6CacheIncumbentStatus::SearchTimedOut,
    }
}

fn stop_reason_for_cache_status(status: Solver6CacheIncumbentStatus) -> StopReason {
    match status {
        Solver6CacheIncumbentStatus::KnownOptimal => StopReason::OptimalScoreReached,
        Solver6CacheIncumbentStatus::LocallyOptimal => StopReason::NoImprovementLimitReached,
        Solver6CacheIncumbentStatus::SearchTimedOut => StopReason::TimeLimitReached,
    }
}
