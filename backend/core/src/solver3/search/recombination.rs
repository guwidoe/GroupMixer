use super::context::DonorSessionTransplantConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DonorSessionTriggerState {
    pub(crate) recombination_events_fired: u64,
    pub(crate) iterations_since_last_recombination: u64,
}

impl Default for DonorSessionTriggerState {
    fn default() -> Self {
        Self {
            recombination_events_fired: 0,
            iterations_since_last_recombination: u64::MAX,
        }
    }
}

impl DonorSessionTriggerState {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn should_fire(
        &self,
        config: DonorSessionTransplantConfig,
        no_improvement_count: u64,
        donor_available: bool,
    ) -> bool {
        donor_available
            && self.recombination_events_fired < config.max_recombination_events_per_run
            && no_improvement_count >= config.recombination_no_improvement_window
            && self.iterations_since_last_recombination >= config.recombination_cooldown_window
    }

    pub(crate) fn finish_iteration(&mut self) {
        self.iterations_since_last_recombination =
            self.iterations_since_last_recombination.saturating_add(1);
    }

    pub(crate) fn record_recombination_event(&mut self) {
        self.recombination_events_fired += 1;
        self.iterations_since_last_recombination = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::DonorSessionTriggerState;
    use crate::solver3::search::context::DonorSessionTransplantConfig;

    fn config() -> DonorSessionTransplantConfig {
        DonorSessionTransplantConfig {
            archive_size: 4,
            recombination_no_improvement_window: 20,
            recombination_cooldown_window: 10,
            max_recombination_events_per_run: 2,
            early_discard_score_delta: 250.0,
            child_polish_max_iterations: 64,
            child_polish_no_improvement_iterations: 32,
        }
    }

    #[test]
    fn trigger_waits_for_stagnation_and_donor_availability() {
        let state = DonorSessionTriggerState::new();
        assert!(!state.should_fire(config(), 19, true));
        assert!(!state.should_fire(config(), 20, false));
        assert!(state.should_fire(config(), 20, true));
    }

    #[test]
    fn trigger_respects_cooldown_and_event_cap() {
        let mut state = DonorSessionTriggerState::new();
        state.record_recombination_event();
        assert!(!state.should_fire(config(), 100, true));
        for _ in 0..10 {
            state.finish_iteration();
        }
        assert!(state.should_fire(config(), 100, true));
        state.record_recombination_event();
        for _ in 0..10 {
            state.finish_iteration();
        }
        assert!(!state.should_fire(config(), 100, true));
    }
}
