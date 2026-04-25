use std::cmp::Reverse;
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::time::Instant;

use gm_core::models::{
    ApiInput, ApiSchedule, Constraint, Group, Objective, Person, ProblemDefinition,
    RepeatEncounterParams, Solver3ConstructionMode, Solver3Params, Solver6PairRepeatPenaltyModel,
    Solver6Params, Solver6SearchStrategy, Solver6SeedStrategy, SolverConfiguration, SolverKind,
    SolverParams, StopConditions,
};
use gm_core::run_solver;
use gm_core::solver3::RuntimeState;

const DEFAULT_INPUT_PATH: &str = "backend/benchmarking/cases/stretch/sailing_trip_demo_real.json";
const DEFAULT_TOP_ESTIMATES: usize = 32;
const DEFAULT_EVAL_CANDIDATES: usize = 8;
const ORACLE_SEED: u64 = 0x5eed_6027;

#[derive(Debug, Clone)]
struct TemplateCandidate {
    sessions: Vec<usize>,
    selected_groups: Vec<usize>,
    num_groups: usize,
    group_size: usize,
    seat_count: usize,
    contact_edges: usize,
    dummy_slots: usize,
    omitted_people_slots: usize,
    omitted_group_capacity: usize,
    unused_selected_capacity: usize,
    estimate: f64,
}

#[derive(Debug, Clone)]
struct EvaluatedCandidate {
    candidate: TemplateCandidate,
    solver6_ms: u128,
    projection_ms: u128,
    score_ms: u128,
    total_ms: u128,
    final_score: f64,
    repeats: i32,
    unique_contacts: u32,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = env::args().collect::<Vec<_>>();
    let input_path = args
        .get(1)
        .map(String::as_str)
        .unwrap_or(DEFAULT_INPUT_PATH);
    let top_estimates = args
        .get(2)
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(DEFAULT_TOP_ESTIMATES);
    let eval_candidates = args
        .get(3)
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(DEFAULT_EVAL_CANDIDATES);

    let input = load_input(input_path)?;
    let num_sessions = input.problem.num_sessions as usize;
    let participants = participants_by_session(&input);
    println!("solver3 oracle projection probe");
    println!("input={input_path}");
    println!(
        "people={} groups={} sessions={} participants_by_session={participants:?}",
        input.problem.people.len(),
        input.problem.groups.len(),
        num_sessions
    );

