use std::cmp::Ordering;

use crate::solver_support::SolverError;

use super::super::super::runtime_state::RuntimeState;

pub(crate) const MAX_EXACT_ALIGNMENT_SESSIONS: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AlignedSessionPair {
    pub(crate) base_session_idx: usize,
    pub(crate) donor_session_idx: usize,
    pub(crate) structural_distance: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SessionAlignment {
    pub(crate) matched_session_pairs: Vec<AlignedSessionPair>,
    pub(crate) total_alignment_cost: u32,
}

impl SessionAlignment {
    pub(crate) fn differing_pairs(&self) -> Vec<AlignedSessionPair> {
        self.matched_session_pairs
            .iter()
            .filter(|pair| pair.structural_distance > 0)
            .cloned()
            .collect()
    }
}

pub(crate) fn build_session_pairing_signature(
    state: &RuntimeState,
    session_idx: usize,
) -> Vec<usize> {
    let mut pair_indices = Vec::new();
    for group_idx in 0..state.compiled.num_groups {
        let members = &state.group_members[state.group_slot(session_idx, group_idx)];
        for left_idx in 0..members.len() {
            for right_idx in (left_idx + 1)..members.len() {
                pair_indices.push(
                    state
                        .compiled
                        .pair_idx(members[left_idx], members[right_idx]),
                );
            }
        }
    }
    pair_indices.sort_unstable();
    pair_indices
}

pub(crate) fn session_pairing_distance(
    base_state: &RuntimeState,
    base_session_idx: usize,
    donor_state: &RuntimeState,
    donor_session_idx: usize,
) -> Result<u32, SolverError> {
    validate_alignment_dimensions(base_state, donor_state)?;
    let base_signature = build_session_pairing_signature(base_state, base_session_idx);
    let donor_signature = build_session_pairing_signature(donor_state, donor_session_idx);
    Ok(sorted_symmetric_difference_count(
        &base_signature,
        &donor_signature,
    ))
}

pub(crate) fn align_sessions_by_pairing_distance(
    base_state: &RuntimeState,
    donor_state: &RuntimeState,
) -> Result<SessionAlignment, SolverError> {
    validate_alignment_dimensions(base_state, donor_state)?;
    let session_count = base_state.compiled.num_sessions;
    if session_count > MAX_EXACT_ALIGNMENT_SESSIONS {
        return Err(SolverError::ValidationError(format!(
            "solver3 session-aligned path relinking currently supports at most {MAX_EXACT_ALIGNMENT_SESSIONS} sessions for exact alignment"
        )));
    }

    let base_signatures = (0..session_count)
        .map(|session_idx| build_session_pairing_signature(base_state, session_idx))
        .collect::<Vec<_>>();
    let donor_signatures = (0..session_count)
        .map(|session_idx| build_session_pairing_signature(donor_state, session_idx))
        .collect::<Vec<_>>();
    let distance_matrix = build_distance_matrix(&base_signatures, &donor_signatures);
    let assignment = solve_minimum_cost_assignment(&distance_matrix)?;
    let matched_session_pairs = assignment
        .into_iter()
        .enumerate()
        .map(|(base_session_idx, donor_session_idx)| AlignedSessionPair {
            base_session_idx,
            donor_session_idx,
            structural_distance: distance_matrix[base_session_idx][donor_session_idx],
        })
        .collect::<Vec<_>>();
    let total_alignment_cost = matched_session_pairs
        .iter()
        .map(|pair| pair.structural_distance)
        .sum();

    Ok(SessionAlignment {
        matched_session_pairs,
        total_alignment_cost,
    })
}

fn validate_alignment_dimensions(
    base_state: &RuntimeState,
    donor_state: &RuntimeState,
) -> Result<(), SolverError> {
    if base_state.compiled.num_people != donor_state.compiled.num_people
        || base_state.compiled.num_groups != donor_state.compiled.num_groups
        || base_state.compiled.num_sessions != donor_state.compiled.num_sessions
    {
        return Err(SolverError::ValidationError(
            "solver3 session alignment requires matching compiled dimensions".into(),
        ));
    }
    Ok(())
}

fn build_distance_matrix(
    base_signatures: &[Vec<usize>],
    donor_signatures: &[Vec<usize>],
) -> Vec<Vec<u32>> {
    base_signatures
        .iter()
        .map(|base_signature| {
            donor_signatures
                .iter()
                .map(|donor_signature| {
                    sorted_symmetric_difference_count(base_signature, donor_signature)
                })
                .collect()
        })
        .collect()
}

pub(super) fn sorted_symmetric_difference_count(left: &[usize], right: &[usize]) -> u32 {
    let mut left_idx = 0;
    let mut right_idx = 0;
    let mut count = 0u32;

    while left_idx < left.len() && right_idx < right.len() {
        match left[left_idx].cmp(&right[right_idx]) {
            Ordering::Less => {
                count += 1;
                left_idx += 1;
            }
            Ordering::Greater => {
                count += 1;
                right_idx += 1;
            }
            Ordering::Equal => {
                left_idx += 1;
                right_idx += 1;
            }
        }
    }

    count + (left.len() - left_idx) as u32 + (right.len() - right_idx) as u32
}

fn solve_minimum_cost_assignment(distance_matrix: &[Vec<u32>]) -> Result<Vec<usize>, SolverError> {
    let size = distance_matrix.len();
    if size == 0 {
        return Ok(Vec::new());
    }
    if distance_matrix.iter().any(|row| row.len() != size) {
        return Err(SolverError::ValidationError(
            "solver3 session alignment distance matrix must be square".into(),
        ));
    }
    if size > MAX_EXACT_ALIGNMENT_SESSIONS {
        return Err(SolverError::ValidationError(format!(
            "solver3 exact session alignment currently supports at most {MAX_EXACT_ALIGNMENT_SESSIONS} sessions"
        )));
    }

    let memo_len = 1usize << size;
    let mut memo = vec![None; memo_len];
    let mut choice = vec![None; memo_len];

    fn solve(
        mask: usize,
        size: usize,
        distance_matrix: &[Vec<u32>],
        memo: &mut [Option<u32>],
        choice: &mut [Option<usize>],
    ) -> u32 {
        if let Some(cached) = memo[mask] {
            return cached;
        }
        let row = mask.count_ones() as usize;
        if row == size {
            memo[mask] = Some(0);
            return 0;
        }

        let mut best_cost = u32::MAX;
        let mut best_col = None;
        for col in 0..size {
            if mask & (1usize << col) != 0 {
                continue;
            }
            let next_mask = mask | (1usize << col);
            let tail_cost = solve(next_mask, size, distance_matrix, memo, choice);
            let cost = distance_matrix[row][col].saturating_add(tail_cost);
            if cost < best_cost {
                best_cost = cost;
                best_col = Some(col);
            }
        }

        memo[mask] = Some(best_cost);
        choice[mask] = best_col;
        best_cost
    }

    solve(0, size, distance_matrix, &mut memo, &mut choice);

    let mut assignment = Vec::with_capacity(size);
    let mut mask = 0usize;
    for _row in 0..size {
        let col = choice[mask].ok_or_else(|| {
            SolverError::ValidationError(
                "solver3 session alignment assignment reconstruction failed".into(),
            )
        })?;
        assignment.push(col);
        mask |= 1usize << col;
    }

    Ok(assignment)
}
