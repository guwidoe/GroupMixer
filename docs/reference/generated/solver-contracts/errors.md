# Error Reference

> Generated from `solver-contracts`. Do not edit by hand. Regenerate with `cargo run -p solver-contracts --bin generate-reference`.

## `invalid-input`

- category: `"invalid_input"`
- summary: The provided request or payload shape is invalid.
- why: The caller supplied malformed JSON, a missing required field, or an unexpected value shape for the requested operation.
- recovery: Inspect the relevant input schema and local help for the targeted operation, then resend a valid request.
- related help operations: `validate-problem`, `get-schema`

## `unknown-operation`

- category: `"unsupported"`
- summary: The requested operation is not part of the public solver contract.
- why: The caller referenced an operation ID or affordance name that is not registered in the shared contracts graph.
- recovery: Start from bootstrap help, then choose one of the registered top-level operations.
- related help operations: `solve`, `validate-problem`, `get-schema`

## `unknown-schema`

- category: `"unsupported"`
- summary: The requested schema ID is not registered.
- why: The caller requested a schema identifier that does not exist in the contract registry.
- recovery: Inspect the schema lookup/help affordance and request one of the registered schema IDs.
- related help operations: `get-schema`

## `unknown-error-code`

- category: `"unsupported"`
- summary: The requested public error code is not registered.
- why: The caller requested an error code identifier that does not exist in the contract registry.
- recovery: Inspect the error-catalog help affordance and request one of the registered public error codes.
- related help operations: `inspect-errors`

## `infeasible-problem`

- category: `"infeasible"`
- summary: The problem definition is internally inconsistent or infeasible.
- why: The solver cannot satisfy the required constraints, capacities, or session assignments for the provided input.
- recovery: Validate the problem, inspect constraint settings, and adjust the input so a valid schedule is possible.
- related help operations: `validate-problem`, `solve`

## `unsupported-constraint-kind`

- category: `"unsupported"`
- summary: A constraint kind or similar enum-like value is not supported.
- why: The caller referenced a named domain feature that is not part of the currently supported public contract.
- recovery: Inspect the relevant schema and contract help, then replace the unsupported value with a supported one.
- related help operations: `validate-problem`, `get-schema`

## `permission-denied`

- category: `"permission"`
- summary: The caller lacks permission for the requested operation.
- why: The current transport/runtime surface rejected the action under its active rights model.
- recovery: Use a permitted read-only affordance, obtain the required credentials/scope, or switch to an allowed workflow.
- related help operations: `solve`, `validate-problem`

## `internal-error`

- category: `"internal"`
- summary: An unexpected internal failure occurred.
- why: The operation failed for a reason outside the normal public validation and feasibility model.
- recovery: Capture the error details, inspect local help for the attempted operation, and retry only if the failure is known to be transient.
- related help operations: `solve`, `validate-problem`, `inspect-result`, `inspect-errors`

