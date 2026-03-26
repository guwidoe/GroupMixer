use crate::operations::top_level_operation_ids;
use crate::types::OperationId;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BootstrapSpec {
    pub title: &'static str,
    pub summary: &'static str,
    pub discovery_note: &'static str,
    pub top_level_operation_ids: &'static [OperationId],
}

pub fn bootstrap_spec() -> BootstrapSpec {
    BootstrapSpec {
        title: "GroupMixer solver contracts",
        summary: "Static bootstrap for the public solver affordance graph shared by CLI, HTTP, and WASM projections.",
        discovery_note: "The surface is static and self-describing. Start from a top-level operation, then request local help for that operation and follow its related affordances.",
        top_level_operation_ids: top_level_operation_ids(),
    }
}

#[cfg(test)]
mod tests {
    use super::bootstrap_spec;
    use crate::operations::operation_spec;

    #[test]
    fn bootstrap_references_only_registered_top_level_operations() {
        for id in bootstrap_spec().top_level_operation_ids {
            assert!(operation_spec(id).is_some(), "missing bootstrap op: {id}");
        }
    }
}
