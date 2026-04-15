use crate::artifacts::{
    BaselineSnapshot, BenchmarkArtifactKind, BenchmarkSeedPolicy, CaseIdentityMetadata,
    CaseRunArtifact, CaseRunStatus, ClassRollup, ConstraintFamilyContribution,
    EffectiveBenchmarkBudget, RunMetadata, RunReport, RunSuiteMetadata, RunTotals,
    ScoreDecomposition, SearchTelemetryArtifact, SolveTimingBreakdown, SolverBenchmarkMetadata,
    SolverCapabilitiesSnapshot, WeightedConstraintBreakdown, BASELINE_SNAPSHOT_SCHEMA_VERSION,
    CASE_RUN_SCHEMA_VERSION, RUN_REPORT_SCHEMA_VERSION,
};
use crate::benchmark_mode::FULL_SOLVE_BENCHMARK_MODE;
use crate::hotpath::run_hotpath_case_artifact;
use crate::machine::{capture_git_identity, capture_machine_identity};
use crate::manifest::{
    load_suite_manifest, BenchmarkSearchPolicyOverride, BenchmarkSuiteClass, LoadedBenchmarkCase,
    LoadedBenchmarkSuite,
};
use crate::storage::{machine_identity_label, BenchmarkStorage};
use crate::validation::{
    validate_final_solution, validation_failure_summary, RecomputedScoreBreakdown,
};
use anyhow::{Context, Result};
use chrono::Utc;
use gm_core::models::{MoveFamilyBenchmarkTelemetrySummary, SolverConfiguration, SolverKind};
use gm_core::{default_solver_configuration_for, run_solver, solver_descriptor};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct RunnerOptions {
    pub artifacts_dir: PathBuf,
    pub cargo_profile: String,
}

impl Default for RunnerOptions {
    fn default() -> Self {
        Self {
            artifacts_dir: BenchmarkStorage::from_env_or_default().root().to_path_buf(),
            cargo_profile: std::env::var("PROFILE").unwrap_or_else(|_| "dev".to_string()),
        }
    }
}

pub fn run_suite_from_manifest(
    manifest_path: impl AsRef<Path>,
    options: &RunnerOptions,
) -> Result<RunReport> {
    let suite = load_suite_manifest(manifest_path)?;
    run_loaded_suite(&suite, options)
}

pub fn run_loaded_suite(
    suite: &LoadedBenchmarkSuite,
    options: &RunnerOptions,
) -> Result<RunReport> {
    let run_id = format!(
        "{}-{}-{}",
        suite.manifest.suite_id,
        Utc::now().format("%Y%m%dT%H%M%SZ"),
        &Uuid::new_v4().simple().to_string()[..8]
    );
    let generated_at = Utc::now().to_rfc3339();
    let git = capture_git_identity();
    let machine = capture_machine_identity(Some(&options.cargo_profile));

    let mut cases = Vec::with_capacity(suite.cases.len());
    for case in &suite.cases {
        cases.push(
            if suite.manifest.benchmark_mode == FULL_SOLVE_BENCHMARK_MODE {
                run_case(
                    &run_id,
                    &generated_at,
                    suite,
                    case,
                    git.clone(),
                    machine.clone(),
                )
            } else {
                run_hotpath_case_artifact(
                    &run_id,
                    &generated_at,
                    suite,
                    case,
                    git.clone(),
                    machine.clone(),
                )
            },
        );
    }

    let totals = build_totals(&cases);
    let class_rollups = build_class_rollups(&cases);

    Ok(RunReport {
        schema_version: RUN_REPORT_SCHEMA_VERSION,
        suite: RunSuiteMetadata {
            suite_id: suite.manifest.suite_id.clone(),
            benchmark_mode: suite.manifest.benchmark_mode.clone(),
            comparison_category: suite.manifest.comparison_category,
            solver_families: suite_solver_families(&cases),
            class: suite.manifest.class,
            title: suite.manifest.title.clone(),
            description: suite.manifest.description.clone(),
            manifest_path: suite.manifest_path.display().to_string(),
        },
        run: RunMetadata {
            run_id,
            generated_at,
            git,
            machine,
        },
        totals,
        class_rollups,
        cases,
    })
}

pub fn persist_run_report(report: &RunReport, artifacts_dir: impl AsRef<Path>) -> Result<PathBuf> {
    let storage = BenchmarkStorage::new(artifacts_dir.as_ref());
    storage.ensure_layout()?;
    storage.persist_machine_record(&report.run.machine, &report.run.generated_at)?;

    let run_dir = storage.run_dir(&report.run.run_id);
    let case_dir = run_dir.join("cases");
    fs::create_dir_all(&case_dir)
        .with_context(|| format!("failed to create benchmark run dir {}", run_dir.display()))?;

    let run_report_path = run_dir.join("run-report.json");
    write_json(&run_report_path, report)?;
    for case in &report.cases {
        let case_path = case_dir.join(format!("{}.json", sanitize_filename(&case.case_id)));
        write_json(&case_path, case)?;
    }

    Ok(run_report_path)
}

pub fn save_baseline_snapshot(
    report: &RunReport,
    baseline_name: &str,
    artifacts_dir: impl AsRef<Path>,
    source_run_path: Option<PathBuf>,
) -> Result<PathBuf> {
    let storage = BenchmarkStorage::new(artifacts_dir.as_ref());
    storage.ensure_layout()?;
    storage.persist_machine_record(&report.run.machine, &report.run.generated_at)?;

    let machine_id = machine_identity_label(&report.run.machine)
        .context("cannot save baseline without machine identity")?;
    let baseline_path =
        storage.baseline_snapshot_path(&machine_id, &report.suite.suite_id, baseline_name);

    let snapshot = BaselineSnapshot {
        schema_version: BASELINE_SNAPSHOT_SCHEMA_VERSION,
        baseline_name: baseline_name.to_string(),
        created_at: Utc::now().to_rfc3339(),
        source_run_path: source_run_path.map(|path| path.display().to_string()),
        run_report: report.clone(),
    };

    write_json(&baseline_path, &snapshot)?;
    Ok(baseline_path)
}

pub fn load_run_report(path: impl AsRef<Path>) -> Result<RunReport> {
    let path = path.as_ref();
    let contents = fs::read_to_string(path)
        .with_context(|| format!("failed to read run report {}", path.display()))?;
    let report: RunReport = serde_json::from_str(&contents)
        .with_context(|| format!("failed to parse run report {}", path.display()))?;
    Ok(report)
}

pub fn load_baseline_snapshot(path: impl AsRef<Path>) -> Result<BaselineSnapshot> {
    let path = path.as_ref();
    let contents = fs::read_to_string(path)
        .with_context(|| format!("failed to read baseline snapshot {}", path.display()))?;
    let snapshot: BaselineSnapshot = serde_json::from_str(&contents)
        .with_context(|| format!("failed to parse baseline snapshot {}", path.display()))?;
    Ok(snapshot)
}

