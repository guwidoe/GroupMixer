# Operations Reference

> Generated from `solver-contracts`. Do not edit by hand. Regenerate with `cargo run -p solver-contracts --bin generate-reference`.

## `solve`

- summary: Run the solver for a complete optimization input.
- family: `solver`
- kind: `"compute"`
- description: Accept a full solver input, execute the optimization engine, and return the resulting schedule plus final metrics.
- input schemas: `solve-request`
- output schemas: `solve-response`
- error codes: `invalid-input`, `infeasible-problem`, `unsupported-constraint-kind`, `internal-error`
- related operations: `validate-problem`, `inspect-result`, `get-schema`, `inspect-errors`
- examples: `solve-happy-path`

## `validate-problem`

- summary: Validate solver input without running optimization.
- family: `validation`
- kind: `"inspect"`
- description: Check whether a solver input is structurally and semantically acceptable before invoking the solver.
- input schemas: `validate-request`
- output schemas: `validate-response`
- error codes: `invalid-input`, `unsupported-constraint-kind`, `infeasible-problem`, `internal-error`
- related operations: `solve`, `get-schema`, `inspect-errors`
- examples: `validate-invalid-constraint`

## `inspect-result`

- summary: Inspect lightweight metadata for an existing solver result.
- family: `results`
- kind: `"inspect"`
- description: Return summary-level result fields that are useful for follow-up inspection and discovery without requiring a full schedule walk.
- input schemas: `solve-response`
- output schemas: `result-summary`
- error codes: `invalid-input`, `internal-error`
- related operations: `solve`, `get-schema`, `inspect-errors`
- examples: `inspect-result-summary`

## `recommend-settings`

- summary: Recommend solver settings from a problem definition.
- family: `configuration`
- kind: `"compute"`
- description: Analyze a problem definition and return a recommended solver configuration without executing the main solve workflow.
- input schemas: `problem-definition`
- output schemas: `solver-configuration`
- error codes: `invalid-input`, `infeasible-problem`, `internal-error`
- related operations: `solve`, `validate-problem`, `get-schema`
- examples: `recommend-settings-minimal`

## `evaluate-input`

- summary: Evaluate an existing scheduled input without running search.
- family: `results`
- kind: `"inspect"`
- description: Accept a solve request that already includes an initial schedule, recompute scores, and return the resulting solver result payload.
- input schemas: `solve-request`
- output schemas: `solve-response`
- error codes: `invalid-input`, `infeasible-problem`, `internal-error`
- related operations: `inspect-result`, `solve`, `get-schema`
- examples: `evaluate-input-minimal`

## `get-schema`

- summary: Inspect a named public schema from the contract registry.
- family: `introspection`
- kind: `"read"`
- description: Return machine-readable schema metadata for one stable schema identifier.
- input schemas: (none)
- output schemas: (none)
- error codes: `unknown-schema`, `internal-error`
- related operations: `solve`, `validate-problem`, `inspect-result`, `inspect-errors`
- examples: `get-schema-solve-request`

## `inspect-errors`

- summary: Inspect the canonical public error catalog.
- family: `introspection`
- kind: `"read"`
- description: Return the stable error-code catalog so callers can understand failure meanings and follow related-help pointers.
- input schemas: (none)
- output schemas: `public-error-envelope`
- error codes: `unknown-operation`, `unknown-error-code`, `internal-error`
- related operations: `solve`, `validate-problem`, `inspect-result`, `get-schema`
- examples: `inspect-errors-public-error`

