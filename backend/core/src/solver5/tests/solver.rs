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
fn solver5_solves_single_round_partition_cases() {
    let input = pure_input(3, 4, 1);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("single-round partition should solve 3-4-1");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 1);

    let input = pure_input(10, 10, 1);
    let result = solver
        .solve(&input)
        .expect("single-round partition should solve 10-10-1");
    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 1);
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

    let input = pure_input(16, 16, 17);
    let result = solver
        .solve(&input)
        .expect("order-16 affine plane should solve 16-16-17");
    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 17);
}

#[test]
fn solver5_solves_p4_resolvable_bibd_cases() {
    let input = pure_input(7, 4, 9);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("p4 resolvable bibd construction should solve 7-4-9");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 9);

    let input = pure_input(10, 4, 13);
    let result = solver
        .solve(&input)
        .expect("p4 resolvable bibd construction should solve 10-4-13");
    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 13);

    let input = pure_input(19, 4, 25);
    let result = solver
        .solve(&input)
        .expect("p4 resolvable bibd construction should solve 19-4-25");
    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 25);
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
fn solver5_recursively_lifts_transversal_design_with_single_round_fallback() {
    let input = pure_input(16, 8, 17);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("recursive latent-group lifting with one-week fallback should solve 16-8-17");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 17);
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
fn solver5_solves_catalog_backed_8_3_11_case() {
    let input = pure_input(8, 3, 11);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("catalog-backed nkts construction should solve 8-3-11");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 11);
}

#[test]
fn solver5_solves_catalog_backed_10_3_14_case() {
    let input = pure_input(10, 3, 14);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("catalog-backed nkts construction should solve 10-3-14");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 14);
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

#[test]
fn solver5_solves_published_8_4_10_case() {
    let input = pure_input(8, 4, 10);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("published schedule bank should solve 8-4-10");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 10);
}

#[test]
fn solver5_solves_published_10_4_9_case() {
    let input = pure_input(10, 4, 9);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("published schedule bank should solve 10-4-9");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 9);
}

#[test]
fn solver5_solves_published_9_4_11_case() {
    let input = pure_input(9, 4, 11);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("published schedule bank should solve 9-4-11");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 11);
}

#[test]
fn solver5_solves_rbibd_15_8_17_case() {
    let input = pure_input(15, 8, 17);
    let solver = SearchEngine::new(&input.solver);
    let result = solver.solve(&input).expect("rbibd catalog should solve 15-8-17");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 17);
}

#[test]
fn solver5_solves_mols_catalog_cases() {
    let solver = SearchEngine::new(&pure_input(12, 6, 13).solver);

    for (g, p, w) in [(12, 6, 13), (15, 3, 22), (14, 5, 14), (18, 4, 18), (18, 5, 18), (18, 6, 19)] {
        let input = pure_input(g, p, w);
        let result = solver
            .solve(&input)
            .unwrap_or_else(|_| panic!("mols catalog should solve {g}-{p}-{w}"));

        assert_eq!(result.final_score, 0.0, "{g}-{p}-{w} should stay pure-SGP");
        assert_eq!(result.schedule.len(), w);
    }
}

#[test]
fn solver5_solves_mols_product_cases() {
    let solver = SearchEngine::new(&pure_input(20, 4, 25).solver);

    for (g, p, w) in [(20, 3, 20), (20, 4, 25)] {
        let input = pure_input(g, p, w);
        let result = solver
            .solve(&input)
            .unwrap_or_else(|_| panic!("mols product should solve {g}-{p}-{w}"));

        assert_eq!(result.final_score, 0.0, "{g}-{p}-{w} should stay pure-SGP");
        assert_eq!(result.schedule.len(), w);
    }
}

#[test]
fn solver5_solves_molr_from_mols_cases() {
    let solver = SearchEngine::new(&pure_input(18, 8, 6).solver);

    for (g, p, w) in [(12, 12, 7), (14, 10, 5), (15, 10, 5), (18, 8, 6), (18, 9, 7), (18, 10, 6)] {
        let input = pure_input(g, p, w);
        let result = solver
            .solve(&input)
            .unwrap_or_else(|_| panic!("molr from mols should solve {g}-{p}-{w}"));

        assert_eq!(result.final_score, 0.0, "{g}-{p}-{w} should stay pure-SGP");
        assert_eq!(result.schedule.len(), w);
    }
}

#[test]
fn solver5_solves_molr_group_fill_10_10_4_case() {
    let input = pure_input(10, 10, 4);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("molr group-fill construction should solve 10-10-4");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 4);
}

#[test]
fn solver5_solves_ownsg_10_9_5_case() {
    let input = pure_input(10, 9, 5);
    let solver = SearchEngine::new(&input.solver);
    let result = solver.solve(&input).expect("ownsg should solve 10-9-5");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 5);
}

#[test]
fn solver5_solves_ownsg_supplementary_cases() {
    let solver = SearchEngine::new(&pure_input(12, 7, 7).solver);

    for (g, p, w) in [
        (12, 7, 7),
        (12, 8, 6),
        (14, 6, 9),
        (14, 7, 9),
        (15, 6, 10),
        (20, 6, 13),
    ] {
        let input = pure_input(g, p, w);
        let result = solver
            .solve(&input)
            .unwrap_or_else(|_| panic!("ownsg should solve {g}-{p}-{w}"));

        assert_eq!(result.final_score, 0.0, "{g}-{p}-{w} should stay pure-SGP");
        assert_eq!(result.schedule.len(), w);
    }
}

#[test]
fn solver5_solves_ritd_10_5_9_case() {
    let input = pure_input(10, 5, 9);
    let solver = SearchEngine::new(&input.solver);
    let result = solver.solve(&input).expect("ritd should solve 10-5-9");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 9);
}

#[test]
fn solver5_solves_published_6_4_7_case() {
    let input = pure_input(6, 4, 7);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("published schedule bank should solve corrected 6-4-7");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 7);
}

#[test]
fn solver5_solves_published_6_5_6_case() {
    let input = pure_input(6, 5, 6);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("published schedule bank should solve 6-5-6");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 6);
}

#[test]
fn solver5_solves_published_10_10_3_case() {
    let input = pure_input(10, 10, 3);
    let solver = SearchEngine::new(&input.solver);
    let result = solver
        .solve(&input)
        .expect("published schedule bank should solve 10-10-3");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 3);
}
