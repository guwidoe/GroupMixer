use crate::solver3::compiled_problem::PackedSchedule;

use super::*;

fn schedule(groups: &[&[&[usize]]]) -> PackedSchedule {
    groups
        .iter()
        .map(|session| session.iter().map(|group| group.to_vec()).collect())
        .collect()
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
