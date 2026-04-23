#!/usr/bin/env python3
"""Generate a keep-apart variant of the synthetic partial-attendance stretch benchmark.

This derives from the canonical planted-feasible partial-attendance/capacity benchmark and
adds deterministic `MustStayApart` constraints that are guaranteed to be satisfiable by the
planted schedule used during generation.

Outputs:
1. a stretch benchmark case for dedicated score-quality benchmarking
2. a solver3-only core correctness fixture
3. a solver3 correctness-corpus benchmark case derived from the same input
"""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

ROOT = Path(__file__).resolve().parents[2]
BASE_GENERATOR_PATH = ROOT / "tools/benchmarking/generate_partial_attendance_capacity_case.py"

STRETCH_CASE_ID = "stretch.synthetic-partial-attendance-keep-apart-capacity-pressure-152p"
STRETCH_TITLE = "Synthetic partial-attendance keep-apart capacity-pressure stretch"
STRETCH_DESCRIPTION = (
    "Deterministic planted-feasible synthetic stretch workload with heavy non-contiguous partial "
    "attendance, strongly session-specific capacities, dense session-scoped constraint pressure, "
    "and additional hard Keep Apart windows."
)
STRETCH_PURPOSE = "objective_target.stretch.synthetic_partial_attendance_keep_apart_capacity_pressure_152p"
STRETCH_PROVENANCE = (
    "generated_by_tools/benchmarking/generate_partial_attendance_keep_apart_case.py_"
    "using_the_deterministic_planted_feasible_partial_attendance_builder"
)

FIXTURE_NAME = "Constraint - Partial Attendance Keep Apart Stress (solver3)"
FIXTURE_PATH = ROOT / "backend/core/tests/test_cases/constraint_must_stay_apart_partial_attendance_stress_solver3.json"

CORRECTNESS_CASE_ID = "adversarial.correctness-partial-attendance-keep-apart-stress"
CORRECTNESS_TITLE = "Correctness partial-attendance keep-apart stress"
CORRECTNESS_DESCRIPTION = (
    "Large partial-attendance/session-capacity stress workload with additional hard Keep Apart "
    "windows, retargeted to solver3 as a correctness corpus case."
)
CORRECTNESS_PURPOSE = "correctness_edge.intertwined.partial_attendance_keep_apart_capacity_pressure"
CORRECTNESS_PROVENANCE = (
    "reused_from_backend/core/tests/test_cases/"
    "constraint_must_stay_apart_partial_attendance_stress_solver3.json"
)

TARGET_HARD_APART_COUNT = 24
MAX_HARD_APARTS_PER_PERSON = 2


