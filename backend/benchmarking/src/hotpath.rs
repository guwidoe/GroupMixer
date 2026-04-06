use crate::artifacts::{
    BenchmarkArtifactKind, BenchmarkSeedPolicy, CaseRunArtifact, CaseRunStatus,
    EffectiveBenchmarkBudget, HotPathMetrics, SolveTimingBreakdown, CASE_RUN_SCHEMA_VERSION,
};
use crate::benchmark_mode::{
    CLIQUE_SWAP_APPLY_BENCHMARK_MODE, CLIQUE_SWAP_PREVIEW_BENCHMARK_MODE,
    CONSTRUCTION_BENCHMARK_MODE, FULL_RECALCULATION_BENCHMARK_MODE,
    SEARCH_ITERATION_BENCHMARK_MODE, SWAP_APPLY_BENCHMARK_MODE, SWAP_PREVIEW_BENCHMARK_MODE,
    TRANSFER_APPLY_BENCHMARK_MODE, TRANSFER_PREVIEW_BENCHMARK_MODE,
};
use crate::hotpath_inputs::{
    clique_swap_bench_input, construction_bench_input, search_loop_bench_input,
    solver2_clique_swap_bench_input, solver2_swap_bench_input, solver2_transfer_bench_input,
    solver3_clique_swap_bench_input, solver3_swap_bench_input, solver3_transfer_bench_input,
    swap_bench_input, transfer_bench_input, SearchLoopBenchState,
};
use crate::manifest::{
    canonical_solver_family_for_case, LoadedBenchmarkCase, LoadedBenchmarkSuite,
};
use crate::runner::{build_case_identity_metadata, build_solver_metadata_for_kind};
use gm_core::models::{MoveFamilyBenchmarkTelemetrySummary, SolverKind};
use gm_core::solver1::search::simulated_annealing::SimulatedAnnealing;
use gm_core::solver1::search::Solver;
use gm_core::solver2::moves::clique_swap::{
    apply_clique_swap_runtime_preview as apply_solver2_clique_swap_runtime_preview,
    preview_clique_swap_runtime_lightweight,
};
use gm_core::solver2::moves::swap::{
    apply_swap_runtime_with_score as apply_solver2_swap_runtime_with_score, preview_swap_runtime,
};
use gm_core::solver2::moves::transfer::{
    apply_transfer_runtime_preview as apply_solver2_transfer_runtime_preview,
    preview_transfer_runtime_lightweight,
};
use gm_core::solver3::moves::clique_swap::{
    apply_clique_swap_runtime_preview as apply_solver3_clique_swap_runtime_preview,
    preview_clique_swap_runtime_lightweight as preview_solver3_clique_swap_runtime_lightweight,
};
use gm_core::solver3::moves::swap::{
    apply_swap_runtime_preview as apply_solver3_swap_runtime_preview,
    preview_swap_runtime_lightweight as preview_solver3_swap_runtime_lightweight,
};
use gm_core::solver3::moves::transfer::{
    apply_transfer_runtime_preview as apply_solver3_transfer_runtime_preview,
    preview_transfer_runtime_lightweight as preview_solver3_transfer_runtime_lightweight,
};
use gm_core::solver3::SearchEngine as Solver3SearchEngine;
use std::hint::black_box;
use std::time::Instant;

struct HotPathExecutionContext {
    metrics: HotPathMetrics,
    effective_seed: Option<u64>,
    effective_budget: EffectiveBenchmarkBudget,
    effective_move_policy: Option<gm_core::models::MovePolicy>,
}

