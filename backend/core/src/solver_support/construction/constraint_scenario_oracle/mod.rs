//! Constraint-scenario + oracle-guided construction scaffolding for solver3.
//!
//! The design is documented in
//! `backend/core/src/solver3/CONSTRAINT_SCENARIO_ORACLE_GUIDED_CONSTRUCTION_PLAN.md`.
//! This module owns the data contracts and implementation for the current
//! constraint-scenario oracle constructor. It is housed under `solver_support`
//! so construction heuristics have one coherent home, even though the data model
//! is still solver3-specific today.

use std::collections::HashMap;

use crate::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
    Solver6PairRepeatPenaltyModel, Solver6Params, Solver6SearchStrategy, Solver6SeedStrategy,
    SolverConfiguration, SolverKind, SolverParams, StopConditions,
};
use crate::solver3::compiled_problem::{CompiledProblem, PackedSchedule};
use crate::solver6::SearchEngine as Solver6SearchEngine;
use crate::solver_support::SolverError;

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
    pub(crate) oracle_template_mapped_people: usize,
    pub(crate) oracle_template_sessions: usize,
    pub(crate) oracle_template_groups: usize,
    pub(crate) oracle_projection_score: Option<f64>,
    pub(crate) merge_improvement_over_cs: Option<f64>,
    pub(crate) oracle_merge_attempted: bool,
    pub(crate) oracle_merge_accepted: bool,
    pub(crate) oracle_merge_failed: bool,
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
            oracle_template_mapped_people: 0,
            oracle_template_sessions: 0,
            oracle_template_groups: 0,
            oracle_projection_score: None,
            merge_improvement_over_cs: None,
            oracle_merge_attempted: false,
            oracle_merge_accepted: false,
            oracle_merge_failed: false,
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
#[cfg(test)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ConstraintScenarioCandidateSource {
    BaselineLegacy,
    FreedomAwareDeterministic,
    FreedomAwareRandomized,
}

#[cfg(test)]
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
#[cfg(test)]
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
#[cfg(test)]
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ConstraintScenarioEnsemble {
    pub(crate) candidates: Vec<ConstraintScenarioCandidate>,
    pub(crate) best_index: usize,
    pub(crate) diversity: f64,
}

#[cfg(test)]
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

/// Structural hard-freeze mask over the best CS scaffold.
///
/// Entropy-derived CS rigidity is deliberately *not* a hard exclusion here: on unconstrained
/// repeat-only SGP instances, repeat-blind constructor consensus is just constructor bias, not a
/// real placement constraint. Rigidity remains a soft prior for block scoring/alignment/repair.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ConstraintScenarioScaffoldMask {
    /// `[session_idx * num_people + person_idx] -> true when the placement must be protected`.
    pub(crate) frozen_by_person_session: Vec<bool>,
    pub(crate) rigid_placement_count: usize,
    pub(crate) flexible_placement_count: usize,
}

impl ConstraintScenarioScaffoldMask {
    #[inline]
    pub(crate) fn is_frozen(
        &self,
        compiled: &CompiledProblem,
        session_idx: usize,
        person_idx: usize,
    ) -> bool {
        self.frozen_by_person_session[compiled.person_session_slot(session_idx, person_idx)]
    }
}

/// Capacity-first pure-template candidate before projection and merge.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct OracleTemplateCandidate {
    pub(crate) sessions: Vec<usize>,
    pub(crate) groups_by_session: Vec<Vec<usize>>,
    pub(crate) num_groups: usize,
    pub(crate) group_size: usize,
    pub(crate) oracle_capacity: usize,
    pub(crate) stable_people_count: usize,
    pub(crate) high_attendance_people_count: usize,
    pub(crate) dummy_oracle_people: usize,
    pub(crate) omitted_high_attendance_people: usize,
    pub(crate) omitted_group_count: usize,
    pub(crate) scaffold_disruption_risk: f64,
    pub(crate) estimated_score: f64,
}

/// Pure contact-structure oracle request, expressed in oracle-local indices.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PureStructureOracleRequest {
    pub(crate) num_groups: usize,
    pub(crate) group_size: usize,
    pub(crate) num_sessions: usize,
    pub(crate) seed: u64,
}

impl PureStructureOracleRequest {
    pub(crate) fn num_people(self) -> usize {
        self.num_groups * self.group_size
    }
}

/// Pure contact-structure oracle schedule, using local person/group/session indices.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PureStructureOracleSchedule {
    pub(crate) schedule: PackedSchedule,
}

/// Oracle schedule projected onto real solver3 people and groups.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct OracleTemplateProjectionResult {
    /// `oracle_person_idx -> Some(real solver3 person_idx)`; `None` is a dummy/deleted vertex.
    pub(crate) real_person_by_oracle_person: Vec<Option<usize>>,
    /// `[block_session_pos][oracle_group_idx] -> real solver3 group_idx`.
    pub(crate) real_group_by_session_oracle_group: Vec<Vec<usize>>,
    pub(crate) score: f64,
    pub(crate) pair_alignment_score: f64,
    pub(crate) group_alignment_score: f64,
    pub(crate) rigidity_mismatch: f64,
    pub(crate) mapped_real_people: usize,
    pub(crate) dummy_oracle_people: usize,
}

/// Result of injecting projected oracle structure into the CS scaffold.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct OracleMergeResult {
    pub(crate) schedule: PackedSchedule,
    pub(crate) changed_placement_count: usize,
    pub(crate) displaced_repair_count: usize,
}

/// Stub-testable seam for obtaining pure SGP contact geometry.
pub(crate) trait PureStructureOracle {
    fn solve(
        &self,
        request: &PureStructureOracleRequest,
    ) -> Result<PureStructureOracleSchedule, SolverError>;
}

/// Default pure-structure oracle implementation backed by solver6.
#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct Solver6PureStructureOracle;

