//! Constraint-scenario + oracle-guided construction scaffolding for solver3.
//!
//! The design is documented in
//! `backend/core/src/solver3/CONSTRAINT_SCENARIO_ORACLE_GUIDED_CONSTRUCTION_PLAN.md`.
//! This module owns the data contracts for the pipeline phases. The current
//! implementation includes the repeat-relevance gate and the repeat-blind CS
//! ensemble; later tasks fill in signal extraction, scaffold masking, oracle
//! block selection, relabeling, and merge.

use crate::solver3::compiled_problem::{CompiledProblem, PackedSchedule};
use crate::solver3::scoring::OracleSnapshot;
use crate::solver_support::SolverError;

/// Initial number of diversified repeat-blind construction attempts.
///
/// This is intentionally internal heuristic policy, not a user-facing projection knob.
pub(crate) const DEFAULT_CONSTRAINT_SCENARIO_RUNS: usize = 4;

/// Current high-level outcome of the constructor pipeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ConstraintScenarioOracleOutcomeKind {
    /// The repeat-aware oracle-guided path was not relevant for the input.
    RepeatIrrelevant,
    /// The heuristic produced and returned its repeat-blind constraint scaffold.
    ConstraintScenarioOnly,
    /// The heuristic merged oracle structure into the constraint scaffold.
    OracleMerged,
}

impl ConstraintScenarioOracleOutcomeKind {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::RepeatIrrelevant => "repeat_irrelevant",
            Self::ConstraintScenarioOnly => "constraint_scenario_only",
            Self::OracleMerged => "oracle_merged",
        }
    }
}

/// Phase-level telemetry for the solver3 constraint-scenario + oracle-guided constructor.
///
/// The fields are deliberately optional/zero-friendly so early implementation phases can
/// fill them progressively while still surfacing which path ran.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ConstraintScenarioOracleTelemetry {
    pub(crate) outcome: ConstraintScenarioOracleOutcomeKind,
    pub(crate) repeat_relevant: bool,
    pub(crate) cs_run_count: usize,
    pub(crate) cs_best_score: Option<f64>,
    pub(crate) cs_diversity: Option<f64>,
    pub(crate) rigid_placement_count: usize,
    pub(crate) flexible_placement_count: usize,
    pub(crate) oracle_block_people: usize,
    pub(crate) oracle_block_sessions: usize,
    pub(crate) oracle_block_groups: usize,
    pub(crate) oracle_relabel_score: Option<f64>,
    pub(crate) merge_improvement_over_cs: Option<f64>,
    pub(crate) constructor_wall_ms: u128,
}

impl Default for ConstraintScenarioOracleTelemetry {
    fn default() -> Self {
        Self {
            outcome: ConstraintScenarioOracleOutcomeKind::RepeatIrrelevant,
            repeat_relevant: false,
            cs_run_count: 0,
            cs_best_score: None,
            cs_diversity: None,
            rigid_placement_count: 0,
            flexible_placement_count: 0,
            oracle_block_people: 0,
            oracle_block_sessions: 0,
            oracle_block_groups: 0,
            oracle_relabel_score: None,
            merge_improvement_over_cs: None,
            constructor_wall_ms: 0,
        }
    }
}

/// Result returned by the constructor pipeline.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ConstraintScenarioOracleConstructionResult {
    pub(crate) schedule: PackedSchedule,
    pub(crate) telemetry: ConstraintScenarioOracleTelemetry,
}

/// Internal source label for a repeat-blind CS candidate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ConstraintScenarioCandidateSource {
    BaselineLegacy,
    FreedomAwareDeterministic,
    FreedomAwareRandomized,
}

impl ConstraintScenarioCandidateSource {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::BaselineLegacy => "baseline_legacy",
            Self::FreedomAwareDeterministic => "freedom_aware_deterministic",
            Self::FreedomAwareRandomized => "freedom_aware_randomized",
        }
    }
}

