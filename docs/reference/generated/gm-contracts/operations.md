# Operations Reference

> Generated from `gm-contracts`. Do not edit by hand. Regenerate with `cargo run -p gm-contracts --bin generate-reference`.

## `list-solvers`

- summary: List the available solver families.
- family: `solver-catalog`
- kind: `"read"`
- description: Return the currently compiled solver families plus their stable identifiers and capability summaries.
- input schemas: (none)
- output schemas: `solver-catalog`
- progress schemas: (none)
- error codes: `internal-error`
- related operations: `get-solver-descriptor`, `get-default-solver-configuration`, `recommend-settings`, `solve`, `get-schema`
- examples: `list-solvers`

## `get-solver-descriptor`

- summary: Inspect one solver-family descriptor.
- family: `solver-catalog`
- kind: `"read"`
- description: Return capability metadata and accepted configuration identifiers for one available solver family.
- input schemas: (none)
- output schemas: `solver-descriptor`
- progress schemas: (none)
- error codes: `invalid-input`, `internal-error`
- related operations: `list-solvers`, `get-default-solver-configuration`, `recommend-settings`, `solve`, `get-schema`
- examples: `solver-descriptor`

## `solve`

- summary: Run the solver for a complete optimization input.
- family: `solver`
- kind: `"compute"`
- description: Accept a full solver input, execute the optimization engine, and return the resulting schedule plus final metrics.
- input schemas: `solve-request`
- output schemas: `solve-response`
- progress schemas: `progress-update`
- error codes: `invalid-input`, `infeasible-scenario`, `unsupported-constraint-kind`, `internal-error`
- related operations: `validate-scenario`, `inspect-result`, `list-solvers`, `get-solver-descriptor`, `get-schema`, `inspect-errors`, `get-default-solver-configuration`, `recommend-settings`
- examples: `solve-happy-path`, `solve-progress-update`

## `validate-scenario`

- summary: Validate a scenario input without running optimization.
- family: `validation`
- kind: `"inspect"`
- description: Check whether a scenario request is structurally and semantically acceptable before invoking the solver.
- input schemas: `validate-request`
- output schemas: `validate-response`
- progress schemas: (none)
- error codes: `invalid-input`, `unsupported-constraint-kind`, `infeasible-scenario`, `internal-error`
- related operations: `solve`, `get-schema`, `inspect-errors`
- examples: `validate-invalid-constraint`

## `inspect-result`

- summary: Inspect lightweight metadata for an existing solver result.
- family: `results`
- kind: `"inspect"`
- description: Return summary-level result fields that are useful for follow-up inspection and discovery without requiring a full schedule walk.
- input schemas: `solve-response`
- output schemas: `result-summary`
- progress schemas: (none)
- error codes: `invalid-input`, `internal-error`
- related operations: `solve`, `get-schema`, `inspect-errors`
- examples: `inspect-result-summary`

## `get-default-solver-configuration`

- summary: Get the canonical default solver configuration.
- family: `configuration`
- kind: `"read"`
- description: Return the baseline solver configuration that callers can use as a clean starting point before applying scenario-aware tuning or manual edits.
- input schemas: (none)
- output schemas: `solver-configuration`
- progress schemas: (none)
- error codes: `internal-error`
- related operations: `recommend-settings`, `solve`, `list-solvers`, `get-solver-descriptor`, `get-schema`
- examples: `default-solver-configuration`

## `recommend-settings`

- summary: Recommend solver settings from an explicit recommendation request.
- family: `configuration`
- kind: `"compute"`
- description: Analyze a scenario definition plus runtime target and return a recommended solver configuration without executing the main solve workflow.
- input schemas: `recommend-settings-request`
- output schemas: `solver-configuration`
- progress schemas: (none)
- error codes: `invalid-input`, `infeasible-scenario`, `internal-error`
- related operations: `get-default-solver-configuration`, `list-solvers`, `get-solver-descriptor`, `solve`, `validate-scenario`, `get-schema`
- examples: `recommend-settings-minimal`

## `evaluate-input`

- summary: Evaluate an existing scheduled input without running search.
- family: `results`
- kind: `"inspect"`
- description: Accept a solve request that already includes an initial schedule, recompute scores, and return the resulting solver result payload.
- input schemas: `solve-request`
- output schemas: `solve-response`
- progress schemas: (none)
- error codes: `invalid-input`, `infeasible-scenario`, `internal-error`
- related operations: `inspect-result`, `solve`, `get-schema`
- examples: `evaluate-input-minimal`

## `get-schema`

- summary: Inspect a named public schema from the contract registry.
- family: `introspection`
- kind: `"read"`
- description: Return machine-readable schema metadata for one stable schema identifier.
- input schemas: (none)
- output schemas: (none)
- progress schemas: (none)
- error codes: `unknown-schema`, `internal-error`
- related operations: `solve`, `validate-scenario`, `inspect-result`, `list-solvers`, `get-solver-descriptor`, `get-default-solver-configuration`, `recommend-settings`, `inspect-errors`
- examples: `get-schema-solve-request`

## `inspect-errors`

- summary: Inspect the canonical public error catalog.
- family: `introspection`
- kind: `"read"`
- description: Return the stable error-code catalog so callers can understand failure meanings and follow related-help pointers.
- input schemas: (none)
- output schemas: `public-error-envelope`
- progress schemas: (none)
- error codes: `unknown-operation`, `unknown-error-code`, `internal-error`
- related operations: `solve`, `validate-scenario`, `inspect-result`, `list-solvers`, `get-solver-descriptor`, `get-default-solver-configuration`, `recommend-settings`, `get-schema`
- examples: `inspect-errors-public-error`

