# Examples Reference

> Generated from `gm-contracts`. Do not edit by hand. Regenerate with `cargo run -p gm-contracts --bin generate-reference`.

## `solve-happy-path`

- operation: `solve`
- summary: Minimal successful solve request/response pair.
- description: Shows the smallest complete optimization input and a representative successful result plus transport-specific invocation snippets.

### Snippets

#### solve request json

- format: `json`
- schema: `solve-request`

```
{
  "problem": {
    "people": [
      {"id": "alice", "attributes": {"department": "eng"}},
      {"id": "bob", "attributes": {"department": "design"}}
    ],
    "groups": [
      {"id": "team-1", "size": 2, "session_sizes": [2]}
    ],
    "num_sessions": 1
  },
  "initial_schedule": null,
  "objectives": [
    {"type": "maximize_unique_contacts", "weight": 1.0}
  ],
  "constraints": [],
  "solver": {
    "solver_type": "SimulatedAnnealing",
    "stop_conditions": {
      "max_iterations": 100,
      "time_limit_seconds": null,
      "no_improvement_iterations": null
    },
    "solver_params": {
      "solver_type": "SimulatedAnnealing",
      "initial_temperature": 10.0,
      "final_temperature": 0.1,
      "cooling_schedule": "geometric",
      "reheat_after_no_improvement": 0,
      "reheat_cycles": 0
    },
    "logging": {},
    "telemetry": {},
    "seed": 7,
    "move_policy": null,
    "allowed_sessions": null
  }
}
```

#### solve response json

- format: `json`
- schema: `solve-response`

```
{
  "final_score": 1.0,
  "schedule": {
    "session_0": {
      "team-1": ["alice", "bob"]
    }
  },
  "unique_contacts": 1,
  "repetition_penalty": 0,
  "attribute_balance_penalty": 0,
  "constraint_penalty": 0,
  "no_improvement_count": 0,
  "weighted_repetition_penalty": 0.0,
  "weighted_constraint_penalty": 0.0,
  "effective_seed": 7,
  "move_policy": null,
  "stop_reason": "max_iterations_reached",
  "benchmark_telemetry": null
}
```

#### cli invocation

- format: `shell`

```
gm-cli solve input.json --pretty
```

#### http invocation

- format: `http`

```
POST /solve with the solve request JSON body
```

#### js invocation

- format: `javascript`

```
await groupmixer.solve(request)
```

## `solve-progress-update`

- operation: `solve`
- summary: Representative progress update emitted while solve is running.
- description: Shows the stable progress payload shape that solve-capable transports can emit during execution.

### Snippets

#### progress update json

- format: `json`
- schema: `progress-update`

```
{
  "iteration": 250,
  "max_iterations": 1000,
  "temperature": 12.5,
  "current_score": 18.0,
  "best_score": 14.0,
  "current_contacts": 22,
  "best_contacts": 24,
  "repetition_penalty": 2,
  "elapsed_seconds": 1.75,
  "no_improvement_count": 40,
  "clique_swaps_tried": 12,
  "clique_swaps_accepted": 4,
  "clique_swaps_rejected": 8,
  "transfers_tried": 80,
  "transfers_accepted": 21,
  "transfers_rejected": 59,
  "swaps_tried": 158,
  "swaps_accepted": 44,
  "swaps_rejected": 114,
  "overall_acceptance_rate": 0.276,
  "recent_acceptance_rate": 0.31,
  "avg_attempted_move_delta": -0.42,
  "avg_accepted_move_delta": -1.15,
  "biggest_accepted_increase": 3.0,
  "biggest_attempted_increase": 7.0,
  "current_repetition_penalty": 2.0,
  "current_balance_penalty": 0.0,
  "current_constraint_penalty": 0.0,
  "best_repetition_penalty": 1.0,
  "best_balance_penalty": 0.0,
  "best_constraint_penalty": 0.0,
  "reheats_performed": 0,
  "iterations_since_last_reheat": 250,
  "local_optima_escapes": 6,
  "avg_time_per_iteration_ms": 0.45,
  "cooling_progress": 0.25,
  "clique_swap_success_rate": 0.3333333333333333,
  "transfer_success_rate": 0.2625,
  "swap_success_rate": 0.27848101265822783,
  "score_variance": 1.8,
  "search_efficiency": 5.7,
  "best_schedule": {
    "session_0": {
      "team-1": ["alice", "bob"],
      "team-2": ["carol", "dave"]
    }
  },
  "effective_seed": 7,
  "move_policy": null,
  "stop_reason": null
}
```

#### transport note

- format: `javascript`

```
Solve-capable transports may emit progress-update payloads while a solve is running.
```

## `validate-invalid-constraint`

- operation: `validate-problem`
- summary: Validation failure for an unsupported constraint kind.
- description: Demonstrates a negative path where the caller gets a precise validation issue and recovery pointers.

### Snippets

#### validation response json

- format: `json`
- schema: `validate-response`

```
{
  "valid": false,
  "issues": [
    {
      "code": "unsupported-constraint-kind",
      "message": "Constraint kind 'ShouldBeTogether' is not supported.",
      "path": "constraints[0].type"
    }
  ]
}
```

#### cli recovery

- format: `shell`

```
gm-cli validate input.json && gm-cli schema input
```

#### http recovery

- format: `http`

```
GET /help?operation=validate-problem then GET /schemas/solve-request
```

## `inspect-result-summary`

