use crate::types::{ErrorCode, ExampleId, OperationId, OperationKind, SchemaId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationSpec {
    pub id: OperationId,
    pub summary: &'static str,
    pub kind: OperationKind,
    pub input_schema_ids: &'static [SchemaId],
    pub output_schema_ids: &'static [SchemaId],
    pub error_codes: &'static [ErrorCode],
    pub related_operation_ids: &'static [OperationId],
    pub example_ids: &'static [ExampleId],
}

pub const OPERATION_SPECS: &[OperationSpec] = &[];

pub fn operation_specs() -> &'static [OperationSpec] {
    OPERATION_SPECS
}
