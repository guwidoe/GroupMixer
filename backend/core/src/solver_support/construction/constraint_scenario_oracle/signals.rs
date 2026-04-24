use crate::solver3::compiled_problem::{CompiledProblem, PackedSchedule};

#[cfg(test)]
use super::types::ConstraintScenarioEnsemble;
use super::types::{ConstraintScenarioScaffoldMask, ConstraintScenarioSignals};

/// Returns whether repeat/contact pressure is relevant enough to use this constructor family.
pub(crate) fn repeat_pressure_is_relevant(compiled: &CompiledProblem) -> bool {
    let repeat_penalty_relevant = compiled
        .repeat_encounter
        .as_ref()
        .map(|repeat| repeat.penalty_weight > 0.0)
        .unwrap_or(false);
    repeat_penalty_relevant || compiled.maximize_unique_contacts_weight > 0.0
}

/// Extracts session-local pair pressure, placement histograms, and rigidity from the CS ensemble.
#[cfg(test)]
pub(crate) fn extract_constraint_scenario_signals(
    compiled: &CompiledProblem,
    ensemble: &ConstraintScenarioEnsemble,
) -> ConstraintScenarioSignals {
    let weights = normalized_candidate_weights(ensemble);
    let mut pair_pressure_by_session_pair = vec![0.0; compiled.num_sessions * compiled.num_pairs];
    let mut placement_histogram_by_person_session_group =
        vec![0.0; compiled.num_sessions * compiled.num_people * compiled.num_groups];

    for (candidate, weight) in ensemble.candidates.iter().zip(weights.iter().copied()) {
        accumulate_schedule_signals(
            compiled,
            &candidate.schedule,
            weight,
            &mut pair_pressure_by_session_pair,
            &mut placement_histogram_by_person_session_group,
        );
    }

    build_signals_from_accumulated_histograms(
        compiled,
        pair_pressure_by_session_pair,
        placement_histogram_by_person_session_group,
        SignalRigidityMode::EnsembleEntropy,
    )
}

