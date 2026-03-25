use crate::types::{ExampleId, OperationId, SchemaId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExampleSpec {
    pub id: ExampleId,
    pub operation_id: OperationId,
    pub schema_id: SchemaId,
    pub summary: &'static str,
    pub body: &'static str,
}

pub const EXAMPLE_SPECS: &[ExampleSpec] = &[];

pub fn example_specs() -> &'static [ExampleSpec] {
    EXAMPLE_SPECS
}
