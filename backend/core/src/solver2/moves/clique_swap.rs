use std::collections::HashSet;
use std::fmt;

use crate::solver_support::SolverError;

use super::super::affected_region::AffectedRegion;
use super::super::move_types::{CandidateMove, MovePreview};
use super::super::scoring::recompute_full_score;
use super::super::validation::invariants::validate_state_invariants;
use super::super::SolutionState;

/// Typed clique-swap move for `solver2`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliqueSwapMove {
    pub session_idx: usize,
    pub clique_idx: usize,
    pub source_group_idx: usize,
    pub target_group_idx: usize,
    pub target_person_indices: Vec<usize>,
}

impl CliqueSwapMove {
    pub fn new(
        session_idx: usize,
        clique_idx: usize,
        source_group_idx: usize,
        target_group_idx: usize,
        target_person_indices: Vec<usize>,
    ) -> Self {
        Self {
            session_idx,
            clique_idx,
            source_group_idx,
            target_group_idx,
            target_person_indices,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CliqueSwapFeasibility {
    Feasible,
    SameGroupNoop,
    InactiveClique {
        clique_idx: usize,
    },
    CliqueNotInSourceGroup {
        clique_idx: usize,
        source_group_idx: usize,
    },
    ActiveCliqueMemberImmovable {
        person_idx: usize,
        required_group_idx: usize,
    },
    TargetCountMismatch {
        expected: usize,
        actual: usize,
    },
    DuplicateTargetPerson {
        person_idx: usize,
    },
    TargetPersonIsCliqueMember {
        person_idx: usize,
    },
    TargetPersonNotParticipating {
        person_idx: usize,
    },
    TargetPersonWrongGroup {
        person_idx: usize,
        expected_group_idx: usize,
    },
    TargetPersonMissingLocation {
        person_idx: usize,
    },
    TargetPersonInAnotherClique {
        person_idx: usize,
        clique_idx: usize,
    },
    TargetPersonImmovable {
        person_idx: usize,
        required_group_idx: usize,
    },
}

impl fmt::Display for CliqueSwapFeasibility {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Feasible => f.write_str("feasible"),
            Self::SameGroupNoop => f.write_str("same-group no-op"),
            Self::InactiveClique { clique_idx } => {
                write!(f, "clique {clique_idx} is not active in this session")
            }
            Self::CliqueNotInSourceGroup {
                clique_idx,
                source_group_idx,
            } => write!(
                f,
                "clique {clique_idx} is not fully active in source group {source_group_idx}"
            ),
            Self::ActiveCliqueMemberImmovable {
                person_idx,
                required_group_idx,
            } => write!(
                f,
                "clique member {person_idx} is immovable and must stay in group {required_group_idx}"
            ),
            Self::TargetCountMismatch { expected, actual } => write!(
                f,
                "clique swap requires {expected} target people but received {actual}"
            ),
            Self::DuplicateTargetPerson { person_idx } => {
                write!(f, "target person {person_idx} is listed multiple times")
            }
            Self::TargetPersonIsCliqueMember { person_idx } => write!(
                f,
                "target person {person_idx} is already part of the source clique"
            ),
            Self::TargetPersonNotParticipating { person_idx } => write!(
                f,
                "target person {person_idx} is not participating in this session"
            ),
            Self::TargetPersonWrongGroup {
                person_idx,
                expected_group_idx,
            } => write!(
                f,
                "target person {person_idx} is not in target group {expected_group_idx}"
            ),
            Self::TargetPersonMissingLocation { person_idx } => write!(
                f,
                "target person {person_idx} is missing a location in this session"
            ),
            Self::TargetPersonInAnotherClique {
                person_idx,
                clique_idx,
            } => write!(
                f,
                "target person {person_idx} is part of active clique {clique_idx} in this session"
            ),
            Self::TargetPersonImmovable {
                person_idx,
                required_group_idx,
            } => write!(
                f,
                "target person {person_idx} is immovable and must stay in group {required_group_idx}"
            ),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliqueSwapAnalysis {
    pub clique_swap: CliqueSwapMove,
    pub affected_region: AffectedRegion,
    pub feasibility: CliqueSwapFeasibility,
    pub active_members: Vec<usize>,
    pub ordered_target_people: Vec<usize>,
}

pub fn analyze_clique_swap(
    state: &SolutionState,
    clique_swap: &CliqueSwapMove,
) -> Result<CliqueSwapAnalysis, SolverError> {
    let problem = &state.compiled_problem;
    if clique_swap.session_idx >= problem.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "clique swap references invalid session {} (max: {})",
            clique_swap.session_idx,
            problem.num_sessions.saturating_sub(1)
        )));
    }
    if clique_swap.clique_idx >= problem.cliques.len() {
        return Err(SolverError::ValidationError(format!(
            "clique swap references invalid clique {} (max: {})",
            clique_swap.clique_idx,
            problem.cliques.len().saturating_sub(1)
        )));
    }
    if clique_swap.source_group_idx >= problem.num_groups
        || clique_swap.target_group_idx >= problem.num_groups
    {
        return Err(SolverError::ValidationError(format!(
            "clique swap references invalid group indices ({}, {}) (max: {})",
            clique_swap.source_group_idx,
            clique_swap.target_group_idx,
            problem.num_groups.saturating_sub(1)
        )));
    }
    for &person_idx in &clique_swap.target_person_indices {
        if person_idx >= problem.num_people {
            return Err(SolverError::ValidationError(format!(
                "clique swap references invalid target person index {} (max: {})",
                person_idx,
                problem.num_people.saturating_sub(1)
            )));
        }
    }

