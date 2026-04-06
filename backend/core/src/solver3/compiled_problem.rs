//! Immutable dense compiled problem for the `solver3` family.
//!
//! The compiled problem is the read-only, indexed, cache-friendly representation of the
//! scenario. All runtime-relevant structures are precomputed here so that move kernels
//! can operate with integer indices and no string lookups.
//!
//! Key design decision: a packed upper-triangular pair index lets the runtime state
//! store one contiguous `Vec<u16>` for pair contact counts rather than a
//! `Vec<Vec<u32>>` contact matrix.

use std::collections::{HashMap, HashSet};

use crate::models::{
    ApiInput, AttributeBalanceMode, Constraint, Objective, PairMeetingMode, ProblemDefinition,
    SolverKind,
};
use crate::solver_support::validation::{
    validate_schedule_as_construction_seed, validate_schedule_input_mode,
};
use crate::solver_support::SolverError;

/// Flat `[session_idx][group_idx] -> members` schedule representation used only during
/// initialization. Hot-path runtime data lives in `RuntimeState`.
pub(crate) type PackedSchedule = Vec<Vec<Vec<usize>>>;

// ---------------------------------------------------------------------------
// Compiled constraint types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RepeatPenaltyFunction {
    Linear,
    Squared,
}

impl RepeatPenaltyFunction {
    fn parse(value: &str) -> Result<Self, SolverError> {
        match value {
            "linear" => Ok(Self::Linear),
            "squared" => Ok(Self::Squared),
            other => Err(SolverError::ValidationError(format!(
                "invalid RepeatEncounter penalty_function '{}'; expected 'linear' or 'squared'",
                other
            ))),
        }
    }

