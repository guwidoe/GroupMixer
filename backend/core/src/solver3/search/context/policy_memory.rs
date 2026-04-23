use super::super::family_selection::MoveFamilyChooserState;

#[derive(Debug, Clone, Default, PartialEq)]
#[allow(dead_code)]
pub(crate) struct SearchPolicyMemory {
    pub(crate) tabu: Option<TabuPolicyMemory>,
    pub(crate) threshold: Option<ThresholdAcceptanceMemory>,
    pub(crate) late_acceptance: Option<LateAcceptanceMemory>,
    pub(crate) ils: Option<IteratedLocalSearchMemory>,
    pub(crate) move_family_chooser: MoveFamilyChooserState,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TabuPolicyMemory {
    pub(crate) tenure_hint: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ThresholdAcceptanceMemory {
    pub(crate) threshold_score: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LateAcceptanceMemory {
    pub(crate) window_len: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct IteratedLocalSearchMemory {
    pub(crate) perturbation_round: u64,
}
