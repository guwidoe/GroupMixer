//! Clique swap move operations for the solver.
//!
//! This module implements clique swaps - moving an entire group of people who must
//! stay together (a clique) to a different group, exchanging them with non-clique
//! members from the target group.

use super::super::State;
use crate::models::PairMeetingMode;

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

    fn update_contact_cache_for_clique_swap_pair(
        &mut self,
        person_a: usize,
        person_b: usize,
        delta: i32,
    ) {
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

    fn clique_swap_group_members_after(
        old_from: &[usize],
        old_to: &[usize],
        active_members: &[usize],
        target_people: &[usize],
    ) -> (Vec<usize>, Vec<usize>, Vec<usize>, Vec<usize>) {
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

        let mut new_from = source_remaining.clone();
        new_from.extend_from_slice(target_people);

        let mut new_to = target_remaining.clone();
        new_to.extend_from_slice(active_members);

        (source_remaining, target_remaining, new_from, new_to)
    }

    fn clique_swap_has_hard_apart_conflict(
        &self,
        day: usize,
        active_members: &[usize],
        target_people: &[usize],
        source_remaining: &[usize],
        target_remaining: &[usize],
    ) -> bool {
        self.block_has_hard_apart_conflict(day, active_members, target_remaining)
            || self.block_has_hard_apart_conflict(day, target_people, source_remaining)
    }

    fn contact_delta_for_clique_swap_pair(
        &self,
        person_a: usize,
        person_b: usize,
        direction: i32,
    ) -> f64 {
        let count = self.contact_matrix[person_a][person_b];

        if direction < 0 && count == 0 {
            return 0.0;
        }

        let new_count = if direction < 0 { count - 1 } else { count + 1 };
        let old_penalty = self.repetition_penalty_for_contact_count(count);
        let new_penalty = self.repetition_penalty_for_contact_count(new_count);

        let mut delta_cost = self.w_repetition * (new_penalty - old_penalty) as f64;

        if direction < 0 && count == 1 {
            delta_cost += self.w_contacts;
        }

        if direction > 0 && count == 0 {
            delta_cost -= self.w_contacts;
        }

        delta_cost
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

        let old_from = &self.schedule[day][from_group];
        let old_to = &self.schedule[day][to_group];
        let (source_remaining, target_remaining, new_from, new_to) =
            Self::clique_swap_group_members_after(old_from, old_to, &active_members, target_people);

        if self.clique_swap_has_hard_apart_conflict(
            day,
            &active_members,
            target_people,
            &source_remaining,
            &target_remaining,
        ) {
            return f64::INFINITY;
        }

        let mut delta_cost = 0.0;

        for &member in &active_members {
            for &other in &source_remaining {
                if self.person_participation[other][day] {
                    delta_cost += self.contact_delta_for_clique_swap_pair(member, other, -1);
                }
            }
            for &other in &target_remaining {
                if self.person_participation[other][day] {
                    delta_cost += self.contact_delta_for_clique_swap_pair(member, other, 1);
                }
            }
        }

        for &person in target_people {
            for &other in &target_remaining {
                if self.person_participation[other][day] {
                    delta_cost += self.contact_delta_for_clique_swap_pair(person, other, -1);
                }
            }
            for &other in &source_remaining {
                if self.person_participation[other][day] {
                    delta_cost += self.contact_delta_for_clique_swap_pair(person, other, 1);
                }
            }
        }

        let moved_person_group_after = |person: usize| {
            if active_members.contains(&person) {
                to_group
            } else if target_people.contains(&person) {
                from_group
            } else {
                self.locations[day][person].0
            }
        };

        for (pair_idx, &(person_a, person_b)) in self.soft_apart_pairs.iter().enumerate() {
            if let Some(ref sessions) = self.soft_apart_pair_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue;
                }
            }

            if !self.person_participation[person_a][day]
                || !self.person_participation[person_b][day]
            {
                continue;
            }

            if !active_members.contains(&person_a)
                && !active_members.contains(&person_b)
                && !target_people.contains(&person_a)
                && !target_people.contains(&person_b)
            {
                continue;
            }

            let were_together = self.locations[day][person_a].0 == self.locations[day][person_b].0;
            let are_together =
                moved_person_group_after(person_a) == moved_person_group_after(person_b);

            if were_together && !are_together {
                delta_cost -= self.soft_apart_pair_weights[pair_idx];
            } else if !were_together && are_together {
                delta_cost += self.soft_apart_pair_weights[pair_idx];
            }
        }

        for (pair_idx, &(person_a, person_b)) in self.should_together_pairs.iter().enumerate() {
            if let Some(ref sessions) = self.should_together_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue;
                }
            }

            if !self.person_participation[person_a][day]
                || !self.person_participation[person_b][day]
            {
                continue;
            }

            if !active_members.contains(&person_a)
                && !active_members.contains(&person_b)
                && !target_people.contains(&person_a)
                && !target_people.contains(&person_b)
            {
                continue;
            }

            let was_violation = self.locations[day][person_a].0 != self.locations[day][person_b].0;
            let is_violation =
                moved_person_group_after(person_a) != moved_person_group_after(person_b);

            if was_violation && !is_violation {
                delta_cost -= self.should_together_weights[pair_idx];
            } else if !was_violation && is_violation {
                delta_cost += self.should_together_weights[pair_idx];
            }
        }

        for (pair_idx, &(person_a, person_b)) in self.pairmin_pairs.iter().enumerate() {
            if !self.pairmin_sessions[pair_idx].contains(&day) {
                continue;
            }

            if !self.person_participation[person_a][day]
                || !self.person_participation[person_b][day]
            {
                continue;
            }

            if !active_members.contains(&person_a)
                && !active_members.contains(&person_b)
                && !target_people.contains(&person_a)
                && !target_people.contains(&person_b)
            {
                continue;
            }

            let were_together = self.locations[day][person_a].0 == self.locations[day][person_b].0;
            let are_together =
                moved_person_group_after(person_a) == moved_person_group_after(person_b);

            if were_together == are_together {
                continue;
            }

            let have_before = self.pairmin_counts[pair_idx] as i32;
            let have_after = if are_together {
                have_before + 1
            } else {
                have_before - 1
            };
            let target = self.pairmin_required[pair_idx] as i32;
            let weight = self.pairmin_weights[pair_idx];

            let (before_penalty, after_penalty) = match self.pairmin_modes[pair_idx] {
                PairMeetingMode::AtLeast => (
                    (target - have_before).max(0) as f64 * weight,
                    (target - have_after).max(0) as f64 * weight,
                ),
                PairMeetingMode::Exact => (
                    (have_before - target).abs() as f64 * weight,
                    (have_after - target).abs() as f64 * weight,
                ),
                PairMeetingMode::AtMost => (
                    (have_before - target).max(0) as f64 * weight,
                    (have_after - target).max(0) as f64 * weight,
                ),
            };

            delta_cost += after_penalty - before_penalty;
        }

        let from_attr_constraints = self
            .attribute_balance_constraint_indices_for_group_session(day, from_group)
            .to_vec();
        for constraint_idx in from_attr_constraints {
            let old_penalty = self
                .calculate_group_attribute_penalty_for_constraint_members(old_from, constraint_idx);
            let new_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                &new_from,
                constraint_idx,
            );
            delta_cost += new_penalty - old_penalty;
        }
        let to_attr_constraints = self
            .attribute_balance_constraint_indices_for_group_session(day, to_group)
            .to_vec();
        for constraint_idx in to_attr_constraints {
            let old_penalty = self
                .calculate_group_attribute_penalty_for_constraint_members(old_to, constraint_idx);
            let new_penalty = self
                .calculate_group_attribute_penalty_for_constraint_members(&new_to, constraint_idx);
            delta_cost += new_penalty - old_penalty;
        }

        delta_cost
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

        let (source_remaining, target_remaining, new_from, new_to) =
            Self::clique_swap_group_members_after(
                &old_from,
                &old_to,
                &active_members,
                target_people,
            );

        if self.clique_swap_has_hard_apart_conflict(
            day,
            &active_members,
            target_people,
            &source_remaining,
            &target_remaining,
        ) {
            return;
        }

        let current_groups: Vec<usize> = self.locations[day]
            .iter()
            .map(|&(group_idx, _)| group_idx)
            .collect();
        let moved_person_group_after = |person: usize| {
            if active_members.contains(&person) {
                to_group
            } else if target_people.contains(&person) {
                from_group
            } else {
                current_groups[person]
            }
        };

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

        for (pair_idx, &(person_a, person_b)) in self.soft_apart_pairs.iter().enumerate() {
            if let Some(ref sessions) = self.soft_apart_pair_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue;
                }
            }

            if !self.person_participation[person_a][day]
                || !self.person_participation[person_b][day]
            {
                continue;
            }

            if !active_members.contains(&person_a)
                && !active_members.contains(&person_b)
                && !target_people.contains(&person_a)
                && !target_people.contains(&person_b)
            {
                continue;
            }

            let were_together = self.locations[day][person_a].0 == self.locations[day][person_b].0;
            let are_together =
                moved_person_group_after(person_a) == moved_person_group_after(person_b);

            if were_together && !are_together {
                self.soft_apart_pair_violations[pair_idx] -= 1;
            } else if !were_together && are_together {
                self.soft_apart_pair_violations[pair_idx] += 1;
            }
        }

        for (pair_idx, &(person_a, person_b)) in self.should_together_pairs.iter().enumerate() {
            if let Some(ref sessions) = self.should_together_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue;
                }
            }

            if !self.person_participation[person_a][day]
                || !self.person_participation[person_b][day]
            {
                continue;
            }

            if !active_members.contains(&person_a)
                && !active_members.contains(&person_b)
                && !target_people.contains(&person_a)
                && !target_people.contains(&person_b)
            {
                continue;
            }

            let was_violation = self.locations[day][person_a].0 != self.locations[day][person_b].0;
            let is_violation =
                moved_person_group_after(person_a) != moved_person_group_after(person_b);

            if was_violation && !is_violation {
                self.should_together_violations[pair_idx] -= 1;
            } else if !was_violation && is_violation {
                self.should_together_violations[pair_idx] += 1;
            }
        }

        for (pair_idx, &(person_a, person_b)) in self.pairmin_pairs.iter().enumerate() {
            if !self.pairmin_sessions[pair_idx].contains(&day) {
                continue;
            }

            if !self.person_participation[person_a][day]
                || !self.person_participation[person_b][day]
            {
                continue;
            }

            if !active_members.contains(&person_a)
                && !active_members.contains(&person_b)
                && !target_people.contains(&person_a)
                && !target_people.contains(&person_b)
            {
                continue;
            }

            let were_together = self.locations[day][person_a].0 == self.locations[day][person_b].0;
            let are_together =
                moved_person_group_after(person_a) == moved_person_group_after(person_b);

            if were_together == are_together {
                continue;
            }

            if are_together {
                self.pairmin_counts[pair_idx] += 1;
            } else {
                self.pairmin_counts[pair_idx] -= 1;
            }
        }

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
                    self.schedule[day][from_group].len() - active_members.len()
                        + target_people.len()
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

        let from_attr_constraints = self
            .attribute_balance_constraint_indices_for_group_session(day, from_group)
            .to_vec();
        for constraint_idx in from_attr_constraints {
            let old_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                &old_from,
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
            let old_penalty = self
                .calculate_group_attribute_penalty_for_constraint_members(&old_to, constraint_idx);
            let new_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                &self.schedule[day][to_group],
                constraint_idx,
            );
            self.attribute_balance_penalty += new_penalty - old_penalty;
        }

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
