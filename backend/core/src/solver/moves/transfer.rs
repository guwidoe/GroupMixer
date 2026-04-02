//! Transfer move operations for the solver.
//!
//! This module implements the transfer move - moving a single person from one group
//! to another when there's available capacity, without requiring an exchange.
//! This enables optimization with variable group sizes.

use super::super::State;
use crate::models::PairMeetingMode;

impl State {
    // === SINGLE PERSON TRANSFER FUNCTIONALITY ===
    // Transfer functions allow moving a single person from one group to another
    // without requiring an exchange, enabling variable group sizes

    /// Calculate the probability of attempting a single-person transfer based on group capacity.
    ///
    /// Returns a probability between 0.0 and 1.0 based on how many groups have available capacity.
    /// If all groups are full, returns 0.0 (no transfers possible).
    /// Otherwise, scales the probability based on available capacity across groups.
    pub fn calculate_transfer_probability(&self, day: usize) -> f64 {
        let total_groups = self.schedule[day].len();
        if total_groups == 0 {
            return 0.0;
        }

        let mut groups_with_capacity = 0;
        let mut total_available_capacity = 0;

        for (group_idx, group_members) in self.schedule[day].iter().enumerate() {
            let max_capacity = self.effective_group_capacity(day, group_idx);
            let current_size = group_members.len();

            if current_size < max_capacity {
                groups_with_capacity += 1;
                total_available_capacity += max_capacity - current_size;
            }
        }

        if groups_with_capacity == 0 {
            return 0.0; // All groups are full
        }

        // Probability proportional to average spare capacity, capped at 30%
        let capacity_ratio = total_available_capacity as f64 / (total_groups as f64);
        (capacity_ratio * 0.3).min(0.3)
    }

    /// Check if a single-person transfer is feasible.
    ///
    /// A transfer is feasible if:
    /// - Person is participating in the session
    /// - Person is not immovable
    /// - Person is not part of a clique
    /// - Source group would have at least 1 person remaining
    /// - Target group has available capacity
    /// - Source and target groups are different
    pub fn is_transfer_feasible(
        &self,
        day: usize,
        person_idx: usize,
        from_group: usize,
        to_group: usize,
    ) -> bool {
        // Check basic validity
        if from_group == to_group {
            return false;
        }

        // Person must be participating in this session
        if !self.person_participation[person_idx][day] {
            return false;
        }

        // Person must not be immovable
        if self.immovable_people.contains_key(&(person_idx, day)) {
            return false;
        }

        // Person must not be part of a clique
        if self.person_to_clique_id[day][person_idx].is_some() {
            return false;
        }

        // Verify person is actually in the from_group
        let (current_group, _) = self.locations[day][person_idx];
        if current_group != from_group {
            return false;
        }

        // Source group must have more than 1 person (don't create empty groups)
        if self.schedule[day][from_group].len() <= 1 {
            return false;
        }

        // Target group must have capacity based on predefined limit
        if self.schedule[day][to_group].len() >= self.effective_group_capacity(day, to_group) {
            return false;
        }

        true
    }

