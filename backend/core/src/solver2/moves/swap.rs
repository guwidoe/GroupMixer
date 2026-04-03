use std::fmt;

use crate::solver_support::SolverError;

use super::super::affected_region::AffectedRegion;
use super::super::move_types::{CandidateMove, MovePreview};
use super::super::scoring::recompute_full_score;
use super::super::validation::invariants::validate_state_invariants;
use super::super::SolutionState;

/// Typed swap move for `solver2`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SwapMove {
    pub session_idx: usize,
    pub left_person_idx: usize,
    pub right_person_idx: usize,
}

impl SwapMove {
    pub fn new(session_idx: usize, left_person_idx: usize, right_person_idx: usize) -> Self {
        Self {
            session_idx,
            left_person_idx,
            right_person_idx,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SwapFeasibility {
    Feasible,
    SameGroupNoop,
    NonParticipatingPerson {
        person_idx: usize,
    },
    MissingLocation {
        person_idx: usize,
    },
    ImmovablePerson {
        person_idx: usize,
        required_group_idx: usize,
    },
    ActiveCliqueMember {
        person_idx: usize,
        clique_idx: usize,
    },
}

impl fmt::Display for SwapFeasibility {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Feasible => f.write_str("feasible"),
            Self::SameGroupNoop => f.write_str("same-group no-op"),
            Self::NonParticipatingPerson { person_idx } => {
                write!(
                    f,
                    "person {person_idx} is not participating in this session"
                )
            }
            Self::MissingLocation { person_idx } => {
                write!(
                    f,
                    "person {person_idx} is missing a location in this session"
                )
            }
            Self::ImmovablePerson {
                person_idx,
                required_group_idx,
            } => write!(
                f,
                "person {person_idx} is immovable and must stay in group {required_group_idx}"
            ),
            Self::ActiveCliqueMember {
                person_idx,
                clique_idx,
            } => write!(
                f,
                "person {person_idx} is part of active clique {clique_idx} in this session"
            ),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SwapAnalysis {
    pub swap: SwapMove,
    pub affected_region: AffectedRegion,
    pub feasibility: SwapFeasibility,
    pub left_group_idx: usize,
    pub right_group_idx: usize,
}

pub fn analyze_swap(state: &SolutionState, swap: &SwapMove) -> Result<SwapAnalysis, SolverError> {
    let problem = &state.compiled_problem;
    if swap.session_idx >= problem.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "swap references invalid session {} (max: {})",
            swap.session_idx,
            problem.num_sessions.saturating_sub(1)
        )));
    }
    if swap.left_person_idx >= problem.num_people || swap.right_person_idx >= problem.num_people {
        return Err(SolverError::ValidationError(format!(
            "swap references invalid person indices ({}, {}) (max: {})",
            swap.left_person_idx,
            swap.right_person_idx,
            problem.num_people.saturating_sub(1)
        )));
    }

    let left_location = state.locations[swap.session_idx][swap.left_person_idx];
    let right_location = state.locations[swap.session_idx][swap.right_person_idx];
    let left_group_idx = left_location.map(|location| location.0).unwrap_or(0);
    let right_group_idx = right_location.map(|location| location.0).unwrap_or(0);

    let feasibility = if !problem.person_participation[swap.left_person_idx][swap.session_idx] {
        SwapFeasibility::NonParticipatingPerson {
            person_idx: swap.left_person_idx,
        }
    } else if !problem.person_participation[swap.right_person_idx][swap.session_idx] {
        SwapFeasibility::NonParticipatingPerson {
            person_idx: swap.right_person_idx,
        }
    } else if left_location.is_none() {
        SwapFeasibility::MissingLocation {
            person_idx: swap.left_person_idx,
        }
    } else if right_location.is_none() {
        SwapFeasibility::MissingLocation {
            person_idx: swap.right_person_idx,
        }
    } else if left_group_idx == right_group_idx {
        SwapFeasibility::SameGroupNoop
    } else if let Some(&required_group_idx) = problem
        .immovable_lookup
        .get(&(swap.left_person_idx, swap.session_idx))
    {
        SwapFeasibility::ImmovablePerson {
            person_idx: swap.left_person_idx,
            required_group_idx,
        }
    } else if let Some(&required_group_idx) = problem
        .immovable_lookup
        .get(&(swap.right_person_idx, swap.session_idx))
    {
        SwapFeasibility::ImmovablePerson {
            person_idx: swap.right_person_idx,
            required_group_idx,
        }
    } else if let Some(clique_idx) =
        problem.person_to_clique_id[swap.session_idx][swap.left_person_idx]
    {
        SwapFeasibility::ActiveCliqueMember {
            person_idx: swap.left_person_idx,
            clique_idx,
        }
    } else if let Some(clique_idx) =
        problem.person_to_clique_id[swap.session_idx][swap.right_person_idx]
    {
        SwapFeasibility::ActiveCliqueMember {
            person_idx: swap.right_person_idx,
            clique_idx,
        }
    } else {
        SwapFeasibility::Feasible
    };