fn run_case(
    run_id: &str,
    generated_at: &str,
    suite: &LoadedBenchmarkSuite,
    case: &LoadedBenchmarkCase,
    git: crate::artifacts::GitIdentity,
    machine: crate::artifacts::MachineIdentity,
) -> CaseRunArtifact {
    debug_assert_eq!(suite.manifest.benchmark_mode, FULL_SOLVE_BENCHMARK_MODE);
    let input = match apply_effective_overrides(suite, case) {
        Ok(input) => input,
        Err(error) => {
            let case_identity = build_case_identity_metadata(case);
            return CaseRunArtifact {
                schema_version: CASE_RUN_SCHEMA_VERSION,
                run_id: run_id.to_string(),
                generated_at: generated_at.to_string(),
                suite_id: suite.manifest.suite_id.clone(),
                benchmark_mode: suite.manifest.benchmark_mode.clone(),
                suite_class: suite.manifest.class,
                case_id: case.manifest.id.clone(),
                case_class: case.manifest.class,
                case_manifest_path: case.manifest_path.display().to_string(),
                case_identity: Some(case_identity),
                case_title: case.manifest.title.clone(),
                case_description: case.manifest.description.clone(),
                tags: case.manifest.tags.clone(),
                git,
                machine,
                solver: SolverBenchmarkMetadata {
                    solver_family: canonical_solver_family_for_error(case),
                    solver_config_id: case
                        .manifest
                        .input
                        .as_ref()
                        .map(|input| input.solver.solver_type.clone())
                        .unwrap_or_default(),
                    display_name: "invalid benchmark policy".to_string(),
                    seed_policy: BenchmarkSeedPolicy::NotApplicable,
                    capabilities: SolverCapabilitiesSnapshot::default(),
                },
                effective_seed: None,
                effective_budget: EffectiveBenchmarkBudget::default(),
                artifact_kind: BenchmarkArtifactKind::FullSolve,
                effective_move_policy: None,
                stop_reason: None,
                status: CaseRunStatus::SolverError,
                error_message: Some(error.to_string()),
                runtime_seconds: 0.0,
                timing: SolveTimingBreakdown::default(),
                initial_score: None,
                final_score: None,
                best_score: None,
                iteration_count: None,
                no_improvement_count: None,
                unique_contacts: None,
                weighted_repetition_penalty: None,
                weighted_constraint_penalty: None,
                score_decomposition: None,
                search_telemetry: None,
                moves: MoveFamilyBenchmarkTelemetrySummary::default(),
                hotpath_metrics: None,
                external_validation: None,
            };
        }
    };
    let case_identity = build_case_identity_metadata(case);
    let effective_budget = EffectiveBenchmarkBudget {
        max_iterations: input.solver.stop_conditions.max_iterations,
        time_limit_seconds: input.solver.stop_conditions.time_limit_seconds,
        no_improvement_iterations: input.solver.stop_conditions.no_improvement_iterations,
    };
    let solver_metadata = build_solver_metadata(&input);

    let wall_start = Instant::now();
    match run_solver(&input) {
        Ok(result) => {
            let telemetry = result.benchmark_telemetry.clone();
            let timing = telemetry
                .as_ref()
                .map(|telemetry| SolveTimingBreakdown {
                    initialization_seconds: telemetry.initialization_seconds,
                    search_seconds: telemetry.search_seconds,
                    finalization_seconds: telemetry.finalization_seconds,
                    total_seconds: telemetry.total_seconds,
                })
                .unwrap_or_else(|| SolveTimingBreakdown {
                    total_seconds: wall_start.elapsed().as_secs_f64(),
                    ..Default::default()
                });
            let moves = telemetry
                .as_ref()
                .map(|telemetry| telemetry.moves.clone())
                .unwrap_or_default();
            let search_telemetry = telemetry.as_ref().map(|telemetry| SearchTelemetryArtifact {
                accepted_uphill_moves: telemetry.accepted_uphill_moves,
                accepted_downhill_moves: telemetry.accepted_downhill_moves,
                accepted_neutral_moves: telemetry.accepted_neutral_moves,
                max_no_improvement_streak: telemetry.max_no_improvement_streak,
                restart_count: telemetry.restart_count,
                perturbation_count: telemetry.perturbation_count,
                iterations_per_second: telemetry.iterations_per_second,
                best_score_timeline: telemetry.best_score_timeline.clone(),
                repeat_guided_swaps: telemetry.repeat_guided_swaps.clone(),
                sgp_week_pair_tabu: telemetry.sgp_week_pair_tabu.clone(),
                memetic: telemetry.memetic.clone(),
                donor_session_transplant: telemetry.donor_session_transplant.clone(),
                session_aligned_path_relinking: telemetry.session_aligned_path_relinking.clone(),
                multi_root_balanced_session_inheritance: telemetry
                    .multi_root_balanced_session_inheritance
                    .clone(),
                solver4_paper_trace: telemetry.solver4_paper_trace.clone(),
            });
            let validation = validate_final_solution(&input, &result);
            let score_decomposition =
                build_score_decomposition(&input, &result, validation.recomputed.as_ref());
            let validation_error = (!validation.validation_passed).then(|| {
                format!(
                    "external final-solution validation failed: {}",
                    validation_failure_summary(&validation)
                )
            });

            CaseRunArtifact {
                schema_version: CASE_RUN_SCHEMA_VERSION,
                run_id: run_id.to_string(),
                generated_at: generated_at.to_string(),
                suite_id: suite.manifest.suite_id.clone(),
                benchmark_mode: suite.manifest.benchmark_mode.clone(),
                suite_class: suite.manifest.class,
                case_id: case.manifest.id.clone(),
                case_class: case.manifest.class,
                case_manifest_path: case.manifest_path.display().to_string(),
                case_identity: Some(case_identity.clone()),
                case_title: case.manifest.title.clone(),
                case_description: case.manifest.description.clone(),
                tags: case.manifest.tags.clone(),
                git,
                machine,
                solver: solver_metadata.clone(),
                effective_seed: result.effective_seed.or(input.solver.seed),
                effective_budget,
                artifact_kind: BenchmarkArtifactKind::FullSolve,
                effective_move_policy: result.move_policy.or(input.solver.move_policy.clone()),
                stop_reason: result.stop_reason,
                status: if validation_error.is_some() {
                    CaseRunStatus::SolverError
                } else {
                    CaseRunStatus::Success
                },
                error_message: validation_error,
                runtime_seconds: timing.total_seconds,
                timing,
                initial_score: telemetry.as_ref().map(|telemetry| telemetry.initial_score),
                final_score: Some(result.final_score),
                best_score: telemetry.as_ref().map(|telemetry| telemetry.best_score),
                iteration_count: telemetry
                    .as_ref()
                    .map(|telemetry| telemetry.iterations_completed),
                no_improvement_count: Some(result.no_improvement_count),
                unique_contacts: Some(result.unique_contacts),
                weighted_repetition_penalty: Some(result.weighted_repetition_penalty),
                weighted_constraint_penalty: Some(result.weighted_constraint_penalty),
                score_decomposition: Some(score_decomposition),
                search_telemetry,
                moves,
                hotpath_metrics: None,
                external_validation: Some(validation),
            }
        }
        Err(error) => CaseRunArtifact {
            schema_version: CASE_RUN_SCHEMA_VERSION,
            run_id: run_id.to_string(),
            generated_at: generated_at.to_string(),
            suite_id: suite.manifest.suite_id.clone(),
            benchmark_mode: suite.manifest.benchmark_mode.clone(),
            suite_class: suite.manifest.class,
            case_id: case.manifest.id.clone(),
            case_class: case.manifest.class,
            case_manifest_path: case.manifest_path.display().to_string(),
            case_identity: Some(case_identity),
            case_title: case.manifest.title.clone(),
            case_description: case.manifest.description.clone(),
            tags: case.manifest.tags.clone(),
            git,
            machine,
            solver: solver_metadata,
            effective_seed: input.solver.seed,
            effective_budget,
            artifact_kind: BenchmarkArtifactKind::FullSolve,
            effective_move_policy: input.solver.move_policy.clone(),
            stop_reason: None,
            status: CaseRunStatus::SolverError,
            error_message: Some(error.to_string()),
            runtime_seconds: wall_start.elapsed().as_secs_f64(),
            timing: SolveTimingBreakdown {
                total_seconds: wall_start.elapsed().as_secs_f64(),
                ..Default::default()
            },
            initial_score: None,
            final_score: None,
            best_score: None,
            iteration_count: None,
            no_improvement_count: None,
            unique_contacts: None,
            weighted_repetition_penalty: None,
            weighted_constraint_penalty: None,
            score_decomposition: None,
            search_telemetry: None,
            moves: MoveFamilyBenchmarkTelemetrySummary::default(),
            hotpath_metrics: None,
            external_validation: None,
        },
    }
}

