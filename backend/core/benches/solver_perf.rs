//! Performance benchmarks for gm-core.
//!
//! Run with: `cargo bench -p gm-core --bench solver_perf`
//!
//! This file is the Layer 4 Criterion microbench surface. The solve-level
//! artifact/baseline workflow lives in `backend/benchmarking/`.

mod bench_inputs;

use bench_inputs::{
    clique_swap_bench_input, construction_bench_input, search_loop_bench_inputs, swap_bench_input,
    transfer_bench_input,
};
use criterion::{criterion_group, criterion_main, BatchSize, BenchmarkId, Criterion, Throughput};
use gm_core::solver1::search::simulated_annealing::SimulatedAnnealing;
use gm_core::solver1::search::Solver;
use gm_core::solver1::State;
use std::hint::black_box;

fn bench_construction(c: &mut Criterion) {
    let input = construction_bench_input();
    let mut group = c.benchmark_group("construction");
    group.throughput(Throughput::Elements(
        input.cold_input.problem.people.len() as u64
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

fn bench_swap(c: &mut Criterion) {
    let input = swap_bench_input();
    let mut group = c.benchmark_group("swap");
    group.throughput(Throughput::Elements(1));

    group.bench_function("preview_delta", |b| {
        b.iter(|| {
            black_box(
                input
                    .state
                    .calculate_swap_cost_delta(input.day, input.p1_idx, input.p2_idx),
            )
        })
    });

    group.bench_function("apply", |b| {
        b.iter_batched(
            || input.state.clone(),
            |mut state| {
                state.apply_swap(input.day, input.p1_idx, input.p2_idx);
                black_box(state.current_cost)
            },
            BatchSize::SmallInput,
        )
    });

    group.finish();
}

fn bench_transfer(c: &mut Criterion) {
    let input = transfer_bench_input();
    let mut group = c.benchmark_group("transfer");
    group.throughput(Throughput::Elements(1));

    group.bench_function("preview_delta", |b| {
        b.iter(|| {
            black_box(input.state.calculate_transfer_cost_delta(
                input.day,
                input.person_idx,
                input.from_group,
                input.to_group,
            ))
        })
    });

    group.bench_function("apply", |b| {
        b.iter_batched(
            || input.state.clone(),
            |mut state| {
                state.apply_transfer(
                    input.day,
                    input.person_idx,
                    input.from_group,
                    input.to_group,
                );
                black_box(state.current_cost)
            },
            BatchSize::SmallInput,
        )
    });

    group.finish();
}

fn bench_clique_swap(c: &mut Criterion) {
    let input = clique_swap_bench_input();
    let mut group = c.benchmark_group("clique_swap");
    group.throughput(Throughput::Elements(1));

    group.bench_function("preview_delta", |b| {
        b.iter(|| {
            black_box(input.state.calculate_clique_swap_cost_delta(
                input.day,
                input.clique_idx,
                input.from_group,
                input.to_group,
                &input.target_people,
            ))
        })
    });

    group.bench_function("apply", |b| {
        b.iter_batched(
            || input.state.clone(),
            |mut state| {
                state.apply_clique_swap(
                    input.day,
                    input.clique_idx,
                    input.from_group,
                    input.to_group,
                    &input.target_people,
                );
                black_box(state.current_cost)
            },
            BatchSize::SmallInput,
        )
    });

    group.finish();
}

fn bench_search_loop(c: &mut Criterion) {
    let mut group = c.benchmark_group("search_loop");

    for input in search_loop_bench_inputs() {
        let solver = SimulatedAnnealing::new(&input.input.solver);
        group.throughput(Throughput::Elements(input.iterations));
        group.bench_with_input(
            BenchmarkId::new("solve", input.id),
            &input.base_state,
            |b, _| {
                b.iter_batched(
                    || input.base_state.clone(),
                    |mut state| {
                        let result = solver
                            .solve(&mut state, None, None)
                            .expect("search loop benchmark should solve");
                        black_box(result.final_score)
                    },
                    BatchSize::LargeInput,
                )
            },
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_construction,
    bench_full_recalculation,
    bench_swap,
    bench_transfer,
    bench_clique_swap,
    bench_search_loop
);
criterion_main!(benches);
