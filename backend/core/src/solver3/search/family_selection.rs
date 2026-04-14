use rand::{seq::SliceRandom, RngExt};
use rand_chacha::ChaCha12Rng;

use crate::models::{MoveFamily, MovePolicy, MoveSelectionMode};

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

#[cfg(test)]
mod tests {
    use rand::SeedableRng;
    use rand_chacha::ChaCha12Rng;

    use crate::models::{MoveFamily, MoveFamilyWeights, MovePolicy, MoveSelectionMode};

    use super::MoveFamilySelector;

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
}
