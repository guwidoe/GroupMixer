use crate::models::{ApiInput, Constraint, Group, Person};
use crate::solver_support::SolverError;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

/// Stable identifier for the current canonical input-complexity model.
///
/// Keep this versioned: benchmark timeout policies may depend on a specific complexity model and
/// should not silently change meaning when the formula is recalibrated.
pub const PROBLEM_COMPLEXITY_MODEL_VERSION: &str = "problem_complexity_v1";

/// Canonical scalar complexity estimate for a solver input.
///
/// `score` is the single value intended for benchmark budget policies. The breakdown is diagnostic
/// only: callers should persist the `model_version` alongside any derived timeout policy.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ProblemComplexity {
    pub model_version: String,
    pub score: f64,
    pub breakdown: ProblemComplexityBreakdown,
}

/// Diagnostic terms used to derive [`ProblemComplexity::score`].
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ProblemComplexityBreakdown {
    pub people_count: usize,
    pub group_count: usize,
    pub session_count: usize,
    pub active_people_by_session: Vec<usize>,
    pub total_placements: u64,
    pub total_capacity: u64,
    pub estimated_pair_contact_slots: f64,
    pub possible_coactive_pairs: u64,
    pub repeat_contact_ratio: f64,
    pub repeat_intent: f64,
    pub size_work: f64,
    pub repeat_multiplier: f64,
    pub constraint_complexity: ConstraintComplexityBreakdown,
    pub constraint_multiplier: f64,
    pub attendance_churn: f64,
    pub capacity_pressure: f64,
    pub group_size_variance_ratio: f64,
    pub session_specific_constraint_fraction: f64,
    pub heterogeneity_multiplier: f64,
}

/// Diagnostic constraint effort totals. These are effort estimates, not objective penalties.
#[derive(Debug, Clone, Serialize, PartialEq, Default)]
pub struct ConstraintComplexityBreakdown {
    pub repeat_encounter_events: f64,
    pub attribute_balance_events: f64,
    pub immovable_person_events: f64,
    pub immovable_people_events: f64,
    pub must_stay_together_events: f64,
    pub must_stay_apart_events: f64,
    pub should_stay_together_events: f64,
    pub should_not_be_together_events: f64,
    pub pair_meeting_count_events: f64,
    pub total_events: f64,
    pub density: f64,
}