pub fn run_hotpath_case_artifact(
    run_id: &str,
    generated_at: &str,
    suite: &LoadedBenchmarkSuite,
    case: &LoadedBenchmarkCase,
    git: crate::artifacts::GitIdentity,
    machine: crate::artifacts::MachineIdentity,
) -> CaseRunArtifact {
    let solver_kind = hotpath_solver_kind(case)
        .expect("loaded hotpath cases should declare a valid solver family");
    let case_identity = build_case_identity_metadata(case);
    match run_hotpath_case(suite, case) {
        Ok(execution) => {
            let runtime_seconds =
                execution.metrics.setup_seconds + execution.metrics.measurement_seconds;
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
                solver: build_solver_metadata_for_kind(
                    solver_kind,
                    solver_kind.canonical_id(),
                    BenchmarkSeedPolicy::NotApplicable,
                ),
                effective_seed: execution.effective_seed,
                effective_budget: execution.effective_budget,
                artifact_kind: BenchmarkArtifactKind::HotPath,
                effective_move_policy: execution.effective_move_policy,
                stop_reason: None,
                status: CaseRunStatus::Success,
                error_message: None,
                timing: SolveTimingBreakdown {
                    total_seconds: runtime_seconds,
                    ..Default::default()
                },
                runtime_seconds,
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
                hotpath_metrics: Some(execution.metrics),
                external_validation: None,
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
            solver: build_solver_metadata_for_kind(
                solver_kind,
                solver_kind.canonical_id(),
                BenchmarkSeedPolicy::NotApplicable,
            ),
            effective_seed: None,
            effective_budget: EffectiveBenchmarkBudget::default(),
            artifact_kind: BenchmarkArtifactKind::HotPath,
            effective_move_policy: None,
            stop_reason: None,
            status: CaseRunStatus::SolverError,
            error_message: Some(error),
            timing: SolveTimingBreakdown::default(),
            runtime_seconds: 0.0,
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

fn run_hotpath_case(
    suite: &LoadedBenchmarkSuite,
    case: &LoadedBenchmarkCase,
) -> Result<HotPathExecutionContext, String> {
    let preset = case.manifest.hotpath_preset.clone().ok_or_else(|| {
        format!(
            "hotpath case {} is missing hotpath_preset",
            case.manifest.id
        )
    })?;
    let solver_kind = hotpath_solver_kind(case)?;

    match solver_kind {
        SolverKind::Solver1 => run_solver1_hotpath_case(suite, case, preset),
        SolverKind::Solver2 => run_solver2_hotpath_case(suite, case, preset),
        SolverKind::Solver3 => run_solver3_hotpath_case(suite, case, preset),
    }
}

fn hotpath_solver_kind(case: &LoadedBenchmarkCase) -> Result<SolverKind, String> {
    let solver_family = canonical_solver_family_for_case(&case.manifest).map_err(|error| {
        format!(
            "hotpath case {} has invalid solver family metadata: {error}",
            case.manifest.id
        )
    })?;
    SolverKind::parse_config_id(&solver_family).map_err(|error| {
        format!(
            "hotpath case {} has invalid solver family '{}': {}",
            case.manifest.id, solver_family, error
        )
    })
}

fn run_solver2_hotpath_case(
    suite: &LoadedBenchmarkSuite,
    case: &LoadedBenchmarkCase,
    preset: String,
) -> Result<HotPathExecutionContext, String> {
    let benchmark_mode = suite.manifest.benchmark_mode.as_str();
    let iterations = case
        .overrides
        .iterations
        .or(suite.manifest.default_iterations)
        .unwrap_or(match benchmark_mode {
            SEARCH_ITERATION_BENCHMARK_MODE => 8,
            _ => 64,
        });
    let warmup_iterations = case
        .overrides
        .warmup_iterations
        .or(suite.manifest.default_warmup_iterations)
        .unwrap_or(4);

    let prepared_started = Instant::now();

    let (metrics, effective_seed, effective_budget, effective_move_policy) = match benchmark_mode {
        SWAP_PREVIEW_BENCHMARK_MODE => {
            let input = solver2_swap_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver2.canonical_id()
                )
            })?;
            for _ in 0..warmup_iterations {
                let preview = preview_swap_runtime(&input.state, &input.swap)
                    .map_err(|error| error.to_string())?;
                black_box(preview.delta_cost);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut preview_seconds = 0.0;
            for _ in 0..iterations {
                let op_started = Instant::now();
                let preview = preview_swap_runtime(&input.state, &input.swap)
                    .map_err(|error| error.to_string())?;
                preview_seconds += op_started.elapsed().as_secs_f64();
                checksum = checksum.wrapping_add(black_box(preview.delta_cost.to_bits() as i64));
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds,
                    apply_seconds: 0.0,
                    full_recalculation_seconds: 0.0,
                    search_seconds: 0.0,
                },
                input.input.solver.seed,
                EffectiveBenchmarkBudget::default(),
                input.input.solver.move_policy.clone(),
            )
        }
        SWAP_APPLY_BENCHMARK_MODE => {
            let input = solver2_swap_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver2.canonical_id()
                )
            })?;
            let preview = preview_swap_runtime(&input.state, &input.swap)
                .map_err(|error| error.to_string())?;
            for _ in 0..warmup_iterations {
                let mut state = input.state.clone();
                apply_solver2_swap_runtime_with_score(
                    &mut state,
                    &input.swap,
                    &preview.after_score,
                )
                .map_err(|error| error.to_string())?;
                black_box(state.current_score.total_score);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut apply_seconds = 0.0;
            for _ in 0..iterations {
                let mut state = input.state.clone();
                let op_started = Instant::now();
                apply_solver2_swap_runtime_with_score(
                    &mut state,
                    &input.swap,
                    &preview.after_score,
                )
                .map_err(|error| error.to_string())?;
                apply_seconds += op_started.elapsed().as_secs_f64();
                checksum = checksum
                    .wrapping_add(black_box(state.current_score.total_score.to_bits() as i64));
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds: 0.0,
                    apply_seconds,
                    full_recalculation_seconds: 0.0,
                    search_seconds: 0.0,
                },
                input.input.solver.seed,
                EffectiveBenchmarkBudget::default(),
                input.input.solver.move_policy.clone(),
            )
        }
        TRANSFER_PREVIEW_BENCHMARK_MODE => {
            let input = solver2_transfer_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver2.canonical_id()
                )
            })?;
            for _ in 0..warmup_iterations {
                let preview = preview_transfer_runtime_lightweight(&input.state, &input.transfer)
                    .map_err(|error| error.to_string())?;
                black_box(preview.delta_cost);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut preview_seconds = 0.0;
            for _ in 0..iterations {
                let op_started = Instant::now();
                let preview = preview_transfer_runtime_lightweight(&input.state, &input.transfer)
                    .map_err(|error| error.to_string())?;
                preview_seconds += op_started.elapsed().as_secs_f64();
                checksum = checksum.wrapping_add(black_box(preview.delta_cost.to_bits() as i64));
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds,
                    apply_seconds: 0.0,
                    full_recalculation_seconds: 0.0,
                    search_seconds: 0.0,
                },
                input.input.solver.seed,
                EffectiveBenchmarkBudget::default(),
                input.input.solver.move_policy.clone(),
            )
        }
        TRANSFER_APPLY_BENCHMARK_MODE => {
            let input = solver2_transfer_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver2.canonical_id()
                )
            })?;
            let preview = preview_transfer_runtime_lightweight(&input.state, &input.transfer)
                .map_err(|error| error.to_string())?;
            for _ in 0..warmup_iterations {
                let mut state = input.state.clone();
                apply_solver2_transfer_runtime_preview(&mut state, &preview)
                    .map_err(|error| error.to_string())?;
                black_box(state.current_score.total_score);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut apply_seconds = 0.0;
            for _ in 0..iterations {
                let mut state = input.state.clone();
                let op_started = Instant::now();
                apply_solver2_transfer_runtime_preview(&mut state, &preview)
                    .map_err(|error| error.to_string())?;
                apply_seconds += op_started.elapsed().as_secs_f64();
                checksum = checksum
                    .wrapping_add(black_box(state.current_score.total_score.to_bits() as i64));
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds: 0.0,
                    apply_seconds,
                    full_recalculation_seconds: 0.0,
                    search_seconds: 0.0,
                },
                input.input.solver.seed,
                EffectiveBenchmarkBudget::default(),
                input.input.solver.move_policy.clone(),
            )
        }
        CLIQUE_SWAP_PREVIEW_BENCHMARK_MODE => {
            let input = solver2_clique_swap_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver2.canonical_id()
                )
            })?;
            for _ in 0..warmup_iterations {
                let preview =
                    preview_clique_swap_runtime_lightweight(&input.state, &input.clique_swap)
                        .map_err(|error| error.to_string())?;
                black_box(preview.delta_cost);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut preview_seconds = 0.0;
            for _ in 0..iterations {
                let op_started = Instant::now();
                let preview =
                    preview_clique_swap_runtime_lightweight(&input.state, &input.clique_swap)
                        .map_err(|error| error.to_string())?;
                preview_seconds += op_started.elapsed().as_secs_f64();
                checksum = checksum.wrapping_add(black_box(preview.delta_cost.to_bits() as i64));
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds,
                    apply_seconds: 0.0,
                    full_recalculation_seconds: 0.0,
                    search_seconds: 0.0,
                },
                input.input.solver.seed,
                EffectiveBenchmarkBudget::default(),
                input.input.solver.move_policy.clone(),
            )
        }
        CLIQUE_SWAP_APPLY_BENCHMARK_MODE => {
            let input = solver2_clique_swap_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver2.canonical_id()
                )
            })?;
            let preview = preview_clique_swap_runtime_lightweight(&input.state, &input.clique_swap)
                .map_err(|error| error.to_string())?;
            for _ in 0..warmup_iterations {
                let mut state = input.state.clone();
                apply_solver2_clique_swap_runtime_preview(&mut state, &preview)
                    .map_err(|error| error.to_string())?;
                black_box(state.current_score.total_score);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut apply_seconds = 0.0;
            for _ in 0..iterations {
                let mut state = input.state.clone();
                let op_started = Instant::now();
                apply_solver2_clique_swap_runtime_preview(&mut state, &preview)
                    .map_err(|error| error.to_string())?;
                apply_seconds += op_started.elapsed().as_secs_f64();
                checksum = checksum
                    .wrapping_add(black_box(state.current_score.total_score.to_bits() as i64));
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds: 0.0,
                    apply_seconds,
                    full_recalculation_seconds: 0.0,
                    search_seconds: 0.0,
                },
                input.input.solver.seed,
                EffectiveBenchmarkBudget::default(),
                input.input.solver.move_policy.clone(),
            )
        }
        _ => {
            return Err(format!(
                "hotpath probe '{}' for solver family '{}' is not implemented yet",
                benchmark_mode,
                SolverKind::Solver2.canonical_id()
            ));
        }
    };

    Ok(HotPathExecutionContext {
        metrics: HotPathMetrics {
            setup_seconds: prepared_started.elapsed().as_secs_f64(),
            ..metrics
        },
        effective_seed,
        effective_budget,
        effective_move_policy,
    })
}

