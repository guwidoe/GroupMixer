use std::collections::VecDeque;

use super::super::context::{AdaptiveRawChildRetentionConfig, DonorSessionTransplantConfig};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DonorSessionTriggerEligibility {
    Armed,
    NotArmed,
    EventCapReached,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct AdaptiveRawChildRetentionDecision {
    discard_threshold: Option<f64>,
    retained_for_polish: bool,
}

#[derive(Debug, Clone, PartialEq)]
struct AdaptiveRawChildRetentionState {
    keep_ratio: f64,
    warmup_samples: usize,
    history_limit: usize,
    recent_raw_deltas: VecDeque<f64>,
}

impl AdaptiveRawChildRetentionState {
    fn new(config: AdaptiveRawChildRetentionConfig) -> Self {
        Self {
            keep_ratio: config.keep_ratio,
            warmup_samples: config.warmup_samples,
            history_limit: config.history_limit,
            recent_raw_deltas: VecDeque::with_capacity(config.history_limit),
        }
    }

    fn evaluate(&mut self, raw_child_delta: f64) -> AdaptiveRawChildRetentionDecision {
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

    fn latest_threshold(&self) -> Option<f64> {
        self.current_threshold()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DonorSessionTriggerState {
    pub(crate) recombination_events_fired: u64,
    pub(crate) iterations_since_last_recombination: u64,
    pub(crate) swap_local_optimum_certified: bool,
}

impl Default for DonorSessionTriggerState {
    fn default() -> Self {
        Self {
            recombination_events_fired: 0,
            iterations_since_last_recombination: u64::MAX,
            swap_local_optimum_certified: false,
        }
    }
}

impl DonorSessionTriggerState {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn is_armed(
        &self,
        config: DonorSessionTransplantConfig,
        no_improvement_count: u64,
    ) -> DonorSessionTriggerEligibility {
        if config
            .max_recombination_events_per_run
            .is_some_and(|cap| self.recombination_events_fired >= cap)
        {
            return DonorSessionTriggerEligibility::EventCapReached;
        }

        if no_improvement_count >= config.recombination_no_improvement_window
            && self.iterations_since_last_recombination >= config.recombination_cooldown_window
        {
            DonorSessionTriggerEligibility::Armed
        } else {
            DonorSessionTriggerEligibility::NotArmed
        }
    }

    pub(crate) fn finish_iteration(&mut self) {
        self.iterations_since_last_recombination =
            self.iterations_since_last_recombination.saturating_add(1);
    }

    pub(crate) fn finish_iterations(&mut self, iterations: u64) {
        self.iterations_since_last_recombination = self
            .iterations_since_last_recombination
            .saturating_add(iterations);
    }

    pub(crate) fn record_recombination_event(&mut self) {
        self.recombination_events_fired += 1;
        self.iterations_since_last_recombination = 0;
    }

    pub(crate) fn mark_swap_local_optimum_certified(&mut self) {
        self.swap_local_optimum_certified = true;
    }

    pub(crate) fn record_incumbent_improvement(&mut self) {
        self.swap_local_optimum_certified = false;
    }
}
