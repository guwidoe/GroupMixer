//! Scoring and penalty calculation methods for the solver state.
//!
//! This module contains methods for calculating and recalculating various
//! scoring components including attribute balance penalties, constraint
//! penalties, and pair meeting counts.

use super::State;
use crate::models::AttributeBalanceParams;

impl State {
    fn get_attribute_counts(&self, group_members: &[usize], attr_idx: usize) -> Vec<u32> {
        let num_values = self.attr_idx_to_val.get(attr_idx).map_or(0, |v| v.len());
        let mut counts = vec![0; num_values];
        for &person_idx in group_members {
            let value_idx = self.person_attributes[person_idx][attr_idx];
            if value_idx != usize::MAX {
                counts[value_idx] += 1;
            }
        }
        counts
    }

    fn calculate_penalty_from_counts(&self, counts: &[u32], ac: &AttributeBalanceParams) -> f64 {
        use crate::models::AttributeBalanceMode;
        let mut penalty = 0.0;
        for (val_str, desired_count) in &ac.desired_values {
            if let Some(&val_idx) =
                self.attr_val_to_idx[self.attr_key_to_idx[&ac.attribute_key]].get(val_str)
            {
                let actual_count = counts[val_idx];
                let diff = match ac.mode {
                    AttributeBalanceMode::Exact => {
                        (actual_count as i32 - *desired_count as i32).abs()
                    }
                    AttributeBalanceMode::AtLeast => {
                        let shortfall = (*desired_count as i32) - (actual_count as i32);
                        shortfall.max(0)
                    }
                };
                penalty += (diff.pow(2) as f64) * ac.penalty_weight;
            }
        }
        penalty
    }

    pub(crate) fn _recalculate_attribute_balance_penalty(&mut self) {
        if std::env::var("DEBUG_ATTR_BALANCE").is_ok() {
            println!("DEBUG: _recalculate_attribute_balance_penalty - starting recalculation");
        }

        self.attribute_balance_penalty = 0.0;
        for (day_idx, day_schedule) in self.schedule.iter().enumerate() {
            for (group_idx, group_people) in day_schedule.iter().enumerate() {
                let group_id = &self.group_idx_to_id[group_idx];

                for ac in &self.attribute_balance_constraints {
                    // Check if the constraint applies to this group
                    if &ac.group_id != group_id {
                        continue;
                    }

                    // Find the internal index for the attribute key (e.g., "gender", "department")
                    if let Some(&attr_idx) = self.attr_key_to_idx.get(&ac.attribute_key) {
                        let num_values = self.attr_idx_to_val[attr_idx].len();
                        let mut value_counts = vec![0; num_values];

                        // Count how many people with each attribute value are in the group
                        for person_idx in group_people {
                            let val_idx = self.person_attributes[*person_idx][attr_idx];
                            if val_idx != usize::MAX {
                                value_counts[val_idx] += 1;
                            }
                        }

                        // Calculate the weighted penalty for this specific constraint using the shared helper
                        let weighted_penalty =
                            self.calculate_penalty_from_counts(&value_counts, ac);

                        if std::env::var("DEBUG_ATTR_BALANCE").is_ok() && weighted_penalty > 0.001 {
                            println!("DEBUG: _recalculate - day {}, group {} ({}), constraint '{}' on '{}':", 
                                    day_idx, group_idx, group_id, ac.attribute_key, ac.group_id);
                            println!("  group_people: {:?}", group_people);
                            println!("  value_counts: {:?}", value_counts);
                            println!("  weighted_penalty: {}", weighted_penalty);
                        }

                        self.attribute_balance_penalty += weighted_penalty;
                    }
                }
            }
        }

        if std::env::var("DEBUG_ATTR_BALANCE").is_ok() {
            println!(
                "DEBUG: _recalculate_attribute_balance_penalty - final result: {}",
                self.attribute_balance_penalty
            );
        }
    }

