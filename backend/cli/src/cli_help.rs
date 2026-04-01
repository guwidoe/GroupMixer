use crate::contract_surface::{
    binding_for_command, cli_contract_bindings, public_cli_contract_bindings,
};
use anyhow::Result;
use gm_contracts::{bootstrap::bootstrap_spec, examples::example_spec, operations::local_help};

pub fn try_print_contract_help(args: &[String]) -> Result<bool> {
    if is_root_help(args) {
        print!("{}", render_root_help());
        return Ok(true);
    }

    if let Some(command_name) = requested_command_help(args) {
        if command_name == "benchmark" {
            return Ok(false);
        }
        if let Some(binding) = binding_for_command(command_name) {
            if let Some(operation_id) = binding.operation_id {
                print!("{}", render_command_help(command_name, operation_id));
            } else {
                print!("{}", render_bootstrap_command_help(command_name));
            }
            return Ok(true);
        }
    }

    Ok(false)
}

fn is_root_help(args: &[String]) -> bool {
    matches!(
        args,
        [_, flag] if flag == "--help" || flag == "-h" || flag == "help"
    )
}

fn requested_command_help(args: &[String]) -> Option<&str> {
    match args {
        [_, command, flag] if flag == "--help" || flag == "-h" => Some(command.as_str()),
        [_, help, command] if help == "help" => Some(command.as_str()),
        _ => None,
    }
}

pub fn render_root_help() -> String {
    let bootstrap = bootstrap_spec();
    let mut out = String::new();
    out.push_str("GroupMixer solver CLI\n");
    out.push('\n');
    out.push_str(&format!("{}\n", bootstrap.summary));
    out.push('\n');
    out.push_str("USAGE:\n");
    out.push_str("  gm-cli <COMMAND> [OPTIONS]\n");
    out.push('\n');
    out.push_str("PUBLIC SOLVER COMMANDS (shared contract):\n");
    for binding in public_cli_contract_bindings().filter(|binding| {
        binding.command_name != "capabilities" && binding.command_name != "errors"
    }) {
        let Some(operation_id) = binding.operation_id else {
            continue;
        };
        if let Some(help) = local_help(operation_id) {
            out.push_str(&format!(
                "  {:<12} {}\n",
                binding.command_name, help.operation.summary
            ));
        }
    }
    out.push('\n');
    out.push_str("CONTRACT INSPECTION COMMANDS:\n");
    out.push_str("  capabilities  Inspect bootstrap capabilities derived from gm-contracts\n");
    out.push_str("  schema        Inspect one named public schema from gm-contracts\n");
    out.push_str("  errors        Inspect canonical public error codes from gm-contracts\n");
    out.push('\n');
    out.push_str("ADDITIONAL COMMANDS (not part of the public solver contract):\n");
    for binding in cli_contract_bindings()
        .iter()
        .filter(|binding| binding.command_name == "benchmark")
    {
        out.push_str(&format!(
            "  {:<12} {}\n",
            binding.command_name, binding.note
        ));
    }
    out.push('\n');
    out.push_str("DISCOVERY:\n");
    out.push_str("  gm-cli --help\n");
    out.push_str("  gm-cli <command> --help\n");
    out.push_str("  gm-cli capabilities\n");
    out.push('\n');
    out.push_str("NOTE:\n");
    out.push_str(&format!("  {}\n", bootstrap.discovery_note));
    out
}

pub fn render_command_help(command_name: &str, operation_id: &str) -> String {
    let help = local_help(operation_id).expect("registered operation help");
    let mut out = String::new();
    out.push_str(&format!("gm-cli {}\n", command_name));
    out.push('\n');
    out.push_str(&format!("{}\n", help.operation.summary));
    out.push('\n');
    out.push_str(&format!("{}\n", help.operation.description));
    out.push('\n');
    out.push_str("USAGE:\n");
    out.push_str(&render_usage_and_options(command_name));
    out.push('\n');
    if !help.operation.input_schema_ids.is_empty() || !help.operation.output_schema_ids.is_empty() {
        out.push_str("SCHEMAS:\n");
        if !help.operation.input_schema_ids.is_empty() {
            out.push_str(&format!(
                "  input:  {}\n",
                help.operation.input_schema_ids.join(", ")
            ));
        }
        if !help.operation.output_schema_ids.is_empty() {
            out.push_str(&format!(
                "  output: {}\n",
                help.operation.output_schema_ids.join(", ")
            ));
        }
        out.push('\n');
    }
    if !help.operation.example_ids.is_empty() {
        out.push_str("EXAMPLES:\n");
        for example_id in help.operation.example_ids {
            if let Some(example) = example_spec(example_id) {
                out.push_str(&format!("  - {}\n", example.summary));
                if let Some(shell_snippet) = example.snippets.iter().find(|snippet| {
                    matches!(
                        snippet.format,
                        gm_contracts::examples::ReferenceSnippetFormat::Shell
                    )
                }) {
                    out.push_str(&format!("    {}\n", shell_snippet.content));
                }
            }
        }
        out.push('\n');
    }
    if !help.related_operations.is_empty() {
        out.push_str("RELATED CONTRACT AFFORDANCES:\n");
        for related in help.related_operations {
            out.push_str(&format!("  - {}\n", related));
        }
        out.push('\n');
    }
    if !help.operation.error_codes.is_empty() {
        out.push_str("ERROR CODES:\n");
        for code in help.operation.error_codes {
            out.push_str(&format!("  - {}\n", code));
        }
        out.push('\n');
    }
    out.push_str("DISCOVERY:\n");
    out.push_str("  gm-cli capabilities\n");
    out.push_str("  gm-cli schema <schema-id>\n");
    out.push_str("  gm-cli errors\n");
    out
}

