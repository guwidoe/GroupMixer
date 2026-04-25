//! Move kernels for `solver3`.

pub mod clique_swap;
pub mod patch;
pub mod swap;
pub mod transfer;

pub(crate) use clique_swap::preview_clique_swap_runtime_trusted;
pub use clique_swap::{
    analyze_clique_swap, apply_clique_swap, apply_clique_swap_runtime_preview,
    preview_clique_swap_oracle_recompute, preview_clique_swap_runtime_checked,
    preview_clique_swap_runtime_lightweight, CliqueSwapAnalysis, CliqueSwapFeasibility,
    CliqueSwapMove, CliqueSwapRuntimePreview,
};
pub use patch::{
    apply_runtime_patch, GroupMembersPatchOp, PairContactUpdate, PersonLocationUpdate,
    RuntimePatch, ScoreDelta,
};
pub(crate) use swap::preview_swap_runtime_trusted;
pub use swap::{
    analyze_swap, apply_swap, apply_swap_runtime_preview, preview_swap_oracle_recompute,
    preview_swap_runtime_checked, preview_swap_runtime_lightweight, SwapAnalysis, SwapFeasibility,
    SwapMove, SwapRuntimePreview,
};
pub(crate) use transfer::preview_transfer_runtime_trusted;
pub use transfer::{
    analyze_transfer, apply_transfer, apply_transfer_runtime_preview,
    preview_transfer_oracle_recompute, preview_transfer_runtime_checked,
    preview_transfer_runtime_lightweight, TransferAnalysis, TransferFeasibility, TransferMove,
    TransferRuntimePreview,
};