    let mut candidates = generate_candidates(&input);
    candidates.sort_by(|left, right| {
        right
            .estimate
            .partial_cmp(&left.estimate)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.sessions.len().cmp(&left.sessions.len()))
            .then_with(|| right.seat_count.cmp(&left.seat_count))
            .then_with(|| right.num_groups.cmp(&left.num_groups))
            .then_with(|| right.group_size.cmp(&left.group_size))
            .then_with(|| left.sessions.cmp(&right.sessions))
    });
    dedupe_candidates(&mut candidates);

    println!("\nTop estimated templates (before solver6/projection):");
    println!("rank,sessions,g,q,p,contact_edges,dummy_slots,omitted_people_slots,omitted_group_capacity,unused_selected_capacity,estimate,groups");
    for (rank, candidate) in candidates.iter().take(top_estimates).enumerate() {
        println!(
            "{},{:?},{},{},{},{},{},{},{},{},{:.3},{}",
            rank + 1,
            candidate.sessions,
            candidate.num_groups,
            candidate.group_size,
            candidate.seat_count,
            candidate.contact_edges,
            candidate.dummy_slots,
            candidate.omitted_people_slots,
            candidate.omitted_group_capacity,
            candidate.unused_selected_capacity,
            candidate.estimate,
            group_labels(&input, &candidate.selected_groups).join("|")
        );
    }

    let scaffold_started = Instant::now();
    let (scaffold, scaffold_score, scaffold_repeats, scaffold_unique) = build_scaffold(&input)?;
    let scaffold_ms = scaffold_started.elapsed().as_millis();
    println!(
        "\nscaffold: score={scaffold_score:.3} repeats={scaffold_repeats} unique={scaffold_unique} ms={scaffold_ms}"
    );

    println!("\nEvaluated templates:");
    println!("rank,sessions,g,q,p,estimate,solver6_ms,projection_ms,score_ms,total_ms,score,repeats,unique,dummy_slots,omitted_people_slots,omitted_group_capacity,status");
    let mut evaluated = Vec::new();
    for (rank, candidate) in candidates.iter().take(eval_candidates).enumerate() {
        let started = Instant::now();
        match evaluate_candidate(&input, &scaffold, candidate) {
            Ok(mut result) => {
                result.total_ms = started.elapsed().as_millis();
                println!(
                    "{},{:?},{},{},{},{:.3},{},{},{},{},{:.3},{},{},{},{},{},ok",
                    rank + 1,
                    result.candidate.sessions,
                    result.candidate.num_groups,
                    result.candidate.group_size,
                    result.candidate.seat_count,
                    result.candidate.estimate,
                    result.solver6_ms,
                    result.projection_ms,
                    result.score_ms,
                    result.total_ms,
                    result.final_score,
                    result.repeats,
                    result.unique_contacts,
                    result.candidate.dummy_slots,
                    result.candidate.omitted_people_slots,
                    result.candidate.omitted_group_capacity,
                );
                evaluated.push(result);
            }
            Err(error) => {
                println!(
                    "{},{:?},{},{},{},{:.3},,,,,,,,,,,error:{}",
                    rank + 1,
                    candidate.sessions,
                    candidate.num_groups,
                    candidate.group_size,
                    candidate.seat_count,
                    candidate.estimate,
                    error.to_string().replace(',', ";")
                );
            }
        }
    }

    if let Some(best) = evaluated.iter().min_by(|left, right| {
        left.final_score
            .partial_cmp(&right.final_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    }) {
        println!(
            "\nbest_evaluated: sessions={:?} g={} q={} p={} score={:.3} repeats={} unique={} total_ms={}",
            best.candidate.sessions,
            best.candidate.num_groups,
            best.candidate.group_size,
            best.candidate.seat_count,
            best.final_score,
            best.repeats,
            best.unique_contacts,
            best.total_ms
        );
    }

    Ok(())
}

fn load_input(path: &str) -> Result<ApiInput, Box<dyn std::error::Error>> {
    let text = fs::read_to_string(path)?;
    let value: serde_json::Value = serde_json::from_str(&text)?;
    if let Some(input) = value.get("input") {
        Ok(serde_json::from_value(input.clone())?)
    } else {
        Ok(serde_json::from_value(value)?)
    }
}

fn generate_candidates(input: &ApiInput) -> Vec<TemplateCandidate> {
    let num_sessions = input.problem.num_sessions as usize;
    let mut candidates = Vec::new();
    for start_session in 0..num_sessions {
        for end_session in (start_session + 2)..=num_sessions {
            let sessions = (start_session..end_session).collect::<Vec<_>>();
            for num_groups in 2..=input.problem.groups.len() {
                let selected_groups = select_groups_by_capacity(input, &sessions, num_groups);
                let Some(max_group_size) =
                    min_capacity_for_groups(input, &sessions, &selected_groups)
                else {
                    continue;
                };
                for group_size in 2..=max_group_size {
                    candidates.push(score_candidate(
                        input,
                        sessions.clone(),
                        selected_groups.clone(),
                        group_size,
                    ));
                }
            }
        }
    }
    candidates
}

fn select_groups_by_capacity(
    input: &ApiInput,
    sessions: &[usize],
    num_groups: usize,
) -> Vec<usize> {
    let mut groups = (0..input.problem.groups.len()).collect::<Vec<_>>();
    groups.sort_by_key(|&group_idx| {
        let min_capacity = sessions
            .iter()
            .map(|&session_idx| group_capacity(&input.problem.groups[group_idx], session_idx))
            .min()
            .unwrap_or(0);
        let capacity_sum = sessions
            .iter()
            .map(|&session_idx| group_capacity(&input.problem.groups[group_idx], session_idx))
            .sum::<usize>();
        (Reverse(min_capacity), Reverse(capacity_sum), group_idx)
    });
    groups.truncate(num_groups);
    groups.sort_unstable();
    groups
}