    #[inline]
    pub(crate) fn penalty_for_excess(self, excess: u32) -> i32 {
        let e = excess as i32;
        match self {
            Self::Linear => e,
            Self::Squared => e * e,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CompiledClique {
    /// Sorted member indices.
    pub members: Vec<usize>,
    /// Sessions in which this clique is active. `None` means all sessions.
    pub sessions: Option<Vec<usize>>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CompiledPairConstraint {
    /// Canonical `(lo, hi)` ordering with `lo < hi`.
    pub people: (usize, usize),
    pub penalty_weight: f64,
    /// Active sessions. `None` means all sessions.
    pub sessions: Option<Vec<usize>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CompiledImmovableAssignment {
    pub person_idx: usize,
    pub session_idx: usize,
    pub group_idx: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CompiledPairMeetingConstraint {
    pub people: (usize, usize),
    pub sessions: Vec<usize>,
    pub target_meetings: u32,
    pub mode: PairMeetingMode,
    pub penalty_weight: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CompiledAttributeBalanceConstraint {
    pub target_group_indices: Vec<usize>,
    pub attr_idx: usize,
    /// `(value_idx, desired_count)` pairs.
    pub desired_counts: Vec<(usize, u32)>,
    pub penalty_weight: f64,
    pub mode: AttributeBalanceMode,
    /// Active sessions. `None` means all sessions.
    pub sessions: Option<Vec<usize>>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CompiledRepeatEncounterConstraint {
    pub max_allowed_encounters: u32,
    pub penalty_weight: f64,
    pub penalty_function: RepeatPenaltyFunction,
}

// ---------------------------------------------------------------------------
// CompiledProblem
// ---------------------------------------------------------------------------

/// Immutable, dense compiled representation of the problem for the `solver3` family.
///
/// All hot-path data is index-addressable. The critical addition over `solver2`'s
/// compiled problem is the packed upper-triangular pair index: `pair_idx(a, b)`
/// maps any pair to a unique position in a flat `Vec`, enabling O(1) contact-count
/// lookups without a `Vec<Vec<_>>` matrix.
#[derive(Debug, Clone)]
pub struct CompiledProblem {
    // ------------------------------------------------------------------
    // Core dimensions
    // ------------------------------------------------------------------
    pub num_people: usize,
    pub num_groups: usize,
    pub num_sessions: usize,
    /// Total number of unique person pairs: `N * (N-1) / 2`.
    pub num_pairs: usize,

    // ------------------------------------------------------------------
    // Identity index tables (HashMap only at compile-time / boundary)
    // ------------------------------------------------------------------
    pub person_id_to_idx: HashMap<String, usize>,
    pub person_idx_to_id: Vec<String>,
    pub group_id_to_idx: HashMap<String, usize>,
    pub group_idx_to_id: Vec<String>,

    // ------------------------------------------------------------------
    // Capacity
    // ------------------------------------------------------------------
    /// Base capacity per group (length = `num_groups`).
    pub group_capacities: Vec<usize>,
    /// Per-session capacity: index via `group_session_slot`. Length = `num_groups * num_sessions`.
    pub effective_group_capacities: Vec<usize>,
    pub session_total_capacities: Vec<usize>,
    pub session_max_group_capacities: Vec<usize>,
    /// Solver-level allowed_sessions restriction (search phase only).
    pub allowed_sessions: Option<Vec<usize>>,

    // ------------------------------------------------------------------
    // Attribute indexes
    // ------------------------------------------------------------------
    pub attr_key_to_idx: HashMap<String, usize>,
    pub attr_idx_to_key: Vec<String>,
    pub attr_val_to_idx: Vec<HashMap<String, usize>>,
    pub attr_idx_to_val: Vec<Vec<String>>,
    /// `[person_idx][attr_idx] -> Option<value_idx>`.
    pub person_attribute_value_indices: Vec<Vec<Option<usize>>>,

    // ------------------------------------------------------------------
    // Participation
    // ------------------------------------------------------------------
    /// `[person_idx][session_idx] -> participates`.
    pub person_participation: Vec<Vec<bool>>,

    // ------------------------------------------------------------------
    // Construction seed schedule (optional, used for bootstrap seeding)
    // ------------------------------------------------------------------
    pub(crate) compiled_construction_seed_schedule: Option<PackedSchedule>,

    // ------------------------------------------------------------------
    // Cliques (MustStayTogether)
    // ------------------------------------------------------------------
    pub(crate) cliques: Vec<CompiledClique>,
    /// `[session_idx][person_idx] -> Option<clique_idx>`.
    pub person_to_clique_id: Vec<Vec<Option<usize>>>,

    // ------------------------------------------------------------------
    // Constraint adjacency metadata
    // ------------------------------------------------------------------
    pub(crate) forbidden_pairs: Vec<CompiledPairConstraint>,
    /// `[person_idx] -> Vec<constraint_idx>`.
    pub forbidden_pairs_by_person: Vec<Vec<usize>>,

    pub(crate) should_together_pairs: Vec<CompiledPairConstraint>,
    pub should_together_pairs_by_person: Vec<Vec<usize>>,

    pub(crate) immovable_assignments: Vec<CompiledImmovableAssignment>,
    /// `(person_idx, session_idx) -> group_idx`.
    pub immovable_lookup: HashMap<(usize, usize), usize>,
    /// `[session_idx * num_people + person_idx] -> Option<group_idx>`.
    pub immovable_group_by_person_session: Vec<Option<usize>>,

    pub(crate) pair_meeting_constraints: Vec<CompiledPairMeetingConstraint>,
    pub pair_meeting_constraints_by_person: Vec<Vec<usize>>,

    pub(crate) attribute_balance_constraints: Vec<CompiledAttributeBalanceConstraint>,
    /// `[group_session_slot] -> Vec<constraint_idx>`.
    pub attribute_balance_constraints_by_group_session: Vec<Vec<usize>>,

    // ------------------------------------------------------------------
    // Scoring parameters
    // ------------------------------------------------------------------
    pub maximize_unique_contacts_weight: f64,
    pub(crate) repeat_encounter: Option<CompiledRepeatEncounterConstraint>,
    /// Positive baseline added to total_score so that a perfect state produces ~0.
    pub baseline_score: f64,

    // ------------------------------------------------------------------
    // Preserved for registry / metadata surfaces
    // ------------------------------------------------------------------
    pub objectives: Vec<Objective>,
    pub constraints: Vec<Constraint>,
    pub problem: ProblemDefinition,
}

impl CompiledProblem {
    /// Compiles an immutable `solver3` problem representation from `input`.
    ///
    /// Fails explicitly if `input.solver` does not select the `solver3` family.
    pub fn compile(input: &ApiInput) -> Result<Self, SolverError> {
        let solver_kind = input
            .solver
            .validate_solver_selection()
            .map_err(SolverError::ValidationError)?;

        if solver_kind != SolverKind::Solver3 {
            return Err(SolverError::ValidationError(format!(
                "solver3::CompiledProblem expected solver family 'solver3', got '{}'",
                solver_kind.canonical_id()
            )));
        }

        validate_schedule_input_mode(input)?;

        let num_people = input.problem.people.len();
        let num_groups = input.problem.groups.len();
        let num_sessions = input.problem.num_sessions as usize;
        let num_pairs = if num_people >= 2 {
            num_people * (num_people - 1) / 2
        } else {
            0
        };

        let person_id_to_idx = build_person_index(input)?;
        let person_idx_to_id = input
            .problem
            .people
            .iter()
            .map(|p| p.id.clone())
            .collect::<Vec<_>>();

        let group_id_to_idx = build_group_index(input)?;
        let group_idx_to_id = input
            .problem
            .groups
            .iter()
            .map(|g| g.id.clone())
            .collect::<Vec<_>>();

        let person_participation = build_person_participation(input)?;

        let (
            group_capacities,
            effective_group_capacities,
            session_total_capacities,
            session_max_group_capacities,
        ) = build_effective_group_capacities(input, num_groups, num_sessions)?;

        validate_session_capacities(&person_participation, &session_total_capacities)?;

        let allowed_sessions = normalize_allowed_sessions(input, num_sessions)?;

        let (
            attr_key_to_idx,
            attr_idx_to_key,
            attr_val_to_idx,
            attr_idx_to_val,
            person_attribute_value_indices,
        ) = build_attribute_indexes(input)?;

        let compiled_construction_seed_schedule = compile_construction_seed_schedule(input)?;

        let immovable_assignments = compile_immovable_assignments(
            input,
            &person_id_to_idx,
            &group_id_to_idx,
            num_sessions,
        )?;
        let immovable_lookup = immovable_assignments
            .iter()
            .map(|a| ((a.person_idx, a.session_idx), a.group_idx))
            .collect::<HashMap<_, _>>();
        let mut immovable_group_by_person_session = vec![None; num_sessions * num_people];
        for assignment in &immovable_assignments {
            immovable_group_by_person_session
                [assignment.session_idx * num_people + assignment.person_idx] =
                Some(assignment.group_idx);
        }

        let (cliques, person_to_clique_id) =
            compile_cliques(input, &person_id_to_idx, num_sessions, num_people)?;
        validate_cliques_against_capacities(
            &cliques,
            &person_participation,
            &session_max_group_capacities,
        )?;
        validate_cliques_against_immovable(&cliques, &person_participation, &immovable_lookup)?;

        let forbidden_pairs = compile_forbidden_pairs(
            input,
            &person_id_to_idx,
            &person_to_clique_id,
            &cliques,
            num_sessions,
        )?;
        let forbidden_pairs_by_person =
            build_pair_adjacency(num_people, &forbidden_pairs, |c| c.people);

        let should_together_pairs = compile_should_together_pairs(
            input,
            &person_id_to_idx,
            &forbidden_pairs,
            num_sessions,
        )?;
        let should_together_pairs_by_person =
            build_pair_adjacency(num_people, &should_together_pairs, |c| c.people);

        let pair_meeting_constraints =
            compile_pair_meeting_constraints(input, &person_id_to_idx, &person_participation)?;
        let pair_meeting_constraints_by_person =
            build_pair_adjacency(num_people, &pair_meeting_constraints, |c| c.people);

        let (attribute_balance_constraints, attribute_balance_constraints_by_group_session) =
            compile_attribute_balance_constraints(
                input,
                &group_id_to_idx,
                &attr_key_to_idx,
                &attr_val_to_idx,
                num_groups,
                num_sessions,
            )?;

        let maximize_unique_contacts_weight = input
            .objectives
            .iter()
            .find(|o| o.r#type == "maximize_unique_contacts")
            .map(|o| o.weight)
            .unwrap_or(0.0);

        let repeat_encounter = compile_repeat_encounter(input)?;

        let max_possible_unique_contacts = if num_people >= 2 {
            std::cmp::min(
                num_pairs,
                (num_people
                    * num_sessions
                    * session_max_group_capacities
                        .iter()
                        .max()
                        .copied()
                        .unwrap_or(1)
                        .saturating_sub(1))
                    / 2,
            )
        } else {
            0
        };
        let baseline_score = max_possible_unique_contacts as f64 * maximize_unique_contacts_weight;

        Ok(Self {
            num_people,
            num_groups,
            num_sessions,
            num_pairs,
            person_id_to_idx,
            person_idx_to_id,
            group_id_to_idx,
            group_idx_to_id,
            group_capacities,
            effective_group_capacities,
            session_total_capacities,
            session_max_group_capacities,
            allowed_sessions,
            attr_key_to_idx,
            attr_idx_to_key,
            attr_val_to_idx,
            attr_idx_to_val,
            person_attribute_value_indices,
            person_participation,
            compiled_construction_seed_schedule,
            cliques,
            person_to_clique_id,
            forbidden_pairs,
            forbidden_pairs_by_person,
            should_together_pairs,
            should_together_pairs_by_person,
            immovable_assignments,
            immovable_lookup,
            immovable_group_by_person_session,
            pair_meeting_constraints,
            pair_meeting_constraints_by_person,
            attribute_balance_constraints,
            attribute_balance_constraints_by_group_session,
            maximize_unique_contacts_weight,
            repeat_encounter,
            baseline_score,
            objectives: input.objectives.clone(),
            constraints: input.constraints.clone(),
            problem: input.problem.clone(),
        })
    }

    // ------------------------------------------------------------------
    // Packed pair index — critical hot-path helper
    // ------------------------------------------------------------------

    /// Returns the packed upper-triangular index for the pair `(a, b)`.
    ///
    /// Normalises the order so that `pair_idx(a, b) == pair_idx(b, a)`.  
    /// Panics in debug builds if `a == b`.
    ///
    /// Formula: `lo * (2*N - lo - 1) / 2 + (hi - lo - 1)` where `N = num_people`.
    #[inline]
    pub fn pair_idx(&self, a: usize, b: usize) -> usize {
        debug_assert_ne!(a, b, "pair_idx called with identical indices");
        let (lo, hi) = if a < b { (a, b) } else { (b, a) };
        lo * (2 * self.num_people - lo - 1) / 2 + (hi - lo - 1)
    }

    // ------------------------------------------------------------------
    // Flat group-session slot helpers
    // ------------------------------------------------------------------

    /// `session_idx * num_groups + group_idx`.
    #[inline]
    pub fn group_session_slot(&self, session_idx: usize, group_idx: usize) -> usize {
        session_idx * self.num_groups + group_idx
    }

    #[inline]
    pub fn group_capacity(&self, session_idx: usize, group_idx: usize) -> usize {
        self.effective_group_capacities[self.group_session_slot(session_idx, group_idx)]
    }

    #[inline]
    pub fn person_session_slot(&self, session_idx: usize, person_idx: usize) -> usize {
        session_idx * self.num_people + person_idx
    }

    #[inline]
    pub fn immovable_group(&self, session_idx: usize, person_idx: usize) -> Option<usize> {
        self.immovable_group_by_person_session[self.person_session_slot(session_idx, person_idx)]
    }

    // ------------------------------------------------------------------
    // Display helpers
    // ------------------------------------------------------------------

    pub fn display_person(&self, person_idx: usize) -> String {
        self.person_idx_to_id
            .get(person_idx)
            .cloned()
            .unwrap_or_else(|| format!("person#{}", person_idx))
    }

    pub fn display_group(&self, group_idx: usize) -> String {
        self.group_idx_to_id
            .get(group_idx)
            .cloned()
            .unwrap_or_else(|| format!("group#{}", group_idx))
    }
}

// ---------------------------------------------------------------------------
// Compilation helpers
// ---------------------------------------------------------------------------

fn build_person_index(input: &ApiInput) -> Result<HashMap<String, usize>, SolverError> {
    let mut seen = HashSet::new();
    let mut result = HashMap::with_capacity(input.problem.people.len());
    for (idx, person) in input.problem.people.iter().enumerate() {
        if !seen.insert(person.id.clone()) {
            return Err(SolverError::ValidationError(format!(
                "duplicate person ID: '{}'",
                person.id
            )));
        }
        result.insert(person.id.clone(), idx);
    }
    Ok(result)
}

fn build_group_index(input: &ApiInput) -> Result<HashMap<String, usize>, SolverError> {
    let mut seen = HashSet::new();
    let mut result = HashMap::with_capacity(input.problem.groups.len());
    for (idx, group) in input.problem.groups.iter().enumerate() {
        if !seen.insert(group.id.clone()) {
            return Err(SolverError::ValidationError(format!(
                "duplicate group ID: '{}'",
                group.id
            )));
        }
        result.insert(group.id.clone(), idx);
    }
    Ok(result)
}

fn build_person_participation(input: &ApiInput) -> Result<Vec<Vec<bool>>, SolverError> {
    let num_sessions = input.problem.num_sessions as usize;
    let mut pp = vec![vec![false; num_sessions]; input.problem.people.len()];
    for (pidx, person) in input.problem.people.iter().enumerate() {
        match &person.sessions {
            None => {
                for s in &mut pp[pidx] {
                    *s = true;
                }
            }
            Some(sessions) => {
                for &s in sessions {
                    let s = s as usize;
                    if s >= num_sessions {
                        return Err(SolverError::ValidationError(format!(
                            "person '{}' has out-of-range session index {} (max {})",
                            person.id,
                            s,
                            num_sessions.saturating_sub(1)
                        )));
                    }
                    pp[pidx][s] = true;
                }
            }
        }
    }
    Ok(pp)
}

#[allow(clippy::type_complexity)]
fn build_effective_group_capacities(
    input: &ApiInput,
    num_groups: usize,
    num_sessions: usize,
) -> Result<(Vec<usize>, Vec<usize>, Vec<usize>, Vec<usize>), SolverError> {
    let group_capacities = input
        .problem
        .groups
        .iter()
        .map(|g| g.size as usize)
        .collect::<Vec<_>>();

    let mut effective = vec![0usize; num_groups * num_sessions];
    let mut session_total = vec![0usize; num_sessions];
    let mut session_max = vec![0usize; num_sessions];

    for (gidx, group) in input.problem.groups.iter().enumerate() {
        if let Some(ss) = &group.session_sizes {
            if ss.len() != num_sessions {
                return Err(SolverError::ValidationError(format!(
                    "group '{}' has {} session_sizes entries but problem has {} sessions",
                    group.id,
                    ss.len(),
                    num_sessions
                )));
            }
        }
        for sidx in 0..num_sessions {
            let cap = group
                .session_sizes
                .as_ref()
                .map(|ss| ss[sidx] as usize)
                .unwrap_or(group.size as usize);
            let slot = sidx * num_groups + gidx;
            effective[slot] = cap;
            session_total[sidx] += cap;
            session_max[sidx] = session_max[sidx].max(cap);
        }
    }

    Ok((group_capacities, effective, session_total, session_max))
}

fn validate_session_capacities(
    person_participation: &[Vec<bool>],
    session_total_capacities: &[usize],
) -> Result<(), SolverError> {
    for (sidx, &cap) in session_total_capacities.iter().enumerate() {
        let participants = person_participation.iter().filter(|pp| pp[sidx]).count();
        if participants > cap {
            return Err(SolverError::ValidationError(format!(
                "not enough group capacity in session {}: {} people, {} capacity",
                sidx, participants, cap
            )));
        }
    }
    Ok(())
}

fn normalize_allowed_sessions(
    input: &ApiInput,
    num_sessions: usize,
) -> Result<Option<Vec<usize>>, SolverError> {
    let Some(sessions) = &input.solver.allowed_sessions else {
        return Ok(None);
    };
    if sessions.is_empty() {
        return Err(SolverError::ValidationError(
            "allowed_sessions cannot be empty".into(),
        ));
    }
    let mut normalized = sessions.iter().map(|&s| s as usize).collect::<Vec<_>>();
    normalized.sort_unstable();
    normalized.dedup();
    for &s in &normalized {
        if s >= num_sessions {
            return Err(SolverError::ValidationError(format!(
                "allowed_sessions contains out-of-range session {} (max {})",
                s,
                num_sessions.saturating_sub(1)
            )));
        }
    }
    Ok(Some(normalized))
}

#[allow(clippy::too_many_arguments)]
fn compile_construction_seed_schedule(
    input: &ApiInput,
) -> Result<Option<PackedSchedule>, SolverError> {
    let Some(construction_seed_schedule) = &input.construction_seed_schedule else {
        return Ok(None);
    };

    Ok(Some(
        validate_schedule_as_construction_seed(input, construction_seed_schedule)?.schedule,
    ))
}

fn compile_immovable_assignments(
    input: &ApiInput,
    person_id_to_idx: &HashMap<String, usize>,
    group_id_to_idx: &HashMap<String, usize>,
    num_sessions: usize,
) -> Result<Vec<CompiledImmovableAssignment>, SolverError> {
    let mut assignments = Vec::new();

    for constraint in &input.constraints {
        match constraint {
            Constraint::ImmovablePerson(params) => {
                let &pidx = person_id_to_idx.get(&params.person_id).ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "ImmovablePerson: unknown person '{}'",
                        params.person_id
                    ))
                })?;
                let &gidx = group_id_to_idx.get(&params.group_id).ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "ImmovablePerson: unknown group '{}'",
                        params.group_id
                    ))
                })?;
                let sessions = params
                    .sessions
                    .clone()
                    .unwrap_or_else(|| (0..num_sessions as u32).collect());
                for s in sessions {
                    let sidx = s as usize;
                    if sidx >= num_sessions {
                        return Err(SolverError::ValidationError(format!(
                            "ImmovablePerson '{}': session {} out of range",
                            params.person_id, sidx
                        )));
                    }
                    assignments.push(CompiledImmovableAssignment {
                        person_idx: pidx,
                        session_idx: sidx,
                        group_idx: gidx,
                    });
                }
            }
            Constraint::ImmovablePeople(params) => {
                let &gidx = group_id_to_idx.get(&params.group_id).ok_or_else(|| {
                    SolverError::ValidationError(format!(
                        "ImmovablePeople: unknown group '{}'",
                        params.group_id
                    ))
                })?;
                let sessions = params
                    .sessions
                    .clone()
                    .unwrap_or_else(|| (0..num_sessions as u32).collect());
                for person_id in &params.people {
                    let &pidx = person_id_to_idx.get(person_id).ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "ImmovablePeople: unknown person '{}'",
                            person_id
                        ))
                    })?;
                    for &s in &sessions {
                        let sidx = s as usize;
                        if sidx >= num_sessions {
                            return Err(SolverError::ValidationError(format!(
                                "ImmovablePeople person '{}': session {} out of range",
                                person_id, sidx
                            )));
                        }
                        assignments.push(CompiledImmovableAssignment {
                            person_idx: pidx,
                            session_idx: sidx,
                            group_idx: gidx,
                        });
                    }
                }
            }
            _ => {}
        }
    }

    assignments.sort_by_key(|a| (a.session_idx, a.person_idx, a.group_idx));
    assignments.dedup();
    Ok(assignments)
}

