use gm_contracts::operations::{
    EVALUATE_INPUT_OPERATION_ID, GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID,
    GET_SCHEMA_OPERATION_ID, GET_SOLVER_DESCRIPTOR_OPERATION_ID, INSPECT_ERRORS_OPERATION_ID,
    INSPECT_RESULT_OPERATION_ID, LIST_SOLVERS_OPERATION_ID, RECOMMEND_SETTINGS_OPERATION_ID,
    SOLVE_OPERATION_ID, VALIDATE_SCENARIO_OPERATION_ID,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WasmContractBinding {
    pub export_name: &'static str,
    pub operation_id: Option<&'static str>,
    pub note: &'static str,
}

const WASM_BINDINGS: &[WasmContractBinding] = &[
    WasmContractBinding {
        export_name: "capabilities",
        operation_id: None,
        note: "Bootstrap capability listing derived from gm-contracts.",
    },
    WasmContractBinding {
        export_name: "get_operation_help",
        operation_id: None,
        note: "Local help lookup for a single operation from gm-contracts.",
    },
    WasmContractBinding {
        export_name: "list_schemas",
        operation_id: Some(GET_SCHEMA_OPERATION_ID),
        note: "Schema listing derived from gm-contracts.",
    },
    WasmContractBinding {
        export_name: "get_schema",
        operation_id: Some(GET_SCHEMA_OPERATION_ID),
        note: "Schema lookup derived from gm-contracts.",
    },
    WasmContractBinding {
        export_name: "list_public_errors",
        operation_id: Some(INSPECT_ERRORS_OPERATION_ID),
        note: "Public error catalog listing derived from gm-contracts.",
    },
    WasmContractBinding {
        export_name: "get_public_error",
        operation_id: Some(INSPECT_ERRORS_OPERATION_ID),
        note: "Public error lookup derived from gm-contracts.",
    },
    WasmContractBinding {
        export_name: "list_solvers",
        operation_id: Some(LIST_SOLVERS_OPERATION_ID),
        note: "Solver catalog listing derived from gm-core and projected through gm-contracts.",
    },
    WasmContractBinding {
        export_name: "get_solver_descriptor",
        operation_id: Some(GET_SOLVER_DESCRIPTOR_OPERATION_ID),
        note: "Single solver-family descriptor lookup derived from gm-core and projected through gm-contracts.",
    },
    WasmContractBinding {
        export_name: "solve",
        operation_id: Some(SOLVE_OPERATION_ID),
        note: "Primary contract-native solve export returning structured JS values.",
    },
    WasmContractBinding {
        export_name: "solve_with_progress",
        operation_id: Some(SOLVE_OPERATION_ID),
        note: "Contract-native solve export returning structured JS values with optional progress callbacks.",
    },
    WasmContractBinding {
        export_name: "solve_with_progress_snapshot",
        operation_id: Some(SOLVE_OPERATION_ID),
        note: "Mailbox-oriented solve export returning structured solve results while emitting scalar-only progress snapshots.",
    },
    WasmContractBinding {
        export_name: "validate_scenario",
        operation_id: Some(VALIDATE_SCENARIO_OPERATION_ID),
        note: "Contract-native validation export returning the shared validation shape.",
    },
    WasmContractBinding {
        export_name: "get_default_solver_configuration",
        operation_id: Some(GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID),
        note: "Contract-native default configuration export returning structured JS values.",
    },
    WasmContractBinding {
        export_name: "recommend_settings",
        operation_id: Some(RECOMMEND_SETTINGS_OPERATION_ID),
        note: "Contract-native recommendation export returning structured JS values.",
    },
    WasmContractBinding {
        export_name: "evaluate_input",
        operation_id: Some(EVALUATE_INPUT_OPERATION_ID),
        note: "Contract-native evaluation export returning structured JS values.",
    },
    WasmContractBinding {
        export_name: "inspect_result",
        operation_id: Some(INSPECT_RESULT_OPERATION_ID),
        note: "Contract-native result inspection export returning shared summaries.",
    },
    WasmContractBinding {
        export_name: "init_panic_hook",
        operation_id: None,
        note: "Runtime support export required for browser-facing panic diagnostics.",
    },
];

pub fn wasm_contract_bindings() -> &'static [WasmContractBinding] {
    WASM_BINDINGS
}

pub fn public_contract_bindings() -> impl Iterator<Item = &'static WasmContractBinding> {
    WASM_BINDINGS.iter()
}

pub fn binding_for_export(export_name: &str) -> Option<&'static WasmContractBinding> {
    WASM_BINDINGS
        .iter()
        .find(|binding| binding.export_name == export_name)
}

pub fn binding_for_operation_id(operation_id: &str) -> Option<&'static WasmContractBinding> {
    WASM_BINDINGS
        .iter()
        .find(|binding| binding.operation_id == Some(operation_id))
}

#[cfg(test)]
mod tests {
    use super::{binding_for_export, public_contract_bindings, wasm_contract_bindings};
    use gm_contracts::{bootstrap::bootstrap_spec, operations::operation_spec};
    use std::collections::HashSet;

    #[test]
    fn export_bindings_are_unique() {
        let exports: HashSet<_> = wasm_contract_bindings()
            .iter()
            .map(|binding| binding.export_name)
            .collect();
        assert_eq!(exports.len(), wasm_contract_bindings().len());
    }

    #[test]
    fn public_contract_bindings_resolve_registered_operations_when_present() {
        for binding in public_contract_bindings() {
            if let Some(operation_id) = binding.operation_id {
                assert!(
                    operation_spec(operation_id).is_some(),
                    "missing op: {operation_id}"
                );
            }
        }
    }

    #[test]
    fn bootstrap_style_public_exports_stay_within_top_level_contract_graph() {
        let top_level: HashSet<_> = bootstrap_spec()
            .top_level_operation_ids
            .iter()
            .copied()
            .collect();
        for binding in public_contract_bindings() {
            if let Some(operation_id) = binding.operation_id {
                assert!(
                    top_level.contains(operation_id),
                    "{operation_id} not in bootstrap top-level ops"
                );
            }
        }
    }

    #[test]
    fn runtime_support_exports_are_explicit() {
        let binding = binding_for_export("init_panic_hook").expect("runtime binding");
        assert!(binding.operation_id.is_none());
    }
}