    Ok(SwapAnalysis {
        swap: swap.clone(),
        affected_region: build_affected_region(state, swap, left_group_idx, right_group_idx),
        feasibility,
        left_group_idx,
        right_group_idx,
    })
}

pub fn preview_swap(state: &SolutionState, swap: &SwapMove) -> Result<MovePreview, SolverError> {
    let analysis = analyze_swap(state, swap)?;
    let before_score = state.current_score.clone();

    let after_score = match analysis.feasibility {
        SwapFeasibility::Feasible => {
            let mut preview_state = state.clone();
            apply_swap_unchecked(&mut preview_state, &analysis)?;
            recompute_full_score(&preview_state)?
        }
        SwapFeasibility::SameGroupNoop => before_score.clone(),
        ref infeasible => {
            return Err(SolverError::ValidationError(format!(
                "solver2 swap is not feasible: {infeasible}"
            )));
        }
    };

    Ok(MovePreview {
        candidate: CandidateMove::Swap(swap.clone()),
        affected_region: analysis.affected_region,
        delta_cost: after_score.total_score - before_score.total_score,
        before_score,
        after_score,
    })
}

pub fn apply_swap(state: &mut SolutionState, swap: &SwapMove) -> Result<(), SolverError> {
    let analysis = analyze_swap(state, swap)?;
    match analysis.feasibility {
        SwapFeasibility::Feasible => {
            apply_swap_unchecked(state, &analysis)?;
            state.current_score = recompute_full_score(state)?;
            debug_assert!(validate_state_invariants(state).is_ok());
            Ok(())
        }
        SwapFeasibility::SameGroupNoop => Ok(()),
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver2 swap is not feasible: {infeasible}"
        ))),
    }
}

fn build_affected_region(
    state: &SolutionState,
    swap: &SwapMove,
    left_group_idx: usize,
    right_group_idx: usize,
) -> AffectedRegion {
    AffectedRegion::from_groups_and_people(
        &state.compiled_problem,
        swap.session_idx,
        &[left_group_idx, right_group_idx],
        &[swap.left_person_idx, swap.right_person_idx],
    )
}

fn apply_swap_unchecked(
    state: &mut SolutionState,
    analysis: &SwapAnalysis,
) -> Result<(), SolverError> {
    let session_idx = analysis.swap.session_idx;
    let left_person_idx = analysis.swap.left_person_idx;
    let right_person_idx = analysis.swap.right_person_idx;

    let Some((left_group_idx, left_position_idx)) = state.locations[session_idx][left_person_idx]
    else {
        return Err(SolverError::ValidationError(format!(
            "swap cannot apply because person {} is missing a location in session {}",
            state.compiled_problem.display_person_idx(left_person_idx),
            session_idx
        )));
    };
    let Some((right_group_idx, right_position_idx)) =
        state.locations[session_idx][right_person_idx]
    else {
        return Err(SolverError::ValidationError(format!(
            "swap cannot apply because person {} is missing a location in session {}",
            state.compiled_problem.display_person_idx(right_person_idx),
            session_idx
        )));
    };

    state.schedule[session_idx][left_group_idx][left_position_idx] = right_person_idx;
    state.schedule[session_idx][right_group_idx][right_position_idx] = left_person_idx;
    state.locations[session_idx][left_person_idx] = Some((right_group_idx, right_position_idx));
    state.locations[session_idx][right_person_idx] = Some((left_group_idx, left_position_idx));

    Ok(())
}
