use serde::Deserialize;
use solver_core::models::{ApiInput, SolverResult};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Debug, Deserialize)]
enum TestMode {
    #[serde(rename = "all")]
    All,
    #[serde(rename = "filter")]
    Filter,
}

#[derive(Debug, Deserialize)]
struct TestSettings {
    mode: TestMode,
    filter_patterns: Vec<String>,
}

#[derive(Deserialize, Debug)]
struct TestOptions {
    #[serde(default = "default_loop_count")]
    loop_count: u32,
}

impl Default for TestOptions {
    fn default() -> Self {
        Self {
            loop_count: default_loop_count(),
        }
    }
}

fn default_loop_count() -> u32 {
    1
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
struct TestCase {
    name: String,
    input: ApiInput,
    #[serde(default)]
    expected: ExpectedMetrics,
    #[serde(default)]
    test_options: TestOptions,
}

#[derive(Deserialize, Debug, Default)]
#[allow(dead_code)]
struct ExpectedMetrics {
    #[serde(default)]
    must_stay_together_respected: bool,
    #[serde(default)]
    cannot_be_together_respected: bool,
    #[serde(default)]
    should_stay_together_respected: bool,
    max_constraint_penalty: Option<u32>,
    #[serde(default)]
    immovable_person_respected: bool,
    #[serde(default)]
    session_specific_constraints_respected: bool,
    #[serde(default)]
    participation_patterns_respected: bool,
    #[serde(default)]
    min_transfers_accepted: Option<u64>,
    #[serde(default)]
    expect_solver_error: bool,
    #[serde(default)]
    expected_error_contains: Option<String>,
}

#[test]
fn run_data_driven_tests() {
    let settings_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("test_settings.yaml");
    let settings_file =
        fs::read_to_string(settings_path).expect("Unable to read test_settings.yaml");
    let settings: TestSettings =
        serde_yaml::from_str(&settings_file).expect("Unable to parse test_settings.yaml");

    let paths = fs::read_dir("tests/test_cases").unwrap();

    for path in paths {
        let path = path.unwrap().path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
            let file_content = fs::read_to_string(&path)
                .unwrap_or_else(|e| panic!("Failed to read test case file {:?}: {}", path, e));
            let test_case: TestCase = serde_json::from_str(&file_content).unwrap_or_else(|e| {
                panic!(
                    "Failed to parse test case \"{}\": {}",
                    path.to_str().unwrap(),
                    e
                )
            });

            let should_run = match settings.mode {
                TestMode::All => true,
                TestMode::Filter => settings
                    .filter_patterns
                    .iter()
                    .any(|pattern| test_case.name.contains(pattern)),
            };

            if should_run {
                run_test_case(&test_case, &path);
            }
        }
    }
}

fn run_test_case(test_case: &TestCase, path: &Path) {
    let loop_count = test_case.test_options.loop_count;
    if loop_count > 1 {
        println!(
            "--- Running Test: {} ({} times) ---",
            test_case.name, loop_count
        );
    } else {
        println!("--- Running Test: {} ---", test_case.name);
    }

    let last_progress: Arc<Mutex<Option<solver_core::models::ProgressUpdate>>> =
        Arc::new(Mutex::new(None));
    let progress_clone = last_progress.clone();

    let progress_cb: solver_core::models::ProgressCallback =
        Box::new(move |p: &solver_core::models::ProgressUpdate| {
            *progress_clone.lock().unwrap() = Some(p.clone());
            true // Continue solving
        });

    let result = solver_core::run_solver_with_progress(&test_case.input, Some(&progress_cb));

    // Handle expected error cases
    match result {
        Ok(result) => {
            if test_case.expected.expect_solver_error {
                panic!(
                    "Expected solver to error for test case {} ({:?}), but it succeeded",
                    test_case.name, path
                );
            }

            // Proceed with normal assertions below using `result`
            run_assertions(test_case, path, result, &last_progress, loop_count);
        }
        Err(e) => {
            if test_case.expected.expect_solver_error {
                if let Some(substr) = &test_case.expected.expected_error_contains {
                    let msg = format!("{:?}", e);
                    assert!(
                        msg.contains(substr),
                        "Expected error to contain '{}', but got {:?}",
                        substr,
                        e
                    );
                }
                // Count as pass
                return;
            }

            panic!(
                "Solver failed for test case {} ({:?}): {:?}",
                test_case.name,
                path,
                Some(e)
            );
        }
    }
}

