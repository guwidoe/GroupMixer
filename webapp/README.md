# GroupMixer webapp

React 19 + TypeScript + Vite frontend for building scenarios, running the solver in-browser via WASM + worker, and visualizing results.

## Key responsibilities

- scenario editing and local persistence
- solver configuration and progress display
- worker-backed browser solving
- browser agent API via `window.GroupMixerAgent`
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

- Vite resolves `virtual:wasm-solver` to `public/pkg/gm_wasm.js`
- `npm run build-wasm` must run before first local dev/build if generated files are absent
- generated WASM artifacts are not the source of truth; `backend/wasm/` is

## Browser agent API

The webapp installs a browser-local agent/operator surface from
`src/services/browserAgentApi.ts`.

This API is intended for same-page browser integrations and local automation.
Treat `worker` as the default transport for production-like interactions; use
`wasm` when you explicitly want direct module calls in the current page context.

- global: `window.GroupMixerAgent`
- ready event: `groupmixer:agent-ready`
- preferred transport: `worker`
- fallback transport: `wasm`
- discovery entrypoint: `capabilities()`

Example:

```ts
window.addEventListener('groupmixer:agent-ready', async () => {
  const api = window.GroupMixerAgent;
  const capabilities = await api.worker.capabilities();
  console.log(capabilities.top_level_operations.map((op) => op.operation_id));
});
```
