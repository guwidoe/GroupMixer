use crate::{
    bootstrap::bootstrap_spec,
    errors::error_specs,
    examples::{example_specs, ReferenceSnippetFormat},
    operations::operation_specs,
    schemas::{export_schema, schema_specs},
};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

pub const DEFAULT_REFERENCE_OUTPUT_DIR: &str = "docs/reference/generated/solver-contracts";
const GENERATED_NOTICE: &str = "> Generated from `solver-contracts`. Do not edit by hand. Regenerate with `cargo run -p solver-contracts --bin generate-reference`.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GeneratedArtifact {
    pub relative_path: PathBuf,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReferenceArtifacts {
    pub files: Vec<GeneratedArtifact>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WriteMode {
    Write,
    Check,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReferenceMismatch {
    pub path: PathBuf,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WriteSummary {
    pub files_written: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckSummary {
    pub checked_files: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReferenceArtifactsResult {
    Written(WriteSummary),
    Checked(CheckSummary),
}

#[derive(Debug, Serialize)]
struct ReferenceCatalog<'a> {
    bootstrap: crate::bootstrap::BootstrapSpec,
    operations: &'a [crate::operations::OperationSpec],
    schemas: Vec<SchemaSummary<'a>>,
    errors: &'a [crate::errors::PublicErrorSpec],
    examples: &'a [crate::examples::ExampleSpec],
}

#[derive(Debug, Serialize)]
struct SchemaSummary<'a> {
    id: &'a str,
    version: &'a str,
}

pub fn generate_reference_artifacts() -> ReferenceArtifacts {
    let mut files = vec![
        GeneratedArtifact {
            relative_path: PathBuf::from("README.md"),
            content: render_readme(),
        },
        GeneratedArtifact {
            relative_path: PathBuf::from("operations.md"),
            content: render_operations_markdown(),
        },
        GeneratedArtifact {
            relative_path: PathBuf::from("schemas.md"),
            content: render_schemas_markdown(),
        },
        GeneratedArtifact {
            relative_path: PathBuf::from("errors.md"),
            content: render_errors_markdown(),
        },
        GeneratedArtifact {
            relative_path: PathBuf::from("examples.md"),
            content: render_examples_markdown(),
        },
        GeneratedArtifact {
            relative_path: PathBuf::from("catalog.json"),
            content: render_catalog_json(),
        },
    ];

    for schema in schema_specs() {
        let exported = export_schema(schema.id).expect("registered schema export");
        files.push(GeneratedArtifact {
            relative_path: PathBuf::from("schemas").join(format!("{}.schema.json", schema.id)),
            content: serialize_pretty_json(&exported),
        });
    }

    ReferenceArtifacts { files }
}

pub fn write_or_check_reference_artifacts(
    root: impl AsRef<Path>,
    mode: WriteMode,
) -> Result<ReferenceArtifactsResult, Vec<ReferenceMismatch>> {
    let root = root.as_ref();
    let artifacts = generate_reference_artifacts();
    let mut mismatches = Vec::new();

    for artifact in &artifacts.files {
        let path = root.join(&artifact.relative_path);
        match mode {
            WriteMode::Write => {
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent).expect("create artifact parent dir");
                }
                fs::write(&path, &artifact.content).expect("write generated reference artifact");
            }
            WriteMode::Check => match fs::read_to_string(&path) {
                Ok(existing) => {
                    if normalize_newlines(&existing) != normalize_newlines(&artifact.content) {
                        mismatches.push(ReferenceMismatch {
                            path: artifact.relative_path.clone(),
                            reason: "generated artifact is stale".to_string(),
                        });
                    }
                }
                Err(_) => mismatches.push(ReferenceMismatch {
                    path: artifact.relative_path.clone(),
                    reason: "generated artifact is missing".to_string(),
                }),
            },
        }
    }

    if mismatches.is_empty() {
        Ok(match mode {
            WriteMode::Write => ReferenceArtifactsResult::Written(WriteSummary {
                files_written: artifacts.files.len(),
            }),
            WriteMode::Check => ReferenceArtifactsResult::Checked(CheckSummary {
                checked_files: artifacts.files.len(),
            }),
        })
    } else {
        Err(mismatches)
    }
}

fn render_readme() -> String {
    let bootstrap = bootstrap_spec();
    format!(
        "# Solver Contracts Reference\n\n{GENERATED_NOTICE}\n\nThis directory contains generated reference material derived from `solver-contracts`, the transport-neutral semantic source of truth for GroupMixer's public solver interfaces.\n\n## Bootstrap\n\n- title: `{}`\n- summary: {}\n- discovery note: {}\n\n## Files\n\n- `operations.md` — operation catalog and local-help graph\n- `schemas.md` — schema registry plus per-schema JSON artifacts under `schemas/`\n- `errors.md` — public error taxonomy and recovery guidance\n- `examples.md` — canonical examples and snippets\n- `catalog.json` — machine-readable aggregate export\n\n## Regeneration\n\n```bash\ncargo run -p solver-contracts --bin generate-reference\n```\n\n## Freshness check\n\n```bash\ncargo run -p solver-contracts --bin generate-reference -- --check\n```\n",
        bootstrap.title, bootstrap.summary, bootstrap.discovery_note
    )
}

fn render_operations_markdown() -> String {
    let mut output = String::from("# Operations Reference\n\n");
    output.push_str(GENERATED_NOTICE);
    output.push_str("\n\n");

    for operation in operation_specs() {
        output.push_str(&format!("## `{}`\n\n", operation.id));
        output.push_str(&format!("- summary: {}\n", operation.summary));
        output.push_str(&format!("- family: `{}`\n", operation.family));
        output.push_str(&format!("- kind: `{}`\n", serde_json::to_string(&operation.kind).unwrap()));
        output.push_str(&format!("- description: {}\n", operation.description));
        output.push_str(&format!("- input schemas: {}\n", join_or_none(operation.input_schema_ids)));
        output.push_str(&format!("- output schemas: {}\n", join_or_none(operation.output_schema_ids)));
        output.push_str(&format!("- error codes: {}\n", join_or_none(operation.error_codes)));
        output.push_str(&format!("- related operations: {}\n", join_or_none(operation.related_operation_ids)));
        output.push_str(&format!("- examples: {}\n\n", join_or_none(operation.example_ids)));
    }

    output
}

fn render_schemas_markdown() -> String {
    let mut output = String::from("# Schema Reference\n\n");
    output.push_str(GENERATED_NOTICE);
    output.push_str("\n\n");

    for schema in schema_specs() {
        output.push_str(&format!("## `{}`\n\n", schema.id));
        output.push_str(&format!("- version: `{}`\n", schema.version));
        output.push_str(&format!(
            "- artifact: `schemas/{}.schema.json`\n\n",
            schema.id
        ));
    }

    output
}

fn render_errors_markdown() -> String {
    let mut output = String::from("# Error Reference\n\n");
    output.push_str(GENERATED_NOTICE);
    output.push_str("\n\n");

    for error in error_specs() {
        output.push_str(&format!("## `{}`\n\n", error.code));
        output.push_str(&format!("- category: `{}`\n", serde_json::to_string(&error.category).unwrap()));
        output.push_str(&format!("- summary: {}\n", error.summary));
        output.push_str(&format!("- why: {}\n", error.why));
        output.push_str(&format!("- recovery: {}\n", error.recovery));
        output.push_str(&format!(
            "- related help operations: {}\n\n",
            join_or_none(error.related_help_operation_ids)
        ));
    }

    output
}

fn render_examples_markdown() -> String {
    let mut output = String::from("# Examples Reference\n\n");
    output.push_str(GENERATED_NOTICE);
    output.push_str("\n\n");

    for example in example_specs() {
        output.push_str(&format!("## `{}`\n\n", example.id));
        output.push_str(&format!("- operation: `{}`\n", example.operation_id));
        output.push_str(&format!("- summary: {}\n", example.summary));
        output.push_str(&format!("- description: {}\n\n", example.description));
        output.push_str("### Snippets\n\n");
        for snippet in example.snippets {
            output.push_str(&format!("#### {}\n\n", snippet.label));
            output.push_str(&format!("- format: `{}`\n", snippet_format_name(snippet.format)));
            if let Some(schema_id) = snippet.schema_id {
                output.push_str(&format!("- schema: `{}`\n", schema_id));
            }
            output.push_str("\n```\n");
            output.push_str(snippet.content);
            output.push_str("\n```\n\n");
        }
    }

    output
}

fn render_catalog_json() -> String {
    let catalog = ReferenceCatalog {
        bootstrap: bootstrap_spec(),
        operations: operation_specs(),
        schemas: schema_specs()
            .iter()
            .map(|schema| SchemaSummary {
                id: schema.id,
                version: schema.version,
            })
            .collect(),
        errors: error_specs(),
        examples: example_specs(),
    };
    serialize_pretty_json(&catalog)
}

fn serialize_pretty_json<T: Serialize>(value: &T) -> String {
    let mut content = serde_json::to_string_pretty(value).expect("serialize json");
    content.push('\n');
    content
}

fn normalize_newlines(value: &str) -> String {
    value.replace("\r\n", "\n")
}

fn join_or_none(values: &[&str]) -> String {
    if values.is_empty() {
        "(none)".to_string()
    } else {
        values
            .iter()
            .map(|value| format!("`{value}`"))
            .collect::<Vec<_>>()
            .join(", ")
    }
}

fn snippet_format_name(format: ReferenceSnippetFormat) -> &'static str {
    match format {
        ReferenceSnippetFormat::Json => "json",
        ReferenceSnippetFormat::Shell => "shell",
        ReferenceSnippetFormat::Http => "http",
        ReferenceSnippetFormat::JavaScript => "javascript",
    }
}

