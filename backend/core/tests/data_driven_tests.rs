use gm_core::models::{ApiInput, SolverKind, SolverResult};
use gm_core::{default_solver_configuration_for, run_solver_with_progress};
use serde::Deserialize;
use std::collections::BTreeSet;
use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Instant;

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

fn fixture_perf_assertions_enabled() -> bool {
    std::env::var("GROUPMIXER_ENABLE_FIXTURE_PERF_ASSERTIONS")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

#[derive(Deserialize, Debug, Default)]
struct FixtureMetadata {
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    kind: FixtureKind,
    #[serde(default)]
    tier: FixtureTier,
    #[serde(default)]
    solver_families: Vec<String>,
    #[serde(default)]
    comparison: FixtureComparisonSpec,
}

#[derive(Deserialize, Debug, Default)]
struct FixtureComparisonSpec {
    #[serde(default)]
    category: FixtureComparisonCategory,
    #[serde(default)]
    max_final_score_delta: Option<f64>,
    #[serde(default)]
    max_score_regression: Option<f64>,
    #[serde(default)]
    require_matching_stop_reason: bool,
}

#[derive(Deserialize, Debug, Default, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum FixtureComparisonCategory {
    #[default]
    SingleSolver,
    ExactParity,
    BoundedParity,
    InvariantOnly,
    ScoreQuality,
    PerformanceOnly,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "snake_case")]
enum FixtureKind {
    #[default]
    Correctness,
    Performance,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "snake_case")]
enum FixtureTier {
    #[default]
    Default,
    Slow,
}

#[derive(Deserialize, Debug)]
struct TestCase {
    name: String,
    #[serde(default)]
    metadata: FixtureMetadata,
    input: ApiInput,
    #[serde(default)]
    expected: ExpectedMetrics,
    #[serde(default)]
    test_options: TestOptions,
}

#[derive(Deserialize, Debug, Default)]
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
    max_attribute_balance_penalty: Option<f64>,
    #[serde(default)]
    expect_solver_error: bool,
    #[serde(default)]
    expected_error_contains: Option<String>,
    /// Maximum allowed runtime in milliseconds (for performance regression detection).
    /// Use generous thresholds (2-3x expected) to account for CI variance while
    /// still catching major regressions.
    #[serde(default)]
    max_runtime_ms: Option<u64>,
    /// Minimum iterations per second (alternative performance metric).
    /// Useful for benchmarks where iteration count is known.
    #[serde(default)]
    min_iterations_per_second: Option<u64>,
}

struct FixtureRunRecord {
    solver_kind: SolverKind,
    result: SolverResult,
    elapsed_ms: u64,
}

