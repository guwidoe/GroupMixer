use super::delta::SameWeekSwapMove;
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct WeekLocalTabuKey {
    pub week_idx: usize,
    pub low_person: usize,
    pub high_person: usize,
}

impl WeekLocalTabuKey {
    pub(crate) fn from_swap(swap: SameWeekSwapMove) -> Self {
        let (low_person, high_person) = if swap.left_person < swap.right_person {
            (swap.left_person, swap.right_person)
        } else {
            (swap.right_person, swap.left_person)
        };
        Self {
            week_idx: swap.week_idx,
            low_person,
            high_person,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct RepeatAwareTabuPolicy {
    pub base_tenure: u64,
    pub deterministic_jitter_span: u64,
}

impl Default for RepeatAwareTabuPolicy {
    fn default() -> Self {
        Self {
            base_tenure: 7,
            deterministic_jitter_span: 2,
        }
    }
}

impl RepeatAwareTabuPolicy {
    pub(crate) fn tenure_for_swap(self, swap: SameWeekSwapMove) -> u64 {
        let deterministic_jitter = if self.deterministic_jitter_span == 0 {
            0
        } else {
            ((swap.week_idx + swap.left_person + swap.right_person) as u64)
                % (self.deterministic_jitter_span + 1)
        };
        self.base_tenure + deterministic_jitter
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RepeatAwareTabuMemory {
    policy: RepeatAwareTabuPolicy,
    expiry_by_key: HashMap<WeekLocalTabuKey, u64>,
}

impl RepeatAwareTabuMemory {
    pub(crate) fn new(policy: RepeatAwareTabuPolicy) -> Self {
        Self {
            policy,
            expiry_by_key: HashMap::new(),
        }
    }

    pub(crate) fn policy(&self) -> RepeatAwareTabuPolicy {
        self.policy
    }

    pub(crate) fn is_tabu(&self, swap: SameWeekSwapMove, iteration: u64) -> bool {
        self.expiry_by_key
            .get(&WeekLocalTabuKey::from_swap(swap))
            .is_some_and(|expiry| *expiry > iteration)
    }

    pub(crate) fn record_swap(&mut self, swap: SameWeekSwapMove, iteration: u64) {
        let expiry = iteration + self.policy.tenure_for_swap(swap);
        self.expiry_by_key
            .insert(WeekLocalTabuKey::from_swap(swap), expiry);
    }
}

#[cfg(test)]
mod tests {
    use super::{RepeatAwareTabuMemory, RepeatAwareTabuPolicy};
    use crate::solver6::search::delta::SameWeekSwapMove;

    fn sample_swap() -> SameWeekSwapMove {
        SameWeekSwapMove {
            week_idx: 3,
            left_group_idx: 0,
            left_pos_idx: 1,
            right_group_idx: 2,
            right_pos_idx: 0,
            left_person: 7,
            right_person: 19,
        }
    }

    #[test]
    fn tabu_memory_blocks_recent_reverse_swaps() {
        let policy = RepeatAwareTabuPolicy {
            base_tenure: 4,
            deterministic_jitter_span: 0,
        };
        let mut memory = RepeatAwareTabuMemory::new(policy);
        let swap = sample_swap();
        memory.record_swap(swap, 10);

        assert!(memory.is_tabu(swap, 10));
        assert!(memory.is_tabu(swap, 13));
        assert!(!memory.is_tabu(swap, 14));
    }

    #[test]
    fn tabu_policy_is_deterministic_for_fixed_swap() {
        let policy = RepeatAwareTabuPolicy::default();
        assert_eq!(
            policy.tenure_for_swap(sample_swap()),
            policy.tenure_for_swap(sample_swap())
        );
    }
}