/// Evaluate the canonical, deterministic problem-complexity scalar for an input.
///
/// The score intentionally ignores solver selection, seeds, stop conditions, logging, telemetry,
/// initial schedules, and construction seed schedules. It is an input-shape estimate based on:
///
/// - size of the placement/search state,
/// - repeat/contact saturation pressure,
/// - constraint effort,
/// - attendance/capacity heterogeneity.
///
/// Invalid structural references in sessions, groups, or people return an explicit validation error.
pub fn evaluate_problem_complexity(input: &ApiInput) -> Result<ProblemComplexity, SolverError> {
    let context = ComplexityContext::build(input)?;
    let total_placements: u64 = context
        .active_people_by_session
        .iter()
        .map(|count| *count as u64)
        .sum();
    let total_capacity: u64 = context
        .capacities_by_session
        .iter()
        .flatten()
        .map(|capacity| *capacity as u64)
        .sum();

    for (session_idx, (&active, capacity)) in context
        .active_people_by_session
        .iter()
        .zip(context.capacity_by_session.iter())
        .enumerate()
    {
        if active > *capacity {
            return Err(validation_error(format!(
                "session {session_idx} has {active} active people but only {capacity} total capacity"
            )));
        }
    }

    let pair_contact_slots = context.estimated_pair_contact_slots()?;
    let possible_coactive_pairs = context.possible_coactive_pairs();
    let repeat_contact_ratio = if possible_coactive_pairs == 0 {
        0.0
    } else {
        pair_contact_slots / possible_coactive_pairs as f64
    };
    let repeat_intent = repeat_intent(input);
    let size_work = context.size_work(pair_contact_slots);
    let repeat_multiplier = repeat_multiplier(repeat_contact_ratio, repeat_intent);
    let mut constraint_complexity =
        context.constraint_complexity(input, possible_coactive_pairs)?;
    let constraint_density_denominator = (pair_contact_slots + total_placements as f64).max(1.0);
    constraint_complexity.density =
        constraint_complexity.total_events / constraint_density_denominator;
    let constraint_multiplier = 1.0 + constraint_complexity.density.sqrt().min(3.0);

    let attendance_churn = context.attendance_churn();
    let capacity_pressure = context.capacity_pressure();
    let group_size_variance_ratio = context.group_size_variance_ratio();
    let session_specific_constraint_fraction = if input.constraints.is_empty() {
        0.0
    } else {
        count_session_specific_constraints(&input.constraints) as f64
            / input.constraints.len() as f64
    };
    let heterogeneity_multiplier = 1.0
        + 0.35 * attendance_churn
        + 0.35 * capacity_pressure
        + 0.25 * group_size_variance_ratio.min(4.0)
        + 0.20 * session_specific_constraint_fraction;

    let raw_score =
        size_work * repeat_multiplier * constraint_multiplier * heterogeneity_multiplier;
    let score = if raw_score.is_finite() {
        raw_score.max(0.0)
    } else {
        return Err(validation_error(
            "problem complexity score produced a non-finite value".to_string(),
        ));
    };

    Ok(ProblemComplexity {
        model_version: PROBLEM_COMPLEXITY_MODEL_VERSION.to_string(),
        score,
        breakdown: ProblemComplexityBreakdown {
            people_count: context.people.len(),
            group_count: context.groups.len(),
            session_count: context.session_count,
            active_people_by_session: context.active_people_by_session,
            total_placements,
            total_capacity,
            estimated_pair_contact_slots: pair_contact_slots,
            possible_coactive_pairs,
            repeat_contact_ratio,
            repeat_intent,
            size_work,
            repeat_multiplier,
            constraint_complexity,
            constraint_multiplier,
            attendance_churn,
            capacity_pressure,
            group_size_variance_ratio,
            session_specific_constraint_fraction,
            heterogeneity_multiplier,
        },
    })
}

/// Convenience wrapper when callers only need the canonical scalar.
pub fn problem_complexity_score(input: &ApiInput) -> Result<f64, SolverError> {
    Ok(evaluate_problem_complexity(input)?.score)
}

struct ComplexityContext<'a> {
    people: &'a [Person],
    groups: &'a [Group],
    session_count: usize,
    person_index_by_id: HashMap<&'a str, usize>,
    group_ids: HashSet<&'a str>,
    active_by_person_session: Vec<Vec<bool>>,
    active_people_by_session: Vec<usize>,
    capacities_by_session: Vec<Vec<usize>>,
    capacity_by_session: Vec<usize>,
}

impl<'a> ComplexityContext<'a> {
    fn build(input: &'a ApiInput) -> Result<Self, SolverError> {
        let people = input.problem.people.as_slice();
        let groups = input.problem.groups.as_slice();
        let session_count = input.problem.num_sessions as usize;

        let mut person_index_by_id = HashMap::with_capacity(people.len());
        for (idx, person) in people.iter().enumerate() {
            if person_index_by_id.insert(person.id.as_str(), idx).is_some() {
                return Err(validation_error(format!(
                    "duplicate person id {}",
                    person.id
                )));
            }
        }

        let mut group_ids = HashSet::with_capacity(groups.len());
        for group in groups {
            if !group_ids.insert(group.id.as_str()) {
                return Err(validation_error(format!("duplicate group id {}", group.id)));
            }
            if let Some(session_sizes) = &group.session_sizes {
                if session_sizes.len() != session_count {
                    return Err(validation_error(format!(
                        "group {} has {} session_sizes but problem has {session_count} sessions",
                        group.id,
                        session_sizes.len()
                    )));
                }
            }
        }

        let mut active_by_person_session = vec![vec![false; session_count]; people.len()];
        let mut active_people_by_session = vec![0usize; session_count];
        for (person_idx, person) in people.iter().enumerate() {
            for session_idx in normalized_sessions(
                person.sessions.as_ref(),
                session_count,
                &format!("person {}", person.id),
            )? {
                active_by_person_session[person_idx][session_idx] = true;
                active_people_by_session[session_idx] += 1;
            }
        }

        let mut capacities_by_session = vec![Vec::with_capacity(groups.len()); session_count];
        let mut capacity_by_session = vec![0usize; session_count];
        for session_idx in 0..session_count {
            for group in groups {
                let capacity = group_capacity(group, session_idx)?;
                capacities_by_session[session_idx].push(capacity);
                capacity_by_session[session_idx] += capacity;
            }
        }

        Ok(Self {
            people,
            groups,
            session_count,
            person_index_by_id,
            group_ids,
            active_by_person_session,
            active_people_by_session,
            capacities_by_session,
            capacity_by_session,
        })
    }

