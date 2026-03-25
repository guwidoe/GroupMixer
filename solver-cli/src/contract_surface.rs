use solver_contracts::operations::{
    EVALUATE_INPUT_OPERATION_ID, GET_SCHEMA_OPERATION_ID, INSPECT_ERRORS_OPERATION_ID,
    RECOMMEND_SETTINGS_OPERATION_ID, SOLVE_OPERATION_ID, VALIDATE_PROBLEM_OPERATION_ID,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CliSurfaceScope {
    PublicContract,
    OutOfScopeSupport,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CliContractBinding {
    pub command_name: &'static str,
    pub operation_id: Option<&'static str>,
    pub scope: CliSurfaceScope,
    pub note: &'static str,
}

const CLI_BINDINGS: &[CliContractBinding] = &[
    CliContractBinding {
        command_name: "solve",
        operation_id: Some(SOLVE_OPERATION_ID),
        scope: CliSurfaceScope::PublicContract,
        note: "Primary public solve workflow.",
    },
    CliContractBinding {
        command_name: "validate",
        operation_id: Some(VALIDATE_PROBLEM_OPERATION_ID),
        scope: CliSurfaceScope::PublicContract,
        note: "Public validation workflow for solver input.",
    },
    CliContractBinding {
        command_name: "recommend",
        operation_id: Some(RECOMMEND_SETTINGS_OPERATION_ID),
        scope: CliSurfaceScope::PublicContract,
        note: "Public recommendation workflow for solver settings.",
    },
    CliContractBinding {
        command_name: "evaluate",
        operation_id: Some(EVALUATE_INPUT_OPERATION_ID),
        scope: CliSurfaceScope::PublicContract,
        note: "Public result/evaluation workflow for scheduled inputs.",
    },
    CliContractBinding {
        command_name: "schema",
        operation_id: Some(GET_SCHEMA_OPERATION_ID),
        scope: CliSurfaceScope::PublicContract,
        note: "Public schema-inspection workflow.",
    },
    CliContractBinding {
        command_name: "errors",
        operation_id: Some(INSPECT_ERRORS_OPERATION_ID),
        scope: CliSurfaceScope::PublicContract,
        note: "Public error-catalog inspection workflow.",
    },
    CliContractBinding {
        command_name: "capabilities",
        operation_id: None,
        scope: CliSurfaceScope::PublicContract,
        note: "Public bootstrap/capability listing derived from solver-contracts.",
    },
    CliContractBinding {
        command_name: "benchmark",
        operation_id: None,
        scope: CliSurfaceScope::OutOfScopeSupport,
        note: "Repo benchmark tooling; intentionally outside the public solver contract for this CLI rollout.",
    },
];

pub fn cli_contract_bindings() -> &'static [CliContractBinding] {
    CLI_BINDINGS
}

pub fn public_cli_contract_bindings() -> impl Iterator<Item = &'static CliContractBinding> {
    CLI_BINDINGS
        .iter()
        .filter(|binding| binding.scope == CliSurfaceScope::PublicContract)
}

pub fn binding_for_command(command_name: &str) -> Option<&'static CliContractBinding> {
    CLI_BINDINGS.iter().find(|binding| binding.command_name == command_name)
}

pub fn binding_for_operation_id(operation_id: &str) -> Option<&'static CliContractBinding> {
    CLI_BINDINGS
        .iter()
        .find(|binding| binding.operation_id == Some(operation_id))
}

#[cfg(test)]
mod tests {
    use super::{binding_for_command, cli_contract_bindings, public_cli_contract_bindings, CliSurfaceScope};
    use solver_contracts::operations::operation_spec;
    use std::collections::HashSet;

    #[test]
    fn all_cli_bindings_have_unique_command_names() {
        let names: HashSet<_> = cli_contract_bindings()
            .iter()
            .map(|binding| binding.command_name)
            .collect();
        assert_eq!(names.len(), cli_contract_bindings().len());
    }

    #[test]
    fn every_public_contract_binding_has_a_registered_operation_or_is_bootstrap() {
        for binding in public_cli_contract_bindings() {
            if binding.command_name == "capabilities" {
                assert!(binding.operation_id.is_none());
                continue;
            }
            let operation_id = binding.operation_id.expect("public binding operation");
            assert!(operation_spec(operation_id).is_some(), "missing op for {operation_id}");
        }
    }

    #[test]
    fn benchmark_is_explicitly_out_of_scope_for_public_contract_rollout() {
        let benchmark = binding_for_command("benchmark").expect("benchmark binding");
        assert_eq!(benchmark.scope, CliSurfaceScope::OutOfScopeSupport);
        assert!(benchmark.operation_id.is_none());
    }
}