impl PureStructureOracle for Solver6PureStructureOracle {
    fn solve(
        &self,
        request: &PureStructureOracleRequest,
    ) -> Result<PureStructureOracleSchedule, SolverError> {
        validate_pure_structure_request(request)?;
        let input = build_solver6_oracle_input(request)?;
        let solver = Solver6SearchEngine::new(&input.solver);
        let result = solver.solve(&input).map_err(|error| {
            SolverError::ValidationError(format!(
                "solver3 pure-structure oracle request g={} q={} w={} failed in solver6: {}",
                request.num_groups, request.group_size, request.num_sessions, error
            ))
        })?;
        let schedule = parse_solver6_oracle_schedule(request, &result.schedule)?;
        validate_pure_oracle_schedule(request, &schedule)?;
        Ok(PureStructureOracleSchedule { schedule })
    }
}

impl OracleTemplateCandidate {
    pub(crate) fn num_sessions(&self) -> usize {
        self.sessions.len()
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

/// Builds the selected repeat-blind ensemble from already-feasible candidates.
#[cfg(test)]
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
#[cfg(test)]
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

    build_signals_from_accumulated_histograms(
        compiled,
        pair_pressure_by_session_pair,
        placement_histogram_by_person_session_group,
        SignalRigidityMode::EnsembleEntropy,
    )
}

/// Extracts CS structure from the single full-objective warmup scaffold.
///
/// With only one scaffold there is no ensemble consensus, so rigidity must stay neutral/flexible:
/// the placement histogram is still a useful soft prior, but it must not make every placement look
/// structurally frozen.
pub(crate) fn extract_constraint_scenario_signals_from_scaffold(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
) -> ConstraintScenarioSignals {
    let mut pair_pressure_by_session_pair = vec![0.0; compiled.num_sessions * compiled.num_pairs];
    let mut placement_histogram_by_person_session_group =
        vec![0.0; compiled.num_sessions * compiled.num_people * compiled.num_groups];

    accumulate_schedule_signals(
        compiled,
        scaffold,
        1.0,
        &mut pair_pressure_by_session_pair,
        &mut placement_histogram_by_person_session_group,
    );

    build_signals_from_accumulated_histograms(
        compiled,
        pair_pressure_by_session_pair,
        placement_histogram_by_person_session_group,
        SignalRigidityMode::SingleScaffoldFlexible,
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SignalRigidityMode {
    #[cfg(test)]
    EnsembleEntropy,
    SingleScaffoldFlexible,
}

fn build_signals_from_accumulated_histograms(
    compiled: &CompiledProblem,
    pair_pressure_by_session_pair: Vec<f64>,
    placement_histogram_by_person_session_group: Vec<f64>,
    rigidity_mode: SignalRigidityMode,
) -> ConstraintScenarioSignals {
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
            let rigidity = match rigidity_mode {
                #[cfg(test)]
                SignalRigidityMode::EnsembleEntropy => placement_rigidity(
                    compiled,
                    &placement_histogram_by_person_session_group,
                    session_idx,
                    person_idx,
                ),
                SignalRigidityMode::SingleScaffoldFlexible => 0.0,
            };
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

/// Classifies the best CS scaffold into structurally frozen and flexible placements.
pub(crate) fn build_constraint_scenario_scaffold_mask(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    _signals: &ConstraintScenarioSignals,
) -> ConstraintScenarioScaffoldMask {
    let mut frozen_by_person_session = vec![false; compiled.num_sessions * compiled.num_people];
    let mut rigid_placement_count = 0usize;
    let mut flexible_placement_count = 0usize;

    for session_idx in 0..compiled.num_sessions {
        for person_idx in 0..compiled.num_people {
            if !compiled.person_participation[person_idx][session_idx] {
                continue;
            }
            let slot = compiled.person_session_slot(session_idx, person_idx);
            let frozen = compiled.immovable_group(session_idx, person_idx).is_some()
                || participates_in_active_clique(compiled, session_idx, person_idx);
            frozen_by_person_session[slot] = frozen;
            if frozen {
                rigid_placement_count += 1;
            } else if placement_exists(scaffold, session_idx, person_idx) {
                flexible_placement_count += 1;
            }
        }
    }

    ConstraintScenarioScaffoldMask {
        frozen_by_person_session,
        rigid_placement_count,
        flexible_placement_count,
    }
}

/// Generates simple capacity-ladder pure-template candidates.
pub(crate) fn generate_oracle_template_candidates(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
) -> Vec<OracleTemplateCandidate> {
    let mut candidates = Vec::new();

    for start_session in 0..compiled.num_sessions {
        for end_session in (start_session + 2)..=compiled.num_sessions {
            let sessions = (start_session..end_session).collect::<Vec<_>>();
            let group_slots_by_session = sessions
                .iter()
                .map(|&session_idx| {
                    oracle_group_template_slots(compiled, scaffold, mask, session_idx)
                })
                .collect::<Vec<_>>();
            let max_groups = group_slots_by_session
                .iter()
                .map(|slots| {
                    slots
                        .iter()
                        .filter(|slot| slot.template_capacity >= 2)
                        .count()
                })
                .min()
                .unwrap_or(0)
                .min(compiled.num_groups);
            if max_groups < 2 {
                continue;
            }

            let attendance = template_attendance_summary(compiled, mask, &sessions);
            if attendance.high_attendance_people_count < 4 {
                continue;
            }

            for num_groups in (2..=max_groups).rev() {
                let selected_slots_by_session = group_slots_by_session
                    .iter()
                    .map(|slots| select_template_group_slots(slots, num_groups))
                    .collect::<Option<Vec<_>>>();
                let Some(selected_slots_by_session) = selected_slots_by_session else {
                    continue;
                };
                let max_group_size = selected_slots_by_session
                    .iter()
                    .flat_map(|groups| groups.iter().map(|slot| slot.template_capacity))
                    .min()
                    .unwrap_or(0);
                for group_size in template_group_size_ladder(max_group_size) {
                    let oracle_capacity = num_groups * group_size;
                    if oracle_capacity < 4 {
                        continue;
                    }
                    let groups_by_session = selected_slots_by_session
                        .iter()
                        .map(|slots| slots.iter().map(|slot| slot.group_idx).collect::<Vec<_>>())
                        .collect::<Vec<_>>();
                    let scaffold_disruption_risk = selected_slots_by_session
                        .iter()
                        .enumerate()
                        .map(|(session_pos, slots)| {
                            template_scaffold_disruption_risk(
                                compiled,
                                scaffold,
                                signals,
                                sessions[session_pos],
                                slots,
                            )
                        })
                        .sum::<f64>();
                    let dummy_oracle_people =
                        oracle_capacity.saturating_sub(attendance.high_attendance_people_count);
                    let omitted_high_attendance_people = attendance
                        .high_attendance_people_count
                        .saturating_sub(oracle_capacity);
                    let omitted_group_count = compiled.num_groups.saturating_sub(num_groups);
                    let estimated_score = oracle_template_candidate_score(
                        sessions.len(),
                        num_groups,
                        group_size,
                        oracle_capacity,
                        attendance.stable_people_count,
                        attendance.high_attendance_people_count,
                        dummy_oracle_people,
                        omitted_high_attendance_people,
                        omitted_group_count,
                        scaffold_disruption_risk,
                    );
                    candidates.push(OracleTemplateCandidate {
                        sessions: sessions.clone(),
                        groups_by_session,
                        num_groups,
                        group_size,
                        oracle_capacity,
                        stable_people_count: attendance.stable_people_count,
                        high_attendance_people_count: attendance.high_attendance_people_count,
                        dummy_oracle_people,
                        omitted_high_attendance_people,
                        omitted_group_count,
                        scaffold_disruption_risk,
                        estimated_score,
                    });
                }
            }
        }
    }

    candidates.sort_by(|left, right| oracle_template_candidate_order(left, right));
    candidates
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct OracleGroupTemplateSlot {
    group_idx: usize,
    template_capacity: usize,
    available_capacity: usize,
    flexible_occupancy: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct TemplateAttendanceSummary {
    stable_people_count: usize,
    high_attendance_people_count: usize,
}

fn oracle_group_template_slots(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    mask: &ConstraintScenarioScaffoldMask,
    session_idx: usize,
) -> Vec<OracleGroupTemplateSlot> {
    let mut slots = (0..compiled.num_groups)
        .map(|group_idx| {
            let frozen_occupancy = scaffold[session_idx][group_idx]
                .iter()
                .filter(|&&person_idx| mask.is_frozen(compiled, session_idx, person_idx))
                .count();
            let flexible_occupancy = scaffold[session_idx][group_idx]
                .iter()
                .filter(|&&person_idx| !mask.is_frozen(compiled, session_idx, person_idx))
                .count();
            let template_capacity = compiled.group_capacity(session_idx, group_idx);
            let available_capacity = template_capacity.saturating_sub(frozen_occupancy);
            OracleGroupTemplateSlot {
                group_idx,
                template_capacity,
                available_capacity,
                flexible_occupancy,
            }
        })
        .collect::<Vec<_>>();
    slots.sort_by_key(|slot| {
        (
            std::cmp::Reverse(slot.template_capacity),
            std::cmp::Reverse(slot.available_capacity),
            std::cmp::Reverse(slot.flexible_occupancy),
            slot.group_idx,
        )
    });
    slots
}

fn select_template_group_slots(
    slots: &[OracleGroupTemplateSlot],
    num_groups: usize,
) -> Option<Vec<OracleGroupTemplateSlot>> {
    let selected = slots
        .iter()
        .copied()
        .filter(|slot| slot.template_capacity >= 2)
        .take(num_groups)
        .collect::<Vec<_>>();
    (selected.len() == num_groups).then_some(selected)
}

fn template_group_size_ladder(max_group_size: usize) -> Vec<usize> {
    let mut sizes = Vec::new();
    for delta in 0..=2 {
        if max_group_size > delta && max_group_size - delta >= 2 {
            sizes.push(max_group_size - delta);
        }
    }
    sizes
}

fn template_attendance_summary(
    compiled: &CompiledProblem,
    mask: &ConstraintScenarioScaffoldMask,
    sessions: &[usize],
) -> TemplateAttendanceSummary {
    let mut stable_people_count = 0usize;
    let mut high_attendance_people_count = 0usize;
    let high_attendance_threshold = (sessions.len() * 3).div_ceil(4).max(1);
    for person_idx in 0..compiled.num_people {
        let available_sessions = sessions
            .iter()
            .filter(|&&session_idx| {
                compiled.person_participation[person_idx][session_idx]
                    && !mask.is_frozen(compiled, session_idx, person_idx)
            })
            .count();
        if available_sessions == sessions.len() {
            stable_people_count += 1;
        }
        if available_sessions >= high_attendance_threshold {
            high_attendance_people_count += 1;
        }
    }
    TemplateAttendanceSummary {
        stable_people_count,
        high_attendance_people_count,
    }
}

fn template_scaffold_disruption_risk(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    signals: &ConstraintScenarioSignals,
    session_idx: usize,
    slots: &[OracleGroupTemplateSlot],
) -> f64 {
    slots
        .iter()
        .flat_map(|slot| scaffold[session_idx][slot.group_idx].iter().copied())
        .map(|person_idx| signals.rigidity(compiled, session_idx, person_idx))
        .sum()
}

fn oracle_template_candidate_score(
    num_sessions: usize,
    num_groups: usize,
    group_size: usize,
    oracle_capacity: usize,
    stable_people_count: usize,
    high_attendance_people_count: usize,
    dummy_oracle_people: usize,
    omitted_high_attendance_people: usize,
    omitted_group_count: usize,
    scaffold_disruption_risk: f64,
) -> f64 {
    let contact_opportunity = num_sessions as f64 * num_groups as f64 * binomial2(group_size);
    let coverage = oracle_capacity.min(high_attendance_people_count) as f64;
    let stable_coverage = oracle_capacity.min(stable_people_count) as f64 * 0.25;
    contact_opportunity + coverage + stable_coverage
        - dummy_oracle_people as f64
        - omitted_high_attendance_people as f64 * 3.0
        - omitted_group_count as f64 * 5.0
        - scaffold_disruption_risk
}

fn oracle_template_candidate_order(
    left: &OracleTemplateCandidate,
    right: &OracleTemplateCandidate,
) -> std::cmp::Ordering {
    right
        .estimated_score
        .partial_cmp(&left.estimated_score)
        .unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| right.sessions.len().cmp(&left.sessions.len()))
        .then_with(|| right.oracle_capacity.cmp(&left.oracle_capacity))
        .then_with(|| right.num_groups.cmp(&left.num_groups))
        .then_with(|| right.group_size.cmp(&left.group_size))
        .then_with(|| left.sessions.cmp(&right.sessions))
}

fn person_oracle_template_priority(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    sessions: &[usize],
    person_idx: usize,
) -> f64 {
    let flexibility = sessions
        .iter()
        .map(|&session_idx| 1.0 - signals.rigidity(compiled, session_idx, person_idx))
        .sum::<f64>();
    let pair_pressure = (0..compiled.num_people)
        .filter(|&other| other != person_idx)
        .map(|other| {
            let pair_idx = compiled.pair_idx(person_idx, other);
            sessions
                .iter()
                .map(|&session_idx| signals.pair_pressure(compiled, session_idx, pair_idx))
                .sum::<f64>()
        })
        .sum::<f64>();
    flexibility + pair_pressure / compiled.num_people.max(1) as f64
}

fn binomial2(value: usize) -> f64 {
    (value.saturating_sub(1) * value / 2) as f64
}

/// Projects oracle-local people and groups into one capacity-template candidate.
pub(crate) fn project_oracle_schedule_to_template(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PureStructureOracleSchedule,
) -> Result<OracleTemplateProjectionResult, SolverError> {
    let request = PureStructureOracleRequest {
        num_groups: candidate.num_groups,
        group_size: candidate.group_size,
        num_sessions: candidate.num_sessions(),
        seed: 0,
    };
    validate_pure_oracle_schedule(&request, &oracle_schedule.schedule)?;

    let mut real_person_by_oracle_person =
        initial_template_person_projection(compiled, signals, mask, candidate);
    let mut pair_alignment_score = oracle_template_pair_alignment_score(
        compiled,
        signals,
        mask,
        candidate,
        &oracle_schedule.schedule,
        &real_person_by_oracle_person,
    );
    improve_template_person_projection_by_swaps(
        compiled,
        signals,
        mask,
        candidate,
        &oracle_schedule.schedule,
        &mut real_person_by_oracle_person,
        &mut pair_alignment_score,
    );

    let (real_group_by_session_oracle_group, group_alignment_score, rigidity_mismatch) =
        align_oracle_template_groups_to_real_groups(
            compiled,
            signals,
            mask,
            candidate,
            &oracle_schedule.schedule,
            &real_person_by_oracle_person,
        );
    let mapped_real_people = real_person_by_oracle_person
        .iter()
        .filter(|person| person.is_some())
        .count();
    let dummy_oracle_people = real_person_by_oracle_person.len() - mapped_real_people;

    Ok(OracleTemplateProjectionResult {
        real_person_by_oracle_person,
        real_group_by_session_oracle_group,
        score: pair_alignment_score + group_alignment_score - rigidity_mismatch,
        pair_alignment_score,
        group_alignment_score,
        rigidity_mismatch,
        mapped_real_people,
        dummy_oracle_people,
    })
}

fn initial_template_person_projection(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
) -> Vec<Option<usize>> {
    let mut people = template_candidate_projectable_people(compiled, signals, mask, candidate);
    people.truncate(candidate.oracle_capacity);

    let mut real_person_by_oracle_person = vec![None; candidate.oracle_capacity];
    for (oracle_person_idx, real_person_idx) in people.into_iter().enumerate() {
        real_person_by_oracle_person[oracle_person_idx] = Some(real_person_idx);
    }
    real_person_by_oracle_person
}

fn template_candidate_projectable_people(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
) -> Vec<usize> {
    let mut people = (0..compiled.num_people)
        .filter(|&person_idx| {
            candidate.sessions.iter().any(|&session_idx| {
                compiled.person_participation[person_idx][session_idx]
                    && !mask.is_frozen(compiled, session_idx, person_idx)
            })
        })
        .collect::<Vec<_>>();
    people.sort_by(|&left, &right| {
        let left_sessions = movable_template_session_count(compiled, mask, candidate, left);
        let right_sessions = movable_template_session_count(compiled, mask, candidate, right);
        right_sessions
            .cmp(&left_sessions)
            .then_with(|| {
                person_oracle_template_priority(compiled, signals, &candidate.sessions, right)
                    .partial_cmp(&person_oracle_template_priority(
                        compiled,
                        signals,
                        &candidate.sessions,
                        left,
                    ))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| left.cmp(&right))
    });
    people
}

fn movable_template_session_count(
    compiled: &CompiledProblem,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    person_idx: usize,
) -> usize {
    candidate
        .sessions
        .iter()
        .filter(|&&session_idx| {
            compiled.person_participation[person_idx][session_idx]
                && !mask.is_frozen(compiled, session_idx, person_idx)
        })
        .count()
}

fn improve_template_person_projection_by_swaps(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PackedSchedule,
    real_person_by_oracle_person: &mut [Option<usize>],
    pair_alignment_score: &mut f64,
) {
    const MAX_RELABEL_SWEEPS: usize = 2;
    for _ in 0..MAX_RELABEL_SWEEPS {
        let mut best_swap = None;
        let mut best_score = *pair_alignment_score;
        for left in 0..real_person_by_oracle_person.len() {
            for right in (left + 1)..real_person_by_oracle_person.len() {
                real_person_by_oracle_person.swap(left, right);
                let candidate_score = oracle_template_pair_alignment_score(
                    compiled,
                    signals,
                    mask,
                    candidate,
                    oracle_schedule,
                    real_person_by_oracle_person,
                );
                real_person_by_oracle_person.swap(left, right);
                if candidate_score > best_score + 1e-9 {
                    best_score = candidate_score;
                    best_swap = Some((left, right));
                }
            }
        }
        let Some((left, right)) = best_swap else {
            return;
        };
        real_person_by_oracle_person.swap(left, right);
        *pair_alignment_score = best_score;
    }
}

fn oracle_template_pair_alignment_score(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PackedSchedule,
    real_person_by_oracle_person: &[Option<usize>],
) -> f64 {
    candidate
        .sessions
        .iter()
        .enumerate()
        .map(|(session_pos, &real_session_idx)| {
            oracle_schedule[session_pos]
                .iter()
                .flat_map(|oracle_group| {
                    oracle_group
                        .iter()
                        .enumerate()
                        .flat_map(move |(idx, &left)| {
                            oracle_group
                                .iter()
                                .skip(idx + 1)
                                .map(move |&right| (left, right))
                        })
                })
                .filter_map(|(left, right)| {
                    let real_left = projected_oracle_person_for_session(
                        compiled,
                        mask,
                        real_person_by_oracle_person,
                        real_session_idx,
                        left,
                    )?;
                    let real_right = projected_oracle_person_for_session(
                        compiled,
                        mask,
                        real_person_by_oracle_person,
                        real_session_idx,
                        right,
                    )?;
                    Some(signals.pair_pressure(
                        compiled,
                        real_session_idx,
                        compiled.pair_idx(real_left, real_right),
                    ))
                })
                .sum::<f64>()
        })
        .sum()
}

fn projected_oracle_person_for_session(
    compiled: &CompiledProblem,
    mask: &ConstraintScenarioScaffoldMask,
    real_person_by_oracle_person: &[Option<usize>],
    real_session_idx: usize,
    oracle_person_idx: usize,
) -> Option<usize> {
    let real_person_idx = real_person_by_oracle_person[oracle_person_idx]?;
    (compiled.person_participation[real_person_idx][real_session_idx]
        && !mask.is_frozen(compiled, real_session_idx, real_person_idx))
    .then_some(real_person_idx)
}

fn align_oracle_template_groups_to_real_groups(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PackedSchedule,
    real_person_by_oracle_person: &[Option<usize>],
) -> (Vec<Vec<usize>>, f64, f64) {
    let mut aligned_groups = Vec::with_capacity(candidate.num_sessions());
    let mut total_group_score = 0.0;
    let mut total_rigidity_mismatch = 0.0;

    for (session_pos, &real_session_idx) in candidate.sessions.iter().enumerate() {
        let candidate_real_groups = &candidate.groups_by_session[session_pos];
        let score_matrix = (0..candidate.num_groups)
            .map(|oracle_group_idx| {
                candidate_real_groups
                    .iter()
                    .map(|&real_group_idx| {
                        oracle_template_group_alignment_score(
                            compiled,
                            signals,
                            mask,
                            real_session_idx,
                            real_group_idx,
                            &oracle_schedule[session_pos][oracle_group_idx],
                            real_person_by_oracle_person,
                        )
                    })
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>();
        let group_assignment = choose_group_assignment(&score_matrix);
        let mut session_groups = vec![0usize; candidate.num_groups];
        for (oracle_group_idx, candidate_idx) in group_assignment.into_iter().enumerate() {
            let real_group_idx = candidate_real_groups[candidate_idx];
            session_groups[oracle_group_idx] = real_group_idx;
            total_group_score += score_matrix[oracle_group_idx][candidate_idx];
            total_rigidity_mismatch += oracle_template_group_rigidity_mismatch(
                compiled,
                signals,
                mask,
                real_session_idx,
                real_group_idx,
                &oracle_schedule[session_pos][oracle_group_idx],
                real_person_by_oracle_person,
            );
        }
        aligned_groups.push(session_groups);
    }

    (aligned_groups, total_group_score, total_rigidity_mismatch)
}

fn oracle_template_group_alignment_score(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    real_session_idx: usize,
    real_group_idx: usize,
    oracle_group: &[usize],
    real_person_by_oracle_person: &[Option<usize>],
) -> f64 {
    oracle_group
        .iter()
        .filter_map(|&oracle_person_idx| {
            projected_oracle_person_for_session(
                compiled,
                mask,
                real_person_by_oracle_person,
                real_session_idx,
                oracle_person_idx,
            )
        })
        .map(|real_person_idx| {
            let placement = signals.placement_frequency(
                compiled,
                real_session_idx,
                real_person_idx,
                real_group_idx,
            );
            let rigidity = signals.rigidity(compiled, real_session_idx, real_person_idx);
            placement - 0.25 * rigidity * (1.0 - placement)
        })
        .sum()
}

fn oracle_template_group_rigidity_mismatch(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    real_session_idx: usize,
    real_group_idx: usize,
    oracle_group: &[usize],
    real_person_by_oracle_person: &[Option<usize>],
) -> f64 {
    oracle_group
        .iter()
        .filter_map(|&oracle_person_idx| {
            projected_oracle_person_for_session(
                compiled,
                mask,
                real_person_by_oracle_person,
                real_session_idx,
                oracle_person_idx,
            )
        })
        .map(|real_person_idx| {
            let placement = signals.placement_frequency(
                compiled,
                real_session_idx,
                real_person_idx,
                real_group_idx,
            );
            let rigidity = signals.rigidity(compiled, real_session_idx, real_person_idx);
            rigidity * (1.0 - placement)
        })
        .sum()
}

fn choose_group_assignment(score_matrix: &[Vec<f64>]) -> Vec<usize> {
    if score_matrix.len() <= 8 {
        return choose_group_assignment_exact(score_matrix);
    }
    choose_group_assignment_greedy(score_matrix)
}

fn choose_group_assignment_exact(score_matrix: &[Vec<f64>]) -> Vec<usize> {
    fn search(
        row: usize,
        score_matrix: &[Vec<f64>],
        used: &mut [bool],
        current: &mut Vec<usize>,
        current_score: f64,
        best: &mut (f64, Vec<usize>),
    ) {
        if row == score_matrix.len() {
            if current_score > best.0 || (current_score == best.0 && *current < best.1) {
                *best = (current_score, current.clone());
            }
            return;
        }
        for candidate_idx in 0..score_matrix[row].len() {
            if used[candidate_idx] {
                continue;
            }
            used[candidate_idx] = true;
            current.push(candidate_idx);
            search(
                row + 1,
                score_matrix,
                used,
                current,
                current_score + score_matrix[row][candidate_idx],
                best,
            );
            current.pop();
            used[candidate_idx] = false;
        }
    }

    let width = score_matrix.first().map(Vec::len).unwrap_or(0);
    let mut best = (f64::NEG_INFINITY, Vec::new());
    search(
        0,
        score_matrix,
        &mut vec![false; width],
        &mut Vec::with_capacity(score_matrix.len()),
        0.0,
        &mut best,
    );
    best.1
}

fn choose_group_assignment_greedy(score_matrix: &[Vec<f64>]) -> Vec<usize> {
    let mut assignment = vec![usize::MAX; score_matrix.len()];
    let mut used = vec![false; score_matrix.first().map(Vec::len).unwrap_or(0)];
    let mut rows = (0..score_matrix.len()).collect::<Vec<_>>();
    rows.sort_by(|&left, &right| {
        assignment_margin(&score_matrix[right])
            .partial_cmp(&assignment_margin(&score_matrix[left]))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.cmp(&right))
    });
    for row in rows {
        let mut best_idx = None;
        let mut best_score = f64::NEG_INFINITY;
        for (candidate_idx, &score) in score_matrix[row].iter().enumerate() {
            if !used[candidate_idx] && score > best_score {
                best_score = score;
                best_idx = Some(candidate_idx);
            }
        }
        let candidate_idx = best_idx.unwrap_or(0);
        assignment[row] = candidate_idx;
        used[candidate_idx] = true;
    }
    assignment
}

fn assignment_margin(scores: &[f64]) -> f64 {
    let mut top = f64::NEG_INFINITY;
    let mut second = f64::NEG_INFINITY;
    for &score in scores {
        if score > top {
            second = top;
            top = score;
        } else if score > second {
            second = score;
        }
    }
    top - second
}

/// Merges projected oracle placements into a copy of the CS scaffold and repairs freed slots.
pub(crate) fn merge_projected_oracle_template_into_scaffold(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PureStructureOracleSchedule,
    projection: &OracleTemplateProjectionResult,
) -> Result<OracleMergeResult, SolverError> {
    let request = PureStructureOracleRequest {
        num_groups: candidate.num_groups,
        group_size: candidate.group_size,
        num_sessions: candidate.num_sessions(),
        seed: 0,
    };
    validate_pure_oracle_schedule(&request, &oracle_schedule.schedule)?;
    validate_template_projection_for_merge(candidate, projection)?;

    let mut schedule = scaffold.clone();
    let mut changed_placement_count = 0usize;
    let mut displaced_repair_count = 0usize;
    for (session_pos, &real_session_idx) in candidate.sessions.iter().enumerate() {
        let mut displaced = Vec::<(usize, usize)>::new();
        let mut removed = vec![false; compiled.num_people];
        let selected_real_groups = &projection.real_group_by_session_oracle_group[session_pos];
        let accepted_target_by_person = accepted_template_targets_for_session(
            compiled,
            scaffold,
            mask,
            candidate,
            oracle_schedule,
            projection,
            session_pos,
            real_session_idx,
        );

        for &group_idx in selected_real_groups {
            let original_members = std::mem::take(&mut schedule[real_session_idx][group_idx]);
            for person_idx in original_members {
                if !mask.is_frozen(compiled, real_session_idx, person_idx) {
                    removed[person_idx] = true;
                    if accepted_target_by_person[person_idx].is_none() {
                        displaced.push((person_idx, group_idx));
                    }
                } else {
                    schedule[real_session_idx][group_idx].push(person_idx);
                }
            }
        }

        for (real_person_idx, target_group) in accepted_target_by_person.iter().enumerate() {
            if target_group.is_none() || removed[real_person_idx] {
                continue;
            }
            remove_person_from_session(&mut schedule, real_session_idx, real_person_idx)
                .ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "oracle template merge could not remove projected person {} from session {}",
                        compiled.display_person(real_person_idx),
                        real_session_idx
                    ))
                })?;
            removed[real_person_idx] = true;
        }

        for (real_person_idx, target_group) in accepted_target_by_person.into_iter().enumerate() {
            let Some(real_group_idx) = target_group else {
                continue;
            };
            push_person_if_capacity(
                compiled,
                &mut schedule,
                real_session_idx,
                real_group_idx,
                real_person_idx,
            )?;
            changed_placement_count += 1;
        }

        displaced.sort_unstable_by_key(|&(person_idx, preferred_group_idx)| {
            (preferred_group_idx, person_idx)
        });
        for (person_idx, preferred_group_idx) in displaced {
            let Some(repair_group_idx) = choose_repair_group(
                compiled,
                &schedule,
                signals,
                real_session_idx,
                person_idx,
                preferred_group_idx,
            ) else {
                return Err(SolverError::ValidationError(format!(
                    "oracle template merge could not repair displaced person {} in session {}",
                    compiled.display_person(person_idx),
                    real_session_idx
                )));
            };
            push_person_if_capacity(
                compiled,
                &mut schedule,
                real_session_idx,
                repair_group_idx,
                person_idx,
            )?;
            displaced_repair_count += 1;
        }
    }

    validate_packed_schedule_shape(compiled, &schedule)?;
    Ok(OracleMergeResult {
        schedule,
        changed_placement_count,
        displaced_repair_count,
    })
}

fn accepted_template_targets_for_session(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PureStructureOracleSchedule,
    projection: &OracleTemplateProjectionResult,
    session_pos: usize,
    real_session_idx: usize,
) -> Vec<Option<usize>> {
    let mut remaining_capacity_by_group = vec![0usize; compiled.num_groups];
    for &group_idx in &projection.real_group_by_session_oracle_group[session_pos] {
        let frozen_occupancy = scaffold[real_session_idx][group_idx]
            .iter()
            .filter(|&&person_idx| mask.is_frozen(compiled, real_session_idx, person_idx))
            .count();
        remaining_capacity_by_group[group_idx] = compiled
            .group_capacity(real_session_idx, group_idx)
            .saturating_sub(frozen_occupancy);
    }

    let mut accepted_target_by_person = vec![None; compiled.num_people];
    for oracle_group_idx in 0..candidate.num_groups {
        let real_group_idx =
            projection.real_group_by_session_oracle_group[session_pos][oracle_group_idx];
        for &oracle_person_idx in &oracle_schedule.schedule[session_pos][oracle_group_idx] {
            let Some(real_person_idx) = projected_oracle_person_for_session(
                compiled,
                mask,
                &projection.real_person_by_oracle_person,
                real_session_idx,
                oracle_person_idx,
            ) else {
                continue;
            };
            if remaining_capacity_by_group[real_group_idx] == 0
                || accepted_target_by_person[real_person_idx].is_some()
            {
                continue;
            }
            remaining_capacity_by_group[real_group_idx] -= 1;
            accepted_target_by_person[real_person_idx] = Some(real_group_idx);
        }
    }
    accepted_target_by_person
}

fn validate_template_projection_for_merge(
    candidate: &OracleTemplateCandidate,
    projection: &OracleTemplateProjectionResult,
) -> Result<(), SolverError> {
    if projection.real_person_by_oracle_person.len() != candidate.oracle_capacity {
        return Err(SolverError::ValidationError(
            "oracle template merge received person projection with wrong shape".into(),
        ));
    }
    if projection.real_group_by_session_oracle_group.len() != candidate.num_sessions() {
        return Err(SolverError::ValidationError(
            "oracle template merge received group projection with wrong session count".into(),
        ));
    }
    for (session_pos, groups) in projection
        .real_group_by_session_oracle_group
        .iter()
        .enumerate()
    {
        if groups.len() != candidate.num_groups {
            return Err(SolverError::ValidationError(
                "oracle template merge received group projection with wrong group count".into(),
            ));
        }
        for &group_idx in groups {
            if !candidate.groups_by_session[session_pos].contains(&group_idx) {
                return Err(SolverError::ValidationError(
                    "oracle template merge received group outside candidate template".into(),
                ));
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    for &maybe_person in &projection.real_person_by_oracle_person {
        if let Some(person_idx) = maybe_person {
            if !seen.insert(person_idx) {
                return Err(SolverError::ValidationError(
                    "oracle template merge received duplicate real-person projection".into(),
                ));
            }
        }
    }
    Ok(())
}

fn remove_person_from_session(
    schedule: &mut PackedSchedule,
    session_idx: usize,
    person_idx: usize,
) -> Option<usize> {
    for (group_idx, members) in schedule[session_idx].iter_mut().enumerate() {
        if let Some(position) = members.iter().position(|&member| member == person_idx) {
            members.swap_remove(position);
            return Some(group_idx);
        }
    }
    None
}

fn push_person_if_capacity(
    compiled: &CompiledProblem,
    schedule: &mut PackedSchedule,
    session_idx: usize,
    group_idx: usize,
    person_idx: usize,
) -> Result<(), SolverError> {
    if !compiled.person_participation[person_idx][session_idx] {
        return Err(SolverError::ValidationError(format!(
            "oracle merge tried to place non-participating person {} in session {}",
            compiled.display_person(person_idx),
            session_idx
        )));
    }
    if schedule[session_idx][group_idx].len() >= compiled.group_capacity(session_idx, group_idx) {
        return Err(SolverError::ValidationError(format!(
            "oracle merge overfilled group {} in session {}",
            compiled.display_group(group_idx),
            session_idx
        )));
    }
    schedule[session_idx][group_idx].push(person_idx);
    Ok(())
}

fn choose_repair_group(
    compiled: &CompiledProblem,
    schedule: &PackedSchedule,
    signals: &ConstraintScenarioSignals,
    session_idx: usize,
    person_idx: usize,
    preferred_group_idx: usize,
) -> Option<usize> {
    (0..compiled.num_groups)
        .filter(|&group_idx| {
            schedule[session_idx][group_idx].len() < compiled.group_capacity(session_idx, group_idx)
        })
        .max_by(|&left, &right| {
            let left_score = repair_group_score(
                compiled,
                signals,
                session_idx,
                person_idx,
                preferred_group_idx,
                left,
            );
            let right_score = repair_group_score(
                compiled,
                signals,
                session_idx,
                person_idx,
                preferred_group_idx,
                right,
            );
            left_score
                .partial_cmp(&right_score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| right.cmp(&left))
        })
}

fn repair_group_score(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    session_idx: usize,
    person_idx: usize,
    preferred_group_idx: usize,
    candidate_group_idx: usize,
) -> f64 {
    let scaffold_prior = if candidate_group_idx == preferred_group_idx {
        2.0
    } else {
        0.0
    };
    scaffold_prior
        + signals.placement_frequency(compiled, session_idx, person_idx, candidate_group_idx)
}

fn validate_packed_schedule_shape(
    compiled: &CompiledProblem,
    schedule: &PackedSchedule,
) -> Result<(), SolverError> {
    if schedule.len() != compiled.num_sessions {
        return Err(SolverError::ValidationError(
            "oracle merge produced wrong session count".into(),
        ));
    }
    for (session_idx, groups) in schedule.iter().enumerate() {
        if groups.len() != compiled.num_groups {
            return Err(SolverError::ValidationError(format!(
                "oracle merge produced wrong group count in session {session_idx}"
            )));
        }
        let mut seen = vec![false; compiled.num_people];
        for (group_idx, members) in groups.iter().enumerate() {
            if members.len() > compiled.group_capacity(session_idx, group_idx) {
                return Err(SolverError::ValidationError(format!(
                    "oracle merge produced over-capacity group {} in session {}",
                    compiled.display_group(group_idx),
                    session_idx
                )));
            }
            for &person_idx in members {
                if person_idx >= compiled.num_people {
                    return Err(SolverError::ValidationError(
                        "oracle merge produced out-of-range person index".into(),
                    ));
                }
                if !compiled.person_participation[person_idx][session_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "oracle merge produced non-participating placement for {} in session {}",
                        compiled.display_person(person_idx),
                        session_idx
                    )));
                }
                if seen[person_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "oracle merge produced duplicate placement for {} in session {}",
                        compiled.display_person(person_idx),
                        session_idx
                    )));
                }
                seen[person_idx] = true;
            }
        }
        for (person_idx, participates) in compiled
            .person_participation
            .iter()
            .map(|sessions| sessions[session_idx])
            .enumerate()
        {
            if participates != seen[person_idx] {
                return Err(SolverError::ValidationError(format!(
                    "oracle merge produced missing/unexpected placement for {} in session {}",
                    compiled.display_person(person_idx),
                    session_idx
                )));
            }
        }
    }
    Ok(())
}

