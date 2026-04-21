use super::problem::PureSgpProblem;
use super::score::PairFrequencySummary;
use crate::models::Solver6PairRepeatPenaltyModel;
use crate::solver5::atoms::Solver5ConstructionAtom;
use crate::solver_support::SolverError;

pub(crate) mod mixed;
pub(crate) mod relabeling;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SeedSourceKind {
    Solver5ConstructionAtom,
    HeuristicTail,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SeedAtomId {
    pub source_kind: SeedSourceKind,
    pub family_label: String,
    pub max_supported_weeks: usize,
    pub quality_label: String,
}

impl SeedAtomId {
    pub(crate) fn from_solver5_atom(atom: &Solver5ConstructionAtom) -> Self {
        Self {
            source_kind: SeedSourceKind::Solver5ConstructionAtom,
            family_label: atom.family_label.clone(),
            max_supported_weeks: atom.max_supported_weeks,
            quality_label: atom.quality_label.clone(),
        }
    }

    pub(crate) fn heuristic_tail(family_label: &str, weeks_used: usize) -> Self {
        Self {
            source_kind: SeedSourceKind::HeuristicTail,
            family_label: family_label.into(),
            max_supported_weeks: weeks_used,
            quality_label: "heuristic_tail".into(),
        }
    }

    pub(crate) fn display_label(&self) -> String {
        format!(
            "solver5:{}:{}w:{}",
            self.family_label, self.max_supported_weeks, self.quality_label
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SeedRelabelingKind {
    Identity,
    ExplicitPermutation,
}

impl SeedRelabelingKind {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Identity => "identity",
            Self::ExplicitPermutation => "explicit_permutation",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SeedRelabelingSummary {
    pub kind: SeedRelabelingKind,
    pub changed_people: usize,
}

impl SeedRelabelingSummary {
    pub(crate) fn identity() -> Self {
        Self {
            kind: SeedRelabelingKind::Identity,
            changed_people: 0,
        }
    }

    pub(crate) fn explicit_permutation(changed_people: usize) -> Self {
        Self {
            kind: SeedRelabelingKind::ExplicitPermutation,
            changed_people,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SeedAtomUsage {
    pub atom_id: SeedAtomId,
    pub copy_index: usize,
    pub weeks_used: usize,
    pub week_range_start: usize,
    pub week_range_end_exclusive: usize,
    pub relabeling: SeedRelabelingSummary,
}

impl SeedAtomUsage {
    pub(crate) fn new(
        atom_id: SeedAtomId,
        copy_index: usize,
        weeks_used: usize,
        week_range_start: usize,
        week_range_end_exclusive: usize,
        relabeling: SeedRelabelingSummary,
    ) -> Self {
        Self {
            atom_id,
            copy_index,
            weeks_used,
            week_range_start,
            week_range_end_exclusive,
            relabeling,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SeedPairTelemetry {
    pub active_penalty_model: Solver6PairRepeatPenaltyModel,
    pub active_penalty_score: u64,
    pub linear_repeat_excess: u64,
    pub triangular_repeat_excess: u64,
    pub squared_repeat_excess: u64,
    pub distinct_pairs_covered: usize,
    pub max_pair_frequency: usize,
    pub total_pair_incidences: usize,
    pub linear_repeat_lower_bound: u64,
    pub linear_repeat_lower_bound_gap: u64,
    pub multiplicity_histogram: Vec<usize>,
}

impl SeedPairTelemetry {
    pub(super) fn from_schedule(
        num_people: usize,
        schedule: &[Vec<Vec<usize>>],
        active_penalty_model: Solver6PairRepeatPenaltyModel,
    ) -> Result<Self, SolverError> {
        let summary = PairFrequencySummary::from_raw_schedule(num_people, schedule)?;
        Ok(Self {
            active_penalty_model,
            active_penalty_score: summary.score_for_model(active_penalty_model),
            linear_repeat_excess: summary.linear_repeat_excess(),
            triangular_repeat_excess: summary.triangular_repeat_excess(),
            squared_repeat_excess: summary.squared_repeat_excess(),
            distinct_pairs_covered: summary.distinct_pairs_covered(),
            max_pair_frequency: summary.max_pair_frequency(),
            total_pair_incidences: summary.total_pair_incidences(),
            linear_repeat_lower_bound: summary.linear_repeat_excess_lower_bound(),
            linear_repeat_lower_bound_gap: summary.linear_repeat_excess_lower_bound_gap(),
            multiplicity_histogram: summary.multiplicity_histogram().counts_by_frequency().to_vec(),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExactBlockSeedDiagnostics {
    pub total_weeks: usize,
    pub atom_uses: Vec<SeedAtomUsage>,
    pub pair_telemetry: Option<SeedPairTelemetry>,
}

impl ExactBlockSeedDiagnostics {
    pub(crate) fn concise_summary(&self) -> String {
        let block_list = self
            .atom_uses
            .iter()
            .map(|usage| {
                format!(
                    "{}@{}..{}({})",
                    usage.atom_id.display_label(),
                    usage.week_range_start,
                    usage.week_range_end_exclusive,
                    usage.relabeling.kind.label()
                )
            })
            .collect::<Vec<_>>()
            .join(", ");

        let pair_summary = self.pair_telemetry.as_ref().map_or_else(
            || "pair_telemetry=unavailable".to_string(),
            |telemetry| {
                format!(
                    "active_score={}, max_pair_frequency={}, linear_repeat_excess={}, lower_bound_gap={}",
                    telemetry.active_penalty_score,
                    telemetry.max_pair_frequency,
                    telemetry.linear_repeat_excess,
                    telemetry.linear_repeat_lower_bound_gap
                )
            },
        );

        format!(
            "weeks={}, atom_copies={}, blocks=[{}], {}",
            self.total_weeks,
            self.atom_uses.len(),
            block_list,
            pair_summary
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExactBlockSeed {
    pub schedule: Vec<Vec<Vec<usize>>>,
    pub diagnostics: ExactBlockSeedDiagnostics,
}

pub(super) fn validate_full_schedule_shape(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
) -> Result<(), SolverError> {
    if schedule.len() != problem.num_weeks {
        return Err(SolverError::ValidationError(format!(
            "solver6 composed seed has {} weeks, expected {}",
            schedule.len(),
            problem.num_weeks
        )));
    }

    let num_people = problem.num_groups * problem.group_size;
    for (week_idx, week) in schedule.iter().enumerate() {
        if week.len() != problem.num_groups {
            return Err(SolverError::ValidationError(format!(
                "solver6 composed seed week {week_idx} has {} groups, expected {}",
                week.len(),
                problem.num_groups
            )));
        }

        let mut seen_people = vec![false; num_people];
        for (block_idx, block) in week.iter().enumerate() {
            if block.len() != problem.group_size {
                return Err(SolverError::ValidationError(format!(
                    "solver6 composed seed week {week_idx}, block {block_idx} has size {}, expected {}",
                    block.len(),
                    problem.group_size
                )));
            }

            for &person_idx in block {
                if person_idx >= num_people {
                    return Err(SolverError::ValidationError(format!(
                        "solver6 composed seed week {week_idx}, block {block_idx} contains out-of-bounds person index {person_idx}"
                    )));
                }
                if seen_people[person_idx] {
                    return Err(SolverError::ValidationError(format!(
                        "solver6 composed seed repeats person {person_idx} in week {week_idx}"
                    )));
                }
                seen_people[person_idx] = true;
            }
        }

        if let Some(missing_person) = seen_people.iter().position(|present| !*present) {
            return Err(SolverError::ValidationError(format!(
                "solver6 composed seed omits person {missing_person} in week {week_idx}"
            )));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        ExactBlockSeed, ExactBlockSeedDiagnostics, SeedAtomId, SeedAtomUsage,
        SeedRelabelingSummary,
    };
    use super::relabeling::build_identity_exact_block_seed;
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition,
        RepeatEncounterParams, Solver6Params, SolverConfiguration, SolverKind, SolverParams,
        StopConditions,
    };
    use crate::solver5::atoms::{Solver5ConstructionAtom, Solver5ConstructionAtomSpan};
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

    fn sample_atom() -> Solver5ConstructionAtom {
        Solver5ConstructionAtom {
            requested_weeks: 20,
            max_supported_weeks: 10,
            span: Solver5ConstructionAtomSpan::Full,
            schedule: vec![vec![vec![0, 1], vec![2, 3]]; 10],
            family_label: "published_schedule_bank".into(),
            operator_labels: vec![],
            quality_label: "exact_frontier".into(),
            evidence_citations: vec!["bank".into()],
            residual_label: None,
        }
    }

    #[test]
    fn seed_atom_id_captures_typed_atom_metadata() {
        let atom_id = SeedAtomId::from_solver5_atom(&sample_atom());
        assert_eq!(atom_id.family_label, "published_schedule_bank");
        assert_eq!(atom_id.max_supported_weeks, 10);
        assert_eq!(atom_id.display_label(), "solver5:published_schedule_bank:10w:exact_frontier");
    }

    #[test]
    fn seed_diagnostics_expose_atom_usage_without_string_parsing() {
        let atom_id = SeedAtomId::from_solver5_atom(&sample_atom());
        let usage = SeedAtomUsage::new(atom_id, 1, 10, 10, 20, SeedRelabelingSummary::identity());
        let seed = ExactBlockSeed {
            schedule: vec![vec![vec![0, 1], vec![2, 3]]; 20],
            diagnostics: ExactBlockSeedDiagnostics {
                total_weeks: 20,
                atom_uses: vec![usage.clone()],
                pair_telemetry: None,
            },
        };

        assert_eq!(seed.diagnostics.atom_uses[0], usage);
        assert_eq!(seed.diagnostics.atom_uses[0].weeks_used, 10);
        assert_eq!(seed.diagnostics.atom_uses[0].relabeling.changed_people, 0);
    }

    #[test]
    fn identity_exact_block_seed_duplicates_best_atom_for_8_4_20() {
        let seed = build_identity_exact_block_seed(&pure_input(8, 4, 20))
            .expect("8-4-20 should support identity exact-block composition from 8-4-10 atoms");

        assert_eq!(seed.schedule.len(), 20);
        assert_eq!(seed.diagnostics.total_weeks, 20);
        assert_eq!(seed.diagnostics.atom_uses.len(), 2);
        assert_eq!(seed.diagnostics.atom_uses[0].week_range_start, 0);
        assert_eq!(seed.diagnostics.atom_uses[0].week_range_end_exclusive, 10);
        assert_eq!(seed.diagnostics.atom_uses[1].week_range_start, 10);
        assert_eq!(seed.diagnostics.atom_uses[1].week_range_end_exclusive, 20);
        assert_eq!(
            seed.diagnostics.atom_uses[0].relabeling,
            SeedRelabelingSummary::identity()
        );
        assert_eq!(
            seed.diagnostics.atom_uses[1].relabeling,
            SeedRelabelingSummary::identity()
        );

        let telemetry = seed
            .diagnostics
            .pair_telemetry
            .as_ref()
            .expect("identity-composed seed should include pre-search pair telemetry");
        assert_eq!(telemetry.active_penalty_score, 480);
        assert_eq!(telemetry.linear_repeat_excess, 480);
        assert_eq!(telemetry.max_pair_frequency, 2);
        assert_eq!(telemetry.linear_repeat_lower_bound, 464);
        assert_eq!(telemetry.linear_repeat_lower_bound_gap, 16);
        assert_eq!(telemetry.multiplicity_histogram.get(0), Some(&16));
        assert_eq!(telemetry.multiplicity_histogram.get(2), Some(&480));
    }

    #[test]
    fn identity_exact_block_seed_reports_non_divisible_remainder_explicitly() {
        let err = build_identity_exact_block_seed(&pure_input(8, 4, 21)).unwrap_err();
        assert!(err
            .to_string()
            .contains("currently supports only k * w0 tilings"));
    }
}