def load_base_generator_module():
    spec = importlib.util.spec_from_file_location(
        "partial_attendance_capacity_generator", BASE_GENERATOR_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load base generator from {BASE_GENERATOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def all_sessions(num_sessions: int) -> List[int]:
    return list(range(num_sessions))


def sessions_for_person(person: Dict[str, object], num_sessions: int) -> Tuple[int, ...]:
    return tuple(person.get("sessions", all_sessions(num_sessions)))


def build_together_lookup(initial_schedule: Dict[str, Dict[str, List[str]]]) -> Dict[Tuple[str, str], set[int]]:
    together_sessions: Dict[Tuple[str, str], set[int]] = defaultdict(set)
    for session_key, groups in initial_schedule.items():
        session_idx = int(session_key.split("_")[1])
        for members in groups.values():
            for left_index, left_person in enumerate(members):
                for right_person in members[left_index + 1 :]:
                    together_sessions[tuple(sorted((left_person, right_person)))].add(session_idx)
    return together_sessions


def existing_protected_pairs(constraints: Sequence[Dict[str, object]]) -> set[Tuple[str, str]]:
    protected_types = {
        "MustStayTogether",
        "ShouldStayTogether",
        "ShouldNotBeTogether",
        "MustStayApart",
    }
    return {
        tuple(sorted(constraint["people"]))
        for constraint in constraints
        if constraint["type"] in protected_types
    }


def select_hard_apart_constraints(
    people: Sequence[Dict[str, object]],
    constraints: Sequence[Dict[str, object]],
    initial_schedule: Dict[str, Dict[str, List[str]]],
    num_sessions: int,
) -> List[Dict[str, object]]:
    people_by_id = {person["id"]: person for person in people}
    person_ids = sorted(people_by_id)
    sessions_by_person = {
        person_id: sessions_for_person(person, num_sessions)
        for person_id, person in people_by_id.items()
    }
    together_lookup = build_together_lookup(initial_schedule)
    blocked_pairs = existing_protected_pairs(constraints)

    candidates_by_window: Dict[Tuple[int, ...], List[Tuple[Tuple[int, str, str], str, str]]] = defaultdict(list)
    for left_index, left_person in enumerate(person_ids):
        left_sessions = set(sessions_by_person[left_person])
        left_mask = people_by_id[left_person]["attributes"]["Attendance Pattern"]
        for right_person in person_ids[left_index + 1 :]:
            pair_key = tuple(sorted((left_person, right_person)))
            if pair_key in blocked_pairs:
                continue

            shared_sessions = tuple(
                sorted(left_sessions.intersection(sessions_by_person[right_person]))
            )
            if len(shared_sessions) < 2:
                continue
            if together_lookup.get(pair_key):
                continue

            right_mask = people_by_id[right_person]["attributes"]["Attendance Pattern"]
            if left_mask == right_mask:
                continue

            candidates_by_window[shared_sessions].append(
                ((-len(shared_sessions), left_person, right_person), left_person, right_person)
            )

    for candidates in candidates_by_window.values():
        candidates.sort()

    offsets = {window: 0 for window in candidates_by_window}
    person_counts: Counter[str] = Counter()
    session_pressure: Counter[int] = Counter()
    selected: List[Dict[str, object]] = []

    while len(selected) < TARGET_HARD_APART_COUNT:
        added_any = False
        window_order = sorted(
            candidates_by_window,
            key=lambda window: (
                sum(session_pressure[session] for session in window),
                sum(1 for constraint in selected if tuple(constraint["sessions"]) == window),
                -len(window),
                window,
            ),
        )
        for window in window_order:
            candidates = candidates_by_window[window]
            while offsets[window] < len(candidates):
                _, left_person, right_person = candidates[offsets[window]]
                offsets[window] += 1
                if (
                    person_counts[left_person] >= MAX_HARD_APARTS_PER_PERSON
                    or person_counts[right_person] >= MAX_HARD_APARTS_PER_PERSON
                ):
                    continue

                selected.append(
                    {
                        "type": "MustStayApart",
                        "people": [left_person, right_person],
                        "sessions": list(window),
                    }
                )
                person_counts[left_person] += 1
                person_counts[right_person] += 1
                for session in window:
                    session_pressure[session] += 1
                added_any = True
                break
            if len(selected) >= TARGET_HARD_APART_COUNT:
                break
        if not added_any:
            break

    if len(selected) != TARGET_HARD_APART_COUNT:
        raise RuntimeError(
            f"expected {TARGET_HARD_APART_COUNT} MustStayApart constraints, selected {len(selected)}"
        )
    return selected


def build_keep_apart_stretch_case() -> Tuple[Dict[str, object], Dict[str, object], List[Dict[str, object]]]:
    base_module = load_base_generator_module()
    with tempfile.TemporaryDirectory() as tmpdir:
        base_output = Path(tmpdir) / "synthetic_partial_attendance_capacity_pressure_152p.json"
        base_manifest, base_summary, planted_manifest = base_module.build_manifest(base_output)

    manifest = copy.deepcopy(base_manifest)
    manifest["id"] = STRETCH_CASE_ID
    manifest["purpose"] = STRETCH_PURPOSE
    manifest["provenance"] = STRETCH_PROVENANCE
    manifest["title"] = STRETCH_TITLE
    manifest["description"] = STRETCH_DESCRIPTION
    manifest["tags"] = list(manifest["tags"]) + ["keep-apart", "must-stay-apart"]

    hard_apart_constraints = select_hard_apart_constraints(
        people=manifest["input"]["problem"]["people"],
        constraints=manifest["input"]["constraints"],
        initial_schedule=planted_manifest["input"]["initial_schedule"],
        num_sessions=manifest["input"]["problem"]["num_sessions"],
    )
    manifest["input"]["constraints"].extend(hard_apart_constraints)

    summary = copy.deepcopy(base_summary)
    summary["case_id"] = STRETCH_CASE_ID
    summary["constraint_counts"]["MustStayApart"] = len(hard_apart_constraints)
    summary["total_constraints"] = len(manifest["input"]["constraints"])
    summary["hard_apart_session_pressure"] = {
        str(session): sum(
            1 for constraint in hard_apart_constraints if session in constraint["sessions"]
        )
        for session in range(manifest["input"]["problem"]["num_sessions"])
    }

    return manifest, summary, hard_apart_constraints


def build_core_fixture(stretch_case: Dict[str, object]) -> Dict[str, object]:
    fixture_input = copy.deepcopy(stretch_case["input"])
    fixture_input["solver"] = {
        "solver_type": "solver3",
        "stop_conditions": {
            "max_iterations": 25000,
            "time_limit_seconds": 3,
            "no_improvement_iterations": None,
        },
        "solver_params": {
            "solver_type": "solver3",
        },
        "logging": {
            "log_frequency": 0,
            "log_initial_state": False,
            "log_duration_and_score": False,
            "display_final_schedule": False,
            "log_initial_score_breakdown": False,
            "log_final_score_breakdown": False,
            "log_stop_condition": False,
        },
    }

    return {
        "name": FIXTURE_NAME,
        "metadata": {
            "tags": [
                "constraints",
                "must_stay_apart",
                "partial_attendance",
                "session_capacities",
                "solver3",
            ],
            "kind": "correctness",
            "tier": "default",
            "solver_families": ["solver3"],
        },
        "input": fixture_input,
        "expected": {
            "cannot_be_together_respected": True,
            "must_stay_together_respected": True,
            "immovable_person_respected": True,
            "session_specific_constraints_respected": True,
            "participation_patterns_respected": True,
        },
        "test_options": {},
    }


def build_correctness_benchmark_case(stretch_case: Dict[str, object]) -> Dict[str, object]:
    return {
        "schema_version": 1,
        "id": CORRECTNESS_CASE_ID,
        "class": "adversarial",
        "case_role": "canonical",
        "tags": [
            "correctness-corpus",
            "edge-case",
            "intertwined",
            "partial-attendance",
            "session-capacity",
            "keep-apart",
            "must-stay-apart",
            "solver3",
        ],
        "title": CORRECTNESS_TITLE,
        "description": CORRECTNESS_DESCRIPTION,
        "purpose": CORRECTNESS_PURPOSE,
        "provenance": CORRECTNESS_PROVENANCE,
        "input": copy.deepcopy(stretch_case["input"]),
    }


def write_json(path: Path, payload: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--stretch-output",
        type=Path,
        default=ROOT
        / "backend/benchmarking/cases/stretch/synthetic_partial_attendance_keep_apart_capacity_pressure_152p.json",
    )
    parser.add_argument("--summary-output", type=Path, default=None)
    parser.add_argument(
        "--fixture-output",
        type=Path,
        default=FIXTURE_PATH,
    )
    parser.add_argument(
        "--correctness-output",
        type=Path,
        default=ROOT
        / "backend/benchmarking/cases/adversarial/correctness_partial_attendance_keep_apart_stress.json",
    )
    args = parser.parse_args()

    stretch_case, summary, _ = build_keep_apart_stretch_case()
    fixture = build_core_fixture(stretch_case)
    correctness_case = build_correctness_benchmark_case(stretch_case)

    write_json(args.stretch_output, stretch_case)
    write_json(args.fixture_output, fixture)
    write_json(args.correctness_output, correctness_case)
    if args.summary_output is not None:
        write_json(args.summary_output, summary)

    print(json.dumps(summary, indent=2))
    print(f"wrote {args.stretch_output}")
    print(f"wrote {args.fixture_output}")
    print(f"wrote {args.correctness_output}")


if __name__ == "__main__":
    main()
