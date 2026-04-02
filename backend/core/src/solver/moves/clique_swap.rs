//! Clique swap move operations for the solver.
//!
//! This module implements clique swaps - moving an entire group of people who must
//! stay together (a clique) to a different group, exchanging them with non-clique
//! members from the target group.

use super::super::State;

impl State {
    /// Returns, for each session, the probability of attempting a clique-swap move.
    ///
    /// The heuristic is unchanged: probability scales linearly with the fraction of
    /// people already locked into cliques for that session, capped at 0.1.
    pub fn calculate_clique_swap_probability(&self) -> Vec<f64> {
        let total_people = self.person_idx_to_id.len() as f64;
        if total_people == 0.0 {
            return vec![0.0; self.num_sessions as usize];
        }

        (0..self.num_sessions as usize)
            .map(|session_idx| {
                let in_cliques = self.person_to_clique_id[session_idx]
                    .iter()
                    .filter(|entry| entry.is_some())
                    .count() as f64;

                if in_cliques == 0.0 {
                    0.0
                } else {
                    let ratio = in_cliques / total_people;
                    (ratio * 0.2).min(0.1)
                }
            })
            .collect()
    }

    /// Find all non-clique, movable people in a specific group for a given day
    pub fn find_non_clique_movable_people(&self, day: usize, group_idx: usize) -> Vec<usize> {
        self.schedule[day][group_idx]
            .iter()
            .filter(|&&person_idx| {
                // Must be participating in this session
                self.person_participation[person_idx][day] &&
                // Must not be in a clique
                self.person_to_clique_id[day][person_idx].is_none() &&
                // Must not be immovable in this session
                !self.immovable_people.contains_key(&(person_idx, day))
            })
            .cloned()
            .collect()
    }

    fn active_clique_members_for_group(
        &self,
        day: usize,
        clique_idx: usize,
        from_group: usize,
    ) -> Vec<usize> {
        self.cliques[clique_idx]
            .iter()
            .copied()
            .filter(|&member| self.person_participation[member][day])
            .filter(|&member| self.locations[day][member].0 == from_group)
            .collect()
    }

    fn clique_swap_targets_are_valid(
        &self,
        day: usize,
        from_group: usize,
        to_group: usize,
        active_members: &[usize],
        target_people: &[usize],
    ) -> bool {
        if active_members.is_empty() || active_members.len() != target_people.len() {
            return false;
        }

        for &member in active_members {
            if let Some(&required_group) = self.immovable_people.get(&(member, day)) {
                if required_group != to_group {
                    return false;
                }
            }
        }

        let mut seen_targets = std::collections::HashSet::with_capacity(target_people.len());
        for &person in target_people {
            if !seen_targets.insert(person)
                || active_members.contains(&person)
                || !self.person_participation[person][day]
                || self.locations[day][person].0 != to_group
                || self.person_to_clique_id[day][person].is_some()
            {
                return false;
            }

            if let Some(&required_group) = self.immovable_people.get(&(person, day)) {
                if required_group != from_group {
                    return false;
                }
            }
        }

        true
    }

    fn update_contact_cache_for_clique_swap_pair(&mut self, person_a: usize, person_b: usize, delta: i32) {
        let old_count = self.contact_matrix[person_a][person_b];

        if delta < 0 {
            if old_count == 0 {
                return;
            }

            self.contact_matrix[person_a][person_b] -= 1;
            self.contact_matrix[person_b][person_a] -= 1;

            if old_count == 1 {
                self.unique_contacts -= 1;
            }

            let old_penalty = self.repetition_penalty_for_contact_count(old_count);
            let new_penalty = self.repetition_penalty_for_contact_count(old_count - 1);
            self.repetition_penalty += new_penalty - old_penalty;
        } else {
            self.contact_matrix[person_a][person_b] += 1;
            self.contact_matrix[person_b][person_a] += 1;

            if old_count == 0 {
                self.unique_contacts += 1;
            }

            let old_penalty = self.repetition_penalty_for_contact_count(old_count);
            let new_penalty = self.repetition_penalty_for_contact_count(old_count + 1);
            self.repetition_penalty += new_penalty - old_penalty;
        }
    }

