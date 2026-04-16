use super::problem::PureSgpProblem;
use super::types::{ConstructionFamilyId, ConstructionResult};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum FamilyEvaluation {
    Applicable { max_supported_weeks: usize },
    NotApplicable { reason: &'static str },
}

pub(super) trait ConstructionFamily {
    fn id(&self) -> ConstructionFamilyId;
    fn evaluate(&self, problem: &PureSgpProblem) -> FamilyEvaluation;
    fn construct(&self, problem: &PureSgpProblem) -> Option<ConstructionResult>;
}
