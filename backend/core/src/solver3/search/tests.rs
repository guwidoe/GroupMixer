use std::collections::HashMap;
use std::hint::black_box;
use std::time::Instant;

use rand::SeedableRng;
use rand_chacha::ChaCha12Rng;
use serde::Deserialize;

use crate::models::{
    ApiInput, Constraint, Group, MoveFamily, MoveFamilyWeights, MovePolicy, MoveSelectionMode,
    Objective, Person, ProblemDefinition, RepeatEncounterParams, Solver3HotspotGuidanceParams,
    Solver3Params, Solver3RepeatGuidedSwapParams, SolverConfiguration, SolverKind,
    SolverParams, StopConditions,
};
use crate::default_solver_configuration_for;
use crate::solver3::runtime_state::RuntimeState;

use super::acceptance::{AcceptanceInputs, SimulatedAnnealingAcceptance};
use super::candidate_sampling::{CandidateSampler, SwapSamplingOptions};
use super::context::{SearchProgressState, SearchRunContext};
use super::family_selection::MoveFamilySelector;
use super::single_state::{build_solver_result, polish_state, LocalImproverBudget};
use super::single_state::should_emit_progress_callback;
use super::SearchEngine;

#[derive(Debug, Deserialize)]
struct BenchmarkCaseInputEnvelope {
    input: ApiInput,
}

fn solver3_config() -> SolverConfiguration {
    SolverConfiguration {
        solver_type: "solver3".to_string(),
        stop_conditions: StopConditions {
            max_iterations: Some(40),
            time_limit_seconds: None,
            no_improvement_iterations: Some(40),
            stop_on_optimal_score: true,
        },
        solver_params: SolverParams::Solver3(Solver3Params::default()),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: Some(7),
        move_policy: None,
        allowed_sessions: None,
    }
}

fn search_input() -> ApiInput {
    let people = vec![
        Person {
            id: "p0".into(),
            attributes: HashMap::from([("role".into(), "eng".into())]),
            sessions: None,
        },
        Person {
            id: "p1".into(),
            attributes: HashMap::from([("role".into(), "design".into())]),
            sessions: None,
        },
        Person {
            id: "p2".into(),
            attributes: HashMap::from([("role".into(), "eng".into())]),
            sessions: None,
        },
        Person {
            id: "p3".into(),
            attributes: HashMap::from([("role".into(), "design".into())]),
            sessions: None,
        },
    ];

    let groups = vec![
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
    ];

    ApiInput {
        problem: ProblemDefinition {
            people,
            groups,
            num_sessions: 2,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![],
        solver: solver3_config(),
    }
}

fn repeat_guidance_input() -> ApiInput {
    ApiInput {
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
        initial_schedule: Some(HashMap::from([
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
                    ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                    ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                ]),
            ),
        ])),
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "linear".into(),
            penalty_weight: 100.0,
        })],
        solver: solver3_config(),
    }
}

fn sailing_trip_benchmark_start_solver3_input() -> ApiInput {
    let mut envelope: BenchmarkCaseInputEnvelope = serde_json::from_str(include_str!(
        "../../../../benchmarking/cases/stretch/sailing_trip_demo_real_benchmark_start.json"
    ))
    .expect("Sailing Trip benchmark-start case should parse");

    let mut solver = default_solver_configuration_for(SolverKind::Solver3);
    solver.seed = Some(7);
    solver.stop_conditions.max_iterations = Some(1);
    solver.stop_conditions.time_limit_seconds = None;
    solver.stop_conditions.no_improvement_iterations = None;
    solver.stop_conditions.stop_on_optimal_score = false;
    envelope.input.solver = solver;
    envelope.input
}

fn sailing_trip_raw_solver3_input() -> ApiInput {
    let mut envelope: BenchmarkCaseInputEnvelope = serde_json::from_str(include_str!(
        "../../../../benchmarking/cases/stretch/sailing_trip_demo_real.json"
    ))
    .expect("Sailing Trip raw case should parse");

    let mut solver = default_solver_configuration_for(SolverKind::Solver3);
    solver.seed = Some(7);
    solver.stop_conditions.max_iterations = Some(1_000_000);
    solver.stop_conditions.time_limit_seconds = None;
    solver.stop_conditions.no_improvement_iterations = None;
    solver.stop_conditions.stop_on_optimal_score = false;
    envelope.input.solver = solver;
    envelope.input
}

