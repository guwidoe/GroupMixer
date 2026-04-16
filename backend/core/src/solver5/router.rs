use super::families;
use super::field::FiniteField;
use super::problem::PureSgpProblem;
use super::types::{ConstructionFamilyId, ConstructionResult};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct FamilyAttempt {
    pub(super) family: ConstructionFamilyId,
    pub(super) status: FamilyAttemptStatus,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum FamilyAttemptStatus {
    NotApplicable { reason: &'static str },
    InsufficientWeeks {
        requested_weeks: usize,
        max_supported_weeks: usize,
    },
    Selected {
        max_supported_weeks: usize,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct RouterDecision {
    pub(super) result: ConstructionResult,
    pub(super) attempts: Vec<FamilyAttempt>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct RoutingFailure {
    attempts: Vec<FamilyAttempt>,
}

impl RoutingFailure {
    pub(super) fn attempts(&self) -> &[FamilyAttempt] {
        &self.attempts
    }

    pub(super) fn to_solver_error_message(&self, problem: &PureSgpProblem) -> String {
        let details = self
            .attempts
            .iter()
            .map(|attempt| match &attempt.status {
                FamilyAttemptStatus::NotApplicable { reason } => {
                    format!("{}: {}", attempt.family.label(), reason)
                }
                FamilyAttemptStatus::InsufficientWeeks {
                    requested_weeks,
                    max_supported_weeks,
                } => format!(
                    "{}: requested {} weeks but family currently supports at most {}",
                    attempt.family.label(),
                    requested_weeks,
                    max_supported_weeks
                ),
                FamilyAttemptStatus::Selected { max_supported_weeks } => format!(
                    "{}: selected with max_supported_weeks={}",
                    attempt.family.label(),
                    max_supported_weeks
                ),
            })
            .collect::<Vec<_>>()
            .join("; ");

        format!(
            "solver5 does not yet have a construction family for {}-{}-{}; router attempts: {}",
            problem.num_groups, problem.group_size, problem.num_weeks, details
        )
    }
}

pub(super) fn attempt_construction(problem: &PureSgpProblem) -> Result<RouterDecision, RoutingFailure> {
    let field = FiniteField::for_order(problem.num_groups);
    let mut attempts = Vec::new();

    if problem.group_size == 2 {
        return select(
            families::construct_round_robin(problem.num_groups),
            problem,
            &mut attempts,
        );
    }
    attempts.push(FamilyAttempt {
        family: ConstructionFamilyId::RoundRobin,
        status: FamilyAttemptStatus::NotApplicable {
            reason: "requires group_size == 2",
        },
    });

    match field {
        Some(field) if problem.group_size == 3 && problem.num_groups % 6 == 1 => {
            if let Ok(decision) = select(
                families::construct_kirkman_6t_plus_1(&field),
                problem,
                &mut attempts,
            ) {
                return Ok(decision);
            }
        }
        Some(_) if problem.group_size != 3 => attempts.push(FamilyAttempt {
            family: ConstructionFamilyId::Kirkman6TPlus1,
            status: FamilyAttemptStatus::NotApplicable {
                reason: "requires group_size == 3",
            },
        }),
        Some(_) => attempts.push(FamilyAttempt {
            family: ConstructionFamilyId::Kirkman6TPlus1,
            status: FamilyAttemptStatus::NotApplicable {
                reason: "requires num_groups ≡ 1 (mod 6)",
            },
        }),
        None => attempts.push(FamilyAttempt {
            family: ConstructionFamilyId::Kirkman6TPlus1,
            status: FamilyAttemptStatus::NotApplicable {
                reason: "requires supported prime-power group count",
            },
        }),
    }

    match field {
        Some(field) if problem.group_size == problem.num_groups => {
            if let Ok(decision) = select(
                families::construct_affine_plane(&field),
                problem,
                &mut attempts,
            ) {
                return Ok(decision);
            }
        }
        Some(_) => attempts.push(FamilyAttempt {
            family: ConstructionFamilyId::AffinePlanePrimePower,
            status: FamilyAttemptStatus::NotApplicable {
                reason: "requires group_size == num_groups",
            },
        }),
        None => attempts.push(FamilyAttempt {
            family: ConstructionFamilyId::AffinePlanePrimePower,
            status: FamilyAttemptStatus::NotApplicable {
                reason: "requires supported prime-power group count",
            },
        }),
    }

    match field {
        Some(field) if (3..=problem.num_groups).contains(&problem.group_size) => {
            if let Ok(decision) = select(
                families::construct_transversal_design_portfolio(
                    problem.num_groups,
                    problem.group_size,
                    &field,
                ),
                problem,
                &mut attempts,
            ) {
                return Ok(decision);
            }
        }
        Some(_) => attempts.push(FamilyAttempt {
            family: ConstructionFamilyId::TransversalDesignPrimePower,
            status: FamilyAttemptStatus::NotApplicable {
                reason: "requires 3 <= group_size <= num_groups",
            },
        }),
        None => attempts.push(FamilyAttempt {
            family: ConstructionFamilyId::TransversalDesignPrimePower,
            status: FamilyAttemptStatus::NotApplicable {
                reason: "requires supported prime-power group count",
            },
        }),
    }

    Err(RoutingFailure { attempts })
}

fn select(
    result: ConstructionResult,
    problem: &PureSgpProblem,
    attempts: &mut Vec<FamilyAttempt>,
) -> Result<RouterDecision, RoutingFailure> {
    let family = result.family;
    let max_supported_weeks = result.max_supported_weeks;
    if let Some(result) = result.truncate_to_requested(problem.num_weeks) {
        attempts.push(FamilyAttempt {
            family,
            status: FamilyAttemptStatus::Selected { max_supported_weeks },
        });
        return Ok(RouterDecision {
            result,
            attempts: attempts.clone(),
        });
    }

    attempts.push(FamilyAttempt {
        family,
        status: FamilyAttemptStatus::InsufficientWeeks {
            requested_weeks: problem.num_weeks,
            max_supported_weeks,
        },
    });
    Err(RoutingFailure {
        attempts: attempts.clone(),
    })
}
