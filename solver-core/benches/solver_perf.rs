//! Performance benchmarks for solver-core.
//!
//! Run with: `cargo bench -p solver-core --bench solver_perf`
//!
//! This file is the Layer 4 Criterion microbench surface. The solve-level
//! artifact/baseline workflow lives in `solver-benchmarking/`.

mod bench_inputs;

use bench_inputs::construction_bench_input;
use criterion::{criterion_group, criterion_main, BatchSize, Criterion, Throughput};
use solver_core::solver::State;
use std::hint::black_box;

fn bench_construction(c: &mut Criterion) {
    let input = construction_bench_input();
    let mut group = c.benchmark_group("construction");
    group.throughput(Throughput::Elements(
        input.cold_input.problem.people.len() as u64,
    ));

    group.bench_function("cold_seeded_state_new", |b| {
        b.iter(|| State::new(black_box(&input.cold_input)).expect("cold state should build"))
    });

    group.bench_function("warm_start_state_new", |b| {
        b.iter(|| State::new(black_box(&input.warm_input)).expect("warm state should build"))
    });

    group.finish();
}

fn bench_full_recalculation(c: &mut Criterion) {
    let input = construction_bench_input();
    let mut group = c.benchmark_group("recalculation");
    group.throughput(Throughput::Elements(
        input.recalc_state.person_idx_to_id.len() as u64,
    ));

    group.bench_function("full_recalculate_scores", |b| {
        b.iter_batched(
            || input.recalc_state.clone(),
            |mut state| {
                state._recalculate_scores();
                black_box(state.current_cost)
            },
            BatchSize::SmallInput,
        )
    });

    group.finish();
}

criterion_group!(benches, bench_construction, bench_full_recalculation);
criterion_main!(benches);