    fn estimated_pair_contact_slots(&self) -> Result<f64, SolverError> {
        let mut total = 0.0;
        for (session_idx, (&active_count, capacities)) in self
            .active_people_by_session
            .iter()
            .zip(self.capacities_by_session.iter())
            .enumerate()
        {
            total += estimated_session_pair_contact_slots(active_count, capacities)
                .map_err(|msg| validation_error(format!("session {session_idx}: {msg}")))?;
        }
        Ok(total)
    }

    fn possible_coactive_pairs(&self) -> u64 {
        let mut count = 0u64;
        for left in 0..self.people.len() {
            for right in (left + 1)..self.people.len() {
                if (0..self.session_count).any(|session_idx| {
                    self.active_by_person_session[left][session_idx]
                        && self.active_by_person_session[right][session_idx]
                }) {
                    count += 1;
                }
            }
        }
        count
    }

    fn size_work(&self, pair_contact_slots: f64) -> f64 {
        if self.session_count == 0 {
            return 0.0;
        }

        let mut work = 0.0;
        for (session_idx, &active_count) in self.active_people_by_session.iter().enumerate() {
            let positive_capacities: Vec<usize> = self.capacities_by_session[session_idx]
                .iter()
                .copied()
                .filter(|capacity| *capacity > 0)
                .collect();
            let mean_capacity = average_usize(&positive_capacities).unwrap_or(1.0);
            let group_size_factor = (mean_capacity / 4.0).max(1.0);
            work += (active_count as f64).powi(2) * group_size_factor;
        }

        let contact_touch_factor = if self.active_people_by_session.iter().sum::<usize>() == 0 {
            1.0
        } else {
            let total_active: usize = self.active_people_by_session.iter().sum();
            (pair_contact_slots / total_active as f64 / 3.0).max(1.0)
        };

        work * contact_touch_factor / 1000.0
    }

