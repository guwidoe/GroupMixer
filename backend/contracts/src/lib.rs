//! `solver-contracts` is the transport-neutral semantic source of truth for
//! GroupMixer's public solver interfaces.
//!
//! It exists so that `solver-cli`, `solver-server`, and `solver-wasm` can expose
//! the same operation names, schemas, examples, help graph, and public error
//! meanings without maintaining competing copies.
//!
//! Architecture reference:
//! - `docs/AGENT_INTERFACE_ARCHITECTURE.md`
//!
//! This crate intentionally does **not** own CLI-only wording, HTTP-only route
//! wording, or browser-only docs strings as the source of truth. Instead, it
//! provides transport-neutral metadata that other surfaces can project.

pub mod bootstrap;
pub mod errors;
pub mod examples;
pub mod operations;
pub mod reference_docs;
pub mod schemas;
pub mod types;

pub use bootstrap::BootstrapSpec;
pub use errors::PublicErrorSpec;
pub use examples::ExampleSpec;
pub use operations::{LocalHelpSpec, OperationSpec};
pub use schemas::SchemaSpec;

#[cfg(test)]
mod invariants;

#[cfg(test)]
mod tests {
    use crate::{bootstrap, errors, examples, operations, schemas};

    #[test]
    fn registry_modules_are_accessible() {
        let _ = bootstrap::bootstrap_spec();
        let _ = operations::operation_specs();
        let _ = schemas::schema_specs();
        let _ = errors::error_specs();
        let _ = examples::example_specs();
    }
}
