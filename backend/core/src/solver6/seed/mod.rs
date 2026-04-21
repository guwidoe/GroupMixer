use crate::models::Solver6PairRepeatPenaltyModel;
use crate::solver5::atoms::Solver5ConstructionAtom;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SeedSourceKind {
    Solver5ConstructionAtom,
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
}

impl SeedRelabelingKind {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Identity => "identity",
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExactBlockSeedDiagnostics {
    pub total_weeks: usize,
    pub atom_uses: Vec<SeedAtomUsage>,
    pub pair_telemetry: Option<SeedPairTelemetry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExactBlockSeed {
    pub schedule: Vec<Vec<Vec<usize>>>,
    pub diagnostics: ExactBlockSeedDiagnostics,
}

#[cfg(test)]
mod tests {
    use super::{
        ExactBlockSeed, ExactBlockSeedDiagnostics, SeedAtomId, SeedAtomUsage,
        SeedRelabelingSummary,
    };
    use crate::solver5::atoms::{Solver5ConstructionAtom, Solver5ConstructionAtomSpan};

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
}
