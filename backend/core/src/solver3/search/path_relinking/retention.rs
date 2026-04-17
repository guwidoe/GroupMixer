use std::collections::VecDeque;

use super::super::context::AdaptiveRawChildRetentionConfig;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct AdaptiveRawChildRetentionDecision {
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
        let retain = self
            .current_threshold()
            .map(|threshold| raw_child_delta <= threshold)
            .unwrap_or(true);
        self.record(raw_child_delta);
        AdaptiveRawChildRetentionDecision {
            retained_for_polish: retain,
        }
    }

    fn current_threshold(&self) -> Option<f64> {
        if self.recent_raw_deltas.len() < self.warmup_samples {
            return None;
        }

        let mut sorted = self.recent_raw_deltas.iter().copied().collect::<Vec<_>>();
        sorted.sort_by(|left, right| left.total_cmp(right));
        let keep_count =
            ((sorted.len() as f64 * self.keep_ratio).ceil() as usize).clamp(1, sorted.len());
        Some(sorted[keep_count - 1])
    }

    fn record(&mut self, raw_child_delta: f64) {
        if self.recent_raw_deltas.len() == self.history_limit {
            self.recent_raw_deltas.pop_front();
        }
        self.recent_raw_deltas.push_back(raw_child_delta);
    }
}