fn run_fixture_case(path: &Path) {
    let file_content = fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("Failed to read test case file {:?}: {}", path, e));
    let test_case: TestCase = serde_json::from_str(&file_content).unwrap_or_else(|e| {
        panic!(
            "Failed to parse test case \"{}\": {}",
            path.to_string_lossy(),
            e
        )
    });

    let loop_count = test_case.test_options.loop_count;
    let solver_kinds = fixture_solver_kinds(&test_case);
    if loop_count > 1 {
        println!(
            "--- Running Test: {} ({} times) [{} / {} / solvers={}] ---",
            test_case.name,
            loop_count,
            format_tags(&test_case.metadata.tags),
            format_fixture_mode(&test_case.metadata),
            format_solver_kinds(&solver_kinds),
        );
    } else {
        println!(
            "--- Running Test: {} [{} / {} / solvers={}] ---",
            test_case.name,
            format_tags(&test_case.metadata.tags),
            format_fixture_mode(&test_case.metadata),
            format_solver_kinds(&solver_kinds),
        );
    }

    let mut run_records = Vec::new();
    for solver_kind in solver_kinds {
        let input = retarget_input_for_solver_kind(&test_case.input, solver_kind);
        let last_progress: Arc<Mutex<Option<gm_core::models::ProgressUpdate>>> =
            Arc::new(Mutex::new(None));
        let progress_clone = last_progress.clone();

        let progress_cb: gm_core::models::ProgressCallback =
            Box::new(move |p: &gm_core::models::ProgressUpdate| {
                *progress_clone.lock().unwrap() = Some(p.clone());
                true
            });

        let start_time = Instant::now();
        let result = run_solver_with_progress(&input, Some(&progress_cb));
        let elapsed_ms = start_time.elapsed().as_millis() as u64;

        match result {
            Ok(result) => {
                if test_case.expected.expect_solver_error {
                    panic!(
                        "Expected solver to error for test case {} ({:?}) with solver {}, but it succeeded",
                        test_case.name,
                        path,
                        solver_kind.canonical_id()
                    );
                }

                run_assertions(
                    &test_case,
                    &input,
                    &result,
                    &last_progress,
                    loop_count,
                    elapsed_ms,
                    solver_kind,
                );
                run_records.push(FixtureRunRecord {
                    solver_kind,
                    result,
                    elapsed_ms,
                });
            }
            Err(e) => {
                if test_case.expected.expect_solver_error {
                    if let Some(substr) = &test_case.expected.expected_error_contains {
                        let msg = format!("{:?}", e);
                        assert!(
                            msg.contains(substr),
                            "Expected error to contain '{}' for solver {}, but got {:?}",
                            substr,
                            solver_kind.canonical_id(),
                            e
                        );
                    }
                    continue;
                }

                panic!(
                    "Solver failed for test case {} ({:?}) with solver {}: {:?}",
                    test_case.name,
                    path,
                    solver_kind.canonical_id(),
                    Some(e)
                );
            }
        }
    }

    assert_cross_solver_expectations(&test_case, &run_records);
}

fn fixture_solver_kinds(test_case: &TestCase) -> Vec<SolverKind> {
    if test_case.metadata.solver_families.is_empty() {
        return vec![test_case
            .input
            .solver
            .validate_solver_selection()
            .unwrap_or_else(|error| panic!("Invalid fixture solver selection: {error}"))];
    }

    let mut seen = BTreeSet::new();
    test_case
        .metadata
        .solver_families
        .iter()
        .map(|solver_id| {
            SolverKind::parse_config_id(solver_id).unwrap_or_else(|error| {
                panic!(
                    "Invalid fixture solver family '{}' in {}: {}",
                    solver_id, test_case.name, error
                )
            })
        })
        .filter(|kind| seen.insert(*kind))
        .collect()
}

fn format_solver_kinds(kinds: &[SolverKind]) -> String {
    kinds
        .iter()
        .map(|kind| kind.canonical_id())
        .collect::<Vec<_>>()
        .join(",")
}

fn retarget_input_for_solver_kind(input: &ApiInput, solver_kind: SolverKind) -> ApiInput {
    let mut retargeted = input.clone();
    let current_kind = input
        .solver
        .validate_solver_selection()
        .unwrap_or_else(|error| {
            panic!(
                "Fixture input has invalid solver selection '{}': {error}",
                input.solver.solver_type
            )
        });

    if current_kind == solver_kind {
        retargeted.solver.solver_type = solver_kind.canonical_id().to_string();
        return retargeted;
    }

    let mut replacement = default_solver_configuration_for(solver_kind);
    replacement.stop_conditions = input.solver.stop_conditions.clone();
    replacement.logging = input.solver.logging.clone();
    replacement.telemetry = input.solver.telemetry.clone();
    replacement.seed = input.solver.seed;
    replacement.move_policy = input.solver.move_policy.clone();
    replacement.allowed_sessions = input.solver.allowed_sessions.clone();
    retargeted.solver = replacement;
    retargeted
}

