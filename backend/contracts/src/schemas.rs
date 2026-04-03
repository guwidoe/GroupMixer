use crate::types::{
    ProgressUpdateContract, PublicErrorEnvelope, RecommendSettingsRequest, ResultSummary,
    ScenarioDefinitionContract, SchemaId, SolveRequest, SolveResponse, SolverCatalogResponse,
    SolverConfigurationContract, SolverDescriptorContract, ValidateRequest, ValidateResponse,
};
use schemars::{schema_for, Schema};

pub const SCHEMA_VERSION_V1: &str = "v1";

pub const SOLVE_REQUEST_SCHEMA_ID: &str = "solve-request";
pub const SOLVE_RESPONSE_SCHEMA_ID: &str = "solve-response";
pub const VALIDATE_REQUEST_SCHEMA_ID: &str = "validate-request";
pub const VALIDATE_RESPONSE_SCHEMA_ID: &str = "validate-response";
pub const SCENARIO_DEFINITION_SCHEMA_ID: &str = "scenario-definition";
pub const RECOMMEND_SETTINGS_REQUEST_SCHEMA_ID: &str = "recommend-settings-request";
pub const SOLVER_CONFIGURATION_SCHEMA_ID: &str = "solver-configuration";
pub const PROGRESS_UPDATE_SCHEMA_ID: &str = "progress-update";
pub const RESULT_SUMMARY_SCHEMA_ID: &str = "result-summary";
pub const PUBLIC_ERROR_ENVELOPE_SCHEMA_ID: &str = "public-error-envelope";
pub const SOLVER_DESCRIPTOR_SCHEMA_ID: &str = "solver-descriptor";
pub const SOLVER_CATALOG_SCHEMA_ID: &str = "solver-catalog";

#[derive(Debug, Clone, Copy)]
pub struct SchemaSpec {
    pub id: SchemaId,
    pub version: &'static str,
    pub export: fn() -> Schema,
}

const SCHEMA_SPECS: &[SchemaSpec] = &[
    SchemaSpec {
        id: SOLVE_REQUEST_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_solve_request_schema,
    },
    SchemaSpec {
        id: SOLVE_RESPONSE_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_solve_response_schema,
    },
    SchemaSpec {
        id: VALIDATE_REQUEST_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_validate_request_schema,
    },
    SchemaSpec {
        id: VALIDATE_RESPONSE_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_validate_response_schema,
    },
    SchemaSpec {
        id: SCENARIO_DEFINITION_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_scenario_definition_schema,
    },
    SchemaSpec {
        id: RECOMMEND_SETTINGS_REQUEST_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_recommend_settings_request_schema,
    },
    SchemaSpec {
        id: SOLVER_CONFIGURATION_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_solver_configuration_schema,
    },
    SchemaSpec {
        id: PROGRESS_UPDATE_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_progress_update_schema,
    },
    SchemaSpec {
        id: RESULT_SUMMARY_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_result_summary_schema,
    },
    SchemaSpec {
        id: PUBLIC_ERROR_ENVELOPE_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_public_error_envelope_schema,
    },
    SchemaSpec {
        id: SOLVER_DESCRIPTOR_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_solver_descriptor_schema,
    },
    SchemaSpec {
        id: SOLVER_CATALOG_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_solver_catalog_schema,
    },
];

pub fn schema_specs() -> &'static [SchemaSpec] {
    SCHEMA_SPECS
}

pub fn schema_spec(id: &str) -> Option<&'static SchemaSpec> {
    SCHEMA_SPECS.iter().find(|spec| spec.id == id)
}

pub fn export_schema(id: &str) -> Option<Schema> {
    schema_spec(id).map(|spec| (spec.export)())
}

fn export_solve_request_schema() -> Schema {
    schema_for!(SolveRequest)
}

fn export_solve_response_schema() -> Schema {
    schema_for!(SolveResponse)
}

fn export_validate_request_schema() -> Schema {
    schema_for!(ValidateRequest)
}

fn export_validate_response_schema() -> Schema {
    schema_for!(ValidateResponse)
}

fn export_scenario_definition_schema() -> Schema {
    schema_for!(ScenarioDefinitionContract)
}

fn export_recommend_settings_request_schema() -> Schema {
    schema_for!(RecommendSettingsRequest)
}

fn export_solver_configuration_schema() -> Schema {
    schema_for!(SolverConfigurationContract)
}

fn export_progress_update_schema() -> Schema {
    schema_for!(ProgressUpdateContract)
}

fn export_result_summary_schema() -> Schema {
    schema_for!(ResultSummary)
}

fn export_public_error_envelope_schema() -> Schema {
    schema_for!(PublicErrorEnvelope)
}

fn export_solver_descriptor_schema() -> Schema {
    schema_for!(SolverDescriptorContract)
}

fn export_solver_catalog_schema() -> Schema {
    schema_for!(SolverCatalogResponse)
}

#[cfg(test)]
mod tests {
    use super::{export_schema, schema_specs};
    use std::collections::HashSet;

    #[test]
    fn schema_ids_are_unique() {
        let ids: HashSet<_> = schema_specs().iter().map(|spec| spec.id).collect();
        assert_eq!(ids.len(), schema_specs().len());
    }

    #[test]
    fn registered_schema_exports_succeed() {
        for spec in schema_specs() {
            let exported = export_schema(spec.id).expect("schema registered");
            assert!(exported.as_object().is_some() || exported.as_bool().is_some());
        }
    }
}
