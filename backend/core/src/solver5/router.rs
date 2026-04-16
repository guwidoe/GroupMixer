use super::families;
use super::portfolio::FamilyEvaluation;
use super::problem::PureSgpProblem;
use super::types::{ConstructionFamilyId, ConstructionQuality, ConstructionResult};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct FamilyAttempt {
    pub(super) family: ConstructionFamilyId,
    pub(super) status: FamilyAttemptStatus,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum FamilyAttemptStatus {
    NotApplicable {
        reason: &'static str,
    },
    ConstructionFailed {
        reason: &'static str,
    },
    RejectedAsWeaker {
        max_supported_weeks: usize,
        quality: ConstructionQuality,
        selected_family: ConstructionFamilyId,
    },
    InsufficientWeeks {
        requested_weeks: usize,
        max_supported_weeks: usize,
        quality: ConstructionQuality,
    },
    Selected {
        max_supported_weeks: usize,
        quality: ConstructionQuality,
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
                FamilyAttemptStatus::ConstructionFailed { reason } => {
                    format!("{}: construction failed ({})", attempt.family.label(), reason)
                }
                FamilyAttemptStatus::RejectedAsWeaker {
                    max_supported_weeks,
                    quality,
                    selected_family,
                } => format!(
                    "{}: candidate with max_supported_weeks={} and quality={} rejected in favor of {}",
                    attempt.family.label(),
                    max_supported_weeks,
                    quality_label(quality),
                    selected_family.label()
                ),
                FamilyAttemptStatus::InsufficientWeeks {
                    requested_weeks,
                    max_supported_weeks,
                    quality,
                } => format!(
                    "{}: requested {} weeks but family currently supports at most {} ({})",
                    attempt.family.label(),
                    requested_weeks,
                    max_supported_weeks,
                    quality_label(quality)
                ),
                FamilyAttemptStatus::Selected {
                    max_supported_weeks,
                    quality,
                } => format!(
                    "{}: selected with max_supported_weeks={} ({})",
                    attempt.family.label(),
                    max_supported_weeks,
                    quality_label(quality)
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

pub(super) fn attempt_construction(
    problem: &PureSgpProblem,
) -> Result<RouterDecision, RoutingFailure> {
    let registrations = families::registered_families();
    let mut non_candidate_attempts = Vec::new();
    let mut candidates = Vec::new();

    for (precedence, family) in registrations.iter().enumerate() {
        match family.evaluate(problem) {
            FamilyEvaluation::NotApplicable { reason } => non_candidate_attempts.push(FamilyAttempt {
                family: family.id(),
                status: FamilyAttemptStatus::NotApplicable { reason },
            }),
            FamilyEvaluation::Applicable { .. } => {
                let Some(result) = family.construct(problem) else {
                    non_candidate_attempts.push(FamilyAttempt {
                        family: family.id(),
                        status: FamilyAttemptStatus::ConstructionFailed {
                            reason: "evaluation said applicable but construction returned None",
                        },
                    });
                    continue;
                };
                candidates.push(CandidateRecord {
                    family: family.id(),
                    precedence,
                    result,
                });
            }
        }
    }

    let Some(best_idx) = best_candidate_index(&candidates) else {
        return Err(RoutingFailure {
            attempts: non_candidate_attempts,
        });
    };

    let selected_family = candidates[best_idx].family;
    let mut attempts = non_candidate_attempts;
    let mut selected_result = None;
    for (idx, candidate) in candidates.into_iter().enumerate() {
        let quality = candidate.result.metadata.quality.clone();
        if candidate.result.max_supported_weeks < problem.num_weeks {
            attempts.push(FamilyAttempt {
                family: candidate.family,
                status: FamilyAttemptStatus::InsufficientWeeks {
                    requested_weeks: problem.num_weeks,
                    max_supported_weeks: candidate.result.max_supported_weeks,
                    quality,
                },
            });
            continue;
        }

        if idx == best_idx {
            let max_supported_weeks = candidate.result.max_supported_weeks;
            selected_result = candidate.result.truncate_to_requested(problem.num_weeks);
            attempts.push(FamilyAttempt {
                family: candidate.family,
                status: FamilyAttemptStatus::Selected {
                    max_supported_weeks,
                    quality,
                },
            });
            continue;
        }

        attempts.push(FamilyAttempt {
            family: candidate.family,
            status: FamilyAttemptStatus::RejectedAsWeaker {
                max_supported_weeks: candidate.result.max_supported_weeks,
                quality,
                selected_family,
            },
        });
    }

    if let Some(result) = selected_result {
        return Ok(RouterDecision { result, attempts });
    }

    Err(RoutingFailure { attempts })
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct CandidateRecord {
    family: ConstructionFamilyId,
    precedence: usize,
    result: ConstructionResult,
}

fn best_candidate_index(candidates: &[CandidateRecord]) -> Option<usize> {
    let mut best_idx = None;
    for (idx, candidate) in candidates.iter().enumerate() {
        match best_idx {
            None => best_idx = Some(idx),
            Some(current_best_idx)
                if candidate_outranks(candidate, &candidates[current_best_idx]) =>
            {
                best_idx = Some(idx)
            }
            Some(_) => {}
        }
    }
    best_idx
}

fn candidate_outranks(left: &CandidateRecord, right: &CandidateRecord) -> bool {
    left.result.max_supported_weeks > right.result.max_supported_weeks
        || (left.result.max_supported_weeks == right.result.max_supported_weeks
            && quality_rank(&left.result.metadata.quality)
                > quality_rank(&right.result.metadata.quality))
        || (left.result.max_supported_weeks == right.result.max_supported_weeks
            && quality_rank(&left.result.metadata.quality)
                == quality_rank(&right.result.metadata.quality)
            && left.precedence < right.precedence)
}

fn quality_rank(quality: &ConstructionQuality) -> usize {
    match quality {
        ConstructionQuality::ExactFrontier => 3_000_000,
        ConstructionQuality::NearFrontier { missing_weeks } => 2_000_000 - missing_weeks,
        ConstructionQuality::LowerBound { gap_to_counting_bound } => {
            1_000_000 - gap_to_counting_bound
        }
    }
}

fn quality_label(quality: &ConstructionQuality) -> String {
    match quality {
        ConstructionQuality::ExactFrontier => "exact_frontier".to_string(),
        ConstructionQuality::NearFrontier { missing_weeks } => {
            format!("near_frontier(missing={missing_weeks})")
        }
        ConstructionQuality::LowerBound {
            gap_to_counting_bound,
        } => format!("lower_bound(gap={gap_to_counting_bound})"),
    }
}
