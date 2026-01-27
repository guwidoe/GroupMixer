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
            let max_capacity = self.group_capacities[group_idx];
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
        if self.schedule[day][to_group].len() >= self.group_capacities[to_group] {
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
                let old_penalty = if count > 1 {
                    (count as i32 - 1).pow(2)
                } else {
                    0
                };
                let new_count = count - 1;
                let new_penalty = if new_count > 1 {
                    (new_count as i32 - 1).pow(2)
                } else {
                    0
                };
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
            let old_penalty = if count > 1 {
                (count as i32 - 1).pow(2)
            } else {
                0
            };
            let new_count = count + 1;
            let new_penalty = if new_count > 1 {
                (new_count as i32 - 1).pow(2)
            } else {
                0
            };
            delta_cost += self.w_repetition * (new_penalty - old_penalty) as f64;

            if count == 0 {
                // Unique contacts: gaining one, so cost decreases
                delta_cost -= self.w_contacts;
            }
        }

        // === ATTRIBUTE BALANCE DELTA ===
        for ac in &self.attribute_balance_constraints {
            let from_group_id = &self.group_idx_to_id[from_group];
            let to_group_id = &self.group_idx_to_id[to_group];

            if !self.attribute_balance_constraint_applies(ac, day) {
                continue;
            }

            // For specific group constraints
            let applies_to_from = ac.group_id == *from_group_id;
            let applies_to_to = ac.group_id == *to_group_id;

            if !applies_to_from && !applies_to_to {
                continue; // Skip constraint that doesn't apply to either group
            }

            let old_penalty_from = if applies_to_from {
                self.calculate_group_attribute_penalty_for_members(from_group_members, ac)
            } else {
                0.0
            };
            let old_penalty_to = if applies_to_to {
                self.calculate_group_attribute_penalty_for_members(to_group_members, ac)
            } else {
                0.0
            };

            let new_penalty_from = if applies_to_from {
                let next_from_members: Vec<usize> = from_group_members
                    .iter()
                    .filter(|&&p| p != person_idx)
                    .cloned()
                    .collect();
                self.calculate_group_attribute_penalty_for_members(&next_from_members, ac)
            } else {
                0.0
            };
            let new_penalty_to = if applies_to_to {
                let mut next_to_members = to_group_members.clone();
                next_to_members.push(person_idx);
                self.calculate_group_attribute_penalty_for_members(&next_to_members, ac)
            } else {
                0.0
            };

            let delta_penalty =
                (new_penalty_from + new_penalty_to) - (old_penalty_from + old_penalty_to);
            delta_cost += delta_penalty;
        }

        // === CONSTRAINT PENALTY DELTA ===
        // Check forbidden pairs
        for (pair_idx, &(person1, person2)) in self.forbidden_pairs.iter().enumerate() {
            // Check if this constraint applies to this session
            if let Some(ref sessions) = self.forbidden_pair_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue;
                }
            }

            let pair_weight = self.forbidden_pair_weights[pair_idx];

            // Check if the transferring person is part of this forbidden pair
            if person_idx != person1 && person_idx != person2 {
                continue;
            }

            let other_person = if person_idx == person1 {
                person2
            } else {
                person1
            };

            // Check current violation state
            let currently_together = from_group_members.contains(&other_person);

            // Check future violation state
            let will_be_together = to_group_members.contains(&other_person);

            let old_penalty = if currently_together { pair_weight } else { 0.0 };
            let new_penalty = if will_be_together { pair_weight } else { 0.0 };

            delta_cost += new_penalty - old_penalty;
        }

        // Check should-stay-together pairs
        for (pair_idx, &(other1, other2)) in self.should_together_pairs.iter().enumerate() {
            // Check if this constraint applies to this session
            if let Some(ref sessions) = self.should_together_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue;
                }
            }

            let weight = self.should_together_weights[pair_idx];

            // Only consider if moving person is part of this pair
            if person_idx != other1 && person_idx != other2 {
                continue;
            }

            let other_person = if person_idx == other1 { other2 } else { other1 };

            // Check current separation state
            let currently_together = from_group_members.contains(&other_person);
            // After transfer, person moves to `to_group`
            let will_be_together = to_group_members.contains(&other_person);

            let old_penalty = if currently_together { 0.0 } else { weight };
            let new_penalty = if will_be_together { 0.0 } else { weight };
            delta_cost += new_penalty - old_penalty;
        }

        // Check PairMeetingCount constraints (only those including this day and where moving person is one endpoint)
        for (cidx, &(a, b)) in self.pairmin_pairs.iter().enumerate() {
            if !self.pairmin_sessions[cidx].contains(&day) {
                continue;
            }
            // Moving person must be one endpoint
            if person_idx != a && person_idx != b {
                continue;
            }
            // Identify the other endpoint
            let other = if person_idx == a { b } else { a };

            // Only meaningful if other participates in this session
            if !self.person_participation[other][day] {
                continue;
            }

            // Before: together if other is in from_group
            let before_same = from_group_members.contains(&other);
            // After: together if other is in to_group
            let after_same = to_group_members.contains(&other);

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
                    let old_penalty = if old_count > 1 {
                        (old_count as i32 - 1).pow(2)
                    } else {
                        0
                    };
                    let new_count = old_count - 1;
                    let new_penalty = if new_count > 1 {
                        (new_count as i32 - 1).pow(2)
                    } else {
                        0
                    };
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
                let old_penalty = if old_count > 1 {
                    (old_count as i32 - 1).pow(2)
                } else {
                    0
                };
                let new_count = old_count + 1;
                let new_penalty = if new_count > 1 {
                    (new_count as i32 - 1).pow(2)
                } else {
                    0
                };
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
        for ac in &self.attribute_balance_constraints.clone() {
            let from_group_id = &self.group_idx_to_id[from_group];
            let to_group_id = &self.group_idx_to_id[to_group];

            if !self.attribute_balance_constraint_applies(ac, day) {
                continue;
            }

            // For specific groups, update only affected groups
            if ac.group_id == *from_group_id {
                let old_penalty =
                    self.calculate_group_attribute_penalty_for_members(&from_group_members, ac);
                let new_penalty = self.calculate_group_attribute_penalty_for_members(
                    &self.schedule[day][from_group],
                    ac,
                );
                self.attribute_balance_penalty += new_penalty - old_penalty;
            }
            if ac.group_id == *to_group_id {
                let old_penalty =
                    self.calculate_group_attribute_penalty_for_members(&to_group_members, ac);
                let new_penalty = self.calculate_group_attribute_penalty_for_members(
                    &self.schedule[day][to_group],
                    ac,
                );
                self.attribute_balance_penalty += new_penalty - old_penalty;
            }
        }

        // === UPDATE CONSTRAINT PENALTIES ===
        self._recalculate_constraint_penalty();

        // === UPDATE PairMeetingCount counts incrementally ===
        for (cidx, &(a, b)) in self.pairmin_pairs.clone().iter().enumerate() {
            if !self.pairmin_sessions[cidx].contains(&day) {
                continue;
            }
            // Only if moving person is one endpoint
            if person_idx != a && person_idx != b {
                continue;
            }
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
}
