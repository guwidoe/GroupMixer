use std::cmp::Ordering;

use super::super::archive::{
    build_session_conflict_burden, build_session_fingerprints, ArchivedElite, EliteArchive,
    EliteArchiveConfig,
};
use super::super::context::DonorSessionTransplantConfig;
use super::super::runtime_state::RuntimeState;
use super::types::{
    DonorCandidatePool, DonorSessionChoice, DonorSessionSelectionOutcome, DonorSessionViabilityTier,
};

pub(crate) fn archive_config_for_donor_session_mode(
    config: DonorSessionTransplantConfig,
) -> EliteArchiveConfig {
    EliteArchiveConfig {
        capacity: config.archive_size,
        near_duplicate_session_threshold: 1,
    }
}

pub(crate) fn select_donor_session(
    base_state: &RuntimeState,
    archive: &EliteArchive,
) -> Option<DonorSessionChoice> {
    let base_session_fingerprints = build_session_fingerprints(base_state);
    let base_session_conflict_burden = build_session_conflict_burden(base_state);
    match select_donor_session_from_summary(
        &base_session_fingerprints,
        &base_session_conflict_burden,
        archive,
    ) {
        DonorSessionSelectionOutcome::Selected(choice) => Some(choice),
        DonorSessionSelectionOutcome::NoViableDonor
        | DonorSessionSelectionOutcome::NoViableSession => None,
    }
}

pub(super) fn select_donor_session_from_summary(
    base_session_fingerprints: &[u64],
    base_session_conflict_burden: &[u32],
    archive: &EliteArchive,
) -> DonorSessionSelectionOutcome {
    if archive.entries().is_empty() {
        return DonorSessionSelectionOutcome::NoViableDonor;
    }

    let mut ranked_archive_indices = (0..archive.entries().len()).collect::<Vec<_>>();
    ranked_archive_indices.sort_by(|left, right| {
        archive.entries()[*left]
            .score
            .total_cmp(&archive.entries()[*right].score)
            .then_with(|| left.cmp(right))
    });

    let competitive_count = ranked_archive_indices.len().div_ceil(2);
    let competitive_indices = ranked_archive_indices
        .iter()
        .copied()
        .take(competitive_count)
        .collect::<Vec<_>>();
    let mut found_viable_donor = false;

    for (candidate_pool, session_viability_tier, candidate_indices) in [
        (
            DonorCandidatePool::CompetitiveHalf,
            DonorSessionViabilityTier::StrictImproving,
            competitive_indices.as_slice(),
        ),
        (
            DonorCandidatePool::FullArchive,
            DonorSessionViabilityTier::StrictImproving,
            ranked_archive_indices.as_slice(),
        ),
        (
            DonorCandidatePool::CompetitiveHalf,
            DonorSessionViabilityTier::NonWorsening,
            competitive_indices.as_slice(),
        ),
        (
            DonorCandidatePool::FullArchive,
            DonorSessionViabilityTier::NonWorsening,
            ranked_archive_indices.as_slice(),
        ),
        (
            DonorCandidatePool::CompetitiveHalf,
            DonorSessionViabilityTier::AnyDiffering,
            competitive_indices.as_slice(),
        ),
        (
            DonorCandidatePool::FullArchive,
            DonorSessionViabilityTier::AnyDiffering,
            ranked_archive_indices.as_slice(),
        ),
    ] {
        let mut best_choice = None;
        for &archive_idx in candidate_indices {
            let donor = &archive.entries()[archive_idx];
            let session_disagreement_count = donor
                .session_fingerprints
                .iter()
                .zip(base_session_fingerprints.iter())
                .filter(|(left, right)| left != right)
                .count();

            if session_disagreement_count <= archive.near_duplicate_session_threshold() {
                continue;
            }
            found_viable_donor = true;

            let Some(choice) = best_session_choice_for_donor(
                archive_idx,
                donor,
                session_disagreement_count,
                candidate_pool,
                session_viability_tier,
                base_session_fingerprints,
                base_session_conflict_burden,
            ) else {
                continue;
            };

            let should_replace = best_choice
                .as_ref()
                .is_none_or(|best: &DonorSessionChoice| {
                    compare_donor_session_choice(&choice, best).then_with(|| {
                        archive.entries()[best.donor_archive_idx]
                            .score
                            .total_cmp(&archive.entries()[choice.donor_archive_idx].score)
                    }) == Ordering::Greater
                });
            if should_replace {
                best_choice = Some(choice);
            }
        }

        if let Some(choice) = best_choice {
            return DonorSessionSelectionOutcome::Selected(choice);
        }
    }

    match found_viable_donor {
        true => DonorSessionSelectionOutcome::NoViableSession,
        false => DonorSessionSelectionOutcome::NoViableDonor,
    }
}

fn best_session_choice_for_donor(
    archive_idx: usize,
    donor: &ArchivedElite,
    session_disagreement_count: usize,
    candidate_pool: DonorCandidatePool,
    session_viability_tier: DonorSessionViabilityTier,
    base_session_fingerprints: &[u64],
    base_session_conflict_burden: &[u32],
) -> Option<DonorSessionChoice> {
    donor
        .session_fingerprints
        .iter()
        .zip(donor.session_conflict_burden.iter())
        .zip(
            base_session_fingerprints
                .iter()
                .zip(base_session_conflict_burden.iter()),
        )
        .enumerate()
        .filter_map(
            |(
                session_idx,
                (
                    (donor_fingerprint, donor_conflict_burden),
                    (base_fingerprint, base_conflict_burden),
                ),
            )| {
                if donor_fingerprint == base_fingerprint {
                    return None;
                }
                let conflict_burden_delta =
                    i64::from(*base_conflict_burden) - i64::from(*donor_conflict_burden);
                if !session_viability_tier.allows(conflict_burden_delta) {
                    return None;
                }
                Some(DonorSessionChoice {
                    donor_archive_idx: archive_idx,
                    session_idx,
                    session_disagreement_count,
                    candidate_pool,
                    session_viability_tier,
                    conflict_burden_delta,
                })
            },
        )
        .max_by(|left, right| {
            left.conflict_burden_delta
                .cmp(&right.conflict_burden_delta)
                .then_with(|| left.session_idx.cmp(&right.session_idx).reverse())
        })
}

fn compare_donor_session_choice(left: &DonorSessionChoice, right: &DonorSessionChoice) -> Ordering {
    left.session_disagreement_count
        .cmp(&right.session_disagreement_count)
        .then_with(|| left.conflict_burden_delta.cmp(&right.conflict_burden_delta))
        .then_with(|| right.donor_archive_idx.cmp(&left.donor_archive_idx))
}
