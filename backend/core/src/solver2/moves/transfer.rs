use std::fmt;

use crate::solver_support::SolverError;

use super::super::affected_region::AffectedRegion;
use super::super::move_types::{CandidateMove, MovePreview};
use super::super::scoring::{recompute_full_score, FullScoreSnapshot};
use super::super::validation::invariants::validate_state_invariants;
use super::super::SolutionState;

/// Typed transfer move for `solver2`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransferMove {
    pub session_idx: usize,
    pub person_idx: usize,
    pub source_group_idx: usize,
    pub target_group_idx: usize,
}

impl TransferMove {
    pub fn new(
        session_idx: usize,
        person_idx: usize,
        source_group_idx: usize,
        target_group_idx: usize,
    ) -> Self {
        Self {
            session_idx,
            person_idx,
            source_group_idx,
            target_group_idx,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TransferFeasibility {
    Feasible,
    SameGroupNoop,
    NonParticipatingPerson {
        person_idx: usize,
    },
    MissingLocation {
        person_idx: usize,
    },
    WrongSourceGroup {
        person_idx: usize,
        actual_group_idx: usize,
    },
    SourceWouldBeEmpty {
        source_group_idx: usize,
    },
    TargetGroupFull {
        target_group_idx: usize,
        capacity: usize,
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

impl fmt::Display for TransferFeasibility {
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
            Self::WrongSourceGroup {
                person_idx,
                actual_group_idx,
            } => write!(
                f,
                "person {person_idx} is not in the requested source group; actual group is {actual_group_idx}"
            ),
            Self::SourceWouldBeEmpty { source_group_idx } => write!(
                f,
                "source group {source_group_idx} would become empty after the transfer"
            ),
            Self::TargetGroupFull {
                target_group_idx,
                capacity,
            } => write!(
                f,
                "target group {target_group_idx} is full for this session (capacity {capacity})"
            ),
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
pub struct TransferAnalysis {
    pub transfer: TransferMove,
    pub affected_region: AffectedRegion,
    pub feasibility: TransferFeasibility,
}

pub fn analyze_transfer(
    state: &SolutionState,
    transfer: &TransferMove,
) -> Result<TransferAnalysis, SolverError> {
    let problem = &state.compiled_problem;
    if transfer.session_idx >= problem.num_sessions {
        return Err(SolverError::ValidationError(format!(
            "transfer references invalid session {} (max: {})",
            transfer.session_idx,
            problem.num_sessions.saturating_sub(1)
        )));
    }
    if transfer.person_idx >= problem.num_people {
        return Err(SolverError::ValidationError(format!(
            "transfer references invalid person index {} (max: {})",
            transfer.person_idx,
            problem.num_people.saturating_sub(1)
        )));
    }
    if transfer.source_group_idx >= problem.num_groups
        || transfer.target_group_idx >= problem.num_groups
    {
        return Err(SolverError::ValidationError(format!(
            "transfer references invalid group indices ({}, {}) (max: {})",
            transfer.source_group_idx,
            transfer.target_group_idx,
            problem.num_groups.saturating_sub(1)
        )));
    }

    let location = state.locations[transfer.session_idx][transfer.person_idx];
    let touched_people = touched_people_for_transfer(state, transfer);
    let affected_region = AffectedRegion::from_groups_and_people(
        problem,
        transfer.session_idx,
        &[transfer.source_group_idx, transfer.target_group_idx],
        &touched_people,
    );

    let feasibility = if !problem.person_participation[transfer.person_idx][transfer.session_idx] {
        TransferFeasibility::NonParticipatingPerson {
            person_idx: transfer.person_idx,
        }
    } else if transfer.source_group_idx == transfer.target_group_idx {
        TransferFeasibility::SameGroupNoop
    } else if location.is_none() {
        TransferFeasibility::MissingLocation {
            person_idx: transfer.person_idx,
        }
    } else if location.map(|entry| entry.0) != Some(transfer.source_group_idx) {
        TransferFeasibility::WrongSourceGroup {
            person_idx: transfer.person_idx,
            actual_group_idx: location.expect("checked above").0,
        }
    } else if state.schedule[transfer.session_idx][transfer.source_group_idx].len() <= 1 {
        TransferFeasibility::SourceWouldBeEmpty {
            source_group_idx: transfer.source_group_idx,
        }
    } else if state.schedule[transfer.session_idx][transfer.target_group_idx].len()
        >= problem.group_capacity(transfer.session_idx, transfer.target_group_idx)
    {
        TransferFeasibility::TargetGroupFull {
            target_group_idx: transfer.target_group_idx,
            capacity: problem.group_capacity(transfer.session_idx, transfer.target_group_idx),
        }
    } else if let Some(&required_group_idx) = problem
        .immovable_lookup
        .get(&(transfer.person_idx, transfer.session_idx))
    {
        TransferFeasibility::ImmovablePerson {
            person_idx: transfer.person_idx,
            required_group_idx,
        }
    } else if let Some(clique_idx) =
        problem.person_to_clique_id[transfer.session_idx][transfer.person_idx]
    {
        TransferFeasibility::ActiveCliqueMember {
            person_idx: transfer.person_idx,
            clique_idx,
        }
    } else {
        TransferFeasibility::Feasible
    };

    Ok(TransferAnalysis {
        transfer: transfer.clone(),
        affected_region,
        feasibility,
    })
}

pub fn preview_transfer(
    state: &SolutionState,
    transfer: &TransferMove,
) -> Result<MovePreview, SolverError> {
    let analysis = analyze_transfer(state, transfer)?;
    let before_score = state.current_score.clone();
    let after_score = match analysis.feasibility {
        TransferFeasibility::Feasible => {
            let mut preview_state = state.clone();
            apply_transfer_unchecked(&mut preview_state, &analysis)?;
            recompute_full_score(&preview_state)?
        }
        TransferFeasibility::SameGroupNoop => before_score.clone(),
        ref infeasible => {
            return Err(SolverError::ValidationError(format!(
                "solver2 transfer is not feasible: {infeasible}"
            )));
        }
    };

    Ok(MovePreview {
        candidate: CandidateMove::Transfer(transfer.clone()),
        affected_region: analysis.affected_region,
        delta_cost: after_score.total_score - before_score.total_score,
        before_score,
        after_score,
    })
}

pub fn apply_transfer(
    state: &mut SolutionState,
    transfer: &TransferMove,
) -> Result<(), SolverError> {
    apply_transfer_with_score(state, transfer, None)
}

pub(crate) fn apply_transfer_with_score(
    state: &mut SolutionState,
    transfer: &TransferMove,
    score_after_apply: Option<&FullScoreSnapshot>,
) -> Result<(), SolverError> {
    let analysis = analyze_transfer(state, transfer)?;
    match analysis.feasibility {
        TransferFeasibility::Feasible => {
            apply_transfer_unchecked(state, &analysis)?;
            state.current_score = match score_after_apply {
                Some(score) => score.clone(),
                None => recompute_full_score(state)?,
            };
            debug_validate_applied_transfer(state);
            Ok(())
        }
        TransferFeasibility::SameGroupNoop => Ok(()),
        ref infeasible => Err(SolverError::ValidationError(format!(
            "solver2 transfer is not feasible: {infeasible}"
        ))),
    }
}

fn touched_people_for_transfer(state: &SolutionState, transfer: &TransferMove) -> Vec<usize> {
    let mut touched = state.schedule[transfer.session_idx][transfer.source_group_idx].clone();
    touched.extend_from_slice(&state.schedule[transfer.session_idx][transfer.target_group_idx]);
    touched.push(transfer.person_idx);
    touched.sort_unstable();
    touched.dedup();
    touched
}

fn debug_validate_applied_transfer(state: &SolutionState) {
    debug_assert!(validate_state_invariants(state).is_ok());
    #[cfg(debug_assertions)]
    {
        let recomputed_score =
            recompute_full_score(state).expect("transfer recomputation should work");
        debug_assert_eq!(recomputed_score, state.current_score);
    }
}

fn apply_transfer_unchecked(
    state: &mut SolutionState,
    analysis: &TransferAnalysis,
) -> Result<(), SolverError> {
    let transfer = &analysis.transfer;
    let session_idx = transfer.session_idx;
    let person_idx = transfer.person_idx;
    let source_group_idx = transfer.source_group_idx;
    let target_group_idx = transfer.target_group_idx;

    let Some((actual_group_idx, source_position_idx)) = state.locations[session_idx][person_idx]
    else {
        return Err(SolverError::ValidationError(format!(
            "transfer cannot apply because person {} is missing a location in session {}",
            state.compiled_problem.display_person_idx(person_idx),
            session_idx
        )));
    };
    if actual_group_idx != source_group_idx {
        return Err(SolverError::ValidationError(format!(
            "transfer cannot apply because person {} is in group {} instead of source group {}",
            state.compiled_problem.display_person_idx(person_idx),
            state.compiled_problem.display_group_idx(actual_group_idx),
            state.compiled_problem.display_group_idx(source_group_idx),
        )));
    }

    state.schedule[session_idx][source_group_idx].remove(source_position_idx);
    let target_position_idx = state.schedule[session_idx][target_group_idx].len();
    state.schedule[session_idx][target_group_idx].push(person_idx);

    rebuild_group_locations(state, session_idx, source_group_idx);
    rebuild_group_locations(state, session_idx, target_group_idx);
    state.locations[session_idx][person_idx] = Some((target_group_idx, target_position_idx));

    Ok(())
}

fn rebuild_group_locations(state: &mut SolutionState, session_idx: usize, group_idx: usize) {
    for (position_idx, &member) in state.schedule[session_idx][group_idx].iter().enumerate() {
        state.locations[session_idx][member] = Some((group_idx, position_idx));
    }
}