    /// Check if a clique swap is feasible between two groups
    pub fn is_clique_swap_feasible(
        &self,
        day: usize,
        clique_idx: usize,
        from_group: usize,
        to_group: usize,
    ) -> bool {
        // If this clique is not active for this session (e.g., deactivated by immovable propagation),
        // do not attempt a clique swap in this session.
        if let Some(ref sessions) = self.clique_sessions[clique_idx] {
            if !sessions.contains(&day) {
                return false;
            }
        }

        let active_members = self.active_clique_members_for_group(day, clique_idx, from_group);

        if active_members.is_empty() {
            return false;
        }

        // Ensure all active members are actually co-located in from_group
        if !active_members
            .iter()
            .all(|&m| self.locations[day][m].0 == from_group)
        {
            return false;
        }

        for &member in &active_members {
            if let Some(&required_group) = self.immovable_people.get(&(member, day)) {
                if required_group != to_group {
                    return false;
                }
            }
        }

        // Need at least as many non-clique movable people in target group as active clique size
        let non_clique_people_in_to_group = self.find_non_clique_movable_people(day, to_group);
        non_clique_people_in_to_group.len() >= active_members.len()
    }

    /// Calculate the cost delta for swapping a clique with non-clique people
    pub fn calculate_clique_swap_cost_delta(
        &self,
        day: usize,
        clique_idx: usize,
        from_group: usize,
        to_group: usize,
        target_people: &[usize],
    ) -> f64 {
        // If this clique is not active for this session, disallow by returning +inf
        if let Some(ref sessions) = self.clique_sessions[clique_idx] {
            if !sessions.contains(&day) {
                return f64::INFINITY;
            }
        }

        let active_members = self.active_clique_members_for_group(day, clique_idx, from_group);
        if !self.clique_swap_targets_are_valid(
            day,
            from_group,
            to_group,
            &active_members,
            target_people,
        ) {
            return f64::INFINITY;
        }

        let previous_cost = self.current_cost;
        let mut trial_state = self.clone();
        trial_state.apply_clique_swap(day, clique_idx, from_group, to_group, target_people);
        trial_state.current_cost - previous_cost
    }

    /// Calculate constraint penalty delta for clique swaps
    #[allow(dead_code)]
    fn calculate_clique_swap_constraint_penalty_delta(
        &self,
        day: usize,
        clique: &[usize],
        target_people: &[usize],
        from_group: usize,
        to_group: usize,
    ) -> f64 {
        let mut delta = 0.0;

        // Get the affected group memberships before and after the swap
        let from_group_members = &self.schedule[day][from_group];
        let to_group_members = &self.schedule[day][to_group];

        // Calculate new group compositions after swap
        let mut new_from_members: Vec<usize> = from_group_members
            .iter()
            .filter(|&&p| !clique.contains(&p))
            .cloned()
            .collect();
        new_from_members.extend_from_slice(target_people);

        let mut new_to_members: Vec<usize> = to_group_members
            .iter()
            .filter(|&&p| !target_people.contains(&p))
            .cloned()
            .collect();
        new_to_members.extend_from_slice(clique);

        // Check ShouldNotBeTogether constraints
        for (pair_idx, &(person1, person2)) in self.forbidden_pairs.iter().enumerate() {
            let pair_weight = self.forbidden_pair_weights[pair_idx];

            // Old constraint penalty contributions
            let old_penalty = if (from_group_members.contains(&person1)
                && from_group_members.contains(&person2))
                || (to_group_members.contains(&person1) && to_group_members.contains(&person2))
            {
                pair_weight // Constraint violated in current state
            } else {
                0.0 // Constraint satisfied in current state
            };

            // New constraint penalty contributions
            let new_penalty = if (new_from_members.contains(&person1)
                && new_from_members.contains(&person2))
                || (new_to_members.contains(&person1) && new_to_members.contains(&person2))
            {
                pair_weight // Constraint violated in new state
            } else {
                0.0 // Constraint satisfied in new state
            };

            delta += new_penalty - old_penalty;
        }

        // Check ShouldStayTogether pairs
        for (pair_idx, &(person1, person2)) in self.should_together_pairs.iter().enumerate() {
            let pair_weight = self.should_together_weights[pair_idx];

            // Old penalty: they are separated if each group contains exactly one of them
            let old_penalty = if (from_group_members.contains(&person1)
                && !from_group_members.contains(&person2)
                && to_group_members.contains(&person2))
                || (from_group_members.contains(&person2)
                    && !from_group_members.contains(&person1)
                    && to_group_members.contains(&person1))
            {
                pair_weight
            } else {
                0.0
            };

            // New penalty after swap-like move
            let new_from_has_p1 = new_from_members.contains(&person1);
            let new_from_has_p2 = new_from_members.contains(&person2);
            let new_to_has_p1 = new_to_members.contains(&person1);
            let new_to_has_p2 = new_to_members.contains(&person2);
            let new_penalty =
                if (new_from_has_p1 && new_to_has_p2) || (new_from_has_p2 && new_to_has_p1) {
                    pair_weight
                } else {
                    0.0
                };

            delta += new_penalty - old_penalty;
        }

        // Check ImmovablePerson constraints for the affected people
        for &person in clique.iter().chain(target_people.iter()) {
            if let Some(&required_group) = self.immovable_people.get(&(person, day)) {
                let current_group = self.locations[day][person].0;
                let new_group = if clique.contains(&person) {
                    to_group
                } else {
                    from_group
                };

                // Old penalty (using default weight for immovable person constraints)
                let old_penalty = if current_group != required_group {
                    1000.0 // Default hard constraint weight for immovable people
                } else {
                    0.0
                };

                // New penalty
                let new_penalty = if new_group != required_group {
                    1000.0 // Default hard constraint weight for immovable people
                } else {
                    0.0
                };

                delta += new_penalty - old_penalty;
            }
        }

        delta
    }

