//! Full-recomputation oracle scoring for `solver3`.
//!
//! This module is correctness-first. It recomputes every score component from
//! scratch by iterating `RuntimeState.group_members` without consulting the
//! incremental aggregates. The result is used to:
//!
//! 1. Set the initial score aggregates in `RuntimeState`.
//! 2. Cross-check incremental aggregates during drift validation.
//!
//! The scoring formula matches the canonical local-search semantics exactly so cross-solver
//! comparisons are well-defined:
//!
//! ```text
//! total = weighted_repetition_penalty
//!       + attribute_balance_penalty
//!       + constraint_penalty_weighted
//!       - unique_contacts * maximize_unique_contacts_weight
//!       + baseline_score
//! ```

use crate::models::{AttributeBalanceMode, PairMeetingMode};
use crate::solver_support::SolverError;

use super::super::compiled_problem::CompiledProblem;
use super::super::runtime_state::RuntimeState;

// ---------------------------------------------------------------------------
// Oracle output
// ---------------------------------------------------------------------------

/// Complete oracle score snapshot recomputed from scratch.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct OracleSnapshot {
    pub total_score: f64,
    pub baseline_score: f64,
    pub unique_contacts: u32,
    pub repetition_penalty_raw: i32,
    pub weighted_repetition_penalty: f64,
    pub attribute_balance_penalty: f64,
    pub constraint_penalty_raw: i32,
    pub constraint_penalty_weighted: f64,

    // Detailed violation vectors (for diagnostics and drift tracing).
    pub clique_violations: Vec<i32>,
    pub soft_apart_violations: Vec<i32>,
    pub should_together_violations: Vec<i32>,
    pub immovable_violations: i32,
    pub pair_meeting_counts: Vec<u32>,

    /// Freshly-computed pair contact counts: `[pair_idx] -> total sessions together`.
    /// Independent from `RuntimeState.pair_contacts` — used for cross-checking.
    pub pair_contacts_fresh: Vec<u16>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/// Recomputes the full oracle score from `state` without consulting any
/// incremental aggregates stored in the state.
pub fn recompute_oracle_score(state: &RuntimeState) -> Result<OracleSnapshot, SolverError> {
    let cp = &state.compiled;
    validate_shape(cp, state)?;

    let mut snap = OracleSnapshot {
        baseline_score: cp.baseline_score,
        clique_violations: vec![0; cp.cliques.len()],
        soft_apart_violations: vec![0; cp.soft_apart_pairs.len()],
        should_together_violations: vec![0; cp.should_together_pairs.len()],
        pair_meeting_counts: vec![0; cp.pair_meeting_constraints.len()],
        pair_contacts_fresh: vec![0u16; cp.num_pairs],
        ..OracleSnapshot::default()
    };

    build_pair_contacts(cp, state, &mut snap);
    compute_unique_and_repetition(cp, &mut snap);
    compute_attribute_balance(cp, state, &mut snap);
    compute_constraints(cp, state, &mut snap);

    snap.weighted_repetition_penalty = cp
        .repeat_encounter
        .as_ref()
        .map(|re| snap.repetition_penalty_raw as f64 * re.penalty_weight)
        .unwrap_or(0.0);

    snap.total_score = snap.weighted_repetition_penalty
        + snap.attribute_balance_penalty
        + snap.constraint_penalty_weighted
        - (snap.unique_contacts as f64 * cp.maximize_unique_contacts_weight)
        + cp.baseline_score;

    Ok(snap)
}

// ---------------------------------------------------------------------------
// Shape validation
// ---------------------------------------------------------------------------

