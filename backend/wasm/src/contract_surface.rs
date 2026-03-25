use solver_contracts::operations::{
    EVALUATE_INPUT_OPERATION_ID, GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID,
    GET_SCHEMA_OPERATION_ID, INSPECT_ERRORS_OPERATION_ID, INSPECT_RESULT_OPERATION_ID,
    RECOMMEND_SETTINGS_OPERATION_ID, SOLVE_OPERATION_ID, VALIDATE_PROBLEM_OPERATION_ID,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WasmSurfaceScope {
    PublicContract,
    OutOfScopeSupport,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WasmContractBinding {
    pub export_name: &'static str,
    pub operation_id: Option<&'static str>,
    pub scope: WasmSurfaceScope,
    pub note: &'static str,
}

const WASM_BINDINGS: &[WasmContractBinding] = &[
    WasmContractBinding {
        export_name: "capabilities",
        operation_id: None,
        scope: WasmSurfaceScope::PublicContract,
        note: "Bootstrap capability listing derived from solver-contracts.",
    },
    WasmContractBinding {
        export_name: "get_operation_help",
        operation_id: None,
        scope: WasmSurfaceScope::PublicContract,
        note: "Local help lookup for a single operation from solver-contracts.",
    },
    WasmContractBinding {
        export_name: "list_schemas",
        operation_id: Some(GET_SCHEMA_OPERATION_ID),
        scope: WasmSurfaceScope::PublicContract,
        note: "Schema listing derived from solver-contracts.",
    },
    WasmContractBinding {
        export_name: "get_schema",
        operation_id: Some(GET_SCHEMA_OPERATION_ID),
        scope: WasmSurfaceScope::PublicContract,
        note: "Schema lookup derived from solver-contracts.",
    },
    WasmContractBinding {
        export_name: "list_public_errors",
        operation_id: Some(INSPECT_ERRORS_OPERATION_ID),
        scope: WasmSurfaceScope::PublicContract,
        note: "Public error catalog listing derived from solver-contracts.",
    },
    WasmContractBinding {
        export_name: "get_public_error",
        operation_id: Some(INSPECT_ERRORS_OPERATION_ID),
        scope: WasmSurfaceScope::PublicContract,
        note: "Public error lookup derived from solver-contracts.",
    },
    WasmContractBinding {
        export_name: "solve_with_progress",
        operation_id: Some(SOLVE_OPERATION_ID),
        scope: WasmSurfaceScope::PublicContract,
        note: "Primary contract-native solve export returning structured JS values and optional progress callbacks.",
    },
    WasmContractBinding {
        export_name: "solve_contract",
        operation_id: None,
        scope: WasmSurfaceScope::OutOfScopeSupport,
        note: "Compatibility alias for the older structured solve export name during migration.",
    },
    WasmContractBinding {
        export_name: "validate_problem_contract",
        operation_id: Some(VALIDATE_PROBLEM_OPERATION_ID),
        scope: WasmSurfaceScope::PublicContract,
        note: "Contract-native validation export returning the shared validation shape.",
    },
    WasmContractBinding {
        export_name: "get_default_solver_configuration",
        operation_id: Some(GET_DEFAULT_SOLVER_CONFIGURATION_OPERATION_ID),
        scope: WasmSurfaceScope::PublicContract,
        note: "Contract-native default configuration export returning structured JS values.",
    },
    WasmContractBinding {
        export_name: "recommend_settings",
        operation_id: Some(RECOMMEND_SETTINGS_OPERATION_ID),
        scope: WasmSurfaceScope::PublicContract,
        note: "Contract-native recommendation export returning structured JS values.",
    },
    WasmContractBinding {
        export_name: "recommend_settings_contract",
        operation_id: None,
        scope: WasmSurfaceScope::OutOfScopeSupport,
        note: "Compatibility alias for the older structured recommendation export name during migration.",
    },
    WasmContractBinding {
        export_name: "evaluate_input_contract",
        operation_id: Some(EVALUATE_INPUT_OPERATION_ID),
        scope: WasmSurfaceScope::PublicContract,
        note: "Contract-native evaluation export returning structured JS values.",
    },
    WasmContractBinding {
        export_name: "inspect_result_contract",
        operation_id: Some(INSPECT_RESULT_OPERATION_ID),
        scope: WasmSurfaceScope::PublicContract,
        note: "Contract-native result inspection export returning shared summaries.",
    },
    WasmContractBinding {
        export_name: "greet",
        operation_id: None,
        scope: WasmSurfaceScope::OutOfScopeSupport,
        note: "Example/demo export; not part of the public solver contract.",
    },
    WasmContractBinding {
        export_name: "init_panic_hook",
        operation_id: None,
        scope: WasmSurfaceScope::OutOfScopeSupport,
        note: "Runtime support export; not part of the public solver contract.",
    },
    WasmContractBinding {
        export_name: "solve",
        operation_id: None,
        scope: WasmSurfaceScope::OutOfScopeSupport,
        note: "Legacy JSON-string solve export retained for compatibility during the WASM contract rollout.",
    },
    WasmContractBinding {
        export_name: "validate_problem",
        operation_id: None,
        scope: WasmSurfaceScope::OutOfScopeSupport,
        note: "Legacy JSON-string validation export retained for compatibility during the WASM contract rollout.",
    },
    WasmContractBinding {
        export_name: "get_default_settings",
        operation_id: None,
        scope: WasmSurfaceScope::OutOfScopeSupport,
        note: "Legacy convenience export outside the public contract registry.",
    },
    WasmContractBinding {
        export_name: "evaluate_input",
        operation_id: None,
        scope: WasmSurfaceScope::OutOfScopeSupport,
        note: "Legacy JSON-string evaluation export retained for compatibility during the WASM contract rollout.",
    },
    WasmContractBinding {
        export_name: "test_callback_consistency",
        operation_id: None,
        scope: WasmSurfaceScope::OutOfScopeSupport,
        note: "Diagnostic export outside the public solver contract.",
    },
    WasmContractBinding {
        export_name: "get_recommended_settings",
        operation_id: None,
        scope: WasmSurfaceScope::OutOfScopeSupport,
        note: "Legacy JSON-string recommendation export retained for compatibility during the WASM contract rollout.",
    },
];

pub fn wasm_contract_bindings() -> &'static [WasmContractBinding] {
    WASM_BINDINGS
}

pub fn public_contract_bindings() -> impl Iterator<Item = &'static WasmContractBinding> {
    WASM_BINDINGS
        .iter()
        .filter(|binding| binding.scope == WasmSurfaceScope::PublicContract)
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
    use super::{binding_for_export, public_contract_bindings, wasm_contract_bindings, WasmSurfaceScope};
    use solver_contracts::{bootstrap::bootstrap_spec, operations::operation_spec};
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
                assert!(operation_spec(operation_id).is_some(), "missing op: {operation_id}");
            }
        }
    }

    #[test]
    fn bootstrap_style_public_exports_stay_within_top_level_contract_graph() {
        let top_level: HashSet<_> = bootstrap_spec().top_level_operation_ids.iter().copied().collect();
        for binding in public_contract_bindings() {
            if let Some(operation_id) = binding.operation_id {
                assert!(top_level.contains(operation_id), "{operation_id} not in bootstrap top-level ops");
            }
        }
    }

    #[test]
    fn legacy_and_compatibility_exports_are_explicitly_out_of_scope() {
        for export_name in [
            "solve",
            "solve_contract",
            "validate_problem",
            "get_default_settings",
            "evaluate_input",
            "get_recommended_settings",
            "recommend_settings_contract",
        ] {
            let binding = binding_for_export(export_name).expect("legacy binding");
            assert_eq!(binding.scope, WasmSurfaceScope::OutOfScopeSupport);
            assert!(binding.operation_id.is_none());
        }
    }
}