    /// Simplified attribute balance delta calculation for clique swaps
    #[allow(dead_code)]
    fn calculate_attribute_balance_delta_for_groups(
        &self,
        day: usize,
        from_group: usize,
        to_group: usize,
        clique: &[usize],
        target_people: &[usize],
    ) -> f64 {
        let mut delta = 0.0;

        for ac in &self.attribute_balance_constraints {
            // Only consider constraints that apply to these groups
            if ac.group_id != self.group_idx_to_id[from_group]
                && ac.group_id != self.group_idx_to_id[to_group]
            {
                continue;
            }

            let from_group_members = &self.schedule[day][from_group];
            let to_group_members = &self.schedule[day][to_group];

            // Calculate old penalties
            let old_from_penalty =
                self.calculate_group_attribute_penalty_for_members(from_group_members, ac);
            let old_to_penalty =
                self.calculate_group_attribute_penalty_for_members(to_group_members, ac);

            // Calculate new group compositions
            let mut new_from_members: Vec<usize> = from_group_members
                .iter()
                .filter(|&&p| !clique.contains(&p))
                .cloned()
                .collect();
            new_from_members.extend_from_slice(target_people);

            let mut new_to_members: Vec<usize> = to_group_members
                .iter()
                .filter(|&&p| !target_people.contains(&p))
                .cloned()
                .collect();
            new_to_members.extend_from_slice(clique);

            // Calculate new penalties
            let new_from_penalty =
                self.calculate_group_attribute_penalty_for_members(&new_from_members, ac);
            let new_to_penalty =
                self.calculate_group_attribute_penalty_for_members(&new_to_members, ac);

            delta += (new_from_penalty + new_to_penalty) - (old_from_penalty + old_to_penalty);
        }

        delta
    }

