//! Swap move operations for the solver.
//!
//! This module implements the swap move - exchanging two people between different groups
//! within the same session. This is the fundamental move operation for the optimization.

use super::super::State;
use crate::models::PairMeetingMode;

impl State {
    fn contact_delta_for_membership_change(
        &self,
        day: usize,
        person_idx: usize,
        members: &[usize],
        self_member_idx: usize,
        direction: i32,
    ) -> f64 {
        let mut delta_cost = 0.0;

        for &member in members.iter() {
            if member == self_member_idx || !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[person_idx][member];
            if direction < 0 && count == 0 {
                continue;
            }

            let new_count = if direction < 0 { count - 1 } else { count + 1 };
            let old_penalty = self.repetition_penalty_for_contact_count(count);
            let new_penalty = self.repetition_penalty_for_contact_count(new_count);
            delta_cost += self.w_repetition * (new_penalty - old_penalty) as f64;

            if direction < 0 && count == 1 {
                delta_cost += self.w_contacts;
            }
            if direction > 0 && count == 0 {
                delta_cost -= self.w_contacts;
            }
        }

        delta_cost
    }

    /// Calculates the change in the total cost function if a swap were to be performed.
    ///
    /// This is the core method for evaluating potential moves during optimization.
    /// It efficiently calculates only the cost difference (delta) that would result
    /// from swapping two people between groups in a specific session, without
    /// actually performing the swap. This allows algorithms to quickly evaluate
    /// many potential moves and select the best ones.
    ///
    /// # Algorithm
    ///
    /// The delta calculation considers all optimization components:
    /// 1. **Contact changes**: How unique contacts and repeat encounters change
    /// 2. **Repetition penalties**: Changes in penalties for exceeding encounter limits
    /// 3. **Attribute balance**: Impact on group attribute distributions
    /// 4. **Constraint violations**: Changes in clique and forbidden pair violations
    ///
    /// # Arguments
    ///
    /// * `day` - Session index (0-based) where the swap would occur
    /// * `p1_idx` - Index of the first person to swap
    /// * `p2_idx` - Index of the second person to swap
    ///
    /// # Returns
    ///
    /// The cost delta as a `f64`:
    /// - **Negative values** indicate the swap would improve the solution (lower cost)
    /// - **Positive values** indicate the swap would worsen the solution (higher cost)
    /// - **Zero** indicates no change (e.g., swapping people in the same group)
    /// - **Infinity** indicates an invalid swap (e.g., non-participating person)
    ///
    /// # Performance
    ///
    /// This method is highly optimized since it's called frequently during optimization:
    /// - **O(group_size)** complexity for contact calculations
    /// - **O(constraints)** complexity for constraint evaluation
    /// - **No full cost recalculation** - only computes changes
    /// - **Early termination** for invalid swaps
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use gm_core::solver::State;
    /// # use gm_core::models::*;
    /// # use std::collections::HashMap;
    /// # let input = ApiInput {
    /// #     initial_schedule: None,
    /// #     problem: ProblemDefinition { people: vec![], groups: vec![], num_sessions: 1 },
    /// #     objectives: vec![], constraints: vec![],
    /// #     solver: SolverConfiguration {
    /// #         solver_type: "SimulatedAnnealing".to_string(),
    /// #         stop_conditions: StopConditions { max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None },
    /// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams { initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0) }),
    /// #         logging: LoggingOptions::default(),
    /// #         telemetry: Default::default(),
    /// #         seed: None,
    /// #         move_policy: None,
    /// #         allowed_sessions: None,
    /// #     },
    /// # };
    /// # let mut state = State::new(&input)?;
    /// // Evaluate swapping person 0 and person 1 in session 0
    /// let delta = state.calculate_swap_cost_delta(0, 0, 1);
    ///
    /// if delta < 0.0 {
    ///     println!("Beneficial swap found! Delta: {}", delta);
    ///     // Apply the swap since it improves the solution
    ///     state.apply_swap(0, 0, 1);
    /// } else if delta > 0.0 {
    ///     println!("Swap would worsen solution by: {}", delta);
    ///     // Don't apply this swap
    /// } else {
    ///     println!("Swap has no effect (probably same group)");
    /// }
    /// # Ok::<(), gm_core::solver::SolverError>(())
    /// ```
    ///
    /// # Algorithm Details
    ///
    /// The method calculates deltas for each component:
    ///
    /// ## Contact Delta
    /// - For each person, calculates lost contacts from their current group
    /// - Calculates gained contacts from their new group
    /// - Updates unique contact count and repetition penalties
    ///
    /// ## Attribute Balance Delta
    /// - Simulates the group compositions after the swap
    /// - Calculates how attribute distributions change
    /// - Computes penalty changes for each attribute balance constraint
    ///
    /// ## Constraint Delta
    /// - **Clique violations**: Checks if swap breaks clique integrity
    /// - **Forbidden pairs**: Checks if swap creates/removes forbidden pairings
    /// - **Immovable constraints**: Handled by early validation
    ///
    /// # Validation
    ///
    /// The method performs validation checks:
    /// - Both people must be participating in the session
    /// - People cannot be swapped with themselves
    /// - Swaps within the same group return zero delta
    ///
    /// # Used By
    ///
    /// This method is primarily used by optimization algorithms:
    /// - **Simulated Annealing**: Evaluates random moves for acceptance/rejection
    /// - **Hill Climbing**: Finds the best improving move
    /// - **Local Search**: Explores neighborhood of current solution
    pub fn calculate_swap_cost_delta(&self, day: usize, p1_idx: usize, p2_idx: usize) -> f64 {
        // Check if both people are participating in this session
        if !self.person_participation[p1_idx][day] || !self.person_participation[p2_idx][day] {
            return f64::INFINITY; // Invalid swap - one or both people not participating
        }

        let (g1_idx, _) = self.locations[day][p1_idx];
        let (g2_idx, _) = self.locations[day][p2_idx];

        if g1_idx == g2_idx {
            return 0.0;
        }

        let mut delta_cost = 0.0;

        // --- Contact/Repetition Delta ---
        let g1_members = &self.schedule[day][g1_idx];
        let g2_members = &self.schedule[day][g2_idx];
        delta_cost += self.contact_delta_for_membership_change(day, p1_idx, g1_members, p1_idx, -1);
        delta_cost += self.contact_delta_for_membership_change(day, p1_idx, g2_members, p2_idx, 1);
        delta_cost += self.contact_delta_for_membership_change(day, p2_idx, g2_members, p2_idx, -1);
        delta_cost += self.contact_delta_for_membership_change(day, p2_idx, g1_members, p1_idx, 1);

        let group_after_swap = |person_idx: usize| {
            if person_idx == p1_idx {
                g2_idx
            } else if person_idx == p2_idx {
                g1_idx
            } else {
                self.locations[day][person_idx].0
            }
        };

        // Attribute Balance Delta
        for &constraint_idx in
            self.attribute_balance_constraint_indices_for_group_session(day, g1_idx)
        {
            let old_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                g1_members,
                constraint_idx,
            );
            let new_penalty = self
                .calculate_group_attribute_penalty_for_constraint_members_with_edit(
                    g1_members,
                    constraint_idx,
                    Some(p1_idx),
                    Some(p2_idx),
                );
            delta_cost += new_penalty - old_penalty;
        }
        for &constraint_idx in
            self.attribute_balance_constraint_indices_for_group_session(day, g2_idx)
        {
            let old_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                g2_members,
                constraint_idx,
            );
            let new_penalty = self
                .calculate_group_attribute_penalty_for_constraint_members_with_edit(
                    g2_members,
                    constraint_idx,
                    Some(p2_idx),
                    Some(p1_idx),
                );
            delta_cost += new_penalty - old_penalty;
        }

        // Hard Constraint Delta - Cliques
        // No clique weight based delta; cliques are enforced by move feasibility

        // Constraint Delta - Forbidden Pairs
        let forbidden_pair_indices = self.merged_unique_constraint_indices(
            self.forbidden_pair_indices_for_person_session(day, p1_idx),
            self.forbidden_pair_indices_for_person_session(day, p2_idx),
        );
        for pair_idx in forbidden_pair_indices {
            let (p1, p2) = self.forbidden_pairs[pair_idx];
            if !self.person_participation[p1][day] || !self.person_participation[p2][day] {
                continue;
            }

            let pair_weight = self.forbidden_pair_weights[pair_idx];

            let were_together = self.locations[day][p1].0 == self.locations[day][p2].0;
            let are_together = group_after_swap(p1) == group_after_swap(p2);

            if were_together && !are_together {
                delta_cost -= pair_weight;
            } else if !were_together && are_together {
                delta_cost += pair_weight;
            }
        }

        // Constraint Delta - ShouldStayTogether pairs
        let should_together_indices = self.merged_unique_constraint_indices(
            self.should_together_indices_for_person_session(day, p1_idx),
            self.should_together_indices_for_person_session(day, p2_idx),
        );
        for pair_idx in should_together_indices {
            let (person1, person2) = self.should_together_pairs[pair_idx];
            if !self.person_participation[person1][day] || !self.person_participation[person2][day]
            {
                continue;
            }

            let pair_weight = self.should_together_weights[pair_idx];

            let old_penalty = if self.locations[day][person1].0 != self.locations[day][person2].0 {
                pair_weight
            } else {
                0.0
            };

            let new_penalty = if group_after_swap(person1) != group_after_swap(person2) {
                pair_weight
            } else {
                0.0
            };

            delta_cost += new_penalty - old_penalty;
        }

        // Constraint Delta - PairMeetingCount
        let pairmin_indices = self.merged_unique_constraint_indices(
            self.pairmin_indices_for_person_session(day, p1_idx),
            self.pairmin_indices_for_person_session(day, p2_idx),
        );
        for cidx in pairmin_indices {
            let (a, b) = self.pairmin_pairs[cidx];
            // Determine before-after sameness for the pair on this day
            let (a_g_before, _) = self.locations[day][a];
            let (b_g_before, _) = self.locations[day][b];
            let before_same = a_g_before == b_g_before;

            let (g1_idx, _) = self.locations[day][p1_idx];
            let (g2_idx, _) = self.locations[day][p2_idx];

            let a_g_after = if a == p1_idx {
                g2_idx
            } else if a == p2_idx {
                g1_idx
            } else {
                a_g_before
            };
            let b_g_after = if b == p1_idx {
                g2_idx
            } else if b == p2_idx {
                g1_idx
            } else {
                b_g_before
            };
            let after_same = a_g_after == b_g_after;
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

    /// Executes a swap of two people between groups and updates all internal state.
    ///
    /// This method performs the actual swap operation that was evaluated by
    /// `calculate_swap_cost_delta()`. It updates the schedule, location mappings,
    /// contact matrix, and all scoring information to reflect the new group assignments.
    /// The method maintains consistency across all internal data structures.
    ///
    /// # Algorithm
    ///
    /// The swap operation involves several steps:
    /// 1. **Update schedule**: Move people between groups in the schedule
    /// 2. **Update locations**: Maintain the fast person→group lookup table
    /// 3. **Update contacts**: Increment/decrement contact matrix entries
    /// 4. **Update scores**: Recalculate unique contacts and repetition penalties
    /// 5. **Update constraints**: Recalculate all constraint penalties
    ///
    /// # Arguments
    ///
    /// * `day` - Session index (0-based) where the swap occurs
    /// * `p1_idx` - Index of the first person to swap
    /// * `p2_idx` - Index of the second person to swap
    ///
    /// # Panics
    ///
    /// This method will panic if:
    /// - Either person is not participating in the specified session
    /// - The day index is out of bounds
    /// - The person indices are invalid
    ///
    /// **Note**: Callers should validate moves using `calculate_swap_cost_delta()`
    /// before calling this method, as that method returns infinity for invalid swaps.
    ///
    /// # Performance
    ///
    /// This method is optimized for frequent use during optimization:
    /// - **O(group_size)** time complexity for contact updates
    /// - **Incremental updates** rather than full recalculation
    /// - **Efficient location tracking** for fast person lookups
    /// - **Batch constraint updates** where possible
    ///
    /// # State Consistency
    ///
    /// After calling this method, all internal state remains consistent:
    /// - `schedule` and `locations` are synchronized
    /// - `contact_matrix` reflects all current pairings
    /// - All scoring fields match the current schedule
    /// - Constraint violation counts are accurate
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use gm_core::solver::State;
    /// # use gm_core::models::*;
    /// # use std::collections::HashMap;
    /// # let input = ApiInput {
    /// #     initial_schedule: None,   
    /// #     problem: ProblemDefinition { people: vec![], groups: vec![], num_sessions: 1 },
    /// #     objectives: vec![], constraints: vec![],
    /// #     solver: SolverConfiguration {
    /// #         solver_type: "SimulatedAnnealing".to_string(),
    /// #         stop_conditions: StopConditions { max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None },
    /// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams { initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0) }),
    /// #         logging: LoggingOptions::default(),
    /// #         telemetry: Default::default(),
    /// #         seed: None,
    /// #         move_policy: None,
    /// #         allowed_sessions: None,
    /// #     },
    /// # };
    /// # let mut state = State::new(&input)?;
    /// // First evaluate the swap
    /// let delta = state.calculate_swap_cost_delta(0, 0, 1);
    ///
    /// if delta < 0.0 {
    ///     // The swap improves the solution, so apply it
    ///     state.apply_swap(0, 0, 1);
    ///     println!("Applied beneficial swap, expected improvement: {}", -delta);
    /// }
    /// # Ok::<(), gm_core::solver::SolverError>(())
    /// ```
    ///
    /// # Algorithm Steps
    ///
    /// ## 1. Schedule Update
    /// ```text
    /// Before: Group1=[Alice, Bob]    Group2=[Charlie, Diana]
    /// After:  Group1=[Alice, Diana]  Group2=[Charlie, Bob]
    /// ```
    ///
    /// ## 2. Contact Matrix Update
    /// - Decrements contacts for old group pairings
    /// - Increments contacts for new group pairings
    /// - Updates symmetric entries (contact_matrix[i][j] and contact_matrix[j][i])
    ///
    /// ## 3. Score Recalculation
    /// - Counts unique contacts (pairs with at least 1 encounter)
    /// - Calculates repetition penalties using the configured penalty function
    /// - Updates attribute balance penalties for affected groups
    /// - Recalculates all constraint violations
    ///
    /// # Typical Usage Pattern
    ///
    /// ```no_run
    /// # use gm_core::solver::State;
    /// # use gm_core::models::*;
    /// # use std::collections::HashMap;
    /// # let input = ApiInput {
    /// #     initial_schedule: None,
    /// #     problem: ProblemDefinition { people: vec![], groups: vec![], num_sessions: 1 },
    /// #     objectives: vec![], constraints: vec![],
    /// #     solver: SolverConfiguration {
    /// #         solver_type: "SimulatedAnnealing".to_string(),
    /// #         stop_conditions: StopConditions { max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None },
    /// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams { initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0) }),
    /// #         logging: LoggingOptions::default(),
    /// #         telemetry: Default::default(),
    /// #         seed: None,
    /// #         move_policy: None,
    /// #         allowed_sessions: None,
    /// #     },
    /// # };
    /// # let mut state = State::new(&input)?;
    /// // Optimization loop pattern
    /// for iteration in 0..1000 {
    ///     // Choose random people and session
    ///     let day = 0; // or rand::random::<usize>() % num_sessions
    ///     let p1 = 0;  // or random person selection
    ///     let p2 = 1;  // or random person selection
    ///     
    ///     // Evaluate the move
    ///     let delta = state.calculate_swap_cost_delta(day, p1, p2);
    ///     
    ///     // Decide whether to accept (algorithm-specific logic)
    ///     let should_accept = delta < 0.0; // Hill climbing: only improvements
    ///     // or: delta < 0.0 || random::<f64>() < (-delta / temperature).exp(); // Simulated annealing
    ///     
    ///     if should_accept {
    ///         state.apply_swap(day, p1, p2);
    ///     }
    /// }
    /// # Ok::<(), gm_core::solver::SolverError>(())
    /// ```
    pub fn apply_swap(&mut self, day: usize, p1_idx: usize, p2_idx: usize) {
        #[cfg(feature = "debug-attr-balance-tracing")]
        let debug_attr_balance = std::env::var_os("DEBUG_ATTR_BALANCE").is_some();

        // Verify both people are participating in this session
        if !self.person_participation[p1_idx][day] || !self.person_participation[p2_idx][day] {
            eprintln!(
                "Warning: Attempted to swap non-participating people in session {}",
                day
            );
            return; // Skip invalid swap
        }

        let (g1_idx, g1_vec_idx) = self.locations[day][p1_idx];
        let (g2_idx, g2_vec_idx) = self.locations[day][p2_idx];

        if g1_idx == g2_idx {
            return; // Same group, no swap needed
        }

        // === TAKE OWNERSHIP OF AFFECTED GROUPS ===
        let (mut old_g1_members, mut old_g2_members) = {
            let day_schedule = &mut self.schedule[day];
            if g1_idx < g2_idx {
                let (left, right) = day_schedule.split_at_mut(g2_idx);
                (
                    std::mem::take(&mut left[g1_idx]),
                    std::mem::take(&mut right[0]),
                )
            } else {
                let (left, right) = day_schedule.split_at_mut(g1_idx);
                (
                    std::mem::take(&mut right[0]),
                    std::mem::take(&mut left[g2_idx]),
                )
            }
        };

        // Remove old contacts for p1 with participating members in g1
        for &member in &old_g1_members {
            if member != p1_idx && self.person_participation[member][day] {
                let old_count = self.contact_matrix[p1_idx][member];
                if old_count > 0 {
                    self.contact_matrix[p1_idx][member] -= 1;
                    self.contact_matrix[member][p1_idx] -= 1;

                    // Update unique contacts count
                    if old_count == 1 {
                        self.unique_contacts -= 1; // No longer any contact
                    }

                    // Update repetition penalty
                    let old_penalty = self.repetition_penalty_for_contact_count(old_count);
                    let new_penalty = self.repetition_penalty_for_contact_count(old_count - 1);
                    self.repetition_penalty += new_penalty - old_penalty;
                }
            }
        }

        // Add new contacts for p1 with participating members in g2
        for &member in &old_g2_members {
            if member != p2_idx && self.person_participation[member][day] {
                let old_count = self.contact_matrix[p1_idx][member];
                self.contact_matrix[p1_idx][member] += 1;
                self.contact_matrix[member][p1_idx] += 1;

                // Update unique contacts count
                if old_count == 0 {
                    self.unique_contacts += 1; // New unique contact
                }

                // Update repetition penalty
                let old_penalty = self.repetition_penalty_for_contact_count(old_count);
                let new_penalty = self.repetition_penalty_for_contact_count(old_count + 1);
                self.repetition_penalty += new_penalty - old_penalty;
            }
        }

        // Remove old contacts for p2 with participating members in g2
        for &member in &old_g2_members {
            if member != p2_idx && self.person_participation[member][day] {
                let old_count = self.contact_matrix[p2_idx][member];
                if old_count > 0 {
                    self.contact_matrix[p2_idx][member] -= 1;
                    self.contact_matrix[member][p2_idx] -= 1;

                    // Update unique contacts count
                    if old_count == 1 {
                        self.unique_contacts -= 1; // No longer any contact
                    }

                    // Update repetition penalty
                    let old_penalty = self.repetition_penalty_for_contact_count(old_count);
                    let new_penalty = self.repetition_penalty_for_contact_count(old_count - 1);
                    self.repetition_penalty += new_penalty - old_penalty;
                }
            }
        }

        // Add new contacts for p2 with participating members in g1
        for &member in &old_g1_members {
            if member != p1_idx && self.person_participation[member][day] {
                let old_count = self.contact_matrix[p2_idx][member];
                self.contact_matrix[p2_idx][member] += 1;
                self.contact_matrix[member][p2_idx] += 1;

                // Update unique contacts count
                if old_count == 0 {
                    self.unique_contacts += 1; // New unique contact
                }

                // Update repetition penalty
                let old_penalty = self.repetition_penalty_for_contact_count(old_count);
                let new_penalty = self.repetition_penalty_for_contact_count(old_count + 1);
                self.repetition_penalty += new_penalty - old_penalty;
            }
        }

        let g1_attr_constraints = self
            .attribute_balance_constraint_indices_for_group_session(day, g1_idx)
            .to_vec();
        let g2_attr_constraints = self
            .attribute_balance_constraint_indices_for_group_session(day, g2_idx)
            .to_vec();

        let mut g1_attr_deltas = Vec::with_capacity(g1_attr_constraints.len());
        for &constraint_idx in &g1_attr_constraints {
            let old_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                &old_g1_members,
                constraint_idx,
            );
            g1_attr_deltas.push((constraint_idx, old_penalty));
        }
        let mut g2_attr_deltas = Vec::with_capacity(g2_attr_constraints.len());
        for &constraint_idx in &g2_attr_constraints {
            let old_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                &old_g2_members,
                constraint_idx,
            );
            g2_attr_deltas.push((constraint_idx, old_penalty));
        }

        // === UPDATE SCHEDULE AND LOCATIONS ===
        old_g1_members[g1_vec_idx] = p2_idx;
        old_g2_members[g2_vec_idx] = p1_idx;
        self.schedule[day][g1_idx] = old_g1_members;
        self.schedule[day][g2_idx] = old_g2_members;
        self.locations[day][p1_idx] = (g2_idx, g2_vec_idx);
        self.locations[day][p2_idx] = (g1_idx, g1_vec_idx);

        // === UPDATE ATTRIBUTE BALANCE PENALTY ===
        #[cfg(feature = "debug-attr-balance-tracing")]
        if debug_attr_balance {
            println!(
                "DEBUG: apply_swap - before attribute balance update: {}",
                self.attribute_balance_penalty
            );
        }

        for (constraint_idx, old_penalty) in g1_attr_deltas {
            let new_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                &self.schedule[day][g1_idx],
                constraint_idx,
            );
            let delta_penalty = new_penalty - old_penalty;

            #[cfg(feature = "debug-attr-balance-tracing")]
            if debug_attr_balance && delta_penalty.abs() > 0.001 {
                println!(
                    "DEBUG: apply_swap - resolved g1 constraint idx {}:",
                    constraint_idx
                );
                println!(
                    "  old_penalty: {}, new_penalty: {}",
                    old_penalty, new_penalty
                );
                println!("  delta_penalty: {}", delta_penalty);
            }

            self.attribute_balance_penalty += delta_penalty;
        }
        for (constraint_idx, old_penalty) in g2_attr_deltas {
            let new_penalty = self.calculate_group_attribute_penalty_for_constraint_members(
                &self.schedule[day][g2_idx],
                constraint_idx,
            );
            self.attribute_balance_penalty += new_penalty - old_penalty;
        }

        #[cfg(feature = "debug-attr-balance-tracing")]
        if debug_attr_balance {
            println!(
                "DEBUG: apply_swap - after attribute balance update: {}",
                self.attribute_balance_penalty
            );
        }

        // === UPDATE CONSTRAINT PENALTIES (THIS WAS MISSING!) ===

        // Update forbidden pair violations
        let forbidden_pair_indices = self.merged_unique_constraint_indices(
            self.forbidden_pair_indices_for_person_session(day, p1_idx),
            self.forbidden_pair_indices_for_person_session(day, p2_idx),
        );
        for pair_idx in forbidden_pair_indices {
            let (person_a, person_b) = self.forbidden_pairs[pair_idx];
            if !self.person_participation[person_a][day]
                || !self.person_participation[person_b][day]
            {
                continue;
            }

            let a_group_before = if person_a == p1_idx {
                g1_idx
            } else if person_a == p2_idx {
                g2_idx
            } else {
                self.locations[day][person_a].0
            };
            let b_group_before = if person_b == p1_idx {
                g1_idx
            } else if person_b == p2_idx {
                g2_idx
            } else {
                self.locations[day][person_b].0
            };
            let were_together_before = a_group_before == b_group_before;

            let a_group_after = if person_a == p1_idx {
                g2_idx
            } else if person_a == p2_idx {
                g1_idx
            } else {
                self.locations[day][person_a].0
            };
            let b_group_after = if person_b == p1_idx {
                g2_idx
            } else if person_b == p2_idx {
                g1_idx
            } else {
                self.locations[day][person_b].0
            };
            let are_together_after = a_group_after == b_group_after;

            if were_together_before && !are_together_after {
                self.forbidden_pair_violations[pair_idx] -= 1;
            } else if !were_together_before && are_together_after {
                self.forbidden_pair_violations[pair_idx] += 1;
            }
        }

        // Update should-together violations
        let should_together_indices = self.merged_unique_constraint_indices(
            self.should_together_indices_for_person_session(day, p1_idx),
            self.should_together_indices_for_person_session(day, p2_idx),
        );
        for pair_idx in should_together_indices {
            let (person_a, person_b) = self.should_together_pairs[pair_idx];
            if !self.person_participation[person_a][day]
                || !self.person_participation[person_b][day]
            {
                continue;
            }

            let a_group_before = if person_a == p1_idx {
                g1_idx
            } else if person_a == p2_idx {
                g2_idx
            } else {
                self.locations[day][person_a].0
            };
            let b_group_before = if person_b == p1_idx {
                g1_idx
            } else if person_b == p2_idx {
                g2_idx
            } else {
                self.locations[day][person_b].0
            };
            let was_violation_before = a_group_before != b_group_before;

            let a_group_after = if person_a == p1_idx {
                g2_idx
            } else if person_a == p2_idx {
                g1_idx
            } else {
                self.locations[day][person_a].0
            };
            let b_group_after = if person_b == p1_idx {
                g2_idx
            } else if person_b == p2_idx {
                g1_idx
            } else {
                self.locations[day][person_b].0
            };
            let is_violation_after = a_group_after != b_group_after;

            if was_violation_before && !is_violation_after {
                self.should_together_violations[pair_idx] -= 1;
            } else if !was_violation_before && is_violation_after {
                self.should_together_violations[pair_idx] += 1;
            }
        }

        // Update clique violations
        for (clique_idx, clique) in self.cliques.iter().enumerate() {
            // Check if this clique applies to this session
            if let Some(ref sessions) = self.clique_sessions[clique_idx] {
                if !sessions.contains(&day) {
                    continue; // Skip this constraint for this session
                }
            }

            // Check if this swap affects this clique
            let clique_affected = clique.contains(&p1_idx) || clique.contains(&p2_idx);
            if clique_affected {
                // Only consider clique members who are participating in this session
                let participating_members: Vec<usize> = clique
                    .iter()
                    .filter(|&&member| self.person_participation[member][day])
                    .cloned()
                    .collect();

                // If fewer than 2 members are participating, no constraint to enforce
                if participating_members.len() >= 2 {
                    // Calculate violations before the swap
                    let mut group_counts_before = vec![0; self.schedule[day].len()];
                    for &member in &participating_members {
                        let group_before = if member == p1_idx {
                            g1_idx
                        } else if member == p2_idx {
                            g2_idx
                        } else {
                            self.locations[day][member].0
                        };
                        group_counts_before[group_before] += 1;
                    }
                    let max_before = *group_counts_before.iter().max().unwrap_or(&0);
                    let violations_before = participating_members.len() as i32 - max_before;

                    // Calculate violations after the swap
                    let mut group_counts_after = vec![0; self.schedule[day].len()];
                    for &member in &participating_members {
                        let group_after = if member == p1_idx {
                            g2_idx
                        } else if member == p2_idx {
                            g1_idx
                        } else {
                            self.locations[day][member].0
                        };
                        group_counts_after[group_after] += 1;
                    }
                    let max_after = *group_counts_after.iter().max().unwrap_or(&0);
                    let violations_after = participating_members.len() as i32 - max_after;

                    // Update the cached violation count
                    self.clique_violations[clique_idx] += violations_after - violations_before;
                }
            }
        }

        // Update immovable person violations
        for ((person_idx, session_idx), required_group_idx) in &self.immovable_people {
            if *session_idx == day && self.person_participation[*person_idx][day] {
                if *person_idx == p1_idx {
                    // p1 moved from g1 to g2
                    let was_violation_before = g1_idx != *required_group_idx;
                    let is_violation_after = g2_idx != *required_group_idx;

                    if was_violation_before && !is_violation_after {
                        self.immovable_violations -= 1; // Violation fixed
                    } else if !was_violation_before && is_violation_after {
                        self.immovable_violations += 1; // New violation
                    }
                } else if *person_idx == p2_idx {
                    // p2 moved from g2 to g1
                    let was_violation_before = g2_idx != *required_group_idx;
                    let is_violation_after = g1_idx != *required_group_idx;

                    if was_violation_before && !is_violation_after {
                        self.immovable_violations -= 1; // Violation fixed
                    } else if !was_violation_before && is_violation_after {
                        self.immovable_violations += 1; // New violation
                    }
                }
            }
        }

        // Update PairMinMeetings counts for this day if relevant
        let pairmin_indices = self.merged_unique_constraint_indices(
            self.pairmin_indices_for_person_session(day, p1_idx),
            self.pairmin_indices_for_person_session(day, p2_idx),
        );
        for cidx in pairmin_indices {
            let (a, b) = self.pairmin_pairs[cidx];
            if !self.person_participation[a][day] || !self.person_participation[b][day] {
                continue;
            }
            // Before swap groups for a and b (use original group assignments for swapped people)
            let a_group_before = if a == p1_idx {
                g1_idx
            } else if a == p2_idx {
                g2_idx
            } else {
                self.locations[day][a].0
            };
            let b_group_before = if b == p1_idx {
                g1_idx
            } else if b == p2_idx {
                g2_idx
            } else {
                self.locations[day][b].0
            };
            let were_same = a_group_before == b_group_before;

            // After swap groups for a and b
            let a_group_after = if a == p1_idx {
                g2_idx
            } else if a == p2_idx {
                g1_idx
            } else {
                self.locations[day][a].0
            };
            let b_group_after = if b == p1_idx {
                g2_idx
            } else if b == p2_idx {
                g1_idx
            } else {
                self.locations[day][b].0
            };
            let are_same = a_group_after == b_group_after;

            if were_same == are_same {
                continue;
            }
            if are_same {
                self.pairmin_counts[cidx] += 1;
            } else {
                self.pairmin_counts[cidx] -= 1;
            }
        }

        // Update the legacy constraint_penalty field for backward compatibility
        self._update_constraint_penalty_total();
        self.refresh_cost_from_caches();
        #[cfg(feature = "cache-drift-assertions")]
        self.debug_assert_no_cache_drift_if_enabled("apply_swap");
    }
}
