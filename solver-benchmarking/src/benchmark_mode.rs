pub const FULL_SOLVE_BENCHMARK_MODE: &str = "full_solve";
pub const CONSTRUCTION_BENCHMARK_MODE: &str = "construction";
pub const FULL_RECALCULATION_BENCHMARK_MODE: &str = "full_recalculation";
pub const SWAP_PREVIEW_BENCHMARK_MODE: &str = "swap_preview";
pub const SWAP_APPLY_BENCHMARK_MODE: &str = "swap_apply";
pub const TRANSFER_PREVIEW_BENCHMARK_MODE: &str = "transfer_preview";
pub const TRANSFER_APPLY_BENCHMARK_MODE: &str = "transfer_apply";
pub const CLIQUE_SWAP_PREVIEW_BENCHMARK_MODE: &str = "clique_swap_preview";
pub const CLIQUE_SWAP_APPLY_BENCHMARK_MODE: &str = "clique_swap_apply";
pub const SEARCH_ITERATION_BENCHMARK_MODE: &str = "search_iteration";

pub const HOTPATH_BENCHMARK_MODES: [&str; 9] = [
    CONSTRUCTION_BENCHMARK_MODE,
    FULL_RECALCULATION_BENCHMARK_MODE,
    SWAP_PREVIEW_BENCHMARK_MODE,
    SWAP_APPLY_BENCHMARK_MODE,
    TRANSFER_PREVIEW_BENCHMARK_MODE,
    TRANSFER_APPLY_BENCHMARK_MODE,
    CLIQUE_SWAP_PREVIEW_BENCHMARK_MODE,
    CLIQUE_SWAP_APPLY_BENCHMARK_MODE,
    SEARCH_ITERATION_BENCHMARK_MODE,
];

pub fn default_benchmark_mode() -> String {
    FULL_SOLVE_BENCHMARK_MODE.to_string()
}

pub fn is_hotpath_benchmark_mode(mode: &str) -> bool {
    HOTPATH_BENCHMARK_MODES.contains(&mode)
}

pub fn is_supported_benchmark_mode(mode: &str) -> bool {
    mode == FULL_SOLVE_BENCHMARK_MODE || is_hotpath_benchmark_mode(mode)
}