#[allow(clippy::type_complexity, clippy::needless_range_loop)]
fn compile_cliques(
    input: &ApiInput,
    person_id_to_idx: &HashMap<String, usize>,
    num_sessions: usize,
    num_people: usize,
) -> Result<(Vec<CompiledClique>, Vec<Vec<Option<usize>>>), SolverError> {
    let mut cliques: Vec<CompiledClique> = Vec::new();
    let mut clique_session_lists: Vec<Vec<usize>> = Vec::new();
    let mut members_to_clique_idx: HashMap<Vec<usize>, usize> = HashMap::new();
    let mut person_to_clique_id = vec![vec![None::<usize>; num_people]; num_sessions];

    for sidx in 0..num_sessions {
        let mut dsu = Dsu::new(num_people);

        for constraint in &input.constraints {
            if let Constraint::MustStayTogether { people, sessions } = constraint {
                let active = match sessions {
                    Some(list) => list.iter().any(|&s| s as usize == sidx),
                    None => true,
                };
                if !active || people.len() < 2 {
                    continue;
                }
                for window in people.windows(2) {
                    let &left = person_id_to_idx.get(&window[0]).ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "MustStayTogether: unknown person '{}'",
                            window[0]
                        ))
                    })?;
                    let &right = person_id_to_idx.get(&window[1]).ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "MustStayTogether: unknown person '{}'",
                            window[1]
                        ))
                    })?;
                    dsu.union(left, right);
                }
            }
        }

        let mut root_to_members: HashMap<usize, Vec<usize>> = HashMap::new();
        for pidx in 0..num_people {
            root_to_members
                .entry(dsu.find(pidx))
                .or_default()
                .push(pidx);
        }

        let mut groups_of_interest = root_to_members
            .into_values()
            .filter(|m| m.len() >= 2)
            .map(|mut m| {
                m.sort_unstable();
                m
            })
            .collect::<Vec<_>>();
        groups_of_interest.sort_unstable();

        for members in groups_of_interest {
            let clique_idx = match members_to_clique_idx.get(&members) {
                Some(&idx) => idx,
                None => {
                    let idx = cliques.len();
                    members_to_clique_idx.insert(members.clone(), idx);
                    cliques.push(CompiledClique {
                        members: members.clone(),
                        sessions: None, // filled below
                    });
                    clique_session_lists.push(Vec::new());
                    idx
                }
            };

            if !clique_session_lists[clique_idx].contains(&sidx) {
                clique_session_lists[clique_idx].push(sidx);
            }

            for &member in &members {
                if person_to_clique_id[sidx][member].is_some() {
                    return Err(SolverError::ValidationError(format!(
                        "person '{}' is part of multiple cliques in session {}",
                        input.problem.people[member].id, sidx
                    )));
                }
                person_to_clique_id[sidx][member] = Some(clique_idx);
            }
        }
    }

    // Finalise session lists: None means all sessions.
    for (cidx, session_list) in clique_session_lists.into_iter().enumerate() {
        let mut sorted = session_list;
        sorted.sort_unstable();
        cliques[cidx].sessions = if sorted.len() == num_sessions {
            None
        } else {
            Some(sorted)
        };
    }

    Ok((cliques, person_to_clique_id))
}