fn run_solver3_hotpath_case(
    suite: &LoadedBenchmarkSuite,
    case: &LoadedBenchmarkCase,
    preset: String,
) -> Result<HotPathExecutionContext, String> {
    let benchmark_mode = suite.manifest.benchmark_mode.as_str();
    let iterations = case
        .overrides
        .iterations
        .or(suite.manifest.default_iterations)
        .unwrap_or(64);
    let warmup_iterations = case
        .overrides
        .warmup_iterations
        .or(suite.manifest.default_warmup_iterations)
        .unwrap_or(4);

    let prepared_started = Instant::now();

    let (metrics, effective_seed, effective_budget, effective_move_policy) = match benchmark_mode {
        SWAP_PREVIEW_BENCHMARK_MODE => {
            let input = solver3_swap_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver3.canonical_id()
                )
            })?;
            for _ in 0..warmup_iterations {
                let preview = preview_solver3_swap_runtime_lightweight(&input.state, &input.swap)
                    .map_err(|error| error.to_string())?;
                black_box(preview.delta_score);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut preview_seconds = 0.0;
            for _ in 0..iterations {
                let op_started = Instant::now();
                let preview = preview_solver3_swap_runtime_lightweight(&input.state, &input.swap)
                    .map_err(|error| error.to_string())?;
                preview_seconds += op_started.elapsed().as_secs_f64();
                checksum = checksum.wrapping_add(black_box(preview.delta_score.to_bits() as i64));
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds,
                    apply_seconds: 0.0,
                    full_recalculation_seconds: 0.0,
                    search_seconds: 0.0,
                },
                input.input.solver.seed,
                EffectiveBenchmarkBudget::default(),
                input.input.solver.move_policy.clone(),
            )
        }
        SWAP_APPLY_BENCHMARK_MODE => {
            let input = solver3_swap_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver3.canonical_id()
                )
            })?;
            let preview = preview_solver3_swap_runtime_lightweight(&input.state, &input.swap)
                .map_err(|error| error.to_string())?;
            for _ in 0..warmup_iterations {
                let mut state = input.state.clone();
                apply_solver3_swap_runtime_preview(&mut state, &preview)
                    .map_err(|error| error.to_string())?;
                black_box(state.total_score);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut apply_seconds = 0.0;
            for _ in 0..iterations {
                let mut state = input.state.clone();
                let op_started = Instant::now();
                apply_solver3_swap_runtime_preview(&mut state, &preview)
                    .map_err(|error| error.to_string())?;
                apply_seconds += op_started.elapsed().as_secs_f64();
                checksum = checksum.wrapping_add(black_box(state.total_score.to_bits() as i64));
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds: 0.0,
                    apply_seconds,
                    full_recalculation_seconds: 0.0,
                    search_seconds: 0.0,
                },
                input.input.solver.seed,
                EffectiveBenchmarkBudget::default(),
                input.input.solver.move_policy.clone(),
            )
        }
        TRANSFER_PREVIEW_BENCHMARK_MODE => {
            let input = solver3_transfer_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver3.canonical_id()
                )
            })?;
            for _ in 0..warmup_iterations {
                let preview =
                    preview_solver3_transfer_runtime_lightweight(&input.state, &input.transfer)
                        .map_err(|error| error.to_string())?;
                black_box(preview.delta_score);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut preview_seconds = 0.0;
            for _ in 0..iterations {
                let op_started = Instant::now();
                let preview =
                    preview_solver3_transfer_runtime_lightweight(&input.state, &input.transfer)
                        .map_err(|error| error.to_string())?;
                preview_seconds += op_started.elapsed().as_secs_f64();
                checksum = checksum.wrapping_add(black_box(preview.delta_score.to_bits() as i64));
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds,
                    apply_seconds: 0.0,
                    full_recalculation_seconds: 0.0,
                    search_seconds: 0.0,
                },
                input.input.solver.seed,
                EffectiveBenchmarkBudget::default(),
                input.input.solver.move_policy.clone(),
            )
        }
        TRANSFER_APPLY_BENCHMARK_MODE => {
            let input = solver3_transfer_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver3.canonical_id()
                )
            })?;
            let preview =
                preview_solver3_transfer_runtime_lightweight(&input.state, &input.transfer)
                    .map_err(|error| error.to_string())?;
            for _ in 0..warmup_iterations {
                let mut state = input.state.clone();
                apply_solver3_transfer_runtime_preview(&mut state, &preview)
                    .map_err(|error| error.to_string())?;
                black_box(state.total_score);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut apply_seconds = 0.0;
            for _ in 0..iterations {
                let mut state = input.state.clone();
                let op_started = Instant::now();
                apply_solver3_transfer_runtime_preview(&mut state, &preview)
                    .map_err(|error| error.to_string())?;
                apply_seconds += op_started.elapsed().as_secs_f64();
                checksum = checksum.wrapping_add(black_box(state.total_score.to_bits() as i64));
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds: 0.0,
                    apply_seconds,
                    full_recalculation_seconds: 0.0,
                    search_seconds: 0.0,
                },
                input.input.solver.seed,
                EffectiveBenchmarkBudget::default(),
                input.input.solver.move_policy.clone(),
            )
        }
        CLIQUE_SWAP_PREVIEW_BENCHMARK_MODE => {
            let input = solver3_clique_swap_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver3.canonical_id()
                )
            })?;
            for _ in 0..warmup_iterations {
                let preview = preview_solver3_clique_swap_runtime_lightweight(
                    &input.state,
                    &input.clique_swap,
                )
                .map_err(|error| error.to_string())?;
                black_box(preview.delta_score);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut preview_seconds = 0.0;
            for _ in 0..iterations {
                let op_started = Instant::now();
                let preview = preview_solver3_clique_swap_runtime_lightweight(
                    &input.state,
                    &input.clique_swap,
                )
                .map_err(|error| error.to_string())?;
                preview_seconds += op_started.elapsed().as_secs_f64();
                checksum = checksum.wrapping_add(black_box(preview.delta_score.to_bits() as i64));
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds,
                    apply_seconds: 0.0,
                    full_recalculation_seconds: 0.0,
                    search_seconds: 0.0,
                },
                input.input.solver.seed,
                EffectiveBenchmarkBudget::default(),
                input.input.solver.move_policy.clone(),
            )
        }
        CLIQUE_SWAP_APPLY_BENCHMARK_MODE => {
            let input = solver3_clique_swap_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver3.canonical_id()
                )
            })?;
            let preview =
                preview_solver3_clique_swap_runtime_lightweight(&input.state, &input.clique_swap)
                    .map_err(|error| error.to_string())?;
            for _ in 0..warmup_iterations {
                let mut state = input.state.clone();
                apply_solver3_clique_swap_runtime_preview(&mut state, &preview)
                    .map_err(|error| error.to_string())?;
                black_box(state.total_score);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut apply_seconds = 0.0;
            for _ in 0..iterations {
                let mut state = input.state.clone();
                let op_started = Instant::now();
                apply_solver3_clique_swap_runtime_preview(&mut state, &preview)
                    .map_err(|error| error.to_string())?;
                apply_seconds += op_started.elapsed().as_secs_f64();
                checksum = checksum.wrapping_add(black_box(state.total_score.to_bits() as i64));
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds: 0.0,
                    apply_seconds,
                    full_recalculation_seconds: 0.0,
                    search_seconds: 0.0,
                },
                input.input.solver.seed,
                EffectiveBenchmarkBudget::default(),
                input.input.solver.move_policy.clone(),
            )
        }
        SEARCH_ITERATION_BENCHMARK_MODE => {
            let input = search_loop_bench_input(&preset).ok_or_else(|| {
                format!(
                    "hotpath probe '{}' for solver family '{}' is not implemented yet",
                    preset,
                    SolverKind::Solver3.canonical_id()
                )
            })?;
            let effective_seed = input.input.solver.seed;
            let effective_budget = EffectiveBenchmarkBudget {
                max_iterations: Some(1),
                time_limit_seconds: input.input.solver.stop_conditions.time_limit_seconds,
                no_improvement_iterations: input
                    .input
                    .solver
                    .stop_conditions
                    .no_improvement_iterations,
            };
            let effective_move_policy = input.input.solver.move_policy.clone();
            for _ in 0..warmup_iterations {
                black_box(run_search_iteration(&input)?);
            }
            let started = Instant::now();
            let mut checksum = 0i64;
            let mut search_seconds = 0.0;
            for _ in 0..iterations {
                let op_started = Instant::now();
                checksum = checksum.wrapping_add(black_box(run_search_iteration(&input)?));
                search_seconds += op_started.elapsed().as_secs_f64();
            }
            (
                HotPathMetrics {
                    benchmark_mode: benchmark_mode.to_string(),
                    preset: Some(preset),
                    iterations,
                    warmup_iterations,
                    measured_operations: iterations,
                    average_runtime_seconds: average_runtime(
                        started.elapsed().as_secs_f64(),
                        iterations,
                    ),
                    ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                    checksum,
                    measurement_seconds: started.elapsed().as_secs_f64(),
                    setup_seconds: 0.0,
                    construction_seconds: 0.0,
                    preview_seconds: 0.0,
                    apply_seconds: 0.0,
                    full_recalculation_seconds: 0.0,
                    search_seconds,
                },
                effective_seed,
                effective_budget,
                effective_move_policy,
            )
        }
        _ => {
            return Err(format!(
                "hotpath probe '{}' for solver family '{}' is not implemented yet",
                benchmark_mode,
                SolverKind::Solver3.canonical_id()
            ));
        }
    };

    Ok(HotPathExecutionContext {
        metrics: HotPathMetrics {
            setup_seconds: prepared_started.elapsed().as_secs_f64(),
            ..metrics
        },
        effective_seed,
        effective_budget,
        effective_move_policy,
    })
}