fn min_capacity_for_groups(
    input: &ApiInput,
    sessions: &[usize],
    groups: &[usize],
) -> Option<usize> {
    groups
        .iter()
        .flat_map(|&group_idx| {
            sessions.iter().map(move |&session_idx| {
                group_capacity(&input.problem.groups[group_idx], session_idx)
            })
        })
        .min()
        .filter(|&capacity| capacity >= 2)
}

fn score_candidate(
    input: &ApiInput,
    sessions: Vec<usize>,
    selected_groups: Vec<usize>,
    group_size: usize,
) -> TemplateCandidate {
    let num_groups = selected_groups.len();
    let seat_count = num_groups * group_size;
    let contact_edges = sessions.len() * num_groups * binomial2(group_size);
    let mut dummy_slots = 0usize;
    let mut omitted_people_slots = 0usize;
    let mut omitted_group_capacity = 0usize;
    let mut unused_selected_capacity = 0usize;
    let selected_group_set = selected_groups.iter().copied().collect::<HashSet<_>>();

    for &session_idx in &sessions {
        let participants = input
            .problem
            .people
            .iter()
            .filter(|person| participates(person, session_idx))
            .count();
        dummy_slots += seat_count.saturating_sub(participants);
        omitted_people_slots += participants.saturating_sub(seat_count);

        for (group_idx, group) in input.problem.groups.iter().enumerate() {
            let capacity = group_capacity(group, session_idx);
            if selected_group_set.contains(&group_idx) {
                unused_selected_capacity += capacity.saturating_sub(group_size);
            } else {
                omitted_group_capacity += capacity;
            }
        }
    }

    let estimate = contact_edges as f64
        - 30.0 * omitted_people_slots as f64
        - 4.0 * omitted_group_capacity as f64
        - 1.0 * dummy_slots as f64
        - 0.5 * unused_selected_capacity as f64
        + 2.0 * sessions.len() as f64;

    TemplateCandidate {
        sessions,
        selected_groups,
        num_groups,
        group_size,
        seat_count,
        contact_edges,
        dummy_slots,
        omitted_people_slots,
        omitted_group_capacity,
        unused_selected_capacity,
        estimate,
    }
}

fn dedupe_candidates(candidates: &mut Vec<TemplateCandidate>) {
    let mut seen = HashSet::new();
    candidates.retain(|candidate| {
        seen.insert((
            candidate.sessions.clone(),
            candidate.selected_groups.clone(),
            candidate.group_size,
        ))
    });
}

fn build_scaffold(
    input: &ApiInput,
) -> Result<(ApiSchedule, f64, i32, u32), Box<dyn std::error::Error>> {
    let mut scaffold_input = input.clone();
    configure_solver3(&mut scaffold_input, Solver3ConstructionMode::BaselineLegacy);
    let result = run_solver(&scaffold_input)?;
    Ok((
        result.schedule,
        result.final_score,
        result.repetition_penalty,
        result.unique_contacts as u32,
    ))
}

fn evaluate_candidate(
    input: &ApiInput,
    scaffold: &ApiSchedule,
    candidate: &TemplateCandidate,
) -> Result<EvaluatedCandidate, Box<dyn std::error::Error>> {
    let solver6_started = Instant::now();
    let oracle_schedule = run_solver6_template(candidate)?;
    let solver6_ms = solver6_started.elapsed().as_millis();

    let projection_started = Instant::now();
    let projected = project_oracle_schedule(input, scaffold, candidate, &oracle_schedule)?;
    let projection_ms = projection_started.elapsed().as_millis();

    let score_started = Instant::now();
    let mut score_input = input.clone();
    configure_solver3(&mut score_input, Solver3ConstructionMode::BaselineLegacy);
    score_input.initial_schedule = Some(projected);
    let state = RuntimeState::from_input(&score_input)?;
    let score_ms = score_started.elapsed().as_millis();

    Ok(EvaluatedCandidate {
        candidate: candidate.clone(),
        solver6_ms,
        projection_ms,
        score_ms,
        total_ms: 0,
        final_score: state.total_score,
        repeats: state.repetition_penalty_raw,
        unique_contacts: state.unique_contacts,
    })
}

