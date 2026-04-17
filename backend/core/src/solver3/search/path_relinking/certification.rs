use crate::solver_support::SolverError;

use super::super::moves::{
    analyze_swap, preview_swap_runtime_checked, SwapFeasibility, SwapMove, SwapRuntimePreview,
};
use super::super::runtime_state::RuntimeState;
use super::{get_current_time, get_elapsed_seconds_between};

#[derive(Debug, Clone, PartialEq)]
pub(super) struct SwapLocalOptimumCertificationResult {
    pub(super) best_improving_swap: Option<SwapRuntimePreview>,
    pub(super) swap_previews_evaluated: u64,
    pub(super) scan_seconds: f64,
}

pub(super) fn certify_swap_local_optimum(
    state: &RuntimeState,
    allowed_sessions: &[usize],
) -> Result<SwapLocalOptimumCertificationResult, SolverError> {
    let started_at = get_current_time();
    let mut best_improving_swap = None;
    let mut swap_previews_evaluated = 0u64;

    for &session_idx in allowed_sessions {
        for left_group_idx in 0..state.compiled.num_groups {
            let left_members = &state.group_members[state.group_slot(session_idx, left_group_idx)];
            if left_members.is_empty() {
                continue;
            }

            for right_group_idx in (left_group_idx + 1)..state.compiled.num_groups {
                let right_members =
                    &state.group_members[state.group_slot(session_idx, right_group_idx)];
                if right_members.is_empty() {
                    continue;
                }

                for &left_person_idx in left_members {
                    for &right_person_idx in right_members {
                        let swap = SwapMove::new(session_idx, left_person_idx, right_person_idx);
                        let analysis = analyze_swap(state, &swap)?;
                        if !matches!(analysis.feasibility, SwapFeasibility::Feasible) {
                            continue;
                        }
                        let preview = preview_swap_runtime_checked(state, &swap)?;
                        swap_previews_evaluated += 1;
                        let should_replace_best = best_improving_swap
                            .as_ref()
                            .map(|best: &SwapRuntimePreview| preview.delta_score < best.delta_score)
                            .unwrap_or(true);
                        if preview.delta_score < 0.0 && should_replace_best {
                            best_improving_swap = Some(preview);
                        }
                    }
                }
            }
        }
    }

    Ok(SwapLocalOptimumCertificationResult {
        best_improving_swap,
        swap_previews_evaluated,
        scan_seconds: get_elapsed_seconds_between(started_at, get_current_time()),
    })
}
