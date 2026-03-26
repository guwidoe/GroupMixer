use axum::{extract::Path, Json};
use solver_cli::{
    contract_surface::{binding_for_operation_id as cli_binding_for_operation_id, public_cli_contract_bindings},
    projected_error_codes, projected_schema_ids,
};
use solver_contracts::{
    bootstrap::bootstrap_spec,
    operations::operation_spec,
    schemas::schema_specs,
    errors::error_specs,
};
use solver_server::api::{
    contract_surface::public_contract_bindings as public_http_contract_bindings,
    handlers::{bootstrap_help_handler, error_list_handler, operation_help_handler, schema_list_handler},
};
use solver_wasm::{
    contract_projection::{
        build_capabilities_response, build_error_catalog, build_operation_help_response,
        build_schema_summaries,
    },
    contract_surface::public_contract_bindings as public_wasm_contract_bindings,
};
use std::collections::HashSet;

#[test]
fn operation_ids_match_across_cli_server_wasm_and_contracts() {
    let contract_operation_ids: HashSet<_> = bootstrap_spec()
        .top_level_operation_ids
        .iter()
        .copied()
        .collect();

    let cli_operation_ids: HashSet<_> = public_cli_contract_bindings()
        .filter_map(|binding| binding.operation_id)
        .collect();
    assert_eq!(cli_operation_ids, contract_operation_ids, "CLI operation ids drifted from solver-contracts");

    let http_operation_ids: HashSet<_> = public_http_contract_bindings()
        .filter_map(|binding| binding.operation_id)
        .collect();
    assert_eq!(http_operation_ids, contract_operation_ids, "HTTP operation ids drifted from solver-contracts");

    let wasm_operation_ids: HashSet<_> = public_wasm_contract_bindings()
        .filter_map(|binding| binding.operation_id)
        .collect();
    assert_eq!(wasm_operation_ids, contract_operation_ids, "WASM operation ids drifted from solver-contracts");
}

#[tokio::test]
async fn schema_ids_and_error_codes_match_across_surfaces() {
    let contract_schema_ids: HashSet<_> = schema_specs().iter().map(|schema| schema.id).collect();
    let contract_error_codes: HashSet<_> = error_specs().iter().map(|error| error.code).collect();

    let cli_schema_ids: HashSet<_> = projected_schema_ids().into_iter().collect();
    assert_eq!(cli_schema_ids, contract_schema_ids, "CLI schema ids drifted from solver-contracts");

    let Json(server_schemas) = schema_list_handler().await;
    let server_schema_ids: HashSet<_> = server_schemas.into_iter().map(|schema| schema.id).collect();
    assert_eq!(server_schema_ids, contract_schema_ids, "HTTP schema ids drifted from solver-contracts");

    let wasm_schema_ids: HashSet<_> = build_schema_summaries().into_iter().map(|schema| schema.id).collect();
    assert_eq!(wasm_schema_ids, contract_schema_ids, "WASM schema ids drifted from solver-contracts");

    let cli_error_codes: HashSet<_> = projected_error_codes().into_iter().collect();
    assert_eq!(cli_error_codes, contract_error_codes, "CLI error codes drifted from solver-contracts");

    let Json(server_errors) = error_list_handler().await;
    let server_error_codes: HashSet<_> = server_errors.into_iter().map(|error| error.code).collect();
    assert_eq!(server_error_codes, contract_error_codes, "HTTP error codes drifted from solver-contracts");

    let wasm_error_codes: HashSet<_> = build_error_catalog()
        .into_iter()
        .map(|error| error.error.code)
        .collect();
    assert_eq!(wasm_error_codes, contract_error_codes, "WASM error codes drifted from solver-contracts");
}

#[tokio::test]
async fn related_help_targets_resolve_consistently_across_surfaces() {
    let Json(server_bootstrap) = bootstrap_help_handler().await;
    let server_bootstrap_ids: HashSet<_> = server_bootstrap
        .operations
        .iter()
        .map(|operation| operation.operation_id)
        .collect();
    let contract_operation_ids: HashSet<_> = bootstrap_spec()
        .top_level_operation_ids
        .iter()
        .copied()
        .collect();
    assert_eq!(server_bootstrap_ids, contract_operation_ids, "HTTP bootstrap drifted from solver-contracts");

    let wasm_bootstrap = build_capabilities_response();
    let wasm_bootstrap_ids: HashSet<_> = wasm_bootstrap
        .top_level_operations
        .iter()
        .map(|operation| operation.operation_id)
        .collect();
    assert_eq!(wasm_bootstrap_ids, contract_operation_ids, "WASM bootstrap drifted from solver-contracts");

    for operation_id in bootstrap_spec().top_level_operation_ids {
        let contract_related: HashSet<_> = operation_spec(operation_id)
            .expect("registered operation")
            .related_operation_ids
            .iter()
            .copied()
            .collect();

        for related_operation_id in &contract_related {
            assert!(
                cli_binding_for_operation_id(related_operation_id).is_some(),
                "CLI missing related-help binding for {} -> {}",
                operation_id,
                related_operation_id
            );
        }

        let Json(server_help) = operation_help_handler(Path((*operation_id).to_string()))
            .await
            .expect("HTTP local help should resolve");
        let server_related: HashSet<_> = server_help
            .related_operations
            .iter()
            .map(|operation| operation.operation_id)
            .collect();
        assert_eq!(server_related, contract_related, "HTTP related-help drift for {operation_id}");
        for related in &server_help.related_operations {
            assert_eq!(related.help_path, format!("/api/v1/help/{}", related.operation_id));
        }

        let wasm_help = build_operation_help_response(operation_id)
            .expect("WASM local help should resolve");
        let wasm_related: HashSet<_> = wasm_help
            .related_operations
            .iter()
            .map(|operation| operation.operation_id)
            .collect();
        assert_eq!(wasm_related, contract_related, "WASM related-help drift for {operation_id}");
        for related in &wasm_help.related_operations {
            assert_eq!(related.help_export_name, "get_operation_help");
            let resolved = build_operation_help_response(related.help_target)
                .expect("WASM related help target should resolve");
            assert_eq!(resolved.operation.id, related.operation_id);
        }
    }
}