    /// Calculate the cost delta for a single-person transfer.
    ///
    /// Similar to swap delta but simpler since only one person moves.
    /// Calculates changes in:
    /// - Contact counts and unique contacts
    /// - Repetition penalties  
    /// - Attribute balance penalties
    /// - Constraint violations
    pub fn calculate_transfer_cost_delta(
        &self,
        day: usize,
        person_idx: usize,
        from_group: usize,
        to_group: usize,
    ) -> f64 {
        // Check feasibility
        if !self.is_transfer_feasible(day, person_idx, from_group, to_group) {
            return f64::INFINITY;
        }

        let mut delta_cost = 0.0;

        // === CONTACT/REPETITION DELTA ===
        let from_group_members = &self.schedule[day][from_group];
        let to_group_members = &self.schedule[day][to_group];

        // Person loses contacts with from_group members
        for &member in from_group_members.iter() {
            if member == person_idx {
                continue;
            }
            // Only consider contacts with participating members
            if !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[person_idx][member];
            if count > 0 {
                // Repetition penalty change: (new_penalty - old_penalty)
                let old_penalty = self.repetition_penalty_for_contact_count(count);
                let new_penalty = self.repetition_penalty_for_contact_count(count - 1);
                delta_cost += self.w_repetition * (new_penalty - old_penalty) as f64;

                if count == 1 {
                    // Unique contacts: losing one, so cost increases
                    delta_cost += self.w_contacts;
                }
            }
        }

        // Person gains contacts with to_group members
        for &member in to_group_members.iter() {
            // Only consider contacts with participating members
            if !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[person_idx][member];
            // Repetition penalty change: (new_penalty - old_penalty)
            let old_penalty = self.repetition_penalty_for_contact_count(count);
            let new_penalty = self.repetition_penalty_for_contact_count(count + 1);
            delta_cost += self.w_repetition * (new_penalty - old_penalty) as f64;

            if count == 0 {
                // Unique contacts: gaining one, so cost decreases
                delta_cost -= self.w_contacts;
            }
        }

        // === ATTRIBUTE BALANCE DELTA ===
        let group_after_transfer = |other_person: usize| {
            if other_person == person_idx {
                to_group
            } else {
                self.locations[day][other_person].0
            }
        };

        let from_attr_constraints = self
            .attribute_balance_constraint_indices_for_group_session(day, from_group)
            .to_vec();
        for constraint_idx in from_attr_constraints {
            let old_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                from_group_members,
                constraint_idx,
            );
            let new_penalty = self
                .calculate_group_attribute_penalty_for_constraint_members_with_edit(
                    from_group_members,
                    constraint_idx,
                    Some(person_idx),
                    None,
                );
            delta_cost += new_penalty - old_penalty;
        }
        let to_attr_constraints = self
            .attribute_balance_constraint_indices_for_group_session(day, to_group)
            .to_vec();
        for constraint_idx in to_attr_constraints {
            let old_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                to_group_members,
                constraint_idx,
            );
            let new_penalty = self
                .calculate_group_attribute_penalty_for_constraint_members_with_edit(
                    to_group_members,
                    constraint_idx,
                    None,
                    Some(person_idx),
                );
            delta_cost += new_penalty - old_penalty;
        }

        // === CONSTRAINT PENALTY DELTA ===
        // Check forbidden pairs
        for &pair_idx in self.forbidden_pair_indices_for_person_session(day, person_idx) {
            let (person1, person2) = self.forbidden_pairs[pair_idx];
            let pair_weight = self.forbidden_pair_weights[pair_idx];
            let other_person = if person_idx == person1 {
                person2
            } else {
                person1
            };

            let currently_together =
                self.locations[day][person_idx].0 == self.locations[day][other_person].0;
            let will_be_together =
                group_after_transfer(person_idx) == group_after_transfer(other_person);

            let old_penalty = if currently_together { pair_weight } else { 0.0 };
            let new_penalty = if will_be_together { pair_weight } else { 0.0 };

            delta_cost += new_penalty - old_penalty;
        }

        // Check should-stay-together pairs
        for &pair_idx in self.should_together_indices_for_person_session(day, person_idx) {
            let (other1, other2) = self.should_together_pairs[pair_idx];
            let weight = self.should_together_weights[pair_idx];
            let other_person = if person_idx == other1 { other2 } else { other1 };

            let currently_together =
                self.locations[day][person_idx].0 == self.locations[day][other_person].0;
            let will_be_together =
                group_after_transfer(person_idx) == group_after_transfer(other_person);

            let old_penalty = if currently_together { 0.0 } else { weight };
            let new_penalty = if will_be_together { 0.0 } else { weight };
            delta_cost += new_penalty - old_penalty;
        }

        // Check PairMeetingCount constraints (only those including this day and where moving person is one endpoint)
        for &cidx in self.pairmin_indices_for_person_session(day, person_idx) {
            let (a, b) = self.pairmin_pairs[cidx];
            // Identify the other endpoint
            let other = if person_idx == a { b } else { a };

            // Only meaningful if other participates in this session
            if !self.person_participation[other][day] {
                continue;
            }

            let before_same = self.locations[day][person_idx].0 == self.locations[day][other].0;
            let after_same = group_after_transfer(person_idx) == group_after_transfer(other);

            if before_same == after_same {
                continue;
            }

            let have_before = self.pairmin_counts[cidx] as i32;
            let have_after = if after_same {
                have_before + 1
            } else {
                have_before - 1
            };
            let target = self.pairmin_required[cidx] as i32;
            let mode = self.pairmin_modes[cidx];
            let (before_pen, after_pen) = match mode {
                PairMeetingMode::AtLeast => (
                    (target - have_before).max(0) as f64,
                    (target - have_after).max(0) as f64,
                ),
                PairMeetingMode::Exact => (
                    (have_before - target).abs() as f64,
                    (have_after - target).abs() as f64,
                ),
                PairMeetingMode::AtMost => (
                    (have_before - target).max(0) as f64,
                    (have_after - target).max(0) as f64,
                ),
            };
            let delta = (after_pen - before_pen) * self.pairmin_weights[cidx];
            delta_cost += delta;
        }

        delta_cost
    }

    /// Apply a single-person transfer.
    ///
    /// Moves a person from one group to another and updates all internal state:
    /// - Schedule and locations
    /// - Contact matrix and scores
    /// - Attribute balance penalties
    /// - Constraint violations
    pub fn apply_transfer(
        &mut self,
        day: usize,
        person_idx: usize,
        from_group: usize,
        to_group: usize,
    ) {
        // Verify the transfer is feasible
        if !self.is_transfer_feasible(day, person_idx, from_group, to_group) {
            eprintln!("Warning: Attempted infeasible transfer");
            return;
        }

        // === UPDATE CONTACT MATRIX ===
        let from_group_members = self.schedule[day][from_group].clone();
        let to_group_members = self.schedule[day][to_group].clone();

        // Remove contacts with old group members
        for &member in from_group_members.iter() {
            if member != person_idx && self.person_participation[member][day] {
                let old_count = self.contact_matrix[person_idx][member];
                if old_count > 0 {
                    self.contact_matrix[person_idx][member] -= 1;
                    self.contact_matrix[member][person_idx] -= 1;

                    // Update unique contacts count
                    if old_count == 1 {
                        self.unique_contacts -= 1; // Lost a unique contact
                    }

                    // Update repetition penalty
                    let old_penalty = self.repetition_penalty_for_contact_count(old_count);
                    let new_penalty = self.repetition_penalty_for_contact_count(old_count - 1);
                    self.repetition_penalty += new_penalty - old_penalty;
                }
            }
        }

        // Add contacts with new group members
        for &member in to_group_members.iter() {
            if self.person_participation[member][day] {
                let old_count = self.contact_matrix[person_idx][member];
                self.contact_matrix[person_idx][member] += 1;
                self.contact_matrix[member][person_idx] += 1;

                // Update unique contacts count
                if old_count == 0 {
                    self.unique_contacts += 1; // Gained a unique contact
                }

                // Update repetition penalty
                let old_penalty = self.repetition_penalty_for_contact_count(old_count);
                let new_penalty = self.repetition_penalty_for_contact_count(old_count + 1);
                self.repetition_penalty += new_penalty - old_penalty;
            }
        }

        // === UPDATE SCHEDULE AND LOCATIONS ===
        // Deterministic rebuild to avoid duplicates
        let old_from = std::mem::take(&mut self.schedule[day][from_group]);
        let old_to = std::mem::take(&mut self.schedule[day][to_group]);
        let new_from: Vec<usize> = old_from.into_iter().filter(|&p| p != person_idx).collect();
        let mut new_to = old_to;
        new_to.push(person_idx);

        #[cfg(feature = "debug-invariant-checks")]
        if self.logging.debug_validate_invariants && self.logging.debug_dump_invariant_context {
            let mut seen = std::collections::HashSet::new();
            for &p in &new_from {
                if !seen.insert(p) {
                    eprintln!(
                        "[DEBUG] Duplicate in transfer new_from: {}",
                        self.display_person_by_idx(p)
                    );
                }
            }
            seen.clear();
            for &p in &new_to {
                if !seen.insert(p) {
                    eprintln!(
                        "[DEBUG] Duplicate in transfer new_to: {}",
                        self.display_person_by_idx(p)
                    );
                }
            }
        }

        self.schedule[day][from_group] = new_from;
        self.schedule[day][to_group] = new_to;

        // Update locations lookup for both groups
        for (pos, &pid) in self.schedule[day][from_group].iter().enumerate() {
            self.locations[day][pid] = (from_group, pos);
        }
        for (pos, &pid) in self.schedule[day][to_group].iter().enumerate() {
            self.locations[day][pid] = (to_group, pos);
        }

        // === UPDATE ATTRIBUTE BALANCE PENALTY ===
        // Recalculate attribute balance penalty for affected groups
        let from_attr_constraints = self
            .attribute_balance_constraint_indices_for_group_session(day, from_group)
            .to_vec();
        for constraint_idx in from_attr_constraints {
            let old_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                &from_group_members,
                constraint_idx,
            );
            let new_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                &self.schedule[day][from_group],
                constraint_idx,
            );
            self.attribute_balance_penalty += new_penalty - old_penalty;
        }
        let to_attr_constraints = self
            .attribute_balance_constraint_indices_for_group_session(day, to_group)
            .to_vec();
        for constraint_idx in to_attr_constraints {
            let old_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                &to_group_members,
                constraint_idx,
            );
            let new_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                &self.schedule[day][to_group],
                constraint_idx,
            );
            self.attribute_balance_penalty += new_penalty - old_penalty;
        }

        // === UPDATE CONSTRAINT PENALTIES ===
        // Transfer feasibility guarantees the moved person is neither immovable nor
        // part of a clique for this session, so only pair-based soft constraints can
        // change here.

        // Update forbidden pair violations incrementally.
        for pair_idx in self
            .forbidden_pair_indices_for_person_session(day, person_idx)
            .to_vec()
        {
            let (person_a, person_b) = self.forbidden_pairs[pair_idx];

            let other_person = if person_idx == person_a {
                person_b
            } else {
                person_a
            };

            if !self.person_participation[other_person][day] {
                continue;
            }

            let were_together = from_group_members.contains(&other_person);
            let are_together = to_group_members.contains(&other_person);

            if were_together && !are_together {
                self.forbidden_pair_violations[pair_idx] -= 1;
            } else if !were_together && are_together {
                self.forbidden_pair_violations[pair_idx] += 1;
            }
        }

        // Update should-together violations incrementally.
        for pair_idx in self
            .should_together_indices_for_person_session(day, person_idx)
            .to_vec()
        {
            let (person_a, person_b) = self.should_together_pairs[pair_idx];

            let other_person = if person_idx == person_a {
                person_b
            } else {
                person_a
            };

            if !self.person_participation[other_person][day] {
                continue;
            }

            let was_violation = !from_group_members.contains(&other_person);
            let is_violation = !to_group_members.contains(&other_person);

            if was_violation && !is_violation {
                self.should_together_violations[pair_idx] -= 1;
            } else if !was_violation && is_violation {
                self.should_together_violations[pair_idx] += 1;
            }
        }

        // === UPDATE PairMeetingCount counts incrementally ===
        for cidx in self
            .pairmin_indices_for_person_session(day, person_idx)
            .to_vec()
        {
            let (a, b) = self.pairmin_pairs[cidx];
            let other = if person_idx == a { b } else { a };
            if !self.person_participation[other][day] {
                continue;
            }
            // Before: together if other was in from_group
            let were_same = from_group_members.contains(&other);
            // After: together if other is now in to_group (person moved there)
            let are_same = self.schedule[day][to_group].contains(&other);
            if were_same == are_same {
                continue;
            }
            if are_same {
                self.pairmin_counts[cidx] += 1;
            } else {
                self.pairmin_counts[cidx] -= 1;
            }
        }

        // Keep legacy constraint_penalty consistent with calculate_cost()
        self._update_constraint_penalty_total();
        self.refresh_cost_from_caches();

        #[cfg(feature = "debug-invariant-checks")]
        {
            // Debug-only final invariant check for the whole session
            if self.logging.debug_validate_invariants {
                if let Err(e) = self.validate_no_duplicate_assignments() {
                    if self.logging.debug_dump_invariant_context {
                        eprintln!(
                            "[DEBUG] Invariant failed after transfer day={} person={} from={} to={}",
                            day,
                            self.display_person_by_idx(person_idx),
                            self.group_idx_to_id[from_group],
                            self.group_idx_to_id[to_group]
                        );
                    }
                    let _ = e;
                }
            }
        }

        #[cfg(feature = "cache-drift-assertions")]
        self.debug_assert_no_cache_drift_if_enabled("apply_transfer");
    }
}
