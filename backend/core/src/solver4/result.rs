use super::*;

pub(super) fn stop_reason_name(reason: StopReason) -> &'static str {
    match reason {
        StopReason::MaxIterationsReached => "max_iterations_reached",
        StopReason::TimeLimitReached => "time_limit_reached",
        StopReason::NoImprovementLimitReached => "no_improvement_limit_reached",
        StopReason::ProgressCallbackRequestedStop => "progress_callback_requested_stop",
        StopReason::OptimalScoreReached => "optimal_score_reached",
    }
}

pub(super) fn build_local_search_telemetry(
    configuration: &SolverConfiguration,
    effective_seed: u64,
    stop_reason: StopReason,
    iterations: u64,
    no_improvement_count: u64,
    max_no_improvement_streak: u64,
    breakout_count: u64,
    initial_score: f64,
    best_score: f64,
    final_score: f64,
    initialization_seconds: f64,
    search_seconds: f64,
    finalization_seconds: f64,
    best_score_timeline: &[crate::models::BestScoreTimelinePoint],
    sgp_tabu: Option<SgpWeekPairTabuBenchmarkTelemetry>,
    paper_trace: Option<Solver4PaperTrace>,
) -> SolverBenchmarkTelemetry {
    let total_seconds = initialization_seconds + search_seconds + finalization_seconds;
    SolverBenchmarkTelemetry {
        effective_seed,
        move_policy: configuration
            .move_policy
            .clone()
            .unwrap_or_else(MovePolicy::default),
        stop_reason,
        iterations_completed: iterations,
        no_improvement_count,
        max_no_improvement_streak,
        reheats_performed: 0,
        accepted_uphill_moves: 0,
        accepted_downhill_moves: 0,
        accepted_neutral_moves: iterations.saturating_sub(breakout_count),
        restart_count: None,
        perturbation_count: Some(breakout_count),
        initial_score,
        best_score,
        final_score,
        initialization_seconds,
        search_seconds,
        finalization_seconds,
        total_seconds,
        iterations_per_second: if search_seconds > 0.0 {
            iterations as f64 / search_seconds
        } else {
            0.0
        },
        best_score_timeline: best_score_timeline.to_vec(),
        repeat_guided_swaps: Default::default(),
        sgp_week_pair_tabu: sgp_tabu,
        memetic: None,
        donor_session_transplant: None,
        session_aligned_path_relinking: None,
        multi_root_balanced_session_inheritance: None,
        solver4_paper_trace: paper_trace,
        moves: MoveFamilyBenchmarkTelemetrySummary::default(),
    }
}

pub(super) fn build_solver_result(
    input: &ApiInput,
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    no_improvement_count: u64,
    effective_seed: u64,
    stop_reason: StopReason,
    benchmark_telemetry: Option<SolverBenchmarkTelemetry>,
) -> Result<SolverResult, SolverError> {
    let api_schedule = to_api_schedule(problem, schedule);
    let canonical = canonical_score_for_schedule(input, &api_schedule)?;

    Ok(SolverResult {
        final_score: canonical.total_score,
        schedule: api_schedule,
        unique_contacts: canonical.unique_contacts as i32,
        repetition_penalty: canonical.repetition_penalty_raw,
        attribute_balance_penalty: canonical.attribute_balance_penalty.round() as i32,
        constraint_penalty: canonical.constraint_penalty_raw,
        no_improvement_count,
        weighted_repetition_penalty: canonical.weighted_repetition_penalty,
        weighted_constraint_penalty: canonical.constraint_penalty_weighted,
        effective_seed: Some(effective_seed),
        move_policy: Some(crate::models::MovePolicy::default()),
        stop_reason: Some(stop_reason),
        benchmark_telemetry,
    })
}

pub(super) fn canonical_score_for_schedule(
    input: &ApiInput,
    schedule: &ApiSchedule,
) -> Result<OracleSnapshot, SolverError> {
    let mut canonical_input = input.clone();
    canonical_input.initial_schedule = Some(schedule.clone());
    canonical_input.construction_seed_schedule = None;

    let mut solver_override = crate::default_solver_configuration_for(SolverKind::Solver3);
    solver_override.stop_conditions = canonical_input.solver.stop_conditions.clone();
    solver_override.logging = canonical_input.solver.logging.clone();
    solver_override.telemetry = canonical_input.solver.telemetry.clone();
    solver_override.seed = canonical_input.solver.seed;
    solver_override.move_policy = canonical_input.solver.move_policy.clone();
    solver_override.allowed_sessions = canonical_input.solver.allowed_sessions.clone();
    canonical_input.solver = solver_override;

    let state = RuntimeState::from_input(&canonical_input).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver4 could not canonicalize its final schedule through solver3 scoring: {error}"
        ))
    })?;

    crate::solver3::recompute_oracle_score(&state)
}

pub(super) fn to_api_schedule(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
) -> HashMap<String, HashMap<String, Vec<String>>> {
    let mut api = HashMap::new();
    for (week_idx, groups) in schedule.iter().enumerate() {
        let mut week_map = HashMap::new();
        for (group_idx, members) in groups.iter().enumerate() {
            week_map.insert(
                problem.groups[group_idx].clone(),
                members
                    .iter()
                    .map(|person_idx| problem.people[*person_idx].clone())
                    .collect(),
            );
        }
        api.insert(format!("session_{week_idx}"), week_map);
    }
    api
}
