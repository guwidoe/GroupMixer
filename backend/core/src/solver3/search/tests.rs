use std::collections::HashMap;

use rand::SeedableRng;
use rand_chacha::ChaCha12Rng;

use crate::models::{
    ApiInput, Group, MoveFamily, MoveFamilyWeights, MovePolicy, MoveSelectionMode, Objective,
    Person, ProblemDefinition, Solver3Params, SolverConfiguration, SolverParams, StopConditions,
};
use crate::solver3::runtime_state::RuntimeState;

use super::acceptance::{AcceptanceInputs, SimulatedAnnealingAcceptance};
use super::candidate_sampling::CandidateSampler;
use super::context::{SearchProgressState, SearchRunContext};
use super::family_selection::MoveFamilySelector;
use super::SearchEngine;

fn solver3_config() -> SolverConfiguration {
    SolverConfiguration {
        solver_type: "solver3".to_string(),
        stop_conditions: StopConditions {
            max_iterations: Some(40),
            time_limit_seconds: None,
            no_improvement_iterations: Some(40),
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
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![],
        solver: solver3_config(),
    }
}

#[test]
fn acceptance_policy_marks_uphill_acceptance_as_escape() {
    let policy = SimulatedAnnealingAcceptance;
    let mut rng = ChaCha12Rng::seed_from_u64(0);
    let decision = policy.decide(
        AcceptanceInputs {
            iteration: 0,
            max_iterations: 1,
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
    assert_eq!(selector.ordered_families(&mut rng), vec![MoveFamily::Transfer]);
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
        .select_previewed_move(&state, &selector, &[1], &mut rng)
        .expect("swap preview should be sampled");
    assert_eq!(preview.session_idx(), 1);
}

#[test]
fn progress_state_reports_allowed_move_policy_in_progress_updates() {
    let state = RuntimeState::from_input(&search_input()).unwrap();
    let run_context = SearchRunContext::from_solver(&solver3_config(), &state, 7).unwrap();
    let progress = SearchProgressState::new(state).to_progress_update(&run_context, 0, 1.0, 0.0, None);
    assert_eq!(progress.effective_seed, Some(7));
    assert_eq!(progress.move_policy, Some(run_context.move_policy));
}

#[test]
fn search_engine_respects_forced_family_in_telemetry() {
    let mut input = search_input();
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
    assert_eq!(result.move_policy.unwrap().forced_family, Some(MoveFamily::Swap));
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
