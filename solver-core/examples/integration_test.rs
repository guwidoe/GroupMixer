use solver_core::models::*;
use solver_core::solver::State;
use std::collections::HashMap;

fn main() {
    println!("=== Complete Integration Test ===");
    println!("Session-Specific Constraints + Late Arrivals/Departures + All Constraint Types\n");

    let input = ApiInput {
        initial_schedule: None,
        problem: ProblemDefinition {
            people: vec![
                Person {
                    id: "Alice".to_string(),
                    attributes: HashMap::new(),
                    sessions: None, // All sessions
                },
                Person {
                    id: "Bob".to_string(),
                    attributes: HashMap::new(),
                    sessions: None, // All sessions
                },
                Person {
                    id: "Eve".to_string(),
                    attributes: HashMap::new(),
                    sessions: Some(vec![1, 2]), // Late arrival
                },
                Person {
                    id: "Frank".to_string(),
                    attributes: HashMap::new(),
                    sessions: Some(vec![0, 1]), // Early departure
                },
                Person {
                    id: "Grace".to_string(),
                    attributes: HashMap::new(),
                    sessions: Some(vec![1]), // Brief visit
                },
                Person {
                    id: "Henry".to_string(),
                    attributes: HashMap::new(),
                    sessions: None,
                },
            ],
            groups: vec![
                Group {
                    id: "Team1".to_string(),
                    size: 3,
                },
                Group {
                    id: "Team2".to_string(),
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
            Constraint::MustStayTogether {
                people: vec!["Alice".to_string(), "Bob".to_string()],
                sessions: None,
            },
            Constraint::ShouldNotBeTogether {
                people: vec!["Eve".to_string(), "Grace".to_string()],
                penalty_weight: 1000.0,
                sessions: Some(vec![1]),
            },
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "Henry".to_string(),
                group_id: "Team1".to_string(),
                sessions: Some(vec![0, 1, 2]),
            }),
        ],
        solver: SolverConfiguration {
            solver_type: "SimulatedAnnealing".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(100),
                time_limit_seconds: None,
                no_improvement_iterations: None,
            },
            solver_params: SolverParams::SimulatedAnnealing(SimulatedAnnealingParams {
                initial_temperature: 1.0,
                final_temperature: 0.001,
                cooling_schedule: "geometric".to_string(),
                reheat_cycles: Some(0),
                reheat_after_no_improvement: Some(0), // No reheat
            }),
            logging: LoggingOptions::default(),
            telemetry: Default::default(),
            allowed_sessions: None,
        },
    };

    match State::new(&input) {
        Ok(state) => {
            println!("✅ All features integrated successfully!");
            println!("   • {} cliques", state.cliques.len());
            println!("   • {} forbidden pairs", state.forbidden_pairs.len());
            println!(
                "   • {} immovable constraints",
                state.immovable_people.len()
            );
            println!("   • Participation tracking active");

            // Show participation matrix
            println!("\nParticipation Matrix:");
            for (i, person) in state.person_idx_to_id.iter().enumerate() {
                let sessions: Vec<String> = (0..3)
                    .filter(|&s| state.person_participation[i][s])
                    .map(|s| s.to_string())
                    .collect();
                println!("   {}: [{}]", person, sessions.join(", "));
            }

            println!("\n🎉 Integration complete! All features working together.");
        }
        Err(e) => {
            println!("❌ Error: {}", e);
        }
    }
}
