//! Constraint-aware oracle projection scaffold.
//!
//! This module is intentionally parallel to the current projection implementation. It is the
//! staging point for treating projection as a symmetry-aware relabeling problem: constraints
//! generate typed candidate atoms in the oracle schedule, and a later reconciliation step will pick
//! a compatible set of atoms to seed/optimize oracle-person, oracle-session, and oracle-group
//! mappings before merge applies destructive schedule edits.
//!
//! The entry point currently preserves legacy projection behavior after building these typed atoms.
//! That keeps the scaffold benchmark-neutral while giving the replacement algorithm explicit data
//! structures to grow into.

mod atoms;
mod builders;
mod deadline;
mod oracle_index;
mod relabeling;

use crate::solver3::compiled_problem::CompiledProblem;
use crate::solver_support::constraint_presolve::presolve_constraints;
use crate::solver_support::SolverError;

use super::projection::project_oracle_schedule_to_template;
use super::types::{
    ConstraintScenarioScaffoldMask, ConstraintScenarioSignals, OracleTemplateCandidate,
    OracleTemplateProjectionResult, PureStructureOracleSchedule,
};
use builders::build_projection_atoms;
use deadline::RelabelingSearchBudget;
use relabeling::search_best_relabeling_within_budget;

/// Experimental projection entry point for constraint-aware relabeling research.
///
/// Today it delegates to the established projection after building typed projection atoms. The
/// atom generation is deliberately real, not a placeholder: each symmetry-breaking constraint
/// produces candidates over oracle-local people/session/group structures without prematurely
/// treating real names as fixed anchors.
pub(crate) fn project_oracle_schedule_to_template_constraint_aware(
    compiled: &CompiledProblem,
    signals: &ConstraintScenarioSignals,
    mask: &ConstraintScenarioScaffoldMask,
    candidate: &OracleTemplateCandidate,
    oracle_schedule: &PureStructureOracleSchedule,
    relabeling_timeout_seconds: Option<f64>,
) -> Result<OracleTemplateProjectionResult, SolverError> {
    let presolved = presolve_constraints(compiled)?;
    let atoms = build_projection_atoms(compiled, candidate, &oracle_schedule.schedule);
    let relabeling = search_best_relabeling_within_budget(
        compiled,
        candidate,
        &atoms,
        RelabelingSearchBudget::from_remaining_seconds(relabeling_timeout_seconds),
    );
    let projection =
        project_oracle_schedule_to_template(compiled, signals, mask, candidate, oracle_schedule)?;
    debug_assert!(presolved.is_shape_compatible(compiled));
    debug_assert!(atoms.is_shape_compatible(compiled, candidate));
    debug_assert!(relabeling.best.is_shape_compatible(compiled, candidate));
    debug_assert!(relabeling.elapsed_seconds >= 0.0);
    let _ = (
        relabeling.timed_out,
        relabeling.atoms_considered,
        relabeling.atoms_accepted,
    );
    Ok(projection)
}

#[cfg(test)]
mod diagnostic_metrics {
    use super::*;
    use crate::models::ApiInput;
    use crate::solver_support::construction::constraint_scenario_oracle::{
        PureStructureOracle, PureStructureOracleRequest, Solver6PureStructureOracle,
    };
    use serde::Deserialize;
    use std::collections::{BTreeMap, BTreeSet};
    use std::fs;

    const DEFAULT_RELABELING_DIAGNOSTIC_TIMEOUT_SECONDS: f64 = 5.0;

    #[derive(Deserialize)]
    struct DiagnosticCaseManifest {
        id: String,
        input: ApiInput,
    }

