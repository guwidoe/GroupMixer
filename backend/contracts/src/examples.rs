use crate::errors::supported_constraint_kind_names;
use crate::operations::{
    EVALUATE_INPUT_OPERATION_ID, GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID,
    GET_SCHEMA_OPERATION_ID, INSPECT_ERRORS_OPERATION_ID, INSPECT_RESULT_OPERATION_ID,
    RECOMMEND_SETTINGS_OPERATION_ID, SOLVE_OPERATION_ID, VALIDATE_PROBLEM_OPERATION_ID,
};
use crate::schemas::{
    PROGRESS_UPDATE_SCHEMA_ID, PUBLIC_ERROR_ENVELOPE_SCHEMA_ID,
    RECOMMEND_SETTINGS_REQUEST_SCHEMA_ID, RESULT_SUMMARY_SCHEMA_ID, SOLVER_CONFIGURATION_SCHEMA_ID,
    SOLVE_REQUEST_SCHEMA_ID, SOLVE_RESPONSE_SCHEMA_ID, VALIDATE_RESPONSE_SCHEMA_ID,
};
use crate::types::{ExampleId, OperationId, SchemaId};
use serde::Serialize;
use std::sync::LazyLock;

pub const SOLVE_HAPPY_PATH_EXAMPLE_ID: &str = "solve-happy-path";
pub const VALIDATE_INVALID_CONSTRAINT_EXAMPLE_ID: &str = "validate-invalid-constraint";
pub const INSPECT_RESULT_SUMMARY_EXAMPLE_ID: &str = "inspect-result-summary";
pub const PUBLIC_ERROR_LOOKUP_EXAMPLE_ID: &str = "inspect-errors-public-error";
pub const GET_SCHEMA_EXAMPLE_ID: &str = "get-schema-solve-request";
pub const DEFAULT_SOLVER_CONFIGURATION_EXAMPLE_ID: &str = "default-solver-configuration";
pub const RECOMMEND_SETTINGS_EXAMPLE_ID: &str = "recommend-settings-minimal";
pub const SOLVE_PROGRESS_UPDATE_EXAMPLE_ID: &str = "solve-progress-update";
pub const EVALUATE_INPUT_EXAMPLE_ID: &str = "evaluate-input-minimal";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ReferenceSnippetFormat {
    Json,
    Shell,
    Http,
    JavaScript,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ReferenceSnippet {
    pub label: &'static str,
    pub format: ReferenceSnippetFormat,
    pub schema_id: Option<SchemaId>,
    pub content: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ExampleSpec {
    pub id: ExampleId,
    pub operation_id: OperationId,
    pub summary: &'static str,
    pub description: &'static str,
    pub snippets: &'static [ReferenceSnippet],
}

const SOLVE_HAPPY_PATH_SNIPPETS: &[ReferenceSnippet] = &[
    ReferenceSnippet {
        label: "solve request json",
        format: ReferenceSnippetFormat::Json,
        schema_id: Some(SOLVE_REQUEST_SCHEMA_ID),
        content: r#"{
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
}"#,
    },
    ReferenceSnippet {
        label: "solve response json",
        format: ReferenceSnippetFormat::Json,
        schema_id: Some(SOLVE_RESPONSE_SCHEMA_ID),
        content: r#"{
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
}"#,
    },
    ReferenceSnippet {
        label: "cli invocation",
        format: ReferenceSnippetFormat::Shell,
        schema_id: None,
        content: "gm-cli solve input.json --pretty",
    },
    ReferenceSnippet {
        label: "http invocation",
        format: ReferenceSnippetFormat::Http,
        schema_id: None,
        content: "POST /solve with the solve request JSON body",
    },
    ReferenceSnippet {
        label: "js invocation",
        format: ReferenceSnippetFormat::JavaScript,
        schema_id: None,
        content: "await groupmixer.solve(request)",
    },
];

const SOLVE_PROGRESS_UPDATE_SNIPPETS: &[ReferenceSnippet] = &[
    ReferenceSnippet {
        label: "progress update json",
        format: ReferenceSnippetFormat::Json,
        schema_id: Some(PROGRESS_UPDATE_SCHEMA_ID),
        content: r#"{
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
}"#,
    },
    ReferenceSnippet {
        label: "transport note",
        format: ReferenceSnippetFormat::JavaScript,
        schema_id: None,
        content:
            "Solve-capable transports may emit progress-update payloads while a solve is running.",
    },
];

const VALIDATE_INVALID_CONSTRAINT_SNIPPETS: &[ReferenceSnippet] = &[
    ReferenceSnippet {
        label: "validation response json",
        format: ReferenceSnippetFormat::Json,
        schema_id: Some(VALIDATE_RESPONSE_SCHEMA_ID),
        content: r#"{
  "valid": false,
  "issues": [
    {
      "code": "unsupported-constraint-kind",
      "message": "Constraint kind 'ShouldBeTogether' is not supported.",
      "path": "constraints[0].type"
    }
  ]
}"#,
    },
    ReferenceSnippet {
        label: "cli recovery",
        format: ReferenceSnippetFormat::Shell,
        schema_id: None,
        content: "gm-cli validate input.json && gm-cli schema input",
    },
    ReferenceSnippet {
        label: "http recovery",
        format: ReferenceSnippetFormat::Http,
        schema_id: None,
        content: "GET /help?operation=validate-problem then GET /schemas/solve-request",
    },
];

