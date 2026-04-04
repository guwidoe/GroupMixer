//! Move kernels for `solver3`.

pub mod patch;
pub mod swap;
pub mod transfer;

pub use patch::{
    apply_runtime_patch, GroupMembersPatchOp, PairContactUpdate, PersonLocationUpdate,
    RuntimePatch, ScoreDelta,
};
pub use swap::{
    analyze_swap, apply_swap, apply_swap_runtime_preview, preview_swap_oracle_recompute,
    preview_swap_runtime_lightweight, SwapAnalysis, SwapFeasibility, SwapMove, SwapRuntimePreview,
};
pub use transfer::{
    analyze_transfer, apply_transfer, apply_transfer_runtime_preview,
    preview_transfer_oracle_recompute, preview_transfer_runtime_lightweight, TransferAnalysis,
    TransferFeasibility, TransferMove, TransferRuntimePreview,
};
