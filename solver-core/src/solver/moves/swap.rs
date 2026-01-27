//! Swap move operations for the solver.
//!
//! This module implements the swap move - exchanging two people between different groups
//! within the same session. This is the fundamental move operation for the optimization.

use super::super::State;
use crate::models::PairMeetingMode;

impl State {
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
    /// # use solver_core::solver::State;
    /// # use solver_core::models::*;
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
    /// # Ok::<(), solver_core::solver::SolverError>(())
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

        // --- Changes for p1 (loses contacts with g1, gains with g2) ---
        for &member in g1_members.iter() {
            if member == p1_idx {
                continue;
            }
            // Only consider contacts with participating members
            if !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[p1_idx][member];
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
        for &member in g2_members.iter() {
            if member == p2_idx {
                continue;
            }
            // Only consider contacts with participating members
            if !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[p1_idx][member];
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

        // --- Changes for p2 (loses contacts with g2, gains with g1) ---
        for &member in g2_members.iter() {
            if member == p2_idx {
                continue;
            }
            // Only consider contacts with participating members
            if !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[p2_idx][member];
            if count > 0 {
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
                    delta_cost += self.w_contacts;
                }
            }
        }
        for &member in g1_members.iter() {
            if member == p1_idx {
                continue;
            }
            // Only consider contacts with participating members
            if !self.person_participation[member][day] {
                continue;
            }

            let count = self.contact_matrix[p2_idx][member];
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
                delta_cost -= self.w_contacts;
            }
        }

        // Attribute Balance Delta
        for ac in &self.attribute_balance_constraints {
            let g1_id = &self.group_idx_to_id[g1_idx];
            let g2_id = &self.group_idx_to_id[g2_idx];

            if !self.attribute_balance_constraint_applies(ac, day) {
                continue;
            }

            // Only calculate if the constraint applies to one of the affected groups
            let applies_to_g1 = ac.group_id == *g1_id;
            let applies_to_g2 = ac.group_id == *g2_id;

            if !applies_to_g1 && !applies_to_g2 {
                continue; // Skip constraint that doesn't apply to either group
            }

            let old_penalty_g1 = if applies_to_g1 {
                self.calculate_group_attribute_penalty_for_members(g1_members, ac)
            } else {
                0.0
            };
            let old_penalty_g2 = if applies_to_g2 {
                self.calculate_group_attribute_penalty_for_members(g2_members, ac)
            } else {
                0.0
            };

            let new_penalty_g1 = if applies_to_g1 {
                let mut next_g1_members: Vec<usize> = g1_members
                    .iter()
                    .filter(|&&p| p != p1_idx)
                    .cloned()
                    .collect();
                next_g1_members.push(p2_idx);
                self.calculate_group_attribute_penalty_for_members(&next_g1_members, ac)
            } else {
                0.0
            };
            let new_penalty_g2 = if applies_to_g2 {
                let mut next_g2_members: Vec<usize> = g2_members
                    .iter()
                    .filter(|&&p| p != p2_idx)
                    .cloned()
                    .collect();
                next_g2_members.push(p1_idx);
                self.calculate_group_attribute_penalty_for_members(&next_g2_members, ac)
            } else {
                0.0
            };

            let delta_penalty =
                (new_penalty_g1 + new_penalty_g2) - (old_penalty_g1 + old_penalty_g2);
            delta_cost += delta_penalty;
        }

        // Hard Constraint Delta - Cliques
        // No clique weight based delta; cliques are enforced by move feasibility

