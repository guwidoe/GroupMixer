pub mod contract_surface;

pub fn projected_schema_ids() -> Vec<&'static str> {
    gm_contracts::schemas::schema_specs()
        .iter()
        .map(|spec| spec.id)
        .collect()
}

pub fn projected_error_codes() -> Vec<&'static str> {
    gm_contracts::errors::error_specs()
        .iter()
        .map(|spec| spec.code)
        .collect()
}