fn validate_pure_structure_request(
    request: &PureStructureOracleRequest,
) -> Result<(), SolverError> {
    if request.num_groups < 2 {
        return Err(SolverError::ValidationError(
            "solver3 pure-structure oracle requires at least two groups".into(),
        ));
    }
    if request.group_size < 2 {
        return Err(SolverError::ValidationError(
            "solver3 pure-structure oracle requires group size at least two".into(),
        ));
    }
    if request.num_sessions < 2 {
        return Err(SolverError::ValidationError(
            "solver3 pure-structure oracle requires at least two sessions".into(),
        ));
    }
    Ok(())
}

fn build_solver6_oracle_input(
    request: &PureStructureOracleRequest,
) -> Result<ApiInput, SolverError> {
    let num_sessions = u32::try_from(request.num_sessions).map_err(|_| {
        SolverError::ValidationError(
            "solver3 pure-structure oracle num_sessions does not fit u32".into(),
        )
    })?;
    let group_size = u32::try_from(request.group_size).map_err(|_| {
        SolverError::ValidationError(
            "solver3 pure-structure oracle group_size does not fit u32".into(),
        )
    })?;
    let people = (0..request.num_people())
        .map(|idx| Person {
            id: oracle_person_id(idx),
            attributes: HashMap::new(),
            sessions: None,
        })
        .collect::<Vec<_>>();
    let groups = (0..request.num_groups)
        .map(|idx| Group {
            id: oracle_group_id(idx),
            size: group_size,
            session_sizes: None,
        })
        .collect::<Vec<_>>();

    Ok(ApiInput {
        problem: ProblemDefinition {
            people,
            groups,
            num_sessions,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "linear".into(),
            penalty_weight: 1.0,
        })],
        solver: SolverConfiguration {
            solver_type: SolverKind::Solver6.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(500),
                time_limit_seconds: Some(1),
                no_improvement_iterations: Some(100),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver6(Solver6Params {
                exact_construction_handoff_enabled: true,
                seed_strategy: Solver6SeedStrategy::Solver5ExactBlockComposition,
                pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
                search_strategy: Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
                cache: None,
                seed_time_limit_seconds: None,
                local_search_time_limit_seconds: None,
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(request.seed),
            move_policy: None,
            allowed_sessions: None,
        },
    })
}

