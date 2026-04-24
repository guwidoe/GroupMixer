use crate::solver3::compiled_problem::{CompiledProblem, PackedSchedule};

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

impl OracleTemplateCandidate {
    pub(crate) fn num_sessions(&self) -> usize {
        self.sessions.len()
    }
}