    #[test]
    fn relabeling_projection_diagnostic_metrics() {
        let Ok(case_paths) = std::env::var("GROUPMIXER_RELABELING_CASES") else {
            eprintln!(
                "skipping relabeling_projection_diagnostic_metrics; \
                 GROUPMIXER_RELABELING_CASES is not set"
            );
            return;
        };
        let timeout_seconds = std::env::var("GROUPMIXER_RELABELING_TIMEOUT_SECONDS")
            .ok()
            .and_then(|value| value.parse::<f64>().ok())
            .filter(|value| value.is_finite() && *value >= 0.0)
            .unwrap_or(DEFAULT_RELABELING_DIAGNOSTIC_TIMEOUT_SECONDS);

        let mut weighted_loss_sum = 0.0;
        let mut weighted_anchor_loss_sum = 0.0;
        let mut weight_sum = 0.0;
        let mut total_atoms = 0usize;
        let mut total_atoms_considered = 0usize;
        let mut total_atoms_accepted = 0usize;
        let mut total_covered_units = 0usize;
        let mut total_uncovered_units = 0usize;
        let mut timed_out_count = 0usize;
        let mut hard_cost_sum = 0.0;
        let mut soft_cost_sum = 0.0;
        let mut mapping_incomplete_sum = 0.0;

        for raw_path in case_paths.split(':').filter(|path| !path.is_empty()) {
            let manifest = read_case_manifest(raw_path);
            let mut input = manifest.input;
            let seed = input.solver.seed.unwrap_or(1691314);
            input.solver =
                crate::default_solver_configuration_for(crate::models::SolverKind::Solver3);
            input.solver.seed = Some(seed);
            let compiled = CompiledProblem::compile(&input)
                .unwrap_or_else(|error| panic!("failed to compile {}: {error}", manifest.id));
            let candidate = full_problem_oracle_candidate(&compiled);
            let oracle_schedule = Solver6PureStructureOracle
                .solve(&PureStructureOracleRequest {
                    num_groups: candidate.num_groups,
                    group_size: candidate.group_size,
                    num_sessions: candidate.num_sessions(),
                    seed,
                })
                .unwrap_or_else(|error| {
                    panic!("solver6 oracle failed for {}: {error}", manifest.id)
                });
            let atoms = build_projection_atoms(&compiled, &candidate, &oracle_schedule.schedule);
            let result = search_best_relabeling_within_budget(
                &compiled,
                &candidate,
                &atoms,
                RelabelingSearchBudget::from_remaining_seconds(Some(timeout_seconds)),
            );
            let score = result.best.score();
            let coverage_units =
                score.coverage.covered_constraint_units + score.coverage.uncovered_constraint_units;
            let coverage_loss = if coverage_units == 0 {
                0.0
            } else {
                score.coverage.uncovered_constraint_units as f64 / coverage_units as f64
            };
            let mapping_loss = mapping_loss(score);
            let anchor_mapping_loss = anchored_mapping_loss(&compiled, &candidate, &result.best);
            let compatibility_loss = (score.hard_compatibility_cost + score.soft_penalty_cost)
                .max(0.0)
                .ln_1p()
                / 10.0;
            let timeout_loss = if result.timed_out { 1.0 } else { 0.0 };
            let case_loss =
                10.0 * coverage_loss + 3.0 * mapping_loss + compatibility_loss + 2.0 * timeout_loss;
            let case_anchor_loss = 10.0 * coverage_loss
                + 3.0 * anchor_mapping_loss
                + compatibility_loss
                + 2.0 * timeout_loss;
            let weight = diagnostic_case_weight(&manifest.id);

            weighted_loss_sum += weight * case_loss;
            weighted_anchor_loss_sum += weight * case_anchor_loss;
            weight_sum += weight;
            total_atoms += atoms.atoms.len();
            total_atoms_considered += result.atoms_considered;
            total_atoms_accepted += result.atoms_accepted;
            total_covered_units += score.coverage.covered_constraint_units;
            total_uncovered_units += score.coverage.uncovered_constraint_units;
            timed_out_count += usize::from(result.timed_out);
            hard_cost_sum += score.hard_compatibility_cost;
            soft_cost_sum += score.soft_penalty_cost;
            mapping_incomplete_sum += score.mapping_incompleteness_cost;

            println!(
                "RELABEL_CASE {} loss={:.9} anchor_loss={:.9} coverage_loss={:.9} mapping_loss={:.9} anchor_mapping_loss={:.9} hard_cost={:.6} soft_cost={:.6} atoms={} accepted={} timed_out={}",
                manifest.id,
                case_loss,
                case_anchor_loss,
                coverage_loss,
                mapping_loss,
                anchor_mapping_loss,
                score.hard_compatibility_cost,
                score.soft_penalty_cost,
                atoms.atoms.len(),
                result.atoms_accepted,
                result.timed_out,
            );
            println!(
                "METRIC {}={:.9}",
                metric_name_for_case(&manifest.id),
                case_loss
            );
            println!(
                "METRIC {}={:.9}",
                anchor_metric_name_for_case(&manifest.id),
                case_anchor_loss
            );
        }

        let relabeling_factor_loss = if weight_sum == 0.0 {
            0.0
        } else {
            weighted_loss_sum / weight_sum
        };
        let relabeling_anchor_loss = if weight_sum == 0.0 {
            0.0
        } else {
            weighted_anchor_loss_sum / weight_sum
        };
        let total_units = total_covered_units + total_uncovered_units;
        let coverage_rate = if total_units == 0 {
            1.0
        } else {
            total_covered_units as f64 / total_units as f64
        };
        let atom_acceptance_rate = if total_atoms_considered == 0 {
            0.0
        } else {
            total_atoms_accepted as f64 / total_atoms_considered as f64
        };

        println!("METRIC relabeling_anchor_loss={relabeling_anchor_loss:.9}");
        println!("METRIC relabeling_factor_loss={relabeling_factor_loss:.9}");
        println!("METRIC relabeling_coverage_rate={coverage_rate:.9}");
        println!("METRIC relabeling_total_atoms={total_atoms}");
        println!("METRIC relabeling_atoms_considered={total_atoms_considered}");
        println!("METRIC relabeling_atoms_accepted={total_atoms_accepted}");
        println!("METRIC relabeling_atom_acceptance_rate={atom_acceptance_rate:.9}");
        println!("METRIC relabeling_covered_units={total_covered_units}");
        println!("METRIC relabeling_uncovered_units={total_uncovered_units}");
        println!("METRIC relabeling_timed_out_count={timed_out_count}");
        println!("METRIC relabeling_hard_cost_sum={hard_cost_sum:.9}");
        println!("METRIC relabeling_soft_cost_sum={soft_cost_sum:.9}");
        println!("METRIC relabeling_mapping_incomplete_sum={mapping_incomplete_sum:.9}");
    }

