use solver_core::models::*;
use solver_core::solver::State;
use std::collections::HashMap;

fn main() {
    println!("=== Late Arrivals & Early Departures Demo ===\n");

    // Create a problem with people who have different participation patterns
    let input = ApiInput {
        initial_schedule: None,
        problem: ProblemDefinition {
            people: vec![
                // Core team - participates in all sessions
                Person {
                    id: "Alice".to_string(),
                    attributes: HashMap::new(),
                    sessions: None, // Participates in all sessions (default)
                },
                Person {
                    id: "Bob".to_string(),
                    attributes: HashMap::new(),
                    sessions: None, // Participates in all sessions (default)
                },
                Person {
                    id: "Charlie".to_string(),
                    attributes: HashMap::new(),
                    sessions: None, // Participates in all sessions (default)
                },
                Person {
                    id: "Diana".to_string(),
                    attributes: HashMap::new(),
                    sessions: None, // Participates in all sessions (default)
                },
                // Late arrival - joins from session 1
                Person {
                    id: "Eve".to_string(),
                    attributes: HashMap::new(),
                    sessions: Some(vec![1, 2]), // Only participates in sessions 1 and 2
                },
                // Early departure - leaves after session 1
                Person {
                    id: "Frank".to_string(),
                    attributes: HashMap::new(),
                    sessions: Some(vec![0, 1]), // Only participates in sessions 0 and 1
                },
                // Brief appearance - only in session 1
                Person {
                    id: "Grace".to_string(),
                    attributes: HashMap::new(),
                    sessions: Some(vec![1]), // Only participates in session 1
                },
                // Another core member
                Person {
                    id: "Henry".to_string(),
                    attributes: HashMap::new(),
                    sessions: None, // Participates in all sessions (default)
                },
            ],
            groups: vec![
                Group {
                    id: "Team1".to_string(),
                    size: 4,
                },
                Group {
                    id: "Team2".to_string(),
                    size: 4,
                },
            ],
            num_sessions: 3,
        },
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".to_string(),
            weight: 1.0,
        }],
        constraints: vec![
            // Alice and Bob must work together when both are present
            Constraint::MustStayTogether {
                people: vec!["Alice".to_string(), "Bob".to_string()],
                sessions: None, // Apply when both are present
            },
        ],
        solver: SolverConfiguration {
            solver_type: "SimulatedAnnealing".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(100), // Short run for demo
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
            logging: LoggingOptions {
                display_final_schedule: true,
                log_final_score_breakdown: true,
                ..Default::default()
            },
            telemetry: Default::default(),
            allowed_sessions: None,
        },
    };

    println!("Problem setup:");
    println!("- 8 people with varying participation patterns");
    println!("- 2 teams of 4 people each");
    println!("- 3 sessions");
    println!("\nParticipation patterns:");
    println!("- Alice, Bob, Charlie, Diana, Henry: All sessions (0, 1, 2)");
    println!("- Eve (Late arrival): Sessions 1, 2 only");
    println!("- Frank (Early departure): Sessions 0, 1 only");
    println!("- Grace (Brief visit): Session 1 only");
    println!();

    match State::new(&input) {
        Ok(state) => {
            println!("✅ Initialization successful with participation tracking!");

            // Show participation matrix
            println!("\nParticipation Matrix:");
            println!("Person      | Session 0 | Session 1 | Session 2");
            println!("------------|-----------|-----------|----------");

            for (person_idx, person_id) in state.person_idx_to_id.iter().enumerate() {
                let session_0 = if state.person_participation[person_idx][0] {
                    "✓"
                } else {
                    "✗"
                };
                let session_1 = if state.person_participation[person_idx][1] {
                    "✓"
                } else {
                    "✗"
                };
                let session_2 = if state.person_participation[person_idx][2] {
                    "✓"
                } else {
                    "✗"
                };

                println!(
                    "{:<11} |     {}     |     {}     |     {}",
                    person_id, session_0, session_1, session_2
                );
            }

            println!("\n✅ Participation tracking is working correctly!");
            println!("The system now supports people who join late or leave early!");
        }
        Err(e) => {
            println!("❌ Error: {}", e);
        }
    }

    println!("\n=== Real-World Use Cases ===");
    println!("This feature enables scenarios like:");
    println!("• Conference attendees joining on different days");
    println!("• Training programs with rotating participants");
    println!("• Part-time team members with limited availability");
    println!("• Guest speakers appearing for specific sessions");
    println!("• Employees with flexible work schedules");
}