const INSPECT_RESULT_SUMMARY_SNIPPETS: &[ReferenceSnippet] = &[ReferenceSnippet {
    label: "result summary json",
    format: ReferenceSnippetFormat::Json,
    schema_id: Some(RESULT_SUMMARY_SCHEMA_ID),
    content: r#"{
  "final_score": 1.0,
  "unique_contacts": 1,
  "repetition_penalty": 0,
  "attribute_balance_penalty": 0,
  "constraint_penalty": 0,
  "effective_seed": 7,
  "stop_reason": "max_iterations_reached"
}"#,
}];

static PUBLIC_ERROR_LOOKUP_SNIPPETS: LazyLock<Vec<ReferenceSnippet>> = LazyLock::new(|| {
    vec![ReferenceSnippet {
        label: "public error envelope",
        format: ReferenceSnippetFormat::Json,
        schema_id: Some(PUBLIC_ERROR_ENVELOPE_SCHEMA_ID),
        content: Box::leak(render_public_error_lookup_snippet().into_boxed_str()),
    }]
});

const GET_SCHEMA_SNIPPETS: &[ReferenceSnippet] = &[ReferenceSnippet {
    label: "schema lookup",
    format: ReferenceSnippetFormat::Shell,
    schema_id: Some(SOLVE_REQUEST_SCHEMA_ID),
    content: "gm-cli schema solve-request",
}];

const DEFAULT_SOLVER_CONFIGURATION_SNIPPETS: &[ReferenceSnippet] = &[ReferenceSnippet {
    label: "default solver configuration",
    format: ReferenceSnippetFormat::Json,
    schema_id: Some(SOLVER_CONFIGURATION_SCHEMA_ID),
    content: r#"{
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
}"#,
}];

const RECOMMEND_SETTINGS_SNIPPETS: &[ReferenceSnippet] = &[
    ReferenceSnippet {
        label: "recommend settings request",
        format: ReferenceSnippetFormat::Json,
        schema_id: Some(RECOMMEND_SETTINGS_REQUEST_SCHEMA_ID),
        content: r#"{
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
}"#,
    },
    ReferenceSnippet {
        label: "recommended solver configuration",
        format: ReferenceSnippetFormat::Json,
        schema_id: Some(SOLVER_CONFIGURATION_SCHEMA_ID),
        content: r#"{
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
}"#,
    },
    ReferenceSnippet {
        label: "cli invocation",
        format: ReferenceSnippetFormat::Shell,
        schema_id: None,
        content: "gm-cli recommend problem.json --runtime 30 --pretty",
    },
];

const EVALUATE_INPUT_SNIPPETS: &[ReferenceSnippet] = &[
    ReferenceSnippet {
        label: "evaluate invocation",
        format: ReferenceSnippetFormat::Shell,
        schema_id: None,
        content: "gm-cli evaluate scheduled-input.json --pretty",
    },
    ReferenceSnippet {
        label: "evaluate result json",
        format: ReferenceSnippetFormat::Json,
        schema_id: Some(SOLVE_RESPONSE_SCHEMA_ID),
        content: r#"{
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
}"#,
    },
];

