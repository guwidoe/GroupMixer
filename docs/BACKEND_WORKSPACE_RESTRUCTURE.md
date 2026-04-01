# Backend Workspace Restructure Policy

This document records the scope and compatibility policy for the `backend/` workspace move.

## Scope decision

The contracts rollout is now complete enough that the workspace move can be treated as a **mechanical structure cleanup**.

This restructure includes moving these package directories under `backend/`:

- `core/` -> `backend/core/`
- `contracts/` -> `backend/contracts/`
- `cli/` -> `backend/cli/`
- `api/` -> `backend/api/`
- `wasm/` -> `backend/wasm/`
- `benchmarking/` -> `backend/benchmarking/`

The benchmark crate and machine-readable benchmark assets now also live under
`backend/benchmarking/` so the backend tooling surface is physically aligned
with the rest of the workspace.

## Compatibility policy

This move is **directory-level only** for the main backend/runtime crates.

### Stable / unchanged

The following remain unchanged intentionally:

- public semantic contracts
- the `backend/...` directory shape itself

### Deliberate rename scope

The follow-up cleanup also renamed the Rust packages/binaries from legacy
`solver-*` names to short `gm-*` names so package names, crate names, binary
names, and backend paths now align more cleanly.

## Contributor impact

After the move:

- path-based docs/scripts should use `backend/...`
- package-based cargo commands should use the `gm-*` package names

Examples:

```bash
cd backend/wasm && wasm-pack build --target web --out-dir ../../webapp/public/pkg
cargo run -p gm-api
cargo test -p gm-cli
```

## Non-goals

This move does **not**:

- change public solver semantics
- change benchmark artifact semantics
- refactor unrelated runtime behavior while moving paths/names

If a future package rename is desired, it should be proposed and executed as a separate compatibility-reviewed change.

## Post-move outcome

The backend workspace move intentionally introduced **no Cargo package rename**
and **no binary rename**.

Compatibility impact after the move:

- unchanged:
  - `cargo test -p gm-core`
  - `cargo test -p gm-contracts`
  - `cargo test -p gm-cli`
  - `cargo test -p gm-api`
  - `cargo test -p gm-wasm`
  - `cargo run -p gm-api`
  - `cargo run -p gm-cli -- ...`
- changed:
  - directory navigation and path-based docs/scripts now use `backend/...`

This means the move is a repository-layout compatibility change, not a public
Cargo package or binary compatibility break.