fn validate_cliques_against_capacities(
    cliques: &[CompiledClique],
    person_participation: &[Vec<bool>],
    session_max_group_capacities: &[usize],
) -> Result<(), SolverError> {
    for clique in cliques {
        for (sidx, &max_cap) in session_max_group_capacities.iter().enumerate() {
            let active = match &clique.sessions {
                Some(sessions) => sessions.contains(&sidx),
                None => true,
            };
            if !active {
                continue;
            }
            let participating = clique
                .members
                .iter()
                .filter(|&&m| person_participation[m][sidx])
                .count();
            if participating > max_cap {
                return Err(SolverError::ValidationError(format!(
                    "MustStayTogether clique of size {} cannot fit in any group for session {}",
                    participating, sidx
                )));
            }
        }
    }
    Ok(())
}

#[allow(clippy::needless_range_loop)]
fn validate_cliques_against_immovable(
    cliques: &[CompiledClique],
    person_participation: &[Vec<bool>],
    immovable_lookup: &HashMap<(usize, usize), usize>,
) -> Result<(), SolverError> {
    let num_sessions = person_participation.first().map_or(0, |pp| pp.len());
    for clique in cliques {
        for sidx in 0..num_sessions {
            let active = match &clique.sessions {
                Some(sessions) => sessions.contains(&sidx),
                None => true,
            };
            if !active {
                continue;
            }
            let mut required_group: Option<usize> = None;
            for &member in &clique.members {
                if !person_participation[member][sidx] {
                    continue;
                }
                if let Some(&gidx) = immovable_lookup.get(&(member, sidx)) {
                    match required_group {
                        Some(existing) if existing != gidx => {
                            return Err(SolverError::ValidationError(format!(
                                "MustStayTogether clique has conflicting immovable assignments in session {}",
                                sidx
                            )));
                        }
                        None => required_group = Some(gidx),
                        _ => {}
                    }
                }
            }
        }
    }
    Ok(())
}