    pub(crate) fn _recalculate_constraint_penalty(&mut self) {
        // Reset all constraint penalties
        for violation in &mut self.clique_violations {
            *violation = 0;
        }
        for violation in &mut self.forbidden_pair_violations {
            *violation = 0;
        }
        for violation in &mut self.should_together_violations {
            *violation = 0;
        }
        self.immovable_violations = 0;

        // Calculate forbidden pair violations
        for (day_idx, day_schedule) in self.schedule.iter().enumerate() {
            for group in day_schedule {
                for (pair_idx, &(p1, p2)) in self.forbidden_pairs.iter().enumerate() {
                    // Check if this forbidden pair applies to this session
                    if let Some(ref sessions) = self.forbidden_pair_sessions[pair_idx] {
                        if !sessions.contains(&day_idx) {
                            continue; // Skip this constraint for this session
                        }
                    }
                    // If sessions is None, apply to all sessions

                    // Check if both people are participating in this session
                    if !self.person_participation[p1][day_idx]
                        || !self.person_participation[p2][day_idx]
                    {
                        continue; // Skip if either person is not participating
                    }

                    let mut p1_in = false;
                    let mut p2_in = false;
                    for &member in group {
                        if member == p1 {
                            p1_in = true;
                        }
                        if member == p2 {
                            p2_in = true;
                        }
                    }
                    if p1_in && p2_in {
                        self.forbidden_pair_violations[pair_idx] += 1;
                    }
                }
            }
        }

        // Calculate clique violations (when clique members are separated)
        for (clique_idx, clique) in self.cliques.iter().enumerate() {
            for (day_idx, day_schedule) in self.schedule.iter().enumerate() {
                // Check if this clique applies to this session
                if let Some(ref sessions) = self.clique_sessions[clique_idx] {
                    if !sessions.contains(&day_idx) {
                        continue; // Skip this constraint for this session
                    }
                }
                // If sessions is None, apply to all sessions

                // Only consider clique members who are participating in this session
                let participating_members: Vec<usize> = clique
                    .iter()
                    .filter(|&&member| self.person_participation[member][day_idx])
                    .cloned()
                    .collect();

                // If fewer than 2 members are participating, no constraint to enforce
                if participating_members.len() < 2 {
                    continue;
                }

                let mut group_counts = vec![0; day_schedule.len()];

                // Count how many participating clique members are in each group
                for &member in &participating_members {
                    let (group_idx, _) = self.locations[day_idx][member];
                    group_counts[group_idx] += 1;
                }

                // Count violations: total participating clique members minus the largest group
                let max_in_one_group = *group_counts.iter().max().unwrap_or(&0);
                let separated_members = participating_members.len() as i32 - max_in_one_group;
                self.clique_violations[clique_idx] += separated_members;
            }
        }

        // Calculate should-together pair violations (when separated)
        for (day_idx, _day_schedule) in self.schedule.iter().enumerate() {
            for (pair_idx, &(p1, p2)) in self.should_together_pairs.iter().enumerate() {
                // Check if this should-together pair applies to this session
                if let Some(ref sessions) = self.should_together_sessions[pair_idx] {
                    if !sessions.contains(&day_idx) {
                        continue; // Skip this constraint for this session
                    }
                }
                if !self.person_participation[p1][day_idx]
                    || !self.person_participation[p2][day_idx]
                {
                    continue;
                }

                let (g1, _) = self.locations[day_idx][p1];
                let (g2, _) = self.locations[day_idx][p2];
                if g1 != g2 {
                    self.should_together_violations[pair_idx] += 1;
                }
            }
        }

        // Calculate immovable person violations
        for ((person_idx, session_idx), required_group_idx) in &self.immovable_people {
            // Only check immovable constraints for people who are participating
            if self.person_participation[*person_idx][*session_idx] {
                let (actual_group_idx, _) = self.locations[*session_idx][*person_idx];
                if actual_group_idx != *required_group_idx {
                    self.immovable_violations += 1;
                }
            }
        }

        // Update the legacy constraint_penalty field for backward compatibility
        // (kept consistent with calculate_cost()'s unweighted violation_count)
        self._update_constraint_penalty_total();
    }

    #[inline]
    pub(crate) fn _pairmin_violation_count(&self) -> i32 {
        use crate::models::PairMeetingMode;
        let mut cnt = 0;
        for idx in 0..self.pairmin_pairs.len() {
            let target = self.pairmin_required[idx] as i32;
            let have = self.pairmin_counts[idx] as i32;
            let raw_violation = match self.pairmin_modes[idx] {
                PairMeetingMode::AtLeast => (target - have).max(0),
                PairMeetingMode::Exact => (have - target).abs(),
                PairMeetingMode::AtMost => (have - target).max(0),
            };
            // calculate_cost() only counts this as a "violation" if the weighted penalty is > 0
            if raw_violation > 0 && self.pairmin_weights[idx] > 0.0 {
                cnt += 1;
            }
        }
        cnt
    }

    #[inline]
    pub(crate) fn _update_constraint_penalty_total(&mut self) {
        self.constraint_penalty = self.forbidden_pair_violations.iter().sum::<i32>()
            + self.clique_violations.iter().sum::<i32>()
            + self.should_together_violations.iter().sum::<i32>()
            + self.immovable_violations
            + self._pairmin_violation_count();
    }

    pub(crate) fn calculate_group_attribute_penalty_for_members(
        &self,
        group_members: &[usize],
        ac: &AttributeBalanceParams,
    ) -> f64 {
        if let Some(&attr_idx) = self.attr_key_to_idx.get(&ac.attribute_key) {
            let counts = self.get_attribute_counts(group_members, attr_idx);
            return self.calculate_penalty_from_counts(&counts, ac);
        }
        0.0
    }

    /// Helper: returns true if an attribute balance constraint is active for the given session.
    #[inline]
    pub(crate) fn attribute_balance_constraint_applies(
        &self,
        ac: &AttributeBalanceParams,
        session_idx: usize,
    ) -> bool {
        match &ac.sessions {
            Some(sessions) => sessions.contains(&(session_idx as u32)),
            None => true,
        }
    }
}