fn assert_cross_solver_expectations(test_case: &TestCase, run_records: &[FixtureRunRecord]) {
    if run_records.len() <= 1 {
        return;
    }

    match test_case.metadata.comparison.category {
        FixtureComparisonCategory::SingleSolver | FixtureComparisonCategory::InvariantOnly => {}
        FixtureComparisonCategory::ExactParity => {
            let baseline = &run_records[0];
            for candidate in &run_records[1..] {
                assert_eq!(
                    candidate.result.schedule,
                    baseline.result.schedule,
                    "Expected exact schedule parity between '{}' and '{}'",
                    baseline.solver_kind.canonical_id(),
                    candidate.solver_kind.canonical_id()
                );
                assert_eq!(
                    candidate.result.final_score,
                    baseline.result.final_score,
                    "Expected exact final score parity between '{}' and '{}'",
                    baseline.solver_kind.canonical_id(),
                    candidate.solver_kind.canonical_id()
                );
                assert_eq!(
                    candidate.result.constraint_penalty,
                    baseline.result.constraint_penalty,
                    "Expected exact constraint penalty parity between '{}' and '{}'",
                    baseline.solver_kind.canonical_id(),
                    candidate.solver_kind.canonical_id()
                );
                assert_eq!(
                    candidate.result.stop_reason,
                    baseline.result.stop_reason,
                    "Expected exact stop reason parity between '{}' and '{}'",
                    baseline.solver_kind.canonical_id(),
                    candidate.solver_kind.canonical_id()
                );
            }
        }
        FixtureComparisonCategory::BoundedParity => {
            let max_final_score_delta =
                test_case.metadata.comparison.max_final_score_delta.expect(
                    "bounded_parity fixtures must declare comparison.max_final_score_delta",
                );
            let baseline = &run_records[0];
            for candidate in &run_records[1..] {
                let delta = (candidate.result.final_score - baseline.result.final_score).abs();
                assert!(
                    delta <= max_final_score_delta,
                    "Final score delta {} exceeded bounded parity threshold {} between '{}' and '{}'",
                    delta,
                    max_final_score_delta,
                    baseline.solver_kind.canonical_id(),
                    candidate.solver_kind.canonical_id()
                );
                if test_case.metadata.comparison.require_matching_stop_reason {
                    assert_eq!(candidate.result.stop_reason, baseline.result.stop_reason);
                }
            }
        }
        FixtureComparisonCategory::ScoreQuality => {
            let max_score_regression = test_case
                .metadata
                .comparison
                .max_score_regression
                .unwrap_or(0.0);
            let baseline = &run_records[0];
            for candidate in &run_records[1..] {
                let delta = candidate.result.final_score - baseline.result.final_score;
                assert!(
                    delta <= max_score_regression,
                    "Solver '{}' regressed final score by {} vs '{}' (allowed {})",
                    candidate.solver_kind.canonical_id(),
                    delta,
                    baseline.solver_kind.canonical_id(),
                    max_score_regression
                );
            }
        }
        FixtureComparisonCategory::PerformanceOnly => {
            let baseline = &run_records[0];
            for candidate in &run_records[1..] {
                println!(
                    "  Performance-only comparison: {}={}ms vs {}={}ms",
                    baseline.solver_kind.canonical_id(),
                    baseline.elapsed_ms,
                    candidate.solver_kind.canonical_id(),
                    candidate.elapsed_ms
                );
            }
        }
    }
}

fn format_tags(tags: &[String]) -> String {
    if tags.is_empty() {
        "untagged".to_string()
    } else {
        tags.join(",")
    }
}

fn format_fixture_mode(metadata: &FixtureMetadata) -> &'static str {
    match (&metadata.kind, &metadata.tier) {
        (FixtureKind::Performance, FixtureTier::Slow) => "performance/slow",
        (FixtureKind::Performance, FixtureTier::Default) => "performance/default",
        (FixtureKind::Correctness, FixtureTier::Slow) => "correctness/slow",
        (FixtureKind::Correctness, FixtureTier::Default) => "correctness/default",
    }
}