    fn constraint_complexity(
        &self,
        input: &ApiInput,
        possible_coactive_pairs: u64,
    ) -> Result<ConstraintComplexityBreakdown, SolverError> {
        let mut breakdown = ConstraintComplexityBreakdown::default();

        for constraint in &input.constraints {
            match constraint {
                Constraint::RepeatEncounter(params) => {
                    let weight = soft_weight_factor(params.penalty_weight);
                    breakdown.repeat_encounter_events +=
                        possible_coactive_pairs as f64 * 0.01 * weight;
                }
                Constraint::AttributeBalance(params) => {
                    let target_group_count = if params.group_id == "ALL" {
                        self.groups.len()
                    } else {
                        self.ensure_group_exists(&params.group_id)?;
                        1
                    };
                    let sessions = normalized_sessions(
                        params.sessions.as_ref(),
                        self.session_count,
                        &format!("AttributeBalance for group {}", params.group_id),
                    )?;
                    let desired_total: u32 = params.desired_values.values().sum();
                    breakdown.attribute_balance_events += sessions.len() as f64
                        * target_group_count as f64
                        * desired_total as f64
                        * 0.75
                        * soft_weight_factor(params.penalty_weight);
                }
                Constraint::ImmovablePerson(params) => {
                    self.ensure_person_exists(&params.person_id)?;
                    self.ensure_group_exists(&params.group_id)?;
                    let sessions = normalized_sessions(
                        params.sessions.as_ref(),
                        self.session_count,
                        &format!("ImmovablePerson for {}", params.person_id),
                    )?;
                    breakdown.immovable_person_events += sessions.len() as f64 * 2.0;
                }
                Constraint::MustStayTogether { people, sessions } => {
                    self.ensure_people_exist(people, "MustStayTogether")?;
                    let sessions = normalized_sessions(
                        sessions.as_ref(),
                        self.session_count,
                        "MustStayTogether",
                    )?;
                    breakdown.must_stay_together_events +=
                        sessions.len() as f64 * unordered_pair_count(people.len()) as f64 * 2.5;
                }
                Constraint::MustStayApart { people, sessions } => {
                    self.ensure_people_exist(people, "MustStayApart")?;
                    let sessions = normalized_sessions(
                        sessions.as_ref(),
                        self.session_count,
                        "MustStayApart",
                    )?;
                    breakdown.must_stay_apart_events +=
                        sessions.len() as f64 * unordered_pair_count(people.len()) as f64 * 2.5;
                }
                Constraint::ShouldStayTogether {
                    people,
                    penalty_weight,
                    sessions,
                } => {
                    self.ensure_people_exist(people, "ShouldStayTogether")?;
                    let sessions = normalized_sessions(
                        sessions.as_ref(),
                        self.session_count,
                        "ShouldStayTogether",
                    )?;
                    breakdown.should_stay_together_events += sessions.len() as f64
                        * unordered_pair_count(people.len()) as f64
                        * 0.9
                        * soft_weight_factor(*penalty_weight);
                }
                Constraint::ShouldNotBeTogether {
                    people,
                    penalty_weight,
                    sessions,
                } => {
                    self.ensure_people_exist(people, "ShouldNotBeTogether")?;
                    let sessions = normalized_sessions(
                        sessions.as_ref(),
                        self.session_count,
                        "ShouldNotBeTogether",
                    )?;
                    breakdown.should_not_be_together_events += sessions.len() as f64
                        * unordered_pair_count(people.len()) as f64
                        * 1.2
                        * soft_weight_factor(*penalty_weight);
                }
                Constraint::ImmovablePeople(params) => {
                    self.ensure_people_exist(&params.people, "ImmovablePeople")?;
                    self.ensure_group_exists(&params.group_id)?;
                    let sessions = normalized_sessions(
                        params.sessions.as_ref(),
                        self.session_count,
                        &format!("ImmovablePeople for group {}", params.group_id),
                    )?;
                    breakdown.immovable_people_events +=
                        sessions.len() as f64 * params.people.len() as f64 * 2.5;
                }
                Constraint::PairMeetingCount(params) => {
                    self.ensure_people_exist(&params.people, "PairMeetingCount")?;
                    let sessions = normalized_sessions(
                        Some(&params.sessions),
                        self.session_count,
                        "PairMeetingCount",
                    )?;
                    breakdown.pair_meeting_count_events +=
                        sessions.len() as f64 * 3.0 * soft_weight_factor(params.penalty_weight);
                }
            }
        }

        breakdown.total_events = breakdown.repeat_encounter_events
            + breakdown.attribute_balance_events
            + breakdown.immovable_person_events
            + breakdown.immovable_people_events
            + breakdown.must_stay_together_events
            + breakdown.must_stay_apart_events
            + breakdown.should_stay_together_events
            + breakdown.should_not_be_together_events
            + breakdown.pair_meeting_count_events;

        Ok(breakdown)
    }

    fn attendance_churn(&self) -> f64 {
        if self.session_count <= 1 || self.people.is_empty() {
            return 0.0;
        }

        let mut total = 0.0;
        for session_idx in 1..self.session_count {
            let mut changed = 0usize;
            for person_idx in 0..self.people.len() {
                if self.active_by_person_session[person_idx][session_idx - 1]
                    != self.active_by_person_session[person_idx][session_idx]
                {
                    changed += 1;
                }
            }
            total += changed as f64 / self.people.len() as f64;
        }

        total / (self.session_count - 1) as f64
    }

