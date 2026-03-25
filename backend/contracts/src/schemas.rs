use crate::types::{
    ProblemDefinitionContract, PublicErrorEnvelope, ResultSummary, SchemaId,
    SolveRequest, SolveResponse, SolverConfigurationContract, ValidateRequest, ValidateResponse,
};
use schemars::{schema::RootSchema, schema_for};

pub const SCHEMA_VERSION_V1: &str = "v1";

pub const SOLVE_REQUEST_SCHEMA_ID: &str = "solve-request";
pub const SOLVE_RESPONSE_SCHEMA_ID: &str = "solve-response";
pub const VALIDATE_REQUEST_SCHEMA_ID: &str = "validate-request";
pub const VALIDATE_RESPONSE_SCHEMA_ID: &str = "validate-response";
pub const PROBLEM_DEFINITION_SCHEMA_ID: &str = "problem-definition";
pub const SOLVER_CONFIGURATION_SCHEMA_ID: &str = "solver-configuration";
pub const RESULT_SUMMARY_SCHEMA_ID: &str = "result-summary";
pub const PUBLIC_ERROR_ENVELOPE_SCHEMA_ID: &str = "public-error-envelope";

#[derive(Debug, Clone, Copy)]
pub struct SchemaSpec {
    pub id: SchemaId,
    pub version: &'static str,
    pub export: fn() -> RootSchema,
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
        id: PROBLEM_DEFINITION_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_problem_definition_schema,
    },
    SchemaSpec {
        id: SOLVER_CONFIGURATION_SCHEMA_ID,
        version: SCHEMA_VERSION_V1,
        export: export_solver_configuration_schema,
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
];

pub fn schema_specs() -> &'static [SchemaSpec] {
    SCHEMA_SPECS
}

pub fn schema_spec(id: &str) -> Option<&'static SchemaSpec> {
    SCHEMA_SPECS.iter().find(|spec| spec.id == id)
}

pub fn export_schema(id: &str) -> Option<RootSchema> {
    schema_spec(id).map(|spec| (spec.export)())
}

fn export_solve_request_schema() -> RootSchema {
    schema_for!(SolveRequest)
}

fn export_solve_response_schema() -> RootSchema {
    schema_for!(SolveResponse)
}

fn export_validate_request_schema() -> RootSchema {
    schema_for!(ValidateRequest)
}

fn export_validate_response_schema() -> RootSchema {
    schema_for!(ValidateResponse)
}

fn export_problem_definition_schema() -> RootSchema {
    schema_for!(ProblemDefinitionContract)
}

fn export_solver_configuration_schema() -> RootSchema {
    schema_for!(SolverConfigurationContract)
}

fn export_result_summary_schema() -> RootSchema {
    schema_for!(ResultSummary)
}

fn export_public_error_envelope_schema() -> RootSchema {
    schema_for!(PublicErrorEnvelope)
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
            assert!(exported.schema.object.is_some() || exported.schema.subschemas.is_some());
        }
    }
}
