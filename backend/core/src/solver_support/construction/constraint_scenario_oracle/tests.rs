use std::collections::HashMap;

use crate::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
    Solver3Params, SolverConfiguration, SolverParams, StopConditions,
};
use crate::solver3::compiled_problem::{CompiledProblem, PackedSchedule};

use super::types::ConstraintScenarioScaffoldMask;
use super::*;

fn schedule(groups: &[&[&[usize]]]) -> PackedSchedule {
    groups
        .iter()
        .map(|session| session.iter().map(|group| group.to_vec()).collect())
        .collect()
}

fn solver3_config() -> SolverConfiguration {
    SolverConfiguration {
        solver_type: "solver3".to_string(),
        stop_conditions: StopConditions {
            max_iterations: None,
            time_limit_seconds: None,
            no_improvement_iterations: None,
            stop_on_optimal_score: true,
        },
        solver_params: SolverParams::Solver3(Solver3Params::default()),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: None,
        move_policy: None,
        allowed_sessions: None,
    }
}

fn hard_apart_merge_input() -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: (0..4)
                .map(|idx| Person {
                    id: format!("p{idx}"),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
            groups: (0..2)
                .map(|idx| Group {
                    id: format!("g{idx}"),
                    size: 3,
                    session_sizes: None,
                })
                .collect(),
            num_sessions: 1,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "squared".into(),
                penalty_weight: 1000.0,
            }),
            Constraint::MustStayApart {
                people: vec!["p0".into(), "p1".into()],
                sessions: None,
            },
        ],
        solver: solver3_config(),
    }
}

fn neutral_signals(compiled: &CompiledProblem) -> ConstraintScenarioSignals {
    ConstraintScenarioSignals {
        pair_pressure_by_session_pair: vec![0.0; compiled.num_sessions * compiled.num_pairs],
        placement_histogram_by_person_session_group: vec![
            0.0;
            compiled.num_sessions
                * compiled.num_people
                * compiled.num_groups
        ],
        rigidity_by_person_session: vec![0.0; compiled.num_sessions * compiled.num_people],
        rigid_placement_count: 0,
        flexible_placement_count: compiled.num_sessions * compiled.num_people,
    }
}

fn unfrozen_mask(compiled: &CompiledProblem) -> ConstraintScenarioScaffoldMask {
    ConstraintScenarioScaffoldMask {
        frozen_by_person_session: vec![false; compiled.num_sessions * compiled.num_people],
        rigid_placement_count: 0,
        flexible_placement_count: compiled.num_sessions * compiled.num_people,
    }
}

#[test]
fn ensemble_selects_lowest_constraint_scenario_score() {
    let candidates = vec![
        ConstraintScenarioCandidate {
            schedule: schedule(&[&[&[0, 1], &[2, 3]]]),
            source: ConstraintScenarioCandidateSource::BaselineLegacy,
            seed: 1,
            cs_score: 10.0,
            real_score: 1.0,
        },
        ConstraintScenarioCandidate {
            schedule: schedule(&[&[&[0, 2], &[1, 3]]]),
            source: ConstraintScenarioCandidateSource::FreedomAwareDeterministic,
            seed: 2,
            cs_score: 5.0,
            real_score: 100.0,
        },
    ];

    let ensemble = build_constraint_scenario_ensemble(candidates).unwrap();
    assert_eq!(ensemble.best_index, 1);
    assert_eq!(
        ensemble.best().source.label(),
        "freedom_aware_deterministic"
    );
    assert!(ensemble.diversity > 0.0);
}

#[test]
fn ensemble_tie_breaks_on_real_score() {
    let candidates = vec![
        ConstraintScenarioCandidate {
            schedule: schedule(&[&[&[0, 1], &[2, 3]]]),
            source: ConstraintScenarioCandidateSource::BaselineLegacy,
            seed: 1,
            cs_score: 10.0,
            real_score: 20.0,
        },
        ConstraintScenarioCandidate {
            schedule: schedule(&[&[&[0, 2], &[1, 3]]]),
            source: ConstraintScenarioCandidateSource::FreedomAwareRandomized,
            seed: 2,
            cs_score: 10.0,
            real_score: 5.0,
        },
    ];

    let ensemble = build_constraint_scenario_ensemble(candidates).unwrap();
    assert_eq!(ensemble.best_index, 1);
}

#[test]
fn oracle_merge_filters_hard_apart_template_targets() {
    let compiled = CompiledProblem::compile(&hard_apart_merge_input()).unwrap();
    let scaffold = schedule(&[&[&[0, 2], &[1, 3]]]);
    let signals = neutral_signals(&compiled);
    let mask = unfrozen_mask(&compiled);
    let candidate = OracleTemplateCandidate {
        sessions: vec![0],
        groups_by_session: vec![vec![0, 1]],
        num_groups: 2,
        group_size: 2,
        oracle_capacity: 4,
        stable_people_count: 4,
        high_attendance_people_count: 4,
        dummy_oracle_people: 0,
        omitted_high_attendance_people: 0,
        omitted_group_count: 0,
        scaffold_disruption_risk: 0.0,
        estimated_score: 0.0,
    };
    let oracle_schedule = PureStructureOracleSchedule {
        schedule: schedule(&[&[&[0, 1], &[2, 3]]]),
    };
    let projection = OracleTemplateProjectionResult {
        real_person_by_oracle_person: vec![Some(0), Some(1), Some(2), Some(3)],
        real_group_by_session_oracle_group: vec![vec![0, 1]],
        score: 0.0,
        pair_alignment_score: 0.0,
        group_alignment_score: 0.0,
        rigidity_mismatch: 0.0,
        mapped_real_people: 4,
        dummy_oracle_people: 0,
    };

    let merged = merge_projected_oracle_template_into_scaffold(
        &compiled,
        &scaffold,
        &signals,
        &mask,
        &candidate,
        &oracle_schedule,
        &projection,
    )
    .unwrap();
    let p0_group = merged.schedule[0]
        .iter()
        .position(|group| group.contains(&0))
        .unwrap();
    let p1_group = merged.schedule[0]
        .iter()
        .position(|group| group.contains(&1))
        .unwrap();

    assert_ne!(p0_group, p1_group);
}