#[cfg(test)]
mod tests {
    use super::{
        generate_reference_artifacts, write_or_check_reference_artifacts,
        ReferenceArtifactsResult, WriteMode, DEFAULT_REFERENCE_OUTPUT_DIR,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn generated_reference_artifacts_cover_core_reference_surfaces() {
        let artifacts = generate_reference_artifacts();
        let paths: Vec<_> = artifacts
            .files
            .iter()
            .map(|artifact| artifact.relative_path.to_string_lossy().to_string())
            .collect();
        assert!(paths.contains(&"README.md".to_string()));
        assert!(paths.contains(&"operations.md".to_string()));
        assert!(paths.contains(&"schemas.md".to_string()));
        assert!(paths.contains(&"errors.md".to_string()));
        assert!(paths.contains(&"examples.md".to_string()));
        assert!(paths.contains(&"catalog.json".to_string()));
        assert!(paths.iter().any(|path| path.starts_with("schemas/") && path.ends_with(".schema.json")));
        assert_eq!(DEFAULT_REFERENCE_OUTPUT_DIR, "docs/reference/generated/solver-contracts");
    }

    #[test]
    fn write_then_check_reference_artifacts_passes() {
        let temp = tempdir().expect("temp dir");
        let written = write_or_check_reference_artifacts(temp.path(), WriteMode::Write)
            .expect("write generated artifacts");
        match written {
            ReferenceArtifactsResult::Written(summary) => assert!(summary.files_written >= 6),
            other => panic!("unexpected result: {other:?}"),
        }

        let checked = write_or_check_reference_artifacts(temp.path(), WriteMode::Check)
            .expect("check generated artifacts");
        match checked {
            ReferenceArtifactsResult::Checked(summary) => assert!(summary.checked_files >= 6),
            other => panic!("unexpected result: {other:?}"),
        }
    }

    #[test]
    fn stale_reference_artifacts_are_detected() {
        let temp = tempdir().expect("temp dir");
        write_or_check_reference_artifacts(temp.path(), WriteMode::Write)
            .expect("write generated artifacts");
        fs::write(temp.path().join("operations.md"), "stale artifact\n").expect("overwrite artifact");

        let mismatches = write_or_check_reference_artifacts(temp.path(), WriteMode::Check)
            .expect_err("stale outputs should fail check");
        assert!(mismatches.iter().any(|mismatch| mismatch.path == std::path::PathBuf::from("operations.md")));
    }
}