fn build_score_decomposition(
    input: &gm_core::models::ApiInput,
    result: &gm_core::models::SolverResult,
    recomputed: Option<&RecomputedScoreBreakdown>,
) -> ScoreDecomposition {
    let unique_contact_weight = input
        .objectives
        .iter()
        .find(|objective| objective.r#type == "maximize_unique_contacts")
        .map(|objective| objective.weight)
        .unwrap_or(0.0);

    let weighted_constraint_total = recomputed
        .map(|snapshot| snapshot.weighted_constraint_penalty)
        .unwrap_or(result.weighted_constraint_penalty);
    let weighted_constraint_breakdown = recomputed
        .map(|snapshot| {
            build_weighted_constraint_breakdown(input, snapshot, weighted_constraint_total)
        })
        .unwrap_or(WeightedConstraintBreakdown {
            residual_weighted_penalty: weighted_constraint_total,
            ..WeightedConstraintBreakdown::default()
        });

    ScoreDecomposition {
        total_score: result.final_score,
        baseline_score: recomputed
            .map(|snapshot| snapshot.baseline_score)
            .unwrap_or(0.0),
        unique_contacts: result.unique_contacts,
        unique_contact_weight,
        unique_contact_term: -(result.unique_contacts as f64 * unique_contact_weight),
        repetition_penalty: result.repetition_penalty,
        repetition_term: result.weighted_repetition_penalty,
        attribute_balance_term: recomputed
            .map(|snapshot| snapshot.attribute_balance_penalty)
            .unwrap_or(result.attribute_balance_penalty as f64),
        weighted_constraint_total,
        weighted_constraint_breakdown,
    }
}

fn build_weighted_constraint_breakdown(
    input: &gm_core::models::ApiInput,
    recomputed: &RecomputedScoreBreakdown,
    weighted_constraint_total: f64,
) -> WeightedConstraintBreakdown {
    let forbidden_weights: Vec<f64> = input
        .constraints
        .iter()
        .filter_map(|constraint| match constraint {
            gm_core::models::Constraint::ShouldNotBeTogether { penalty_weight, .. } => {
                Some(*penalty_weight)
            }
            _ => None,
        })
        .collect();
    let should_together_weights: Vec<f64> = input
        .constraints
        .iter()
        .filter_map(|constraint| match constraint {
            gm_core::models::Constraint::ShouldStayTogether { penalty_weight, .. } => {
                Some(*penalty_weight)
            }
            _ => None,
        })
        .collect();
    let pair_meeting_constraints: Vec<&gm_core::models::PairMeetingCountParams> = input
        .constraints
        .iter()
        .filter_map(|constraint| match constraint {
            gm_core::models::Constraint::PairMeetingCount(params) => Some(params),
            _ => None,
        })
        .collect();

    let forbidden_raw = recomputed.forbidden_pair_violations.iter().sum::<i32>();
    let forbidden_weighted =
        weighted_sum(&recomputed.forbidden_pair_violations, &forbidden_weights);

    let should_together_raw = recomputed.should_together_violations.iter().sum::<i32>();
    let should_together_weighted = weighted_sum(
        &recomputed.should_together_violations,
        &should_together_weights,
    );

    let mut pair_meeting_raw = 0i32;
    let mut pair_meeting_weighted = 0.0;
    for (idx, params) in pair_meeting_constraints.iter().enumerate() {
        let meetings = recomputed
            .pair_meeting_counts
            .get(idx)
            .copied()
            .unwrap_or_default() as i32;
        let target = params.target_meetings as i32;
        let raw_violation = match params.mode {
            gm_core::models::PairMeetingMode::AtLeast => (target - meetings).max(0),
            gm_core::models::PairMeetingMode::Exact => (meetings - target).abs(),
            gm_core::models::PairMeetingMode::AtMost => (meetings - target).max(0),
        };
        pair_meeting_raw += raw_violation;
        pair_meeting_weighted += raw_violation as f64 * params.penalty_weight;
    }

    let clique_raw = recomputed.clique_violations.iter().sum::<i32>();
    let clique_weighted = 0.0;

    let immovable_raw = recomputed.immovable_violations;
    let immovable_weighted = immovable_raw as f64 * 1000.0;

    let accounted_weighted = forbidden_weighted
        + should_together_weighted
        + pair_meeting_weighted
        + clique_weighted
        + immovable_weighted;

    WeightedConstraintBreakdown {
        forbidden_pair: ConstraintFamilyContribution {
            weighted_penalty: forbidden_weighted,
            raw_violations: forbidden_raw,
        },
        should_stay_together: ConstraintFamilyContribution {
            weighted_penalty: should_together_weighted,
            raw_violations: should_together_raw,
        },
        pair_meeting_count: ConstraintFamilyContribution {
            weighted_penalty: pair_meeting_weighted,
            raw_violations: pair_meeting_raw,
        },
        clique: ConstraintFamilyContribution {
            weighted_penalty: clique_weighted,
            raw_violations: clique_raw,
        },
        immovable: ConstraintFamilyContribution {
            weighted_penalty: immovable_weighted,
            raw_violations: immovable_raw,
        },
        residual_weighted_penalty: weighted_constraint_total - accounted_weighted,
    }
}

fn weighted_sum(violations: &[i32], weights: &[f64]) -> f64 {
    violations
        .iter()
        .enumerate()
        .map(|(idx, violations)| *violations as f64 * weights.get(idx).copied().unwrap_or(0.0))
        .sum()
}

fn apply_effective_overrides(
    suite: &LoadedBenchmarkSuite,
    case: &LoadedBenchmarkCase,
) -> Result<gm_core::models::ApiInput> {
    let mut input = case
        .manifest
        .input
        .clone()
        .context("full-solve benchmark cases require input")?;

    if let Some(default_solver) = suite.manifest.default_solver.clone() {
        input.solver = default_solver;
    }

    if let Some(case_solver) = case.overrides.solver.clone() {
        input.solver = case_solver;
    }

    if let Some(target_solver_kind) = effective_solver_kind_override(suite, case) {
        input = retarget_input_for_solver_kind(&input, target_solver_kind);
    }

    input.solver.seed = case
        .overrides
        .seed
        .or(suite.manifest.default_seed)
        .or(input.solver.seed);

    if let Some(max_iterations) = case
        .overrides
        .max_iterations
        .or(suite.manifest.default_max_iterations)
    {
        input.solver.stop_conditions.max_iterations = Some(max_iterations);
    }

    if let Some(time_limit_seconds) = case
        .overrides
        .time_limit_seconds
        .or(suite.manifest.default_time_limit_seconds)
    {
        input.solver.stop_conditions.time_limit_seconds = Some(time_limit_seconds);
    }

    if let Some(move_policy) = case
        .overrides
        .move_policy
        .clone()
        .or_else(|| suite.manifest.default_move_policy.clone())
    {
        input.solver.move_policy = Some(move_policy);
    }

    if let Some(search_policy) = suite.manifest.default_search_policy.as_ref() {
        apply_search_policy_override(&mut input, search_policy)?;
    }

    if let Some(search_policy) = case.overrides.search_policy.as_ref() {
        apply_search_policy_override(&mut input, search_policy)?;
    }

    input.solver.stop_conditions.stop_on_optimal_score = false;

    Ok(input)
}

fn apply_search_policy_override(
    input: &mut gm_core::models::ApiInput,
    search_policy: &BenchmarkSearchPolicyOverride,
) -> Result<()> {
    match search_policy.no_improvement_iterations {
        crate::manifest::NullableU64Override::Inherit => {}
        crate::manifest::NullableU64Override::Clear => {
            input.solver.stop_conditions.no_improvement_iterations = None;
        }
        crate::manifest::NullableU64Override::Value(value) => {
            input.solver.stop_conditions.no_improvement_iterations = Some(value);
        }
    }

    if let Some(simulated_annealing) = search_policy.simulated_annealing.as_ref() {
        let params = match &mut input.solver.solver_params {
            gm_core::models::SolverParams::SimulatedAnnealing(params) => params,
            _ => anyhow::bail!(
                "search_policy.simulated_annealing requires a simulated annealing solver input, found {}",
                input.solver.solver_type
            ),
        };

        if let Some(initial_temperature) = simulated_annealing.initial_temperature {
            params.initial_temperature = initial_temperature;
        }
        if let Some(final_temperature) = simulated_annealing.final_temperature {
            params.final_temperature = final_temperature;
        }
        if let Some(cooling_schedule) = simulated_annealing.cooling_schedule.as_ref() {
            params.cooling_schedule = cooling_schedule.clone();
        }
        if let Some(reheat_cycles) = simulated_annealing.reheat_cycles {
            params.reheat_cycles = Some(reheat_cycles);
        }
        if let Some(reheat_after_no_improvement) = simulated_annealing.reheat_after_no_improvement {
            params.reheat_after_no_improvement = Some(reheat_after_no_improvement);
        }
    }

    Ok(())
}

fn canonical_solver_family_for_error(case: &LoadedBenchmarkCase) -> String {
    case.manifest
        .input
        .as_ref()
        .and_then(|input| input.solver.validate_solver_selection().ok())
        .map(|kind| kind.canonical_id().to_string())
        .or_else(|| case.manifest.solver_family.clone())
        .unwrap_or_else(|| "unknown".to_string())
}

fn effective_solver_kind_override(
    suite: &LoadedBenchmarkSuite,
    case: &LoadedBenchmarkCase,
) -> Option<SolverKind> {
    case.overrides
        .solver_family
        .as_deref()
        .or(suite.manifest.default_solver_family.as_deref())
        .map(|solver_family| {
            SolverKind::parse_config_id(solver_family)
                .expect("benchmark suite solver family overrides should validate before use")
        })
}

fn retarget_input_for_solver_kind(
    input: &gm_core::models::ApiInput,
    solver_kind: SolverKind,
) -> gm_core::models::ApiInput {
    let mut retargeted = input.clone();
    let current_kind = input
        .solver
        .validate_solver_selection()
        .expect("benchmark inputs should carry valid solver selection");

    if current_kind == solver_kind {
        retargeted.solver.solver_type = solver_kind.canonical_id().to_string();
        return retargeted;
    }

    let mut replacement: SolverConfiguration = default_solver_configuration_for(solver_kind);
    replacement.stop_conditions = input.solver.stop_conditions.clone();
    replacement.logging = input.solver.logging.clone();
    replacement.telemetry = input.solver.telemetry.clone();
    replacement.seed = input.solver.seed;
    replacement.move_policy = input.solver.move_policy.clone();
    replacement.allowed_sessions = input.solver.allowed_sessions.clone();
    retargeted.solver = replacement;
    retargeted
}

fn build_totals(cases: &[CaseRunArtifact]) -> RunTotals {
    RunTotals {
        total_cases: cases.len(),
        successful_cases: cases
            .iter()
            .filter(|case| case.status == CaseRunStatus::Success)
            .count(),
        failed_cases: cases
            .iter()
            .filter(|case| case.status != CaseRunStatus::Success)
            .count(),
        total_runtime_seconds: cases.iter().map(|case| case.runtime_seconds).sum(),
    }
}

fn build_class_rollups(cases: &[CaseRunArtifact]) -> Vec<ClassRollup> {
    let mut grouped: BTreeMap<BenchmarkSuiteClass, Vec<&CaseRunArtifact>> = BTreeMap::new();
    for case in cases {
        grouped.entry(case.case_class).or_default().push(case);
    }

    grouped
        .into_iter()
        .map(|(class, group)| {
            let total_cases = group.len();
            let successful_cases = group
                .iter()
                .filter(|case| case.status == CaseRunStatus::Success)
                .count();
            let failed_cases = total_cases.saturating_sub(successful_cases);
            let total_runtime_seconds: f64 = group.iter().map(|case| case.runtime_seconds).sum();
            let average_runtime_seconds = if total_cases == 0 {
                0.0
            } else {
                total_runtime_seconds / total_cases as f64
            };
            let final_scores: Vec<f64> = group.iter().filter_map(|case| case.final_score).collect();
            let best_scores: Vec<f64> = group.iter().filter_map(|case| case.best_score).collect();

            ClassRollup {
                class,
                total_cases,
                successful_cases,
                failed_cases,
                total_runtime_seconds,
                average_runtime_seconds,
                average_final_score: average(&final_scores),
                average_best_score: average(&best_scores),
            }
        })
        .collect()
}

fn average(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        None
    } else {
        Some(values.iter().sum::<f64>() / values.len() as f64)
    }
}

