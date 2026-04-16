use rand::{seq::SliceRandom, RngExt};
use rand_chacha::ChaCha12Rng;

use crate::models::{MoveFamily, MovePolicy, MoveSelectionMode};

const ADAPTIVE_FAMILY_WARMUP_ATTEMPTS: u64 = 8;
const ADAPTIVE_FAMILY_EXPLORATION_EPSILON: f64 = 0.05;
const ADAPTIVE_FAMILY_RECENCY_ALPHA: f64 = 0.12;
const ADAPTIVE_FAMILY_MIN_WEIGHT: f64 = 0.10;
const ADAPTIVE_FAMILY_MIN_CANDIDATE_RATE: f64 = 0.05;
const ADAPTIVE_FAMILY_MIN_SHARE_RATIO: f64 = 0.5;
const ADAPTIVE_FAMILY_MAX_SHARE_RATIO: f64 = 1.5;
const ADAPTIVE_FAMILY_REJECTED_CANDIDATE_PENALTY: f64 = 0.10;
const ADAPTIVE_FAMILY_NO_CANDIDATE_PENALTY: f64 = 0.0;
const MIN_UTILITY_SECONDS: f64 = 1.0e-9;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MoveFamilyUtilityMode {
    PerAttempt,
    PerSecond,
}

#[derive(Debug, Clone)]
pub(crate) struct MoveFamilySelector {
    move_policy: MovePolicy,
    allowed_families: [MoveFamily; 3],
    allowed_len: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct MoveFamilyOrder {
    families: [MoveFamily; 3],
    len: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub(crate) struct MoveFamilyChooserArm {
    pub(crate) primary_attempts: u64,
    pub(crate) recent_reward: f64,
    pub(crate) recent_seconds: f64,
    pub(crate) recent_share: f64,
    pub(crate) recent_candidate_rate: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub(crate) struct MoveFamilyChooserState {
    pub(crate) swap: MoveFamilyChooserArm,
    pub(crate) transfer: MoveFamilyChooserArm,
    pub(crate) clique_swap: MoveFamilyChooserArm,
}

impl MoveFamilySelector {
    pub(crate) fn new(move_policy: &MovePolicy) -> Self {
        let mut allowed_families = [MoveFamily::Swap; 3];
        let mut allowed_len = 0usize;

        if let Some(forced_family) = move_policy.forced_family {
            allowed_families[0] = forced_family;
            allowed_len = 1;
        } else if let Some(allowed) = &move_policy.allowed_families {
            for family in allowed.iter().copied() {
                allowed_families[allowed_len] = family;
                allowed_len += 1;
            }
        } else {
            for (idx, family) in MoveFamily::ALL.iter().copied().enumerate() {
                allowed_families[idx] = family;
            }
            allowed_len = MoveFamily::ALL.len();
        }

        Self {
            move_policy: move_policy.clone(),
            allowed_families,
            allowed_len,
        }
    }

    #[inline]
    pub(crate) fn ordered_families(&self, rng: &mut ChaCha12Rng) -> Vec<MoveFamily> {
        self.ordered_families_small(rng).as_slice().to_vec()
    }

    #[inline]
    pub(crate) fn ordered_families_small(&self, rng: &mut ChaCha12Rng) -> MoveFamilyOrder {
        if let Some(forced_family) = self.move_policy.forced_family {
            return MoveFamilyOrder::from_slice(&[forced_family]);
        }

        let mut families = self.allowed_families;
        let len = self.allowed_len;
        if len <= 1 {
            return MoveFamilyOrder { families, len };
        }

        match self.move_policy.mode {
            MoveSelectionMode::Adaptive => {
                families[..len].shuffle(rng);
                MoveFamilyOrder { families, len }
            }
            MoveSelectionMode::Weighted => {
                let weights = self
                    .move_policy
                    .weights
                    .as_ref()
                    .expect("weighted move policy should be normalized before use");
                let Some(first) = choose_weighted_family(&families[..len], weights, rng) else {
                    families[..len].shuffle(rng);
                    return MoveFamilyOrder { families, len };
                };

                let first_idx = families[..len]
                    .iter()
                    .position(|family| *family == first)
                    .expect("weighted family should be present in allowed family slice");
                families.swap(0, first_idx);
                if len > 1 {
                    families[1..len].shuffle(rng);
                }
                MoveFamilyOrder { families, len }
            }
        }
    }

    #[inline]
    pub(crate) fn choose_family(
        &self,
        chooser_state: &MoveFamilyChooserState,
        utility_mode: MoveFamilyUtilityMode,
        rng: &mut ChaCha12Rng,
    ) -> MoveFamily {
        if let Some(forced_family) = self.move_policy.forced_family {
            return forced_family;
        }

        let families = &self.allowed_families[..self.allowed_len];
        if families.len() == 1 {
            return families[0];
        }

        match self.move_policy.mode {
            MoveSelectionMode::Adaptive => {
                choose_adaptive_family(families, chooser_state, utility_mode, rng)
            }
            MoveSelectionMode::Weighted => {
                let weights = self
                    .move_policy
                    .weights
                    .as_ref()
                    .expect("weighted move policy should be normalized before use");
                choose_weighted_family(families, weights, rng)
                    .unwrap_or_else(|| families[rng.random_range(0..families.len())])
            }
        }
    }
}

impl MoveFamilyChooserState {
    #[inline]
    pub(crate) fn record_attempt(
        &mut self,
        family: MoveFamily,
        total_seconds: f64,
        accepted_delta: Option<f64>,
        had_candidate: bool,
    ) {
        for tracked_family in MoveFamily::ALL {
            let arm = chooser_arm_mut(self, tracked_family);
            update_ema(
                &mut arm.recent_share,
                if tracked_family == family { 1.0 } else { 0.0 },
                ADAPTIVE_FAMILY_RECENCY_ALPHA,
            );
        }

        let arm = chooser_arm_mut(self, family);
        arm.primary_attempts += 1;
        update_ema(
            &mut arm.recent_seconds,
            total_seconds.max(0.0),
            ADAPTIVE_FAMILY_RECENCY_ALPHA,
        );
        let reward_signal = match accepted_delta {
            Some(delta) => signed_sqrt_reward(delta),
            None if had_candidate => -ADAPTIVE_FAMILY_REJECTED_CANDIDATE_PENALTY,
            None => -ADAPTIVE_FAMILY_NO_CANDIDATE_PENALTY,
        };
        update_ema(
            &mut arm.recent_reward,
            reward_signal,
            ADAPTIVE_FAMILY_RECENCY_ALPHA,
        );
        update_ema(
            &mut arm.recent_candidate_rate,
            if had_candidate { 1.0 } else { 0.0 },
            ADAPTIVE_FAMILY_RECENCY_ALPHA,
        );
    }
}

impl MoveFamilyOrder {
    #[inline]
    fn from_slice(families: &[MoveFamily]) -> Self {
        let mut fixed = [MoveFamily::Swap; 3];
        for (idx, family) in families.iter().copied().enumerate() {
            fixed[idx] = family;
        }
        Self {
            families: fixed,
            len: families.len(),
        }
    }

    #[inline]
    pub(crate) fn as_slice(&self) -> &[MoveFamily] {
        &self.families[..self.len]
    }
}

#[inline]
fn choose_weighted_family(
    families: &[MoveFamily],
    weights: &crate::models::MoveFamilyWeights,
    rng: &mut ChaCha12Rng,
) -> Option<MoveFamily> {
    let total_weight = families
        .iter()
        .map(|family| weights.weight_for(*family))
        .sum::<f64>();
    if total_weight <= 0.0 {
        return None;
    }

    let mut slot = rng.random::<f64>() * total_weight;
    for family in families {
        slot -= weights.weight_for(*family);
        if slot <= 0.0 {
            return Some(*family);
        }
    }

    families.last().copied()
}

#[inline]
fn choose_adaptive_family(
    families: &[MoveFamily],
    chooser_state: &MoveFamilyChooserState,
    utility_mode: MoveFamilyUtilityMode,
    rng: &mut ChaCha12Rng,
) -> MoveFamily {
    let min_attempts = families
        .iter()
        .map(|family| chooser_arm(chooser_state, *family).primary_attempts)
        .min()
        .unwrap_or(0);
    if min_attempts < ADAPTIVE_FAMILY_WARMUP_ATTEMPTS {
        let warmup = families
            .iter()
            .copied()
            .filter(|family| chooser_arm(chooser_state, *family).primary_attempts == min_attempts)
            .collect::<Vec<_>>();
        return warmup[rng.random_range(0..warmup.len())];
    }

    if rng.random::<f64>() < ADAPTIVE_FAMILY_EXPLORATION_EPSILON {
        return families[rng.random_range(0..families.len())];
    }

    let mut utilities = [0.0; 3];
    let mut min_utility = f64::INFINITY;
    let mut max_utility = f64::NEG_INFINITY;
    for (idx, family) in families.iter().copied().enumerate() {
        let utility = chooser_arm_utility(chooser_arm(chooser_state, family), utility_mode);
        utilities[idx] = utility;
        min_utility = min_utility.min(utility);
        max_utility = max_utility.max(utility);
    }

    let utility_span = (max_utility - min_utility).max(0.0);
    if utility_span <= f64::EPSILON {
        return families[rng.random_range(0..families.len())];
    }

    let mut target_share_mass = 0.0;
    let mut target_shares = [0.0; 3];
    for (idx, family) in families.iter().copied().enumerate() {
        let candidate_weight = chooser_arm(chooser_state, family)
            .recent_candidate_rate
            .max(ADAPTIVE_FAMILY_MIN_CANDIDATE_RATE);
        target_shares[idx] = candidate_weight;
        target_share_mass += candidate_weight;
    }

    let mut weights = [0.0; 3];
    for idx in 0..families.len() {
        let normalized = if utility_span <= f64::EPSILON {
            1.0
        } else {
            ((utilities[idx] - min_utility) / utility_span).clamp(0.0, 1.0)
        };
        let share_multiplier = chooser_arm_share_multiplier(
            chooser_arm(chooser_state, families[idx]).recent_share,
            target_shares[idx] / target_share_mass.max(f64::EPSILON),
        );
        weights[idx] = share_multiplier * (ADAPTIVE_FAMILY_MIN_WEIGHT + normalized);
    }

    choose_weighted_by_slice(families, &weights[..families.len()], rng)
        .unwrap_or_else(|| families[rng.random_range(0..families.len())])
}

#[inline]
fn chooser_arm(state: &MoveFamilyChooserState, family: MoveFamily) -> &MoveFamilyChooserArm {
    match family {
        MoveFamily::Swap => &state.swap,
        MoveFamily::Transfer => &state.transfer,
        MoveFamily::CliqueSwap => &state.clique_swap,
    }
}

#[inline]
fn chooser_arm_mut(
    state: &mut MoveFamilyChooserState,
    family: MoveFamily,
) -> &mut MoveFamilyChooserArm {
    match family {
        MoveFamily::Swap => &mut state.swap,
        MoveFamily::Transfer => &mut state.transfer,
        MoveFamily::CliqueSwap => &mut state.clique_swap,
    }
}

#[inline]
fn chooser_arm_utility(arm: &MoveFamilyChooserArm, utility_mode: MoveFamilyUtilityMode) -> f64 {
    match utility_mode {
        MoveFamilyUtilityMode::PerAttempt => arm.recent_reward,
        MoveFamilyUtilityMode::PerSecond => {
            if arm.recent_seconds <= MIN_UTILITY_SECONDS {
                0.0
            } else {
                arm.recent_reward / arm.recent_seconds
            }
        }
    }
}

#[inline]
fn chooser_arm_share_multiplier(recent_share: f64, target_share: f64) -> f64 {
    if recent_share <= f64::EPSILON || target_share <= f64::EPSILON {
        return ADAPTIVE_FAMILY_MAX_SHARE_RATIO;
    }

    (target_share / recent_share).sqrt().clamp(
        ADAPTIVE_FAMILY_MIN_SHARE_RATIO,
        ADAPTIVE_FAMILY_MAX_SHARE_RATIO,
    )
}

#[inline]
fn choose_weighted_by_slice(
    families: &[MoveFamily],
    weights: &[f64],
    rng: &mut ChaCha12Rng,
) -> Option<MoveFamily> {
    debug_assert_eq!(families.len(), weights.len());
    let total_weight = weights.iter().copied().sum::<f64>();
    if total_weight <= 0.0 {
        return None;
    }

    let mut slot = rng.random::<f64>() * total_weight;
    for (family, weight) in families.iter().zip(weights.iter().copied()) {
        slot -= weight;
        if slot <= 0.0 {
            return Some(*family);
        }
    }

    families.last().copied()
}

#[inline]
fn signed_sqrt_reward(delta: f64) -> f64 {
    if delta == 0.0 {
        0.0
    } else {
        delta.abs().sqrt() * -delta.signum()
    }
}

#[inline]
fn update_ema(target: &mut f64, sample: f64, alpha: f64) {
    *target += alpha * (sample - *target);
}

#[cfg(test)]
mod tests {
    use rand::SeedableRng;
    use rand_chacha::ChaCha12Rng;

    use crate::models::{MoveFamily, MoveFamilyWeights, MovePolicy, MoveSelectionMode};

    use super::{MoveFamilyChooserState, MoveFamilySelector, MoveFamilyUtilityMode};

    #[test]
    fn forced_family_short_circuits_ordering() {
        let selector = MoveFamilySelector::new(&MovePolicy {
            forced_family: Some(MoveFamily::Transfer),
            ..Default::default()
        });
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        assert_eq!(
            selector.ordered_families(&mut rng),
            vec![MoveFamily::Transfer]
        );
    }

    #[test]
    fn adaptive_selector_keeps_same_family_set() {
        let selector = MoveFamilySelector::new(&MovePolicy::default());
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let mut families = selector.ordered_families(&mut rng);
        families.sort_unstable();
        assert_eq!(families, MoveFamily::ALL.to_vec());
    }

    #[test]
    fn weighted_selector_prefers_non_zero_weight_family_first() {
        let selector = MoveFamilySelector::new(&MovePolicy {
            mode: MoveSelectionMode::Weighted,
            weights: Some(MoveFamilyWeights {
                swap: 0.0,
                transfer: 1.0,
                clique_swap: 0.0,
            }),
            ..Default::default()
        });
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let ordered = selector.ordered_families(&mut rng);
        assert_eq!(ordered[0], MoveFamily::Transfer);
    }

    #[test]
    fn adaptive_chooser_warms_up_least_tried_family() {
        let selector = MoveFamilySelector::new(&MovePolicy::default());
        let chooser = MoveFamilyChooserState {
            swap: super::MoveFamilyChooserArm {
                primary_attempts: 64,
                ..Default::default()
            },
            transfer: super::MoveFamilyChooserArm {
                primary_attempts: 2,
                ..Default::default()
            },
            clique_swap: super::MoveFamilyChooserArm {
                primary_attempts: 64,
                ..Default::default()
            },
        };
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        assert_eq!(
            selector.choose_family(&chooser, MoveFamilyUtilityMode::PerAttempt, &mut rng),
            MoveFamily::Transfer
        );
    }

    #[test]
    fn adaptive_chooser_prefers_highest_recent_utility_per_second() {
        let selector = MoveFamilySelector::new(&MovePolicy::default());
        let chooser = MoveFamilyChooserState {
            swap: super::MoveFamilyChooserArm {
                primary_attempts: 64,
                recent_reward: 0.5,
                recent_seconds: 1.0,
                recent_share: 1.0 / 3.0,
                recent_candidate_rate: 1.0,
            },
            transfer: super::MoveFamilyChooserArm {
                primary_attempts: 64,
                recent_reward: 1.2,
                recent_seconds: 1.0,
                recent_share: 1.0 / 3.0,
                recent_candidate_rate: 1.0,
            },
            clique_swap: super::MoveFamilyChooserArm {
                primary_attempts: 64,
                recent_reward: 0.2,
                recent_seconds: 1.0,
                recent_share: 1.0 / 3.0,
                recent_candidate_rate: 1.0,
            },
        };
        let mut rng = ChaCha12Rng::seed_from_u64(0);
        assert_eq!(
            selector.choose_family(&chooser, MoveFamilyUtilityMode::PerSecond, &mut rng),
            MoveFamily::Transfer
        );
    }

    #[test]
    fn record_attempt_uses_recency_weighted_reward_and_cost() {
        let mut chooser = MoveFamilyChooserState::default();
        chooser.record_attempt(MoveFamily::Swap, 2.0, Some(-9.0), true);
        chooser.record_attempt(MoveFamily::Swap, 1.0, None, false);

        assert_eq!(chooser.swap.primary_attempts, 2);
        assert!(chooser.swap.recent_reward > 0.0);
        assert!(chooser.swap.recent_reward < 9.0f64.sqrt());
        assert!(chooser.swap.recent_seconds > 0.0);
        assert!(chooser.swap.recent_seconds < 2.0);
        assert!(chooser.swap.recent_share > chooser.transfer.recent_share);
        assert!(chooser.swap.recent_share > chooser.clique_swap.recent_share);
        assert!(chooser.swap.recent_candidate_rate > 0.0);
    }

    #[test]
    fn adaptive_chooser_downweights_recently_dominant_family_when_utilities_tie() {
        let selector = MoveFamilySelector::new(&MovePolicy::default());
        let chooser = MoveFamilyChooserState {
            swap: super::MoveFamilyChooserArm {
                primary_attempts: 64,
                recent_reward: 1.0,
                recent_seconds: 1.0,
                recent_share: 0.85,
                recent_candidate_rate: 1.0,
            },
            transfer: super::MoveFamilyChooserArm {
                primary_attempts: 64,
                recent_reward: 1.0,
                recent_seconds: 1.0,
                recent_share: 0.10,
                recent_candidate_rate: 1.0,
            },
            clique_swap: super::MoveFamilyChooserArm {
                primary_attempts: 64,
                recent_reward: 1.0,
                recent_seconds: 1.0,
                recent_share: 0.05,
                recent_candidate_rate: 1.0,
            },
        };
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let mut counts = [0usize; 3];
        for _ in 0..128 {
            match selector.choose_family(&chooser, MoveFamilyUtilityMode::PerSecond, &mut rng) {
                MoveFamily::Swap => counts[0] += 1,
                MoveFamily::Transfer => counts[1] += 1,
                MoveFamily::CliqueSwap => counts[2] += 1,
            }
        }

        assert!(counts[0] < counts[1] + counts[2]);
        assert!(counts[1] > 0 || counts[2] > 0);
    }
}