    let active_members = active_clique_members_in_source_group(state, clique_swap);
    let ordered_target_people = ordered_target_people_in_group(state, clique_swap);
    let touched_people = touched_people_for_clique_swap(state, clique_swap, &active_members);
    let affected_region = AffectedRegion::from_groups_and_people(
        problem,
        clique_swap.session_idx,
        &[clique_swap.source_group_idx, clique_swap.target_group_idx],
        &touched_people,
    );

    let feasibility = if clique_swap.source_group_idx == clique_swap.target_group_idx {
        CliqueSwapFeasibility::SameGroupNoop
    } else if !clique_is_active_in_session(problem, clique_swap.clique_idx, clique_swap.session_idx)
    {
        CliqueSwapFeasibility::InactiveClique {
            clique_idx: clique_swap.clique_idx,
        }
    } else if active_members.len() != participating_clique_members(problem, clique_swap).len()
        || active_members.is_empty()
    {
        CliqueSwapFeasibility::CliqueNotInSourceGroup {
            clique_idx: clique_swap.clique_idx,
            source_group_idx: clique_swap.source_group_idx,
        }
    } else if let Some((person_idx, required_group_idx)) =
        active_members.iter().find_map(|&member| {
            problem
                .immovable_lookup
                .get(&(member, clique_swap.session_idx))
                .map(|&group_idx| (member, group_idx))
        })
    {
        if required_group_idx != clique_swap.target_group_idx {
            CliqueSwapFeasibility::ActiveCliqueMemberImmovable {
                person_idx,
                required_group_idx,
            }
        } else {
            CliqueSwapFeasibility::Feasible
        }
    } else if active_members.len() != clique_swap.target_person_indices.len() {
        CliqueSwapFeasibility::TargetCountMismatch {
            expected: active_members.len(),
            actual: clique_swap.target_person_indices.len(),
        }
    } else {
        validate_target_people(state, clique_swap, &active_members)
    };

    Ok(CliqueSwapAnalysis {
        clique_swap: clique_swap.clone(),
        affected_region,
        feasibility,
        active_members,
        ordered_target_people,
    })
}

pub fn preview_clique_swap(
    state: &SolutionState,
    clique_swap: &CliqueSwapMove,
) -> Result<MovePreview, SolverError> {
    let analysis = analyze_clique_swap(state, clique_swap)?;
    let before_score = state.current_score.clone();
    let after_score = match analysis.feasibility {
        CliqueSwapFeasibility::Feasible => {
            let mut preview_state = state.clone();
            apply_clique_swap_unchecked(&mut preview_state, &analysis)?;
            recompute_full_score(&preview_state)?
        }
        CliqueSwapFeasibility::SameGroupNoop => before_score.clone(),
        ref infeasible => {
            return Err(SolverError::ValidationError(format!(
                "solver2 clique swap is not feasible: {infeasible}"
            )));
        }
    };

    Ok(MovePreview {
        candidate: CandidateMove::CliqueSwap(clique_swap.clone()),
        affected_region: analysis.affected_region,
        delta_cost: after_score.total_score - before_score.total_score,
        before_score,
        after_score,
    })
}

pub fn apply_clique_swap(
    state: &mut SolutionState,
    clique_swap: &CliqueSwapMove,
) -> Result<(), SolverError> {
    let analysis = analyze_clique_swap(state, clique_swap)?;
    match analysis.feasibility {
        CliqueSwapFeasibility::Feasible => {
            apply_clique_swap_unchecked(state, &analysis)?;
            state.current_score = recompute_full_score(state)?;
            debug_assert!(validate_state_invariants(state).is_ok());
            Ok(())
        }
        CliqueSwapFeasibility::SameGroupNoop => Ok(()),
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver2 clique swap is not feasible: {infeasible}"
        ))),
    }
}

fn clique_is_active_in_session(
    problem: &super::super::compiled_problem::CompiledProblem,
    clique_idx: usize,
    session_idx: usize,
) -> bool {
    match &problem.cliques[clique_idx].sessions {
        Some(sessions) => sessions.contains(&session_idx),
        None => true,
    }
}

fn participating_clique_members(
    problem: &super::super::compiled_problem::CompiledProblem,
    clique_swap: &CliqueSwapMove,
) -> Vec<usize> {
    problem.cliques[clique_swap.clique_idx]
        .members
        .iter()
        .copied()
        .filter(|&member| problem.person_participation[member][clique_swap.session_idx])
        .collect()
}

