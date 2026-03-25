use crate::types::OperationId;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BootstrapSpec {
    pub top_level_operation_ids: &'static [OperationId],
}

pub const BOOTSTRAP_SPEC: BootstrapSpec = BootstrapSpec {
    top_level_operation_ids: &[],
};

pub fn bootstrap_spec() -> &'static BootstrapSpec {
    &BOOTSTRAP_SPEC
}