fn run_solver1_hotpath_case(
    suite: &LoadedBenchmarkSuite,
    case: &LoadedBenchmarkCase,
    preset: String,
) -> Result<HotPathExecutionContext, String> {
    let benchmark_mode = suite.manifest.benchmark_mode.as_str();
    let iterations = case
        .overrides
        .iterations
        .or(suite.manifest.default_iterations)
        .unwrap_or(match benchmark_mode {
            SEARCH_ITERATION_BENCHMARK_MODE => 8,
            _ => 64,
        });
    let warmup_iterations = case
        .overrides
        .warmup_iterations
        .or(suite.manifest.default_warmup_iterations)
        .unwrap_or(4);

    let prepared_started = Instant::now();
    let (mut metrics, effective_seed, effective_budget, effective_move_policy) =
        match benchmark_mode {
            CONSTRUCTION_BENCHMARK_MODE => {
                let input = construction_bench_input();
                let effective_seed = input.cold_input.solver.seed;
                let effective_budget = stop_budget(&input.cold_input);
                let effective_move_policy = input.cold_input.solver.move_policy.clone();
                for _ in 0..warmup_iterations {
                    black_box(
                        gm_core::solver1::State::new(&input.cold_input)
                            .map_err(|error| error.to_string())?,
                    );
                }
                let mut checksum = 0i64;
                let started = Instant::now();
                let mut construction_seconds = 0.0;
                for _ in 0..iterations {
                    let op_started = Instant::now();
                    let state = gm_core::solver1::State::new(&input.cold_input)
                        .map_err(|error| error.to_string())?;
                    construction_seconds += op_started.elapsed().as_secs_f64();
                    checksum =
                        checksum.wrapping_add(black_box(state.current_cost.to_bits() as i64));
                }
                (
                    HotPathMetrics {
                        benchmark_mode: benchmark_mode.to_string(),
                        preset: Some(preset),
                        iterations,
                        warmup_iterations,
                        measured_operations: iterations,
                        average_runtime_seconds: average_runtime(
                            started.elapsed().as_secs_f64(),
                            iterations,
                        ),
                        ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                        checksum,
                        measurement_seconds: started.elapsed().as_secs_f64(),
                        setup_seconds: 0.0,
                        construction_seconds,
                        preview_seconds: 0.0,
                        apply_seconds: 0.0,
                        full_recalculation_seconds: 0.0,
                        search_seconds: 0.0,
                    },
                    effective_seed,
                    effective_budget,
                    effective_move_policy,
                )
            }
            FULL_RECALCULATION_BENCHMARK_MODE => {
                let input = construction_bench_input();
                let effective_seed = input.warm_input.solver.seed;
                let effective_budget = stop_budget(&input.warm_input);
                let effective_move_policy = input.warm_input.solver.move_policy.clone();
                for _ in 0..warmup_iterations {
                    let mut state = input.recalc_state.clone();
                    state._recalculate_scores();
                    black_box(state.current_cost);
                }
                let started = Instant::now();
                let mut checksum = 0i64;
                let mut full_recalculation_seconds = 0.0;
                for _ in 0..iterations {
                    let mut state = input.recalc_state.clone();
                    let op_started = Instant::now();
                    state._recalculate_scores();
                    full_recalculation_seconds += op_started.elapsed().as_secs_f64();
                    checksum =
                        checksum.wrapping_add(black_box(state.current_cost.to_bits() as i64));
                }
                (
                    HotPathMetrics {
                        benchmark_mode: benchmark_mode.to_string(),
                        preset: Some(preset),
                        iterations,
                        warmup_iterations,
                        measured_operations: iterations,
                        average_runtime_seconds: average_runtime(
                            started.elapsed().as_secs_f64(),
                            iterations,
                        ),
                        ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                        checksum,
                        measurement_seconds: started.elapsed().as_secs_f64(),
                        setup_seconds: 0.0,
                        construction_seconds: 0.0,
                        preview_seconds: 0.0,
                        apply_seconds: 0.0,
                        full_recalculation_seconds,
                        search_seconds: 0.0,
                    },
                    effective_seed,
                    effective_budget,
                    effective_move_policy,
                )
            }
            SWAP_PREVIEW_BENCHMARK_MODE => {
                let input = swap_bench_input();
                let effective_seed = input.state.effective_seed.into();
                let effective_budget = EffectiveBenchmarkBudget::default();
                let effective_move_policy = Some(input.state.move_policy.clone());
                for _ in 0..warmup_iterations {
                    black_box(input.state.calculate_swap_cost_delta(
                        input.day,
                        input.p1_idx,
                        input.p2_idx,
                    ));
                }
                let started = Instant::now();
                let mut checksum = 0i64;
                let mut preview_seconds = 0.0;
                for _ in 0..iterations {
                    let op_started = Instant::now();
                    let delta = input.state.calculate_swap_cost_delta(
                        input.day,
                        input.p1_idx,
                        input.p2_idx,
                    );
                    preview_seconds += op_started.elapsed().as_secs_f64();
                    checksum = checksum.wrapping_add(black_box(delta.to_bits() as i64));
                }
                (
                    HotPathMetrics {
                        benchmark_mode: benchmark_mode.to_string(),
                        preset: Some(preset),
                        iterations,
                        warmup_iterations,
                        measured_operations: iterations,
                        average_runtime_seconds: average_runtime(
                            started.elapsed().as_secs_f64(),
                            iterations,
                        ),
                        ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                        checksum,
                        measurement_seconds: started.elapsed().as_secs_f64(),
                        setup_seconds: 0.0,
                        construction_seconds: 0.0,
                        preview_seconds,
                        apply_seconds: 0.0,
                        full_recalculation_seconds: 0.0,
                        search_seconds: 0.0,
                    },
                    effective_seed,
                    effective_budget,
                    effective_move_policy,
                )
            }
            SWAP_APPLY_BENCHMARK_MODE => {
                let input = swap_bench_input();
                let effective_seed = input.state.effective_seed.into();
                let effective_budget = EffectiveBenchmarkBudget::default();
                let effective_move_policy = Some(input.state.move_policy.clone());
                for _ in 0..warmup_iterations {
                    let mut state = input.state.clone();
                    state.apply_swap(input.day, input.p1_idx, input.p2_idx);
                    black_box(state.current_cost);
                }
                let started = Instant::now();
                let mut checksum = 0i64;
                let mut apply_seconds = 0.0;
                for _ in 0..iterations {
                    let mut state = input.state.clone();
                    let op_started = Instant::now();
                    state.apply_swap(input.day, input.p1_idx, input.p2_idx);
                    apply_seconds += op_started.elapsed().as_secs_f64();
                    checksum =
                        checksum.wrapping_add(black_box(state.current_cost.to_bits() as i64));
                }
                (
                    HotPathMetrics {
                        benchmark_mode: benchmark_mode.to_string(),
                        preset: Some(preset),
                        iterations,
                        warmup_iterations,
                        measured_operations: iterations,
                        average_runtime_seconds: average_runtime(
                            started.elapsed().as_secs_f64(),
                            iterations,
                        ),
                        ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                        checksum,
                        measurement_seconds: started.elapsed().as_secs_f64(),
                        setup_seconds: 0.0,
                        construction_seconds: 0.0,
                        preview_seconds: 0.0,
                        apply_seconds,
                        full_recalculation_seconds: 0.0,
                        search_seconds: 0.0,
                    },
                    effective_seed,
                    effective_budget,
                    effective_move_policy,
                )
            }
            TRANSFER_PREVIEW_BENCHMARK_MODE => {
                let input = transfer_bench_input(&preset)
                    .ok_or_else(|| format!("unsupported transfer hotpath preset {preset}"))?;
                let effective_seed = input.state.effective_seed.into();
                let effective_budget = EffectiveBenchmarkBudget::default();
                let effective_move_policy = Some(input.state.move_policy.clone());
                for _ in 0..warmup_iterations {
                    black_box(input.state.calculate_transfer_cost_delta(
                        input.day,
                        input.person_idx,
                        input.from_group,
                        input.to_group,
                    ));
                }
                let started = Instant::now();
                let mut checksum = 0i64;
                let mut preview_seconds = 0.0;
                for _ in 0..iterations {
                    let op_started = Instant::now();
                    let delta = input.state.calculate_transfer_cost_delta(
                        input.day,
                        input.person_idx,
                        input.from_group,
                        input.to_group,
                    );
                    preview_seconds += op_started.elapsed().as_secs_f64();
                    checksum = checksum.wrapping_add(black_box(delta.to_bits() as i64));
                }
                (
                    HotPathMetrics {
                        benchmark_mode: benchmark_mode.to_string(),
                        preset: Some(preset),
                        iterations,
                        warmup_iterations,
                        measured_operations: iterations,
                        average_runtime_seconds: average_runtime(
                            started.elapsed().as_secs_f64(),
                            iterations,
                        ),
                        ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                        checksum,
                        measurement_seconds: started.elapsed().as_secs_f64(),
                        setup_seconds: 0.0,
                        construction_seconds: 0.0,
                        preview_seconds,
                        apply_seconds: 0.0,
                        full_recalculation_seconds: 0.0,
                        search_seconds: 0.0,
                    },
                    effective_seed,
                    effective_budget,
                    effective_move_policy,
                )
            }
            TRANSFER_APPLY_BENCHMARK_MODE => {
                let input = transfer_bench_input(&preset)
                    .ok_or_else(|| format!("unsupported transfer hotpath preset {preset}"))?;
                let effective_seed = input.state.effective_seed.into();
                let effective_budget = EffectiveBenchmarkBudget::default();
                let effective_move_policy = Some(input.state.move_policy.clone());
                for _ in 0..warmup_iterations {
                    let mut state = input.state.clone();
                    state.apply_transfer(
                        input.day,
                        input.person_idx,
                        input.from_group,
                        input.to_group,
                    );
                    black_box(state.current_cost);
                }
                let started = Instant::now();
                let mut checksum = 0i64;
                let mut apply_seconds = 0.0;
                for _ in 0..iterations {
                    let mut state = input.state.clone();
                    let op_started = Instant::now();
                    state.apply_transfer(
                        input.day,
                        input.person_idx,
                        input.from_group,
                        input.to_group,
                    );
                    apply_seconds += op_started.elapsed().as_secs_f64();
                    checksum =
                        checksum.wrapping_add(black_box(state.current_cost.to_bits() as i64));
                }
                (
                    HotPathMetrics {
                        benchmark_mode: benchmark_mode.to_string(),
                        preset: Some(preset),
                        iterations,
                        warmup_iterations,
                        measured_operations: iterations,
                        average_runtime_seconds: average_runtime(
                            started.elapsed().as_secs_f64(),
                            iterations,
                        ),
                        ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                        checksum,
                        measurement_seconds: started.elapsed().as_secs_f64(),
                        setup_seconds: 0.0,
                        construction_seconds: 0.0,
                        preview_seconds: 0.0,
                        apply_seconds,
                        full_recalculation_seconds: 0.0,
                        search_seconds: 0.0,
                    },
                    effective_seed,
                    effective_budget,
                    effective_move_policy,
                )
            }
            CLIQUE_SWAP_PREVIEW_BENCHMARK_MODE => {
                let input = clique_swap_bench_input();
                let effective_seed = input.state.effective_seed.into();
                let effective_budget = EffectiveBenchmarkBudget::default();
                let effective_move_policy = Some(input.state.move_policy.clone());
                for _ in 0..warmup_iterations {
                    black_box(input.state.calculate_clique_swap_cost_delta(
                        input.day,
                        input.clique_idx,
                        input.from_group,
                        input.to_group,
                        &input.target_people,
                    ));
                }
                let started = Instant::now();
                let mut checksum = 0i64;
                let mut preview_seconds = 0.0;
                for _ in 0..iterations {
                    let op_started = Instant::now();
                    let delta = input.state.calculate_clique_swap_cost_delta(
                        input.day,
                        input.clique_idx,
                        input.from_group,
                        input.to_group,
                        &input.target_people,
                    );
                    preview_seconds += op_started.elapsed().as_secs_f64();
                    checksum = checksum.wrapping_add(black_box(delta.to_bits() as i64));
                }
                (
                    HotPathMetrics {
                        benchmark_mode: benchmark_mode.to_string(),
                        preset: Some(preset),
                        iterations,
                        warmup_iterations,
                        measured_operations: iterations,
                        average_runtime_seconds: average_runtime(
                            started.elapsed().as_secs_f64(),
                            iterations,
                        ),
                        ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                        checksum,
                        measurement_seconds: started.elapsed().as_secs_f64(),
                        setup_seconds: 0.0,
                        construction_seconds: 0.0,
                        preview_seconds,
                        apply_seconds: 0.0,
                        full_recalculation_seconds: 0.0,
                        search_seconds: 0.0,
                    },
                    effective_seed,
                    effective_budget,
                    effective_move_policy,
                )
            }
            CLIQUE_SWAP_APPLY_BENCHMARK_MODE => {
                let input = clique_swap_bench_input();
                let effective_seed = input.state.effective_seed.into();
                let effective_budget = EffectiveBenchmarkBudget::default();
                let effective_move_policy = Some(input.state.move_policy.clone());
                for _ in 0..warmup_iterations {
                    let mut state = input.state.clone();
                    state.apply_clique_swap(
                        input.day,
                        input.clique_idx,
                        input.from_group,
                        input.to_group,
                        &input.target_people,
                    );
                    black_box(state.current_cost);
                }
                let started = Instant::now();
                let mut checksum = 0i64;
                let mut apply_seconds = 0.0;
                for _ in 0..iterations {
                    let mut state = input.state.clone();
                    let op_started = Instant::now();
                    state.apply_clique_swap(
                        input.day,
                        input.clique_idx,
                        input.from_group,
                        input.to_group,
                        &input.target_people,
                    );
                    apply_seconds += op_started.elapsed().as_secs_f64();
                    checksum =
                        checksum.wrapping_add(black_box(state.current_cost.to_bits() as i64));
                }
                (
                    HotPathMetrics {
                        benchmark_mode: benchmark_mode.to_string(),
                        preset: Some(preset),
                        iterations,
                        warmup_iterations,
                        measured_operations: iterations,
                        average_runtime_seconds: average_runtime(
                            started.elapsed().as_secs_f64(),
                            iterations,
                        ),
                        ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                        checksum,
                        measurement_seconds: started.elapsed().as_secs_f64(),
                        setup_seconds: 0.0,
                        construction_seconds: 0.0,
                        preview_seconds: 0.0,
                        apply_seconds,
                        full_recalculation_seconds: 0.0,
                        search_seconds: 0.0,
                    },
                    effective_seed,
                    effective_budget,
                    effective_move_policy,
                )
            }
            SEARCH_ITERATION_BENCHMARK_MODE => {
                let input = search_loop_bench_input(&preset)
                    .ok_or_else(|| format!("unknown hotpath preset {preset}"))?;
                let effective_seed = input.input.solver.seed;
                let effective_budget = EffectiveBenchmarkBudget {
                    max_iterations: Some(1),
                    time_limit_seconds: input.input.solver.stop_conditions.time_limit_seconds,
                    no_improvement_iterations: input
                        .input
                        .solver
                        .stop_conditions
                        .no_improvement_iterations,
                };
                let effective_move_policy = input.input.solver.move_policy.clone();
                for _ in 0..warmup_iterations {
                    black_box(run_search_iteration(&input)?);
                }
                let started = Instant::now();
                let mut checksum = 0i64;
                let mut search_seconds = 0.0;
                for _ in 0..iterations {
                    let op_started = Instant::now();
                    checksum = checksum.wrapping_add(black_box(run_search_iteration(&input)?));
                    search_seconds += op_started.elapsed().as_secs_f64();
                }
                (
                    HotPathMetrics {
                        benchmark_mode: benchmark_mode.to_string(),
                        preset: Some(preset),
                        iterations,
                        warmup_iterations,
                        measured_operations: iterations,
                        average_runtime_seconds: average_runtime(
                            started.elapsed().as_secs_f64(),
                            iterations,
                        ),
                        ops_per_second: ops_per_second(started.elapsed().as_secs_f64(), iterations),
                        checksum,
                        measurement_seconds: started.elapsed().as_secs_f64(),
                        setup_seconds: 0.0,
                        construction_seconds: 0.0,
                        preview_seconds: 0.0,
                        apply_seconds: 0.0,
                        full_recalculation_seconds: 0.0,
                        search_seconds,
                    },
                    effective_seed,
                    effective_budget,
                    effective_move_policy,
                )
            }
            other => return Err(format!("unsupported hotpath benchmark_mode {other}")),
        };

    metrics.setup_seconds = prepared_started.elapsed().as_secs_f64() - metrics.measurement_seconds;
    Ok(HotPathExecutionContext {
        metrics,
        effective_seed,
        effective_budget,
        effective_move_policy,
    })
}

