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
pub mod schemas;
pub mod types;

pub use bootstrap::BootstrapSpec;
pub use errors::PublicErrorSpec;
pub use examples::ExampleSpec;
pub use operations::OperationSpec;
pub use schemas::SchemaSpec;

#[cfg(test)]
mod tests {
    use crate::{bootstrap, errors, examples, operations, schemas};

    #[test]
    fn placeholder_registries_are_accessible() {
        assert!(bootstrap::bootstrap_spec().top_level_operation_ids.is_empty());
        assert!(operations::operation_specs().is_empty());
        assert!(schemas::schema_specs().is_empty());
        assert!(errors::error_specs().is_empty());
        assert!(examples::example_specs().is_empty());
    }
}
