use rand::{seq::SliceRandom, RngExt};
use rand_chacha::ChaCha12Rng;

use crate::models::{MoveFamily, MovePolicy, MoveSelectionMode};

#[derive(Debug, Clone)]
pub(crate) struct MoveFamilySelector {
    move_policy: MovePolicy,
}

impl MoveFamilySelector {
    pub(crate) fn new(move_policy: &MovePolicy) -> Self {
        Self {
            move_policy: move_policy.clone(),
        }
    }

    #[inline]
    pub(crate) fn ordered_families(&self, rng: &mut ChaCha12Rng) -> Vec<MoveFamily> {
        if let Some(forced_family) = self.move_policy.forced_family {
            return vec![forced_family];
        }

        let mut families = self.move_policy.allowed_families();
        if families.len() <= 1 {
            return families;
        }

        match self.move_policy.mode {
            MoveSelectionMode::Adaptive => {
                families.shuffle(rng);
                families
            }
            MoveSelectionMode::Weighted => {
                let weights = self
                    .move_policy
                    .weights
                    .as_ref()
                    .expect("weighted move policy should be normalized before use");
                let Some(first) = choose_weighted_family(&families, weights, rng) else {
                    families.shuffle(rng);
                    return families;
                };

                let mut ordered = vec![first];
                families.retain(|family| *family != first);
                families.shuffle(rng);
                ordered.extend(families);
                ordered
            }
        }
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
        assert_eq!(selector.ordered_families(&mut rng), vec![MoveFamily::Transfer]);
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