fn run_assertions(
    test_case: &TestCase,
    input: &ApiInput,
    result: &SolverResult,
    last_progress: &Arc<Mutex<Option<gm_core::models::ProgressUpdate>>>,
    loop_count: u32,
    elapsed_ms: u64,
    solver_kind: SolverKind,
) -> gm_core::models::ProgressUpdate {
    let final_progress = last_progress
        .lock()
        .unwrap()
        .clone()
        .expect("Expected at least one progress callback to have been recorded");

    if test_case.expected.must_stay_together_respected {
        assert_cliques_respected(input, result);
    }

    if test_case.expected.cannot_be_together_respected {
        assert_forbidden_pairs_respected(input, result);
    }

    if test_case.expected.should_stay_together_respected {
        assert_should_together_respected(input, result);
    }

    if test_case.expected.immovable_person_respected {
        assert_immovable_person_respected(input, result);
    }

    if test_case.expected.session_specific_constraints_respected {
        assert_session_specific_constraints_respected(input, result);
    }

    if test_case.expected.participation_patterns_respected {
        assert_participation_patterns_respected(input, result);
    }

    if let Some(max_penalty) = test_case.expected.max_constraint_penalty {
        assert!(
            result.constraint_penalty as u32 <= max_penalty,
            "Constraint penalty exceeded fixture maximum"
        );
    }

    if let Some(min_transfers) = test_case.expected.min_transfers_accepted {
        assert!(
            final_progress.transfers_accepted >= min_transfers,
            "Expected at least {} accepted transfers, but solver reported {}",
            min_transfers,
            final_progress.transfers_accepted
        );
    }

    if let Some(max_attr_penalty) = test_case.expected.max_attribute_balance_penalty {
        assert!(
            result.attribute_balance_penalty as f64 <= max_attr_penalty,
            "Attribute balance penalty exceeded fixture maximum"
        );
    }

    let has_fixture_perf_expectation = test_case.expected.max_runtime_ms.is_some()
        || test_case.expected.min_iterations_per_second.is_some();

    if has_fixture_perf_expectation {
        if fixture_perf_assertions_enabled() {
            if let Some(max_ms) = test_case.expected.max_runtime_ms {
                assert!(
                    elapsed_ms <= max_ms,
                    "PERFORMANCE REGRESSION: Test '{}' with solver '{}' took {}ms, exceeds max of {}ms",
                    test_case.name,
                    solver_kind.canonical_id(),
                    elapsed_ms,
                    max_ms
                );
                println!(
                    "  Performance [{}]: {}ms (max: {}ms) ✓",
                    solver_kind.canonical_id(),
                    elapsed_ms,
                    max_ms
                );
            }

            if let Some(min_ips) = test_case.expected.min_iterations_per_second {
                let iterations = test_case
                    .input
                    .solver
                    .stop_conditions
                    .max_iterations
                    .unwrap_or(0);
                let actual_ips = if elapsed_ms > 0 {
                    (iterations * 1000) / elapsed_ms
                } else {
                    u64::MAX
                };
                assert!(
                    actual_ips >= min_ips,
                    "PERFORMANCE REGRESSION: Test '{}' with solver '{}' achieved {} iter/s, below minimum of {} iter/s",
                    test_case.name,
                    solver_kind.canonical_id(),
                    actual_ips,
                    min_ips
                );
                println!(
                    "  Throughput [{}]: {} iter/s (min: {} iter/s) ✓",
                    solver_kind.canonical_id(),
                    actual_ips,
                    min_ips
                );
            }
        } else {
            println!(
                "  Fixture performance thresholds present but skipped; use GROUPMIXER_ENABLE_FIXTURE_PERF_ASSERTIONS=1 to enforce local smoke checks."
            );
        }
    }

    io::stdout().flush().unwrap();
    if loop_count > 1 {
        println!("\r  All {} runs passed.        ", loop_count);
    }

    final_progress
}

fn assert_cliques_respected(input: &ApiInput, result: &SolverResult) {
    for constraint in &input.constraints {
        if let gm_core::models::Constraint::MustStayTogether {
            people, sessions, ..
        } = constraint
        {
            let applicable_sessions: Vec<u32> = match sessions {
                Some(session_list) => session_list.clone(),
                None => (0..input.problem.num_sessions).collect(),
            };

            for session in applicable_sessions {
                let session_key = format!("session_{}", session);
                let session_schedule = result
                    .schedule
                    .get(&session_key)
                    .unwrap_or_else(|| panic!("Expected session missing during clique check"));

                let mut clique_group_id = None;
                for (group_id, members) in session_schedule {
                    if members.contains(&people[0]) {
                        clique_group_id = Some(group_id);
                        break;
                    }
                }

                assert!(
                    clique_group_id.is_some(),
                    "Clique anchor not found in the expected session"
                );

                let group_members = session_schedule.get(clique_group_id.unwrap()).unwrap();

                for person in people {
                    assert!(group_members.contains(person), "Clique constraint violated");
                }
            }
        }
    }
}

