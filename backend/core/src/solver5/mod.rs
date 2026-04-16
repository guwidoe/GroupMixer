use crate::models::{
    ApiInput, ApiSchedule, Constraint, MovePolicy, Objective, RepeatEncounterParams,
    SolverConfiguration, SolverKind, SolverResult, StopReason,
};
use crate::solver3::{OracleSnapshot, RuntimeState};
use crate::solver_support::SolverError;
use std::collections::HashMap;

#[cfg(test)]
mod tests;

pub const SOLVER5_NOTES: &str =
    "Construction-first pure-SGP solver family. Solver5 accepts only pure zero-repeat Social-Golfer-style scenarios and routes them through explicit construction families. Initial baseline ships the round-robin / 1-factorization family for p=2; broader construction portfolio work belongs here.";

const DEFAULT_SOLVER5_SEED: u64 = 42;

#[derive(Clone)]
pub struct SearchEngine {
    configuration: SolverConfiguration,
}

impl SearchEngine {
    pub fn new(configuration: &SolverConfiguration) -> Self {
        Self {
            configuration: configuration.clone(),
        }
    }

    pub fn solve(&self, input: &ApiInput) -> Result<SolverResult, SolverError> {
        let problem = PureSgpProblem::from_input(input)?;
        match &self.configuration.solver_params {
            crate::models::SolverParams::Solver5(_) => {}
            _ => {
                return Err(SolverError::ValidationError(
                    "solver5 expected solver5 params after solver selection validation".into(),
                ));
            }
        }

        let (schedule, _family) = construct_schedule(&problem).ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver5 does not yet have a construction family for {}-{}-{}",
                problem.num_groups, problem.group_size, problem.num_weeks
            ))
        })?;

        build_solver_result(
            input,
            &problem,
            &schedule,
            self.configuration.seed.unwrap_or(DEFAULT_SOLVER5_SEED),
        )
    }
}

#[derive(Debug, Clone)]
struct PureSgpProblem {
    people: Vec<String>,
    groups: Vec<String>,
    num_people: usize,
    num_groups: usize,
    group_size: usize,
    num_weeks: usize,
}

impl PureSgpProblem {
    fn from_input(input: &ApiInput) -> Result<Self, SolverError> {
        let kind = input
            .solver
            .validate_solver_selection()
            .map_err(SolverError::ValidationError)?;
        if kind != SolverKind::Solver5 {
            return Err(SolverError::ValidationError(format!(
                "solver5 expected solver family 'solver5', got '{}'",
                kind.canonical_id()
            )));
        }
        if input.initial_schedule.is_some() {
            return Err(SolverError::ValidationError(
                "solver5 does not accept initial_schedule; it constructs schedules directly"
                    .into(),
            ));
        }
        if input.construction_seed_schedule.is_some() {
            return Err(SolverError::ValidationError(
                "solver5 does not accept construction_seed_schedule; it constructs schedules directly"
                    .into(),
            ));
        }

        let num_weeks = usize::try_from(input.problem.num_sessions).map_err(|_| {
            SolverError::ValidationError("solver5 num_sessions does not fit usize".into())
        })?;
        if num_weeks == 0 {
            return Err(SolverError::ValidationError(
                "solver5 requires at least one session".into(),
            ));
        }
        if input.problem.groups.is_empty() {
            return Err(SolverError::ValidationError(
                "solver5 requires at least one group".into(),
            ));
        }
        if input.problem.people.is_empty() {
            return Err(SolverError::ValidationError(
                "solver5 requires at least one person".into(),
            ));
        }

        let first_group = &input.problem.groups[0];
        if first_group.size == 0 {
            return Err(SolverError::ValidationError(
                "solver5 requires positive uniform group size".into(),
            ));
        }
        if first_group.session_sizes.is_some() {
            return Err(SolverError::ValidationError(
                "solver5 rejects session-specific capacities; pure SGP requires one fixed group size"
                    .into(),
            ));
        }
        let group_size = usize::try_from(first_group.size).map_err(|_| {
            SolverError::ValidationError("solver5 group size does not fit usize".into())
        })?;

        for group in &input.problem.groups {
            if group.session_sizes.is_some() {
                return Err(SolverError::ValidationError(
                    "solver5 rejects session-specific capacities; pure SGP requires one fixed group size"
                        .into(),
                ));
            }
            if group.size != first_group.size {
                return Err(SolverError::ValidationError(
                    "solver5 requires uniform group sizes across all groups".into(),
                ));
            }
        }

        for person in &input.problem.people {
            if let Some(sessions) = &person.sessions {
                let expected: Vec<u32> = (0..input.problem.num_sessions).collect();
                if sessions != &expected {
                    return Err(SolverError::ValidationError(
                        "solver5 rejects partial attendance; pure SGP requires every person in every session"
                            .into(),
                    ));
                }
            }
        }

        let num_people = input.problem.people.len();
        let num_groups = input.problem.groups.len();
        if num_people != num_groups * group_size {
            return Err(SolverError::ValidationError(format!(
                "solver5 requires complete equal partitions each session: {} people != {} groups * size {}",
                num_people, num_groups, group_size
            )));
        }

        validate_pure_sgp_objectives(&input.objectives)?;
        validate_pure_sgp_constraints(&input.constraints)?;

        Ok(Self {
            people: input
                .problem
                .people
                .iter()
                .map(|person| person.id.clone())
                .collect(),
            groups: input
                .problem
                .groups
                .iter()
                .map(|group| group.id.clone())
                .collect(),
            num_people,
            num_groups,
            group_size,
            num_weeks,
        })
    }
}

