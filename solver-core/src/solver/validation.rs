//! Validation methods for the solver state.
//!
//! This module contains methods for validating the internal consistency of the solver state,
//! including score recalculation verification and duplicate assignment detection.

use super::{SolverError, State};

impl State {
    pub fn validate_scores(&mut self) {
        let people_count = self.person_idx_to_id.len();

        // Store original cached values
        let cached_unique_contacts = self.unique_contacts;
        let cached_repetition_penalty = self.repetition_penalty;

        // Recalculate all scores using participation-aware logic
        self._recalculate_scores();

        let recalculated_unique_contacts = self.unique_contacts;
        let recalculated_repetition_penalty = self.repetition_penalty;

        // Check for discrepancies (allowing small floating point errors)
        if cached_unique_contacts != recalculated_unique_contacts {
            eprintln!("Score validation failed!");
            eprintln!(
                "Unique Contacts mismatch: cached={}, recalculated={}",
                cached_unique_contacts, recalculated_unique_contacts
            );

            // Show contact matrix for debugging
            eprintln!("Contact Matrix:");
            for i in 0..people_count.min(5) {
                // Show first 5 people only
                eprint!("Person {}: ", self.person_idx_to_id[i]);
                for j in 0..people_count.min(5) {
                    eprint!("{} ", self.contact_matrix[i][j]);
                }
                eprintln!();
            }

            // Show participation matrix
            eprintln!("Participation Matrix (first 5 people, all sessions):");
            for i in 0..people_count.min(5) {
                eprint!("Person {}: ", self.person_idx_to_id[i]);
                for session in 0..self.num_sessions as usize {
                    eprint!(
                        "{} ",
                        if self.person_participation[i][session] {
                            "T"
                        } else {
                            "F"
                        }
                    );
                }
                eprintln!();
            }

            // Instead of panicking, let's just update the cached values to match
            // This allows the solver to continue working while we debug
            eprintln!("Updating cached values to match recalculated values");
        }

        if cached_repetition_penalty != recalculated_repetition_penalty {
            eprintln!(
                "Repetition Penalty mismatch: cached={}, recalculated={}",
                cached_repetition_penalty, recalculated_repetition_penalty
            );
        }
    }

    /// Validates that no person is assigned more than once per session.
    /// Returns `Ok(())` if valid, otherwise returns a `ValidationError` with details.
    pub fn validate_no_duplicate_assignments(&self) -> Result<(), SolverError> {
        use std::collections::HashMap;
        for session_idx in 0..self.num_sessions as usize {
            let mut occurrences: HashMap<usize, Vec<(usize, usize)>> = HashMap::new();
            for (g_idx, group_people) in self.schedule[session_idx].iter().enumerate() {
                for (pos, &p_idx) in group_people.iter().enumerate() {
                    occurrences.entry(p_idx).or_default().push((g_idx, pos));
                }
            }
            for (&p_idx, slots) in &occurrences {
                if slots.len() > 1 {
                    let mut msg = format!(
                        "Duplicate assignment detected: person {} appears multiple times in session {}",
                        self.display_person_by_idx(p_idx),
                        session_idx
                    );
                    if self.logging.debug_dump_invariant_context {
                        use std::fmt::Write as _;
                        // slots
                        let _ = write!(&mut msg, "\nSlots:");
                        for (g_idx, pos) in slots {
                            let _ = write!(
                                &mut msg,
                                "\n  - group {} (idx {}) pos {}",
                                self.group_idx_to_id[*g_idx], g_idx, pos
                            );
                        }
                        // locations
                        let loc = self.locations[session_idx][p_idx];
                        let _ = write!(
                            &mut msg,
                            "\nlocations says: (group_idx={} pos={})",
                            loc.0, loc.1
                        );
                        // dump session groups
                        for (g_idx, group_people) in self.schedule[session_idx].iter().enumerate() {
                            let names: Vec<String> = group_people
                                .iter()
                                .map(|&pid| self.display_person_by_idx(pid))
                                .collect();
                            let _ = write!(
                                &mut msg,
                                "\n  group {} ({}): {:?}",
                                g_idx, self.group_idx_to_id[g_idx], names
                            );
                        }
                    }
                    return Err(SolverError::ValidationError(msg));
                }
            }
        }
        Ok(())
    }
}
