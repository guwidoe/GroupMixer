# GroupMixer webapp

React 19 + TypeScript + Vite frontend for building problems, running the solver in-browser via WASM + worker, and visualizing results.

## Key responsibilities

- problem editing and local persistence
- solver configuration and progress display
- worker-backed browser solving
- results history, comparison, export, and visualizations
- Playwright and Vitest coverage for frontend behavior

## Local development

```bash
npm ci
npm run build-wasm
npm run dev
```

The WASM build writes generated files to `public/pkg/`.

## Common commands

```bash
# Lint
npm run lint

# Unit/component tests
npm run test:unit

# Coverage
npm run test:coverage:ci

# Browser workflows
npm run test:e2e:workflows

# Production build
npm run build
```

## Important directories

- `src/components/` — UI surfaces
- `src/services/` — wasm, worker, storage, evaluation, demo-data helpers
- `src/store/` — Zustand slices and actions
- `src/visualizations/` — pluggable result visualizations
- `src/workers/` — module worker entrypoint for solver execution
- `public/pkg/` — generated wasm-pack output (ignored)
- `public/test_cases/` — demo and regression fixture inputs

## Build contract

- Vite resolves `virtual:wasm-solver` to `public/pkg/solver_wasm.js`
- `npm run build-wasm` must run before first local dev/build if generated files are absent
- generated WASM artifacts are not the source of truth; `solver-wasm/` is
