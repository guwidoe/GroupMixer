use std::collections::VecDeque;

use super::super::context::{AdaptiveRawChildRetentionConfig, DonorSessionTransplantConfig};

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct AdaptiveRawChildRetentionDecision {
    pub(super) discard_threshold: Option<f64>,
    pub(super) retained_for_polish: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct AdaptiveRawChildRetentionState {
    keep_ratio: f64,
    warmup_samples: usize,
    history_limit: usize,
    recent_raw_deltas: VecDeque<f64>,
}

impl AdaptiveRawChildRetentionState {
    pub(super) fn new(config: AdaptiveRawChildRetentionConfig) -> Self {
        Self {
            keep_ratio: config.keep_ratio,
            warmup_samples: config.warmup_samples,
            history_limit: config.history_limit,
            recent_raw_deltas: VecDeque::with_capacity(config.history_limit),
        }
    }

    pub(super) fn evaluate(&mut self, raw_child_delta: f64) -> AdaptiveRawChildRetentionDecision {
        let discard_threshold = self.current_threshold();
        let retained_for_polish = discard_threshold
            .map(|threshold| raw_child_delta <= threshold)
            .unwrap_or(true);
        self.record(raw_child_delta);
        AdaptiveRawChildRetentionDecision {
            discard_threshold,
            retained_for_polish,
        }
    }

    pub(super) fn current_threshold(&self) -> Option<f64> {
        if self.recent_raw_deltas.len() < self.warmup_samples {
            return None;
        }

        let mut sorted = self.recent_raw_deltas.iter().copied().collect::<Vec<_>>();
        sorted.sort_by(|left, right| left.total_cmp(right));
        let keep_count =
            ((sorted.len() as f64 * self.keep_ratio).ceil() as usize).clamp(1, sorted.len());
        Some(sorted[keep_count - 1])
    }

    pub(super) fn record(&mut self, raw_child_delta: f64) {
        if self.recent_raw_deltas.len() == self.history_limit {
            self.recent_raw_deltas.pop_front();
        }
        self.recent_raw_deltas.push_back(raw_child_delta);
    }

    pub(super) fn latest_threshold(&self) -> Option<f64> {
        self.current_threshold()
    }
}

pub(super) fn child_polish_budget_for_stagnation(
    config: DonorSessionTransplantConfig,
    no_improvement_count: u64,
    remaining_iterations: u64,
) -> (u64, u64, u64) {
    let window = config.recombination_no_improvement_window.max(1);
    let stagnation_windows_at_trigger = (no_improvement_count / window)
        .max(1)
        .min(config.child_polish_max_stagnation_windows.max(1));
    let configured_iteration_budget = config
        .child_polish_iterations_per_stagnation_window
        .saturating_mul(stagnation_windows_at_trigger);
    let configured_no_improvement_budget = config
        .child_polish_no_improvement_iterations_per_stagnation_window
        .saturating_mul(stagnation_windows_at_trigger);
    let polish_budget_iterations = remaining_iterations.min(configured_iteration_budget);
    let polish_budget_no_improvement_iterations = configured_no_improvement_budget
        .min(polish_budget_iterations)
        .max(1);
    (
        stagnation_windows_at_trigger,
        polish_budget_iterations,
        polish_budget_no_improvement_iterations,
    )
}