#[allow(clippy::needless_range_loop)]
fn compile_forbidden_pairs(
    input: &ApiInput,
    person_id_to_idx: &HashMap<String, usize>,
    person_to_clique_id: &[Vec<Option<usize>>],
    cliques: &[CompiledClique],
    num_sessions: usize,
) -> Result<Vec<CompiledPairConstraint>, SolverError> {
    let mut pairs = Vec::new();

    for constraint in &input.constraints {
        if let Constraint::ShouldNotBeTogether {
            people,
            penalty_weight,
            sessions,
        } = constraint
        {
            for left_idx in 0..people.len() {
                for right_idx in (left_idx + 1)..people.len() {
                    let &lp = person_id_to_idx.get(&people[left_idx]).ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "ShouldNotBeTogether: unknown person '{}'",
                            people[left_idx]
                        ))
                    })?;
                    let &rp = person_id_to_idx.get(&people[right_idx]).ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "ShouldNotBeTogether: unknown person '{}'",
                            people[right_idx]
                        ))
                    })?;

                    // Validate no conflict with MustStayTogether cliques.
                    for sidx in 0..num_sessions {
                        if let Some(active_sessions) = sessions {
                            if !active_sessions.contains(&(sidx as u32)) {
                                continue;
                            }
                        }
                        if let (Some(lc), Some(rc)) =
                            (person_to_clique_id[sidx][lp], person_to_clique_id[sidx][rp])
                        {
                            if lc == rc {
                                let members = cliques[lc]
                                    .members
                                    .iter()
                                    .map(|&m| input.problem.people[m].id.clone())
                                    .collect::<Vec<_>>();
                                return Err(SolverError::ValidationError(format!(
                                    "ShouldNotBeTogether conflicts with MustStayTogether in session {}: people {:?} share clique {:?}",
                                    sidx, people, members
                                )));
                            }
                        }
                    }

                    let compiled_sessions = normalize_session_list(sessions, num_sessions)?;
                    let (lo, hi) = if lp < rp { (lp, rp) } else { (rp, lp) };
                    pairs.push(CompiledPairConstraint {
                        people: (lo, hi),
                        penalty_weight: *penalty_weight,
                        sessions: compiled_sessions,
                    });
                }
            }
        }
    }

    Ok(pairs)
}

