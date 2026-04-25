use crate::models::PairMeetingMode;
use crate::solver3::compiled_problem::CompiledProblem;

use super::super::types::OracleTemplateCandidate;

#[derive(Debug, Clone, PartialEq)]
pub(super) struct ProjectionAtomSet {
    pub(super) atoms: Vec<ProjectionAtom>,
}

impl ProjectionAtomSet {
    pub(super) fn is_shape_compatible(
        &self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> bool {
        self.atoms
            .iter()
            .all(|atom| atom.is_shape_compatible(compiled, candidate))
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(super) enum ProjectionAtom {
    Clique(CliqueProjectionAtom),
    HardApart(HardApartProjectionAtom),
    AttributeBalance(AttributeBalanceProjectionAtom),
    ImmovableTriple(ImmovableTripleProjectionAtom),
    PairMeeting(PairMeetingProjectionAtom),
    SoftApart(SoftPairProjectionAtom),
    ShouldTogether(SoftPairProjectionAtom),
    Capacity(CapacityProjectionAtom),
}

impl ProjectionAtom {
    fn is_shape_compatible(
        &self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> bool {
        match self {
            Self::Clique(atom) => atom.is_shape_compatible(compiled, candidate),
            Self::HardApart(atom) => atom.is_shape_compatible(compiled, candidate),
            Self::AttributeBalance(atom) => atom.is_shape_compatible(compiled, candidate),
            Self::ImmovableTriple(atom) => atom.is_shape_compatible(compiled, candidate),
            Self::PairMeeting(atom) => atom.is_shape_compatible(compiled, candidate),
            Self::SoftApart(atom) | Self::ShouldTogether(atom) => {
                atom.is_shape_compatible(compiled, candidate)
            }
            Self::Capacity(atom) => atom.is_shape_compatible(compiled, candidate),
        }
    }
}

/// A real MustStayTogether clique can map to any same-size subset of the oracle people in this
/// group pool. Real clique-member order and oracle-person order are both deliberately free.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct CliqueProjectionAtom {
    pub(super) clique_idx: usize,
    pub(super) real_people: Vec<usize>,
    pub(super) real_sessions: Vec<usize>,
    pub(super) oracle_session_pos: usize,
    pub(super) oracle_group_idx: usize,
    pub(super) oracle_people_pool: Vec<usize>,
    pub(super) required_people_count: usize,
}

impl CliqueProjectionAtom {
    fn is_shape_compatible(
        &self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> bool {
        self.real_people.iter().all(|&p| p < compiled.num_people)
            && self
                .real_sessions
                .iter()
                .all(|&s| s < compiled.num_sessions)
            && self.oracle_session_pos < candidate.num_sessions()
            && self.oracle_group_idx < candidate.num_groups
            && self
                .oracle_people_pool
                .iter()
                .all(|&p| p < candidate.oracle_capacity)
            && self.required_people_count == self.real_people.len()
            && self.oracle_people_pool.len() >= self.required_people_count
    }
}

/// A real hard-apart pair can map to this unordered oracle pair across the real/oracle session
/// sets. The two real people and the two oracle people remain permutation-free until
/// reconciliation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct HardApartProjectionAtom {
    pub(super) constraint_idx: usize,
    pub(super) real_people: [usize; 2],
    pub(super) real_sessions: Vec<usize>,
    pub(super) oracle_people: [usize; 2],
    pub(super) oracle_session_positions: Vec<usize>,
}

impl HardApartProjectionAtom {
    fn is_shape_compatible(
        &self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> bool {
        self.real_people.iter().all(|&p| p < compiled.num_people)
            && self
                .real_sessions
                .iter()
                .all(|&s| s < compiled.num_sessions)
            && self
                .oracle_people
                .iter()
                .all(|&p| p < candidate.oracle_capacity)
            && self
                .oracle_session_positions
                .iter()
                .all(|&s| s < candidate.num_sessions())
    }
}

/// A real group/session AttributeBalance demand can map to this oracle group slot. It does not
/// bind individual people yet; it records an attribute multiset requirement over the oracle group
/// member slots.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct AttributeBalanceProjectionAtom {
    pub(super) constraint_idx: usize,
    pub(super) real_session: usize,
    pub(super) real_group: usize,
    pub(super) oracle_session_pos: usize,
    pub(super) oracle_group_idx: usize,
    pub(super) oracle_people: Vec<usize>,
    pub(super) attr_idx: usize,
    pub(super) desired_counts: Vec<(usize, u32)>,
    pub(super) penalty_weight: f64,
}

impl AttributeBalanceProjectionAtom {
    fn is_shape_compatible(
        &self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> bool {
        self.real_session < compiled.num_sessions
            && self.real_group < compiled.num_groups
            && self.oracle_session_pos < candidate.num_sessions()
            && self.oracle_group_idx < candidate.num_groups
            && self.attr_idx < compiled.attr_idx_to_val.len()
            && self
                .oracle_people
                .iter()
                .all(|&p| p < candidate.oracle_capacity)
            && self.desired_counts.iter().all(|&(value_idx, _)| {
                value_idx
                    < compiled
                        .attr_idx_to_val
                        .get(self.attr_idx)
                        .map_or(0, Vec::len)
            })
    }
}

/// Immovable constraints are coupled triples. This atom never treats person, session, or group as
/// independent anchors; it only says the real triple may map to this oracle placement triple.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ImmovableTripleProjectionAtom {
    pub(super) constraint_idx: usize,
    pub(super) real_person: usize,
    pub(super) real_session: usize,
    pub(super) real_group: usize,
    pub(super) oracle_person: usize,
    pub(super) oracle_session_pos: usize,
    pub(super) oracle_group_idx: usize,
}

impl ImmovableTripleProjectionAtom {
    fn is_shape_compatible(
        &self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> bool {
        self.real_person < compiled.num_people
            && self.real_session < compiled.num_sessions
            && self.real_group < compiled.num_groups
            && self.oracle_person < candidate.oracle_capacity
            && self.oracle_session_pos < candidate.num_sessions()
            && self.oracle_group_idx < candidate.num_groups
    }
}

/// A real pair-meeting constraint maps to an unordered oracle pair plus a set of oracle sessions
/// whose induced meeting count approximates the requested mode/target.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct PairMeetingProjectionAtom {
    pub(super) constraint_idx: usize,
    pub(super) real_people: [usize; 2],
    pub(super) real_sessions: Vec<usize>,
    pub(super) oracle_people: [usize; 2],
    pub(super) oracle_session_positions: Vec<usize>,
    pub(super) target_meetings: u32,
    pub(super) oracle_meetings: u32,
    pub(super) mode: PairMeetingMode,
    pub(super) penalty_weight: f64,
    pub(super) projected_penalty: f64,
}

impl PairMeetingProjectionAtom {
    fn is_shape_compatible(
        &self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> bool {
        self.real_people.iter().all(|&p| p < compiled.num_people)
            && self
                .real_sessions
                .iter()
                .all(|&s| s < compiled.num_sessions)
            && self
                .oracle_people
                .iter()
                .all(|&p| p < candidate.oracle_capacity)
            && self
                .oracle_session_positions
                .iter()
                .all(|&s| s < candidate.num_sessions())
    }
}

/// Soft pair constraints use the same unordered pair/session-set shape but remain scored rather
/// than required during reconciliation.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct SoftPairProjectionAtom {
    pub(super) constraint_idx: usize,
    pub(super) real_people: [usize; 2],
    pub(super) real_sessions: Vec<usize>,
    pub(super) oracle_people: [usize; 2],
    pub(super) oracle_session_positions: Vec<usize>,
    pub(super) penalty_weight: f64,
    pub(super) oracle_meetings: u32,
    pub(super) prefers_together: bool,
}

impl SoftPairProjectionAtom {
    fn is_shape_compatible(
        &self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> bool {
        self.real_people.iter().all(|&p| p < compiled.num_people)
            && self
                .real_sessions
                .iter()
                .all(|&s| s < compiled.num_sessions)
            && self
                .oracle_people
                .iter()
                .all(|&p| p < candidate.oracle_capacity)
            && self
                .oracle_session_positions
                .iter()
                .all(|&s| s < candidate.num_sessions())
    }
}

/// Capacity atoms expose asymmetries caused by non-uniform real group/session capacities. Uniform
/// SGP capacities generate no useful symmetry breaking and are skipped.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct CapacityProjectionAtom {
    pub(super) real_session: usize,
    pub(super) real_group: usize,
    pub(super) oracle_session_pos: usize,
    pub(super) oracle_group_idx: usize,
    pub(super) real_capacity: usize,
    pub(super) oracle_group_size: usize,
}

impl CapacityProjectionAtom {
    fn is_shape_compatible(
        &self,
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> bool {
        self.real_session < compiled.num_sessions
            && self.real_group < compiled.num_groups
            && self.oracle_session_pos < candidate.num_sessions()
            && self.oracle_group_idx < candidate.num_groups
    }
}
