//! Performance benchmarks for solver-core.
//!
//! Run with: `cargo bench -p solver-core --bench solver_perf`
//!
//! This file is the Layer 4 Criterion microbench surface. The solve-level
//! artifact/baseline workflow lives in `solver-benchmarking/`.

mod bench_inputs;

use bench_inputs::{constrained_solve_inputs, iteration_throughput_input, solve_scale_inputs};
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use solver_core::run_solver;
use std::hint::black_box;

fn bench_problem_sizes(c: &mut Criterion) {
    let mut group = c.benchmark_group("problem_sizes");

    for input in solve_scale_inputs() {
        group.throughput(Throughput::Elements(input.throughput));
        group.bench_with_input(BenchmarkId::new("solve", input.id), &input.input, |b, input| {
            b.iter(|| run_solver(black_box(input)))
        });
    }

    group.finish();
}

fn bench_with_constraints(c: &mut Criterion) {
    let mut group = c.benchmark_group("constrained");

    for input in constrained_solve_inputs() {
        group.throughput(Throughput::Elements(input.throughput));
        group.bench_with_input(BenchmarkId::new("solve", input.id), &input.input, |b, input| {
            b.iter(|| run_solver(black_box(input)))
        });
    }

    group.finish();
}

fn bench_iteration_throughput(c: &mut Criterion) {
    let mut group = c.benchmark_group("iteration_throughput");
    let input = iteration_throughput_input();

    group.throughput(Throughput::Elements(input.throughput));
    group.bench_function(input.id, |b| b.iter(|| run_solver(black_box(&input.input))));

    group.finish();
}

criterion_group!(
    benches,
    bench_problem_sizes,
    bench_with_constraints,
    bench_iteration_throughput
);
criterion_main!(benches);