fn compile_should_together_pairs(
    input: &ApiInput,
    person_id_to_idx: &HashMap<String, usize>,
    forbidden_pairs: &[CompiledPairConstraint],
    num_sessions: usize,
) -> Result<Vec<CompiledPairConstraint>, SolverError> {
    let mut pairs = Vec::new();

    for constraint in &input.constraints {
        if let Constraint::ShouldStayTogether {
            people,
            penalty_weight,
            sessions,
        } = constraint
        {
            for left_idx in 0..people.len() {
                for right_idx in (left_idx + 1)..people.len() {
                    let &lp = person_id_to_idx.get(&people[left_idx]).ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "ShouldStayTogether: unknown person '{}'",
                            people[left_idx]
                        ))
                    })?;
                    let &rp = person_id_to_idx.get(&people[right_idx]).ok_or_else(|| {
                        SolverError::ValidationError(format!(
                            "ShouldStayTogether: unknown person '{}'",
                            people[right_idx]
                        ))
                    })?;

                    let compiled_sessions = normalize_session_list(sessions, num_sessions)?;
                    let (lo, hi) = if lp < rp { (lp, rp) } else { (rp, lp) };

                    if forbidden_pairs.iter().any(|fp| {
                        fp.people == (lo, hi)
                            && sessions_overlap(
                                fp.sessions.as_deref(),
                                compiled_sessions.as_deref(),
                            )
                    }) {
                        return Err(SolverError::ValidationError(
                            "ShouldStayTogether conflicts with ShouldNotBeTogether for the same pair in overlapping sessions".into(),
                        ));
                    }

                    pairs.push(CompiledPairConstraint {
                        people: (lo, hi),
                        penalty_weight: *penalty_weight,
                        sessions: compiled_sessions,
                    });
                }
            }
        }
    }

    Ok(pairs)
}

