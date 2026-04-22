use super::catalog::{
    synthesize_catalog_artifact_for_input, Solver6SeedCatalogManifest,
    SOLVER6_SEED_CATALOG_SCHEMA_VERSION, SOLVER6_SEED_POLICY_VERSION,
};
use super::SearchEngine;
use crate::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
    Solver6PairRepeatPenaltyModel, Solver6Params, Solver6SearchStrategy,
    Solver6SeedCatalogMissPolicy, Solver6SeedCatalogParams, Solver6SeedStrategy,
    SolverConfiguration, SolverKind, SolverParams, StopConditions,
};
use std::collections::HashMap;
use std::fs;

fn solver6_config() -> SolverConfiguration {
    SolverConfiguration {
        solver_type: SolverKind::Solver6.canonical_id().into(),
        stop_conditions: StopConditions {
            max_iterations: Some(1_000_000),
            time_limit_seconds: Some(30),
            no_improvement_iterations: Some(100_000),
            stop_on_optimal_score: true,
        },
        solver_params: SolverParams::Solver6(Solver6Params::default()),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: Some(7),
        move_policy: None,
        allowed_sessions: None,
    }
}

fn pure_input(groups: usize, group_size: usize, weeks: usize) -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: (0..(groups * group_size))
                .map(|idx| Person {
                    id: format!("p{idx}"),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
            groups: (0..groups)
                .map(|idx| Group {
                    id: format!("g{idx}"),
                    size: group_size as u32,
                    session_sizes: None,
                })
                .collect(),
            num_sessions: weeks as u32,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "squared".into(),
            penalty_weight: 100.0,
        })],
        solver: solver6_config(),
    }
}

#[test]
fn solver6_hands_exact_cells_through_solver5_scaffold() {
    let input = pure_input(2, 2, 3);
    let result = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect("solver6 scaffold should hand exact cells through solver5");

    assert_eq!(result.final_score, 0.0);
    assert_eq!(result.schedule.len(), 3);
}

#[test]
fn solver6_reports_reserved_pipeline_for_non_exact_cells() {
    let input = pure_input(8, 4, 20);
    let err = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect_err("solver6 scaffold should fail honestly once exact handoff ends");
    let message = err.to_string();
    assert!(message.contains("seeded repeat-minimization pipeline is still scaffold-only"));
    assert!(message.contains("solver5_exact_then_reserved_hybrid"));
    assert!(message.contains("linear_repeat_excess"));
}

#[test]
fn solver6_exact_block_search_returns_an_impossible_case_result() {
    let mut input = pure_input(8, 4, 20);
    input.solver.solver_params = SolverParams::Solver6(Solver6Params {
        exact_construction_handoff_enabled: false,
        seed_strategy: Solver6SeedStrategy::Solver5ExactBlockComposition,
        pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        search_strategy: Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
        seed_catalog: None,
    });

    let result = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect("solver6 should now return a searched exact-block result");
    assert_eq!(result.schedule.len(), 20);
    assert_eq!(result.unique_contacts, 496);
    assert!(result.repetition_penalty > 0);
    assert!(result.final_score > 0.0);
}

#[test]
fn solver6_exact_block_search_supports_non_linear_objective_modes() {
    let mut input = pure_input(8, 4, 20);
    input.solver.solver_params = SolverParams::Solver6(Solver6Params {
        exact_construction_handoff_enabled: false,
        seed_strategy: Solver6SeedStrategy::Solver5ExactBlockComposition,
        pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::TriangularRepeatExcess,
        search_strategy: Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
        seed_catalog: None,
    });

    let result = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect("solver6 should solve through the triangular deterministic hill-climb path");
    assert_eq!(result.schedule.len(), 20);
    assert!(result.repetition_penalty > 0);
}

#[test]
fn solver6_exact_block_search_handles_non_multiple_horizons_via_mixed_seeds() {
    let mut input = pure_input(8, 3, 21);
    input.solver.stop_conditions.max_iterations = Some(60);
    input.solver.stop_conditions.no_improvement_iterations = Some(20);
    input.solver.solver_params = SolverParams::Solver6(Solver6Params {
        exact_construction_handoff_enabled: false,
        seed_strategy: Solver6SeedStrategy::Solver5ExactBlockComposition,
        pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        search_strategy: Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
        seed_catalog: None,
    });

    let result = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect("solver6 should support non-multiple horizons through mixed-tail seed selection");

    assert_eq!(result.schedule.len(), 21);
    assert!(result.repetition_penalty > 0);
    assert!(result.final_score > 0.0);
}

