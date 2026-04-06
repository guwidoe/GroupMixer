use crate::models::ApiInput;
use crate::solver_support::SolverError;
use crate::solver_support::validation::validate_schedule_as_incumbent;
use std::sync::Arc;

use super::compiled_problem::{CompiledProblem, IndexedSchedule};
use super::scoring::{recompute_full_score, FullScoreSnapshot};

/// Oracle-friendly mutable schedule/state boundary for the `solver2` family.
#[derive(Debug, Clone)]
pub struct SolutionState {
    pub compiled_problem: Arc<CompiledProblem>,
    pub schedule: IndexedSchedule,
    pub locations: Vec<Vec<Option<(usize, usize)>>>,
    pub current_score: FullScoreSnapshot,
}

pub type ApiInputInitialSchedule =
    std::collections::HashMap<String, std::collections::HashMap<String, Vec<String>>>;

impl SolutionState {
    pub fn new(compiled_problem: &CompiledProblem) -> Result<Self, SolverError> {
        let mut state = Self {
            compiled_problem: Arc::new(compiled_problem.clone()),
            schedule: compiled_problem
                .compiled_initial_schedule
                .clone()
                .unwrap_or_else(|| {
                    vec![
                        vec![Vec::new(); compiled_problem.num_groups];
                        compiled_problem.num_sessions
                    ]
                }),
            locations: vec![vec![None; compiled_problem.num_people]; compiled_problem.num_sessions],
            current_score: FullScoreSnapshot::default(),
        };

        state.rebuild_locations_from_schedule()?;
        state.fill_remaining_assignments_deterministically()?;
        state.current_score = recompute_full_score(&state)?;

        Ok(state)
    }

    pub fn from_input(input: &ApiInput) -> Result<Self, SolverError> {
        let compiled_problem = CompiledProblem::compile(input)?;
        if let Some(initial_schedule) = &input.initial_schedule {
            let validated = validate_schedule_as_incumbent(input, initial_schedule)?;
            let num_people = compiled_problem.num_people;
            let num_sessions = compiled_problem.num_sessions;
            let mut state = Self {
                compiled_problem: Arc::new(compiled_problem),
                schedule: validated.schedule,
                locations: vec![vec![None; num_people]; num_sessions],
                current_score: FullScoreSnapshot::default(),
            };
            state.rebuild_locations_from_schedule()?;
            state.current_score = recompute_full_score(&state)?;
            return Ok(state);
        }
        Self::new(&compiled_problem)
    }

    pub fn compiled_problem(&self) -> &CompiledProblem {
        self.compiled_problem.as_ref()
    }

    pub fn to_api_schedule(&self) -> ApiInputInitialSchedule {
        let mut schedule = std::collections::HashMap::new();
        for (session_idx, groups) in self.schedule.iter().enumerate() {
            let mut group_map = std::collections::HashMap::new();
            for (group_idx, members) in groups.iter().enumerate() {
                let group_id = self.compiled_problem.group_idx_to_id[group_idx].clone();
                let people = members
                    .iter()
                    .map(|&person_idx| self.compiled_problem.person_idx_to_id[person_idx].clone())
                    .collect::<Vec<_>>();
                group_map.insert(group_id, people);
            }
            schedule.insert(format!("session_{}", session_idx), group_map);
        }
        schedule
    }

    fn rebuild_locations_from_schedule(&mut self) -> Result<(), SolverError> {
        self.locations =
            vec![vec![None; self.compiled_problem.num_people]; self.compiled_problem.num_sessions];

        for session_idx in 0..self.compiled_problem.num_sessions {
            let mut seen = vec![false; self.compiled_problem.num_people];
            for group_idx in 0..self.compiled_problem.num_groups {
                let capacity = self.compiled_problem.group_capacity(session_idx, group_idx);
                if self.schedule[session_idx][group_idx].len() > capacity {
                    return Err(SolverError::ValidationError(format!(
                        "Initial schedule overfills group {} in session {}. Capacity: {}",
                        self.compiled_problem.display_group_idx(group_idx),
                        session_idx,
                        capacity
                    )));
                }

                for (position_idx, &person_idx) in
                    self.schedule[session_idx][group_idx].iter().enumerate()
                {
                    if person_idx >= self.compiled_problem.num_people {
                        return Err(SolverError::ValidationError(format!(
                            "Initial schedule references invalid person index {} in session {}",
                            person_idx, session_idx
                        )));
                    }
                    if !self.compiled_problem.person_participation[person_idx][session_idx] {
                        return Err(SolverError::ValidationError(format!(
                            "Initial schedule assigns non-participating person {} in session {}",
                            self.compiled_problem.display_person_idx(person_idx),
                            session_idx
                        )));
                    }
                    if seen[person_idx] {
                        return Err(SolverError::ValidationError(format!(
                            "Initial schedule assigns person {} multiple times in session {}",
                            self.compiled_problem.display_person_idx(person_idx),
                            session_idx
                        )));
                    }
                    seen[person_idx] = true;
                    self.locations[session_idx][person_idx] = Some((group_idx, position_idx));
                }
            }
        }

        Ok(())
    }

    fn fill_remaining_assignments_deterministically(&mut self) -> Result<(), SolverError> {
        for session_idx in 0..self.compiled_problem.num_sessions {
            self.place_cliques_for_session(session_idx)?;
            self.place_immovable_people_for_session(session_idx)?;
            self.place_remaining_people_for_session(session_idx)?;
        }
        Ok(())
    }

