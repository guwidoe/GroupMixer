#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpSurfaceScope {
    PublicContract,
    OutOfScopeSupport,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HttpContractBinding {
    pub method: &'static str,
    pub route_path: &'static str,
    pub operation_id: Option<&'static str>,
    pub scope: HttpSurfaceScope,
    pub note: &'static str,
}

const HTTP_BINDINGS: &[HttpContractBinding] = &[
    HttpContractBinding {
        method: "GET",
        route_path: "/api/v1/help",
        operation_id: None,
        scope: HttpSurfaceScope::PublicContract,
        note: "Bootstrap help endpoint for the public solver contract.",
    },
    HttpContractBinding {
        method: "GET",
        route_path: "/api/v1/help/{operation_id}",
        operation_id: None,
        scope: HttpSurfaceScope::PublicContract,
        note: "Local help endpoint for one public solver operation.",
    },
    HttpContractBinding {
        method: "POST",
        route_path: "/api/v1/solve",
        operation_id: Some("solve"),
        scope: HttpSurfaceScope::PublicContract,
        note: "Synchronous solve endpoint for the public solver contract.",
    },
    HttpContractBinding {
        method: "POST",
        route_path: "/api/v1/validate-problem",
        operation_id: Some("validate-problem"),
        scope: HttpSurfaceScope::PublicContract,
        note: "Input validation endpoint for the public solver contract.",
    },
    HttpContractBinding {
        method: "POST",
        route_path: "/api/v1/recommend-settings",
        operation_id: Some("recommend-settings"),
        scope: HttpSurfaceScope::PublicContract,
        note: "Configuration recommendation endpoint for the public solver contract.",
    },
    HttpContractBinding {
        method: "POST",
        route_path: "/api/v1/evaluate-input",
        operation_id: Some("evaluate-input"),
        scope: HttpSurfaceScope::PublicContract,
        note: "Input evaluation endpoint for the public solver contract.",
    },
    HttpContractBinding {
        method: "POST",
        route_path: "/api/v1/inspect-result",
        operation_id: Some("inspect-result"),
        scope: HttpSurfaceScope::PublicContract,
        note: "Result summary endpoint for the public solver contract.",
    },
    HttpContractBinding {
        method: "GET",
        route_path: "/api/v1/schemas",
        operation_id: Some("get-schema"),
        scope: HttpSurfaceScope::PublicContract,
        note: "Schema listing endpoint for the public solver contract.",
    },
    HttpContractBinding {
        method: "GET",
        route_path: "/api/v1/schemas/{schema_id}",
        operation_id: Some("get-schema"),
        scope: HttpSurfaceScope::PublicContract,
        note: "Schema lookup endpoint for the public solver contract.",
    },
    HttpContractBinding {
        method: "GET",
        route_path: "/api/v1/errors",
        operation_id: Some("inspect-errors"),
        scope: HttpSurfaceScope::PublicContract,
        note: "Error catalog endpoint for the public solver contract.",
    },
    HttpContractBinding {
        method: "GET",
        route_path: "/api/v1/errors/{error_code}",
        operation_id: Some("inspect-errors"),
        scope: HttpSurfaceScope::PublicContract,
        note: "Error-code lookup endpoint for the public solver contract.",
    },
    HttpContractBinding {
        method: "POST",
        route_path: "/api/v1/jobs",
        operation_id: None,
        scope: HttpSurfaceScope::OutOfScopeSupport,
        note: "Legacy async job submission route; intentionally outside the public solver-contract rollout until a contract-native async model exists.",
    },
    HttpContractBinding {
        method: "GET",
        route_path: "/api/v1/jobs/{job_id}/status",
        operation_id: None,
        scope: HttpSurfaceScope::OutOfScopeSupport,
        note: "Legacy async job status route; intentionally outside the public solver-contract rollout until a contract-native async model exists.",
    },
    HttpContractBinding {
        method: "GET",
        route_path: "/api/v1/jobs/{job_id}/result",
        operation_id: None,
        scope: HttpSurfaceScope::OutOfScopeSupport,
        note: "Legacy async job result route; intentionally outside the public solver-contract rollout until a contract-native async model exists.",
    },
];

pub fn http_contract_bindings() -> &'static [HttpContractBinding] {
    HTTP_BINDINGS
}

pub fn binding_for_operation_id(operation_id: &str) -> Option<&'static HttpContractBinding> {
    HTTP_BINDINGS.iter().find(|binding| binding.operation_id == Some(operation_id))
}

pub fn public_contract_bindings() -> impl Iterator<Item = &'static HttpContractBinding> {
    HTTP_BINDINGS
        .iter()
        .filter(|binding| binding.scope == HttpSurfaceScope::PublicContract)
}

#[cfg(test)]
mod tests {
    use super::{http_contract_bindings, public_contract_bindings, HttpSurfaceScope};
    use solver_contracts::operations::operation_spec;
    use std::collections::HashSet;

    #[test]
    fn route_bindings_are_unique_by_method_and_path() {
        let pairs: HashSet<_> = http_contract_bindings()
            .iter()
            .map(|binding| (binding.method, binding.route_path))
            .collect();
        assert_eq!(pairs.len(), http_contract_bindings().len());
    }

    #[test]
    fn legacy_job_routes_are_explicitly_marked_out_of_scope() {
        for binding in http_contract_bindings()
            .iter()
            .filter(|binding| binding.route_path.contains("/jobs"))
        {
            assert_eq!(binding.scope, HttpSurfaceScope::OutOfScopeSupport);
            assert!(binding.operation_id.is_none());
        }
    }

    #[test]
    fn public_contract_route_operation_ids_resolve_when_present() {
        for binding in public_contract_bindings() {
            if let Some(operation_id) = binding.operation_id {
                assert!(operation_spec(operation_id).is_some(), "missing op: {operation_id}");
            }
        }
    }
}
