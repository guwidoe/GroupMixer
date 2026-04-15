use gm_core::calculate_recommended_settings;
use gm_core::models::{Group, Person, ProblemDefinition, SolverParams};
use std::collections::HashMap;

#[test]
fn test_calculate_recommended_settings_initial_temp_above_one() {
    // Build a small but non-trivial problem that can generate cost differences.
    let num_people = 8u32;
    let mut people = Vec::new();
    for i in 0..num_people {
        people.push(Person {
            id: format!("P{}", i),
            attributes: HashMap::new(),
            sessions: None, // participates in all sessions
        });
    }

    // Two groups large enough to hold all people.
    let groups = vec![
        Group {
            id: "G1".into(),
            size: 4,
            session_sizes: None,
        },
        Group {
            id: "G2".into(),
            size: 4,
            session_sizes: None,
        },
    ];

    let problem = ProblemDefinition {
        people,
        groups,
        num_sessions: 3,
    };

    let cfg =
        calculate_recommended_settings(&problem, &[], &[], 1 /* desired runtime seconds */)
            .expect("calculate_recommended_settings should succeed");

    match cfg.solver_params {
        SolverParams::SimulatedAnnealing(sa) => {
            assert!(
                sa.initial_temperature.is_finite() && sa.initial_temperature > 0.0,
                "Expected a positive finite initial temperature, got {}",
                sa.initial_temperature
            );
            assert!(
                sa.initial_temperature > sa.final_temperature,
                "Expected initial temperature {} to stay above final temperature {}",
                sa.initial_temperature,
                sa.final_temperature
            );
        }
        SolverParams::Solver2(_) | SolverParams::Solver3(_) | SolverParams::Solver4(_) => {
            panic!("default recommended settings should still route through solver1")
        }
    }
}
