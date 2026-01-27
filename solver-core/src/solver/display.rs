//! Display and formatting methods for the solver state.
//!
//! This module contains methods for formatting solver state information
//! for debugging, logging, and user output.

use super::State;

impl State {
    /// Formats a detailed breakdown of the current solution's scoring components.
    ///
    /// This method generates a human-readable string that shows how the current
    /// solution performs across all optimization criteria. It's invaluable for
    /// debugging constraint issues, understanding solution quality, and tuning
    /// algorithm parameters.
    ///
    /// # Returns
    ///
    /// A formatted string containing:
    /// - **Overall cost** and its components
    /// - **Unique contacts** achieved vs. theoretical maximum
    /// - **Repetition penalties** with breakdown by penalty level
    /// - **Attribute balance** penalties for each constraint
    /// - **Constraint violations** with detailed counts per constraint type
    /// - **Weights** used for each component
    ///
    /// # Output Format
    ///
    /// The output follows this structure:
    /// ```text
    /// === SCORE BREAKDOWN ===
    /// Total Cost: 85.50
    ///   Unique Contacts: 45 (Weight: 1.0, Contribution: -45.0)
    ///   Repetition Penalty: 12 (Weight: 100.0, Contribution: 1200.0)
    ///   Attribute Balance Penalty: 8.50 (Contribution: 8.50)
    ///   Constraint Penalty: 2 (Contribution: 2000.0)
    ///
    /// CONSTRAINT VIOLATIONS:
    ///   Clique 0 (['Alice', 'Bob']): 1 violations (Weight: 1000.0)
    ///   Forbidden Pair 0 ('Charlie' - 'Diana'): 0 violations (Weight: 500.0)
    ///   Immovable Person Violations: 1
    ///
    /// REPETITION BREAKDOWN:
    ///   0 encounters: 78 pairs
    ///   1 encounter: 45 pairs
    ///   2 encounters: 12 pairs (penalty: 12)
    ///   3+ encounters: 0 pairs
    /// ```
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
    /// # let state = State::new(&input)?;
    /// // Get detailed scoring information
    /// let breakdown = state.format_score_breakdown();
    /// println!("{}", breakdown);
    ///
    /// // Use for debugging constraint issues
    /// if state.constraint_penalty > 0 {
    ///     println!("Constraint violations detected:");
    ///     println!("{}", breakdown);
    /// }
    ///
    /// // Compare different solutions
    /// let score_before = state.format_score_breakdown();
    /// // ... apply some moves ...
    /// let score_after = state.format_score_breakdown();
    /// println!("Before:\n{}\nAfter:\n{}", score_before, score_after);
    /// # Ok::<(), solver_core::solver::SolverError>(())
    /// ```
    ///
    /// # Use Cases
    ///
    /// ## Debugging Constraints
    /// When solutions have high constraint penalties, this method helps identify:
    /// - Which specific constraints are being violated
    /// - How many violations exist for each constraint type
    /// - Whether constraint weights are properly balanced
    ///
    /// ## Parameter Tuning
    /// The breakdown helps adjust algorithm parameters:
    /// - If repetition penalties dominate, reduce repetition weights
    /// - If few unique contacts are achieved, increase contact weights
    /// - If constraint violations persist, increase constraint weights
    ///
    /// ## Solution Analysis
    /// Compare solutions to understand optimization progress:
    /// - Track how scores change during optimization
    /// - Identify which components improve/worsen over time
    /// - Understand trade-offs between different objectives
    ///
    /// # Performance Notes
    ///
    /// This method performs some computation to generate the breakdown:
    /// - **O(people²)** to analyze contact patterns
    /// - **O(constraints)** to format constraint information
    /// - **String formatting** overhead for display
    ///
    /// It's intended for debugging and analysis, not for use in tight optimization loops.
    ///
    /// # Typical Usage in Algorithms
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
    /// #         stop_conditions: StopConditions {
    /// #             max_iterations: Some(1000), time_limit_seconds: None, no_improvement_iterations: None,
    /// #         },
    /// #         solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
    /// #             initial_temperature: 10.0, final_temperature: 0.1, cooling_schedule: "geometric".to_string(), reheat_after_no_improvement: Some(0), reheat_cycles: Some(0)
    /// #         }),
    /// #         logging: LoggingOptions { log_initial_score_breakdown: true, log_final_score_breakdown: true, ..Default::default() },
    /// #         telemetry: Default::default(),
    /// #         allowed_sessions: None,
    /// #     },
    /// # };
    /// # let mut state = State::new(&input)?;
    /// // Log initial state (controlled by logging configuration)
    /// if state.logging.log_initial_score_breakdown {
    ///     println!("Initial state:\n{}", state.format_score_breakdown());
    /// }
    ///
    /// // ... run optimization algorithm ...
    ///
    /// // Log final state
    /// if state.logging.log_final_score_breakdown {
    ///     println!("Final state:\n{}", state.format_score_breakdown());
    /// }
    /// # Ok::<(), solver_core::solver::SolverError>(())
    /// ```
    pub fn format_score_breakdown(&self) -> String {
        let mut breakdown = format!(
            "Score Breakdown:\n  UniqueContacts: {} (weight: {:.1})\n  RepetitionPenalty: {} (weight: {:.1})\n  AttributeBalancePenalty: {:.2}\n  BaselineScore: {:.2}",
            self.unique_contacts,
            self.w_contacts,
            self.repetition_penalty,
            self.w_repetition,
            self.attribute_balance_penalty,
            self.baseline_score
        );

        // Add individual constraint penalties
        let mut has_constraints = false;

        // Forbidden pair violations
        for (pair_idx, &violation_count) in self.forbidden_pair_violations.iter().enumerate() {
            if violation_count > 0 {
                let weight = self.forbidden_pair_weights[pair_idx];
                breakdown.push_str(&format!(
                    "\n  ShouldNotBeTogether[{}]: {} (weight: {:.1})",
                    pair_idx, violation_count, weight
                ));
                has_constraints = true;
            }
        }

        // Should stay together violations
        for (pair_idx, &violation_count) in self.should_together_violations.iter().enumerate() {
            if violation_count > 0 {
                let weight = self.should_together_weights[pair_idx];
                breakdown.push_str(&format!(
                    "\n  ShouldStayTogether[{}]: {} (weight: {:.1})",
                    pair_idx, violation_count, weight
                ));
                has_constraints = true;
            }
        }

        // Clique violations
        for (clique_idx, &violation_count) in self.clique_violations.iter().enumerate() {
            if violation_count > 0 {
                breakdown.push_str(&format!(
                    "\n  MustStayTogether[{}]: {} (hard)",
                    clique_idx, violation_count
                ));
                has_constraints = true;
            }
        }

        // Immovable person violations
        if self.immovable_violations > 0 {
            breakdown.push_str(&format!(
                "\n  ImmovablePerson: {} (weight: 1000.0)",
                self.immovable_violations
            ));
            has_constraints = true;
        }

        // If no constraint violations, show that constraints are satisfied
        if !has_constraints {
            breakdown.push_str("\n  Constraints: All satisfied");
        }

        breakdown.push_str(&format!("\n  Total: {:.2}", self.current_cost));
        breakdown
    }
}