static EXAMPLE_SPECS: LazyLock<Vec<ExampleSpec>> = LazyLock::new(|| {
    vec![
        ExampleSpec {
            id: SOLVE_HAPPY_PATH_EXAMPLE_ID,
            operation_id: SOLVE_OPERATION_ID,
            summary: "Minimal successful solve request/response pair.",
            description: "Shows the smallest complete optimization input and a representative successful result plus transport-specific invocation snippets.",
            snippets: SOLVE_HAPPY_PATH_SNIPPETS,
        },
        ExampleSpec {
            id: SOLVE_PROGRESS_UPDATE_EXAMPLE_ID,
            operation_id: SOLVE_OPERATION_ID,
            summary: "Representative progress update emitted while solve is running.",
            description: "Shows the stable progress payload shape that solve-capable transports can emit during execution.",
            snippets: SOLVE_PROGRESS_UPDATE_SNIPPETS,
        },
        ExampleSpec {
            id: VALIDATE_INVALID_CONSTRAINT_EXAMPLE_ID,
            operation_id: VALIDATE_PROBLEM_OPERATION_ID,
            summary: "Validation failure for an unsupported constraint kind.",
            description: "Demonstrates a negative path where the caller gets a precise validation issue and recovery pointers.",
            snippets: VALIDATE_INVALID_CONSTRAINT_SNIPPETS,
        },
        ExampleSpec {
            id: INSPECT_RESULT_SUMMARY_EXAMPLE_ID,
            operation_id: INSPECT_RESULT_OPERATION_ID,
            summary: "Inspect a lightweight result summary.",
            description: "Shows the compact result metadata shape used by result-inspection affordances.",
            snippets: INSPECT_RESULT_SUMMARY_SNIPPETS,
        },
        ExampleSpec {
            id: PUBLIC_ERROR_LOOKUP_EXAMPLE_ID,
            operation_id: INSPECT_ERRORS_OPERATION_ID,
            summary: "Canonical public error example.",
            description: "Shows the structured public error envelope shape shared across projections.",
            snippets: PUBLIC_ERROR_LOOKUP_SNIPPETS.as_slice(),
        },
        ExampleSpec {
            id: GET_SCHEMA_EXAMPLE_ID,
            operation_id: GET_SCHEMA_OPERATION_ID,
            summary: "Schema lookup example.",
            description: "Shows a transport-specific invocation that targets the solve-request schema.",
            snippets: GET_SCHEMA_SNIPPETS,
        },
        ExampleSpec {
            id: DEFAULT_SOLVER_CONFIGURATION_EXAMPLE_ID,
            operation_id: GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID,
            summary: "Read the canonical default solver configuration.",
            description: "Shows the baseline solver configuration callers can start from before applying runtime-aware recommendation or manual tuning.",
            snippets: DEFAULT_SOLVER_CONFIGURATION_SNIPPETS,
        },
        ExampleSpec {
            id: RECOMMEND_SETTINGS_EXAMPLE_ID,
            operation_id: RECOMMEND_SETTINGS_OPERATION_ID,
            summary: "Recommend solver settings from an explicit runtime-aware request.",
            description: "Shows a minimal recommend-settings request carrying a problem definition plus desired runtime and a representative recommended solver configuration.",
            snippets: RECOMMEND_SETTINGS_SNIPPETS,
        },
        ExampleSpec {
            id: EVALUATE_INPUT_EXAMPLE_ID,
            operation_id: EVALUATE_INPUT_OPERATION_ID,
            summary: "Evaluate a scheduled input without running search.",
            description: "Shows the shape of a representative evaluation result for an input that already includes an initial schedule.",
            snippets: EVALUATE_INPUT_SNIPPETS,
        },
    ]
});

fn render_public_error_lookup_snippet() -> String {
    let valid_alternatives = supported_constraint_kind_names()
        .iter()
        .map(|kind| format!("      \"{kind}\""))
        .collect::<Vec<_>>()
        .join(",\n");

    format!(
        r#"{{
  "error": {{
    "code": "unsupported-constraint-kind",
    "message": "Constraint kind 'ShouldBeTogether' is not supported.",
    "where_path": "constraints[0].type",
    "why": "The caller referenced a constraint type outside the supported public contract.",
    "valid_alternatives": [
{valid_alternatives}
    ],
    "recovery": "Inspect the relevant schema/help and replace the unsupported constraint kind.",
    "related_help": ["validate-problem", "get-schema"]
  }}
}}"#
    )
}

pub fn example_specs() -> &'static [ExampleSpec] {
    &EXAMPLE_SPECS
}

pub fn example_spec(id: &str) -> Option<&'static ExampleSpec> {
    EXAMPLE_SPECS.iter().find(|spec| spec.id == id)
}

#[cfg(test)]
mod tests {
    use super::{example_spec, example_specs, ReferenceSnippetFormat};
    use crate::operations::operation_spec;
    use crate::schemas::export_schema;
    use jsonschema::validator_for;
    use serde_json::Value;
    use std::collections::HashSet;

    #[test]
    fn example_ids_are_unique() {
        let ids: HashSet<_> = example_specs().iter().map(|spec| spec.id).collect();
        assert_eq!(ids.len(), example_specs().len());
    }

    #[test]
    fn example_operation_links_resolve() {
        for example in example_specs() {
            assert!(
                operation_spec(example.operation_id).is_some(),
                "missing operation for example {}",
                example.id
            );
        }
    }

    #[test]
    fn json_snippets_validate_against_registered_schemas() {
        for example in example_specs() {
            for snippet in example.snippets {
                if snippet.format != ReferenceSnippetFormat::Json {
                    continue;
                }
                let schema_id = snippet.schema_id.expect("json snippets declare schema id");
                let schema = export_schema(schema_id).expect("registered schema");
                let schema_json = serde_json::to_value(schema).expect("schema json");
                let validator = validator_for(&schema_json).expect("validator");
                let instance: Value = serde_json::from_str(snippet.content).expect("valid json");
                if let Err(error) = validator.validate(&instance) {
                    panic!(
                        "example '{}' snippet '{}' does not validate against schema '{}': {error}",
                        example.id, snippet.label, schema_id
                    );
                }
            }
        }
    }

    #[test]
    fn lookup_returns_registered_example() {
        let spec = example_spec("solve-happy-path").expect("registered example");
        assert_eq!(spec.operation_id, "solve");
    }
}
