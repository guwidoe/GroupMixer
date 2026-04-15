use gm_core::default_solver_configuration_for;
use gm_core::models::{ApiInput, SolverKind, SolverResult};
use gm_core::solver3::scoring::OracleSnapshot;
use gm_core::solver3::validation::invariants::validate_invariants;
use gm_core::solver3::{recompute_oracle_score, RuntimeState};
use gm_core::solver_support::validation::validate_schedule_as_incumbent;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

const SCORE_EPSILON: f64 = 1e-6;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReportedScoreBreakdown {
    pub final_score: f64,
    pub unique_contacts: i32,
    pub repetition_penalty: i32,
    pub attribute_balance_penalty: i32,
    pub constraint_penalty: i32,
    pub weighted_repetition_penalty: f64,
    pub weighted_constraint_penalty: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecomputedScoreBreakdown {
    pub total_score: f64,
    pub baseline_score: f64,
    pub unique_contacts: i32,
    pub repetition_penalty: i32,
    pub weighted_repetition_penalty: f64,
    pub attribute_balance_penalty: f64,
    pub constraint_penalty: i32,
    pub weighted_constraint_penalty: f64,
    #[serde(default)]
    pub clique_violations: Vec<i32>,
    #[serde(default)]
    pub forbidden_pair_violations: Vec<i32>,
    #[serde(default)]
    pub should_together_violations: Vec<i32>,
    pub immovable_violations: i32,
    #[serde(default)]
    pub pair_meeting_counts: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExternalValidationAgreement {
    pub final_score: bool,
    pub unique_contacts: bool,
    pub repetition_penalty: bool,
    pub attribute_balance_penalty: bool,
    pub constraint_penalty: bool,
    pub weighted_repetition_penalty: bool,
    pub weighted_constraint_penalty: bool,
}

impl Default for ExternalValidationAgreement {
    fn default() -> Self {
        Self {
            final_score: false,
            unique_contacts: false,
            repetition_penalty: false,
            attribute_balance_penalty: false,
            constraint_penalty: false,
            weighted_repetition_penalty: false,
            weighted_constraint_penalty: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExternalValidationReport {
    pub validation_passed: bool,
    pub total_score_agreement: bool,
    pub score_breakdown_agreement: bool,
    pub invariants_passed: bool,
    pub schedule_roundtrip_exact: bool,
    pub component_agreement: ExternalValidationAgreement,
    pub reported: ReportedScoreBreakdown,
    #[serde(default)]
    pub recomputed: Option<RecomputedScoreBreakdown>,
    #[serde(default)]
    pub mismatch_diagnostics: Vec<String>,
}

pub fn validate_final_solution(
    input: &ApiInput,
    result: &SolverResult,
) -> ExternalValidationReport {
    let reported = ReportedScoreBreakdown {
        final_score: result.final_score,
        unique_contacts: result.unique_contacts,
        repetition_penalty: result.repetition_penalty,
        attribute_balance_penalty: result.attribute_balance_penalty,
        constraint_penalty: result.constraint_penalty,
        weighted_repetition_penalty: result.weighted_repetition_penalty,
        weighted_constraint_penalty: result.weighted_constraint_penalty,
    };

    let mut diagnostics = Vec::new();
    let mut validation_input = input.clone();
    validation_input.initial_schedule = Some(result.schedule.clone());
    validation_input.construction_seed_schedule = None;
    if let Err(error) = validate_schedule_as_incumbent(&validation_input, &result.schedule) {
        diagnostics.push(format!(
            "shared incumbent schedule validation failed before external recomputation: {error}"
        ));
        return ExternalValidationReport {
            validation_passed: false,
            total_score_agreement: false,
            score_breakdown_agreement: false,
            invariants_passed: false,
            schedule_roundtrip_exact: false,
            component_agreement: ExternalValidationAgreement::default(),
            reported,
            recomputed: None,
            mismatch_diagnostics: diagnostics,
        };
    }
    let mut solver_override = default_solver_configuration_for(SolverKind::Solver3);
    solver_override.stop_conditions = validation_input.solver.stop_conditions.clone();
    solver_override.logging = validation_input.solver.logging.clone();
    solver_override.telemetry = validation_input.solver.telemetry.clone();
    solver_override.seed = validation_input.solver.seed;
    solver_override.move_policy = validation_input.solver.move_policy.clone();
    solver_override.allowed_sessions = validation_input.solver.allowed_sessions.clone();
    validation_input.solver = solver_override;

    let state = match RuntimeState::from_input(&validation_input) {
        Ok(state) => state,
        Err(error) => {
            diagnostics.push(format!(
                "failed to build external validation state from solver schedule: {error}"
            ));
            return ExternalValidationReport {
                validation_passed: false,
                total_score_agreement: false,
                score_breakdown_agreement: false,
                invariants_passed: false,
                schedule_roundtrip_exact: false,
                component_agreement: ExternalValidationAgreement::default(),
                reported,
                recomputed: None,
                mismatch_diagnostics: diagnostics,
            };
        }
    };

    let normalized_schedule = state.to_api_schedule();
    let schedule_roundtrip_exact = normalized_schedule == result.schedule;
    if !schedule_roundtrip_exact {
        if let Some(diff) = first_schedule_difference(&result.schedule, &normalized_schedule) {
            diagnostics.push(format!(
                "solver-reported schedule is not a stable/complete assignment under external parsing: {diff}"
            ));
        } else {
            diagnostics.push(
                "solver-reported schedule differs from externally parsed schedule".to_string(),
            );
        }
    }

    let invariants_passed = match validate_invariants(&state) {
        Ok(()) => true,
        Err(error) => {
            diagnostics.push(format!("external invariant validation failed: {error}"));
            false
        }
    };

    let snapshot = match recompute_oracle_score(&state) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            diagnostics.push(format!(
                "external score recomputation failed for solver-reported schedule: {error}"
            ));
            return ExternalValidationReport {
                validation_passed: false,
                total_score_agreement: false,
                score_breakdown_agreement: false,
                invariants_passed,
                schedule_roundtrip_exact,
                component_agreement: ExternalValidationAgreement::default(),
                reported,
                recomputed: None,
                mismatch_diagnostics: diagnostics,
            };
        }
    };

    let recomputed = RecomputedScoreBreakdown {
        total_score: snapshot.total_score,
        baseline_score: snapshot.baseline_score,
        unique_contacts: snapshot.unique_contacts as i32,
        repetition_penalty: snapshot.repetition_penalty_raw,
        weighted_repetition_penalty: snapshot.weighted_repetition_penalty,
        attribute_balance_penalty: snapshot.attribute_balance_penalty,
        constraint_penalty: snapshot.constraint_penalty_raw,
        weighted_constraint_penalty: snapshot.constraint_penalty_weighted,
        clique_violations: snapshot.clique_violations.clone(),
        forbidden_pair_violations: snapshot.forbidden_pair_violations.clone(),
        should_together_violations: snapshot.should_together_violations.clone(),
        immovable_violations: snapshot.immovable_violations,
        pair_meeting_counts: snapshot.pair_meeting_counts.clone(),
    };

    let component_agreement = compare_breakdowns(&reported, &snapshot, &mut diagnostics);
    let total_score_agreement = component_agreement.final_score;
    let score_breakdown_agreement = component_agreement.unique_contacts
        && component_agreement.repetition_penalty
        && component_agreement.attribute_balance_penalty
        && component_agreement.constraint_penalty
        && component_agreement.weighted_repetition_penalty
        && component_agreement.weighted_constraint_penalty;
    let validation_passed = schedule_roundtrip_exact
        && invariants_passed
        && total_score_agreement
        && score_breakdown_agreement;

    ExternalValidationReport {
        validation_passed,
        total_score_agreement,
        score_breakdown_agreement,
        invariants_passed,
        schedule_roundtrip_exact,
        component_agreement,
        reported,
        recomputed: Some(recomputed),
        mismatch_diagnostics: diagnostics,
    }
}

pub fn validation_failure_summary(report: &ExternalValidationReport) -> String {
    if report.validation_passed {
        return "external final-solution validation passed".to_string();
    }

    if report.mismatch_diagnostics.is_empty() {
        return "external final-solution validation failed".to_string();
    }

    report
        .mismatch_diagnostics
        .iter()
        .take(3)
        .cloned()
        .collect::<Vec<_>>()
        .join("; ")
}

fn compare_breakdowns(
    reported: &ReportedScoreBreakdown,
    recomputed: &OracleSnapshot,
    diagnostics: &mut Vec<String>,
) -> ExternalValidationAgreement {
    let final_score = approx_equal(reported.final_score, recomputed.total_score);
    if !final_score {
        diagnostics.push(format!(
            "final score mismatch: solver={} external={}",
            reported.final_score, recomputed.total_score
        ));
    }

    let unique_contacts = reported.unique_contacts == recomputed.unique_contacts as i32;
    if !unique_contacts {
        diagnostics.push(format!(
            "unique_contacts mismatch: solver={} external={}",
            reported.unique_contacts, recomputed.unique_contacts
        ));
    }

    let repetition_penalty_required = !approx_equal(reported.weighted_repetition_penalty, 0.0)
        || !approx_equal(recomputed.weighted_repetition_penalty, 0.0);
    let repetition_penalty = !repetition_penalty_required
        || reported.repetition_penalty == recomputed.repetition_penalty_raw;
    if repetition_penalty_required && !repetition_penalty {
        diagnostics.push(format!(
            "repetition_penalty mismatch: solver={} external={}",
            reported.repetition_penalty, recomputed.repetition_penalty_raw
        ));
    }

    let attribute_balance_penalty =
        reported.attribute_balance_penalty == recomputed.attribute_balance_penalty as i32;
    if !attribute_balance_penalty {
        diagnostics.push(format!(
            "attribute_balance_penalty mismatch: solver={} external={} (truncated external={})",
            reported.attribute_balance_penalty,
            recomputed.attribute_balance_penalty,
            recomputed.attribute_balance_penalty as i32,
        ));
    }

    let constraint_penalty = reported.constraint_penalty == recomputed.constraint_penalty_raw;
    if !constraint_penalty {
        diagnostics.push(format!(
            "constraint_penalty mismatch: solver={} external={}",
            reported.constraint_penalty, recomputed.constraint_penalty_raw
        ));
    }

    let weighted_repetition_penalty = approx_equal(
        reported.weighted_repetition_penalty,
        recomputed.weighted_repetition_penalty,
    );
    if !weighted_repetition_penalty {
        diagnostics.push(format!(
            "weighted_repetition_penalty mismatch: solver={} external={}",
            reported.weighted_repetition_penalty, recomputed.weighted_repetition_penalty
        ));
    }

    let weighted_constraint_penalty = approx_equal(
        reported.weighted_constraint_penalty,
        recomputed.constraint_penalty_weighted,
    );
    if !weighted_constraint_penalty {
        diagnostics.push(format!(
            "weighted_constraint_penalty mismatch: solver={} external={}",
            reported.weighted_constraint_penalty, recomputed.constraint_penalty_weighted
        ));
    }

    ExternalValidationAgreement {
        final_score,
        unique_contacts,
        repetition_penalty,
        attribute_balance_penalty,
        constraint_penalty,
        weighted_repetition_penalty,
        weighted_constraint_penalty,
    }
}

fn first_schedule_difference(
    expected: &std::collections::HashMap<String, std::collections::HashMap<String, Vec<String>>>,
    actual: &std::collections::HashMap<String, std::collections::HashMap<String, Vec<String>>>,
) -> Option<String> {
    if expected.len() != actual.len() {
        return Some(format!(
            "session count differs: solver={} external={}",
            expected.len(),
            actual.len()
        ));
    }

    let all_sessions = expected
        .keys()
        .chain(actual.keys())
        .cloned()
        .collect::<BTreeSet<_>>();

    for session in all_sessions {
        let Some(expected_groups) = expected.get(&session) else {
            return Some(format!(
                "session '{session}' is missing from solver schedule"
            ));
        };
        let Some(actual_groups) = actual.get(&session) else {
            return Some(format!(
                "session '{session}' is missing from external schedule"
            ));
        };

        if expected_groups.len() != actual_groups.len() {
            return Some(format!(
                "group count differs in {session}: solver={} external={}",
                expected_groups.len(),
                actual_groups.len()
            ));
        }

        let all_groups = expected_groups
            .keys()
            .chain(actual_groups.keys())
            .cloned()
            .collect::<BTreeSet<_>>();

        for group in all_groups {
            let Some(expected_people) = expected_groups.get(&group) else {
                return Some(format!(
                    "group '{group}' in session '{session}' is missing from solver schedule"
                ));
            };
            let Some(actual_people) = actual_groups.get(&group) else {
                return Some(format!(
                    "group '{group}' in session '{session}' is missing from external schedule"
                ));
            };

            if expected_people != actual_people {
                return Some(format!(
                    "membership differs in {session}/{group}: solver={expected_people:?} external={actual_people:?}"
                ));
            }
        }
    }

    None
}

fn approx_equal(left: f64, right: f64) -> bool {
    let abs = (left - right).abs();
    let rel = SCORE_EPSILON * left.abs().max(right.abs()).max(1.0);
    abs <= rel
}

#[cfg(test)]
mod tests {
    use super::*;
    use gm_core::run_solver;
    use serde_json::json;

    fn tiny_input() -> ApiInput {
        serde_json::from_value(json!({
            "initial_schedule": null,
            "problem": {
                "people": [
                    { "id": "p0", "attributes": { "role": "eng" } },
                    { "id": "p1", "attributes": { "role": "eng" } },
                    { "id": "p2", "attributes": { "role": "design" } },
                    { "id": "p3", "attributes": { "role": "design" } }
                ],
                "groups": [
                    { "id": "g0", "size": 2 },
                    { "id": "g1", "size": 2 }
                ],
                "num_sessions": 2
            },
            "objectives": [
                { "type": "maximize_unique_contacts", "weight": 1.0 }
            ],
            "constraints": [
                {
                    "type": "AttributeBalance",
                    "group_id": "g0",
                    "attribute_key": "role",
                    "desired_values": { "eng": 1, "design": 1 },
                    "penalty_weight": 5.0,
                    "mode": "exact"
                }
            ],
            "solver": {
                "solver_type": "solver1",
                "stop_conditions": {
                    "max_iterations": 20,
                    "time_limit_seconds": null,
                    "no_improvement_iterations": null
                },
                "solver_params": {
                    "solver_type": "SimulatedAnnealing",
                    "initial_temperature": 2.0,
                    "final_temperature": 0.1,
                    "cooling_schedule": "geometric",
                    "reheat_after_no_improvement": 0,
                    "reheat_cycles": 0
                },
                "logging": {},
                "telemetry": {
                    "capture_benchmark": true
                },
                "seed": 7,
                "move_policy": null,
                "allowed_sessions": null
            }
        }))
        .expect("parse tiny input")
    }

    #[test]
    fn validation_passes_for_real_solver_output() {
        let input = tiny_input();
        let result = run_solver(&input).expect("solver output");

        let report = validate_final_solution(&input, &result);

        assert!(report.validation_passed, "{report:?}");
        assert!(report.total_score_agreement);
        assert!(report.score_breakdown_agreement);
        assert!(report.invariants_passed);
        assert!(report.schedule_roundtrip_exact);
        assert!(report.mismatch_diagnostics.is_empty());
    }

    #[test]
    fn validation_detects_final_total_score_mismatch() {
        let input = tiny_input();
        let mut result = run_solver(&input).expect("solver output");
        result.final_score += 1.0;

        let report = validate_final_solution(&input, &result);

        assert!(!report.validation_passed);
        assert!(!report.total_score_agreement);
        assert!(!report.component_agreement.final_score);
        assert!(report
            .mismatch_diagnostics
            .iter()
            .any(|entry| entry.contains("final score mismatch")));
    }

    #[test]
    fn validation_detects_score_breakdown_mismatch() {
        let input = tiny_input();
        let mut result = run_solver(&input).expect("solver output");
        result.weighted_constraint_penalty += 0.5;

        let report = validate_final_solution(&input, &result);

        assert!(!report.validation_passed);
        assert!(report.total_score_agreement);
        assert!(!report.score_breakdown_agreement);
        assert!(!report.component_agreement.weighted_constraint_penalty);
        assert!(report
            .mismatch_diagnostics
            .iter()
            .any(|entry| entry.contains("weighted_constraint_penalty mismatch")));
    }

    #[test]
    fn validation_detects_assignment_invariant_violation() {
        let input = tiny_input();
        let mut result = run_solver(&input).expect("solver output");

        let session = result
            .schedule
            .get_mut("session_0")
            .expect("session_0 exists");
        let duplicate_person = session
            .get("g0")
            .and_then(|members| members.first())
            .cloned()
            .expect("group g0 has a person");
        session
            .get_mut("g1")
            .expect("group g1 exists")
            .push(duplicate_person);

        let report = validate_final_solution(&input, &result);

        assert!(!report.validation_passed);
        assert!(!report.invariants_passed);
        assert!(!report.schedule_roundtrip_exact);
        assert!(report.mismatch_diagnostics.iter().any(|entry| {
            entry.contains("shared incumbent schedule validation failed")
                || entry.contains("failed to build external validation state")
        }));
    }
}