    /// Apply a clique swap, moving the clique to a new group and swapping with target people
    pub fn apply_clique_swap(
        &mut self,
        day: usize,
        clique_idx: usize,
        from_group: usize,
        to_group: usize,
        target_people: &[usize],
    ) {
        // If this clique is not active for this session, do nothing
        if let Some(ref sessions) = self.clique_sessions[clique_idx] {
            if !sessions.contains(&day) {
                return;
            }
        }

        let active_members = self.active_clique_members_for_group(day, clique_idx, from_group);
        if !self.clique_swap_targets_are_valid(
            day,
            from_group,
            to_group,
            &active_members,
            target_people,
        ) {
            return;
        }

        let old_from = self.schedule[day][from_group].clone();
        let old_to = self.schedule[day][to_group].clone();

        let source_remaining: Vec<usize> = old_from
            .iter()
            .copied()
            .filter(|person| !active_members.contains(person))
            .collect();
        let target_remaining: Vec<usize> = old_to
            .iter()
            .copied()
            .filter(|person| !target_people.contains(person))
            .collect();

        for &member in &active_members {
            for &other in &source_remaining {
                if self.person_participation[other][day] {
                    self.update_contact_cache_for_clique_swap_pair(member, other, -1);
                }
            }
            for &other in &target_remaining {
                if self.person_participation[other][day] {
                    self.update_contact_cache_for_clique_swap_pair(member, other, 1);
                }
            }
        }

        for &person in target_people {
            for &other in &target_remaining {
                if self.person_participation[other][day] {
                    self.update_contact_cache_for_clique_swap_pair(person, other, -1);
                }
            }
            for &other in &source_remaining {
                if self.person_participation[other][day] {
                    self.update_contact_cache_for_clique_swap_pair(person, other, 1);
                }
            }
        }

        let mut new_from = source_remaining.clone();
        new_from.extend_from_slice(target_people);

        let mut new_to = target_remaining.clone();
        new_to.extend_from_slice(&active_members);

        #[cfg(feature = "debug-invariant-checks")]
        {
            // In debug mode, assert sizes preserved and no duplicates within each group
            if self.logging.debug_validate_invariants {
                if self.logging.debug_dump_invariant_context {
                    // Check for duplicates within groups
                    let mut seen = std::collections::HashSet::new();
                    for &p in &new_from {
                        if !seen.insert(p) {
                            eprintln!(
                                "[DEBUG] Duplicate in new_from: {}",
                                self.display_person_by_idx(p)
                            );
                        }
                    }
                    seen.clear();
                    for &p in &new_to {
                        if !seen.insert(p) {
                            eprintln!(
                                "[DEBUG] Duplicate in new_to: {}",
                                self.display_person_by_idx(p)
                            );
                        }
                    }
                }
                // Expect cardinality preserved
                debug_assert_eq!(
                    new_from.len(),
                    self.schedule[day][from_group].len() - active_members.len() + target_people.len()
                );
                debug_assert_eq!(
                    new_to.len(),
                    self.schedule[day][to_group].len() - target_people.len() + active_members.len()
                );
            }
        }

        self.schedule[day][from_group] = new_from;
        self.schedule[day][to_group] = new_to;

        // Update locations for all people in these two groups
        for (pos, &pid) in self.schedule[day][from_group].iter().enumerate() {
            self.locations[day][pid] = (from_group, pos);
        }
        for (pos, &pid) in self.schedule[day][to_group].iter().enumerate() {
            self.locations[day][pid] = (to_group, pos);
        }

        self._recalculate_attribute_balance_penalty();
        self._recalculate_constraint_penalty();
        self.recalculate_pairmin_counts();
        self._update_constraint_penalty_total();
        self.refresh_cost_from_caches();

        #[cfg(feature = "debug-invariant-checks")]
        {
            // Session-wide invariant check (debug only)
            if self.logging.debug_validate_invariants {
                if let Err(e) = self.validate_no_duplicate_assignments() {
                    if self.logging.debug_dump_invariant_context {
                        eprintln!(
                            "[DEBUG] Invariant failed after clique swap day={} from={} to={} moved_clique_size={} target_size={}",
                            day,
                            self.group_idx_to_id[from_group],
                            self.group_idx_to_id[to_group],
                            active_members.len(),
                            target_people.len()
                        );
                    }
                    // Surface error up-stack on next algorithm-side check
                    let _ = e; // no-op here; algorithm already checks after call
                }
            }
        }

        #[cfg(feature = "cache-drift-assertions")]
        self.debug_assert_no_cache_drift_if_enabled("apply_clique_swap");
    }
}