    fn capacity_pressure(&self) -> f64 {
        if self.session_count == 0 {
            return 0.0;
        }

        let mut total = 0.0;
        for (&active, &capacity) in self
            .active_people_by_session
            .iter()
            .zip(self.capacity_by_session.iter())
        {
            if capacity == 0 {
                continue;
            }
            let tightness = (active as f64 / capacity as f64).clamp(0.0, 1.0);
            total += tightness * tightness;
        }

        total / self.session_count as f64
    }

    fn group_size_variance_ratio(&self) -> f64 {
        let capacities: Vec<usize> = self
            .capacities_by_session
            .iter()
            .flatten()
            .copied()
            .filter(|capacity| *capacity > 0)
            .collect();
        variance_ratio(&capacities)
    }

    fn ensure_person_exists(&self, person_id: &str) -> Result<(), SolverError> {
        if self.person_index_by_id.contains_key(person_id) {
            Ok(())
        } else {
            Err(validation_error(format!(
                "constraint references unknown person {person_id}"
            )))
        }
    }

    fn ensure_people_exist(&self, people: &[String], context: &str) -> Result<(), SolverError> {
        for person_id in people {
            if !self.person_index_by_id.contains_key(person_id.as_str()) {
                return Err(validation_error(format!(
                    "{context} references unknown person {person_id}"
                )));
            }
        }
        Ok(())
    }

    fn ensure_group_exists(&self, group_id: &str) -> Result<(), SolverError> {
        if self.group_ids.contains(group_id) {
            Ok(())
        } else {
            Err(validation_error(format!(
                "constraint references unknown group {group_id}"
            )))
        }
    }
}

fn repeat_intent(input: &ApiInput) -> f64 {
    let has_contact_objective = input.objectives.iter().any(|objective| {
        objective.r#type == "maximize_unique_contacts"
            && objective.weight.is_finite()
            && objective.weight > 0.0
    });
    let has_repeat_constraint = input
        .constraints
        .iter()
        .any(|constraint| matches!(constraint, Constraint::RepeatEncounter(_)));

    if has_contact_objective || has_repeat_constraint {
        1.0
    } else {
        0.25
    }
}

fn repeat_multiplier(repeat_contact_ratio: f64, repeat_intent: f64) -> f64 {
    if repeat_contact_ratio <= 0.0 || repeat_intent <= 0.0 {
        return 1.0;
    }

    let saturation = repeat_contact_ratio.powi(2);
    let exact_boundary_peak = (-((repeat_contact_ratio - 1.0) / 0.18).powi(2)).exp();
    let overbound = (repeat_contact_ratio - 1.0).max(0.0).powi(2);

    1.0 + repeat_intent * (4.0 * saturation + 8.0 * exact_boundary_peak + 6.0 * overbound)
}

fn estimated_session_pair_contact_slots(
    active_people: usize,
    capacities: &[usize],
) -> Result<f64, String> {
    if active_people == 0 {
        return Ok(0.0);
    }

    let total_capacity: usize = capacities.iter().sum();
    if active_people > total_capacity {
        return Err(format!(
            "{active_people} active people exceed total capacity {total_capacity}"
        ));
    }

    let mut marginal_contact_costs = Vec::with_capacity(total_capacity);
    for &capacity in capacities {
        for current_occupancy in 0..capacity {
            marginal_contact_costs.push(current_occupancy as f64);
        }
    }
    marginal_contact_costs.sort_by(f64::total_cmp);

    Ok(marginal_contact_costs.into_iter().take(active_people).sum())
}

fn group_capacity(group: &Group, session_idx: usize) -> Result<usize, SolverError> {
    let capacity = if let Some(session_sizes) = &group.session_sizes {
        session_sizes[session_idx]
    } else {
        group.size
    };
    Ok(capacity as usize)
}

fn normalized_sessions(
    sessions: Option<&Vec<u32>>,
    session_count: usize,
    context: &str,
) -> Result<Vec<usize>, SolverError> {
    let Some(sessions) = sessions else {
        return Ok((0..session_count).collect());
    };

    let mut seen = vec![false; session_count];
    let mut normalized = Vec::with_capacity(sessions.len());
    for &session_idx in sessions {
        let idx = session_idx as usize;
        if idx >= session_count {
            return Err(validation_error(format!(
                "{context} references session {session_idx}, but problem has {session_count} sessions"
            )));
        }
        if seen[idx] {
            return Err(validation_error(format!(
                "{context} references session {session_idx} more than once"
            )));
        }
        seen[idx] = true;
        normalized.push(idx);
    }
    Ok(normalized)
}

