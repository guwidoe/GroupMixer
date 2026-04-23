use super::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct BacktrackingPattern {
    pub(super) chunks: Vec<usize>,
}

impl BacktrackingPattern {
    pub(super) fn resolve(group_size: usize, raw: Option<&str>) -> Result<Self, SolverError> {
        match raw {
            Some(raw) => Self::parse(group_size, raw),
            None => Ok(Self {
                chunks: default_backtracking_pattern(group_size),
            }),
        }
    }

    pub(super) fn parse(group_size: usize, raw: &str) -> Result<Self, SolverError> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err(SolverError::ValidationError(
                "solver4 backtracking_pattern must not be empty".into(),
            ));
        }
        let mut chunks = Vec::new();
        for token in trimmed.split('-') {
            let value: usize = token.parse().map_err(|_| {
                SolverError::ValidationError(format!(
                    "solver4 backtracking_pattern token '{token}' is not a positive integer"
                ))
            })?;
            if value == 0 {
                return Err(SolverError::ValidationError(
                    "solver4 backtracking_pattern tokens must be >= 1".into(),
                ));
            }
            chunks.push(value);
        }
        if chunks.iter().sum::<usize>() != group_size {
            return Err(SolverError::ValidationError(format!(
                "solver4 backtracking_pattern '{trimmed}' must sum to the group size {group_size}"
            )));
        }
        Ok(Self { chunks })
    }
}

impl std::fmt::Display for BacktrackingPattern {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for (idx, chunk) in self.chunks.iter().enumerate() {
            if idx > 0 {
                write!(f, "-")?;
            }
            write!(f, "{chunk}")?;
        }
        Ok(())
    }
}

pub(super) fn default_backtracking_pattern(group_size: usize) -> Vec<usize> {
    let mut chunks = vec![2; group_size / 2];
    if group_size % 2 == 1 {
        chunks.push(1);
    }
    chunks
}

#[derive(Debug, Clone)]
pub(super) struct PaperConstructionState {
    pub(super) schedule: Vec<Vec<Vec<usize>>>,
    pub(super) partnered: Vec<Vec<bool>>,
}