fn render_bootstrap_command_help(command_name: &str) -> String {
    let mut out = String::new();
    out.push_str(&format!("gm-cli {}\n\n", command_name));
    out.push_str("Inspect the shared gm-contracts bootstrap surface from the CLI.\n\n");
    out.push_str("USAGE:\n");
    out.push_str("  gm-cli capabilities [--json]\n\n");
    out.push_str("DISCOVERY:\n");
    out.push_str("  gm-cli schema <schema-id>\n");
    out.push_str("  gm-cli errors\n");
    out
}

fn render_usage_and_options(command_name: &str) -> String {
    match command_name {
        "solve" => concat!(
            "  gm-cli solve <FILE> [--output <FILE>] [--pretty]\n",
            "  gm-cli solve --stdin [--output <FILE>] [--pretty]\n",
            "\nOPTIONS:\n",
            "  --stdin           Read input JSON from stdin\n",
            "  -o, --output      Write result JSON to a file instead of stdout\n",
            "  --pretty          Pretty-print JSON output\n"
        )
        .to_string(),
        "validate" => concat!(
            "  gm-cli validate <FILE>\n",
            "  gm-cli validate --stdin\n",
            "\nOPTIONS:\n",
            "  --stdin           Read input JSON from stdin\n"
        )
        .to_string(),
        "default-config" => concat!(
            "  gm-cli default-config [--pretty]\n",
            "\nOPTIONS:\n",
            "  --pretty          Pretty-print JSON output\n"
        )
        .to_string(),
        "recommend" => concat!(
            "  gm-cli recommend <FILE> [--pretty]\n",
            "  gm-cli recommend --stdin [--pretty]\n",
            "\nOPTIONS:\n",
            "  --stdin           Read recommend-settings-request JSON from stdin\n",
            "  --pretty          Pretty-print JSON output\n"
        )
        .to_string(),
        "evaluate" => concat!(
            "  gm-cli evaluate <FILE> [--pretty]\n",
            "  gm-cli evaluate --stdin [--pretty]\n",
            "\nOPTIONS:\n",
            "  --stdin           Read input JSON from stdin\n",
            "  --pretty          Pretty-print JSON output\n"
        )
        .to_string(),
        "schema" => concat!(
            "  gm-cli schema [<SCHEMA_ID>] [--json]\n",
            "\nOPTIONS:\n",
            "  --json            Emit machine-readable JSON instead of text\n"
        )
        .to_string(),
        "errors" => concat!(
            "  gm-cli errors [<ERROR_CODE>] [--json]\n",
            "\nOPTIONS:\n",
            "  --json            Emit machine-readable JSON instead of text\n"
        )
        .to_string(),
        _ => "  gm-cli <command> --help\n".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{render_command_help, render_root_help};

    #[test]
    fn root_help_uses_contract_summaries() {
        let help = render_root_help();
        assert!(help.contains("Run the solver for a complete optimization input."));
        assert!(help.contains("Validate solver input without running optimization."));
        assert!(help.contains("recommend"));
        assert!(help.contains("default-config"));
        assert!(help.contains("benchmark"));
    }

    #[test]
    fn solve_help_contains_contract_examples_and_related_affordances() {
        let help = render_command_help("solve", "solve");
        assert!(help.contains("gm-cli solve input.json --pretty"));
        assert!(help.contains("validate-problem"));
        assert!(help.contains("solve-request"));
    }

    #[test]
    fn root_help_mentions_contract_inspection_commands() {
        let help = render_root_help();
        assert!(help.contains("capabilities"));
        assert!(help.contains("errors"));
        assert!(help.contains("schema"));
    }

    #[test]
    fn schema_help_points_back_to_contract_discovery() {
        let help = render_command_help("schema", "get-schema");
        assert!(help.contains("get-schema-solve-request") || help.contains("solve-request"));
        assert!(help.contains("gm-cli errors"));
        assert!(help.contains("gm-cli schema <schema-id>"));
    }
}
