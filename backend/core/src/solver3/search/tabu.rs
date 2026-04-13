use rand::RngExt;
use rand_chacha::ChaCha12Rng;

use crate::models::Solver3SgpWeekPairTabuTenureMode;
use crate::solver3::compiled_problem::CompiledProblem;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct SgpWeekPairTabuConfig {
    pub(crate) tenure_mode: Solver3SgpWeekPairTabuTenureMode,
    pub(crate) tenure_min: u64,
    pub(crate) tenure_max: u64,
    pub(crate) retry_cap: usize,
    pub(crate) aspiration_enabled: bool,
    pub(crate) session_scale_reference_participants: u64,
    pub(crate) reactive_no_improvement_window: u64,
    pub(crate) reactive_max_multiplier: u64,
    pub(crate) conflict_restricted_swap_sampling_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SgpWeekPairTabuState {
    num_pairs: usize,
    tenure_mode: Solver3SgpWeekPairTabuTenureMode,
    tenure_min: u64,
    tenure_max: u64,
    session_scale_reference_participants: u64,
    reactive_no_improvement_window: u64,
    reactive_max_multiplier: u64,
    session_pair_expiry: Vec<u64>,
}

impl SgpWeekPairTabuState {
    pub(crate) fn new(compiled: &CompiledProblem, config: SgpWeekPairTabuConfig) -> Self {
        Self {
            num_pairs: compiled.num_pairs,
            tenure_mode: config.tenure_mode,
            tenure_min: config.tenure_min,
            tenure_max: config.tenure_max,
            session_scale_reference_participants: config.session_scale_reference_participants,
            reactive_no_improvement_window: config.reactive_no_improvement_window,
            reactive_max_multiplier: config.reactive_max_multiplier,
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
        no_improvement_count: u64,
        rng: &mut ChaCha12Rng,
    ) -> u64 {
        let tenure = self.sample_tenure(compiled, session_idx, no_improvement_count, rng);
        let slot = self.pair_slot(compiled, session_idx, left_person_idx, right_person_idx);
        let expiry = iteration.saturating_add(tenure);
        self.session_pair_expiry[slot] = expiry;
        expiry
    }

    #[inline]
    fn sample_tenure(
        &self,
        compiled: &CompiledProblem,
        session_idx: usize,
        no_improvement_count: u64,
        rng: &mut ChaCha12Rng,
    ) -> u64 {
        let base = if self.tenure_min >= self.tenure_max {
            self.tenure_min
        } else {
            rng.random_range(self.tenure_min..=self.tenure_max)
        };

        match self.tenure_mode {
            Solver3SgpWeekPairTabuTenureMode::FixedInterval => base,
            Solver3SgpWeekPairTabuTenureMode::SessionParticipantScaled => {
                let reference = self.session_scale_reference_participants.max(1);
                let participants = compiled
                    .session_participant_counts
                    .get(session_idx)
                    .copied()
                    .unwrap_or(1)
                    .max(1) as u64;
                let scaled = base.saturating_mul(participants).div_ceil(reference);
                scaled.max(base)
            }
            Solver3SgpWeekPairTabuTenureMode::ReactiveNoImprovementScaled => {
                let window = self.reactive_no_improvement_window.max(1);
                let max_multiplier = self.reactive_max_multiplier.max(1);
                let multiplier = (1 + (no_improvement_count / window)).min(max_multiplier);
                base.saturating_mul(multiplier)
            }
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
        Solver3SgpWeekPairTabuTenureMode, SolverConfiguration, SolverParams, StopConditions,
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
            tenure_mode: Solver3SgpWeekPairTabuTenureMode::FixedInterval,
            tenure_min: 3,
            tenure_max: 7,
            retry_cap: 5,
            aspiration_enabled: true,
            session_scale_reference_participants: 32,
            reactive_no_improvement_window: 100_000,
            reactive_max_multiplier: 4,
            conflict_restricted_swap_sampling_enabled: false,
        }
    }

    #[test]
    fn slots_are_dense_by_actual_session_and_pair() {
        let state = compiled_problem();
        let tabu = SgpWeekPairTabuState::new(&state.compiled, config());
        let pair_idx = state.compiled.pair_idx(0, 3);

        assert_eq!(tabu.slot(0, pair_idx), pair_idx);
        assert_eq!(tabu.slot(1, pair_idx), state.compiled.num_pairs + pair_idx);
        assert_eq!(
            tabu.slot(2, pair_idx),
            2 * state.compiled.num_pairs + pair_idx
        );
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

        let expiry = tabu.record_swap(&state.compiled, 2, 0, 3, 10, 0, &mut rng);
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

        tabu.record_swap(&state.compiled, 0, 0, 3, 4, 0, &mut rng);

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
                tenure_mode: Solver3SgpWeekPairTabuTenureMode::FixedInterval,
                tenure_min: 3,
                tenure_max: 3,
                retry_cap: 5,
                aspiration_enabled: true,
                session_scale_reference_participants: 32,
                reactive_no_improvement_window: 100_000,
                reactive_max_multiplier: 4,
                conflict_restricted_swap_sampling_enabled: false,
            },
        );
        let mut rng = ChaCha12Rng::seed_from_u64(23);

        let expiry = tabu.record_swap(&state.compiled, 1, 0, 2, 10, 0, &mut rng);
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
            left.record_swap(&state.compiled, 0, 0, 1, 0, 0, &mut left_rng),
            left.record_swap(&state.compiled, 1, 0, 2, 5, 0, &mut left_rng),
            left.record_swap(&state.compiled, 2, 1, 3, 9, 0, &mut left_rng),
        ];
        let right_expiries = [
            right.record_swap(&state.compiled, 0, 0, 1, 0, 0, &mut right_rng),
            right.record_swap(&state.compiled, 1, 0, 2, 5, 0, &mut right_rng),
            right.record_swap(&state.compiled, 2, 1, 3, 9, 0, &mut right_rng),
        ];

        assert_eq!(left_expiries, right_expiries);
    }

    #[test]
    fn recording_same_slot_overwrites_expiry() {
        let state = compiled_problem();
        let mut tabu = SgpWeekPairTabuState::new(
            &state.compiled,
            SgpWeekPairTabuConfig {
                tenure_mode: Solver3SgpWeekPairTabuTenureMode::FixedInterval,
                tenure_min: 4,
                tenure_max: 4,
                retry_cap: 5,
                aspiration_enabled: true,
                session_scale_reference_participants: 32,
                reactive_no_improvement_window: 100_000,
                reactive_max_multiplier: 4,
                conflict_restricted_swap_sampling_enabled: false,
            },
        );
        let mut rng = ChaCha12Rng::seed_from_u64(31);

        let first_expiry = tabu.record_swap(&state.compiled, 1, 0, 3, 2, 0, &mut rng);
        let second_expiry = tabu.record_swap(&state.compiled, 1, 3, 0, 8, 0, &mut rng);

        assert_eq!(first_expiry, 6);
        assert_eq!(second_expiry, 12);
        assert_eq!(tabu.expiry_for_pair(&state.compiled, 1, 0, 3), 12);
    }

    #[test]
    fn session_participant_scaled_tenure_only_grows_on_larger_sessions() {
        let state = compiled_problem();
        let mut tabu = SgpWeekPairTabuState::new(
            &state.compiled,
            SgpWeekPairTabuConfig {
                tenure_mode: Solver3SgpWeekPairTabuTenureMode::SessionParticipantScaled,
                tenure_min: 4,
                tenure_max: 4,
                retry_cap: 5,
                aspiration_enabled: true,
                session_scale_reference_participants: 2,
                reactive_no_improvement_window: 100_000,
                reactive_max_multiplier: 4,
                conflict_restricted_swap_sampling_enabled: false,
            },
        );
        let mut rng = ChaCha12Rng::seed_from_u64(37);

        let expiry = tabu.record_swap(&state.compiled, 0, 0, 1, 10, 0, &mut rng);

        assert_eq!(expiry, 18);
    }

    #[test]
    fn reactive_tenure_scales_with_no_improvement_streak() {
        let state = compiled_problem();
        let mut tabu = SgpWeekPairTabuState::new(
            &state.compiled,
            SgpWeekPairTabuConfig {
                tenure_mode: Solver3SgpWeekPairTabuTenureMode::ReactiveNoImprovementScaled,
                tenure_min: 4,
                tenure_max: 4,
                retry_cap: 5,
                aspiration_enabled: true,
                session_scale_reference_participants: 32,
                reactive_no_improvement_window: 5,
                reactive_max_multiplier: 4,
                conflict_restricted_swap_sampling_enabled: false,
            },
        );
        let mut rng = ChaCha12Rng::seed_from_u64(41);

        let expiry = tabu.record_swap(&state.compiled, 0, 0, 1, 10, 12, &mut rng);

        assert_eq!(expiry, 22);
    }
}