        // Constraint Delta - Forbidden Pairs
        for (pair_idx, &(p1, p2)) in self.forbidden_pairs.iter().enumerate() {
            // Check if this forbidden pair applies to this session
            if let Some(ref sessions) = self.forbidden_pair_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue; // Skip this constraint for this session
                }
            }

            // Check if both people are participating in this session
            if !self.person_participation[p1][day] || !self.person_participation[p2][day] {
                continue; // Skip if either person is not participating
            }

            let p1_is_swapped = p1_idx == p1 || p2_idx == p1;
            let p2_is_swapped = p1_idx == p2 || p2_idx == p2;

            // If the pair is not involved in the swap, no change
            if !p1_is_swapped && !p2_is_swapped {
                continue;
            }

            let pair_weight = self.forbidden_pair_weights[pair_idx];

            // Penalty before swap
            if g1_members.contains(&p1) && g1_members.contains(&p2) {
                delta_cost -= pair_weight;
            }
            if g2_members.contains(&p1) && g2_members.contains(&p2) {
                delta_cost -= pair_weight;
            }

            // Penalty after swap
            let mut next_g1_members: Vec<usize> = g1_members
                .iter()
                .filter(|&&p| p != p1_idx)
                .cloned()
                .collect();
            next_g1_members.push(p2_idx);
            let mut next_g2_members: Vec<usize> = g2_members
                .iter()
                .filter(|&&p| p != p2_idx)
                .cloned()
                .collect();
            next_g2_members.push(p1_idx);
            if next_g1_members.contains(&p1) && next_g1_members.contains(&p2) {
                delta_cost += pair_weight;
            }
            if next_g2_members.contains(&p1) && next_g2_members.contains(&p2) {
                delta_cost += pair_weight;
            }
        }

        // Constraint Delta - ShouldStayTogether pairs
        for (pair_idx, &(person1, person2)) in self.should_together_pairs.iter().enumerate() {
            // Check if this should-together pair applies to this session
            if let Some(ref sessions) = self.should_together_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue; // Skip this constraint for this session
                }
            }

            // Check if both people are participating in this session
            if !self.person_participation[person1][day] || !self.person_participation[person2][day]
            {
                continue; // Skip if either person is not participating
            }

            let pair_weight = self.should_together_weights[pair_idx];

            // Old penalty: separated across g1 and g2
            let p1_in_g1 = g1_members.contains(&person1);
            let p1_in_g2 = g2_members.contains(&person1);
            let p2_in_g1 = g1_members.contains(&person2);
            let p2_in_g2 = g2_members.contains(&person2);
            let old_penalty = if (p1_in_g1 && p2_in_g2) || (p1_in_g2 && p2_in_g1) {
                pair_weight
            } else {
                0.0
            };

            // New penalty after swap
            let mut next_g1_members: Vec<usize> = g1_members
                .iter()
                .filter(|&&p| p != p1_idx)
                .cloned()
                .collect();
            next_g1_members.push(p2_idx);
            let mut next_g2_members: Vec<usize> = g2_members
                .iter()
                .filter(|&&p| p != p2_idx)
                .cloned()
                .collect();
            next_g2_members.push(p1_idx);

            let new_p1_in_g1 = next_g1_members.contains(&person1);
            let new_p1_in_g2 = next_g2_members.contains(&person1);
            let new_p2_in_g1 = next_g1_members.contains(&person2);
            let new_p2_in_g2 = next_g2_members.contains(&person2);
            let new_penalty = if (new_p1_in_g1 && new_p2_in_g2) || (new_p1_in_g2 && new_p2_in_g1) {
                pair_weight
            } else {
                0.0
            };

            delta_cost += new_penalty - old_penalty;
        }

        // Constraint Delta - PairMeetingCount
        for (cidx, &(a, b)) in self.pairmin_pairs.iter().enumerate() {
            if !self.pairmin_sessions[cidx].contains(&day) {
                continue;
            }
            // Only if swap involves either endpoint at this day
            if a != p1_idx && a != p2_idx && b != p1_idx && b != p2_idx {
                continue;
            }
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
    /// # use solver_core::solver::State;
    /// # use solver_core::models::*;
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
    /// # Ok::<(), solver_core::solver::SolverError>(())
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
    /// # use solver_core::solver::State;
    /// # use solver_core::models::*;
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
    /// # Ok::<(), solver_core::solver::SolverError>(())
    /// ```
    pub fn apply_swap(&mut self, day: usize, p1_idx: usize, p2_idx: usize) {
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

        // === UPDATE CONTACT MATRIX ===
        let g1_members = &self.schedule[day][g1_idx].clone();
        let g2_members = &self.schedule[day][g2_idx].clone();

        // Remove old contacts for p1 with participating members in g1
        for &member in g1_members {
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
                    if old_count > 1 {
                        let old_penalty = (old_count as i32 - 1).pow(2);
                        let new_penalty = if old_count > 1 {
                            (old_count as i32 - 2).pow(2)
                        } else {
                            0
                        };
                        self.repetition_penalty += new_penalty - old_penalty;
                    }
                }
            }
        }

        // Add new contacts for p1 with participating members in g2
        for &member in g2_members {
            if member != p2_idx && self.person_participation[member][day] {
                let old_count = self.contact_matrix[p1_idx][member];
                self.contact_matrix[p1_idx][member] += 1;
                self.contact_matrix[member][p1_idx] += 1;

                // Update unique contacts count
                if old_count == 0 {
                    self.unique_contacts += 1; // New unique contact
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

        // Remove old contacts for p2 with participating members in g2
        for &member in g2_members {
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
                    if old_count > 1 {
                        let old_penalty = (old_count as i32 - 1).pow(2);
                        let new_penalty = if old_count > 1 {
                            (old_count as i32 - 2).pow(2)
                        } else {
                            0
                        };
                        self.repetition_penalty += new_penalty - old_penalty;
                    }
                }
            }
        }

        // Add new contacts for p2 with participating members in g1
        for &member in g1_members {
            if member != p1_idx && self.person_participation[member][day] {
                let old_count = self.contact_matrix[p2_idx][member];
                self.contact_matrix[p2_idx][member] += 1;
                self.contact_matrix[member][p2_idx] += 1;

                // Update unique contacts count
                if old_count == 0 {
                    self.unique_contacts += 1; // New unique contact
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
        self.schedule[day][g1_idx][g1_vec_idx] = p2_idx;
        self.schedule[day][g2_idx][g2_vec_idx] = p1_idx;
        self.locations[day][p1_idx] = (g2_idx, g2_vec_idx);
        self.locations[day][p2_idx] = (g1_idx, g1_vec_idx);

        // === UPDATE ATTRIBUTE BALANCE PENALTY ===
        if std::env::var("DEBUG_ATTR_BALANCE").is_ok() {
            println!(
                "DEBUG: apply_swap - before attribute balance update: {}",
                self.attribute_balance_penalty
            );
        }

        for ac in &self.attribute_balance_constraints {
            // Get group IDs for filtering
            let g1_id = &self.group_idx_to_id[g1_idx];
            let g2_id = &self.group_idx_to_id[g2_idx];

            if !self.attribute_balance_constraint_applies(ac, day) {
                continue;
            }

            // Only update if the constraint applies to one of the affected groups
            let applies_to_g1 = ac.group_id == *g1_id;
            let applies_to_g2 = ac.group_id == *g2_id;

            if !applies_to_g1 && !applies_to_g2 {
                continue; // Skip constraint that doesn't apply to either group
            }

            let old_penalty_g1 = if applies_to_g1 {
                self.calculate_group_attribute_penalty_for_members(g1_members, ac)
            } else {
                0.0
            };
            let old_penalty_g2 = if applies_to_g2 {
                self.calculate_group_attribute_penalty_for_members(g2_members, ac)
            } else {
                0.0
            };

            // Use the UPDATED schedule to get the new group members
            let new_g1_members = &self.schedule[day][g1_idx];
            let new_g2_members = &self.schedule[day][g2_idx];

            let new_penalty_g1 = if applies_to_g1 {
                self.calculate_group_attribute_penalty_for_members(new_g1_members, ac)
            } else {
                0.0
            };
            let new_penalty_g2 = if applies_to_g2 {
                self.calculate_group_attribute_penalty_for_members(new_g2_members, ac)
            } else {
                0.0
            };

            let delta_penalty =
                (new_penalty_g1 + new_penalty_g2) - (old_penalty_g1 + old_penalty_g2);

            if std::env::var("DEBUG_ATTR_BALANCE").is_ok() && delta_penalty.abs() > 0.001 {
                println!(
                        "DEBUG: apply_swap - specific constraint '{}' on group '{}' (applies_to_g1={}, applies_to_g2={}):",
                        ac.attribute_key, ac.group_id, applies_to_g1, applies_to_g2
                    );
                println!(
                    "  old_penalty_g1: {}, old_penalty_g2: {}",
                    old_penalty_g1, old_penalty_g2
                );
                println!(
                    "  new_penalty_g1: {}, new_penalty_g2: {}",
                    new_penalty_g1, new_penalty_g2
                );
                println!("  delta_penalty: {}", delta_penalty);
                println!("  g1_id: {}, g2_id: {}", g1_id, g2_id);
            }

            self.attribute_balance_penalty += delta_penalty;
        }

        if std::env::var("DEBUG_ATTR_BALANCE").is_ok() {
            println!(
                "DEBUG: apply_swap - after attribute balance update: {}",
                self.attribute_balance_penalty
            );
        }

        // === UPDATE CONSTRAINT PENALTIES (THIS WAS MISSING!) ===

        // Update forbidden pair violations
        for (pair_idx, &(person_a, person_b)) in self.forbidden_pairs.iter().enumerate() {
            // Check if this forbidden pair applies to this session
            if let Some(ref sessions) = self.forbidden_pair_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue; // Skip this constraint for this session
                }
            }

            // Check if both people are participating in this session
            if !self.person_participation[person_a][day]
                || !self.person_participation[person_b][day]
            {
                continue; // Skip if either person is not participating
            }

            // Check if this swap affects this forbidden pair
            if (person_a == p1_idx || person_a == p2_idx)
                || (person_b == p1_idx || person_b == p2_idx)
            {
                // Check if they were together before the swap (use original group assignments)
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

                // Check if they are together after the swap (use new group assignments)
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

                // Update the violation count
                if were_together_before && !are_together_after {
                    // They were together before but not after - violation removed
                    self.forbidden_pair_violations[pair_idx] -= 1;
                } else if !were_together_before && are_together_after {
                    // They were not together before but are after - violation added
                    self.forbidden_pair_violations[pair_idx] += 1;
                }
            }
        }

        // Update should-together violations
        for (pair_idx, &(person_a, person_b)) in self.should_together_pairs.iter().enumerate() {
            // Check if this should-together pair applies to this session
            if let Some(ref sessions) = self.should_together_sessions[pair_idx] {
                if !sessions.contains(&day) {
                    continue;
                }
            }
            // Only count when both participate
            if !self.person_participation[person_a][day]
                || !self.person_participation[person_b][day]
            {
                continue;
            }
            // Only if one endpoint moved
            if person_a != p1_idx && person_a != p2_idx && person_b != p1_idx && person_b != p2_idx
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
        for (cidx, &(a, b)) in self.pairmin_pairs.iter().enumerate() {
            if !self.pairmin_sessions[cidx].contains(&day) {
                continue;
            }
            if !self.person_participation[a][day] || !self.person_participation[b][day] {
                continue;
            }
            // Check if either endpoint moved
            if a != p1_idx && a != p2_idx && b != p1_idx && b != p2_idx {
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
    }
}
