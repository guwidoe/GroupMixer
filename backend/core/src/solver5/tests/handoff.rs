use super::helpers::pure_input;
use crate::solver5::{
    handoff::{NoSearchHandoffPolicy, SearchHandoffDecision, SearchHandoffPolicy},
    problem::PureSgpProblem,
    router::attempt_construction,
    types::ConstructionFamilyId,
};

#[test]
fn no_search_handoff_policy_keeps_solver5_construction_only() {
    let input = pure_input(4, 2, 5);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let routing = attempt_construction(&problem).expect("round robin should route");

    let decision = NoSearchHandoffPolicy.decide(&problem, routing.result);
    match decision {
        SearchHandoffDecision::ConstructionOnly { result, reason } => {
            assert_eq!(result.family, ConstructionFamilyId::RoundRobin);
            assert!(reason.contains("construction-only"));
        }
        SearchHandoffDecision::SearchPreferred { .. } => {
            panic!("default policy should not request search handoff")
        }
    }
}