    fn read_case_manifest(path: &str) -> DiagnosticCaseManifest {
        let raw = fs::read_to_string(path)
            .unwrap_or_else(|error| panic!("failed to read diagnostic case {path}: {error}"));
        serde_json::from_str(&raw)
            .unwrap_or_else(|error| panic!("failed to parse diagnostic case {path}: {error}"))
    }

    fn full_problem_oracle_candidate(compiled: &CompiledProblem) -> OracleTemplateCandidate {
        let num_groups = compiled.num_groups;
        let group_size = compiled.num_people / compiled.num_groups.max(1);
        OracleTemplateCandidate {
            sessions: (0..compiled.num_sessions).collect(),
            groups_by_session: (0..compiled.num_sessions)
                .map(|_| (0..compiled.num_groups).collect())
                .collect(),
            num_groups,
            group_size,
            oracle_capacity: num_groups * group_size,
            stable_people_count: compiled.num_people,
            high_attendance_people_count: compiled.num_people,
            dummy_oracle_people: compiled.num_people.saturating_sub(num_groups * group_size),
            omitted_high_attendance_people: 0,
            omitted_group_count: 0,
            scaffold_disruption_risk: 0.0,
            estimated_score: 0.0,
        }
    }

    fn mapping_loss(score: &relabeling::RelabelingScore) -> f64 {
        let people_total = score.mapping.mapped_people + score.mapping.unmapped_people;
        let sessions_total = score.mapping.mapped_sessions + score.mapping.unmapped_sessions;
        let slots_total = score.mapping.mapped_slots + score.mapping.unmapped_slots;
        let people_loss = ratio(score.mapping.unmapped_people, people_total);
        let session_loss = ratio(score.mapping.unmapped_sessions, sessions_total);
        let slot_loss = ratio(score.mapping.unmapped_slots, slots_total);
        (people_loss + session_loss + slot_loss) / 3.0
    }

    fn anchored_mapping_loss(
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
        relabeling: &relabeling::ProjectionRelabeling,
    ) -> f64 {
        let targets = identifiable_mapping_targets(compiled, candidate);
        let mut loss_sum = 0.0;
        let mut loss_dimensions = 0usize;

        if !targets.people.is_empty() {
            let unmapped = targets
                .people
                .iter()
                .filter(|&&person| !relabeling.maps_real_person(person))
                .count();
            loss_sum += ratio(unmapped, targets.people.len());
            loss_dimensions += 1;
        }
        if !targets.sessions.is_empty() {
            let unmapped = targets
                .sessions
                .iter()
                .filter(|&&session| !relabeling.maps_real_session(session))
                .count();
            loss_sum += ratio(unmapped, targets.sessions.len());
            loss_dimensions += 1;
        }
        if !targets.slots.is_empty() {
            let unmapped = targets
                .slots
                .iter()
                .filter(|&&(session, group)| {
                    !relabeling.maps_real_group_slot(compiled, session, group)
                })
                .count();
            loss_sum += ratio(unmapped, targets.slots.len());
            loss_dimensions += 1;
        }

        if loss_dimensions == 0 {
            0.0
        } else {
            loss_sum / loss_dimensions as f64
        }
    }

