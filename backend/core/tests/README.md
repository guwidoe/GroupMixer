# solver-core test suite

`solver-core/tests/data_driven_tests.rs` is the main end-to-end integration contract for the solver.

## Fixture layout

Fixtures live in `solver-core/tests/test_cases/*.json`.

Each fixture can declare metadata alongside `input`, `expected`, and `test_options`:

```json
{
  "name": "Basic Clique Test",
  "metadata": {
    "tags": ["constraints", "clique"],
    "kind": "correctness",
    "tier": "default"
  }
}
```

### Metadata fields

- `tags`: queryable categories that are also encoded into generated test names
- `kind`: `correctness` or `performance`
- `tier`: `default` or `slow`

Performance and slow fixtures are generated as `#[ignore]` tests so they do not make the default correctness suite brittle.

When a fixture still carries legacy runtime smoke thresholds (`max_runtime_ms`, `min_iterations_per_second`), those thresholds are **opt-in** and are only enforced when `GROUPMIXER_ENABLE_FIXTURE_PERF_ASSERTIONS=1` is set. Long-term runtime comparison belongs in the dedicated benchmark runner / baseline / comparison workflow, not in the default correctness harness.

## Path regression suite

Wave 2 of the benchmarking architecture adds dedicated path-regression files alongside the broad data-driven harness:

- `move_swap_regression.rs`
- `move_transfer_regression.rs`
- `move_clique_swap_regression.rs`
- `search_driver_regression.rs`
- `construction_regression.rs`

These files intentionally cover move-family and driver branches called out in `docs/BENCHMARKING_ARCHITECTURE.md`.

The explicit catalog for those paths now lives in:

- `benchmarking/path-matrix.yaml`
- `benchmarking/cases/path/`

Use these targeted tests when changing delta logic, move application, construction behavior, reheating/stop logic, or allowed-session handling. Keep the data-driven harness as the main end-to-end contract, and use the path-regression layer when you need to prove that a specific solver branch still activates and still reconciles with a full recalculation.

## Running fixtures

Run the default correctness suite:

```bash
cargo test -p solver-core --test data_driven_tests
```

Run one fixture by generated test name or file stem:

```bash
cargo test -p solver-core --test data_driven_tests basic_clique_test
```

Run a tagged subset by matching the generated name prefix:

```bash
cargo test -p solver-core --test data_driven_tests constraints__
cargo test -p solver-core --test data_driven_tests stop_conditions__
```

Run ignored performance fixtures:

```bash
cargo test -p solver-core --test data_driven_tests -- --ignored
```

Run one ignored performance fixture:

```bash
cargo test -p solver-core --test data_driven_tests benchmark_unconstrained -- --ignored
```

Run mutation testing for solver-core:

```bash
./scripts/mutation-solver-core.sh
# or: cargo mutants -p solver-core
```

Suggested workflow:
- use normal `cargo test`/fixture/property runs during local iteration
- run mutation testing before or during high-risk solver refactors
- keep mutation runs for heavier CI cadences rather than every tiny edit

## Extending the framework

When adding a new solver feature or regression case:

1. add a JSON fixture under `tests/test_cases/`
2. assign meaningful `metadata.tags`
3. mark expensive cases with `kind: "performance"` and/or `tier: "slow"`
4. encode expected behavior in `expected`
5. use unit/property tests for local branches and invariants, but keep cross-cutting solver behavior in fixture form where practical

The generated per-fixture tests come from `solver-core/build.rs`, which scans the fixture directory and emits one Rust test per JSON file.