fn compile_pair_meeting_constraints(
    input: &ApiInput,
    person_id_to_idx: &HashMap<String, usize>,
    person_participation: &[Vec<bool>],
) -> Result<Vec<CompiledPairMeetingConstraint>, SolverError> {
    let num_sessions = input.problem.num_sessions as usize;
    let mut constraints = Vec::new();

    for constraint in &input.constraints {
        if let Constraint::PairMeetingCount(params) = constraint {
            if params.people.len() != 2 {
                return Err(SolverError::ValidationError(
                    "PairMeetingCount requires exactly two people".into(),
                ));
            }
            let &lp = person_id_to_idx.get(&params.people[0]).ok_or_else(|| {
                SolverError::ValidationError(format!(
                    "PairMeetingCount: unknown person '{}'",
                    params.people[0]
                ))
            })?;
            let &rp = person_id_to_idx.get(&params.people[1]).ok_or_else(|| {
                SolverError::ValidationError(format!(
                    "PairMeetingCount: unknown person '{}'",
                    params.people[1]
                ))
            })?;

            let mut sessions = if params.sessions.is_empty() {
                (0..num_sessions).collect::<Vec<_>>()
            } else {
                let mut s = params
                    .sessions
                    .iter()
                    .map(|&x| x as usize)
                    .collect::<Vec<_>>();
                s.sort_unstable();
                s.dedup();
                for &sidx in &s {
                    if sidx >= num_sessions {
                        return Err(SolverError::ValidationError(format!(
                            "PairMeetingCount: session {} out of range",
                            sidx
                        )));
                    }
                }
                s
            };
            sessions.sort_unstable();
            sessions.dedup();

            if params.target_meetings > sessions.len() as u32 {
                return Err(SolverError::ValidationError(format!(
                    "PairMeetingCount target_meetings={} exceeds {} sessions in subset",
                    params.target_meetings,
                    sessions.len()
                )));
            }

            let feasible = sessions
                .iter()
                .filter(|&&s| person_participation[lp][s] && person_participation[rp][s])
                .count() as u32;
            if params.mode == PairMeetingMode::AtLeast && params.target_meetings > feasible {
                return Err(SolverError::ValidationError(format!(
                    "PairMeetingCount target_meetings={} exceeds feasible co-participation {} for the pair",
                    params.target_meetings, feasible
                )));
            }

            let (lo, hi) = if lp < rp { (lp, rp) } else { (rp, lp) };
            constraints.push(CompiledPairMeetingConstraint {
                people: (lo, hi),
                sessions,
                target_meetings: params.target_meetings,
                mode: params.mode,
                penalty_weight: params.penalty_weight,
            });
        }
    }

    Ok(constraints)
}

fn compile_attribute_balance_constraints(
    input: &ApiInput,
    group_id_to_idx: &HashMap<String, usize>,
    attr_key_to_idx: &HashMap<String, usize>,
    attr_val_to_idx: &[HashMap<String, usize>],
    num_groups: usize,
    num_sessions: usize,
) -> Result<(Vec<CompiledAttributeBalanceConstraint>, Vec<Vec<usize>>), SolverError> {
    let mut constraints = Vec::new();
    let mut by_group_session = vec![Vec::new(); num_groups * num_sessions];

    for constraint in &input.constraints {
        let Constraint::AttributeBalance(params) = constraint else {
            continue;
        };

        let target_group_indices = if params.group_id == "ALL" {
            (0..num_groups).collect::<Vec<_>>()
        } else {
            vec![*group_id_to_idx.get(&params.group_id).ok_or_else(|| {
                SolverError::ValidationError(format!(
                    "AttributeBalance: unknown group '{}'",
                    params.group_id
                ))
            })?]
        };

        let attr_idx = *attr_key_to_idx.get(&params.attribute_key).ok_or_else(|| {
            SolverError::ValidationError(format!(
                "AttributeBalance: unknown attribute key '{}'",
                params.attribute_key
            ))
        })?;

        let desired_counts = params
            .desired_values
            .iter()
            .filter_map(|(value, &count)| {
                attr_val_to_idx[attr_idx]
                    .get(value)
                    .copied()
                    .map(|vidx| (vidx, count))
            })
            .collect::<Vec<_>>();

        let sessions = match &params.sessions {
            None => None,
            Some(list) => {
                let mut s = list.iter().map(|&x| x as usize).collect::<Vec<_>>();
                s.sort_unstable();
                s.dedup();
                for &sidx in &s {
                    if sidx >= num_sessions {
                        return Err(SolverError::ValidationError(format!(
                            "AttributeBalance: session {} out of range",
                            sidx
                        )));
                    }
                }
                Some(s)
            }
        };

        let cidx = constraints.len();
        constraints.push(CompiledAttributeBalanceConstraint {
            target_group_indices: target_group_indices.clone(),
            attr_idx,
            desired_counts,
            penalty_weight: params.penalty_weight,
            mode: params.mode,
            sessions: sessions.clone(),
        });

        let active_sessions: Vec<usize> = match &sessions {
            None => (0..num_sessions).collect(),
            Some(s) => s.clone(),
        };
        for sidx in active_sessions {
            for &gidx in &target_group_indices {
                let slot = sidx * num_groups + gidx;
                by_group_session[slot].push(cidx);
            }
        }
    }

    Ok((constraints, by_group_session))
}

fn compile_repeat_encounter(
    input: &ApiInput,
) -> Result<Option<CompiledRepeatEncounterConstraint>, SolverError> {
    let repeat_constraints = input
        .constraints
        .iter()
        .filter_map(|c| match c {
            Constraint::RepeatEncounter(p) => Some(p),
            _ => None,
        })
        .collect::<Vec<_>>();

    if repeat_constraints.len() > 1 {
        return Err(SolverError::ValidationError(
            "at most one RepeatEncounter constraint is supported".into(),
        ));
    }

    let Some(params) = repeat_constraints.first() else {
        return Ok(None);
    };

    Ok(Some(CompiledRepeatEncounterConstraint {
        max_allowed_encounters: params.max_allowed_encounters,
        penalty_weight: params.penalty_weight,
        penalty_function: RepeatPenaltyFunction::parse(&params.penalty_function)?,
    }))
}