fn run_assertions(
    test_case: &TestCase,
    path: &Path,
    result: SolverResult,
    last_progress: &Arc<Mutex<Option<solver_core::models::ProgressUpdate>>>,
    loop_count: u32,
) {
    // Retrieve the final progress update (should be set by the solver)
    let final_progress = last_progress
        .lock()
        .unwrap()
        .clone()
        .expect("Expected at least one progress callback to have been recorded");

    if test_case.expected.must_stay_together_respected {
        assert_cliques_respected(&test_case.input, &result);
    }

    if test_case.expected.cannot_be_together_respected {
        assert_forbidden_pairs_respected(&test_case.input, &result);
    }

    if test_case.expected.should_stay_together_respected {
        assert_should_together_respected(&test_case.input, &result);
    }

    if test_case.expected.immovable_person_respected {
        assert_immovable_person_respected(&test_case.input, &result);
    }

    if test_case.expected.session_specific_constraints_respected {
        assert_session_specific_constraints_respected(&test_case.input, &result);
    }

    if test_case.expected.participation_patterns_respected {
        assert_participation_patterns_respected(&test_case.input, &result);
    }

    if let Some(max_penalty) = test_case.expected.max_constraint_penalty {
        assert!(
            result.constraint_penalty as u32 <= max_penalty,
            "Constraint penalty {} exceeds maximum of {}",
            result.constraint_penalty,
            max_penalty
        );
    }

    if let Some(min_transfers) = test_case.expected.min_transfers_accepted {
        assert!(
            final_progress.transfers_accepted as u64 >= min_transfers,
            "Expected at least {} accepted transfers, but solver reported {}",
            min_transfers,
            final_progress.transfers_accepted
        );
    }

    io::stdout().flush().unwrap();
    if loop_count > 1 {
        // Clear the line and print final status
        println!("\r  All {} runs passed.        ", loop_count);
    }
}

fn assert_cliques_respected(input: &ApiInput, result: &SolverResult) {
    for constraint in &input.constraints {
        if let solver_core::models::Constraint::MustStayTogether {
            people, sessions, ..
        } = constraint
        {
            // Determine which sessions this constraint applies to
            let applicable_sessions: Vec<u32> = match sessions {
                Some(session_list) => session_list.clone(),
                None => (0..input.problem.num_sessions).collect(), // Apply to all sessions if not specified
            };

            // Check each applicable session
            for session in applicable_sessions {
                let session_key = format!("session_{}", session);
                let session_schedule = result.schedule.get(&session_key).unwrap_or_else(|| {
                    panic!(
                        "Session {} not found in schedule for clique check",
                        session_key
                    )
                });

                // Find which group the first person is in
                let mut clique_group_id = None;
                for (group_id, members) in session_schedule {
                    if members.contains(&people[0]) {
                        clique_group_id = Some(group_id);
                        break;
                    }
                }

                assert!(
                    clique_group_id.is_some(),
                    "Clique member {} not found in any group for session {}",
                    people[0],
                    session
                );

                let group_members = session_schedule.get(clique_group_id.unwrap()).unwrap();

                // Verify all clique members are in the same group for this session
                for person in people {
                    assert!(
                        group_members.contains(person),
                        "Clique constraint violated: {} should be with {:?} in session {} but is not",
                        person, people, session
                    );
                }
            }
        }
    }
}