fn parse_solver6_oracle_schedule(
    request: &PureStructureOracleRequest,
    api_schedule: &HashMap<String, HashMap<String, Vec<String>>>,
) -> Result<PackedSchedule, SolverError> {
    let mut schedule = vec![vec![Vec::new(); request.num_groups]; request.num_sessions];
    for (session_idx, groups) in schedule.iter_mut().enumerate() {
        let session_key = format!("session_{session_idx}");
        let api_groups = api_schedule.get(&session_key).ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver6 pure-structure oracle result omitted {session_key}"
            ))
        })?;
        for (group_idx, members) in groups.iter_mut().enumerate() {
            let group_key = oracle_group_id(group_idx);
            let api_members = api_groups.get(&group_key).ok_or_else(|| {
                SolverError::ValidationError(format!(
                    "solver6 pure-structure oracle result omitted group {group_key} in {session_key}"
                ))
            })?;
            for person_id in api_members {
                let Some(raw_idx) = person_id.strip_prefix("oracle_p") else {
                    return Err(SolverError::ValidationError(format!(
                        "solver6 pure-structure oracle returned unexpected person id '{person_id}'"
                    )));
                };
                let person_idx = raw_idx.parse::<usize>().map_err(|_| {
                    SolverError::ValidationError(format!(
                        "solver6 pure-structure oracle returned non-numeric person id '{person_id}'"
                    ))
                })?;
                members.push(person_idx);
            }
        }
    }
    Ok(schedule)
}

