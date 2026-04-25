use super::problem::PureSgpProblem;
use super::result::build_solver_result;
use super::router::{
    attempt_construction, best_available_construction, closest_supporting_construction,
};
use super::types::{ConstructionResult, Schedule};
use crate::models::{
    ApiInput, Solver5Params, SolverConfiguration, SolverKind, SolverParams, SolverResult,
};
use crate::solver_support::SolverError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Solver5AtomSpanRequest {
    RequestedSpan,
    BestAvailableFullSpan,
    ClosestSupportingSpan,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Solver5ConstructionAtomSpan {
    Full,
    Prefix {
        requested_weeks: usize,
        max_supported_weeks: usize,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Solver5ConstructionAtom {
    pub requested_weeks: usize,
    pub max_supported_weeks: usize,
    pub span: Solver5ConstructionAtomSpan,
    pub schedule: Vec<Vec<Vec<usize>>>,
    pub family_label: String,
    pub operator_labels: Vec<String>,
    pub quality_label: String,
    pub evidence_citations: Vec<String>,
    pub residual_label: Option<String>,
}

impl Solver5ConstructionAtom {
    pub fn covers_requested_weeks(&self) -> bool {
        self.max_supported_weeks >= self.requested_weeks
    }

    pub fn returned_weeks(&self) -> usize {
        self.schedule.len()
    }
}

pub fn query_construction_atom(
    input: &ApiInput,
    span_request: Solver5AtomSpanRequest,
) -> Result<Solver5ConstructionAtom, SolverError> {
    let problem = PureSgpProblem::from_input(input)?;
    match &input.solver.solver_params {
        SolverParams::Solver5(_) => {}
        _ => {
            return Err(SolverError::ValidationError(
                "solver5 atom query expected solver5 params after solver selection validation"
                    .into(),
            ));
        }
    }

    query_atom_for_problem(input, &problem, span_request)
}

pub(crate) fn query_construction_atom_from_solver6_input(
    input: &ApiInput,
    span_request: Solver5AtomSpanRequest,
) -> Result<Solver5ConstructionAtom, SolverError> {
    let bridged_input = bridged_solver5_input(input);
    query_construction_atom(&bridged_input, span_request)
}

pub(crate) fn build_solver_result_from_atom_for_solver6_input(
    input: &ApiInput,
    atom: &Solver5ConstructionAtom,
) -> Result<SolverResult, SolverError> {
    let bridged_input = bridged_solver5_input(input);
    let problem = PureSgpProblem::from_input(&bridged_input)?;
    let schedule = Schedule::from_raw(atom.schedule.clone());
    build_solver_result(
        &bridged_input,
        &problem,
        &schedule,
        bridged_input.solver.seed.unwrap_or(42),
    )
}

fn query_atom_for_problem(
    input: &ApiInput,
    problem: &PureSgpProblem,
    span_request: Solver5AtomSpanRequest,
) -> Result<Solver5ConstructionAtom, SolverError> {
    let construction = match span_request {
        Solver5AtomSpanRequest::RequestedSpan => attempt_construction(problem)
            .map(|decision| decision.result)
            .map_err(|failure| {
                SolverError::ValidationError(failure.to_solver_error_message(problem))
            })?,
        Solver5AtomSpanRequest::BestAvailableFullSpan => best_available_construction(problem)
            .map_err(|failure| {
                SolverError::ValidationError(failure.to_solver_error_message(problem))
            })?,
        Solver5AtomSpanRequest::ClosestSupportingSpan => closest_supporting_construction(problem)
            .map_err(|failure| {
            SolverError::ValidationError(failure.to_solver_error_message(problem))
        })?,
    };

    Ok(construction_to_atom(input, construction))
}

fn construction_to_atom(
    input: &ApiInput,
    construction: ConstructionResult,
) -> Solver5ConstructionAtom {
    let span = match construction.span {
        super::types::ConstructionSpan::Full => Solver5ConstructionAtomSpan::Full,
        super::types::ConstructionSpan::Prefix { requested_weeks } => {
            Solver5ConstructionAtomSpan::Prefix {
                requested_weeks,
                max_supported_weeks: construction.max_supported_weeks,
            }
        }
    };

    Solver5ConstructionAtom {
        requested_weeks: input.problem.num_sessions as usize,
        max_supported_weeks: construction.max_supported_weeks,
        span,
        schedule: schedule_to_raw(&construction.schedule),
        family_label: construction.family.label().to_string(),
        operator_labels: construction
            .provenance
            .operators
            .iter()
            .map(|operator| operator.label().to_string())
            .collect(),
        quality_label: quality_label(&construction.metadata.quality).to_string(),
        evidence_citations: construction
            .metadata
            .evidence
            .iter()
            .map(|evidence| evidence.citation.to_string())
            .collect(),
        residual_label: construction.metadata.residual.as_ref().map(residual_label),
    }
}

fn schedule_to_raw(schedule: &Schedule) -> Vec<Vec<Vec<usize>>> {
    schedule
        .weeks()
        .iter()
        .map(|week| {
            week.blocks()
                .iter()
                .map(|block| block.members().iter().map(|person| person.raw()).collect())
                .collect()
        })
        .collect()
}

fn quality_label(quality: &super::types::ConstructionQuality) -> &'static str {
    match quality {
        super::types::ConstructionQuality::ExactFrontier => "exact_frontier",
        super::types::ConstructionQuality::NearFrontier { .. } => "near_frontier",
        super::types::ConstructionQuality::LowerBound { .. } => "lower_bound",
    }
}

fn residual_label(residual: &super::types::ResidualStructure) -> String {
    match residual {
        super::types::ResidualStructure::TransversalLatentGroups {
            subgroup_count,
            subgroup_size,
        } => format!(
            "transversal_latent_groups(subgroup_count={subgroup_count}, subgroup_size={subgroup_size})"
        ),
    }
}

fn bridged_solver5_input(input: &ApiInput) -> ApiInput {
    let mut bridged_input = input.clone();
    bridged_input.solver = bridged_solver5_configuration(&input.solver);
    bridged_input
}

fn bridged_solver5_configuration(configuration: &SolverConfiguration) -> SolverConfiguration {
    let mut bridged = configuration.clone();
    bridged.solver_type = SolverKind::Solver5.canonical_id().into();
    bridged.solver_params = SolverParams::Solver5(Solver5Params::default());
    bridged
}
