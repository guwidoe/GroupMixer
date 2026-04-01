# Solver Contracts Contributor Workflow

This document explains how to extend GroupMixer's **public solver-facing semantic surface** without creating competing truths across CLI, HTTP, WASM, and docs.

## Normative rule

Public semantic changes must flow in this order:

1. `gm-contracts`
2. interface projections
   - `gm-cli`
   - `gm-api`
   - `gm-wasm`
3. generated reference artifacts
   - `docs/reference/generated/gm-contracts/`
4. parity / freshness verification

If a change starts by editing a transport surface first, that change is backwards.

## Source-of-truth order

### 1. `gm-contracts`

This crate owns the canonical definitions of:

- operation IDs
- bootstrap metadata
- local-help graph
- schema IDs and schema exports
- public error codes, meanings, and recovery guidance
- examples and snippet metadata

If a semantic fact is public and solver-facing, it should be declared here first.

### 2. Transport projections

After `gm-contracts` changes, project those semantics into:

- `gm-cli`
- `gm-api`
- `gm-wasm`

Transport layers should stay thin. They may add native presentation details, but they must not invent different operation names, schema IDs, error codes, or recovery meanings.

Transport-specific semantic duplication is a defect.

### 3. Generated reference docs

Regenerate derived reference artifacts after semantic updates:

```bash
./tools/contracts_reference.sh generate
```

This updates the generated contract reference under:

- `docs/reference/generated/gm-contracts/README.md`
- `docs/reference/generated/gm-contracts/operations.md`
- `docs/reference/generated/gm-contracts/schemas.md`
- `docs/reference/generated/gm-contracts/errors.md`
- `docs/reference/generated/gm-contracts/examples.md`
- `docs/reference/generated/gm-contracts/catalog.json`
- `docs/reference/generated/gm-contracts/schemas/*.schema.json`

## How to add or change a public operation

1. update `backend/contracts/src/operations.rs`
   - add/update the stable operation ID
   - summary / description
   - schema references
   - error references
   - related operations
   - examples
2. update `backend/contracts/src/bootstrap.rs` if top-level discovery should change
3. update transport projections:
   - CLI command/binding/help
   - server route/binding/help
   - WASM export/binding/help
4. regenerate reference docs
5. run contract/parity validation

## How to add or change a schema

1. update the public DTO type or schema export source
2. register the schema in `backend/contracts/src/schemas.rs`
3. update any operation metadata that references the schema
4. update transport projections if they expose or consume the schema directly
5. regenerate reference docs
6. run contract/parity validation

## How to add or change a public error code

1. update `backend/contracts/src/errors.rs`
   - stable code
   - category
   - summary
   - why
   - recovery
   - related-help targets
2. update any affected operation metadata in `backend/contracts/src/operations.rs`
3. update transport-specific error projection layers:
   - `backend/cli/src/public_errors.rs`
   - `backend/api/src/api/handlers.rs`
   - `backend/wasm/src/public_errors.rs`
4. regenerate reference docs
5. run contract/parity validation

## Required local commands

### Regenerate derived reference artifacts

```bash
./tools/contracts_reference.sh generate
```

### Check for stale generated artifacts

```bash
./tools/contracts_reference.sh check
```

### Validate contract registries

```bash
cargo test -p gm-contracts
```

### Validate cross-surface parity

```bash
cargo test -p gm-cli
cargo test -p gm-api -- --nocapture
cargo test -p gm-wasm
```

### Validate the real browser consumer path

The canonical browser/WASM surface is now consumed through the webapp adapter in:

- `webapp/src/services/wasm/contracts.ts`
- compatibility facade: `webapp/src/services/wasm.ts`
- worker/runtime path: `webapp/src/services/solverWorker.ts` and `webapp/src/workers/solverWorker.ts`

Recommended local checks when changing the browser surface:

```bash
cd webapp
npm run test:runtime-safety:unit
npx tsc --noEmit
npx playwright test e2e/tests/workflows.spec.ts --project=chromium
```

### Normal repo verification entrypoint

`gate.sh` now includes the generated-reference freshness check via:

```bash
./tools/contracts_reference.sh check
```

and the Rust test phase exercises the cross-surface parity tests.

## Normal review expectation

A public semantic change is not complete until:

- `gm-contracts` is updated
- the affected projection(s) are updated
- generated reference artifacts are refreshed
- freshness/parity checks pass

## Browser naming / legacy policy

Canonical browser-facing WASM exports are now the clean structured names:

- `solve`
- `solve_with_progress`
- `validate_problem`
- `get_default_solver_configuration`
- `recommend_settings`
- `evaluate_input`
- `inspect_result`

Legacy JSON-string compatibility exports, where still retained, must be explicit
support shims with `*_legacy_json` names.

## Related docs

- `docs/AGENT_INTERFACE_ARCHITECTURE.md`
- `docs/reference/generated/gm-contracts/README.md`
