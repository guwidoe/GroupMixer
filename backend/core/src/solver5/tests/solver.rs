use super::helpers::pure_input;
use crate::solver5::SearchEngine;

#[test]
fn solver5_supports_round_robin_prefixes() {
    let input = pure_input(4, 2, 5);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("round robin prefix should solve 4-2-5");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 5);
}

#[test]
fn solver5_reports_missing_family_cleanly() {
    let input = pure_input(10, 10, 10);
    let solver = SearchEngine::new(&input.solver);
    let error = solver
        .solve(&input)
        .expect_err("10-10-10 should not be supported yet");

    let message = error.to_string();
    assert!(message.contains("solver5 does not yet have a construction family for 10-10-10"));
    assert!(message.contains("router attempts:"));
}

#[test]
fn solver5_solves_prime_power_transversal_design_cases() {
    let input = pure_input(5, 4, 5);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("prime-order transversal design should solve 5-4-5");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 5);

    let input = pure_input(4, 3, 4);
    let result = solver
        .solve(&input)
        .expect("prime-power transversal design should solve 4-3-4");
    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 4);
}

#[test]
fn solver5_solves_prime_power_affine_plane_cases() {
    let input = pure_input(5, 5, 6);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("prime affine plane should solve 5-5-6");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 6);

    let input = pure_input(4, 4, 5);
    let result = solver
        .solve(&input)
        .expect("prime-power affine plane should solve 4-4-5");
    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 5);
}

#[test]
fn solver5_recursively_lifts_transversal_design_latent_groups() {
    let input = pure_input(9, 3, 13);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("recursive latent-group lifting should solve 9-3-13");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 13);
}

#[test]
fn solver5_solves_kirkman_6t_plus_1_cases() {
    let input = pure_input(7, 3, 10);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("kirkman 6t+1 construction should solve 7-3-10");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 10);
}

#[test]
fn solver5_solves_catalog_backed_nkts_case() {
    let input = pure_input(6, 3, 8);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("catalog-backed nkts construction should solve 6-3-8");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 8);
}

#[test]
fn solver5_solves_catalog_backed_kts_case() {
    let input = pure_input(5, 3, 7);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("catalog-backed kts construction should solve 5-3-7");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 7);
}

#[test]
fn solver5_solves_pseudo_doubled_nkts_case() {
    let input = pure_input(10, 3, 13);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("pseudo-doubled nkts construction should solve 10-3-13");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 13);
}

#[test]
fn solver5_solves_published_8_3_10_case() {
    let input = pure_input(8, 3, 10);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("published schedule bank should solve 8-3-10");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 10);
}
