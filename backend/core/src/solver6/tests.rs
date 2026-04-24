use super::catalog::{
    store_cache_incumbent, Solver6CacheIncumbentStatus, SOLVER6_CACHE_POLICY_VERSION,
};
use super::problem::PureSgpProblem;
use super::SearchEngine;
use crate::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
    Solver6CacheMissPolicy, Solver6CacheParams, Solver6CacheWritePolicy,
    Solver6PairRepeatPenaltyModel, Solver6Params, Solver6SearchStrategy, Solver6SeedStrategy,
    SolverConfiguration, SolverKind, SolverParams, StopConditions,
};
use std::collections::HashMap;

fn solver6_config() -> SolverConfiguration {
    SolverConfiguration {
        solver_type: SolverKind::Solver6.canonical_id().into(),
        stop_conditions: StopConditions {
            max_iterations: Some(1_000_000),
            time_limit_seconds: Some(30),
            no_improvement_iterations: Some(100_000),
            stop_on_optimal_score: true,
        },
        solver_params: SolverParams::Solver6(Solver6Params::default()),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: Some(7),
        move_policy: None,
        allowed_sessions: None,
    }
}

fn pure_input(groups: usize, group_size: usize, weeks: usize) -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: (0..(groups * group_size))
                .map(|idx| Person {
                    id: format!("p{idx}"),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
            groups: (0..groups)
                .map(|idx| Group {
                    id: format!("g{idx}"),
                    size: group_size as u32,
                    session_sizes: None,
                })
                .collect(),
            num_sessions: weeks as u32,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "squared".into(),
            penalty_weight: 100.0,
        })],
        solver: solver6_config(),
    }
}

fn cache_params(root_path: String, miss_policy: Solver6CacheMissPolicy) -> Solver6CacheParams {
    Solver6CacheParams {
        root_path,
        miss_policy,
        write_policy: Solver6CacheWritePolicy::ReadWrite,
    }
}

fn exact_block_params(cache: Option<Solver6CacheParams>) -> Solver6Params {
    Solver6Params {
        exact_construction_handoff_enabled: false,
        seed_strategy: Solver6SeedStrategy::Solver5ExactBlockComposition,
        pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        search_strategy: Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
        cache,
        seed_time_limit_seconds: None,
        local_search_time_limit_seconds: None,
    }
}

fn exact_block_params_with_local_timeout(local_search_time_limit_seconds: Option<u64>) -> Solver6Params {
    Solver6Params {
        local_search_time_limit_seconds,
        ..exact_block_params(None)
    }
}

#[test]
fn solver6_hands_exact_cells_through_solver5_scaffold() {
    let input = pure_input(2, 2, 3);
    let result = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect("solver6 scaffold should hand exact cells through solver5");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 3);
}

#[test]
fn solver6_reports_reserved_pipeline_for_non_exact_cells() {
    let input = pure_input(8, 4, 20);
    let err = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect_err("solver6 scaffold should fail honestly once exact handoff ends");
    let message = err.to_string();
    assert!(message.contains("seeded repeat-minimization pipeline is still scaffold-only"));
    assert!(message.contains("solver5_exact_then_reserved_hybrid"));
    assert!(message.contains("linear_repeat_excess"));
}

#[test]
fn solver6_exact_block_search_returns_an_impossible_case_result() {
    let mut input = pure_input(8, 4, 20);
    input.solver.solver_params = SolverParams::Solver6(exact_block_params(None));

    let result = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect("solver6 should now return a searched exact-block result");
    assert_eq!(result.schedule.len(), 20);
    assert_eq!(result.unique_contacts, 496);
    assert!(result.repetition_penalty > 0);
    assert!(result.final_score > 0.0);
}

#[test]
fn solver6_exact_block_search_supports_non_linear_objective_modes() {
    let mut input = pure_input(8, 4, 20);
    input.solver.solver_params = SolverParams::Solver6(Solver6Params {
        pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::TriangularRepeatExcess,
        ..exact_block_params(None)
    });

    let result = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect("solver6 should solve through the triangular deterministic hill-climb path");
    assert_eq!(result.schedule.len(), 20);
    assert!(result.repetition_penalty > 0);
}