fn validate_shape(cp: &CompiledProblem, state: &RuntimeState) -> Result<(), SolverError> {
    let expected_people_slots = cp.num_sessions * cp.num_people;
    let expected_group_slots = cp.num_sessions * cp.num_groups;

    if state.person_location.len() != expected_people_slots {
        return Err(SolverError::ValidationError(format!(
            "oracle: person_location length {} != expected {}",
            state.person_location.len(),
            expected_people_slots
        )));
    }
    if state.group_members.len() != expected_group_slots {
        return Err(SolverError::ValidationError(format!(
            "oracle: group_members length {} != expected {}",
            state.group_members.len(),
            expected_group_slots
        )));
    }
    if state.pair_contacts.len() != cp.num_pairs {
        return Err(SolverError::ValidationError(format!(
            "oracle: pair_contacts length {} != expected num_pairs {}",
            state.pair_contacts.len(),
            cp.num_pairs
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Pair contact matrix
// ---------------------------------------------------------------------------

fn build_pair_contacts(cp: &CompiledProblem, state: &RuntimeState, snap: &mut OracleSnapshot) {
    if cp.num_pairs == 0 {
        return;
    }
    for sidx in 0..cp.num_sessions {
        for gidx in 0..cp.num_groups {
            let gs = sidx * cp.num_groups + gidx;
            let members = &state.group_members[gs];
            for li in 0..members.len() {
                for ri in (li + 1)..members.len() {
                    let a = members[li];
                    let b = members[ri];
                    if cp.person_participation[a][sidx] && cp.person_participation[b][sidx] {
                        let pidx = cp.pair_idx(a, b);
                        snap.pair_contacts_fresh[pidx] =
                            snap.pair_contacts_fresh[pidx].saturating_add(1);
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Unique contacts and repetition
// ---------------------------------------------------------------------------

fn compute_unique_and_repetition(cp: &CompiledProblem, snap: &mut OracleSnapshot) {
    for pidx in 0..cp.num_pairs {
        let count = snap.pair_contacts_fresh[pidx];
        if count > 0 {
            snap.unique_contacts += 1;
        }
        if let Some(re) = &cp.repeat_encounter {
            let excess = count.saturating_sub(re.max_allowed_encounters as u16);
            if excess > 0 {
                snap.repetition_penalty_raw +=
                    re.penalty_function.penalty_for_excess(excess as u32);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Attribute balance
// ---------------------------------------------------------------------------

fn compute_attribute_balance(
    cp: &CompiledProblem,
    state: &RuntimeState,
    snap: &mut OracleSnapshot,
) {
    for sidx in 0..cp.num_sessions {
        for gidx in 0..cp.num_groups {
            let gs = sidx * cp.num_groups + gidx;
            for &cidx in &cp.attribute_balance_constraints_by_group_session[gs] {
                let c = &cp.attribute_balance_constraints[cidx];
                let members = &state.group_members[gs];
                let counts = count_attribute_values(cp, members, c.attr_idx);
                for &(vidx, desired) in &c.desired_counts {
                    let actual = counts.get(vidx).copied().unwrap_or(0);
                    let diff = match c.mode {
                        AttributeBalanceMode::Exact => (actual as i32 - desired as i32).abs(),
                        AttributeBalanceMode::AtLeast => (desired as i32 - actual as i32).max(0),
                    };
                    snap.attribute_balance_penalty += (diff.pow(2) as f64) * c.penalty_weight;
                }
            }
        }
    }
}

fn count_attribute_values(cp: &CompiledProblem, members: &[usize], attr_idx: usize) -> Vec<u32> {
    let value_count = cp.attr_idx_to_val.get(attr_idx).map_or(0, Vec::len);
    let mut counts = vec![0u32; value_count];
    for &pidx in members {
        if let Some(vidx) = cp.person_attribute_value_indices[pidx][attr_idx] {
            counts[vidx] += 1;
        }
    }
    counts
}

// ---------------------------------------------------------------------------
// Constraint penalties
// ---------------------------------------------------------------------------

fn compute_constraints(cp: &CompiledProblem, state: &RuntimeState, snap: &mut OracleSnapshot) {
    compute_soft_apart_pairs(cp, state, snap);
    compute_should_together(cp, state, snap);
    compute_cliques(cp, state, snap);
    compute_immovable(cp, state, snap);
    compute_pair_meeting(cp, state, snap);

    snap.constraint_penalty_raw = snap.soft_apart_violations.iter().sum::<i32>()
        + snap.should_together_violations.iter().sum::<i32>()
        + snap.clique_violations.iter().sum::<i32>()
        + snap.immovable_violations
        + pair_meeting_violation_count(cp, snap);
}

fn compute_soft_apart_pairs(cp: &CompiledProblem, state: &RuntimeState, snap: &mut OracleSnapshot) {
    for (cidx, c) in cp.soft_apart_pairs.iter().enumerate() {
        let (lp, rp) = c.people;
        for sidx in active_sessions(c.sessions.as_deref(), cp.num_sessions) {
            if !cp.person_participation[lp][sidx] || !cp.person_participation[rp][sidx] {
                continue;
            }
            let lps = sidx * cp.num_people + lp;
            let rps = sidx * cp.num_people + rp;
            let lg = state.person_location[lps];
            let rg = state.person_location[rps];
            if lg.is_some() && lg == rg {
                snap.soft_apart_violations[cidx] += 1;
                snap.constraint_penalty_weighted += c.penalty_weight;
            }
        }
    }
}

fn compute_should_together(cp: &CompiledProblem, state: &RuntimeState, snap: &mut OracleSnapshot) {
    for (cidx, c) in cp.should_together_pairs.iter().enumerate() {
        let (lp, rp) = c.people;
        for sidx in active_sessions(c.sessions.as_deref(), cp.num_sessions) {
            if !cp.person_participation[lp][sidx] || !cp.person_participation[rp][sidx] {
                continue;
            }
            let lps = sidx * cp.num_people + lp;
            let rps = sidx * cp.num_people + rp;
            let lg = state.person_location[lps];
            let rg = state.person_location[rps];
            if lg != rg {
                snap.should_together_violations[cidx] += 1;
                snap.constraint_penalty_weighted += c.penalty_weight;
            }
        }
    }
}

fn compute_cliques(cp: &CompiledProblem, state: &RuntimeState, snap: &mut OracleSnapshot) {
    for (cidx, clique) in cp.cliques.iter().enumerate() {
        for sidx in active_sessions(clique.sessions.as_deref(), cp.num_sessions) {
            let participating: Vec<usize> = clique
                .members
                .iter()
                .copied()
                .filter(|&m| cp.person_participation[m][sidx])
                .collect();
            if participating.len() < 2 {
                continue;
            }

            // Count members per group.
            let mut group_counts = vec![0i32; cp.num_groups];
            for &m in &participating {
                if let Some(gidx) = state.person_location[sidx * cp.num_people + m] {
                    group_counts[gidx] += 1;
                }
            }
            let max_in_one = group_counts.into_iter().max().unwrap_or(0);
            let separated = participating.len() as i32 - max_in_one;
            snap.clique_violations[cidx] += separated.max(0);
            // Note: clique violations count toward constraint_penalty_raw (integer) but are
            // not directly added to constraint_penalty_weighted. This matches the canonical local-search semantics:
            // cliques are enforced structurally by the search; the integer count serves as a
            // diagnostic and invariant signal rather than a scored penalty surface.
        }
    }
}

fn compute_immovable(cp: &CompiledProblem, state: &RuntimeState, snap: &mut OracleSnapshot) {
    for a in &cp.immovable_assignments {
        if !cp.person_participation[a.person_idx][a.session_idx] {
            continue;
        }
        let ps = a.session_idx * cp.num_people + a.person_idx;
        let actual = state.person_location[ps];
        if actual != Some(a.group_idx) {
            snap.immovable_violations += 1;
            snap.constraint_penalty_weighted += 1000.0;
        }
    }
}

fn compute_pair_meeting(cp: &CompiledProblem, state: &RuntimeState, snap: &mut OracleSnapshot) {
    for (cidx, c) in cp.pair_meeting_constraints.iter().enumerate() {
        let (lp, rp) = c.people;
        let mut meetings = 0u32;
        for &sidx in &c.sessions {
            if !cp.person_participation[lp][sidx] || !cp.person_participation[rp][sidx] {
                continue;
            }
            let lps = sidx * cp.num_people + lp;
            let rps = sidx * cp.num_people + rp;
            let lg = state.person_location[lps];
            let rg = state.person_location[rps];
            if lg.is_some() && lg == rg {
                meetings += 1;
            }
        }
        snap.pair_meeting_counts[cidx] = meetings;

        let target = c.target_meetings as i32;
        let have = meetings as i32;
        let penalty = match c.mode {
            PairMeetingMode::AtLeast => (target - have).max(0) as f64,
            PairMeetingMode::Exact => (have - target).abs() as f64,
            PairMeetingMode::AtMost => (have - target).max(0) as f64,
        } * c.penalty_weight;

        if penalty > 0.0 {
            snap.constraint_penalty_weighted += penalty;
        }
    }
}

fn pair_meeting_violation_count(cp: &CompiledProblem, snap: &OracleSnapshot) -> i32 {
    cp.pair_meeting_constraints
        .iter()
        .enumerate()
        .filter(|(cidx, c)| {
            let target = c.target_meetings as i32;
            let have = snap.pair_meeting_counts[*cidx] as i32;
            let violation = match c.mode {
                PairMeetingMode::AtLeast => (target - have).max(0),
                PairMeetingMode::Exact => (have - target).abs(),
                PairMeetingMode::AtMost => (have - target).max(0),
            };
            violation > 0 && c.penalty_weight > 0.0
        })
        .count() as i32
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

fn active_sessions(
    sessions: Option<&[usize]>,
    num_sessions: usize,
) -> impl Iterator<Item = usize> + '_ {
    let range: Box<dyn Iterator<Item = usize>> = match sessions {
        Some(s) => Box::new(s.iter().copied()),
        None => Box::new(0..num_sessions),
    };
    range
}