fn run_solver6_template(
    candidate: &TemplateCandidate,
) -> Result<Vec<Vec<Vec<usize>>>, Box<dyn std::error::Error>> {
    let input = solver6_input(candidate);
    let result = run_solver(&input)?;
    parse_oracle_schedule(candidate, &result.schedule)
}

fn solver6_input(candidate: &TemplateCandidate) -> ApiInput {
    ApiInput {
        problem: ProblemDefinition {
            people: (0..candidate.seat_count)
                .map(|idx| Person {
                    id: oracle_person_id(idx),
                    attributes: HashMap::new(),
                    sessions: None,
                })
                .collect(),
            groups: (0..candidate.num_groups)
                .map(|idx| Group {
                    id: oracle_group_id(idx),
                    size: candidate.group_size as u32,
                    session_sizes: None,
                })
                .collect(),
            num_sessions: candidate.sessions.len() as u32,
        },
        initial_schedule: None,
        construction_seed_schedule: None,
        objectives: vec![Objective {
            r#type: "maximize_unique_contacts".into(),
            weight: 1.0,
        }],
        constraints: vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "linear".into(),
            penalty_weight: 1.0,
        })],
        solver: SolverConfiguration {
            solver_type: SolverKind::Solver6.canonical_id().into(),
            stop_conditions: StopConditions {
                max_iterations: Some(500),
                time_limit_seconds: Some(1),
                no_improvement_iterations: Some(100),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver6(Solver6Params {
                exact_construction_handoff_enabled: true,
                seed_strategy: Solver6SeedStrategy::Solver5ExactBlockComposition,
                pair_repeat_penalty_model: Solver6PairRepeatPenaltyModel::LinearRepeatExcess,
                search_strategy: Solver6SearchStrategy::DeterministicBestImprovingHillClimb,
                cache: None,
                seed_time_limit_seconds: None,
                local_search_time_limit_seconds: None,
            }),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(ORACLE_SEED),
            move_policy: None,
            allowed_sessions: None,
        },
    }
}

fn parse_oracle_schedule(
    candidate: &TemplateCandidate,
    api_schedule: &ApiSchedule,
) -> Result<Vec<Vec<Vec<usize>>>, Box<dyn std::error::Error>> {
    let mut schedule = vec![vec![Vec::new(); candidate.num_groups]; candidate.sessions.len()];
    for (session_idx, groups) in schedule.iter_mut().enumerate() {
        let session_key = format!("session_{session_idx}");
        let api_groups = api_schedule
            .get(&session_key)
            .ok_or_else(|| format!("solver6 schedule missing {session_key}"))?;
        for (group_idx, members) in groups.iter_mut().enumerate() {
            let group_key = oracle_group_id(group_idx);
            let api_members = api_groups
                .get(&group_key)
                .ok_or_else(|| format!("solver6 schedule missing {session_key}/{group_key}"))?;
            for person_id in api_members {
                let Some(suffix) = person_id.strip_prefix("oracle_person_") else {
                    return Err(format!("unexpected oracle person id {person_id}").into());
                };
                members.push(suffix.parse::<usize>()?);
            }
        }
    }
    Ok(schedule)
}