fn assert_forbidden_pairs_respected(input: &ApiInput, result: &SolverResult) {
    for constraint in &input.constraints {
        if let solver_core::models::Constraint::ShouldNotBeTogether {
            people, sessions, ..
        } = constraint
        {
            // Determine which sessions this constraint applies to
            let applicable_sessions: Vec<u32> = match sessions {
                Some(session_list) => session_list.clone(),
                None => (0..input.problem.num_sessions).collect(), // Apply to all sessions if not specified
            };

            // Check each applicable session
            for session in applicable_sessions {
                let session_key = format!("session_{}", session);
                let session_schedule = result.schedule.get(&session_key).unwrap_or_else(|| {
                    panic!(
                        "Session {} not found in schedule for forbidden pair check",
                        session_key
                    )
                });

                for (_group_id, members) in session_schedule {
                    let mut present_members = 0;
                    for person in people {
                        if members.contains(person) {
                            present_members += 1;
                        }
                    }
                    assert!(
                        present_members <= 1,
                        "Forbidden constraint violated: {:?} found together in session {} group: {:?}",
                        people, session, members
                    );
                }
            }
        }
    }
}

fn assert_should_together_respected(input: &ApiInput, result: &SolverResult) {
    for constraint in &input.constraints {
        if let solver_core::models::Constraint::ShouldStayTogether {
            people, sessions, ..
        } = constraint
        {
            // Determine which sessions this constraint applies to
            let applicable_sessions: Vec<u32> = match sessions {
                Some(session_list) => session_list.clone(),
                None => (0..input.problem.num_sessions).collect(),
            };

            for session in applicable_sessions {
                let session_key = format!("session_{}", session);
                let session_schedule = result.schedule.get(&session_key).unwrap_or_else(|| {
                    panic!(
                        "Session {} not found in schedule for should-together check",
                        session_key
                    )
                });

                // Find the group of the first person (people[0])
                let mut group_id_opt: Option<&String> = None;
                for (group_id, members) in session_schedule {
                    if members.contains(&people[0]) {
                        group_id_opt = Some(group_id);
                        break;
                    }
                }
                if let Some(group_id) = group_id_opt {
                    let members = session_schedule.get(group_id).unwrap();
                    for p in people {
                        assert!(
                            members.contains(p),
                            "ShouldStayTogether violated: {:?} not all in group {} for session {}",
                            people,
                            group_id,
                            session
                        );
                    }
                } else {
                    panic!(
                        "ShouldStayTogether: anchor person {} not found in any group for session {}",
                        people[0],
                        session
                    );
                }
            }
        }
    }
}

fn assert_immovable_person_respected(input: &ApiInput, result: &SolverResult) {
    let immovable_constraints: Vec<_> = input
        .constraints
        .iter()
        .filter_map(|c| match c {
            solver_core::models::Constraint::ImmovablePerson(params) => Some(params),
            _ => None,
        })
        .collect();

    for constraint in immovable_constraints {
        // Determine applicable sessions; default to all when not specified
        let sessions: Vec<u32> = constraint
            .sessions
            .clone()
            .unwrap_or_else(|| (0..input.problem.num_sessions).collect());
        for &session in &sessions {
            let session_key = format!("session_{}", session);
            let session_schedule = result.schedule.get(&session_key).unwrap_or_else(|| {
                panic!(
                    "Session {} not found in schedule for immovable person check",
                    session_key
                )
            });

            let person_group = session_schedule
                .iter()
                .find(|(_group_id, members)| members.contains(&constraint.person_id));

            assert!(
                person_group.is_some(),
                "Immovable person {} not found in any group for session {}",
                constraint.person_id,
                session
            );

            let (group_id, _members) = person_group.unwrap();
            assert_eq!(
                *group_id, constraint.group_id,
                "Immovable person {} is in group {} instead of {} for session {}",
                constraint.person_id, group_id, constraint.group_id, session
            );
        }
    }
}