fn count_session_specific_constraints(constraints: &[Constraint]) -> usize {
    constraints
        .iter()
        .filter(|constraint| match constraint {
            Constraint::RepeatEncounter(_) => false,
            Constraint::AttributeBalance(params) => params.sessions.is_some(),
            Constraint::ImmovablePerson(params) => params.sessions.is_some(),
            Constraint::MustStayTogether { sessions, .. } => sessions.is_some(),
            Constraint::MustStayApart { sessions, .. } => sessions.is_some(),
            Constraint::ShouldStayTogether { sessions, .. } => sessions.is_some(),
            Constraint::ShouldNotBeTogether { sessions, .. } => sessions.is_some(),
            Constraint::ImmovablePeople(params) => params.sessions.is_some(),
            Constraint::PairMeetingCount(_) => true,
        })
        .count()
}

fn soft_weight_factor(weight: f64) -> f64 {
    if !weight.is_finite() || weight <= 0.0 {
        return 1.0;
    }
    1.0 + ((1.0 + weight).log10() / 4.0).clamp(0.0, 1.0)
}

fn unordered_pair_count(count: usize) -> usize {
    count.saturating_mul(count.saturating_sub(1)) / 2
}

fn average_usize(values: &[usize]) -> Option<f64> {
    if values.is_empty() {
        None
    } else {
        Some(values.iter().sum::<usize>() as f64 / values.len() as f64)
    }
}

fn variance_ratio(values: &[usize]) -> f64 {
    let Some(mean) = average_usize(values) else {
        return 0.0;
    };
    if mean <= 0.0 {
        return 0.0;
    }
    let variance = values
        .iter()
        .map(|value| (*value as f64 - mean).powi(2))
        .sum::<f64>()
        / values.len() as f64;
    variance / mean.powi(2)
}