fn project_oracle_schedule(
    input: &ApiInput,
    scaffold: &ApiSchedule,
    candidate: &TemplateCandidate,
    oracle_schedule: &[Vec<Vec<usize>>],
) -> Result<ApiSchedule, Box<dyn std::error::Error>> {
    let real_person_by_oracle_person = map_oracle_people(input, candidate);
    let selected_group_set = candidate
        .selected_groups
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let mut projected = scaffold.clone();

    for (session_pos, &real_session_idx) in candidate.sessions.iter().enumerate() {
        let session_key = format!("session_{real_session_idx}");
        let scaffold_session = scaffold
            .get(&session_key)
            .ok_or_else(|| format!("scaffold missing {session_key}"))?;
        let mut projected_session = scaffold_session.clone();
        let mut placed = HashSet::<String>::new();
        let anchored_people = hard_anchor_people(input, real_session_idx);

        for (group_idx, group) in input.problem.groups.iter().enumerate() {
            let members = projected_session.entry(group.id.clone()).or_default();
            if selected_group_set.contains(&group_idx) {
                members.retain(|person_id| {
                    anchored_people.contains(person_id)
                        && person_participates_by_id(input, person_id, real_session_idx)
                });
                for person_id in members.iter() {
                    placed.insert(person_id.clone());
                }
            } else {
                members.retain(|person_id| {
                    person_participates_by_id(input, person_id, real_session_idx)
                });
                for person_id in members.iter() {
                    placed.insert(person_id.clone());
                }
            }
        }

        let mut deferred = Vec::<usize>::new();
        for (oracle_group_idx, oracle_group) in oracle_schedule[session_pos].iter().enumerate() {
            let real_group_idx = candidate.selected_groups[oracle_group_idx];
            let real_group = &input.problem.groups[real_group_idx];
            let capacity = group_capacity(real_group, real_session_idx);
            let members = projected_session.entry(real_group.id.clone()).or_default();
            for &oracle_person_idx in oracle_group {
                let Some(real_person_idx) = real_person_by_oracle_person[oracle_person_idx] else {
                    continue;
                };
                let real_person = &input.problem.people[real_person_idx];
                if !participates(real_person, real_session_idx) || placed.contains(&real_person.id)
                {
                    continue;
                }
                if members.len() < capacity {
                    members.push(real_person.id.clone());
                    placed.insert(real_person.id.clone());
                } else {
                    deferred.push(real_person_idx);
                }
            }
        }

        let preferred_group = preferred_group_by_person(scaffold_session);
        for real_person_idx in deferred {
            let person = &input.problem.people[real_person_idx];
            if participates(person, real_session_idx) && !placed.contains(&person.id) {
                place_with_repair_preference(
                    input,
                    &mut projected_session,
                    &preferred_group,
                    real_session_idx,
                    &person.id,
                )?;
                placed.insert(person.id.clone());
            }
        }

        for person in &input.problem.people {
            if participates(person, real_session_idx) && !placed.contains(&person.id) {
                place_with_repair_preference(
                    input,
                    &mut projected_session,
                    &preferred_group,
                    real_session_idx,
                    &person.id,
                )?;
                placed.insert(person.id.clone());
            }
        }

        for group in &input.problem.groups {
            projected_session.entry(group.id.clone()).or_default();
        }
        projected.insert(session_key, projected_session);
    }

    Ok(projected)
}

fn hard_anchor_people(input: &ApiInput, session_idx: usize) -> HashSet<String> {
    let mut anchored = HashSet::new();
    for constraint in &input.constraints {
        match constraint {
            Constraint::ImmovablePerson(params) => {
                if constraint_active(params.sessions.as_deref(), session_idx) {
                    anchored.insert(params.person_id.clone());
                }
            }
            Constraint::ImmovablePeople(params) => {
                if constraint_active(params.sessions.as_deref(), session_idx) {
                    anchored.extend(params.people.iter().cloned());
                }
            }
            Constraint::MustStayTogether { people, sessions } => {
                if constraint_active(sessions.as_deref(), session_idx) {
                    anchored.extend(people.iter().cloned());
                }
            }
            _ => {}
        }
    }
    anchored
}

fn constraint_active(sessions: Option<&[u32]>, session_idx: usize) -> bool {
    sessions
        .map(|sessions| sessions.contains(&(session_idx as u32)))
        .unwrap_or(true)
}