fn assert_forbidden_pairs_respected(input: &ApiInput, result: &SolverResult) {
    for constraint in &input.constraints {
        if let gm_core::models::Constraint::ShouldNotBeTogether {
            people, sessions, ..
        }
        | gm_core::models::Constraint::MustStayApart { people, sessions } = constraint
        {
            let applicable_sessions: Vec<u32> = match sessions {
                Some(session_list) => session_list.clone(),
                None => (0..input.problem.num_sessions).collect(),
            };

            for session in applicable_sessions {
                let session_key = format!("session_{}", session);
                let session_schedule = result.schedule.get(&session_key).unwrap_or_else(|| {
                    panic!("Expected session missing during forbidden-pair check")
                });

                for members in session_schedule.values() {
                    let mut present_members = 0;
                    for person in people {
                        if members.contains(person) {
                            present_members += 1;
                        }
                    }
                    assert!(present_members <= 1, "apart constraint violated");
                }
            }
        }
    }
}

fn assert_should_together_respected(input: &ApiInput, result: &SolverResult) {
    for constraint in &input.constraints {
        if let gm_core::models::Constraint::ShouldStayTogether {
            people, sessions, ..
        } = constraint
        {
            let applicable_sessions: Vec<u32> = match sessions {
                Some(session_list) => session_list.clone(),
                None => (0..input.problem.num_sessions).collect(),
            };

            for session in applicable_sessions {
                let session_key = format!("session_{}", session);
                let session_schedule = result.schedule.get(&session_key).unwrap_or_else(|| {
                    panic!("Expected session missing during should-together check")
                });

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
                            "ShouldStayTogether constraint violated"
                        );
                    }
                } else {
                    panic!("ShouldStayTogether anchor not found in the expected session");
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
            gm_core::models::Constraint::ImmovablePerson(params) => Some(params),
            _ => None,
        })
        .collect();

    for constraint in immovable_constraints {
        let sessions: Vec<u32> = constraint
            .sessions
            .clone()
            .unwrap_or_else(|| (0..input.problem.num_sessions).collect());
        for &session in &sessions {
            let session_key = format!("session_{}", session);
            let session_schedule = result.schedule.get(&session_key).unwrap_or_else(|| {
                panic!("Expected session missing during immovable-person check")
            });

            let person_group = session_schedule
                .iter()
                .find(|(_group_id, members)| members.contains(&constraint.person_id));

            assert!(
                person_group.is_some(),
                "Immovable-person constraint anchor not found"
            );

            let (group_id, _members) = person_group.unwrap();
            assert_eq!(
                *group_id, constraint.group_id,
                "Immovable-person constraint violated"
            );
        }
    }
}

fn assert_session_specific_constraints_respected(input: &ApiInput, result: &SolverResult) {
    for constraint in &input.constraints {
        if let gm_core::models::Constraint::MustStayTogether {
            people,
            sessions: Some(session_list),
            ..
        } = constraint
        {
            for session in session_list {
                let session_key = format!("session_{}", session);
                let session_schedule = result.schedule.get(&session_key).unwrap_or_else(|| {
                    panic!("Expected session missing during session-specific clique check")
                });

                let mut clique_group_id = None;
                for (group_id, members) in session_schedule {
                    if members.contains(&people[0]) {
                        clique_group_id = Some(group_id);
                        break;
                    }
                }

                assert!(
                    clique_group_id.is_some(),
                    "Clique anchor not found in the expected session"
                );

                let group_members = session_schedule.get(clique_group_id.unwrap()).unwrap();

                for person in people {
                    assert!(
                        group_members.contains(person),
                        "Session-specific clique constraint violated"
                    );
                }
            }
        }
    }

    for constraint in &input.constraints {
        if let gm_core::models::Constraint::ShouldNotBeTogether {
            people,
            sessions: Some(session_list),
            ..
        }
        | gm_core::models::Constraint::MustStayApart {
            people,
            sessions: Some(session_list),
        } = constraint
        {
            for session in session_list {
                let session_key = format!("session_{}", session);
                let session_schedule = result.schedule.get(&session_key).unwrap_or_else(|| {
                    panic!("Expected session missing during session-specific forbidden-pair check")
                });

                for members in session_schedule.values() {
                    let mut present_members = 0;
                    for person in people {
                        if members.contains(person) {
                            present_members += 1;
                        }
                    }
                    assert!(
                        present_members <= 1,
                        "Session-specific apart constraint violated"
                    );
                }
            }
        }
    }
}