fn build_solver_metadata(input: &gm_core::models::ApiInput) -> SolverBenchmarkMetadata {
    let kind = input
        .solver
        .validate_solver_selection()
        .expect("benchmark inputs should carry valid solver selection");
    let descriptor = solver_descriptor(kind);

    SolverBenchmarkMetadata {
        solver_family: kind.canonical_id().to_string(),
        solver_config_id: input.solver.solver_type.clone(),
        display_name: descriptor.display_name.to_string(),
        seed_policy: if input.solver.seed.is_some() {
            BenchmarkSeedPolicy::Explicit
        } else {
            BenchmarkSeedPolicy::RuntimeGenerated
        },
        capabilities: SolverCapabilitiesSnapshot {
            supports_initial_schedule: descriptor.capabilities.supports_initial_schedule,
            supports_progress_callback: descriptor.capabilities.supports_progress_callback,
            supports_benchmark_observer: descriptor.capabilities.supports_benchmark_observer,
            supports_recommended_settings: descriptor.capabilities.supports_recommended_settings,
            supports_deterministic_seed: descriptor.capabilities.supports_deterministic_seed,
        },
    }
}

pub(crate) fn build_solver_metadata_for_kind(
    kind: SolverKind,
    solver_config_id: &str,
    seed_policy: BenchmarkSeedPolicy,
) -> SolverBenchmarkMetadata {
    let descriptor = solver_descriptor(kind);
    SolverBenchmarkMetadata {
        solver_family: kind.canonical_id().to_string(),
        solver_config_id: solver_config_id.to_string(),
        display_name: descriptor.display_name.to_string(),
        seed_policy,
        capabilities: SolverCapabilitiesSnapshot {
            supports_initial_schedule: descriptor.capabilities.supports_initial_schedule,
            supports_progress_callback: descriptor.capabilities.supports_progress_callback,
            supports_benchmark_observer: descriptor.capabilities.supports_benchmark_observer,
            supports_recommended_settings: descriptor.capabilities.supports_recommended_settings,
            supports_deterministic_seed: descriptor.capabilities.supports_deterministic_seed,
        },
    }
}

