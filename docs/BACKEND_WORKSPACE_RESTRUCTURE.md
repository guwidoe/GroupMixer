# Backend Workspace Restructure Policy

This document records the scope and compatibility policy for the `backend/` workspace move.

## Scope decision

The contracts rollout is now complete enough that the workspace move can be treated as a **mechanical structure cleanup**.

This restructure includes moving these package directories under `backend/`:

- `solver-core/` -> `backend/core/`
- `solver-contracts/` -> `backend/contracts/`
- `solver-cli/` -> `backend/cli/`
- `solver-server/` -> `backend/api/`
- `solver-wasm/` -> `backend/wasm/`

This restructure intentionally does **not** move `solver-benchmarking/` in the same change.

Reason:
- the proposed target shape for the stabilized contract/runtime surfaces is `backend/{core,contracts,cli,api,wasm}`
- `solver-benchmarking` is operator/tooling infrastructure rather than part of that core runtime surface
- excluding it keeps this move narrower and more mechanical

## Compatibility policy

This move is **directory-level only** for the main backend/runtime crates.

### Stable / unchanged

The following remain unchanged intentionally:

- Cargo package names
  - `solver-core`
  - `solver-contracts`
  - `solver-cli`
  - `solver-server`
  - `solver-wasm`
- Rust crate names used in code
- binary names
  - `solver-cli`
  - `solver-server`
- `cargo -p ...` invocation names
- public semantic contracts
- generated contract reference artifact locations under `docs/reference/generated/solver-contracts/`

### Deliberate rename scope

`solver-server` becomes `api` **only at the directory level**:

- old path: `solver-server/`
- new path: `backend/api/`
- unchanged package name: `solver-server`
- unchanged binary name: `solver-server`

This keeps the path layout cleaner without introducing an unnecessary package rename in the same mechanical move.

## Contributor impact

After the move:

- path-based docs/scripts should use `backend/...`
- package-based cargo commands should continue using the existing package names unless a future explicit package rename is approved

Examples:

```bash
cd backend/wasm && wasm-pack build --target web --out-dir ../../webapp/public/pkg
cargo run -p solver-server
cargo test -p solver-cli
```

## Non-goals

This move does **not**:

- change public solver semantics
- rename Cargo packages
- rename binaries
- change benchmark artifact semantics
- refactor unrelated code while moving paths

If a future package rename is desired, it should be proposed and executed as a separate compatibility-reviewed change.

## Post-move outcome

The backend workspace move intentionally introduced **no Cargo package rename**
and **no binary rename**.

Compatibility impact after the move:

- unchanged:
  - `cargo test -p solver-core`
  - `cargo test -p solver-contracts`
  - `cargo test -p solver-cli`
  - `cargo test -p solver-server`
  - `cargo test -p solver-wasm`
  - `cargo run -p solver-server`
  - `cargo run -p solver-cli -- ...`
- changed:
  - directory navigation and path-based docs/scripts now use `backend/...`

This means the move is a repository-layout compatibility change, not a public
Cargo package or binary compatibility break.
