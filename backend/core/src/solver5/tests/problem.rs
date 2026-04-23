use super::helpers::pure_input;
use crate::solver5::{problem::PureSgpProblem, SearchEngine};

#[test]
fn solver5_rejects_partial_attendance_inputs() {
    let mut input = pure_input(4, 2, 7);
    input.problem.people[0].sessions = Some(vec![0, 1, 2]);
    let solver = SearchEngine::new(&input.solver);
    let error = solver
        .solve(&input)
        .expect_err("partial attendance should be rejected");

    assert!(error
        .to_string()
        .contains("solver5 rejects partial attendance"));
}

#[test]
fn pure_problem_parser_accepts_valid_pure_instances() {
    let input = pure_input(4, 2, 7);
    let parsed = PureSgpProblem::from_input(&input).expect("pure solver5 input should parse");

    assert_eq!(parsed.num_groups, 4);
    assert_eq!(parsed.group_size, 2);
    assert_eq!(parsed.num_weeks, 7);
}
