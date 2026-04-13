use rand::RngExt;
use rand_chacha::ChaCha12Rng;

use super::super::compiled_problem::CompiledProblem;
use super::super::runtime_state::RuntimeState;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RepeatGuidanceState {
    repeat_max_allowed_encounters: u16,
    pair_excess_by_pair: Vec<u16>,
    pair_bucket_positions: Vec<Option<usize>>,
    buckets: Vec<Vec<usize>>,
    person_incident_counts: Vec<u16>,
    active_pair_count: usize,
}

impl RepeatGuidanceState {
    pub(crate) fn build_from_state(state: &RuntimeState) -> Option<Self> {
        let repeat = state.compiled.repeat_encounter.as_ref()?;
        let max_allowed = repeat.max_allowed_encounters as u16;
        let max_possible_excess = state
            .compiled
            .num_sessions
            .saturating_sub(max_allowed as usize);
        let mut guidance = Self {
            repeat_max_allowed_encounters: max_allowed,
            pair_excess_by_pair: vec![0; state.compiled.num_pairs],
            pair_bucket_positions: vec![None; state.compiled.num_pairs],
            buckets: vec![Vec::new(); max_possible_excess.saturating_add(1)],
            person_incident_counts: vec![0; state.compiled.num_people],
            active_pair_count: 0,
        };

        for (pair_idx, &count) in state.pair_contacts.iter().enumerate() {
            let excess = count.saturating_sub(max_allowed);
            if excess > 0 {
                guidance.insert_pair_with_excess(&state.compiled, pair_idx, excess);
            }
        }

        Some(guidance)
    }

    pub(crate) fn rebuild_from_state(&mut self, state: &RuntimeState) {
        if let Some(rebuilt) = Self::build_from_state(state) {
            *self = rebuilt;
        }
    }

    #[inline]
    pub(crate) fn active_pair_count(&self) -> usize {
        self.active_pair_count
    }

    #[inline]
    pub(crate) fn pair_excess(&self, pair_idx: usize) -> u16 {
        self.pair_excess_by_pair[pair_idx]
    }

    #[inline]
    pub(crate) fn person_incident_count(&self, person_idx: usize) -> u16 {
        self.person_incident_counts[person_idx]
    }

    pub(crate) fn highest_active_excess(&self) -> Option<usize> {
        self.buckets.iter().rposition(|bucket| !bucket.is_empty())
    }

    pub(crate) fn sample_pair_from_highest_bucket(&self, rng: &mut ChaCha12Rng) -> Option<usize> {
        let bucket_idx = self.highest_active_excess()?;
        let bucket = &self.buckets[bucket_idx];
        if bucket.is_empty() {
            None
        } else {
            Some(bucket[rng.random_range(0..bucket.len())])
        }
    }

    fn insert_pair_with_excess(
        &mut self,
        compiled: &CompiledProblem,
        pair_idx: usize,
        excess: u16,
    ) {
        debug_assert!(excess > 0);
        let bucket_idx = excess as usize;
        let bucket = &mut self.buckets[bucket_idx];
        self.pair_bucket_positions[pair_idx] = Some(bucket.len());
        bucket.push(pair_idx);
        self.pair_excess_by_pair[pair_idx] = excess;
        self.active_pair_count += 1;

        let (left, right) = compiled.pair_members(pair_idx);
        self.person_incident_counts[left] = self.person_incident_counts[left].saturating_add(1);
        self.person_incident_counts[right] = self.person_incident_counts[right].saturating_add(1);
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
        Solver3Params, SolverConfiguration, SolverParams, StopConditions,
    };
    use crate::solver3::runtime_state::RuntimeState;

    use super::RepeatGuidanceState;

    fn solver3_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: "solver3".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(40),
                time_limit_seconds: None,
                no_improvement_iterations: Some(40),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver3(Solver3Params::default()),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(7),
            move_policy: None,
            allowed_sessions: None,
        }
    }

    fn repeated_pair_state() -> RuntimeState {
        let people = (0..4)
            .map(|i| Person {
                id: format!("p{}", i),
                attributes: HashMap::new(),
                sessions: None,
            })
            .collect();
        let groups = vec![
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
        ];

        let initial_schedule = HashMap::from([
            (
                "session_0".to_string(),
                HashMap::from([
                    ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                    ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                ]),
            ),
            (
                "session_1".to_string(),
                HashMap::from([
                    ("g0".to_string(), vec!["p0".to_string(), "p1".to_string()]),
                    ("g1".to_string(), vec!["p2".to_string(), "p3".to_string()]),
                ]),
            ),
        ]);

        RuntimeState::from_input(&ApiInput {
            problem: ProblemDefinition {
                people,
                groups,
                num_sessions: 2,
            },
            initial_schedule: Some(initial_schedule),
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "linear".into(),
                penalty_weight: 100.0,
            })],
            solver: solver3_config(),
        })
        .unwrap()
    }

    #[test]
    fn build_returns_none_without_repeat_constraint() {
        let input = ApiInput {
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
                num_sessions: 1,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: solver3_config(),
        };
        let state = RuntimeState::from_input(&input).unwrap();
        assert!(RepeatGuidanceState::build_from_state(&state).is_none());
    }

    #[test]
    fn build_populates_repeat_offender_buckets_and_incidents() {
        let state = repeated_pair_state();
        let guidance = RepeatGuidanceState::build_from_state(&state).unwrap();
        let offender_pair = state.compiled.pair_idx(0, 1);
        let non_offender_pair = state.compiled.pair_idx(0, 2);

        assert_eq!(guidance.active_pair_count(), 2);
        assert_eq!(guidance.highest_active_excess(), Some(1));
        assert_eq!(guidance.pair_excess(offender_pair), 1);
        assert_eq!(guidance.pair_excess(non_offender_pair), 0);
        assert_eq!(guidance.person_incident_count(0), 1);
        assert_eq!(guidance.person_incident_count(1), 1);
        assert_eq!(guidance.person_incident_count(2), 1);
        assert_eq!(guidance.person_incident_count(3), 1);
    }

    #[test]
    fn compiled_problem_pair_members_round_trips_pair_indices() {
        let state = repeated_pair_state();
        for left in 0..state.compiled.num_people {
            for right in (left + 1)..state.compiled.num_people {
                let pair_idx = state.compiled.pair_idx(left, right);
                assert_eq!(state.compiled.pair_members(pair_idx), (left, right));
            }
        }
    }

    #[test]
    fn rebuild_restores_original_guidance_state() {
        let state = repeated_pair_state();
        let mut guidance = RepeatGuidanceState::build_from_state(&state).unwrap();
        guidance.rebuild_from_state(&state);
        let rebuilt = RepeatGuidanceState::build_from_state(&state).unwrap();
        assert_eq!(guidance, rebuilt);
    }
}
