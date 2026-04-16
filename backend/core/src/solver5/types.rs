#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(super) struct PersonIdx(pub(super) usize);

impl PersonIdx {
    pub(super) fn raw(self) -> usize {
        self.0
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Block {
    members: Vec<PersonIdx>,
}

impl Block {
    pub(super) fn new(members: Vec<PersonIdx>) -> Self {
        Self { members }
    }

    pub(super) fn members(&self) -> &[PersonIdx] {
        &self.members
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct WeekSchedule {
    blocks: Vec<Block>,
}

impl WeekSchedule {
    pub(super) fn new(blocks: Vec<Block>) -> Self {
        Self { blocks }
    }

    pub(super) fn blocks(&self) -> &[Block] {
        &self.blocks
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Schedule {
    weeks: Vec<WeekSchedule>,
}

impl Schedule {
    pub(super) fn new(weeks: Vec<WeekSchedule>) -> Self {
        Self { weeks }
    }

    pub(super) fn from_raw(raw: Vec<Vec<Vec<usize>>>) -> Self {
        Self::new(
            raw.into_iter()
                .map(|week| {
                    WeekSchedule::new(
                        week.into_iter()
                            .map(|block| {
                                Block::new(block.into_iter().map(PersonIdx).collect())
                            })
                            .collect(),
                    )
                })
                .collect(),
        )
    }

    pub(super) fn len(&self) -> usize {
        self.weeks.len()
    }

    pub(super) fn truncate(&mut self, num_weeks: usize) {
        self.weeks.truncate(num_weeks);
    }

    pub(super) fn extend(&mut self, mut other: Schedule) {
        self.weeks.append(&mut other.weeks);
    }

    pub(super) fn weeks(&self) -> &[WeekSchedule] {
        &self.weeks
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ConstructionFamilyId {
    RoundRobin,
    TransversalDesignPrimePower,
    AffinePlanePrimePower,
    Kirkman6TPlus1,
}

impl ConstructionFamilyId {
    pub(super) fn label(self) -> &'static str {
        match self {
            Self::RoundRobin => "round_robin",
            Self::TransversalDesignPrimePower => "transversal_design_prime_power",
            Self::AffinePlanePrimePower => "affine_plane_prime_power",
            Self::Kirkman6TPlus1 => "kirkman_6t_plus_1",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum CompositionOperatorId {
    RecursiveTransversalLift,
}

impl CompositionOperatorId {
    pub(super) fn label(self) -> &'static str {
        match self {
            Self::RecursiveTransversalLift => "recursive_transversal_lift",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct ConstructionProvenance {
    pub(super) base_family: ConstructionFamilyId,
    pub(super) operators: Vec<CompositionOperatorId>,
}

impl ConstructionProvenance {
    fn for_family(base_family: ConstructionFamilyId) -> Self {
        Self {
            base_family,
            operators: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum ConstructionSpan {
    Full,
    Prefix { requested_weeks: usize },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct ConstructionResult {
    pub(super) schedule: Schedule,
    pub(super) family: ConstructionFamilyId,
    pub(super) max_supported_weeks: usize,
    pub(super) span: ConstructionSpan,
    pub(super) provenance: ConstructionProvenance,
}

impl ConstructionResult {
    pub(super) fn new(schedule: Schedule, family: ConstructionFamilyId) -> Self {
        let max_supported_weeks = schedule.len();
        Self {
            schedule,
            family,
            max_supported_weeks,
            span: ConstructionSpan::Full,
            provenance: ConstructionProvenance::for_family(family),
        }
    }

    pub(super) fn add_operator(mut self, operator: CompositionOperatorId) -> Self {
        self.provenance.operators.push(operator);
        self
    }

    pub(super) fn truncate_to_requested(mut self, requested_weeks: usize) -> Option<Self> {
        if requested_weeks > self.max_supported_weeks {
            return None;
        }
        if requested_weeks < self.max_supported_weeks {
            self.schedule.truncate(requested_weeks);
            self.span = ConstructionSpan::Prefix { requested_weeks };
        }
        Some(self)
    }
}
