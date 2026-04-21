use super::{
    validate_full_schedule_shape, ExactBlockSeed, ExactBlockSeedDiagnostics, SeedAtomId,
    SeedAtomUsage, SeedPairTelemetry, SeedRelabelingSummary,
};
use crate::models::{ApiInput, Solver6PairRepeatPenaltyModel, SolverParams};
use crate::solver5::atoms::{
    query_construction_atom_from_solver6_input, Solver5AtomSpanRequest, Solver5ConstructionAtom,
};
use crate::solver6::problem::PureSgpProblem;
use crate::solver_support::SolverError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SeedPermutation {
    image_by_person: Vec<usize>,
}

impl SeedPermutation {
    pub(crate) fn identity(num_people: usize) -> Self {
        Self {
            image_by_person: (0..num_people).collect(),
        }
    }

    pub(crate) fn from_image(image_by_person: Vec<usize>) -> Result<Self, SolverError> {
        if image_by_person.len() < 2 {
            return Err(SolverError::ValidationError(
                "solver6 seed permutation requires at least two people".into(),
            ));
        }

        let mut seen_targets = vec![false; image_by_person.len()];
        for (source, &target) in image_by_person.iter().enumerate() {
            if target >= image_by_person.len() {
                return Err(SolverError::ValidationError(format!(
                    "solver6 seed permutation maps person {source} out of bounds to {target}"
                )));
            }
            if seen_targets[target] {
                return Err(SolverError::ValidationError(format!(
                    "solver6 seed permutation is not bijective; target {target} appears more than once"
                )));
            }
            seen_targets[target] = true;
        }

        Ok(Self { image_by_person })
    }

