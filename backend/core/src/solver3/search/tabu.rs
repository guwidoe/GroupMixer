use rand::RngExt;
use rand_chacha::ChaCha12Rng;

use crate::solver3::compiled_problem::CompiledProblem;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct SgpWeekPairTabuConfig {
    pub(crate) tenure_min: u64,
    pub(crate) tenure_max: u64,
    pub(crate) retry_cap: usize,
    pub(crate) aspiration_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SgpWeekPairTabuState {
    num_pairs: usize,
    tenure_min: u64,
    tenure_max: u64,
    session_pair_expiry: Vec<u64>,
}

impl SgpWeekPairTabuState {
    pub(crate) fn new(compiled: &CompiledProblem, config: SgpWeekPairTabuConfig) -> Self {
        Self {
            num_pairs: compiled.num_pairs,
            tenure_min: config.tenure_min,
            tenure_max: config.tenure_max,
            session_pair_expiry: vec![0; compiled.num_sessions * compiled.num_pairs],
        }
    }

    #[inline]
    pub(crate) fn slot(&self, session_idx: usize, pair_idx: usize) -> usize {
        session_idx * self.num_pairs + pair_idx
    }

    #[inline]
    pub(crate) fn pair_slot(
        &self,
        compiled: &CompiledProblem,
        session_idx: usize,
        left_person_idx: usize,
        right_person_idx: usize,
    ) -> usize {
        self.slot(
            session_idx,
            compiled.pair_idx(left_person_idx, right_person_idx),
        )
    }

    #[inline]
    pub(crate) fn expiry_at_slot(&self, slot: usize) -> u64 {
        self.session_pair_expiry[slot]
    }

    #[inline]
    pub(crate) fn expiry_for_pair(
        &self,
        compiled: &CompiledProblem,
        session_idx: usize,
        left_person_idx: usize,
        right_person_idx: usize,
    ) -> u64 {
        let slot = self.pair_slot(compiled, session_idx, left_person_idx, right_person_idx);
        self.expiry_at_slot(slot)
    }

    #[inline]
    pub(crate) fn is_tabu(
        &self,
        compiled: &CompiledProblem,
        session_idx: usize,
        left_person_idx: usize,
        right_person_idx: usize,
        iteration: u64,
    ) -> bool {
        let slot = self.pair_slot(compiled, session_idx, left_person_idx, right_person_idx);
        self.expiry_at_slot(slot) > iteration
    }

    pub(crate) fn record_swap(
        &mut self,
        compiled: &CompiledProblem,
        session_idx: usize,
        left_person_idx: usize,
        right_person_idx: usize,
        iteration: u64,
        rng: &mut ChaCha12Rng,
    ) -> u64 {
        let tenure = self.sample_tenure(rng);
        let slot = self.pair_slot(compiled, session_idx, left_person_idx, right_person_idx);
        let expiry = iteration.saturating_add(tenure);
        self.session_pair_expiry[slot] = expiry;
        expiry
    }

    #[inline]
    fn sample_tenure(&self, rng: &mut ChaCha12Rng) -> u64 {
        if self.tenure_min >= self.tenure_max {
            self.tenure_min
        } else {
            rng.random_range(self.tenure_min..=self.tenure_max)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use rand::SeedableRng;
    use rand_chacha::ChaCha12Rng;

    use crate::models::{
        ApiInput, Group, Objective, Person, ProblemDefinition, Solver3Params,
        SolverConfiguration, SolverParams, StopConditions,
    };
    use crate::solver3::runtime_state::RuntimeState;

    use super::{SgpWeekPairTabuConfig, SgpWeekPairTabuState};

    fn compiled_problem() -> RuntimeState {
        RuntimeState::from_input(&ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 3,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: SolverConfiguration {
                solver_type: "solver3".into(),
                stop_conditions: StopConditions {
                    max_iterations: Some(10),
                    time_limit_seconds: None,
                    no_improvement_iterations: None,
                    stop_on_optimal_score: false,
                },
                solver_params: SolverParams::Solver3(Solver3Params::default()),
                logging: Default::default(),
                telemetry: Default::default(),
                seed: Some(7),
                move_policy: None,
                allowed_sessions: None,
            },
        })
        .unwrap()
    }

    fn config() -> SgpWeekPairTabuConfig {
        SgpWeekPairTabuConfig {
            tenure_min: 3,
            tenure_max: 7,
            retry_cap: 5,
            aspiration_enabled: true,
        }
    }

    #[test]
    fn slots_are_dense_by_actual_session_and_pair() {
        let state = compiled_problem();
        let tabu = SgpWeekPairTabuState::new(&state.compiled, config());
        let pair_idx = state.compiled.pair_idx(0, 3);

        assert_eq!(tabu.slot(0, pair_idx), pair_idx);
        assert_eq!(tabu.slot(1, pair_idx), state.compiled.num_pairs + pair_idx);
        assert_eq!(tabu.slot(2, pair_idx), 2 * state.compiled.num_pairs + pair_idx);
    }

    #[test]
    fn pair_slot_uses_canonical_pair_indexing() {
        let state = compiled_problem();
        let tabu = SgpWeekPairTabuState::new(&state.compiled, config());

        assert_eq!(
            tabu.pair_slot(&state.compiled, 1, 0, 3),
            tabu.pair_slot(&state.compiled, 1, 3, 0)
        );
    }

    #[test]
    fn record_swap_sets_session_local_expiry() {
        let state = compiled_problem();
        let mut tabu = SgpWeekPairTabuState::new(&state.compiled, config());
        let mut rng = ChaCha12Rng::seed_from_u64(11);

        let expiry = tabu.record_swap(&state.compiled, 2, 0, 3, 10, &mut rng);
        let slot = tabu.pair_slot(&state.compiled, 2, 0, 3);

        assert_eq!(tabu.expiry_at_slot(slot), expiry);
        assert!(expiry >= 13);
        assert!(expiry <= 17);
    }

    #[test]
    fn tabu_is_isolated_per_session() {
        let state = compiled_problem();
        let mut tabu = SgpWeekPairTabuState::new(&state.compiled, config());
        let mut rng = ChaCha12Rng::seed_from_u64(19);

        tabu.record_swap(&state.compiled, 0, 0, 3, 4, &mut rng);

        assert!(tabu.is_tabu(&state.compiled, 0, 0, 3, 4));
        assert!(!tabu.is_tabu(&state.compiled, 1, 0, 3, 4));
        assert!(!tabu.is_tabu(&state.compiled, 2, 0, 3, 4));
    }

    #[test]
    fn is_tabu_uses_strict_expiry_boundary() {
        let state = compiled_problem();
        let mut tabu = SgpWeekPairTabuState::new(
            &state.compiled,
            SgpWeekPairTabuConfig {
                tenure_min: 3,
                tenure_max: 3,
                retry_cap: 5,
                aspiration_enabled: true,
            },
        );
        let mut rng = ChaCha12Rng::seed_from_u64(23);

        let expiry = tabu.record_swap(&state.compiled, 1, 0, 2, 10, &mut rng);
        assert_eq!(expiry, 13);
        assert!(tabu.is_tabu(&state.compiled, 1, 0, 2, 12));
        assert!(!tabu.is_tabu(&state.compiled, 1, 0, 2, 13));
    }

    #[test]
    fn sampled_tenures_are_deterministic_for_fixed_seed() {
        let state = compiled_problem();
        let mut left = SgpWeekPairTabuState::new(&state.compiled, config());
        let mut right = SgpWeekPairTabuState::new(&state.compiled, config());
        let mut left_rng = ChaCha12Rng::seed_from_u64(29);
        let mut right_rng = ChaCha12Rng::seed_from_u64(29);

        let left_expiries = [
            left.record_swap(&state.compiled, 0, 0, 1, 0, &mut left_rng),
            left.record_swap(&state.compiled, 1, 0, 2, 5, &mut left_rng),
            left.record_swap(&state.compiled, 2, 1, 3, 9, &mut left_rng),
        ];
        let right_expiries = [
            right.record_swap(&state.compiled, 0, 0, 1, 0, &mut right_rng),
            right.record_swap(&state.compiled, 1, 0, 2, 5, &mut right_rng),
            right.record_swap(&state.compiled, 2, 1, 3, 9, &mut right_rng),
        ];

        assert_eq!(left_expiries, right_expiries);
    }

    #[test]
    fn recording_same_slot_overwrites_expiry() {
        let state = compiled_problem();
        let mut tabu = SgpWeekPairTabuState::new(
            &state.compiled,
            SgpWeekPairTabuConfig {
                tenure_min: 4,
                tenure_max: 4,
                retry_cap: 5,
                aspiration_enabled: true,
            },
        );
        let mut rng = ChaCha12Rng::seed_from_u64(31);

        let first_expiry = tabu.record_swap(&state.compiled, 1, 0, 3, 2, &mut rng);
        let second_expiry = tabu.record_swap(&state.compiled, 1, 3, 0, 8, &mut rng);

        assert_eq!(first_expiry, 6);
        assert_eq!(second_expiry, 12);
        assert_eq!(tabu.expiry_for_pair(&state.compiled, 1, 0, 3), 12);
    }
}