fn assert_participation_patterns_respected(input: &ApiInput, result: &SolverResult) {
    for person in &input.problem.people {
        let person_sessions = match &person.sessions {
            Some(sessions) => sessions.clone(),
            None => (0..input.problem.num_sessions).collect(),
        };

        for session_idx in 0..input.problem.num_sessions {
            let session_key = format!("session_{}", session_idx);
            let should_participate = person_sessions.contains(&session_idx);

            if let Some(session_schedule) = result.schedule.get(&session_key) {
                let mut person_found = false;

                for members in session_schedule.values() {
                    if members.contains(&person.id) {
                        person_found = true;
                        break;
                    }
                }

                if should_participate && !person_found {
                    println!("Warning: participation expectation not met for a scheduled attendee");
                } else if !should_participate && person_found {
                    panic!(
                        "Participation pattern violation: non-participating attendee appeared in the schedule"
                    );
                }
            }
        }
    }

    for (session_key, session_schedule) in &result.schedule {
        let session_idx: u32 = session_key.replace("session_", "").parse().unwrap_or(0);

        for members in session_schedule.values() {
            for person_id in members {
                if let Some(person) = input.problem.people.iter().find(|p| &p.id == person_id) {
                    let person_sessions = match &person.sessions {
                        Some(sessions) => sessions.clone(),
                        None => (0..input.problem.num_sessions).collect(),
                    };

                    if !person_sessions.contains(&session_idx) {
                        panic!(
                            "Participation violation: attendee appeared in a disallowed session"
                        );
                    }
                }
            }
        }
    }
}

#[test]
fn fixture_solver_family_aliases_normalize_and_deduplicate() {
    let test_case = TestCase {
        name: "solver family aliases".to_string(),
        metadata: FixtureMetadata {
            tags: vec![],
            kind: FixtureKind::Correctness,
            tier: FixtureTier::Default,
            solver_families: vec!["SimulatedAnnealing".to_string(), "solver1".to_string()],
            comparison: FixtureComparisonSpec::default(),
        },
        input: sample_fixture_input(),
        expected: ExpectedMetrics::default(),
        test_options: TestOptions::default(),
    };

    let kinds = fixture_solver_kinds(&test_case);
    assert_eq!(kinds, vec![SolverKind::Solver1]);
}

#[test]
fn retargeting_to_same_solver_canonicalizes_solver_type() {
    let input = sample_fixture_input();
    let retargeted = retarget_input_for_solver_kind(&input, SolverKind::Solver1);
    assert_eq!(retargeted.solver.solver_type, "solver1");
    assert_eq!(
        retargeted.solver.validate_solver_selection().unwrap(),
        SolverKind::Solver1
    );
}

fn sample_fixture_input() -> ApiInput {
    ApiInput {
        initial_schedule: None,
        construction_seed_schedule: None,
        problem: gm_core::models::ProblemDefinition {
            people: vec![
                gm_core::models::Person {
                    id: "p0".to_string(),
                    attributes: Default::default(),
                    sessions: None,
                },
                gm_core::models::Person {
                    id: "p1".to_string(),
                    attributes: Default::default(),
                    sessions: None,
                },
            ],
            groups: vec![gm_core::models::Group {
                id: "g0".to_string(),
                size: 2,
                session_sizes: None,
            }],
            num_sessions: 1,
        },
        objectives: vec![],
        constraints: vec![],
        solver: default_solver_configuration_for(SolverKind::Solver1),
    }
}

include!(concat!(env!("OUT_DIR"), "/generated_data_driven_cases.rs"));