fn run_search_iteration(
    input: &crate::hotpath_inputs::SearchLoopBenchInput,
) -> Result<i64, String> {
    let mut config = input.input.solver.clone();
    config.stop_conditions.max_iterations = Some(1);
    config.stop_conditions.no_improvement_iterations = None;
    config.stop_conditions.time_limit_seconds = None;

    match &input.base_state {
        SearchLoopBenchState::Solver1(base_state) => {
            let mut state = base_state.clone();
            let solver = SimulatedAnnealing::new(&config);
            let result = solver
                .solve(&mut state, None, None)
                .map_err(|error| error.to_string())?;
            Ok(result.final_score.to_bits() as i64)
        }
        SearchLoopBenchState::Solver3(base_state) => {
            let mut state = base_state.clone();
            let solver = Solver3SearchEngine::new(&config);
            let result = solver
                .solve(&mut state, None, None)
                .map_err(|error| error.to_string())?;
            Ok(result.final_score.to_bits() as i64)
        }
    }
}

fn stop_budget(input: &gm_core::models::ApiInput) -> EffectiveBenchmarkBudget {
    EffectiveBenchmarkBudget {
        max_iterations: input.solver.stop_conditions.max_iterations,
        time_limit_seconds: input.solver.stop_conditions.time_limit_seconds,
        no_improvement_iterations: input.solver.stop_conditions.no_improvement_iterations,
    }
}

fn average_runtime(seconds: f64, iterations: u64) -> f64 {
    if iterations == 0 {
        0.0
    } else {
        seconds / iterations as f64
    }
}

fn ops_per_second(seconds: f64, iterations: u64) -> f64 {
    if seconds <= f64::EPSILON {
        0.0
    } else {
        iterations as f64 / seconds
    }
}