    pub(crate) fn apply(&self, person_idx: usize) -> Result<usize, SolverError> {
        self.image_by_person.get(person_idx).copied().ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver6 seed permutation received out-of-bounds person index {person_idx}"
            ))
        })
    }

    pub(crate) fn len(&self) -> usize {
        self.image_by_person.len()
    }

    pub(crate) fn changed_people(&self) -> usize {
        self.image_by_person
            .iter()
            .enumerate()
            .filter(|(source, target)| *source != **target)
            .count()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExactBlockRelabelingPlan {
    pub copy_permutations: Vec<SeedPermutation>,
}

impl ExactBlockRelabelingPlan {
    pub(crate) fn identity(copy_count: usize, num_people: usize) -> Self {
        Self {
            copy_permutations: (0..copy_count)
                .map(|_| SeedPermutation::identity(num_people))
                .collect(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExactBlockRelabelingObjective {
    pub copy_count: usize,
    pub atom_weeks: usize,
    pub active_penalty_model: Solver6PairRepeatPenaltyModel,
    pub pair_telemetry: SeedPairTelemetry,
}

impl ExactBlockRelabelingObjective {
    pub(crate) fn active_penalty_score(&self) -> u64 {
        self.pair_telemetry.active_penalty_score
    }

    pub(crate) fn linear_repeat_lower_bound_gap(&self) -> u64 {
        self.pair_telemetry.linear_repeat_lower_bound_gap
    }

    pub(crate) fn reaches_linear_lower_bound(&self) -> bool {
        self.linear_repeat_lower_bound_gap() == 0
    }
}

pub(crate) fn build_identity_exact_block_seed(
    input: &ApiInput,
) -> Result<ExactBlockSeed, SolverError> {
    let context = ExactBlockCompositionContext::for_input(input)?;
    let plan = ExactBlockRelabelingPlan::identity(context.full_copies, context.num_people());
    build_exact_block_seed_from_plan(input, &plan)
}

pub(crate) fn build_exact_block_seed_from_plan(
    input: &ApiInput,
    plan: &ExactBlockRelabelingPlan,
) -> Result<ExactBlockSeed, SolverError> {
    let context = ExactBlockCompositionContext::for_input(input)?;
    context.validate_plan(plan)?;

    let atom_id = SeedAtomId::from_solver5_atom(&context.atom);
    let mut schedule = Vec::with_capacity(context.problem.num_weeks);
    let mut atom_uses = Vec::with_capacity(context.full_copies);

    for (copy_index, permutation) in plan.copy_permutations.iter().enumerate() {
        let week_range_start = schedule.len();
        schedule.extend(context.atom.schedule.iter().map(|week| {
            week.iter()
                .map(|block| {
                    block.iter()
                        .map(|person_idx| permutation.apply(*person_idx))
                        .collect::<Result<Vec<_>, _>>()
                })
                .collect::<Result<Vec<_>, _>>()
        }).collect::<Result<Vec<_>, _>>()?);

        let relabeling = if permutation.changed_people() == 0 {
            SeedRelabelingSummary::identity()
        } else {
            SeedRelabelingSummary::explicit_permutation(permutation.changed_people())
        };
        atom_uses.push(SeedAtomUsage::new(
            atom_id.clone(),
            copy_index,
            context.atom_weeks,
            week_range_start,
            week_range_start + context.atom_weeks,
            relabeling,
        ));
    }

    validate_full_schedule_shape(&context.problem, &schedule)?;
    let pair_telemetry = SeedPairTelemetry::from_schedule(
        context.num_people(),
        &schedule,
        context.active_penalty_model,
    )?;

    Ok(ExactBlockSeed {
        schedule,
        diagnostics: ExactBlockSeedDiagnostics {
            total_weeks: context.problem.num_weeks,
            atom_uses,
            pair_telemetry: Some(pair_telemetry),
        },
    })
}

pub(crate) fn evaluate_exact_block_relabeling_objective(
    input: &ApiInput,
    plan: &ExactBlockRelabelingPlan,
) -> Result<ExactBlockRelabelingObjective, SolverError> {
    let context = ExactBlockCompositionContext::for_input(input)?;
    let seed = build_exact_block_seed_from_plan(input, plan)?;
    let pair_telemetry = seed.diagnostics.pair_telemetry.clone().ok_or_else(|| {
        SolverError::ValidationError(
            "solver6 exact-block relabeling objective expected pair telemetry on composed seed"
                .into(),
        )
    })?;

    Ok(ExactBlockRelabelingObjective {
        copy_count: context.full_copies,
        atom_weeks: context.atom_weeks,
        active_penalty_model: context.active_penalty_model,
        pair_telemetry,
    })
}

struct ExactBlockCompositionContext {
    problem: PureSgpProblem,
    atom: Solver5ConstructionAtom,
    atom_weeks: usize,
    full_copies: usize,
    active_penalty_model: Solver6PairRepeatPenaltyModel,
}

impl ExactBlockCompositionContext {
    fn for_input(input: &ApiInput) -> Result<Self, SolverError> {
        let problem = PureSgpProblem::from_input(input)?;
        let atom = query_construction_atom_from_solver6_input(
            input,
            Solver5AtomSpanRequest::BestAvailableFullSpan,
        )?;
        let atom_weeks = atom.returned_weeks();
        if atom_weeks == 0 {
            return Err(SolverError::ValidationError(
                "solver6 exact-block seed builder received an empty solver5 atom".into(),
            ));
        }
        if atom_weeks > problem.num_weeks {
            return Err(SolverError::ValidationError(format!(
                "solver6 identity exact-block seed builder expected a best available atom no longer than the requested horizon, but got {} weeks for requested {}",
                atom_weeks, problem.num_weeks
            )));
        }

        let full_copies = problem.num_weeks / atom_weeks;
        let remainder = problem.num_weeks % atom_weeks;
        if remainder != 0 {
            return Err(SolverError::ValidationError(format!(
                "solver6 identity exact-block seed builder currently supports only k * w0 tilings; requested {} weeks with best solver5 atom span {} leaves remainder {}",
                problem.num_weeks, atom_weeks, remainder
            )));
        }

        let active_penalty_model = match &input.solver.solver_params {
            SolverParams::Solver6(params) => params.pair_repeat_penalty_model,
            _ => {
                return Err(SolverError::ValidationError(
                    "solver6 identity exact-block seed builder expected solver6 params".into(),
                ));
            }
        };

        Ok(Self {
            problem,
            atom,
            atom_weeks,
            full_copies,
            active_penalty_model,
        })
    }

    fn num_people(&self) -> usize {
        self.problem.num_groups * self.problem.group_size
    }

    fn validate_plan(&self, plan: &ExactBlockRelabelingPlan) -> Result<(), SolverError> {
        if plan.copy_permutations.len() != self.full_copies {
            return Err(SolverError::ValidationError(format!(
                "solver6 exact-block relabeling plan expected {} copy permutations, got {}",
                self.full_copies,
                plan.copy_permutations.len()
            )));
        }

        for (copy_index, permutation) in plan.copy_permutations.iter().enumerate() {
            if permutation.len() != self.num_people() {
                return Err(SolverError::ValidationError(format!(
                    "solver6 exact-block relabeling permutation {copy_index} has size {}, expected {}",
                    permutation.len(),
                    self.num_people()
                )));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_exact_block_seed_from_plan, evaluate_exact_block_relabeling_objective,
        ExactBlockRelabelingPlan, SeedPermutation,
    };
    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition,
        RepeatEncounterParams, Solver6PairRepeatPenaltyModel, Solver6Params,
        SolverConfiguration, SolverKind, SolverParams, StopConditions,
    };
    use std::collections::HashMap;

    fn solver6_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: SolverKind::Solver6.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(1_000_000),
                time_limit_seconds: Some(30),
                no_improvement_iterations: Some(100_000),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver6(Solver6Params {
                exact_construction_handoff_enabled: true,
                seed_strategy: Default::default(),
                pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
                search_strategy: Default::default(),
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(7),
            move_policy: None,
            allowed_sessions: None,
        }
    }

    fn pure_input(groups: usize, group_size: usize, weeks: usize) -> ApiInput {
        ApiInput {
            problem: ProblemDefinition {
                people: (0..(groups * group_size))
                    .map(|idx| Person {
                        id: format!("p{idx}"),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: (0..groups)
                    .map(|idx| Group {
                        id: format!("g{idx}"),
                        size: group_size as u32,
                        session_sizes: None,
                    })
                    .collect(),
                num_sessions: weeks as u32,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "squared".into(),
                penalty_weight: 100.0,
            })],
            solver: solver6_config(),
        }
    }

    fn shift_15_mod_31_fix_31() -> SeedPermutation {
        let mut image_by_person = Vec::with_capacity(32);
        for person_idx in 0..31 {
            image_by_person.push((person_idx + 15) % 31);
        }
        image_by_person.push(31);
        SeedPermutation::from_image(image_by_person).expect("affine permutation should be valid")
    }

    #[test]
    fn relabeling_objective_matches_identity_seed_baseline() {
        let input = pure_input(8, 4, 20);
        let identity_plan = ExactBlockRelabelingPlan {
            copy_permutations: vec![SeedPermutation::identity(32), SeedPermutation::identity(32)],
        };

        let objective = evaluate_exact_block_relabeling_objective(&input, &identity_plan)
            .expect("identity relabeling objective should evaluate");
        assert_eq!(objective.copy_count, 2);
        assert_eq!(objective.atom_weeks, 10);
        assert_eq!(objective.active_penalty_score(), 480);
        assert_eq!(objective.linear_repeat_lower_bound_gap(), 16);
        assert!(!objective.reaches_linear_lower_bound());
    }

    #[test]
    fn relabeling_objective_can_compare_candidate_without_local_search() {
        let input = pure_input(8, 4, 20);
        let identity = evaluate_exact_block_relabeling_objective(
            &input,
            &ExactBlockRelabelingPlan {
                copy_permutations: vec![
                    SeedPermutation::identity(32),
                    SeedPermutation::identity(32),
                ],
            },
        )
        .expect("identity objective should evaluate");
        let candidate = evaluate_exact_block_relabeling_objective(
            &input,
            &ExactBlockRelabelingPlan {
                copy_permutations: vec![SeedPermutation::identity(32), shift_15_mod_31_fix_31()],
            },
        )
        .expect("candidate objective should evaluate");

        assert_eq!(identity.active_penalty_score(), 480);
        assert_eq!(candidate.active_penalty_score(), 464);
        assert!(candidate.active_penalty_score() < identity.active_penalty_score());
        assert_eq!(candidate.linear_repeat_lower_bound_gap(), 0);
        assert!(candidate.reaches_linear_lower_bound());
    }

    #[test]
    fn explicit_relabeling_seed_marks_non_identity_copy_in_diagnostics() {
        let input = pure_input(8, 4, 20);
        let seed = build_exact_block_seed_from_plan(
            &input,
            &ExactBlockRelabelingPlan {
                copy_permutations: vec![SeedPermutation::identity(32), shift_15_mod_31_fix_31()],
            },
        )
        .expect("explicit relabeling plan should compose a valid seed");

        assert_eq!(seed.diagnostics.atom_uses[0].relabeling.kind.label(), "identity");
        assert_eq!(
            seed.diagnostics.atom_uses[1].relabeling.kind.label(),
            "explicit_permutation"
        );
        assert_eq!(seed.diagnostics.atom_uses[1].relabeling.changed_people, 31);
        assert_eq!(
            seed.diagnostics
                .pair_telemetry
                .as_ref()
                .expect("telemetry should be present")
                .linear_repeat_lower_bound_gap,
            0
        );
    }
}
