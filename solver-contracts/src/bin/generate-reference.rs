use solver_contracts::reference_docs::{
    write_or_check_reference_artifacts, ReferenceArtifactsResult, DEFAULT_REFERENCE_OUTPUT_DIR,
    WriteMode,
};
use std::env;
use std::path::PathBuf;

fn main() {
    let mut args = env::args().skip(1);
    let mut mode = WriteMode::Write;
    let mut output_dir = PathBuf::from(DEFAULT_REFERENCE_OUTPUT_DIR);

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--check" => mode = WriteMode::Check,
            "--output-dir" => {
                let value = args.next().expect("--output-dir requires a path argument");
                output_dir = PathBuf::from(value);
            }
            other => panic!("unknown argument: {other}"),
        }
    }

    match write_or_check_reference_artifacts(&output_dir, mode) {
        Ok(ReferenceArtifactsResult::Written(summary)) => {
            println!(
                "generated {} solver-contract reference artifacts under {}",
                summary.files_written,
                output_dir.display()
            );
        }
        Ok(ReferenceArtifactsResult::Checked(summary)) => {
            println!(
                "checked {} solver-contract reference artifacts under {}",
                summary.checked_files,
                output_dir.display()
            );
        }
        Err(mismatches) => {
            eprintln!(
                "solver-contract generated reference artifacts are stale under {}:",
                output_dir.display()
            );
            for mismatch in mismatches {
                eprintln!("- {}: {}", mismatch.path.display(), mismatch.reason);
            }
            eprintln!(
                "regenerate with: cargo run -p solver-contracts --bin generate-reference"
            );
            std::process::exit(1);
        }
    }
}