fn validate_pure_sgp_objectives(objectives: &[Objective]) -> Result<(), SolverError> {
    for objective in objectives {
        if objective.r#type != "maximize_unique_contacts" {
            return Err(SolverError::ValidationError(format!(
                "solver5 rejects objective '{}'; pure SGP only allows maximize_unique_contacts",
                objective.r#type
            )));
        }
    }
    Ok(())
}

fn validate_pure_sgp_constraints(constraints: &[Constraint]) -> Result<(), SolverError> {
    let mut repeat_encounter: Option<&RepeatEncounterParams> = None;
    for constraint in constraints {
        match constraint {
            Constraint::RepeatEncounter(params) => {
                if repeat_encounter.replace(params).is_some() {
                    return Err(SolverError::ValidationError(
                        "solver5 allows exactly one RepeatEncounter constraint".into(),
                    ));
                }
            }
            other => {
                return Err(SolverError::ValidationError(format!(
                    "solver5 rejects non-SGP constraint '{:?}'; pure SGP only allows RepeatEncounter",
                    other
                )));
            }
        }
    }

    let Some(params) = repeat_encounter else {
        return Err(SolverError::ValidationError(
            "solver5 requires exactly one RepeatEncounter constraint encoding meet-at-most-once semantics"
                .into(),
        ));
    };
    if params.max_allowed_encounters != 1 {
        return Err(SolverError::ValidationError(
            "solver5 requires zero-repeat meet-at-most-once semantics: RepeatEncounter.max_allowed_encounters must be 1"
                .into(),
        ));
    }
    Ok(())
}

fn construct_schedule(problem: &PureSgpProblem) -> Option<(Vec<Vec<Vec<usize>>>, &'static str)> {
    let (mut schedule, family) = construct_max_schedule(problem.num_groups, problem.group_size)?;
    if problem.num_weeks > schedule.len() {
        return None;
    }
    schedule.truncate(problem.num_weeks);
    Some((schedule, family))
}

fn construct_max_schedule(
    num_groups: usize,
    group_size: usize,
) -> Option<(Vec<Vec<Vec<usize>>>, &'static str)> {
    if group_size == 2 {
        return Some((construct_round_robin(num_groups), "round_robin"));
    }

    let field = FiniteField::for_order(num_groups)?;
    if group_size == num_groups {
        return Some((construct_affine_plane(&field), "affine_plane_prime_power"));
    }

    if group_size >= 3 && group_size <= num_groups {
        let mut schedule = construct_transversal_design(&field, group_size);
        let mut family = "transversal_design_prime_power";
        if let Some(extra_weeks) = lift_transversal_latent_groups(num_groups, group_size) {
            schedule.extend(extra_weeks);
            family = "transversal_design_prime_power_plus_recursive";
        }
        return Some((schedule, family));
    }

    None
}

fn lift_transversal_latent_groups(
    num_groups: usize,
    group_size: usize,
) -> Option<Vec<Vec<Vec<usize>>>> {
    if num_groups % group_size != 0 {
        return None;
    }

    let smaller_num_groups = num_groups / group_size;
    if smaller_num_groups < 2 {
        return None;
    }

    let upper_bound = counting_bound(smaller_num_groups, group_size);
    let (smaller_schedule, _) = construct_max_schedule(smaller_num_groups, group_size)?;
    let usable_weeks = smaller_schedule.len().min(upper_bound);
    if usable_weeks == 0 {
        return None;
    }

    let mut lifted = Vec::with_capacity(usable_weeks);
    for week in smaller_schedule.into_iter().take(usable_weeks) {
        let mut lifted_week = Vec::with_capacity(num_groups);
        for latent_group in 0..group_size {
            let offset = latent_group * num_groups;
            for block in &week {
                lifted_week.push(block.iter().map(|person| offset + person).collect());
            }
        }
        lifted.push(lifted_week);
    }

    Some(lifted)
}

