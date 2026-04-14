use crate::models::{BenchmarkObserver, ProgressCallback, SolverResult};
use crate::solver_support::SolverError;

use super::super::runtime_state::RuntimeState;
use super::context::SearchRunContext;

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
                pair_indices.push(state.compiled.pair_idx(members[left_idx], members[right_idx]));
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

pub(crate) fn run(
    _state: &mut RuntimeState,
    _run_context: SearchRunContext,
    _progress_callback: Option<&ProgressCallback>,
    _benchmark_observer: Option<&BenchmarkObserver>,
) -> Result<SolverResult, SolverError> {
    Err(SolverError::ValidationError(
        "solver3 search_driver.mode=session_aligned_path_relinking is not yet implemented"
            .into(),
    ))
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

fn build_distance_matrix(base_signatures: &[Vec<usize>], donor_signatures: &[Vec<usize>]) -> Vec<Vec<u32>> {
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

fn sorted_symmetric_difference_count(left: &[usize], right: &[usize]) -> u32 {
    let mut left_idx = 0;
    let mut right_idx = 0;
    let mut count = 0u32;

    while left_idx < left.len() && right_idx < right.len() {
        match left[left_idx].cmp(&right[right_idx]) {
            std::cmp::Ordering::Less => {
                count += 1;
                left_idx += 1;
            }
            std::cmp::Ordering::Greater => {
                count += 1;
                right_idx += 1;
            }
            std::cmp::Ordering::Equal => {
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

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::default_solver_configuration_for;
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition,
        RepeatEncounterParams, SolverKind,
    };
    use crate::solver3::runtime_state::RuntimeState;

    use super::{
        align_sessions_by_pairing_distance, build_session_pairing_signature,
        session_pairing_distance, sorted_symmetric_difference_count, AlignedSessionPair,
        MAX_EXACT_ALIGNMENT_SESSIONS,
    };

    fn person(id: &str) -> Person {
        Person {
            id: id.to_string(),
            attributes: HashMap::new(),
            sessions: None,
        }
    }

    fn schedule(
        groups: &[&str],
        sessions: Vec<Vec<Vec<&str>>>,
    ) -> HashMap<String, HashMap<String, Vec<String>>> {
        let mut schedule = HashMap::new();
        for (session_idx, session_groups) in sessions.into_iter().enumerate() {
            let mut session = HashMap::new();
            for (group_idx, members) in session_groups.into_iter().enumerate() {
                session.insert(
                    groups[group_idx].to_string(),
                    members.into_iter().map(|member| member.to_string()).collect(),
                );
            }
            schedule.insert(format!("session_{session_idx}"), session);
        }
        schedule
    }

    fn state_from_schedule(sessions: Vec<Vec<Vec<&str>>>) -> RuntimeState {
        let input = ApiInput {
            problem: ProblemDefinition {
                people: vec![person("p0"), person("p1"), person("p2"), person("p3")],
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
                num_sessions: sessions.len() as u32,
            },
            initial_schedule: Some(schedule(&["g0", "g1"], sessions)),
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
            solver: default_solver_configuration_for(SolverKind::Solver3),
        };
        RuntimeState::from_input(&input).expect("schedule should build runtime state")
    }

    #[test]
    fn session_pairing_signature_is_invariant_to_group_order() {
        let left = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let right = state_from_schedule(vec![
            vec![vec!["p2", "p3"], vec!["p0", "p1"]],
            vec![vec!["p1", "p3"], vec!["p0", "p2"]],
        ]);

        assert_eq!(
            build_session_pairing_signature(&left, 0),
            build_session_pairing_signature(&right, 0)
        );
        assert_eq!(
            build_session_pairing_signature(&left, 1),
            build_session_pairing_signature(&right, 1)
        );
    }

    #[test]
    fn identical_sessions_have_zero_pairing_distance() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);

        assert_eq!(session_pairing_distance(&base, 0, &donor, 0).unwrap(), 0);
        assert_eq!(session_pairing_distance(&base, 1, &donor, 1).unwrap(), 0);
    }

    #[test]
    fn session_alignment_finds_the_minimum_cost_matching() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);

        let alignment = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        assert_eq!(alignment.total_alignment_cost, 0);
        assert_eq!(
            alignment.matched_session_pairs,
            vec![
                AlignedSessionPair {
                    base_session_idx: 0,
                    donor_session_idx: 1,
                    structural_distance: 0,
                },
                AlignedSessionPair {
                    base_session_idx: 1,
                    donor_session_idx: 2,
                    structural_distance: 0,
                },
                AlignedSessionPair {
                    base_session_idx: 2,
                    donor_session_idx: 0,
                    structural_distance: 0,
                },
            ]
        );
    }

    #[test]
    fn differing_session_pairs_can_be_ranked_by_structural_distance() {
        let base = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
        ]);
        let donor = state_from_schedule(vec![
            vec![vec!["p0", "p1"], vec!["p2", "p3"]],
            vec![vec!["p0", "p2"], vec!["p1", "p3"]],
            vec![vec!["p0", "p3"], vec!["p1", "p2"]],
        ]);

        let alignment = align_sessions_by_pairing_distance(&base, &donor).unwrap();
        let mut differing = alignment.differing_pairs();
        differing.sort_by(|left, right| {
            right
                .structural_distance
                .cmp(&left.structural_distance)
                .then_with(|| left.base_session_idx.cmp(&right.base_session_idx))
        });

        assert!(!differing.is_empty());
        assert!(differing.iter().all(|pair| pair.structural_distance > 0));
        for window in differing.windows(2) {
            assert!(window[0].structural_distance >= window[1].structural_distance);
        }
    }

    #[test]
    fn sorted_symmetric_difference_counts_only_disagreement() {
        assert_eq!(sorted_symmetric_difference_count(&[1, 2, 3], &[1, 2, 3]), 0);
        assert_eq!(sorted_symmetric_difference_count(&[1, 2, 3], &[1, 4, 5]), 4);
    }

    #[test]
    fn exact_alignment_session_limit_stays_small_and_explicit() {
        assert!(MAX_EXACT_ALIGNMENT_SESSIONS >= 3);
    }
}