fn average_micros(elapsed: std::time::Duration, iterations: usize) -> f64 {
    elapsed.as_secs_f64() * 1_000_000.0 / iterations as f64
}

#[test]
#[ignore = "diagnostic microbenchmark; run explicitly with --release -- --ignored --nocapture"]
fn diagnose_sailing_trip_search_hotpath_breakdown() {
    let input = sailing_trip_benchmark_start_solver3_input();
    let base_state = RuntimeState::from_input(&input).expect("benchmark-start state should build");
    let run_context = SearchRunContext::from_solver(&input.solver, &base_state, 7)
        .expect("run context should build");
    let budget = LocalImproverBudget {
        effective_seed: 7,
        max_iterations: 1,
        no_improvement_limit: None,
        time_limit_seconds: None,
        stop_on_optimal_score: false,
    };
    let family_selector = MoveFamilySelector::new(&run_context.move_policy);
    let sampler = CandidateSampler;

    const FAST_ITERS: usize = 4_000;
    const SOLVE_ITERS: usize = 1_000;

    for _ in 0..128 {
        black_box(base_state.clone());
        black_box(
            SearchRunContext::from_solver(&input.solver, &base_state, 7)
                .expect("warmup context should build"),
        );
        black_box(SearchProgressState::new(base_state.clone()));
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        black_box(sampler.select_previewed_move(
            &base_state,
            &family_selector,
            &run_context.allowed_sessions,
            SwapSamplingOptions::default(),
            &mut rng,
        ));
        black_box(
            polish_state(base_state.clone(), &run_context, budget)
                .expect("warmup polish should succeed"),
        );
        let mut state = base_state.clone();
        black_box(
            SearchEngine::new(&input.solver)
                .solve(&mut state, None, None)
                .expect("warmup solve should succeed"),
        );
    }

    let mut checksum: u64 = 0;

    let clone_started = Instant::now();
    for _ in 0..FAST_ITERS {
        let cloned = black_box(base_state.clone());
        checksum ^= black_box(cloned.total_score.to_bits());
    }
    let clone_us = average_micros(clone_started.elapsed(), FAST_ITERS);

    let context_started = Instant::now();
    for _ in 0..FAST_ITERS {
        let context = black_box(
            SearchRunContext::from_solver(&input.solver, &base_state, 7)
                .expect("context should build"),
        );
        checksum ^= black_box(context.allowed_sessions.len() as u64);
    }
    let context_us = average_micros(context_started.elapsed(), FAST_ITERS);

    let progress_started = Instant::now();
    for _ in 0..FAST_ITERS {
        let progress = black_box(SearchProgressState::new(base_state.clone()));
        checksum ^= black_box(progress.best_score.to_bits());
    }
    let progress_us = average_micros(progress_started.elapsed(), FAST_ITERS);

    let sample_started = Instant::now();
    for _ in 0..FAST_ITERS {
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let selection = black_box(sampler.select_previewed_move(
            &base_state,
            &family_selector,
            &run_context.allowed_sessions,
            SwapSamplingOptions::default(),
            &mut rng,
        ));
        if let Some((_, preview, _)) = selection.selection {
            checksum ^= black_box(preview.delta_score().to_bits());
        }
    }
    let sample_us = average_micros(sample_started.elapsed(), FAST_ITERS);

    let baseline_polish = polish_state(base_state.clone(), &run_context, budget)
        .expect("baseline polish_state should succeed");

    let schedule_started = Instant::now();
    for _ in 0..SOLVE_ITERS {
        let schedule = black_box(base_state.to_api_schedule());
        checksum ^= black_box(schedule.len() as u64);
    }
    let schedule_us = average_micros(schedule_started.elapsed(), SOLVE_ITERS);

    let oracle_started = Instant::now();
    for _ in 0..SOLVE_ITERS {
        let oracle = black_box(
            super::super::oracle::oracle_score(&baseline_polish.search.best_state)
                .expect("oracle score should succeed"),
        );
        checksum ^= black_box(oracle.constraint_penalty_raw as u64);
    }
    let oracle_us = average_micros(oracle_started.elapsed(), SOLVE_ITERS);

    let telemetry_started = Instant::now();
    for _ in 0..SOLVE_ITERS {
        let telemetry = black_box(baseline_polish.search.to_benchmark_telemetry(
            &run_context,
            baseline_polish.stop_reason,
            baseline_polish.search_seconds,
        ));
        checksum ^= black_box(telemetry.initial_score.to_bits());
    }
    let telemetry_us = average_micros(telemetry_started.elapsed(), SOLVE_ITERS);

    let finalize_started = Instant::now();
    for _ in 0..SOLVE_ITERS {
        let telemetry = baseline_polish.search.to_benchmark_telemetry(
            &run_context,
            baseline_polish.stop_reason,
            baseline_polish.search_seconds,
        );
        let result = black_box(
            build_solver_result(
                &baseline_polish.search.best_state,
                baseline_polish.search.no_improvement_count,
                run_context.effective_seed,
                run_context.move_policy.clone(),
                baseline_polish.stop_reason,
                telemetry,
            )
            .expect("finalize should succeed"),
        );
        checksum ^= black_box(result.final_score.to_bits());
    }
    let finalize_us = average_micros(finalize_started.elapsed(), SOLVE_ITERS);

    let polish_started = Instant::now();
    for _ in 0..SOLVE_ITERS {
        let result = black_box(
            polish_state(base_state.clone(), &run_context, budget)
                .expect("polish_state should succeed"),
        );
        checksum ^= black_box(result.search.best_score.to_bits());
    }
    let polish_us = average_micros(polish_started.elapsed(), SOLVE_ITERS);

    let solve_started = Instant::now();
    for _ in 0..SOLVE_ITERS {
        let mut state = base_state.clone();
        let result = black_box(
            SearchEngine::new(&input.solver)
                .solve(&mut state, None, None)
                .expect("solve should succeed"),
        );
        checksum ^= black_box(result.final_score.to_bits());
    }
    let solve_us = average_micros(solve_started.elapsed(), SOLVE_ITERS);

    println!(
        "solver3 sailing hotpath breakdown (µs/op): clone={clone_us:.3}, context={context_us:.3}, progress={progress_us:.3}, sample={sample_us:.3}, schedule={schedule_us:.3}, oracle={oracle_us:.3}, telemetry={telemetry_us:.3}, finalize={finalize_us:.3}, polish_iter={polish_us:.3}, full_solve_1_iter={solve_us:.3}, setup_delta={:.3}, checksum={checksum}",
        solve_us - polish_us,
    );
}