fn counting_bound(num_groups: usize, group_size: usize) -> usize {
    ((num_groups * group_size) - 1) / (group_size - 1)
}

#[derive(Clone, Copy)]
struct FiniteField {
    order: usize,
    prime: usize,
    degree: usize,
    modulus: &'static [usize],
}

impl FiniteField {
    fn for_order(order: usize) -> Option<Self> {
        match order {
            2 => Some(Self {
                order,
                prime: 2,
                degree: 1,
                modulus: &[1, 0],
            }),
            3 => Some(Self {
                order,
                prime: 3,
                degree: 1,
                modulus: &[1, 0],
            }),
            4 => Some(Self {
                order,
                prime: 2,
                degree: 2,
                modulus: &[1, 1, 1],
            }),
            5 => Some(Self {
                order,
                prime: 5,
                degree: 1,
                modulus: &[1, 0],
            }),
            7 => Some(Self {
                order,
                prime: 7,
                degree: 1,
                modulus: &[1, 0],
            }),
            8 => Some(Self {
                order,
                prime: 2,
                degree: 3,
                modulus: &[1, 1, 0, 1],
            }),
            9 => Some(Self {
                order,
                prime: 3,
                degree: 2,
                modulus: &[1, 0, 1],
            }),
            _ => None,
        }
    }

    fn add(self, left: usize, right: usize) -> usize {
        if self.degree == 1 {
            return (left + right) % self.prime;
        }

        let left_digits = self.to_digits(left);
        let right_digits = self.to_digits(right);
        let digits = left_digits
            .iter()
            .zip(right_digits.iter())
            .map(|(l, r)| (l + r) % self.prime)
            .collect::<Vec<_>>();
        self.from_digits(&digits)
    }

    fn sub(self, left: usize, right: usize) -> usize {
        if self.degree == 1 {
            return (left + self.prime - (right % self.prime)) % self.prime;
        }

        let left_digits = self.to_digits(left);
        let right_digits = self.to_digits(right);
        let digits = left_digits
            .iter()
            .zip(right_digits.iter())
            .map(|(l, r)| (self.prime + l - r) % self.prime)
            .collect::<Vec<_>>();
        self.from_digits(&digits)
    }

    fn mul(self, left: usize, right: usize) -> usize {
        if self.degree == 1 {
            return (left * right) % self.prime;
        }

        let left_digits = self.to_digits(left);
        let right_digits = self.to_digits(right);
        let mut product = vec![0usize; self.degree * 2 - 1];
        for (left_idx, left_digit) in left_digits.iter().enumerate() {
            for (right_idx, right_digit) in right_digits.iter().enumerate() {
                product[left_idx + right_idx] =
                    (product[left_idx + right_idx] + (left_digit * right_digit)) % self.prime;
            }
        }

        for degree in (self.degree..product.len()).rev() {
            let coefficient = product[degree] % self.prime;
            if coefficient == 0 {
                continue;
            }
            for offset in 0..self.degree {
                let target = degree - self.degree + offset;
                let reduction = (coefficient * self.modulus[offset]) % self.prime;
                product[target] = (self.prime + product[target] - reduction) % self.prime;
            }
        }

        self.from_digits(&product[..self.degree])
    }

    fn nonzero_nonone_elements(self) -> Vec<usize> {
        (0..self.order)
            .filter(|value| *value != 0 && *value != 1)
            .collect()
    }

    fn to_digits(self, mut value: usize) -> Vec<usize> {
        let mut digits = vec![0usize; self.degree];
        for digit in &mut digits {
            *digit = value % self.prime;
            value /= self.prime;
        }
        digits
    }

    fn from_digits(self, digits: &[usize]) -> usize {
        let mut value = 0usize;
        let mut factor = 1usize;
        for digit in digits.iter().take(self.degree) {
            value += digit * factor;
            factor *= self.prime;
        }
        value
    }
}

fn construct_round_robin(num_groups: usize) -> Vec<Vec<Vec<usize>>> {
    let total_people = num_groups * 2;
    let mut ring: Vec<usize> = (0..total_people).collect();
    let mut weeks = Vec::with_capacity(total_people.saturating_sub(1));

    for _ in 0..total_people.saturating_sub(1) {
        let mut week = Vec::with_capacity(num_groups);
        for idx in 0..num_groups {
            week.push(vec![ring[idx], ring[total_people - 1 - idx]]);
        }
        weeks.push(week);

        if total_people > 2 {
            let last = ring.pop().expect("round robin ring should be non-empty");
            ring.insert(1, last);
        }
    }

    weeks
}

