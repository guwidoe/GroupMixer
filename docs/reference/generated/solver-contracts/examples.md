# Examples Reference

> Generated from `solver-contracts`. Do not edit by hand. Regenerate with `cargo run -p solver-contracts --bin generate-reference`.

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
      {"id": "team-1", "size": 2}
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
solver-cli solve input.json --pretty
```

#### http invocation

- format: `http`

```
POST /solve with the solve request JSON body
```

#### js invocation

- format: `javascript`

```
await groupmixer.solve(problemJson)
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
solver-cli validate input.json && solver-cli schema input
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
solver-cli schema solve-request
```

## `recommend-settings-minimal`

- operation: `recommend-settings`
- summary: Recommend solver settings from a problem definition.
- description: Shows a minimal problem definition and a representative recommended solver configuration.

### Snippets

#### problem definition json

- format: `json`
- schema: `problem-definition`

```
{
  "people": [
    {"id": "alice", "attributes": {}},
    {"id": "bob", "attributes": {}}
  ],
  "groups": [
    {"id": "team-1", "size": 2}
  ],
  "num_sessions": 1
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
solver-cli recommend problem.json --runtime 30 --pretty
```

## `evaluate-input-minimal`

- operation: `evaluate-input`
- summary: Evaluate a scheduled input without running search.
- description: Shows the shape of a representative evaluation result for an input that already includes an initial schedule.

### Snippets

#### evaluate invocation

- format: `shell`

```
solver-cli evaluate scheduled-input.json --pretty
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