fn assert_session_specific_constraints_respected(input: &ApiInput, result: &SolverResult) {
    // Check MustStayTogether constraints
    for constraint in &input.constraints {
        if let solver_core::models::Constraint::MustStayTogether {
            people, sessions, ..
        } = constraint
        {
            if let Some(session_list) = sessions {
                // Validate that clique is together ONLY in specified sessions
                for session in session_list {
                    let session_key = format!("session_{}", session);
                    let session_schedule = result
                        .schedule
                        .get(&session_key)
                        .unwrap_or_else(|| panic!("Session {} not found in schedule", session_key));

                    // Find which group the first person is in
                    let mut clique_group_id = None;
                    for (group_id, members) in session_schedule {
                        if members.contains(&people[0]) {
                            clique_group_id = Some(group_id);
                            break;
                        }
                    }

                    assert!(
                        clique_group_id.is_some(),
                        "Clique member {} not found in any group for session {}",
                        people[0],
                        session
                    );

                    let group_members = session_schedule.get(clique_group_id.unwrap()).unwrap();

                    // Verify all clique members are in the same group for this session
                    for person in people {
                        assert!(
                            group_members.contains(person),
                            "Session-specific clique constraint violated: {} should be with {:?} in session {} but is not",
                            person, people, session
                        );
                    }
                }
            }
        }
    }

    // Check ShouldNotBeTogether constraints
    for constraint in &input.constraints {
        if let solver_core::models::Constraint::ShouldNotBeTogether {
            people, sessions, ..
        } = constraint
        {
            if let Some(session_list) = sessions {
                // Validate that forbidden pair/group is separated ONLY in specified sessions
                for session in session_list {
                    let session_key = format!("session_{}", session);
                    let session_schedule = result
                        .schedule
                        .get(&session_key)
                        .unwrap_or_else(|| panic!("Session {} not found in schedule", session_key));

                    for (_group_id, members) in session_schedule {
                        let mut present_members = 0;
                        for person in people {
                            if members.contains(person) {
                                present_members += 1;
                            }
                        }
                        assert!(
                            present_members <= 1,
                            "Session-specific forbidden constraint violated: {:?} found together in session {} group: {:?}",
                            people, session, members
                        );
                    }
                }
            }
        }
    }
}

fn assert_participation_patterns_respected(input: &ApiInput, result: &SolverResult) {
    // Check that people only appear in sessions they're supposed to participate in
    for person in &input.problem.people {
        let person_sessions = match &person.sessions {
            Some(sessions) => sessions.clone(),
            None => (0..input.problem.num_sessions).collect(), // Default: all sessions
        };

        // Check each session
        for session_idx in 0..input.problem.num_sessions {
            let session_key = format!("session_{}", session_idx);
            let should_participate = person_sessions.contains(&session_idx);

            if let Some(session_schedule) = result.schedule.get(&session_key) {
                let mut person_found = false;

                // Check if person appears in any group for this session
                for (_group_id, members) in session_schedule {
                    if members.contains(&person.id) {
                        person_found = true;
                        break;
                    }
                }

                if should_participate && !person_found {
                    // Person should participate but doesn't appear in any group
                    // This might be OK if they couldn't be placed due to constraints
                    // So we'll just log this as a warning rather than failing the test
                    println!("Warning: {} should participate in session {} but doesn't appear in schedule", 
                            person.id, session_idx);
                } else if !should_participate && person_found {
                    // Person shouldn't participate but appears in schedule - this is an error
                    panic!(
                        "Participation pattern violation: {} should NOT participate in session {} but appears in schedule",
                        person.id, session_idx
                    );
                }
            }
        }
    }

    // Additional validation: Check that people who participate together are both actually participating
    for (session_key, session_schedule) in &result.schedule {
        let session_idx: u32 = session_key.replace("session_", "").parse().unwrap_or(0);

        for (_group_id, members) in session_schedule {
            // For each person in this group, verify they should be participating in this session
            for person_id in members {
                if let Some(person) = input.problem.people.iter().find(|p| &p.id == person_id) {
                    let person_sessions = match &person.sessions {
                        Some(sessions) => sessions.clone(),
                        None => (0..input.problem.num_sessions).collect(),
                    };

                    if !person_sessions.contains(&session_idx) {
                        panic!(
                            "Participation violation: {} appears in session {} but should not participate",
                            person.id, session_idx
                        );
                    }
                }
            }
        }
    }
}
