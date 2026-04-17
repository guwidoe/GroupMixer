use super::super::context::SessionAlignedPathRelinkingConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct PathRelinkingTriggerState {
    path_events_fired: u64,
    iterations_since_last_path_event: u64,
    swap_local_optimum_certified: bool,
}

impl Default for PathRelinkingTriggerState {
    fn default() -> Self {
        Self {
            path_events_fired: 0,
            iterations_since_last_path_event: u64::MAX,
            swap_local_optimum_certified: false,
        }
    }
}

impl PathRelinkingTriggerState {
    pub(super) fn new() -> Self {
        Self::default()
    }

    pub(super) fn is_armed(
        &self,
        config: SessionAlignedPathRelinkingConfig,
        no_improvement_count: u64,
    ) -> bool {
        if config
            .max_path_events_per_run
            .is_some_and(|cap| self.path_events_fired >= cap)
        {
            return false;
        }

        no_improvement_count >= config.recombination_no_improvement_window
            && self.iterations_since_last_path_event >= config.recombination_cooldown_window
    }

    pub(super) fn finish_iterations(&mut self, iterations: u64) {
        self.iterations_since_last_path_event = self
            .iterations_since_last_path_event
            .saturating_add(iterations);
    }

    pub(super) fn record_path_event(&mut self) {
        self.path_events_fired += 1;
        self.iterations_since_last_path_event = 0;
    }

    pub(super) fn record_incumbent_improvement(&mut self) {
        self.swap_local_optimum_certified = false;
    }

    pub(super) fn mark_swap_local_optimum_certified(&mut self) {
        self.swap_local_optimum_certified = true;
    }
}
