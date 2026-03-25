use crate::{
    bootstrap,
    errors::error_spec,
    examples::{example_spec, example_specs, ReferenceSnippetFormat},
    operations::operation_specs,
    schemas::schema_spec,
};

#[test]
fn every_operation_schema_reference_resolves() {
    for operation in operation_specs() {
        for schema_id in operation
            .input_schema_ids
            .iter()
            .chain(operation.output_schema_ids.iter())
        {
            assert!(
                schema_spec(schema_id).is_some(),
                "operation '{}' references missing schema '{}'",
                operation.id,
                schema_id
            );
        }
    }
}

#[test]
fn every_operation_error_reference_resolves() {
    for operation in operation_specs() {
        for error_code in operation.error_codes {
            assert!(
                error_spec(error_code).is_some(),
                "operation '{}' references missing error '{}'",
                operation.id,
                error_code
            );
        }
    }
}

#[test]
fn every_operation_example_reference_resolves() {
    for operation in operation_specs() {
        for example_id in operation.example_ids {
            assert!(
                example_spec(example_id).is_some(),
                "operation '{}' references missing example '{}'",
                operation.id,
                example_id
            );
        }
    }
}

#[test]
fn every_example_schema_reference_resolves() {
    for example in example_specs() {
        for snippet in example.snippets {
            if let Some(schema_id) = snippet.schema_id {
                assert!(
                    schema_spec(schema_id).is_some(),
                    "example '{}' snippet '{}' references missing schema '{}'",
                    example.id,
                    snippet.label,
                    schema_id
                );
            }
        }
    }
}

#[test]
fn bootstrap_only_references_top_level_registered_operations() {
    for operation_id in bootstrap::bootstrap_spec().top_level_operation_ids {
        assert!(
            operation_specs().iter().any(|spec| spec.id == *operation_id),
            "bootstrap references missing operation '{}'",
            operation_id
        );
    }
}

#[test]
fn json_examples_are_backed_by_schema_ids() {
    for example in example_specs() {
        for snippet in example.snippets {
            if snippet.format == ReferenceSnippetFormat::Json {
                assert!(
                    snippet.schema_id.is_some(),
                    "json example '{}' snippet '{}' must declare a schema id",
                    example.id,
                    snippet.label
                );
            }
        }
    }
}
