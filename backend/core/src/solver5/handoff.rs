use super::problem::PureSgpProblem;
use super::types::{ConstructionFamilyId, ConstructionQuality, ConstructionResult, Schedule};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct SearchSeedPayload {
    pub(super) schedule: Schedule,
    pub(super) source_family: ConstructionFamilyId,
    pub(super) quality: ConstructionQuality,
    pub(super) supported_weeks: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum SearchHandoffDecision {
    ConstructionOnly {
        result: ConstructionResult,
        reason: &'static str,
    },
    SearchPreferred {
        seed: SearchSeedPayload,
        reason: &'static str,
    },
}

pub(super) trait SearchHandoffPolicy {
    fn decide(&self, problem: &PureSgpProblem, result: ConstructionResult)
        -> SearchHandoffDecision;
}

pub(super) struct NoSearchHandoffPolicy;

impl SearchHandoffPolicy for NoSearchHandoffPolicy {
    fn decide(
        &self,
        _problem: &PureSgpProblem,
        result: ConstructionResult,
    ) -> SearchHandoffDecision {
        SearchHandoffDecision::ConstructionOnly {
            result,
            reason: "solver5 remains construction-only; search handoff is reserved but disabled",
        }
    }
}