fn map_oracle_people(input: &ApiInput, candidate: &TemplateCandidate) -> Vec<Option<usize>> {
    let mut real_people = (0..input.problem.people.len()).collect::<Vec<_>>();
    real_people.sort_by_key(|&person_idx| {
        let participation_count = candidate
            .sessions
            .iter()
            .filter(|&&session_idx| participates(&input.problem.people[person_idx], session_idx))
            .count();
        (Reverse(participation_count), person_idx)
    });

    let mut mapping = vec![None; candidate.seat_count];
    for (oracle_person_idx, real_person_idx) in real_people
        .into_iter()
        .take(candidate.seat_count)
        .enumerate()
    {
        mapping[oracle_person_idx] = Some(real_person_idx);
    }
    mapping
}

fn preferred_group_by_person(session: &HashMap<String, Vec<String>>) -> HashMap<String, String> {
    let mut preferred = HashMap::new();
    for (group_id, members) in session {
        for person_id in members {
            preferred.insert(person_id.clone(), group_id.clone());
        }
    }
    preferred
}

fn place_with_repair_preference(
    input: &ApiInput,
    session: &mut HashMap<String, Vec<String>>,
    preferred_group: &HashMap<String, String>,
    session_idx: usize,
    person_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(group_id) = preferred_group.get(person_id) {
        if let Some(group_idx) = input
            .problem
            .groups
            .iter()
            .position(|group| &group.id == group_id)
        {
            if try_place_in_group(input, session, session_idx, group_idx, person_id) {
                return Ok(());
            }
        }
    }
    for group_idx in 0..input.problem.groups.len() {
        if try_place_in_group(input, session, session_idx, group_idx, person_id) {
            return Ok(());
        }
    }
    Err(format!("could not repair-place {person_id} in session {session_idx}").into())
}

fn try_place_in_group(
    input: &ApiInput,
    session: &mut HashMap<String, Vec<String>>,
    session_idx: usize,
    group_idx: usize,
    person_id: &str,
) -> bool {
    let group = &input.problem.groups[group_idx];
    let capacity = group_capacity(group, session_idx);
    let members = session.entry(group.id.clone()).or_default();
    if members.len() >= capacity || members.iter().any(|member| member == person_id) {
        return false;
    }
    members.push(person_id.to_string());
    true
}

fn configure_solver3(input: &mut ApiInput, mode: Solver3ConstructionMode) {
    let mut params = Solver3Params::default();
    params.construction.mode = mode;
    params.construction.freedom_aware.gamma = 0.0;
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

fn participants_by_session(input: &ApiInput) -> Vec<usize> {
    (0..input.problem.num_sessions as usize)
        .map(|session_idx| {
            input
                .problem
                .people
                .iter()
                .filter(|person| participates(person, session_idx))
                .count()
        })
        .collect()
}

fn person_participates_by_id(input: &ApiInput, person_id: &str, session_idx: usize) -> bool {
    input
        .problem
        .people
        .iter()
        .find(|person| person.id == person_id)
        .map(|person| participates(person, session_idx))
        .unwrap_or(false)
}

fn participates(person: &Person, session_idx: usize) -> bool {
    person
        .sessions
        .as_ref()
        .map(|sessions| sessions.contains(&(session_idx as u32)))
        .unwrap_or(true)
}

fn group_capacity(group: &Group, session_idx: usize) -> usize {
    group
        .session_sizes
        .as_ref()
        .and_then(|sizes| sizes.get(session_idx).copied())
        .unwrap_or(group.size) as usize
}

fn group_labels(input: &ApiInput, group_indices: &[usize]) -> Vec<String> {
    group_indices
        .iter()
        .map(|&group_idx| input.problem.groups[group_idx].id.clone())
        .collect()
}

fn oracle_person_id(idx: usize) -> String {
    format!("oracle_person_{idx}")
}

fn oracle_group_id(idx: usize) -> String {
    format!("oracle_group_{idx}")
}

fn binomial2(value: usize) -> usize {
    value.saturating_sub(1) * value / 2
}
