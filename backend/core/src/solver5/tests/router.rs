use super::helpers::pure_input;
use crate::solver5::{
    problem::PureSgpProblem,
    router::{attempt_construction, FamilyAttemptStatus},
    types::{CompositionOperatorId, ConstructionFamilyId, ConstructionSpan},
};

#[test]
fn router_selects_round_robin_for_p2_cases() {
    let input = pure_input(4, 2, 7);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should find round robin");

    assert_eq!(decision.result.family, ConstructionFamilyId::RoundRobin);
    assert_eq!(decision.attempts.len(), 1);
    assert_eq!(
        decision.attempts[0].status,
        FamilyAttemptStatus::Selected {
            max_supported_weeks: 7,
        }
    );
}

#[test]
fn router_reports_prefix_and_recursive_provenance() {
    let input = pure_input(9, 3, 10);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let decision = attempt_construction(&problem).expect("router should construct 9-3-10");

    assert_eq!(
        decision.result.family,
        ConstructionFamilyId::TransversalDesignPrimePower
    );
    assert_eq!(
        decision.result.span,
        ConstructionSpan::Prefix {
            requested_weeks: 10,
        }
    );
    assert_eq!(decision.result.max_supported_weeks, 13);
    assert_eq!(
        decision.result.provenance.operators,
        vec![CompositionOperatorId::RecursiveTransversalLift]
    );
}

#[test]
fn router_failure_explains_attempted_families() {
    let input = pure_input(10, 10, 10);
    let problem = PureSgpProblem::from_input(&input).expect("pure input should parse");
    let failure = attempt_construction(&problem).expect_err("10-10-10 should still be unsupported");
    let message = failure.to_solver_error_message(&problem);

    assert!(message.contains("round_robin: requires group_size == 2"));
    assert!(message.contains(
        "kirkman_6t_plus_1: requires supported prime-power group count"
    ));
    assert!(message.contains("affine_plane_prime_power: requires supported prime-power group count"));
    assert!(message.contains("transversal_design_prime_power: requires supported prime-power group count"));
}