fn construct_transversal_design(field: &FiniteField, group_size: usize) -> Vec<Vec<Vec<usize>>> {
    let order = field.order;
    let coefficients = field.nonzero_nonone_elements();
    let mut weeks = Vec::with_capacity(order);
    for offset in 0..order {
        let mut week = Vec::with_capacity(order);
        for symbol in 0..order {
            let mut block = Vec::with_capacity(group_size);
            block.push(td_person(0, field.add(offset, symbol), order));
            block.push(td_person(1, symbol, order));
            for extra_group in 0..(group_size - 2) {
                let adjusted = field.add(offset, field.mul(coefficients[extra_group], symbol));
                block.push(td_person(extra_group + 2, adjusted, order));
            }
            week.push(block);
        }
        weeks.push(week);
    }
    weeks
}

fn construct_affine_plane(field: &FiniteField) -> Vec<Vec<Vec<usize>>> {
    let order = field.order;
    let mut weeks = Vec::with_capacity(order + 1);

    let mut vertical_week = Vec::with_capacity(order);
    for x in 0..order {
        let mut block = Vec::with_capacity(order);
        for y in 0..order {
            block.push(plane_point(x, y, order));
        }
        vertical_week.push(block);
    }
    weeks.push(vertical_week);

    for slope in 0..order {
        let mut week = Vec::with_capacity(order);
        for intercept in 0..order {
            let mut block = Vec::with_capacity(order);
            for x in 0..order {
                let y = field.add(field.mul(slope, x), intercept);
                block.push(plane_point(x, y, order));
            }
            week.push(block);
        }
        weeks.push(week);
    }

    weeks
}

fn td_person(latent_group: usize, symbol: usize, order: usize) -> usize {
    latent_group * order + symbol
}

fn plane_point(x: usize, y: usize, order: usize) -> usize {
    x * order + y
}

fn build_solver_result(
    input: &ApiInput,
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
    effective_seed: u64,
) -> Result<SolverResult, SolverError> {
    let api_schedule = to_api_schedule(problem, schedule);
    let canonical = canonical_score_for_schedule(input, &api_schedule)?;

    Ok(SolverResult {
        final_score: canonical.total_score,
        schedule: api_schedule,
        unique_contacts: canonical.unique_contacts as i32,
        repetition_penalty: canonical.repetition_penalty_raw,
        attribute_balance_penalty: canonical.attribute_balance_penalty.round() as i32,
        constraint_penalty: canonical.constraint_penalty_raw,
        no_improvement_count: 0,
        weighted_repetition_penalty: canonical.weighted_repetition_penalty,
        weighted_constraint_penalty: canonical.constraint_penalty_weighted,
        effective_seed: Some(effective_seed),
        move_policy: Some(MovePolicy::default()),
        stop_reason: Some(StopReason::OptimalScoreReached),
        benchmark_telemetry: None,
    })
}

fn canonical_score_for_schedule(
    input: &ApiInput,
    schedule: &ApiSchedule,
) -> Result<OracleSnapshot, SolverError> {
    let mut canonical_input = input.clone();
    canonical_input.initial_schedule = Some(schedule.clone());
    canonical_input.construction_seed_schedule = None;

    let mut solver_override = crate::default_solver_configuration_for(SolverKind::Solver3);
    solver_override.stop_conditions = canonical_input.solver.stop_conditions.clone();
    solver_override.logging = canonical_input.solver.logging.clone();
    solver_override.telemetry = canonical_input.solver.telemetry.clone();
    solver_override.seed = canonical_input.solver.seed;
    solver_override.move_policy = canonical_input.solver.move_policy.clone();
    solver_override.allowed_sessions = canonical_input.solver.allowed_sessions.clone();
    canonical_input.solver = solver_override;

    let state = RuntimeState::from_input(&canonical_input).map_err(|error| {
        SolverError::ValidationError(format!(
            "solver5 could not canonicalize its final schedule through solver3 scoring: {error}"
        ))
    })?;

    crate::solver3::recompute_oracle_score(&state)
}

fn to_api_schedule(
    problem: &PureSgpProblem,
    schedule: &[Vec<Vec<usize>>],
) -> HashMap<String, HashMap<String, Vec<String>>> {
    let mut api = HashMap::new();
    for (week_idx, groups) in schedule.iter().enumerate() {
        let mut week_map = HashMap::new();
        for (group_idx, members) in groups.iter().enumerate() {
            week_map.insert(
                problem.groups[group_idx].clone(),
                members
                    .iter()
                    .map(|person_idx| problem.people[*person_idx].clone())
                    .collect(),
            );
        }
        api.insert(format!("session_{week_idx}"), week_map);
    }
    api
}