fn active_clique_members_in_source_group(
    state: &SolutionState,
    clique_swap: &CliqueSwapMove,
) -> Vec<usize> {
    state.schedule[clique_swap.session_idx][clique_swap.source_group_idx]
        .iter()
        .copied()
        .filter(|&person_idx| {
            state.compiled_problem.person_to_clique_id[clique_swap.session_idx][person_idx]
                == Some(clique_swap.clique_idx)
        })
        .collect()
}

fn ordered_target_people_in_group(
    state: &SolutionState,
    clique_swap: &CliqueSwapMove,
) -> Vec<usize> {
    let selected = clique_swap
        .target_person_indices
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    state.schedule[clique_swap.session_idx][clique_swap.target_group_idx]
        .iter()
        .copied()
        .filter(|person_idx| selected.contains(person_idx))
        .collect()
}

fn validate_target_people(
    state: &SolutionState,
    clique_swap: &CliqueSwapMove,
    active_members: &[usize],
) -> CliqueSwapFeasibility {
    let problem = &state.compiled_problem;
    let mut seen = HashSet::new();
    for &person_idx in &clique_swap.target_person_indices {
        if !seen.insert(person_idx) {
            return CliqueSwapFeasibility::DuplicateTargetPerson { person_idx };
        }
        if active_members.contains(&person_idx) {
            return CliqueSwapFeasibility::TargetPersonIsCliqueMember { person_idx };
        }
        if !problem.person_participation[person_idx][clique_swap.session_idx] {
            return CliqueSwapFeasibility::TargetPersonNotParticipating { person_idx };
        }
        let Some((actual_group_idx, _)) = state.locations[clique_swap.session_idx][person_idx]
        else {
            return CliqueSwapFeasibility::TargetPersonMissingLocation { person_idx };
        };
        if actual_group_idx != clique_swap.target_group_idx {
            return CliqueSwapFeasibility::TargetPersonWrongGroup {
                person_idx,
                expected_group_idx: clique_swap.target_group_idx,
            };
        }
        if let Some(clique_idx) = problem.person_to_clique_id[clique_swap.session_idx][person_idx] {
            return CliqueSwapFeasibility::TargetPersonInAnotherClique {
                person_idx,
                clique_idx,
            };
        }
        if let Some(&required_group_idx) = problem
            .immovable_lookup
            .get(&(person_idx, clique_swap.session_idx))
        {
            if required_group_idx != clique_swap.source_group_idx {
                return CliqueSwapFeasibility::TargetPersonImmovable {
                    person_idx,
                    required_group_idx,
                };
            }
        }
    }

    CliqueSwapFeasibility::Feasible
}

fn touched_people_for_clique_swap(
    state: &SolutionState,
    clique_swap: &CliqueSwapMove,
    active_members: &[usize],
) -> Vec<usize> {
    let mut touched = state.schedule[clique_swap.session_idx][clique_swap.source_group_idx].clone();
    touched
        .extend_from_slice(&state.schedule[clique_swap.session_idx][clique_swap.target_group_idx]);
    touched.extend_from_slice(active_members);
    touched.extend_from_slice(&clique_swap.target_person_indices);
    touched.sort_unstable();
    touched.dedup();
    touched
}

fn apply_clique_swap_unchecked(
    state: &mut SolutionState,
    analysis: &CliqueSwapAnalysis,
) -> Result<(), SolverError> {
    let clique_swap = &analysis.clique_swap;
    let session_idx = clique_swap.session_idx;
    let source_group_idx = clique_swap.source_group_idx;
    let target_group_idx = clique_swap.target_group_idx;

    let source_group = state.schedule[session_idx][source_group_idx].clone();
    let target_group = state.schedule[session_idx][target_group_idx].clone();
    let source_member_set = analysis
        .active_members
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let target_member_set = analysis
        .ordered_target_people
        .iter()
        .copied()
        .collect::<HashSet<_>>();

    let mut new_source_group = source_group
        .iter()
        .copied()
        .filter(|person_idx| !source_member_set.contains(person_idx))
        .collect::<Vec<_>>();
    new_source_group.extend_from_slice(&analysis.ordered_target_people);

    let mut new_target_group = target_group
        .iter()
        .copied()
        .filter(|person_idx| !target_member_set.contains(person_idx))
        .collect::<Vec<_>>();
    new_target_group.extend_from_slice(&analysis.active_members);

    if new_source_group.len()
        > state
            .compiled_problem
            .group_capacity(session_idx, source_group_idx)
        || new_target_group.len()
            > state
                .compiled_problem
                .group_capacity(session_idx, target_group_idx)
    {
        return Err(SolverError::ValidationError(format!(
            "clique swap would exceed group capacity in session {}",
            session_idx
        )));
    }

    state.schedule[session_idx][source_group_idx] = new_source_group;
    state.schedule[session_idx][target_group_idx] = new_target_group;

    rebuild_group_locations(state, session_idx, source_group_idx);
    rebuild_group_locations(state, session_idx, target_group_idx);

    Ok(())
}

fn rebuild_group_locations(state: &mut SolutionState, session_idx: usize, group_idx: usize) {
    for (position_idx, &member) in state.schedule[session_idx][group_idx].iter().enumerate() {
        state.locations[session_idx][member] = Some((group_idx, position_idx));
    }
}
