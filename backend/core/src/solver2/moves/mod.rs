//! Move-family skeletons for `solver2`.

pub mod clique_swap;
pub mod swap;
pub mod transfer;

pub use clique_swap::CliqueSwapMove;
pub use swap::SwapMove;
pub use transfer::TransferMove;