impl PaperConstructionState {
    pub(super) fn empty(problem: &PureSgpProblem) -> Self {
        Self {
            schedule: vec![
                vec![Vec::with_capacity(problem.group_size); problem.num_groups];
                problem.num_weeks
            ],
            partnered: vec![vec![false; problem.num_people]; problem.num_people],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ChunkCandidate {
    pub(super) members: Vec<usize>,
    pub(super) freedom: usize,
}

impl ChunkCandidate {
    fn new(members: Vec<usize>, freedom: usize) -> Self {
        Self { members, freedom }
    }
}

#[derive(Debug, Default)]
pub(super) struct CompleteBacktrackingStats {
    pub(super) nodes_visited: u64,
    pub(super) stop_reason: Option<StopReason>,
}

pub(super) fn search_complete_backtracking(
    problem: &PureSgpProblem,
    pattern: &BacktrackingPattern,
    week: usize,
    group: usize,
    token_index: usize,
    remaining: &[usize],
    state: PaperConstructionState,
    stop_conditions: &crate::models::StopConditions,
    started_at: Instant,
    stats: &mut CompleteBacktrackingStats,
) -> Option<PaperConstructionState> {
    if let Some(limit) = stop_conditions.max_iterations {
        if stats.nodes_visited >= limit {
            stats.stop_reason = Some(StopReason::MaxIterationsReached);
            return None;
        }
    }
    if let Some(limit) = stop_conditions.time_limit_seconds {
        if started_at.elapsed().as_secs() >= limit {
            stats.stop_reason = Some(StopReason::TimeLimitReached);
            return None;
        }
    }

    if week == problem.num_weeks {
        return Some(state);
    }
    if group == problem.num_groups {
        debug_assert!(remaining.is_empty());
        let next_remaining: Vec<usize> = (0..problem.num_people).collect();
        return search_complete_backtracking(
            problem,
            pattern,
            week + 1,
            0,
            0,
            &next_remaining,
            state,
            stop_conditions,
            started_at,
            stats,
        );
    }
    if token_index == pattern.chunks.len() {
        return search_complete_backtracking(
            problem,
            pattern,
            week,
            group + 1,
            0,
            remaining,
            state,
            stop_conditions,
            started_at,
            stats,
        );
    }

    let current_group = &state.schedule[week][group];
    let chunk_size = pattern.chunks[token_index];
    let candidates =
        ordered_chunk_candidates(remaining, current_group, chunk_size, &state.partnered);

    for candidate in candidates {
        stats.nodes_visited += 1;

        let mut next_state = state.clone();
        append_group_chunk(
            &mut next_state.schedule[week][group],
            &candidate.members,
            &mut next_state.partnered,
        );
        let next_remaining = remove_chunk(remaining, &candidate.members);

        if let Some(solution) = search_complete_backtracking(
            problem,
            pattern,
            week,
            group,
            token_index + 1,
            &next_remaining,
            next_state,
            stop_conditions,
            started_at,
            stats,
        ) {
            return Some(solution);
        }

        if stats.stop_reason.is_some() {
            return None;
        }
    }

    None
}

pub(super) fn ordered_chunk_candidates(
    remaining: &[usize],
    current_group: &[usize],
    chunk_size: usize,
    partnered: &[Vec<bool>],
) -> Vec<ChunkCandidate> {
    if chunk_size == 1 {
        let mut singles: Vec<_> = remaining
            .iter()
            .copied()
            .filter(|candidate| compatible_with_group(*candidate, current_group, partnered))
            .map(|candidate| ChunkCandidate::new(vec![candidate], 0))
            .collect();
        singles.sort_by(|left, right| left.members.cmp(&right.members));
        return singles;
    }

    let mut collected = Vec::new();
    let mut scratch = Vec::with_capacity(chunk_size);
    enumerate_chunk_candidates(
        remaining,
        current_group,
        chunk_size,
        0,
        partnered,
        &mut scratch,
        &mut collected,
    );
    collected.sort_by(|left, right| {
        left.freedom
            .cmp(&right.freedom)
            .then(left.members.cmp(&right.members))
    });
    collected
}

fn enumerate_chunk_candidates(
    remaining: &[usize],
    current_group: &[usize],
    chunk_size: usize,
    start: usize,
    partnered: &[Vec<bool>],
    scratch: &mut Vec<usize>,
    out: &mut Vec<ChunkCandidate>,
) {
    if scratch.len() == chunk_size {
        if chunk_is_compatible(current_group, scratch, partnered) {
            out.push(ChunkCandidate::new(
                scratch.clone(),
                freedom_of_set(scratch, partnered),
            ));
        }
        return;
    }

    for idx in start..remaining.len() {
        scratch.push(remaining[idx]);
        enumerate_chunk_candidates(
            remaining,
            current_group,
            chunk_size,
            idx + 1,
            partnered,
            scratch,
            out,
        );
        scratch.pop();
    }
}

fn chunk_is_compatible(current_group: &[usize], chunk: &[usize], partnered: &[Vec<bool>]) -> bool {
    for &member in chunk {
        if !compatible_with_group(member, current_group, partnered) {
            return false;
        }
    }
    for left_idx in 0..chunk.len() {
        for right_idx in (left_idx + 1)..chunk.len() {
            if partnered[chunk[left_idx]][chunk[right_idx]] {
                return false;
            }
        }
    }
    true
}

fn compatible_with_group(person: usize, group: &[usize], partnered: &[Vec<bool>]) -> bool {
    group.iter().all(|member| !partnered[person][*member])
}

fn append_group_chunk(group: &mut Vec<usize>, chunk: &[usize], partnered: &mut [Vec<bool>]) {
    let existing_len = group.len();
    group.extend_from_slice(chunk);
    for left_idx in 0..group.len() {
        let start = if left_idx < existing_len {
            existing_len
        } else {
            left_idx + 1
        };
        for right_idx in start..group.len() {
            let left = group[left_idx];
            let right = group[right_idx];
            partnered[left][right] = true;
            partnered[right][left] = true;
        }
    }
}

fn remove_chunk(remaining: &[usize], chunk: &[usize]) -> Vec<usize> {
    remaining
        .iter()
        .copied()
        .filter(|candidate| !chunk.contains(candidate))
        .collect()
}

pub(super) fn potential_partner_set(person: usize, partnered: &[Vec<bool>]) -> Vec<bool> {
    (0..partnered.len())
        .map(|candidate| candidate != person && !partnered[person][candidate])
        .collect()
}

pub(super) fn freedom_of_set(set: &[usize], partnered: &[Vec<bool>]) -> usize {
    if set.is_empty() {
        return 0;
    }

    let num_people = partnered.len();
    let mut intersection = vec![true; num_people];
    for &person in set {
        let potential = potential_partner_set(person, partnered);
        for candidate in 0..num_people {
            intersection[candidate] &= potential[candidate];
        }
    }
    for &person in set {
        intersection[person] = false;
    }
    intersection.into_iter().filter(|allowed| *allowed).count()
}