/// One feasible schedule produced for the repeat-blind constraint scenario.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ConstraintScenarioCandidate {
    pub(crate) schedule: PackedSchedule,
    pub(crate) source: ConstraintScenarioCandidateSource,
    pub(crate) seed: u64,
    /// Score with repeat/contact-pressure terms neutralized.
    pub(crate) cs_score: f64,
    /// Score under the real full solver3 objective, kept only for tie-breaking and telemetry.
    pub(crate) real_score: f64,
}

/// Repeat-blind ensemble plus selected scaffold candidate.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ConstraintScenarioEnsemble {
    pub(crate) candidates: Vec<ConstraintScenarioCandidate>,
    pub(crate) best_index: usize,
    pub(crate) diversity: f64,
}

impl ConstraintScenarioEnsemble {
    pub(crate) fn best(&self) -> &ConstraintScenarioCandidate {
        &self.candidates[self.best_index]
    }
}

/// Returns whether repeat/contact pressure is relevant enough to use this constructor family.
pub(crate) fn repeat_pressure_is_relevant(compiled: &CompiledProblem) -> bool {
    let repeat_penalty_relevant = compiled
        .repeat_encounter
        .as_ref()
        .map(|repeat| repeat.penalty_weight > 0.0)
        .unwrap_or(false);
    repeat_penalty_relevant || compiled.maximize_unique_contacts_weight > 0.0
}

/// Scores a full solver3 oracle snapshot as the repeat-blind Constraint Scenario.
///
/// Solver3's real score is:
///
/// `repeat_penalty + non_repeat_penalties - unique_contacts * contact_weight + baseline`
///
/// The CS score removes both repeat penalty and the unique-contact reward, leaving the
/// constraint/non-repeat basin the heuristic wants to learn.
pub(crate) fn constraint_scenario_score(
    compiled: &CompiledProblem,
    snapshot: &OracleSnapshot,
) -> f64 {
    snapshot.total_score - snapshot.weighted_repetition_penalty
        + (snapshot.unique_contacts as f64 * compiled.maximize_unique_contacts_weight)
}

/// Builds the selected repeat-blind ensemble from already-feasible candidates.
pub(crate) fn build_constraint_scenario_ensemble(
    candidates: Vec<ConstraintScenarioCandidate>,
) -> Result<ConstraintScenarioEnsemble, SolverError> {
    if candidates.is_empty() {
        return Err(SolverError::ValidationError(
            "solver3 constraint-scenario oracle-guided construction could not produce any feasible repeat-blind scaffold candidates".into(),
        ));
    }

    let mut best_index = 0usize;
    for idx in 1..candidates.len() {
        let candidate = &candidates[idx];
        let incumbent = &candidates[best_index];
        if candidate.cs_score < incumbent.cs_score
            || (candidate.cs_score == incumbent.cs_score
                && candidate.real_score < incumbent.real_score)
        {
            best_index = idx;
        }
    }

    let diversity = average_pair_contact_l1_distance(&candidates);
    Ok(ConstraintScenarioEnsemble {
        candidates,
        best_index,
        diversity,
    })
}

fn average_pair_contact_l1_distance(candidates: &[ConstraintScenarioCandidate]) -> f64 {
    if candidates.len() < 2 {
        return 0.0;
    }

    let mut total = 0usize;
    let mut pairs = 0usize;
    for left in 0..candidates.len() {
        for right in (left + 1)..candidates.len() {
            total +=
                pair_contact_l1_distance(&candidates[left].schedule, &candidates[right].schedule);
            pairs += 1;
        }
    }
    total as f64 / pairs as f64
}

fn pair_contact_l1_distance(left: &PackedSchedule, right: &PackedSchedule) -> usize {
    let mut distance = 0usize;
    let sessions = left.len().min(right.len());
    for session_idx in 0..sessions {
        let groups = left[session_idx].len().min(right[session_idx].len());
        for group_idx in 0..groups {
            let mut left_members = left[session_idx][group_idx].clone();
            let mut right_members = right[session_idx][group_idx].clone();
            left_members.sort_unstable();
            right_members.sort_unstable();
            if left_members != right_members {
                distance += 1;
            }
        }
    }
    distance
}

#[cfg(test)]
mod tests {
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
}
