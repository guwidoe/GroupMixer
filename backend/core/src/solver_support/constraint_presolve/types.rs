use crate::solver3::compiled_problem::CompiledProblem;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PresolvedConstraintModel {
    pub(crate) clique_components: Vec<PresolvedCliqueComponent>,
    /// `[session_idx * num_people + person_idx] -> clique component index`.
    pub(crate) clique_component_by_person_session: Vec<Option<usize>>,
    /// Explicit immovables plus placements implied by clique components that contain an immovable
    /// participant in the same active session.
    pub(crate) effective_immovable_assignments: Vec<EffectiveImmovableAssignment>,
    /// Hard-apart constraints lifted from raw people to per-session clique/singleton units.
    pub(crate) hard_apart_units: Vec<PresolvedHardApartUnitConstraint>,
}

impl PresolvedConstraintModel {
    pub(crate) fn is_shape_compatible(&self, compiled: &CompiledProblem) -> bool {
        let expected_slots = compiled.num_sessions * compiled.num_people;
        self.clique_component_by_person_session.len() == expected_slots
            && self
                .clique_components
                .iter()
                .all(|component| component.is_shape_compatible(compiled))
            && self
                .effective_immovable_assignments
                .iter()
                .all(|assignment| {
                    assignment.person_idx < compiled.num_people
                        && assignment.session_idx < compiled.num_sessions
                        && assignment.group_idx < compiled.num_groups
                        && assignment.source.is_shape_compatible(compiled)
                })
            && self
                .hard_apart_units
                .iter()
                .all(|constraint| constraint.is_shape_compatible(compiled))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PresolvedCliqueComponent {
    pub(crate) component_idx: usize,
    pub(crate) members: Vec<usize>,
    /// `None` means active in every session, matching `CompiledClique` semantics.
    pub(crate) sessions: Option<Vec<usize>>,
    /// `[session_idx] -> required group if this component is anchored by an explicit immovable in
    /// that session.
    pub(crate) anchored_group_by_session: Vec<Option<usize>>,
}

impl PresolvedCliqueComponent {
    pub(crate) fn is_shape_compatible(&self, compiled: &CompiledProblem) -> bool {
        self.component_idx < compiled.cliques.len()
            && self
                .members
                .iter()
                .all(|&person_idx| person_idx < compiled.num_people)
            && self
                .sessions
                .as_ref()
                .map(|sessions| {
                    sessions
                        .iter()
                        .all(|&session_idx| session_idx < compiled.num_sessions)
                })
                .unwrap_or(true)
            && self.anchored_group_by_session.len() == compiled.num_sessions
            && self
                .anchored_group_by_session
                .iter()
                .flatten()
                .all(|&group_idx| group_idx < compiled.num_groups)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct EffectiveImmovableAssignment {
    pub(crate) person_idx: usize,
    pub(crate) session_idx: usize,
    pub(crate) group_idx: usize,
    pub(crate) source: EffectiveImmovableSource,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum EffectiveImmovableSource {
    Explicit,
    CliqueComponent {
        component_idx: usize,
        anchor_person_idx: usize,
    },
}

impl EffectiveImmovableSource {
    pub(crate) fn is_shape_compatible(&self, compiled: &CompiledProblem) -> bool {
        match self {
            Self::Explicit => true,
            Self::CliqueComponent {
                component_idx,
                anchor_person_idx,
            } => {
                *component_idx < compiled.cliques.len() && *anchor_person_idx < compiled.num_people
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum PresolvedConstraintUnit {
    Person(usize),
    CliqueComponent(usize),
}

impl PresolvedConstraintUnit {
    pub(crate) fn is_shape_compatible(self, compiled: &CompiledProblem) -> bool {
        match self {
            Self::Person(person_idx) => person_idx < compiled.num_people,
            Self::CliqueComponent(component_idx) => component_idx < compiled.cliques.len(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct PresolvedHardApartUnitConstraint {
    pub(crate) session_idx: usize,
    pub(crate) left: PresolvedConstraintUnit,
    pub(crate) right: PresolvedConstraintUnit,
}

impl PresolvedHardApartUnitConstraint {
    pub(crate) fn is_shape_compatible(self, compiled: &CompiledProblem) -> bool {
        self.session_idx < compiled.num_sessions
            && self.left.is_shape_compatible(compiled)
            && self.right.is_shape_compatible(compiled)
            && self.left != self.right
    }
}
