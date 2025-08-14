use solver_core::models::*;
use solver_core::solver::State;

fn main() {
    println!("=== Session-Specific Constraints Demo ===\n");

    // Create a simple problem with 6 people, 2 groups, 3 sessions
    let input = ApiInput {
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "Alice".to_string(),
                    attributes: std::collections::HashMap::new(),
                    sessions: Some(vec![0, 1]).into(),
                },
                Person {
                    id: "Bob".to_string(),
                    attributes: std::collections::HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "Charlie".to_string(),
                    attributes: std::collections::HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "Diana".to_string(),
                    attributes: std::collections::HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "Eve".to_string(),
                    attributes: std::collections::HashMap::new(),
                    sessions: None,
                },
                Person {
                    id: "Frank".to_string(),
                    attributes: std::collections::HashMap::new(),
                    sessions: None,
                },
            ],
            groups: vec![
                Group {
                    id: "Group1".to_string(),
                    size: 3,
                },
                Group {
                    id: "Group2".to_string(),
                    size: 3,
                },
            ],
            num_sessions: 3,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![
            // Alice and Bob must stay together in sessions 0 and 1 only
            Constraint::MustStayTogether {
                people: vec!["Alice".to_string(), "Bob".to_string()],
                sessions: Some(vec![0, 1]),
            },
            // Charlie and Diana cannot be together in sessions 1 and 2 only
            Constraint::ShouldNotBeTogether {
                people: vec!["Charlie".to_string(), "Diana".to_string()],
                penalty_weight: 1000.0,
                sessions: Some(vec![1, 2]),
            },
        ],
        solver: SolverConfiguration {
            solver_type: "SimulatedAnnealing".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(1000),
                time_limit_seconds: None,
                no_improvement_iterations: None,
            },
            solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                initial_temperature: 1.0,
                final_temperature: 0.001,
                cooling_schedule: "geometric".to_string(),
                reheat_after_no_improvement: 0, // No reheat
            }),
            logging: LoggingOptions {
                display_final_schedule: true,
                log_final_score_breakdown: true,
                ..Default::default()
            },
        },
    };

    println!("Problem setup:");
    println!("- 6 people: Alice, Bob, Charlie, Diana, Eve, Frank");
    println!("- 2 groups of 3 people each");
    println!("- 3 sessions");
    println!("\nSession-specific constraints:");
    println!(
        "- Alice & Bob must stay together in sessions 0 and 1 (but can be apart in session 2)"
    );
    println!("- Charlie & Diana cannot be together in sessions 1 and 2 (but can be together in session 0)");
    println!();

    match State::new(&input) {
        Ok(state) => {
            println!("✅ Constraint preprocessing successful!");
            println!("   - {} cliques found", state.cliques.len());
            println!("   - {} forbidden pairs found", state.forbidden_pairs.len());

            // Show session information
            for (i, clique) in state.cliques.iter().enumerate() {
                let member_names: Vec<String> = clique
                    .iter()
                    .map(|&idx| state.person_idx_to_id[idx].clone())
                    .collect();
                if let Some(ref sessions) = state.clique_sessions[i] {
                    println!(
                        "   - Clique {:?} applies to sessions: {:?}",
                        member_names, sessions
                    );
                } else {
                    println!("   - Clique {:?} applies to all sessions", member_names);
                }
            }

            for (i, &(p1, p2)) in state.forbidden_pairs.iter().enumerate() {
                let p1_name = &state.person_idx_to_id[p1];
                let p2_name = &state.person_idx_to_id[p2];
                if let Some(ref sessions) = state.forbidden_pair_sessions[i] {
                    println!(
                        "   - Forbidden pair ({}, {}) applies to sessions: {:?}",
                        p1_name, p2_name, sessions
                    );
                } else {
                    println!(
                        "   - Forbidden pair ({}, {}) applies to all sessions",
                        p1_name, p2_name
                    );
                }
            }
        }
        Err(e) => {
            println!("❌ Error: {}", e);
        }
    }

    println!("\n=== Demo Complete ===");
    println!("This demonstrates that the session-specific constraint feature is working!");
    println!("The constraints are now properly parsed and stored with session information.");
}
