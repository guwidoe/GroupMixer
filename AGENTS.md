# AGENTS.md

@~/ralph-repos/vibe-setup/AGENTS.md

## Project: GroupMixer

Group assignment optimization tool for workshops, conferences, classrooms, and other multi-session events. Rust solver core + WASM wrapper + optional server + React webapp.

## Doctrine

This repo adopts `docs/reference/principles/AGENTIC_ENGINEERING_PRINCIPLES.md` as a **normative doctrine**.

- Treat that document as a repo-level doctrine, not optional guidance.
- If legacy structure, convenience shortcuts, or undocumented workflow conflict with the doctrine, the doctrine wins.
- When making architecture, testing, operability, or interface decisions, align with that doctrine explicitly.

## Stack

- Rust workspace: `solver-core`, `solver-wasm`, `solver-server`, `solver-cli`
- React 19 + TypeScript + Vite in `webapp/`
- WebAssembly via `wasm-pack`
- Zustand for frontend state
- Playwright for browser/E2E coverage
- Vitest/Storybook tooling present in `webapp/`

## Structure

- `solver-core/` — core optimization engine, models, solver state, scoring, validation, move logic
- `solver-core/tests/` — primary Rust integration-testing area; data-driven fixtures + property tests + focused integration tests
- `solver-wasm/` — wasm-bindgen wrapper exposing the solver to the browser
- `solver-server/` — optional Axum API with async job manager
- `solver-cli/` — CLI surface for local solver usage
- `webapp/` — React frontend, browser worker integration, storage, visualization, and E2E tests
- `docs/` — architecture, doctrine, and repo documentation
- `legacy_cpp/`, `legacy_rust/`, `python/` — historical/reference implementations; do not treat as the main product surface

## Commands

```bash
# Rust workspace tests
cargo test --workspace

# Fast repo gate used in this repo
./gate.sh

# Build wasm into the webapp public output
cd solver-wasm && wasm-pack build --target web --out-dir ../webapp/public/pkg

# Run server
cargo run -p solver-server

# Webapp local dev
cd webapp && npm ci && npm run dev

# Webapp lint
cd webapp && npm run lint

# Webapp browser tests
cd webapp && npm run test:e2e
```

## Key Files

- `docs/reference/principles/AGENTIC_ENGINEERING_PRINCIPLES.md` — repo doctrine; normative reference
- `docs/CODEBASE_MAP.md` — high-level architecture map of the repo
- `gate.sh` — current whole-repo verification script
- `solver-core/src/lib.rs` — public Rust API entry points
- `solver-core/src/models.rs` — serialized domain model and solver-facing types
- `solver-core/src/solver/` — internal solver state, construction, validation, scoring, and move logic
- `solver-core/tests/data_driven_tests.rs` — main solver integration-test harness
- `solver-core/tests/test_cases/` — JSON solver fixture cases used by the data-driven harness
- `solver-core/tests/property_tests.rs` — property/invariant tests for solver behavior
- `solver-server/src/api/` — Axum routes and handlers
- `solver-server/src/jobs/manager.rs` — async in-memory job lifecycle logic
- `solver-wasm/src/lib.rs` — JS/WASM bridge surface
- `webapp/src/App.tsx` — frontend router entry
- `webapp/src/store/` — Zustand store slices and actions
- `webapp/src/services/` — wasm integration, persistence, evaluation, worker helpers
- `webapp/e2e/tests/` — Playwright browser coverage

## Notes

- The existing `solver-core` **data-driven test harness is the main integration-testing surface for the solver**. Preserve and improve it rather than replacing it with a weaker or more ad hoc approach.
- For solver work, prefer a layered test strategy:
  - narrow unit tests for local logic/branches
  - property tests for invariants
  - data-driven tests as the end-to-end solver contract
  - mutation testing/coverage work to verify the suite is actually protective
- When changing solver behavior, add or update fixture cases in `solver-core/tests/test_cases/` whenever the change affects observable end-to-end behavior.
- `solver-server` is optional and localhost-oriented; treat it as a separate API surface worth testing independently of `solver-core`.
- `webapp` consumes the Rust solver through WASM and browser workers; frontend regressions can come from services/store/conversion code as much as from React components.
- Prefer repo-level docs updates when workflows, doctrine, or architecture assumptions change.
