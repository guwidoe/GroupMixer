<p align="center">
  <img src="logo.svg" alt="GroupMixer logo" width="120"/>
</p>

# GroupMixer

GroupMixer is a group-assignment optimization tool for workshops, conferences,
classrooms, networking rounds, and other multi-session events.

The main product surface is a React webapp that runs the Rust solver in the
browser through WebAssembly. It includes a landing-page quick tool, guide pages
with preloaded examples, and a full scenario editor for advanced setup,
constraint tuning, solving, result inspection, and export.

Production app: [groupmixer.app](https://groupmixer.app)

## Repository Shape

This repo is a Rust workspace plus a TypeScript webapp.

| Path | Purpose |
| --- | --- |
| `backend/core/` | Solver core, domain model, validation, scoring, search, and integration tests. |
| `backend/wasm/` | `wasm-bindgen` wrapper used by the browser app and worker runtime. |
| `backend/contracts/` | Shared operation registry, schemas, examples, and generated reference docs. |
| `backend/api/` | Optional local Axum API surface for solve, validate, recommend, and evaluate flows. |
| `backend/cli/` | CLI projection of the shared contract surface. |
| `backend/benchmarking/` | Benchmark harnesses, objective suites, and research tooling. |
| `webapp/` | React 19 + TypeScript + Vite app, Zustand store, scenario editor, landing tool, guides, and Playwright tests. |
| `docs/` | Architecture notes, testing strategy, benchmarking docs, SEO plans, and repo doctrine. |

Historical/reference implementations live under `Archive/`. Treat
`Archive/legacy_cpp/`, `Archive/legacy_rust/`, and `Archive/python/` as
historical context unless a task explicitly says otherwise.

## Current Capabilities

The webapp supports:

- Quick group generation from names or structured participant columns.
- Multiple sessions with repeat-pairing minimization.
- Keep-together, keep-apart, pinned-person, and attribute-balance controls.
- A full scenario editor for partial attendance, per-group/per-session
  capacities, session-specific constraints, weighted soft constraints, solver
  settings, and result analysis.
- Scenario manager workflows for saving, selecting, exporting, and deleting
  scenarios.
- Grid, list, text, line-by-line, and CSV result views.
- Local browser solving through WebAssembly and web workers.
- Guide pages that embed the quick tool with curated example data.

The Rust solver supports richer scenario definitions than the landing quick tool.
The scenario editor is the intended UI for advanced model control.

## Prerequisites

- Rust toolchain with `cargo`
- Node.js and npm
- `wasm-pack`

Install `wasm-pack` if it is missing:

```bash
cargo install wasm-pack
```

## Run Locally

Install web dependencies and start Vite:

```bash
cd webapp
npm ci
npm run dev
```

`npm run dev` builds the WASM package first through the `predev` script, then
starts the app. The default Vite URL is `http://localhost:5173`.

To rebuild only the WASM package:

```bash
cd webapp
npm run build-wasm
```

Equivalent direct command:

```bash
cd backend/wasm
wasm-pack build --target web --out-dir ../../webapp/public/pkg
```

## Build

Build the webapp and prerender SEO assets:

```bash
cd webapp
npm run build
```

Build Rust crates:

```bash
cargo build --workspace
```

Run the optional local API:

```bash
cargo run -p gm-api
```

Run the CLI:

```bash
cargo run -p gm-cli -- --help
```

## Verification

The repo-level gate is:

```bash
./gate.sh
```

Useful focused checks:

```bash
# Rust workspace
cargo fmt --all -- --check
cargo clippy --all --all-targets -- -D warnings
cargo test --workspace

# Contract reference artifacts
./tools/contracts_reference.sh check

# Webapp
cd webapp
npx tsc --noEmit
npm run lint
npm run test:unit -- --run
npm run test:e2e
```

For testing expectations and choosing the right verification level, see:

- [`docs/TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md)
- [`docs/TEST_PYRAMID_AND_REFACTOR_WORKFLOW.md`](docs/TEST_PYRAMID_AND_REFACTOR_WORKFLOW.md)

## Benchmarking And Solver Research

Solver benchmark cases are part of the product’s correctness and performance
contract. Do not simplify or proxy canonical benchmark cases just to make a lane
pass.

Relevant docs:

- [`docs/benchmarking/README.md`](docs/benchmarking/README.md)
- [`docs/benchmarking/OBJECTIVE_CASE_PORTFOLIO.md`](docs/benchmarking/OBJECTIVE_CASE_PORTFOLIO.md)
- [`docs/benchmarking/WORKFLOW.md`](docs/benchmarking/WORKFLOW.md)

## Contracts

Shared operation metadata, schemas, examples, and public errors are generated
from `gm-contracts`.

Generated reference docs live in:

- [`docs/reference/generated/gm-contracts/README.md`](docs/reference/generated/gm-contracts/README.md)
- [`docs/reference/generated/gm-contracts/operations.md`](docs/reference/generated/gm-contracts/operations.md)
- [`docs/reference/generated/gm-contracts/schemas.md`](docs/reference/generated/gm-contracts/schemas.md)
- [`docs/reference/generated/gm-contracts/errors.md`](docs/reference/generated/gm-contracts/errors.md)

Regenerate or check them with:

```bash
./tools/contracts_reference.sh check
```

## Deployment

The hosted webapp is built for Vercel:

```bash
cd webapp
npm run vercel-build
```

The normal production build path compiles the WASM module, type-checks the
webapp, builds Vite output, and prerenders SEO assets.

## Development Notes

- Repo doctrine lives in
  [`docs/reference/principles/AGENTIC_ENGINEERING_PRINCIPLES.md`](docs/reference/principles/AGENTIC_ENGINEERING_PRINCIPLES.md).
- `AGENTS.md` contains project-specific agent workflow instructions.
- The main Rust integration surface is `backend/core/tests/` and its
  data-driven fixtures.
- The webapp consumes the solver through WASM and browser workers; frontend
  regressions can come from conversion, persistence, store, or worker code as
  much as from React components.
- Avoid hidden fallback behavior unless a task explicitly asks for it. Prefer a
  single intended path with explicit errors or capability gating.

## License

See [`LICENSE.md`](LICENSE.md).