#[test]
#[ignore = "diagnostic microbenchmark; run explicitly with --release -- --ignored --nocapture"]
fn diagnose_sailing_trip_preview_wrapper_breakdown() {
    let input = sailing_trip_raw_solver3_input();
    let state = RuntimeState::from_input(&input).expect("raw sailing state should build");
    let run_context = SearchRunContext::from_solver(&input.solver, &state, 7)
        .expect("run context should build");
    let family_selector = MoveFamilySelector::new(&run_context.move_policy);
    let sampler = CandidateSampler;

    const ITERS: usize = 40_000;

    for seed in 0..256u64 {
        let mut rng = ChaCha12Rng::seed_from_u64(seed);
        black_box(sampler.diagnose_select_previewed_move_default_timing(
            &state,
            &family_selector,
            &run_context.allowed_sessions,
            &mut rng,
        ));
    }

    #[derive(Default)]
    struct Bucket {
        count: u64,
        total_seconds: f64,
        proposal_seconds: f64,
        preview_kernel_seconds: f64,
    }

    let mut overall = Bucket::default();
    let mut per_family: HashMap<MoveFamily, Bucket> = HashMap::new();

    let started = Instant::now();
    let mut rng = ChaCha12Rng::seed_from_u64(7);
    for _ in 0..ITERS {
        let breakdown = black_box(sampler.diagnose_select_previewed_move_default_timing(
            &state,
            &family_selector,
            &run_context.allowed_sessions,
            &mut rng,
        ));
        overall.proposal_seconds += breakdown.proposal_seconds;
        overall.preview_kernel_seconds += breakdown.preview_kernel_seconds;
        if let Some((family, preview, total_seconds)) = breakdown.selection {
            let bucket = per_family.entry(family).or_default();
            bucket.count += 1;
            bucket.total_seconds += total_seconds;
            bucket.proposal_seconds += breakdown.proposal_seconds;
            bucket.preview_kernel_seconds += breakdown.preview_kernel_seconds;
            overall.count += 1;
            overall.total_seconds += total_seconds;
            black_box(preview.delta_score().to_bits());
        }
    }
    let wall_seconds = started.elapsed().as_secs_f64();

    let overall_total_us = overall.total_seconds * 1_000_000.0 / overall.count as f64;
    let overall_proposal_us = overall.proposal_seconds * 1_000_000.0 / overall.count as f64;
    let overall_preview_kernel_us =
        overall.preview_kernel_seconds * 1_000_000.0 / overall.count as f64;

    println!("sailing raw default-preview diagnostic over {} accepted samples", overall.count);
    println!(
        "  wall={:.3}s total={:.3}µs/sample proposal={:.3}µs/sample preview_kernel={:.3}µs/sample wrapper_share={:.1}%",
        wall_seconds,
        overall_total_us,
        overall_proposal_us,
        overall_preview_kernel_us,
        overall_proposal_us / overall_total_us * 100.0,
    );

    let mut families = per_family.into_iter().collect::<Vec<_>>();
    families.sort_by_key(|(family, _)| match family {
        MoveFamily::Swap => 0,
        MoveFamily::Transfer => 1,
        MoveFamily::CliqueSwap => 2,
    });

    for (family, bucket) in families {
        let total_us = bucket.total_seconds * 1_000_000.0 / bucket.count as f64;
        let proposal_us = bucket.proposal_seconds * 1_000_000.0 / bucket.count as f64;
        let preview_kernel_us = bucket.preview_kernel_seconds * 1_000_000.0 / bucket.count as f64;
        println!(
            "  {:?}: count={} total={:.3}µs proposal={:.3}µs preview_kernel={:.3}µs wrapper_share={:.1}%",
            family,
            bucket.count,
            total_us,
            proposal_us,
            preview_kernel_us,
            proposal_us / total_us * 100.0,
        );
    }

    assert!(overall.count > 0, "diagnostic should sample at least one move");
}