    fn place_cliques_for_session(&mut self, session_idx: usize) -> Result<(), SolverError> {
        let cliques = self.compiled_problem.cliques.clone();
        for clique in &cliques {
            let applies = match &clique.sessions {
                Some(sessions) => sessions.contains(&session_idx),
                None => true,
            };
            if !applies {
                continue;
            }

            let participating_members = clique
                .members
                .iter()
                .copied()
                .filter(|&member| self.compiled_problem.person_participation[member][session_idx])
                .collect::<Vec<_>>();
            if participating_members.len() < 2 {
                continue;
            }

            let mut already_assigned_groups = participating_members
                .iter()
                .filter_map(|&member| {
                    self.locations[session_idx][member].map(|(group_idx, _)| group_idx)
                })
                .collect::<Vec<_>>();
            already_assigned_groups.sort_unstable();
            already_assigned_groups.dedup();

            let unassigned_members = participating_members
                .iter()
                .copied()
                .filter(|&member| self.locations[session_idx][member].is_none())
                .collect::<Vec<_>>();
            if unassigned_members.is_empty() {
                continue;
            }

            let target_group = if already_assigned_groups.len() == 1 {
                already_assigned_groups[0]
            } else if already_assigned_groups.len() > 1 {
                continue;
            } else {
                let mut required_group = None;
                for &member in &participating_members {
                    if let Some(&group_idx) = self
                        .compiled_problem
                        .immovable_lookup
                        .get(&(member, session_idx))
                    {
                        required_group = Some(group_idx);
                        break;
                    }
                }

                if let Some(group_idx) = required_group {
                    let free_slots = self.available_capacity(session_idx, group_idx);
                    if free_slots < unassigned_members.len() {
                        return Err(SolverError::ValidationError(format!(
                            "Could not place clique of size {} in required group {} for session {}",
                            unassigned_members.len(),
                            self.compiled_problem.display_group_idx(group_idx),
                            session_idx
                        )));
                    }
                    group_idx
                } else {
                    self.find_first_group_with_capacity(session_idx, unassigned_members.len())
                        .ok_or_else(|| {
                            SolverError::ValidationError(format!(
                                "Could not place clique of size {} in any group for session {}",
                                unassigned_members.len(),
                                session_idx
                            ))
                        })?
                }
            };

            if self.available_capacity(session_idx, target_group) < unassigned_members.len() {
                continue;
            }

            for member in unassigned_members {
                self.place_person(session_idx, target_group, member)?;
            }
        }

        Ok(())
    }

    fn place_immovable_people_for_session(
        &mut self,
        session_idx: usize,
    ) -> Result<(), SolverError> {
        let assignments = self
            .compiled_problem
            .immovable_assignments
            .iter()
            .filter(|assignment| assignment.session_idx == session_idx)
            .cloned()
            .collect::<Vec<_>>();
        for assignment in assignments {
            if !self.compiled_problem.person_participation[assignment.person_idx][session_idx] {
                continue;
            }
            if self.locations[session_idx][assignment.person_idx].is_some() {
                continue;
            }
            self.place_person(session_idx, assignment.group_idx, assignment.person_idx)?;
        }

        Ok(())
    }

    fn place_remaining_people_for_session(
        &mut self,
        session_idx: usize,
    ) -> Result<(), SolverError> {
        for person_idx in 0..self.compiled_problem.num_people {
            if !self.compiled_problem.person_participation[person_idx][session_idx] {
                continue;
            }
            if self.locations[session_idx][person_idx].is_some() {
                continue;
            }

            let group_idx = self
                .find_first_group_with_capacity(session_idx, 1)
                .ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "No remaining capacity for person {} in session {}",
                        self.compiled_problem.display_person_idx(person_idx),
                        session_idx
                    ))
                })?;
            self.place_person(session_idx, group_idx, person_idx)?;
        }

        Ok(())
    }

    fn find_first_group_with_capacity(
        &self,
        session_idx: usize,
        required_capacity: usize,
    ) -> Option<usize> {
        (0..self.compiled_problem.num_groups)
            .find(|&group_idx| self.available_capacity(session_idx, group_idx) >= required_capacity)
    }

    fn available_capacity(&self, session_idx: usize, group_idx: usize) -> usize {
        self.compiled_problem
            .group_capacity(session_idx, group_idx)
            .saturating_sub(self.schedule[session_idx][group_idx].len())
    }

    fn place_person(
        &mut self,
        session_idx: usize,
        group_idx: usize,
        person_idx: usize,
    ) -> Result<(), SolverError> {
        if self.locations[session_idx][person_idx].is_some() {
            return Err(SolverError::ValidationError(format!(
                "Person {} is already assigned in session {}",
                self.compiled_problem.display_person_idx(person_idx),
                session_idx
            )));
        }
        if !self.compiled_problem.person_participation[person_idx][session_idx] {
            return Err(SolverError::ValidationError(format!(
                "Cannot assign non-participating person {} in session {}",
                self.compiled_problem.display_person_idx(person_idx),
                session_idx
            )));
        }

        let capacity = self.compiled_problem.group_capacity(session_idx, group_idx);
        if self.schedule[session_idx][group_idx].len() >= capacity {
            return Err(SolverError::ValidationError(format!(
                "Group {} is full in session {}",
                self.compiled_problem.display_group_idx(group_idx),
                session_idx
            )));
        }

        let position_idx = self.schedule[session_idx][group_idx].len();
        self.schedule[session_idx][group_idx].push(person_idx);
        self.locations[session_idx][person_idx] = Some((group_idx, position_idx));
        Ok(())
    }
}