#[test]
fn solver6_catalog_miss_with_error_policy_fails_explicitly() {
    let manifest_dir =
        std::env::temp_dir().join(format!("solver6-catalog-miss-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&manifest_dir).expect("temp dir should exist");
    let manifest_path = manifest_dir.join("manifest.json");
    let manifest = Solver6SeedCatalogManifest {
        schema_version: SOLVER6_SEED_CATALOG_SCHEMA_VERSION,
        generated_by: "test".into(),
        seed_policy_version: SOLVER6_SEED_POLICY_VERSION.into(),
        configured_threshold_micros: 100_000,
        entries: Vec::new(),
    };
    fs::write(
        &manifest_path,
        serde_json::to_vec(&manifest).expect("manifest should serialize"),
    )
    .expect("manifest should write");

    let mut input = pure_input(8, 4, 20);
    input.solver.solver_params = SolverParams::Solver6(Solver6Params {
        exact_construction_handoff_enabled: false,
        seed_strategy: Solver6SeedStrategy::Solver5ExactBlockComposition,
        pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        search_strategy: Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
        seed_catalog: Some(Solver6SeedCatalogParams {
            manifest_path: manifest_path.to_string_lossy().into_owned(),
            miss_policy: Solver6SeedCatalogMissPolicy::Error,
        }),
    });

    let err = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect_err("catalog miss should fail explicitly under error policy");
    assert!(err.to_string().contains("seed catalog miss"));
}

#[test]
fn solver6_catalog_miss_can_fall_back_to_live_seed() {
    let manifest_dir =
        std::env::temp_dir().join(format!("solver6-catalog-fallback-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&manifest_dir).expect("temp dir should exist");
    let manifest_path = manifest_dir.join("manifest.json");
    let manifest = Solver6SeedCatalogManifest {
        schema_version: SOLVER6_SEED_CATALOG_SCHEMA_VERSION,
        generated_by: "test".into(),
        seed_policy_version: SOLVER6_SEED_POLICY_VERSION.into(),
        configured_threshold_micros: 100_000,
        entries: Vec::new(),
    };
    fs::write(
        &manifest_path,
        serde_json::to_vec(&manifest).expect("manifest should serialize"),
    )
    .expect("manifest should write");

    let mut input = pure_input(8, 4, 20);
    input.solver.solver_params = SolverParams::Solver6(Solver6Params {
        exact_construction_handoff_enabled: false,
        seed_strategy: Solver6SeedStrategy::Solver5ExactBlockComposition,
        pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        search_strategy: Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
        seed_catalog: Some(Solver6SeedCatalogParams {
            manifest_path: manifest_path.to_string_lossy().into_owned(),
            miss_policy: Solver6SeedCatalogMissPolicy::FallBackToLiveSeed,
        }),
    });

    let result = SearchEngine::new(&input.solver)
        .solve(&input)
        .expect("fallback policy should continue with live seed synthesis");
    assert_eq!(result.schedule.len(), 20);
}

#[test]
fn solver6_can_load_a_matching_catalog_seed() {
    let mut input = pure_input(8, 4, 20);
    input.solver.solver_params = SolverParams::Solver6(Solver6Params {
        exact_construction_handoff_enabled: false,
        seed_strategy: Solver6SeedStrategy::Solver5ExactBlockComposition,
        pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        search_strategy: Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
        seed_catalog: None,
    });
    let (manifest_entry, entry) = synthesize_catalog_artifact_for_input(&input, 0.0, None)
        .expect("catalog artifact should synthesize");

    let manifest_dir =
        std::env::temp_dir().join(format!("solver6-catalog-hit-{}", uuid::Uuid::new_v4()));
    let entry_path = manifest_dir.join(&manifest_entry.relative_entry_path);
    fs::create_dir_all(entry_path.parent().expect("entry parent"))
        .expect("entry parent should exist");
    fs::write(
        &entry_path,
        serde_json::to_vec(&entry).expect("entry should serialize"),
    )
    .expect("entry should write");
    let manifest = Solver6SeedCatalogManifest {
        schema_version: SOLVER6_SEED_CATALOG_SCHEMA_VERSION,
        generated_by: "test".into(),
        seed_policy_version: SOLVER6_SEED_POLICY_VERSION.into(),
        configured_threshold_micros: 0,
        entries: vec![manifest_entry],
    };
    let manifest_path = manifest_dir.join("manifest.json");
    fs::write(
        &manifest_path,
        serde_json::to_vec(&manifest).expect("manifest should serialize"),
    )
    .expect("manifest should write");

    let mut catalog_input = pure_input(8, 4, 20);
    catalog_input.solver.solver_params = SolverParams::Solver6(Solver6Params {
        exact_construction_handoff_enabled: false,
        seed_strategy: Solver6SeedStrategy::Solver5ExactBlockComposition,
        pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
        search_strategy: Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
        seed_catalog: Some(Solver6SeedCatalogParams {
            manifest_path: manifest_path.to_string_lossy().into_owned(),
            miss_policy: Solver6SeedCatalogMissPolicy::Error,
        }),
    });

    let result = SearchEngine::new(&catalog_input.solver)
        .solve(&catalog_input)
        .expect("matching catalog artifact should seed solver6 successfully");
    assert_eq!(result.schedule.len(), 20);
}