#[test]
fn acceptance_policy_marks_uphill_acceptance_as_escape() {
    let policy = SimulatedAnnealingAcceptance;
    let mut rng = ChaCha12Rng::seed_from_u64(0);
    let decision = policy.decide(
        AcceptanceInputs {
            iteration: 0,
            max_iterations: 1,
            elapsed_seconds: 0.0,
            time_limit_seconds: None,
            delta_score: 0.01,
        },
        &mut rng,
    );
    assert!(decision.accepted);
    assert!(decision.escaped_local_optimum);
}

#[test]
fn family_selector_honors_allowed_family_subset() {
    let selector = MoveFamilySelector::new(&MovePolicy {
        allowed_families: Some(vec![MoveFamily::Transfer]),
        ..Default::default()
    });
    let mut rng = ChaCha12Rng::seed_from_u64(7);
    assert_eq!(
        selector.ordered_families(&mut rng),
        vec![MoveFamily::Transfer]
    );
}

#[test]
fn candidate_sampler_respects_allowed_sessions() {
    let state = RuntimeState::from_input(&search_input()).unwrap();
    let selector = MoveFamilySelector::new(&MovePolicy {
        forced_family: Some(MoveFamily::Swap),
        ..Default::default()
    });
    let sampler = CandidateSampler;
    let mut rng = ChaCha12Rng::seed_from_u64(7);
    let (_family, preview, _seconds) = sampler
        .select_previewed_move(
            &state,
            &selector,
            &[1],
            SwapSamplingOptions::default(),
            &mut rng,
        )
        .selection
        .expect("swap preview should be sampled");
    assert_eq!(preview.session_idx(), 1);
}

#[test]
fn progress_state_reports_allowed_move_policy_in_progress_updates() {
    let state = RuntimeState::from_input(&search_input()).unwrap();
    let run_context = SearchRunContext::from_solver(&solver3_config(), &state, 7).unwrap();
    let progress =
        SearchProgressState::new(state).to_progress_update(&run_context, 0, 1.0, 0.0, None);
    assert_eq!(progress.effective_seed, Some(7));
    assert_eq!(progress.move_policy, Some(run_context.move_policy));
}

#[test]
fn search_engine_respects_forced_family_in_telemetry() {
    let mut input = search_input();
    input.solver.stop_conditions.stop_on_optimal_score = false;
    input.solver.move_policy = Some(MovePolicy {
        forced_family: Some(MoveFamily::Swap),
        ..Default::default()
    });

    let mut state = RuntimeState::from_input(&input).unwrap();
    let result = SearchEngine::new(&input.solver)
        .solve(&mut state, None, None)
        .unwrap();
    let telemetry = result.benchmark_telemetry.expect("telemetry should exist");

    assert!(telemetry.moves.swap.attempts > 0);
    assert_eq!(telemetry.moves.transfer.attempts, 0);
    assert_eq!(telemetry.moves.clique_swap.attempts, 0);
    assert_eq!(
        result.move_policy.unwrap().forced_family,
        Some(MoveFamily::Swap)
    );
}