#[test]
fn solver6_local_search_uses_solver6_timeout_not_stop_condition_time_limit() {
    let mut input = pure_input(8, 4, 20);
    input.solver.stop_conditions.time_limit_seconds = Some(0);
    input.solver.stop_conditions.max_iterations = Some(2);
    input.solver.solver_params = SolverParams::Solver6(exact_block_params_with_local_timeout(None));

    let result = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect("solver6 should ignore generic stop-condition time limit for local search");
    assert_ne!(
        result.stop_reason.map(|reason| format!("{reason:?}")),
        Some("TimeLimitReached".into())
    );
}

#[test]
fn solver6_exact_block_search_handles_non_multiple_horizons_via_mixed_seeds() {
    let mut input = pure_input(8, 3, 21);
    input.solver.stop_conditions.max_iterations = Some(60);
    input.solver.stop_conditions.no_improvement_iterations = Some(20);
    input.solver.solver_params = SolverParams::Solver6(exact_block_params(None));

    let result = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect("solver6 should support non-multiple horizons through mixed-tail seed selection");

    assert_eq!(result.schedule.len(), 21);
    assert!(result.repetition_penalty > 0);
    assert!(result.final_score > 0.0);
}

#[test]
fn solver6_cache_miss_with_error_policy_fails_explicitly() {
    let cache_dir =
        std::env::temp_dir().join(format!("solver6-cache-miss-{}", uuid::Uuid::new_v4()));
    let mut input = pure_input(8, 4, 20);
    input.solver.solver_params = SolverParams::Solver6(exact_block_params(Some(cache_params(
        cache_dir.to_string_lossy().into_owned(),
        Solver6CacheMissPolicy::Error,
    ))));

    let err = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect_err("cache miss should fail explicitly under error policy");
    assert!(err.to_string().contains("solver6 cache miss"));
}

#[test]
fn solver6_cache_miss_can_build_fresh_and_write_incumbent() {
    let cache_dir =
        std::env::temp_dir().join(format!("solver6-cache-build-{}", uuid::Uuid::new_v4()));
    let mut input = pure_input(8, 4, 20);
    input.solver.solver_params = SolverParams::Solver6(exact_block_params(Some(cache_params(
        cache_dir.to_string_lossy().into_owned(),
        Solver6CacheMissPolicy::BuildFresh,
    ))));

    let result = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect("build-fresh cache policy should continue with live seed synthesis");
    assert_eq!(result.schedule.len(), 20);
    assert!(cache_dir.join("entries/g08_p04_w20.json").exists());
}

#[test]
fn solver6_can_load_a_matching_complete_cached_incumbent() {
    let cache_dir =
        std::env::temp_dir().join(format!("solver6-cache-hit-{}", uuid::Uuid::new_v4()));
    let mut input = pure_input(2, 2, 2);
    let problem = PureSgpProblem::from_input(&input).expect("pure input");
    let schedule = vec![vec![vec![0, 1], vec![2, 3]], vec![vec![0, 2], vec![1, 3]]];
    let params = cache_params(
        cache_dir.to_string_lossy().into_owned(),
        Solver6CacheMissPolicy::Error,
    );
    store_cache_incumbent(
        &params,
        &problem,
        schedule,
        Solver6CacheIncumbentStatus::KnownOptimal,
        None,
        None,
        None,
    )
    .expect("cache entry should store");

    input.solver.solver_params = SolverParams::Solver6(exact_block_params(Some(params)));
    let result = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect("matching cache artifact should satisfy solver6 successfully");
    assert_eq!(result.schedule.len(), 2);
    assert_eq!(
        result.stop_reason.map(|reason| format!("{reason:?}")),
        Some("OptimalScoreReached".into())
    );
    assert_eq!(SOLVER6_CACHE_POLICY_VERSION, "solver6_cache_policy_v1");
}
