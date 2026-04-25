use std::collections::HashMap;
use std::fs;
use std::time::Instant;

use gm_core::models::{
    ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
    Solver3ConstructionMode, Solver3Params, SolverConfiguration, SolverKind, SolverParams,
    StopConditions,
};
use gm_core::run_solver;

const SAILING_REAL_RAW: &str = "backend/benchmarking/cases/stretch/sailing_trip_demo_real.json";
const PARTIAL_ATTENDANCE_152P: &str =
    "backend/benchmarking/cases/stretch/synthetic_partial_attendance_capacity_pressure_152p.json";

#[derive(Debug, Clone, Copy)]
struct Lane {
    label: &'static str,
    mode: Solver3ConstructionMode,
    gamma: f64,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let lanes = [
        Lane {
            label: "baseline_legacy",
            mode: Solver3ConstructionMode::BaselineLegacy,
            gamma: 0.0,
        },
        Lane {
            label: "freedom_aware_gamma0",
            mode: Solver3ConstructionMode::FreedomAwareRandomized,
            gamma: 0.0,
        },
        Lane {
            label: "constraint_scenario_oracle",
            mode: Solver3ConstructionMode::ConstraintScenarioOracleGuided,
            gamma: 0.0,
        },
    ];

    let cases = vec![
        ("sailing_trip_real_raw", load_case_input(SAILING_REAL_RAW)?),
        (
            "synthetic_partial_attendance_80p_10g_8s",
            synthetic_partial_attendance_case(80, 10, 8, 8),
        ),
        (
            "synthetic_partial_attendance_capacity_pressure_152p",
            load_case_input(PARTIAL_ATTENDANCE_152P)?,
        ),
        ("pure_sgp_8_4_10", pure_sgp_case(8, 4, 10)),
        ("pure_sgp_8_4_5", pure_sgp_case(8, 4, 5)),
    ];

    println!("case,lane,status,people,groups,sessions,score,repeats,weighted_repeat,constraint_penalty,unique,stop_reason,elapsed_ms,error");
    for (case_label, base_input) in cases {
        let people = base_input.problem.people.len();
        let groups = base_input.problem.groups.len();
        let sessions = base_input.problem.num_sessions;
        for lane in lanes {
            let mut input = base_input.clone();
            configure_solver3(&mut input, lane.mode, lane.gamma);
            let started = Instant::now();
            match run_solver(&input) {
                Ok(result) => println!(
                    "{},{},ok,{},{},{},{:.3},{},{:.3},{},{},{:?},{},",
                    case_label,
                    lane.label,
                    people,
                    groups,
                    sessions,
                    result.final_score,
                    result.repetition_penalty,
                    result.weighted_repetition_penalty,
                    result.constraint_penalty,
                    result.unique_contacts,
                    result.stop_reason,
                    started.elapsed().as_millis()
                ),
                Err(error) => println!(
                    "{},{},error,{},{},{},,,,,,,{},{}",
                    case_label,
                    lane.label,
                    people,
                    groups,
                    sessions,
                    started.elapsed().as_millis(),
                    error.to_string().replace(',', ";")
                ),
            }
        }
    }

    Ok(())
}

fn load_case_input(path: &str) -> Result<ApiInput, Box<dyn std::error::Error>> {
    let text = fs::read_to_string(path)?;
    let value: serde_json::Value = serde_json::from_str(&text)?;
    Ok(serde_json::from_value(value["input"].clone())?)
}

fn configure_solver3(input: &mut ApiInput, mode: Solver3ConstructionMode, gamma: f64) {
    let mut params = Solver3Params::default();
    params.construction.mode = mode;
    params.construction.freedom_aware.gamma = gamma;

    input.initial_schedule = None;
    input.solver = SolverConfiguration {
        solver_type: SolverKind::Solver3.canonical_id().into(),
        stop_conditions: StopConditions {
            max_iterations: Some(0),
            time_limit_seconds: Some(1),
            no_improvement_iterations: None,
            stop_on_optimal_score: false,
        },
        solver_params: SolverParams::Solver3(params),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: Some(42),
        move_policy: None,
        allowed_sessions: None,
    };
}

fn pure_sgp_case(num_groups: usize, group_size: usize, num_sessions: usize) -> ApiInput {
    let num_people = num_groups * group_size;
    ApiInput {
        problem: ProblemDefinition {
            people: (0..num_people)
                .map(|idx| Person {
                    id: format!("p{idx}"),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
            groups: (0..num_groups)
                .map(|idx| Group {
                    id: format!("g{idx}"),
                    size: group_size as u32,
                    session_sizes: None,
                })
                .collect(),
            num_sessions: num_sessions as u32,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "squared".into(),
            penalty_weight: 1000.0,
        })],
        solver: solver3_placeholder(),
    }
}

fn synthetic_partial_attendance_case(
    num_people: usize,
    num_groups: usize,
    group_size: usize,
    num_sessions: usize,
) -> ApiInput {
    let people = (0..num_people)
        .map(|idx| {
            let sessions = if idx % 5 == 0 {
                Some(
                    (0..num_sessions as u32)
                        .filter(|&session| session as usize != idx % num_sessions)
                        .filter(|&session| session as usize != (idx + 3) % num_sessions)
                        .collect(),
                )
            } else {
                None
            };
            Person {
                id: format!("p{idx}"),
                attributes: HashMap::new(),
                sessions,
            }
        })
        .collect();

    ApiInput {
        problem: ProblemDefinition {
            people,
            groups: (0..num_groups)
                .map(|idx| Group {
                    id: format!("g{idx}"),
                    size: group_size as u32,
                    session_sizes: None,
                })
                .collect(),
            num_sessions: num_sessions as u32,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "squared".into(),
            penalty_weight: 100.0,
        })],
        solver: solver3_placeholder(),
    }
}

fn solver3_placeholder() -> SolverConfiguration {
    SolverConfiguration {
        solver_type: SolverKind::Solver3.canonical_id().into(),
        stop_conditions: StopConditions {
            max_iterations: Some(0),
            time_limit_seconds: Some(1),
            no_improvement_iterations: None,
            stop_on_optimal_score: false,
        },
        solver_params: SolverParams::Solver3(Solver3Params::default()),
        logging: Default::default(),
        telemetry: Default::default(),
        seed: Some(42),
        move_policy: None,
        allowed_sessions: None,
    }
}
