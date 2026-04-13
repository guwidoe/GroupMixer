use rand::RngExt;
use rand_chacha::ChaCha12Rng;

use super::super::moves::PairContactUpdate;
use super::super::runtime_state::RuntimeState;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SgpConflictState {
    repeat_max_allowed_encounters: u16,
    session_person_conflict_counts: Vec<u16>,
    conflicted_people_by_session: Vec<Vec<usize>>,
    sessions_with_conflicts: Vec<usize>,
}

impl SgpConflictState {
    pub(crate) fn build_from_state(
        state: &RuntimeState,
        allowed_sessions: &[usize],
    ) -> Option<Self> {
        let repeat = state.compiled.repeat_encounter.as_ref()?;
        let mut conflicts = Self {
            repeat_max_allowed_encounters: repeat.max_allowed_encounters as u16,
            session_person_conflict_counts: vec![
                0;
                state.compiled.num_sessions
                    * state.compiled.num_people
            ],
            conflicted_people_by_session: vec![Vec::new(); state.compiled.num_sessions],
            sessions_with_conflicts: Vec::new(),
        };

        for &session_idx in allowed_sessions {
            conflicts.rebuild_session(state, session_idx);
        }

        Some(conflicts)
    }

    #[inline]
    pub(crate) fn has_active_conflicts(&self) -> bool {
        !self.sessions_with_conflicts.is_empty()
    }

    pub(crate) fn sample_conflicted_position(
        &self,
        rng: &mut ChaCha12Rng,
    ) -> Option<(usize, usize)> {
        let session_idx =
            self.sessions_with_conflicts[rng.random_range(0..self.sessions_with_conflicts.len())];
        let conflicted_people = &self.conflicted_people_by_session[session_idx];
        let person_idx = conflicted_people[rng.random_range(0..conflicted_people.len())];
        Some((session_idx, person_idx))
    }

    pub(crate) fn refresh_after_move(
        &mut self,
        state: &RuntimeState,
        allowed_sessions: &[usize],
        touched_session_idx: usize,
        pair_contact_updates: &[PairContactUpdate],
    ) {
        if allowed_sessions.is_empty() {
            return;
        }

        let mut affected_sessions = vec![false; state.compiled.num_sessions];
        if allowed_sessions.contains(&touched_session_idx) {
            affected_sessions[touched_session_idx] = true;
        }

        for update in pair_contact_updates {
            let (left_person_idx, right_person_idx) = state.compiled.pair_members(update.pair_idx);
            for &session_idx in allowed_sessions {
                if pair_meets_in_session(state, session_idx, left_person_idx, right_person_idx) {
                    affected_sessions[session_idx] = true;
                }
            }
        }

        for &session_idx in allowed_sessions {
            if affected_sessions[session_idx] {
                self.rebuild_session(state, session_idx);
            }
        }
    }

    fn rebuild_session(&mut self, state: &RuntimeState, session_idx: usize) {
        let num_people = state.compiled.num_people;
        let counts_start = session_idx * num_people;
        let counts_end = counts_start + num_people;
        self.session_person_conflict_counts[counts_start..counts_end].fill(0);
        self.conflicted_people_by_session[session_idx].clear();

        for group_idx in 0..state.compiled.num_groups {
            let group_slot = state.group_slot(session_idx, group_idx);
            let group_members = &state.group_members[group_slot];
            for left_offset in 0..group_members.len() {
                let left_person_idx = group_members[left_offset];
                for &right_person_idx in &group_members[(left_offset + 1)..] {
                    let pair_idx = state.compiled.pair_idx(left_person_idx, right_person_idx);
                    if state.pair_contacts[pair_idx] <= self.repeat_max_allowed_encounters {
                        continue;
                    }
                    self.session_person_conflict_counts[counts_start + left_person_idx] = self
                        .session_person_conflict_counts[counts_start + left_person_idx]
                        .saturating_add(1);
                    self.session_person_conflict_counts[counts_start + right_person_idx] = self
                        .session_person_conflict_counts[counts_start + right_person_idx]
                        .saturating_add(1);
                }
            }
        }

        let conflicted_people = &mut self.conflicted_people_by_session[session_idx];
        for person_idx in 0..num_people {
            if self.session_person_conflict_counts[counts_start + person_idx] > 0 {
                conflicted_people.push(person_idx);
            }
        }
        let session_has_conflicts = !conflicted_people.is_empty();
        self.set_session_conflict_activity(session_idx, session_has_conflicts);
    }

    fn set_session_conflict_activity(&mut self, session_idx: usize, active: bool) {
        if active {
            if !self.sessions_with_conflicts.contains(&session_idx) {
                self.sessions_with_conflicts.push(session_idx);
            }
        } else if let Some(position) = self
            .sessions_with_conflicts
            .iter()
            .position(|&existing| existing == session_idx)
        {
            self.sessions_with_conflicts.swap_remove(position);
        }
    }

    #[cfg(test)]
    pub(crate) fn conflicted_people_in_session(&self, session_idx: usize) -> &[usize] {
        &self.conflicted_people_by_session[session_idx]
    }
}

fn pair_meets_in_session(
    state: &RuntimeState,
    session_idx: usize,
    left_person_idx: usize,
    right_person_idx: usize,
) -> bool {
    let left_group_idx = state.person_location[state.people_slot(session_idx, left_person_idx)];
    let right_group_idx = state.person_location[state.people_slot(session_idx, right_person_idx)];
    left_group_idx.is_some() && left_group_idx == right_group_idx
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
        Solver3Params, SolverConfiguration, SolverParams, StopConditions,
    };
    use crate::solver3::moves::{
        apply_swap_runtime_preview, preview_swap_runtime_lightweight, SwapMove,
    };
    use crate::solver3::runtime_state::RuntimeState;

    use super::SgpConflictState;

    fn solver3_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: "solver3".to_string(),
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
        }
    }

    fn repeated_pair_runtime_state() -> RuntimeState {
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
                num_sessions: 2,
            },
            initial_schedule: Some(HashMap::from([
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
            ])),
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
    fn build_from_state_marks_all_repeat_conflict_positions() {
        let state = repeated_pair_runtime_state();
        let conflicts = SgpConflictState::build_from_state(&state, &[0, 1]).unwrap();

        assert_eq!(conflicts.conflicted_people_in_session(0), &[0, 1, 2, 3]);
        assert_eq!(conflicts.conflicted_people_in_session(1), &[0, 1, 2, 3]);
        assert!(conflicts.has_active_conflicts());
    }

    #[test]
    fn refresh_after_move_clears_remote_session_when_repeat_pair_resolves() {
        let mut state = repeated_pair_runtime_state();
        let mut conflicts = SgpConflictState::build_from_state(&state, &[0, 1]).unwrap();
        let preview = preview_swap_runtime_lightweight(&state, &SwapMove::new(1, 0, 2)).unwrap();

        apply_swap_runtime_preview(&mut state, &preview).unwrap();
        conflicts.refresh_after_move(&state, &[0, 1], 1, &preview.patch.pair_contact_updates);

        assert!(conflicts.conflicted_people_in_session(0).is_empty());
        assert!(conflicts.conflicted_people_in_session(1).is_empty());
        assert!(!conflicts.has_active_conflicts());
    }
}
