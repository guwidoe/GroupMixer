use crate::types::{ErrorCategory, ErrorCode, OperationId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublicErrorSpec {
    pub code: ErrorCode,
    pub category: ErrorCategory,
    pub summary: &'static str,
    pub recovery: &'static str,
    pub related_help_operation_ids: &'static [OperationId],
}

pub const ERROR_SPECS: &[PublicErrorSpec] = &[];

pub fn error_specs() -> &'static [PublicErrorSpec] {
    ERROR_SPECS
}