pub(crate) fn validate_pure_oracle_schedule(
    request: &PureStructureOracleRequest,
    schedule: &PackedSchedule,
) -> Result<(), SolverError> {
    if schedule.len() != request.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "pure-structure oracle returned {} sessions for requested {}",
            schedule.len(),
            request.num_sessions
        )));
    }
    for (session_idx, groups) in schedule.iter().enumerate() {
        if groups.len() != request.num_groups {
            return Err(SolverError::ValidationError(format!(
                "pure-structure oracle returned {} groups in session {}, requested {}",
                groups.len(),
                session_idx,
                request.num_groups
            )));
        }
        let mut seen = vec![false; request.num_people()];
        for (group_idx, members) in groups.iter().enumerate() {
            if members.len() != request.group_size {
                return Err(SolverError::ValidationError(format!(
                    "pure-structure oracle returned group size {} in session {}, group {}, requested {}",
                    members.len(), session_idx, group_idx, request.group_size
                )));
            }
            for &person_idx in members {
                if person_idx >= request.num_people() {
                    return Err(SolverError::ValidationError(format!(
                        "pure-structure oracle returned out-of-range person index {person_idx}"
                    )));
                }
                if seen[person_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "pure-structure oracle returned duplicate person index {person_idx} in session {session_idx}"
                    )));
                }
                seen[person_idx] = true;
            }
        }
        if seen.iter().any(|seen| !seen) {
            return Err(SolverError::ValidationError(format!(
                "pure-structure oracle omitted at least one person in session {session_idx}"
            )));
        }
    }
    Ok(())
}

fn oracle_person_id(idx: usize) -> String {
    format!("oracle_p{idx}")
}

fn oracle_group_id(idx: usize) -> String {
    format!("oracle_g{idx}")
}

fn participates_in_active_clique(
    compiled: &CompiledProblem,
    session_idx: usize,
    person_idx: usize,
) -> bool {
    let Some(clique_idx) = compiled.person_to_clique_id[session_idx][person_idx] else {
        return false;
    };
    let clique = &compiled.cliques[clique_idx];
    let active_members = clique
        .members
        .iter()
        .copied()
        .filter(|&member| compiled.person_participation[member][session_idx])
        .count();
    active_members >= 2
}

fn placement_exists(scaffold: &PackedSchedule, session_idx: usize, person_idx: usize) -> bool {
    scaffold
        .get(session_idx)
        .into_iter()
        .flat_map(|groups| groups.iter())
        .any(|members| members.contains(&person_idx))
}

#[cfg(test)]
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

#[cfg(test)]
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

#[cfg(test)]
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

#[cfg(test)]
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