#[allow(clippy::type_complexity)]
fn build_attribute_indexes(
    input: &ApiInput,
) -> Result<
    (
        HashMap<String, usize>,
        Vec<String>,
        Vec<HashMap<String, usize>>,
        Vec<Vec<String>>,
        Vec<Vec<Option<usize>>>,
    ),
    SolverError,
> {
    let mut attr_key_to_idx: HashMap<String, usize> = HashMap::new();
    let mut attr_idx_to_key: Vec<String> = Vec::new();
    let mut attr_val_to_idx: Vec<HashMap<String, usize>> = Vec::new();
    let mut attr_idx_to_val: Vec<Vec<String>> = Vec::new();

    // Seed from constraint references first (ensures constraint-referenced keys are indexed).
    for constraint in &input.constraints {
        if let Constraint::AttributeBalance(params) = constraint {
            if !attr_key_to_idx.contains_key(&params.attribute_key) {
                let idx = attr_idx_to_key.len();
                attr_key_to_idx.insert(params.attribute_key.clone(), idx);
                attr_idx_to_key.push(params.attribute_key.clone());
                attr_val_to_idx.push(HashMap::new());
                attr_idx_to_val.push(Vec::new());
            }
        }
    }

    // Add any additional attribute keys from people.
    for person in &input.problem.people {
        for key in person.attributes.keys() {
            if !attr_key_to_idx.contains_key(key) {
                let idx = attr_idx_to_key.len();
                attr_key_to_idx.insert(key.clone(), idx);
                attr_idx_to_key.push(key.clone());
                attr_val_to_idx.push(HashMap::new());
                attr_idx_to_val.push(Vec::new());
            }
        }
    }

    // Index attribute values.
    for person in &input.problem.people {
        for (key, value) in &person.attributes {
            let Some(&aidx) = attr_key_to_idx.get(key) else {
                continue;
            };
            let value_map = &mut attr_val_to_idx[aidx];
            if !value_map.contains_key(value) {
                let vidx = value_map.len();
                value_map.insert(value.clone(), vidx);
                attr_idx_to_val[aidx].push(value.clone());
            }
        }
    }

    let num_attrs = attr_key_to_idx.len();
    let mut person_attribute_value_indices =
        vec![vec![None::<usize>; num_attrs]; input.problem.people.len()];
    for (pidx, person) in input.problem.people.iter().enumerate() {
        for (key, value) in &person.attributes {
            let Some(&aidx) = attr_key_to_idx.get(key) else {
                continue;
            };
            if let Some(&vidx) = attr_val_to_idx[aidx].get(value) {
                person_attribute_value_indices[pidx][aidx] = Some(vidx);
            }
        }
    }

    Ok((
        attr_key_to_idx,
        attr_idx_to_key,
        attr_val_to_idx,
        attr_idx_to_val,
        person_attribute_value_indices,
    ))
}

// ---------------------------------------------------------------------------
// Shared small helpers
// ---------------------------------------------------------------------------

fn build_pair_adjacency<T, F>(num_people: usize, constraints: &[T], people_of: F) -> Vec<Vec<usize>>
where
    F: Fn(&T) -> (usize, usize),
{
    let mut adj = vec![Vec::new(); num_people];
    for (cidx, constraint) in constraints.iter().enumerate() {
        let (a, b) = people_of(constraint);
        adj[a].push(cidx);
        adj[b].push(cidx);
    }
    adj
}

fn normalize_session_list(
    sessions: &Option<Vec<u32>>,
    num_sessions: usize,
) -> Result<Option<Vec<usize>>, SolverError> {
    let Some(list) = sessions else {
        return Ok(None);
    };
    let mut normalized = list.iter().map(|&s| s as usize).collect::<Vec<_>>();
    normalized.sort_unstable();
    normalized.dedup();
    for &s in &normalized {
        if s >= num_sessions {
            return Err(SolverError::ValidationError(format!(
                "session {} out of range (max {})",
                s,
                num_sessions.saturating_sub(1)
            )));
        }
    }
    Ok(Some(normalized))
}

fn sessions_overlap(left: Option<&[usize]>, right: Option<&[usize]>) -> bool {
    match (left, right) {
        (None, _) | (_, None) => true,
        (Some(l), Some(r)) => l.iter().any(|s| r.contains(s)),
    }
}

// ---------------------------------------------------------------------------
// DSU (union-find) for clique detection
// ---------------------------------------------------------------------------

struct Dsu {
    parent: Vec<usize>,
    rank: Vec<usize>,
}

impl Dsu {
    fn new(n: usize) -> Self {
        Self {
            parent: (0..n).collect(),
            rank: vec![0; n],
        }
    }

    fn find(&mut self, x: usize) -> usize {
        if self.parent[x] != x {
            let p = self.parent[x];
            self.parent[x] = self.find(p);
        }
        self.parent[x]
    }

    fn union(&mut self, a: usize, b: usize) {
        let ra = self.find(a);
        let rb = self.find(b);
        if ra == rb {
            return;
        }
        if self.rank[ra] < self.rank[rb] {
            self.parent[ra] = rb;
        } else if self.rank[ra] > self.rank[rb] {
            self.parent[rb] = ra;
        } else {
            self.parent[rb] = ra;
            self.rank[ra] += 1;
        }
    }
}
