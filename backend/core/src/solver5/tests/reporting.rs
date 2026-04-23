use crate::solver5::reporting::{load_default_target_matrix, MatrixCellTarget};

#[test]
fn default_target_matrix_loads_with_expected_bounds() {
    let matrix = load_default_target_matrix().expect("default target matrix should load");

    assert_eq!(matrix.version, 1);
    assert_eq!(matrix.visual_bounds.g_min, 1);
    assert_eq!(matrix.visual_bounds.g_max, 10);
    assert_eq!(matrix.visual_bounds.p_min, 1);
    assert_eq!(matrix.visual_bounds.p_max, 10);
    assert_eq!(matrix.scored_bounds.g_min, 2);
    assert_eq!(matrix.scored_bounds.g_max, 10);
    assert_eq!(matrix.scored_bounds.p_min, 2);
    assert_eq!(matrix.scored_bounds.p_max, 10);
}

#[test]
fn default_target_matrix_exposes_expected_cells_and_abbreviations() {
    let matrix = load_default_target_matrix().expect("default target matrix should load");

    assert_eq!(matrix.target_for(1, 1), Some(&MatrixCellTarget::Infinite));
    assert_eq!(matrix.target_for(7, 3), Some(&MatrixCellTarget::Finite(10)));
    assert_eq!(matrix.target_for(7, 8), Some(&MatrixCellTarget::Finite(1)));
    assert_eq!(
        matrix.target_for(10, 10),
        Some(&MatrixCellTarget::Finite(1))
    );
    assert_eq!(matrix.abbreviation_for("round_robin"), Some("RR"));
    assert_eq!(
        matrix.abbreviation_for("single_round_partition"),
        Some("1W")
    );
    assert_eq!(
        matrix.abbreviation_for("kirkman_6t_plus_1"),
        Some("KTS(6t+3)")
    );
    assert_eq!(matrix.abbreviation_for("mols_catalog"), Some("MOLS"));
    assert_eq!(matrix.abbreviation_for("mols_product"), Some("MOLSx"));
    assert_eq!(matrix.abbreviation_for("rtd_qdm_catalog"), Some("RTD-QDM"));
    assert_eq!(matrix.abbreviation_for("molr_from_mols"), Some("MOLR"));
    assert_eq!(matrix.abbreviation_for("ownsg"), Some("ownSG"));
    assert_eq!(matrix.abbreviation_for("ritd"), Some("RITD"));
    assert_eq!(matrix.abbreviation_for("molr_group_fill"), Some("MOLR+G"));
    assert_eq!(matrix.abbreviation_for("rbibd_catalog"), Some("RBIBD"));
    assert_eq!(matrix.abbreviation_for("p4_router"), Some("P4"));
    assert_eq!(
        matrix.abbreviation_for("published_schedule_bank"),
        Some("PSB")
    );
    assert_eq!(
        matrix.abbreviation_for("transversal_design_prime_power"),
        Some("RTD")
    );
    assert_eq!(
        matrix.abbreviation_for("recursive_transversal_lift"),
        Some("+G")
    );
    assert_eq!(matrix.abbreviation_for("visual_only"), Some("VIS"));
    assert_eq!(matrix.target_method_for(2, 2), Some("round_robin"));
    assert_eq!(matrix.heuristic_target_weeks_for(2, 2), Some(3));
    assert_eq!(matrix.heuristic_target_weeks_for(2, 3), Some(1));
    assert_eq!(matrix.proven_optimal_weeks_for(2, 2), Some(3));
    assert_eq!(matrix.proven_optimal_weeks_for(2, 3), Some(1));
    assert_eq!(matrix.proven_optimal_weeks_for(8, 4), Some(10));
    assert_eq!(matrix.optimality_lower_bound_weeks_for(8, 4), Some(10));
    assert_eq!(matrix.optimality_lower_bound_weeks_for(10, 10), Some(4));
}

#[test]
fn default_target_matrix_marks_scored_region_separately() {
    let matrix = load_default_target_matrix().expect("default target matrix should load");

    assert!(!matrix.is_scored_cell(1, 1));
    assert!(!matrix.is_scored_cell(1, 2));
    assert!(!matrix.is_scored_cell(2, 1));
    assert!(matrix.is_scored_cell(2, 2));
    assert!(matrix.is_scored_cell(10, 10));
}