/// Extracts CS structure from the single full-objective warmup scaffold.
///
/// With only one scaffold there is no ensemble consensus, so rigidity must stay neutral/flexible:
/// the placement histogram is still a useful soft prior, but it must not make every placement look
/// structurally frozen.
pub(crate) fn extract_constraint_scenario_signals_from_scaffold(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
) -> ConstraintScenarioSignals {
    let mut pair_pressure_by_session_pair = vec![0.0; compiled.num_sessions * compiled.num_pairs];
    let mut placement_histogram_by_person_session_group =
        vec![0.0; compiled.num_sessions * compiled.num_people * compiled.num_groups];

    accumulate_schedule_signals(
        compiled,
        scaffold,
        1.0,
        &mut pair_pressure_by_session_pair,
        &mut placement_histogram_by_person_session_group,
    );

    build_signals_from_accumulated_histograms(
        compiled,
        pair_pressure_by_session_pair,
        placement_histogram_by_person_session_group,
        SignalRigidityMode::SingleScaffoldFlexible,
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SignalRigidityMode {
    #[cfg(test)]
    EnsembleEntropy,
    SingleScaffoldFlexible,
}

fn build_signals_from_accumulated_histograms(
    compiled: &CompiledProblem,
    pair_pressure_by_session_pair: Vec<f64>,
    placement_histogram_by_person_session_group: Vec<f64>,
    rigidity_mode: SignalRigidityMode,
) -> ConstraintScenarioSignals {
    let mut rigidity_by_person_session = vec![0.0; compiled.num_sessions * compiled.num_people];
    let mut rigid_placement_count = 0usize;
    let mut flexible_placement_count = 0usize;
    for session_idx in 0..compiled.num_sessions {
        for person_idx in 0..compiled.num_people {
            let slot = compiled.person_session_slot(session_idx, person_idx);
            if !compiled.person_participation[person_idx][session_idx] {
                rigidity_by_person_session[slot] = 1.0;
                continue;
            }
            let rigidity = match rigidity_mode {
                #[cfg(test)]
                SignalRigidityMode::EnsembleEntropy => placement_rigidity(
                    compiled,
                    &placement_histogram_by_person_session_group,
                    session_idx,
                    person_idx,
                ),
                SignalRigidityMode::SingleScaffoldFlexible => 0.0,
            };
            rigidity_by_person_session[slot] = rigidity;
            if rigidity >= 0.75 {
                rigid_placement_count += 1;
            } else {
                flexible_placement_count += 1;
            }
        }
    }

    ConstraintScenarioSignals {
        pair_pressure_by_session_pair,
        placement_histogram_by_person_session_group,
        rigidity_by_person_session,
        rigid_placement_count,
        flexible_placement_count,
    }
}

/// Classifies the best CS scaffold into structurally frozen and flexible placements.
pub(crate) fn build_constraint_scenario_scaffold_mask(
    compiled: &CompiledProblem,
    scaffold: &PackedSchedule,
    _signals: &ConstraintScenarioSignals,
) -> ConstraintScenarioScaffoldMask {
    let mut frozen_by_person_session = vec![false; compiled.num_sessions * compiled.num_people];
    let mut rigid_placement_count = 0usize;
    let mut flexible_placement_count = 0usize;

    for session_idx in 0..compiled.num_sessions {
        for person_idx in 0..compiled.num_people {
            if !compiled.person_participation[person_idx][session_idx] {
                continue;
            }
            let slot = compiled.person_session_slot(session_idx, person_idx);
            let frozen = compiled.immovable_group(session_idx, person_idx).is_some()
                || participates_in_active_clique(compiled, session_idx, person_idx);
            frozen_by_person_session[slot] = frozen;
            if frozen {
                rigid_placement_count += 1;
            } else if placement_exists(scaffold, session_idx, person_idx) {
                flexible_placement_count += 1;
            }
        }
    }

    ConstraintScenarioScaffoldMask {
        frozen_by_person_session,
        rigid_placement_count,
        flexible_placement_count,
    }
}

fn participates_in_active_clique(
    compiled: &CompiledProblem,
    session_idx: usize,
    person_idx: usize,
) -> bool {
    let Some(clique_idx) = compiled.person_to_clique_id[session_idx][person_idx] else {
        return false;
    };
    let clique = &compiled.cliques[clique_idx];
    let active_members = clique
        .members
        .iter()
        .copied()
        .filter(|&member| compiled.person_participation[member][session_idx])
        .count();
    active_members >= 2
}

fn placement_exists(scaffold: &PackedSchedule, session_idx: usize, person_idx: usize) -> bool {
    scaffold
        .get(session_idx)
        .into_iter()
        .flat_map(|groups| groups.iter())
        .any(|members| members.contains(&person_idx))
}

#[cfg(test)]
fn normalized_candidate_weights(ensemble: &ConstraintScenarioEnsemble) -> Vec<f64> {
    let best_score = ensemble.best().cs_score;
    let mut weights = ensemble
        .candidates
        .iter()
        .map(|candidate| {
            if candidate.cs_score.is_finite() && best_score.is_finite() {
                1.0 / (1.0 + (candidate.cs_score - best_score).max(0.0))
            } else {
                1.0
            }
        })
        .collect::<Vec<_>>();
    let total = weights.iter().sum::<f64>();
    if total > 0.0 {
        for weight in &mut weights {
            *weight /= total;
        }
    }
    weights
}

fn accumulate_schedule_signals(
    compiled: &CompiledProblem,
    schedule: &PackedSchedule,
    weight: f64,
    pair_pressure_by_session_pair: &mut [f64],
    placement_histogram_by_person_session_group: &mut [f64],
) {
    for session_idx in 0..compiled.num_sessions.min(schedule.len()) {
        for group_idx in 0..compiled.num_groups.min(schedule[session_idx].len()) {
            let members = &schedule[session_idx][group_idx];
            for &person_idx in members {
                if person_idx < compiled.num_people {
                    let idx = (session_idx * compiled.num_people + person_idx)
                        * compiled.num_groups
                        + group_idx;
                    placement_histogram_by_person_session_group[idx] += weight;
                }
            }
            for left in 0..members.len() {
                for right in (left + 1)..members.len() {
                    let a = members[left];
                    let b = members[right];
                    if a < compiled.num_people && b < compiled.num_people && a != b {
                        let pair_idx = compiled.pair_idx(a, b);
                        pair_pressure_by_session_pair
                            [session_idx * compiled.num_pairs + pair_idx] += weight;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
fn placement_rigidity(
    compiled: &CompiledProblem,
    placement_histogram_by_person_session_group: &[f64],
    session_idx: usize,
    person_idx: usize,
) -> f64 {
    let mut mass = 0.0;
    let mut entropy = 0.0;
    for group_idx in 0..compiled.num_groups {
        let p = placement_histogram_by_person_session_group
            [(session_idx * compiled.num_people + person_idx) * compiled.num_groups + group_idx];
        mass += p;
        if p > 0.0 {
            entropy -= p * p.ln();
        }
    }
    if mass <= 0.0 || compiled.num_groups <= 1 {
        return 1.0;
    }
    let max_entropy = (compiled.num_groups as f64).ln();
    if max_entropy <= 0.0 {
        1.0
    } else {
        (1.0 - entropy / max_entropy).clamp(0.0, 1.0)
    }
}