pub(crate) fn build_case_identity_metadata(case: &LoadedBenchmarkCase) -> CaseIdentityMetadata {
    let case_role = case.overrides.case_role.unwrap_or(case.manifest.case_role);
    let canonical_case_id = if case_role.is_canonical() {
        case.manifest.id.clone()
    } else {
        case.overrides
            .canonical_case_id
            .clone()
            .or_else(|| case.manifest.canonical_case_id.clone())
            .unwrap_or_else(|| case.manifest.id.clone())
    };

    let purpose = case
        .overrides
        .purpose
        .as_deref()
        .or(case.manifest.purpose.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let provenance = case
        .overrides
        .provenance
        .as_deref()
        .or(case.manifest.provenance.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let purpose_provenance_summary = match (purpose, provenance) {
        (Some(purpose), Some(provenance)) => {
            Some(format!("purpose: {purpose}; provenance: {provenance}"))
        }
        (Some(purpose), None) => Some(format!("purpose: {purpose}")),
        (None, Some(provenance)) => Some(format!("provenance: {provenance}")),
        (None, None) => None,
    };

    CaseIdentityMetadata {
        source_path: case.source_path.clone(),
        canonical_case_id,
        case_role,
        source_fingerprint: case.source_fingerprint.clone(),
        purpose_provenance_summary,
        declared_budget: case
            .overrides
            .declared_budget
            .clone()
            .or_else(|| case.manifest.declared_budget.clone()),
    }
}

fn suite_solver_families(cases: &[CaseRunArtifact]) -> Vec<String> {
    let mut families: Vec<String> = cases
        .iter()
        .map(|case| case.solver.solver_family.clone())
        .collect();
    families.sort();
    families.dedup();
    families
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create benchmark dir {}", parent.display()))?;
    }
    let contents =
        serde_json::to_string_pretty(value).context("failed to serialize benchmark artifact")?;
    fs::write(path, contents)
        .with_context(|| format!("failed to write benchmark artifact {}", path.display()))
}

fn sanitize_filename(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => ch,
            _ => '_',
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn path_suite_runs_and_persists_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };

        let report =
            run_suite_from_manifest("suites/path.yaml", &options).expect("path suite should run");
        assert_eq!(report.suite.suite_id, "path");
        assert_eq!(
            report.suite.comparison_category,
            crate::artifacts::BenchmarkComparisonCategory::InvariantOnly
        );
        assert_eq!(report.suite.solver_families, vec!["solver1".to_string()]);
        assert!(report.totals.total_cases >= 5);
        assert_eq!(report.totals.failed_cases, 0);
        assert!(report
            .cases
            .iter()
            .all(|case| case.solver.solver_family == "solver1"));
        assert!(report.cases.iter().all(|case| {
            case.case_identity.as_ref().is_some_and(|identity| {
                identity.canonical_case_id == case.case_id
                    && identity.source_fingerprint.starts_with("sha256:")
            })
        }));
        assert!(report.cases.iter().all(|case| {
            case.external_validation
                .as_ref()
                .is_some_and(|validation| validation.validation_passed)
        }));
        assert!(report.cases.iter().all(|case| {
            case.score_decomposition
                .as_ref()
                .is_some_and(|decomposition| {
                    (decomposition.total_score - case.final_score.unwrap_or_default()).abs() < 1e-6
                        && (decomposition.weighted_constraint_total
                            - (decomposition
                                .weighted_constraint_breakdown
                                .forbidden_pair
                                .weighted_penalty
                                + decomposition
                                    .weighted_constraint_breakdown
                                    .should_stay_together
                                    .weighted_penalty
                                + decomposition
                                    .weighted_constraint_breakdown
                                    .pair_meeting_count
                                    .weighted_penalty
                                + decomposition
                                    .weighted_constraint_breakdown
                                    .clique
                                    .weighted_penalty
                                + decomposition
                                    .weighted_constraint_breakdown
                                    .immovable
                                    .weighted_penalty
                                + decomposition
                                    .weighted_constraint_breakdown
                                    .residual_weighted_penalty))
                            .abs()
                            < 1e-6
                })
        }));

        let run_path =
            persist_run_report(&report, &options.artifacts_dir).expect("persist run report");
        assert!(run_path.exists());

        let baseline_path = save_baseline_snapshot(
            &report,
            "path-baseline",
            &options.artifacts_dir,
            Some(run_path.clone()),
        )
        .expect("save baseline");
        assert!(baseline_path.exists());

        let reloaded = load_run_report(&run_path).expect("reload run report");
        assert_eq!(reloaded.run.run_id, report.run.run_id);
        let baseline = load_baseline_snapshot(&baseline_path).expect("reload baseline");
        assert_eq!(baseline.baseline_name, "path-baseline");
        assert_eq!(baseline.run_report.run.run_id, report.run.run_id);
    }

    #[test]
    fn full_solve_suite_can_retarget_cases_to_solver2() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest("suites/path-solver2.yaml", &options)
            .expect("solver2 path suite should run");

        assert_eq!(report.suite.suite_id, "path-solver2");
        assert_eq!(report.suite.solver_families, vec!["solver2".to_string()]);
        assert_eq!(report.totals.failed_cases, 0);
        assert!(report
            .cases
            .iter()
            .all(|case| case.solver.solver_family == "solver2"));
        assert!(report
            .cases
            .iter()
            .all(|case| case.solver.solver_config_id == "solver2"));
        assert!(report.cases.iter().all(|case| {
            case.external_validation
                .as_ref()
                .is_some_and(|validation| validation.validation_passed)
        }));
        assert!(report.cases.iter().all(|case| {
            case.search_telemetry
                .as_ref()
                .is_some_and(|telemetry| !telemetry.best_score_timeline.is_empty())
        }));
    }

    #[test]
    fn full_solve_suite_can_retarget_cases_to_solver3() {
        let temp = TempDir::new().expect("temp dir");
        let options = RunnerOptions {
            artifacts_dir: temp.path().to_path_buf(),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest("suites/path-solver3.yaml", &options)
            .expect("solver3 path suite should run");

        assert_eq!(report.suite.suite_id, "path-solver3");
        assert_eq!(report.suite.solver_families, vec!["solver3".to_string()]);
        assert_eq!(report.totals.failed_cases, 0);
        assert!(report
            .cases
            .iter()
            .all(|case| case.solver.solver_family == "solver3"));
        assert!(report
            .cases
            .iter()
            .all(|case| case.solver.solver_config_id == "solver3"));
        assert!(report.cases.iter().all(|case| {
            case.external_validation
                .as_ref()
                .is_some_and(|validation| validation.validation_passed)
        }));
        assert!(report.cases.iter().all(|case| {
            case.search_telemetry
                .as_ref()
                .is_some_and(|telemetry| !telemetry.best_score_timeline.is_empty())
        }));
    }

    #[test]
    fn full_solve_suite_can_apply_explicit_solver_overrides() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/stretch");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("tiny_real_demo_case.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "stretch.tiny-real-demo-case",
                "class": "stretch",
                "title": "Tiny real demo case",
                "description": "Small solve case used to validate suite-level solver overrides.",
                "input": {
                    "initial_schedule": null,
                    "problem": {
                        "people": [
                            { "id": "p0", "attributes": { "role": "eng" } },
                            { "id": "p1", "attributes": { "role": "eng" } },
                            { "id": "p2", "attributes": { "role": "design" } },
                            { "id": "p3", "attributes": { "role": "design" } }
                        ],
                        "groups": [
                            { "id": "g0", "size": 2 },
                            { "id": "g1", "size": 2 }
                        ],
                        "num_sessions": 2
                    },
                    "constraints": [
                        {
                            "type": "AttributeBalance",
                            "group_id": "g0",
                            "attribute_key": "role",
                            "desired_values": { "eng": 1, "design": 1 },
                            "penalty_weight": 5.0,
                            "mode": "exact"
                        }
                    ],
                    "solver": {
                        "solver_type": "SimulatedAnnealing",
                        "stop_conditions": {
                            "max_iterations": 10,
                            "time_limit_seconds": null,
                            "no_improvement_iterations": null
                        },
                        "solver_params": {
                            "solver_type": "SimulatedAnnealing",
                            "initial_temperature": 1.0,
                            "final_temperature": 0.01,
                            "cooling_schedule": "geometric",
                            "reheat_after_no_improvement": 0,
                            "reheat_cycles": 0
                        },
                        "logging": {},
                        "telemetry": {},
                        "seed": 5,
                        "move_policy": null,
                        "allowed_sessions": null
                    }
                }
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("suite-with-explicit-solver.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: suite-with-explicit-solver",
                "benchmark_mode: full_solve",
                "comparison_category: score_quality",
                "class: stretch",
                "default_solver_family: solver1",
                "default_solver:",
                "  solver_type: SimulatedAnnealing",
                "  stop_conditions:",
                "    max_iterations: 12",
                "    time_limit_seconds: null",
                "    no_improvement_iterations: 6",
                "  solver_params:",
                "    solver_type: SimulatedAnnealing",
                "    initial_temperature: 2.5",
                "    final_temperature: 0.02",
                "    cooling_schedule: geometric",
                "    reheat_after_no_improvement: 3",
                "    reheat_cycles: 1",
                "  logging: {}",
                "  telemetry: {}",
                "  seed: 17",
                "  move_policy:",
                "    mode: weighted",
                "    allowed_families: [swap, transfer, clique_swap]",
                "    forced_family: null",
                "    weights:",
                "      swap: 0.5",
                "      transfer: 1.0",
                "      clique_swap: 2.0",
                "  allowed_sessions: null",
                "cases:",
                "  - manifest: ../cases/stretch/tiny_real_demo_case.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let suite = load_suite_manifest(&suite_path).expect("suite should load");
        let effective =
            apply_effective_overrides(&suite, &suite.cases[0]).expect("effective overrides");
        let params = effective
            .solver
            .solver_params
            .simulated_annealing_params()
            .expect("solver1 params");

        assert_eq!(effective.solver.seed, Some(17));
        assert_eq!(effective.solver.stop_conditions.max_iterations, Some(12));
        assert_eq!(
            effective.solver.stop_conditions.no_improvement_iterations,
            Some(6)
        );
        assert_eq!(params.initial_temperature, 2.5);
        assert_eq!(params.final_temperature, 0.02);
        assert_eq!(params.reheat_cycles, Some(1));
        assert_eq!(
            effective
                .solver
                .move_policy
                .as_ref()
                .expect("weighted move policy")
                .mode,
            gm_core::models::MoveSelectionMode::Weighted
        );
    }

    #[test]
    fn full_solve_suite_can_apply_search_policy_without_replacing_benchmark_contract() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/stretch");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("tiny_search_policy_case.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "stretch.tiny-search-policy-case",
                "class": "stretch",
                "title": "Tiny search policy case",
                "description": "Small solve case used to validate search-policy overrides.",
                "input": {
                    "initial_schedule": null,
                    "problem": {
                        "people": [
                            { "id": "p0", "attributes": {} },
                            { "id": "p1", "attributes": {} },
                            { "id": "p2", "attributes": {} },
                            { "id": "p3", "attributes": {} }
                        ],
                        "groups": [
                            { "id": "g0", "size": 2 },
                            { "id": "g1", "size": 2 }
                        ],
                        "num_sessions": 2
                    },
                    "constraints": [],
                    "objectives": [{ "type": "maximize_unique_contacts", "weight": 1.0 }],
                    "solver": {
                        "solver_type": "SimulatedAnnealing",
                        "stop_conditions": {
                            "max_iterations": 60,
                            "time_limit_seconds": null,
                            "no_improvement_iterations": 20
                        },
                        "solver_params": {
                            "solver_type": "SimulatedAnnealing",
                            "initial_temperature": 1.0,
                            "final_temperature": 0.01,
                            "cooling_schedule": "geometric",
                            "reheat_after_no_improvement": 5,
                            "reheat_cycles": 1
                        },
                        "logging": {},
                        "telemetry": {},
                        "seed": 5,
                        "move_policy": null,
                        "allowed_sessions": null
                    }
                }
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("suite-with-search-policy.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: suite-with-search-policy",
                "benchmark_mode: full_solve",
                "comparison_category: score_quality",
                "class: stretch",
                "default_seed: 77",
                "default_max_iterations: 8000",
                "default_time_limit_seconds: 3",
                "default_search_policy:",
                "  simulated_annealing:",
                "    final_temperature: 0.05",
                "cases:",
                "  - manifest: ../cases/stretch/tiny_search_policy_case.json",
                "    search_policy:",
                "      no_improvement_iterations: null",
                "      simulated_annealing:",
                "        initial_temperature: 9.0",
                "        reheat_after_no_improvement: 0",
                "        reheat_cycles: 0",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let suite = load_suite_manifest(&suite_path).expect("suite should load");
        let effective =
            apply_effective_overrides(&suite, &suite.cases[0]).expect("effective overrides");
        let params = effective
            .solver
            .solver_params
            .simulated_annealing_params()
            .expect("solver1 params");

        assert_eq!(effective.solver.seed, Some(77));
        assert_eq!(effective.solver.stop_conditions.max_iterations, Some(8000));
        assert_eq!(effective.solver.stop_conditions.time_limit_seconds, Some(3));
        assert_eq!(
            effective.solver.stop_conditions.no_improvement_iterations,
            None
        );
        assert_eq!(params.initial_temperature, 9.0);
        assert_eq!(params.final_temperature, 0.05);
        assert_eq!(params.reheat_after_no_improvement, Some(0));
        assert_eq!(params.reheat_cycles, Some(0));
        assert_eq!(effective.solver.solver_type, "SimulatedAnnealing");
    }

    #[test]
    fn search_policy_simulated_annealing_overrides_fail_on_non_sa_solver_inputs() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/stretch");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("tiny_solver3_case.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "stretch.tiny-solver3-case",
                "class": "stretch",
                "title": "Tiny solver3 case",
                "description": "Small solve case used to validate search-policy guardrails.",
                "input": {
                    "initial_schedule": null,
                    "problem": {
                        "people": [
                            { "id": "p0", "attributes": {} },
                            { "id": "p1", "attributes": {} }
                        ],
                        "groups": [{ "id": "g0", "size": 2 }],
                        "num_sessions": 1
                    },
                    "constraints": [],
                    "objectives": [{ "type": "maximize_unique_contacts", "weight": 1.0 }],
                    "solver": {
                        "solver_type": "solver3",
                        "stop_conditions": {
                            "max_iterations": 5,
                            "time_limit_seconds": null,
                            "no_improvement_iterations": null
                        },
                        "solver_params": {
                            "solver_type": "solver3",
                            "correctness_lane": {
                                "enabled": false,
                                "sample_every_accepted_moves": 16
                            }
                        },
                        "logging": {},
                        "telemetry": {},
                        "seed": 3,
                        "move_policy": null,
                        "allowed_sessions": null
                    }
                }
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("suite-with-invalid-search-policy.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: suite-with-invalid-search-policy",
                "benchmark_mode: full_solve",
                "comparison_category: score_quality",
                "class: stretch",
                "cases:",
                "  - manifest: ../cases/stretch/tiny_solver3_case.json",
                "    search_policy:",
                "      simulated_annealing:",
                "        initial_temperature: 4.0",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let suite = load_suite_manifest(&suite_path).expect("suite should load");
        let error = apply_effective_overrides(&suite, &suite.cases[0])
            .expect_err("search policy should be rejected for solver3 input");

        assert!(error.to_string().contains(
            "search_policy.simulated_annealing requires a simulated annealing solver input"
        ));
    }

    #[test]
    fn hotpath_suite_runs_and_persists_structured_metrics() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("swap_preview.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.swap-preview.default",
                "class": "representative",
                "solver_family": "solver1",
                "title": "Hotpath swap preview",
                "description": "Deterministic swap preview kernel run",
                "tags": ["hotpath", "swap", "preview"],
                "hotpath_preset": "swap_default"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-swap-preview.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-swap-preview",
                "benchmark_mode: swap_preview",
                "class: representative",
                "default_iterations: 8",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/swap_preview.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report =
            run_suite_from_manifest(&suite_path, &options).expect("hotpath suite should run");
        assert_eq!(report.suite.benchmark_mode, "swap_preview");
        assert_eq!(
            report.suite.comparison_category,
            crate::artifacts::BenchmarkComparisonCategory::PerformanceOnly
        );
        assert_eq!(report.totals.total_cases, 1);
        assert_eq!(
            report.cases[0].artifact_kind,
            BenchmarkArtifactKind::HotPath
        );
        assert_eq!(report.cases[0].solver.solver_family, "solver1");
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "swap_preview");
        assert_eq!(metrics.preset.as_deref(), Some("swap_default"));
        assert_eq!(metrics.iterations, 8);
        assert!(metrics.preview_seconds > 0.0);

        let run_path =
            persist_run_report(&report, &options.artifacts_dir).expect("persist run report");
        let reloaded = load_run_report(&run_path).expect("reload run report");
        assert_eq!(reloaded.suite.benchmark_mode, "swap_preview");
        assert_eq!(
            reloaded.cases[0].artifact_kind,
            BenchmarkArtifactKind::HotPath
        );
    }

    #[test]
    fn hotpath_suite_runs_solver2_swap_preview_with_shared_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("swap_preview_solver2_supported.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.swap-preview.solver2.supported",
                "class": "representative",
                "solver_family": "solver2",
                "title": "Hotpath swap preview for solver2",
                "description": "Supported solver2 swap preview hotpath lane",
                "tags": ["hotpath", "swap", "preview", "solver2"],
                "hotpath_preset": "swap_default_solver2"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-swap-preview-solver2-supported.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-swap-preview-solver2-supported",
                "benchmark_mode: swap_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/swap_preview_solver2_supported.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("solver2 hotpath suite should run successfully");
        assert_eq!(report.suite.solver_families, vec!["solver2".to_string()]);
        assert_eq!(report.totals.total_cases, 1);
        assert_eq!(report.totals.successful_cases, 1);
        assert_eq!(
            report.cases[0].artifact_kind,
            BenchmarkArtifactKind::HotPath
        );
        assert_eq!(report.cases[0].solver.solver_family, "solver2");
        assert_eq!(report.cases[0].status, CaseRunStatus::Success);
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "swap_preview");
        assert_eq!(metrics.preset.as_deref(), Some("swap_default_solver2"));
        assert!(metrics.preview_seconds > 0.0);
    }

    #[test]
    fn hotpath_suite_runs_solver3_swap_preview_with_shared_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("swap_preview_solver3_supported.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.swap-preview.solver3.supported",
                "class": "representative",
                "solver_family": "solver3",
                "title": "Hotpath swap preview for solver3",
                "description": "Supported solver3 swap preview hotpath lane",
                "tags": ["hotpath", "swap", "preview", "solver3"],
                "hotpath_preset": "swap_default_solver3"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-swap-preview-solver3-supported.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-swap-preview-solver3-supported",
                "benchmark_mode: swap_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/swap_preview_solver3_supported.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("solver3 hotpath suite should run successfully");
        assert_eq!(report.suite.solver_families, vec!["solver3".to_string()]);
        assert_eq!(report.totals.total_cases, 1);
        assert_eq!(report.totals.successful_cases, 1);
        assert_eq!(
            report.cases[0].artifact_kind,
            BenchmarkArtifactKind::HotPath
        );
        assert_eq!(report.cases[0].solver.solver_family, "solver3");
        assert_eq!(report.cases[0].status, CaseRunStatus::Success);
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "swap_preview");
        assert_eq!(metrics.preset.as_deref(), Some("swap_default_solver3"));
        assert!(metrics.preview_seconds > 0.0);
    }

    #[test]
    fn hotpath_suite_runs_solver2_transfer_preview_with_shared_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("transfer_preview_solver2_supported.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.transfer-preview.solver2.supported",
                "class": "representative",
                "solver_family": "solver2",
                "title": "Hotpath transfer preview for solver2",
                "description": "Supported solver2 transfer preview hotpath lane",
                "tags": ["hotpath", "transfer", "preview", "solver2"],
                "hotpath_preset": "transfer_default_solver2"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-transfer-preview-solver2-supported.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-transfer-preview-solver2-supported",
                "benchmark_mode: transfer_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/transfer_preview_solver2_supported.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("solver2 transfer hotpath suite should run successfully");
        assert_eq!(report.suite.solver_families, vec!["solver2".to_string()]);
        assert_eq!(report.totals.successful_cases, 1);
        assert_eq!(report.cases[0].solver.solver_family, "solver2");
        assert_eq!(report.cases[0].status, CaseRunStatus::Success);
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "transfer_preview");
        assert_eq!(metrics.preset.as_deref(), Some("transfer_default_solver2"));
        assert!(metrics.preview_seconds > 0.0);
    }

    #[test]
    fn hotpath_suite_runs_solver3_transfer_preview_with_shared_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("transfer_preview_solver3_supported.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.transfer-preview.solver3.supported",
                "class": "representative",
                "solver_family": "solver3",
                "title": "Hotpath transfer preview for solver3",
                "description": "Supported solver3 transfer preview hotpath lane",
                "tags": ["hotpath", "transfer", "preview", "solver3"],
                "hotpath_preset": "transfer_default_solver3"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-transfer-preview-solver3-supported.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-transfer-preview-solver3-supported",
                "benchmark_mode: transfer_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/transfer_preview_solver3_supported.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("solver3 transfer hotpath suite should run successfully");
        assert_eq!(report.suite.solver_families, vec!["solver3".to_string()]);
        assert_eq!(report.totals.successful_cases, 1);
        assert_eq!(report.cases[0].solver.solver_family, "solver3");
        assert_eq!(report.cases[0].status, CaseRunStatus::Success);
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "transfer_preview");
        assert_eq!(metrics.preset.as_deref(), Some("transfer_default_solver3"));
        assert!(metrics.preview_seconds > 0.0);
    }

    #[test]
    fn hotpath_suite_runs_solver2_clique_swap_preview_with_shared_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("clique_swap_preview_solver2_supported.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.clique-swap-preview.solver2.supported",
                "class": "representative",
                "solver_family": "solver2",
                "title": "Hotpath clique swap preview for solver2",
                "description": "Supported solver2 clique swap preview hotpath lane",
                "tags": ["hotpath", "clique_swap", "preview", "solver2"],
                "hotpath_preset": "clique_swap_default_solver2"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-clique-swap-preview-solver2-supported.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-clique-swap-preview-solver2-supported",
                "benchmark_mode: clique_swap_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/clique_swap_preview_solver2_supported.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("solver2 clique swap hotpath suite should run successfully");
        assert_eq!(report.suite.solver_families, vec!["solver2".to_string()]);
        assert_eq!(report.totals.successful_cases, 1);
        assert_eq!(report.cases[0].solver.solver_family, "solver2");
        assert_eq!(report.cases[0].status, CaseRunStatus::Success);
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "clique_swap_preview");
        assert_eq!(
            metrics.preset.as_deref(),
            Some("clique_swap_default_solver2")
        );
        assert!(metrics.preview_seconds > 0.0);
    }

    #[test]
    fn hotpath_suite_runs_solver3_clique_swap_preview_with_shared_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("clique_swap_preview_solver3_supported.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.clique-swap-preview.solver3.supported",
                "class": "representative",
                "solver_family": "solver3",
                "title": "Hotpath clique swap preview for solver3",
                "description": "Supported solver3 clique swap preview hotpath lane",
                "tags": ["hotpath", "clique_swap", "preview", "solver3"],
                "hotpath_preset": "clique_swap_default_solver3"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-clique-swap-preview-solver3-supported.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-clique-swap-preview-solver3-supported",
                "benchmark_mode: clique_swap_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/clique_swap_preview_solver3_supported.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("solver3 clique swap hotpath suite should run successfully");
        assert_eq!(report.suite.solver_families, vec!["solver3".to_string()]);
        assert_eq!(report.totals.successful_cases, 1);
        assert_eq!(report.cases[0].solver.solver_family, "solver3");
        assert_eq!(report.cases[0].status, CaseRunStatus::Success);
        let metrics = report.cases[0]
            .hotpath_metrics
            .as_ref()
            .expect("hotpath metrics should exist");
        assert_eq!(metrics.benchmark_mode, "clique_swap_preview");
        assert_eq!(
            metrics.preset.as_deref(),
            Some("clique_swap_default_solver3")
        );
        assert!(metrics.preview_seconds > 0.0);
    }

    #[test]
    fn hotpath_suite_keeps_shared_artifact_flow_for_unimplemented_solver_family_probes() {
        let temp = TempDir::new().expect("temp dir");
        let suite_dir = temp.path().join("backend/benchmarking/suites");
        let case_dir = temp.path().join("backend/benchmarking/cases/hotpath");
        fs::create_dir_all(&suite_dir).expect("mk suite dir");
        fs::create_dir_all(&case_dir).expect("mk case dir");

        let case_path = case_dir.join("swap_preview_solver2.json");
        fs::write(
            &case_path,
            serde_json::to_string_pretty(&json!({
                "schema_version": 1,
                "id": "hotpath.swap-preview.solver2",
                "class": "representative",
                "solver_family": "solver2",
                "title": "Hotpath swap preview for solver2",
                "description": "Bootstrapped solver2 hotpath lane",
                "tags": ["hotpath", "swap", "preview", "solver2"],
                "hotpath_preset": "swap_default"
            }))
            .expect("serialize case"),
        )
        .expect("write case");

        let suite_path = suite_dir.join("hotpath-swap-preview-solver2.yaml");
        fs::write(
            &suite_path,
            [
                "schema_version: 1",
                "suite_id: hotpath-swap-preview-solver2",
                "benchmark_mode: swap_preview",
                "class: representative",
                "default_iterations: 4",
                "default_warmup_iterations: 1",
                "cases:",
                "  - manifest: ../cases/hotpath/swap_preview_solver2.json",
            ]
            .join("\n"),
        )
        .expect("write suite");

        let options = RunnerOptions {
            artifacts_dir: temp.path().join("artifacts"),
            cargo_profile: "test".to_string(),
        };

        let report = run_suite_from_manifest(&suite_path, &options)
            .expect("runner should still produce a shared run report");
        assert_eq!(report.suite.solver_families, vec!["solver2".to_string()]);
        assert_eq!(report.totals.total_cases, 1);
        assert_eq!(report.totals.failed_cases, 1);
        assert_eq!(
            report.cases[0].artifact_kind,
            BenchmarkArtifactKind::HotPath
        );
        assert_eq!(report.cases[0].solver.solver_family, "solver2");
        assert_eq!(report.cases[0].status, CaseRunStatus::SolverError);
        assert!(report.cases[0]
            .error_message
            .as_deref()
            .is_some_and(|message| {
                message.contains("solver2") && message.contains("not implemented")
            }));
    }
}
