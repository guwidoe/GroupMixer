use crate::solver5::problem::PureSgpProblem;
use crate::solver5::types::ConstructionResult;

pub(super) trait HeuristicImprover {
    fn id(&self) -> &'static str;

    fn improve(
        &self,
        problem: &PureSgpProblem,
        construction: ConstructionResult,
    ) -> ConstructionResult;
}

#[derive(Default)]
pub(super) struct NoopHeuristicPipeline;

impl NoopHeuristicPipeline {
    pub(super) fn apply(
        &self,
        _problem: &PureSgpProblem,
        construction: ConstructionResult,
    ) -> ConstructionResult {
        construction
    }
}
