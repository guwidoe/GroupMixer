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

/// Dense structural signals induced by the repeat-blind CS ensemble.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ConstraintScenarioSignals {
    /// `[session_idx * num_pairs + pair_idx] -> weighted co-placement frequency`.
    pub(crate) pair_pressure_by_session_pair: Vec<f64>,
    /// `[(session_idx * num_people + person_idx) * num_groups + group_idx] -> weighted placement frequency`.
    pub(crate) placement_histogram_by_person_session_group: Vec<f64>,
    /// `[session_idx * num_people + person_idx] -> rigidity in [0, 1]`.
    pub(crate) rigidity_by_person_session: Vec<f64>,
    pub(crate) rigid_placement_count: usize,
    pub(crate) flexible_placement_count: usize,
}

impl ConstraintScenarioSignals {
    #[inline]
    pub(crate) fn pair_pressure(
        &self,
        compiled: &CompiledProblem,
        session_idx: usize,
        pair_idx: usize,
    ) -> f64 {
        self.pair_pressure_by_session_pair[session_idx * compiled.num_pairs + pair_idx]
    }

    #[inline]
    pub(crate) fn placement_frequency(
        &self,
        compiled: &CompiledProblem,
        session_idx: usize,
        person_idx: usize,
        group_idx: usize,
    ) -> f64 {
        self.placement_histogram_by_person_session_group
            [(session_idx * compiled.num_people + person_idx) * compiled.num_groups + group_idx]
    }

    #[inline]
    pub(crate) fn rigidity(
        &self,
        compiled: &CompiledProblem,
        session_idx: usize,
        person_idx: usize,
    ) -> f64 {
        self.rigidity_by_person_session[compiled.person_session_slot(session_idx, person_idx)]
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

/// Extracts session-local pair pressure, placement histograms, and rigidity from the CS ensemble.
pub(crate) fn extract_constraint_scenario_signals(
    compiled: &CompiledProblem,
    ensemble: &ConstraintScenarioEnsemble,
) -> ConstraintScenarioSignals {
    let weights = normalized_candidate_weights(ensemble);
    let mut pair_pressure_by_session_pair = vec![0.0; compiled.num_sessions * compiled.num_pairs];
    let mut placement_histogram_by_person_session_group =
        vec![0.0; compiled.num_sessions * compiled.num_people * compiled.num_groups];

    for (candidate, weight) in ensemble.candidates.iter().zip(weights.iter().copied()) {
        accumulate_schedule_signals(
            compiled,
            &candidate.schedule,
            weight,
            &mut pair_pressure_by_session_pair,
            &mut placement_histogram_by_person_session_group,
        );
    }

    let mut rigidity_by_person_session = vec![0.0; compiled.num_sessions * compiled.num_people];
    let mut rigid_placement_count = 0usize;
    let mut flexible_placement_count = 0usize;
    for session_idx in 0..compiled.num_sessions {
        for person_idx in 0..compiled.num_people {
            let slot = compiled.person_session_slot(session_idx, person_idx);
            if !compiled.person_participation[person_idx][session_idx] {
                rigidity_by_person_session[slot] = 1.0;
                continue;
            }
            let rigidity = placement_rigidity(
                compiled,
                &placement_histogram_by_person_session_group,
                session_idx,
                person_idx,
            );
            rigidity_by_person_session[slot] = rigidity;
            if rigidity >= 0.75 {
                rigid_placement_count += 1;
            } else {
                flexible_placement_count += 1;
            }
        }
    }

    ConstraintScenarioSignals {
        pair_pressure_by_session_pair,
        placement_histogram_by_person_session_group,
        rigidity_by_person_session,
        rigid_placement_count,
        flexible_placement_count,
    }
}

fn normalized_candidate_weights(ensemble: &ConstraintScenarioEnsemble) -> Vec<f64> {
    let best_score = ensemble.best().cs_score;
    let mut weights = ensemble
        .candidates
        .iter()
        .map(|candidate| {
            if candidate.cs_score.is_finite() && best_score.is_finite() {
                1.0 / (1.0 + (candidate.cs_score - best_score).max(0.0))
            } else {
                1.0
            }
        })
        .collect::<Vec<_>>();
    let total = weights.iter().sum::<f64>();
    if total > 0.0 {
        for weight in &mut weights {
            *weight /= total;
        }
    }
    weights
}

fn accumulate_schedule_signals(
    compiled: &CompiledProblem,
    schedule: &PackedSchedule,
    weight: f64,
    pair_pressure_by_session_pair: &mut [f64],
    placement_histogram_by_person_session_group: &mut [f64],
) {
    for session_idx in 0..compiled.num_sessions.min(schedule.len()) {
        for group_idx in 0..compiled.num_groups.min(schedule[session_idx].len()) {
            let members = &schedule[session_idx][group_idx];
            for &person_idx in members {
                if person_idx < compiled.num_people {
                    let idx = (session_idx * compiled.num_people + person_idx)
                        * compiled.num_groups
                        + group_idx;
                    placement_histogram_by_person_session_group[idx] += weight;
                }
            }
            for left in 0..members.len() {
                for right in (left + 1)..members.len() {
                    let a = members[left];
                    let b = members[right];
                    if a < compiled.num_people && b < compiled.num_people && a != b {
                        let pair_idx = compiled.pair_idx(a, b);
                        pair_pressure_by_session_pair
                            [session_idx * compiled.num_pairs + pair_idx] += weight;
                    }
                }
            }
        }
    }
}

fn placement_rigidity(
    compiled: &CompiledProblem,
    placement_histogram_by_person_session_group: &[f64],
    session_idx: usize,
    person_idx: usize,
) -> f64 {
    let mut mass = 0.0;
    let mut entropy = 0.0;
    for group_idx in 0..compiled.num_groups {
        let p = placement_histogram_by_person_session_group
            [(session_idx * compiled.num_people + person_idx) * compiled.num_groups + group_idx];
        mass += p;
        if p > 0.0 {
            entropy -= p * p.ln();
        }
    }
    if mass <= 0.0 || compiled.num_groups <= 1 {
        return 1.0;
    }
    let max_entropy = (compiled.num_groups as f64).ln();
    if max_entropy <= 0.0 {
        1.0
    } else {
        (1.0 - entropy / max_entropy).clamp(0.0, 1.0)
    }
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