    struct IdentifiableMappingTargets {
        people: BTreeSet<usize>,
        sessions: BTreeSet<usize>,
        slots: BTreeSet<(usize, usize)>,
    }

    fn identifiable_mapping_targets(
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> IdentifiableMappingTargets {
        let mut people = BTreeSet::new();
        let mut sessions = BTreeSet::new();
        let mut slots = BTreeSet::new();

        for person in 0..compiled.num_people {
            let clique_count = compiled
                .cliques
                .iter()
                .filter(|clique| clique.members.contains(&person))
                .count();
            let immovable_count = compiled
                .immovable_assignments
                .iter()
                .filter(|assignment| assignment.person_idx == person)
                .count();
            if clique_count > 1 || immovable_count > 2 {
                people.insert(person);
            }
        }

        for assignment in &compiled.immovable_assignments {
            if candidate.sessions.contains(&assignment.session_idx) {
                sessions.insert(assignment.session_idx);
                slots.insert((assignment.session_idx, assignment.group_idx));
            }
        }

        for clique in &compiled.cliques {
            for session in active_sessions_for_diagnostic(
                clique.sessions.as_deref(),
                compiled.num_sessions,
                candidate,
            ) {
                sessions.insert(session);
            }
        }

        for constraint in &compiled.attribute_balance_constraints {
            for session in active_sessions_for_diagnostic(
                constraint.sessions.as_deref(),
                compiled.num_sessions,
                candidate,
            ) {
                sessions.insert(session);
                for &group in &constraint.target_group_indices {
                    slots.insert((session, group));
                }
            }
        }

        for (session, group, _) in
            capacity_symmetry_breaking_slots_for_diagnostic(compiled, candidate)
        {
            sessions.insert(session);
            slots.insert((session, group));
        }

        IdentifiableMappingTargets {
            people,
            sessions,
            slots,
        }
    }

    fn active_sessions_for_diagnostic(
        sessions: Option<&[usize]>,
        num_sessions: usize,
        candidate: &OracleTemplateCandidate,
    ) -> Vec<usize> {
        sessions
            .map(|sessions| sessions.to_vec())
            .unwrap_or_else(|| (0..num_sessions).collect())
            .into_iter()
            .filter(|session| candidate.sessions.contains(session))
            .collect()
    }

    fn capacity_symmetry_breaking_slots_for_diagnostic(
        compiled: &CompiledProblem,
        candidate: &OracleTemplateCandidate,
    ) -> Vec<(usize, usize, usize)> {
        let mut capacity_frequency = BTreeMap::<usize, usize>::new();
        for &capacity in &compiled.effective_group_capacities {
            *capacity_frequency.entry(capacity).or_default() += 1;
        }
        if capacity_frequency.len() <= 1 {
            return Vec::new();
        }

        let dominant_frequency = capacity_frequency.values().copied().max().unwrap_or(0);
        let dominant_capacity_count = capacity_frequency
            .values()
            .filter(|&&frequency| frequency == dominant_frequency)
            .count();
        let include_capacity = |capacity: usize| {
            let frequency = capacity_frequency.get(&capacity).copied().unwrap_or(0);
            dominant_capacity_count > 1 || frequency < dominant_frequency
        };

        let mut slots = Vec::new();
        for &session in &candidate.sessions {
            for group in 0..compiled.num_groups {
                let capacity = compiled.group_capacity(session, group);
                if include_capacity(capacity) {
                    slots.push((session, group, capacity));
                }
            }
        }
        slots
    }

    fn ratio(numerator: usize, denominator: usize) -> f64 {
        if denominator == 0 {
            0.0
        } else {
            numerator as f64 / denominator as f64
        }
    }

    fn diagnostic_case_weight(case_id: &str) -> f64 {
        if case_id.contains("mixed")
            || case_id.contains("hard-apart")
            || case_id.contains("attribute-balance")
            || case_id.contains("cliques")
        {
            2.0
        } else {
            1.0
        }
    }

    fn metric_name_for_case(case_id: &str) -> String {
        let suffix = metric_case_suffix(case_id);
        format!("relabeling_factor_loss_{suffix}")
    }

    fn anchor_metric_name_for_case(case_id: &str) -> String {
        let suffix = metric_case_suffix(case_id);
        format!("relabeling_anchor_loss_{suffix}")
    }

    fn metric_case_suffix(case_id: &str) -> String {
        case_id
            .strip_prefix("stretch.relabeling-projection-13x13x14-")
            .unwrap_or(case_id)
            .replace('-', "_")
    }
}
