//! Performance benchmarks for solver-core
//!
//! Run with: cargo bench -p solver-core --bench solver_perf
//!
//! Results are stored in target/criterion/ for historical comparison.
//! Criterion will automatically detect performance regressions.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use solver_core::models::{
    ApiInput, Constraint, Group, LoggingOptions, Objective, Person, ProblemDefinition,
    RepeatEncounterParams, SimulatedAnnealingParams, SolverConfiguration, SolverParams,
    StopConditions, TelemetryOptions,
};
use solver_core::run_solver;
use std::collections::HashMap;

/// Create a problem with n people, n/group_size groups, and s sessions
fn make_problem(num_people: u32, group_size: u32, num_sessions: u32) -> ProblemDefinition {
    let people: Vec<Person> = (0..num_people)
        .map(|i| Person {
            id: format!("p{}", i),
            attributes: HashMap::new(),
            sessions: None,
        })
        .collect();

    let num_groups = num_people / group_size;
    let groups: Vec<Group> = (0..num_groups)
        .map(|i| Group {
            id: format!("g{}", i),
            size: group_size,
        })
        .collect();

    ProblemDefinition {
        people,
        groups,
        num_sessions,
    }
}

fn make_api_input(
    problem: ProblemDefinition,
    constraints: Vec<Constraint>,
    max_iterations: u64,
) -> ApiInput {
    ApiInput {
        problem,
        initial_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints,
        solver: SolverConfiguration {
            solver_type: "SimulatedAnnealing".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(max_iterations),
                time_limit_seconds: None,
                no_improvement_iterations: None,
            },
            solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                initial_temperature: 10.0,
                final_temperature: 0.001,
                cooling_schedule: "geometric".to_string(),
                reheat_after_no_improvement: None,
                reheat_cycles: None,
            }),
            logging: LoggingOptions {
                log_frequency: None,
                log_initial_state: false,
                log_duration_and_score: false,
                display_final_schedule: false,
                log_initial_score_breakdown: false,
                log_final_score_breakdown: false,
                log_stop_condition: false,
                debug_validate_invariants: false,
                debug_dump_invariant_context: false,
            },
            telemetry: TelemetryOptions::default(),
            allowed_sessions: None,
        },
    }
}

/// Benchmark solver with varying problem sizes (unconstrained)
fn bench_problem_sizes(c: &mut Criterion) {
    let mut group = c.benchmark_group("problem_sizes");

    // Small: 12 people, 3 groups of 4, 3 sessions, 10k iterations
    let small = make_api_input(make_problem(12, 4, 3), vec![], 10_000);

    // Medium: 24 people, 4 groups of 6, 5 sessions, 50k iterations
    let medium = make_api_input(make_problem(24, 6, 5), vec![], 50_000);

    // Large: 30 people, 5 groups of 6, 10 sessions, 100k iterations
    let large = make_api_input(make_problem(30, 6, 10), vec![], 100_000);

    group.throughput(Throughput::Elements(10_000));
    group.bench_with_input(BenchmarkId::new("small", "12p/3g/3s"), &small, |b, input| {
        b.iter(|| run_solver(black_box(input)))
    });

    group.throughput(Throughput::Elements(50_000));
    group.bench_with_input(
        BenchmarkId::new("medium", "24p/4g/5s"),
        &medium,
        |b, input| b.iter(|| run_solver(black_box(input))),
    );

    group.throughput(Throughput::Elements(100_000));
    group.bench_with_input(BenchmarkId::new("large", "30p/5g/10s"), &large, |b, input| {
        b.iter(|| run_solver(black_box(input)))
    });

    group.finish();
}

/// Benchmark solver with constraints
fn bench_with_constraints(c: &mut Criterion) {
    let mut group = c.benchmark_group("constrained");

    // Create a medium problem with constraints
    let problem = make_problem(24, 6, 5);

    // RepeatEncounter constraint
    let constraints_repeat = vec![Constraint::RepeatEncounter(RepeatEncounterParams {
        max_allowed_encounters: 1,
        penalty_function: "squared".to_string(),
        penalty_weight: 100.0,
    })];

    // MustStayTogether constraint (clique)
    let constraints_clique = vec![Constraint::MustStayTogether {
        people: vec!["p0".to_string(), "p1".to_string(), "p2".to_string()],
        sessions: None,
    }];

    // ShouldNotBeTogether constraint
    let constraints_avoid = vec![Constraint::ShouldNotBeTogether {
        people: vec!["p0".to_string(), "p5".to_string()],
        penalty_weight: 100.0,
        sessions: None,
    }];

    // Combined constraints
    let constraints_combined = vec![
        Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "squared".to_string(),
            penalty_weight: 100.0,
        }),
        Constraint::MustStayTogether {
            people: vec!["p0".to_string(), "p1".to_string()],
            sessions: None,
        },
        Constraint::ShouldNotBeTogether {
            people: vec!["p3".to_string(), "p4".to_string()],
            penalty_weight: 50.0,
            sessions: None,
        },
    ];

    let iterations = 50_000;
    group.throughput(Throughput::Elements(iterations));

    let input_repeat = make_api_input(problem.clone(), constraints_repeat, iterations);
    group.bench_with_input(
        BenchmarkId::new("repeat_encounter", "24p"),
        &input_repeat,
        |b, input| b.iter(|| run_solver(black_box(input))),
    );

    let input_clique = make_api_input(problem.clone(), constraints_clique, iterations);
    group.bench_with_input(
        BenchmarkId::new("must_stay_together", "24p"),
        &input_clique,
        |b, input| b.iter(|| run_solver(black_box(input))),
    );

    let input_avoid = make_api_input(problem.clone(), constraints_avoid, iterations);
    group.bench_with_input(
        BenchmarkId::new("should_not_together", "24p"),
        &input_avoid,
        |b, input| b.iter(|| run_solver(black_box(input))),
    );

    let input_combined = make_api_input(problem, constraints_combined, iterations);
    group.bench_with_input(
        BenchmarkId::new("combined", "24p"),
        &input_combined,
        |b, input| b.iter(|| run_solver(black_box(input))),
    );

    group.finish();
}

/// Benchmark individual solver iterations (more granular)
fn bench_iteration_throughput(c: &mut Criterion) {
    let mut group = c.benchmark_group("iteration_throughput");

    // We want to measure how fast we can iterate
    // Use fixed 1000 iterations and measure time
    let problem = make_problem(24, 6, 5);
    let input = make_api_input(problem, vec![], 1_000);

    group.throughput(Throughput::Elements(1_000));
    group.bench_function("1k_iterations", |b| {
        b.iter(|| run_solver(black_box(&input)))
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_problem_sizes,
    bench_with_constraints,
    bench_iteration_throughput
);
criterion_main!(benches);