fn validation_error(message: String) -> SolverError {
    SolverError::ValidationError(format!("problem complexity evaluator: {message}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        AttributeBalanceMode, AttributeBalanceParams, ImmovablePeopleParams, ImmovablePersonParams,
        LoggingOptions, Objective, PairMeetingCountParams, PairMeetingMode, ProblemDefinition,
        RepeatEncounterParams, SimulatedAnnealingParams, SolverConfiguration, SolverParams,
        StopConditions, TelemetryOptions,
    };

    #[test]
    fn complexity_scales_with_harder_social_golfer_shapes() {
        let sgp_8_4_10 = social_golfer_input(8, 4, 10);
        let sgp_8_4_15 = social_golfer_input(8, 4, 15);
        let sgp_8_4_20 = social_golfer_input(8, 4, 20);
        let sgp_7_7_8 = social_golfer_input(7, 7, 8);
        let sgp_13_13_14 = social_golfer_input(13, 13, 14);

        let c_8_4_10 = problem_complexity_score(&sgp_8_4_10).unwrap();
        let c_8_4_15 = problem_complexity_score(&sgp_8_4_15).unwrap();
        let c_8_4_20 = problem_complexity_score(&sgp_8_4_20).unwrap();
        let c_7_7_8 = problem_complexity_score(&sgp_7_7_8).unwrap();
        let c_13_13_14 = problem_complexity_score(&sgp_13_13_14).unwrap();

        assert!(c_8_4_15 > c_8_4_10);
        assert!(c_8_4_20 > c_8_4_15);
        assert!(c_7_7_8 > c_8_4_15);
        assert!(c_13_13_14 > c_8_4_20 * 10.0);
    }

    #[test]
    fn constraints_increase_complexity_without_changing_shape() {
        let pure = social_golfer_input(8, 4, 15);
        let constrained = constrained_social_golfer_input(8, 4, 15);

        let pure_complexity = evaluate_problem_complexity(&pure).unwrap();
        let constrained_complexity = evaluate_problem_complexity(&constrained).unwrap();

        assert!(constrained_complexity.score > pure_complexity.score);
        assert!(
            constrained_complexity
                .breakdown
                .constraint_complexity
                .total_events
                > pure_complexity.breakdown.constraint_complexity.total_events
        );
        assert!(
            constrained_complexity
                .breakdown
                .session_specific_constraint_fraction
                > 0.0
        );
    }

    #[test]
    fn complexity_ignores_solver_budget_and_initial_schedules() {
        let first = social_golfer_input(4, 4, 5);
        let mut second = first.clone();
        second.solver.stop_conditions.max_iterations = Some(999_999_999);
        second.solver.stop_conditions.time_limit_seconds = Some(9999);
        second.solver.seed = Some(123456789);
        second.initial_schedule = Some(HashMap::new());
        second.construction_seed_schedule = Some(HashMap::new());

        let first_complexity = evaluate_problem_complexity(&first).unwrap();
        let second_complexity = evaluate_problem_complexity(&second).unwrap();

        assert_eq!(first_complexity.score, second_complexity.score);
        assert_eq!(first_complexity.breakdown, second_complexity.breakdown);
    }

    fn social_golfer_input(groups: usize, group_size: usize, weeks: usize) -> ApiInput {
        let people_count = groups * group_size;
        ApiInput {
            problem: ProblemDefinition {
                people: (0..people_count)
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
                r#type: "maximize_unique_contacts".to_string(),
                weight: 1.0,
            }],
            constraints: Vec::new(),
            solver: test_solver_configuration(),
        }
    }

    fn constrained_social_golfer_input(groups: usize, group_size: usize, weeks: usize) -> ApiInput {
        let mut input = social_golfer_input(groups, group_size, weeks);
        for (idx, person) in input.problem.people.iter_mut().enumerate() {
            person.attributes.insert(
                "constructor_cohort".to_string(),
                if idx % 2 == 0 { "A" } else { "B" }.to_string(),
            );
        }
        input.constraints = vec![
            Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "squared".to_string(),
                penalty_weight: 3.0,
            }),
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "g0".to_string(),
                attribute_key: "constructor_cohort".to_string(),
                desired_values: HashMap::from([
                    ("A".to_string(), (group_size / 2) as u32),
                    ("B".to_string(), (group_size - group_size / 2) as u32),
                ]),
                penalty_weight: 4.0,
                mode: AttributeBalanceMode::Exact,
                sessions: Some(vec![0, 1, 2]),
            }),
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p0".to_string(),
                group_id: "g1".to_string(),
                sessions: Some(vec![0, (weeks / 2) as u32, (weeks - 1) as u32]),
            }),
            Constraint::ImmovablePeople(ImmovablePeopleParams {
                people: vec!["p1".to_string(), "p2".to_string()],
                group_id: "g2".to_string(),
                sessions: Some(vec![1, (weeks - 1) as u32]),
            }),
            Constraint::MustStayTogether {
                people: vec!["p3".to_string(), "p4".to_string()],
                sessions: Some(vec![0, 1, 2]),
            },
            Constraint::ShouldStayTogether {
                people: vec!["p5".to_string(), "p6".to_string()],
                penalty_weight: 5.0,
                sessions: Some(vec![3, 4, 5]),
            },
            Constraint::ShouldNotBeTogether {
                people: vec!["p7".to_string(), "p8".to_string()],
                penalty_weight: 6.0,
                sessions: None,
            },
            Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p9".to_string(), "p10".to_string()],
                sessions: vec![1, 2, 3],
                target_meetings: 1,
                mode: PairMeetingMode::Exact,
                penalty_weight: 5.0,
            }),
        ];
        input
    }

    fn test_solver_configuration() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: "SimulatedAnnealing".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(100),
                time_limit_seconds: None,
                no_improvement_iterations: None,
                stop_on_optimal_score: false,
            },
            solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                initial_temperature: 1.0,
                final_temperature: 0.1,
                cooling_schedule: "geometric".to_string(),
                reheat_cycles: None,
                reheat_after_no_improvement: None,
            }),
            logging: LoggingOptions::default(),
            telemetry: TelemetryOptions::default(),
            seed: None,
            move_policy: None,
            allowed_sessions: None,
        }
    }
}