- operation: `inspect-result`
- summary: Inspect a lightweight result summary.
- description: Shows the compact result metadata shape used by result-inspection affordances.

### Snippets

#### result summary json

- format: `json`
- schema: `result-summary`

```
{
  "final_score": 1.0,
  "unique_contacts": 1,
  "repetition_penalty": 0,
  "attribute_balance_penalty": 0,
  "constraint_penalty": 0,
  "effective_seed": 7,
  "stop_reason": "max_iterations_reached"
}
```

## `inspect-errors-public-error`

- operation: `inspect-errors`
- summary: Canonical public error example.
- description: Shows the structured public error envelope shape shared across projections.

### Snippets

#### public error envelope

- format: `json`
- schema: `public-error-envelope`

```
{
  "error": {
    "code": "unsupported-constraint-kind",
    "message": "Constraint kind 'ShouldBeTogether' is not supported.",
    "where_path": "constraints[0].type",
    "why": "The caller referenced a constraint type outside the supported public contract.",
    "valid_alternatives": [
      "RepeatEncounter",
      "AttributeBalance",
      "MustStayTogether",
      "ShouldStayTogether",
      "ShouldNotBeTogether",
      "ImmovablePerson",
      "ImmovablePeople",
      "PairMeetingCount"
    ],
    "recovery": "Inspect the relevant schema/help and replace the unsupported constraint kind.",
    "related_help": ["validate-problem", "get-schema"]
  }
}
```

## `get-schema-solve-request`

- operation: `get-schema`
- summary: Schema lookup example.
- description: Shows a transport-specific invocation that targets the solve-request schema.

### Snippets

#### schema lookup

- format: `shell`
- schema: `solve-request`

```
gm-cli schema solve-request
```

## `default-solver-configuration`

- operation: `get-default-solver-configuration`
- summary: Read the canonical default solver configuration.
- description: Shows the baseline solver configuration callers can start from before applying runtime-aware recommendation or manual tuning.

### Snippets

#### default solver configuration

- format: `json`
- schema: `solver-configuration`

```
{
  "solver_type": "SimulatedAnnealing",
  "stop_conditions": {
    "max_iterations": 10000,
    "time_limit_seconds": 30,
    "no_improvement_iterations": 5000
  },
  "solver_params": {
    "solver_type": "SimulatedAnnealing",
    "initial_temperature": 1.0,
    "final_temperature": 0.01,
    "cooling_schedule": "geometric",
    "reheat_cycles": 0,
    "reheat_after_no_improvement": 0
  },
  "logging": {
    "log_frequency": 1000,
    "log_initial_state": true,
    "log_duration_and_score": true,
    "display_final_schedule": true,
    "log_initial_score_breakdown": true,
    "log_final_score_breakdown": true,
    "log_stop_condition": true,
    "debug_validate_invariants": false,
    "debug_dump_invariant_context": false
  },
  "telemetry": {},
  "seed": null,
  "move_policy": null,
  "allowed_sessions": null
}
```

## `recommend-settings-minimal`

- operation: `recommend-settings`
- summary: Recommend solver settings from an explicit runtime-aware request.
- description: Shows a minimal recommend-settings request carrying a problem definition plus desired runtime and a representative recommended solver configuration.

### Snippets

#### recommend settings request

- format: `json`
- schema: `recommend-settings-request`

```
{
  "problem_definition": {
    "people": [
      {"id": "alice", "attributes": {}},
      {"id": "bob", "attributes": {}}
    ],
    "groups": [
      {"id": "team-1", "size": 2, "session_sizes": [2]}
    ],
    "num_sessions": 1
  },
  "objectives": [],
  "constraints": [],
  "desired_runtime_seconds": 30
}
```

#### recommended solver configuration

- format: `json`
- schema: `solver-configuration`

```
{
  "solver_type": "SimulatedAnnealing",
  "stop_conditions": {
    "max_iterations": 1000,
    "time_limit_seconds": 30,
    "no_improvement_iterations": 500
  },
  "solver_params": {
    "solver_type": "SimulatedAnnealing",
    "initial_temperature": 100.0,
    "final_temperature": 0.1,
    "cooling_schedule": "geometric",
    "reheat_cycles": 0,
    "reheat_after_no_improvement": 0
  },
  "logging": {},
  "telemetry": {},
  "seed": null,
  "move_policy": null,
  "allowed_sessions": null
}
```

#### cli invocation

- format: `shell`

```
gm-cli recommend problem.json --runtime 30 --pretty
```

## `evaluate-input-minimal`

- operation: `evaluate-input`
- summary: Evaluate a scheduled input without running search.
- description: Shows the shape of a representative evaluation result for an input that already includes an initial schedule.

### Snippets

#### evaluate invocation

- format: `shell`

```
gm-cli evaluate scheduled-input.json --pretty
```

#### evaluate result json

- format: `json`
- schema: `solve-response`

```
{
  "final_score": 1.0,
  "schedule": {
    "session_0": {
      "team-1": ["alice", "bob"]
    }
  },
  "unique_contacts": 1,
  "repetition_penalty": 0,
  "attribute_balance_penalty": 0,
  "constraint_penalty": 0,
  "no_improvement_count": 0,
  "weighted_repetition_penalty": 0.0,
  "weighted_constraint_penalty": 0.0,
  "effective_seed": null,
  "move_policy": null,
  "stop_reason": "max_iterations_reached",
  "benchmark_telemetry": null
}
```

