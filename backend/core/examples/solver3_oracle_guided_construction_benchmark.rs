use std::collections::HashMap;
use std::time::Instant;

use gm_core::models::{
    ApiInput, AttributeBalanceMode, AttributeBalanceParams, Constraint, Group,
    ImmovablePersonParams, Objective, PairMeetingCountParams, PairMeetingMode, Person,
    ProblemDefinition, RepeatEncounterParams, Solver3ConstructionMode, Solver3Params,
    SolverConfiguration, SolverKind, SolverParams, StopConditions,
};
use gm_core::run_solver;

#[derive(Debug, Clone, Copy)]
struct Lane {
    label: &'static str,
    mode: Solver3ConstructionMode,
}

fn main() {
    let lanes = [
        Lane {
            label: "baseline_legacy",
            mode: Solver3ConstructionMode::BaselineLegacy,
        },
        Lane {
            label: "freedom_aware_randomized",
            mode: Solver3ConstructionMode::FreedomAwareRandomized,
        },
        Lane {
            label: "constraint_scenario_oracle_guided",
            mode: Solver3ConstructionMode::ConstraintScenarioOracleGuided,
        },
    ];

    println!("solver3 oracle-guided construction comparison (lower score is better)");
    println!("lane,initial_score,final_score,initial_repeats,final_repeats,initial_ms,final_ms");
    for lane in lanes {
        let initial = run_lane(lane, 0).expect("initial construction lane should run");
        let final_run = run_lane(lane, 300).expect("final search lane should run");
        println!(
            "{},{:.3},{:.3},{},{},{},{}",
            lane.label,
            initial.final_score,
            final_run.final_score,
            initial.repetition_penalty,
            final_run.repetition_penalty,
            initial.elapsed_ms,
            final_run.elapsed_ms
        );
    }
}

#[derive(Debug, Clone)]
struct LaneResult {
    final_score: f64,
    repetition_penalty: i32,
    elapsed_ms: u128,
}

fn run_lane(lane: Lane, max_iterations: u64) -> Result<LaneResult, Box<dyn std::error::Error>> {
    let input = benchmark_input(lane.mode, max_iterations);
    let started_at = Instant::now();
    let result = run_solver(&input)?;
    Ok(LaneResult {
        final_score: result.final_score,
        repetition_penalty: result.repetition_penalty,
        elapsed_ms: started_at.elapsed().as_millis(),
    })
}

fn benchmark_input(mode: Solver3ConstructionMode, max_iterations: u64) -> ApiInput {
    let mut people = Vec::new();
    for idx in 0..12 {
        let mut attributes = HashMap::new();
        attributes.insert(
            "role".to_string(),
            if idx % 2 == 0 { "red" } else { "blue" }.to_string(),
        );
        people.push(Person {
            id: format!("p{idx}"),
            attributes,
            sessions: None,
        });
    }

    let groups = (0..3)
        .map(|idx| Group {
            id: format!("g{idx}"),
            size: 4,
            session_sizes: None,
        })
        .collect::<Vec<_>>();

    let mut solver = SolverConfiguration {
        solver_type: SolverKind::Solver3.canonical_id().into(),
        stop_conditions: StopConditions {
            max_iterations: Some(max_iterations),
            time_limit_seconds: Some(2),
            no_improvement_iterations: Some(100),
            stop_on_optimal_score: false,
        },
        solver_params: SolverParams::Solver3(Solver3Params::default()),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: Some(12345),
        move_policy: None,
        allowed_sessions: None,
    };
    if let SolverParams::Solver3(params) = &mut solver.solver_params {
        params.construction.mode = mode;
        params.construction.freedom_aware.gamma = 0.0;
    }

    ApiInput {
        problem: ProblemDefinition {
            people,
            groups,
            num_sessions: 4,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![
            Constraint::RepeatEncounter(RepeatEncounterParams {
                max_allowed_encounters: 1,
                penalty_function: "squared".into(),
                penalty_weight: 10.0,
            }),
            Constraint::AttributeBalance(AttributeBalanceParams {
                group_id: "ALL".into(),
                attribute_key: "role".into(),
                desired_values: HashMap::from([("red".into(), 2), ("blue".into(), 2)]),
                penalty_weight: 2.0,
                mode: AttributeBalanceMode::Exact,
                sessions: None,
            }),
            Constraint::ImmovablePerson(ImmovablePersonParams {
                person_id: "p0".into(),
                group_id: "g0".into(),
                sessions: Some(vec![0]),
            }),
            Constraint::MustStayTogether {
                people: vec!["p1".into(), "p2".into()],
                sessions: Some(vec![1]),
            },
            Constraint::ShouldNotBeTogether {
                people: vec!["p3".into(), "p4".into()],
                penalty_weight: 4.0,
                sessions: Some(vec![0, 1, 2, 3]),
            },
            Constraint::PairMeetingCount(PairMeetingCountParams {
                people: vec!["p5".into(), "p6".into()],
                sessions: vec![2, 3],
                target_meetings: 1,
                mode: PairMeetingMode::Exact,
                penalty_weight: 3.0,
            }),
        ],
        solver,
    }
}