#[test]
fn search_engine_is_seed_stable_for_same_policy() {
    let mut input = search_input();
    input.solver.move_policy = Some(MovePolicy {
        mode: MoveSelectionMode::Weighted,
        weights: Some(MoveFamilyWeights {
            swap: 1.0,
            transfer: 0.0,
            clique_swap: 0.0,
        }),
        ..Default::default()
    });

    let mut left = RuntimeState::from_input(&input).unwrap();
    let mut right = RuntimeState::from_input(&input).unwrap();
    let left_result = SearchEngine::new(&input.solver)
        .solve(&mut left, None, None)
        .unwrap();
    let right_result = SearchEngine::new(&input.solver)
        .solve(&mut right, None, None)
        .unwrap();

    assert_eq!(left_result.final_score, right_result.final_score);
    assert_eq!(left_result.stop_reason, right_result.stop_reason);
    assert_eq!(left_result.schedule, right_result.schedule);
}

#[test]
fn progress_callbacks_emit_on_first_iteration_and_after_interval() {
    assert!(should_emit_progress_callback(0, 0.0));
    assert!(!should_emit_progress_callback(1, 0.099));
    assert!(should_emit_progress_callback(1, 0.1));
}

#[test]
fn benchmark_timeline_elapsed_seconds_are_monotonic_and_progressive() {
    let mut input = search_input();
    input.solver.stop_conditions.max_iterations = Some(200);
    input.solver.stop_conditions.stop_on_optimal_score = false;

    let mut state = RuntimeState::from_input(&input).unwrap();
    let result = SearchEngine::new(&input.solver)
        .solve(&mut state, None, None)
        .unwrap();
    let telemetry = result.benchmark_telemetry.expect("telemetry should exist");
    let timeline = telemetry.best_score_timeline;

    assert!(!timeline.is_empty());
    assert_eq!(timeline[0].elapsed_seconds, 0.0);
    assert!(timeline
        .windows(2)
        .all(|window| window[1].elapsed_seconds >= window[0].elapsed_seconds));

    if timeline.len() > 1 {
        assert!(timeline
            .windows(2)
            .any(|window| window[1].elapsed_seconds > window[0].elapsed_seconds));
    }
}

#[cfg(feature = "solver3-experimental-repeat-guidance")]
#[test]
fn search_engine_records_repeat_guided_swap_sampling_telemetry() {
    let mut input = repeat_guidance_input();
    input.solver.stop_conditions.max_iterations = Some(50);
    input.solver.stop_conditions.stop_on_optimal_score = false;
    input.solver.move_policy = Some(MovePolicy {
        forced_family: Some(MoveFamily::Swap),
        ..Default::default()
    });
    input.solver.solver_params = SolverParams::Solver3(Solver3Params {
        hotspot_guidance: Solver3HotspotGuidanceParams {
            repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                enabled: true,
                guided_proposal_probability: 1.0,
                candidate_preview_budget: 4,
            },
        },
        ..Default::default()
    });

    let mut state = RuntimeState::from_input(&input).unwrap();
    let result = SearchEngine::new(&input.solver)
        .solve(&mut state, None, None)
        .unwrap();
    let telemetry = result.benchmark_telemetry.expect("telemetry should exist");

    assert!(telemetry.repeat_guided_swaps.guided_attempts > 0);
    assert!(telemetry.repeat_guided_swaps.guided_successes > 0);
    assert!(
        telemetry.repeat_guided_swaps.guided_previewed_candidates
            >= telemetry.repeat_guided_swaps.guided_successes
    );
}

#[test]
fn search_engine_keeps_repeat_guided_telemetry_zero_when_disabled() {
    let input = search_input();
    let mut state = RuntimeState::from_input(&input).unwrap();
    let result = SearchEngine::new(&input.solver)
        .solve(&mut state, None, None)
        .unwrap();
    let telemetry = result.benchmark_telemetry.expect("telemetry should exist");

    assert_eq!(telemetry.repeat_guided_swaps.guided_attempts, 0);
    assert_eq!(telemetry.repeat_guided_swaps.guided_successes, 0);
    assert_eq!(telemetry.repeat_guided_swaps.guided_fallback_to_random, 0);
    assert_eq!(telemetry.repeat_guided_swaps.guided_previewed_candidates, 0);
}
