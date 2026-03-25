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

#[cfg(test)]
mod tests {
    use super::{http_contract_bindings, HttpSurfaceScope};
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
        for binding in http_contract_bindings() {
            assert_eq!(binding.scope, HttpSurfaceScope::OutOfScopeSupport);
            assert!(binding.operation_id.is_none());
        }
    }
}
