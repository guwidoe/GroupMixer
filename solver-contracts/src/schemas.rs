use crate::types::SchemaId;
use schemars::schema::RootSchema;

#[derive(Debug, Clone, Copy)]
pub struct SchemaSpec {
    pub id: SchemaId,
    pub version: &'static str,
    pub export: fn() -> RootSchema,
}

pub const SCHEMA_SPECS: &[SchemaSpec] = &[];

pub fn schema_specs() -> &'static [SchemaSpec] {
    SCHEMA_SPECS
}
