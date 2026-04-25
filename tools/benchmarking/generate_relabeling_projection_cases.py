#!/usr/bin/env python3
"""Generate planted 13x13x14 relabeling projection benchmark cases.

The committed cases are static benchmark manifests. This helper records how to regenerate them from
an explicit solver6 oracle output without making the benchmark runner depend on a generator.

Typical regeneration flow from the repo root:

  python - <<'PY'
  import json
  pure = json.load(open('backend/benchmarking/cases/stretch/social_golfer_169x13x14.json'))['input']
  pure['constraints'] = [{
      'type': 'RepeatEncounter',
      'max_allowed_encounters': 1,
      'penalty_function': 'linear',
      'penalty_weight': 1.0,
  }]
  pure['solver'] = {
      'solver_type': 'solver6',
      'stop_conditions': {
          'max_iterations': 500,
          'time_limit_seconds': 1,
          'no_improvement_iterations': 100,
          'stop_on_optimal_score': True,
      },
      'solver_params': {
          'solver_type': 'solver6',
          'exact_construction_handoff_enabled': True,
          'seed_strategy': 'solver5_exact_block_composition',
          'pair_repeat_penalty_model': 'linear_repeat_excess',
          'search_strategy': 'deterministic_best_improving_hill_climb',
          'cache': None,
          'seed_time_limit_seconds': None,
          'local_search_time_limit_seconds': None,
      },
      'logging': {},
      'telemetry': {},
      'seed': 1691314,
  }
  request = {
      'scenario': pure['problem'],
      'constraints': pure['constraints'],
      'objectives': pure['objectives'],
      'initial_schedule': None,
      'construction_seed_schedule': None,
      'solver': pure['solver'],
  }
  json.dump(request, open('/tmp/gm-sgp169-solver6-request.json', 'w'))
  PY
  cargo run -q -p gm-cli -- solve /tmp/gm-sgp169-solver6-request.json \
    --output /tmp/gm-sgp169-solver6-output.json --pretty
  python tools/benchmarking/generate_relabeling_projection_cases.py \
    --solver6-output /tmp/gm-sgp169-solver6-output.json

The generated cases hide a deterministic person/session/group-slot relabeling, then plant
constraints sampled from the relabeled solver6 schedule. A perfect relabeling exists by
construction for all non-capacity-lower cases; mixed structural cases use matching attendance
omissions for any 12-seat capacity slots. The benchmark sizes are intentionally diagnostic and
must not be reduced merely because the current relabeling implementation times out or fails.
"""

from __future__ import annotations

import argparse
import json
import os
import random
from collections import defaultdict
from pathlib import Path
from typing import Any

NUM_GROUPS = 13
GROUP_SIZE = 13
NUM_SESSIONS = 14
NUM_PEOPLE = NUM_GROUPS * GROUP_SIZE
SEED = 90210
OUTPUT_DIR = Path("backend/benchmarking/cases/stretch/relabeling_projection")
SUITE_PATH = Path("backend/benchmarking/suites/solver3-relabeling-projection.yaml")
CANONICAL_CASE_ID = "stretch.social-golfer-169x13x14"

BASE_TAGS = [
    "stretch",
    "diagnostic",
    "relabeling",
    "projection",
    "constraint-aware-projection",
    "oracle-planted",
    "social-golfer",
    "sgp",
    "13x13x14",
    "zero-repeat",
]

CASE_DEFS = [
    (
        "immovable",
        "Relabeling projection 13x13x14 — immovable anchors",
        "Various planted single-person and multi-person immovable anchors sampled from the hidden solver6 relabeling.",
    ),
    (
        "partial_attendance",
        "Relabeling projection 13x13x14 — partial attendance",
        "Light planted person/session attendance omissions over the solver6 relabeling.",
    ),
    (
        "capacity_variation",
        "Relabeling projection 13x13x14 — capacity variation",
        "Slight planted non-uniform group capacities that preserve direct oracle feasibility.",
    ),
    (
        "cliques",
        "Relabeling projection 13x13x14 — must-together cliques",
        "Session-scoped planted cliques sampled from solver6 oracle groups.",
    ),
    (
        "hard_apart",
        "Relabeling projection 13x13x14 — hard-apart graph",
        "Session-scoped planted hard-apart pairs sampled from oracle-separated people.",
    ),
    (
        "attribute_balance",
        "Relabeling projection 13x13x14 — attribute balance",
        "Group/session-scoped planted attribute balance targets derived from relabeled oracle groups.",
    ),
    (
        "pair_meeting",
        "Relabeling projection 13x13x14 — pair meeting counts",
        "Planted exact pair-meeting count factors over selected session subsets.",
    ),
    (
        "soft_pairs",
        "Relabeling projection 13x13x14 — soft pair preferences",
        "Planted should-together and should-not-together pair preferences.",
    ),
    (
        "mixed_light",
        "Relabeling projection 13x13x14 — light mixed constraints",
        "Light mix of planted immovable, clique, hard-apart, attribute, and pair-meeting factors.",
    ),
    (
        "mixed_structural",
        "Relabeling projection 13x13x14 — structural mix",
        "Mixed attendance and capacity asymmetry with a small planted anchor set.",
    ),
    (
        "mixed_full",
        "Relabeling projection 13x13x14 — full mixed constraints",
        "Full planted mix covering anchors, cliques, hard-apart, attributes, pair counts, soft pairs, attendance, and capacity.",
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--solver6-output",
        type=Path,
        required=True,
        help="gm-cli solve output JSON from the fixed 13x13x14 solver6 oracle request.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_DIR,
        help="Directory for generated benchmark case JSON files.",
    )
    parser.add_argument(
        "--suite-path",
        type=Path,
        default=SUITE_PATH,
        help="Suite manifest path to write.",
    )
    return parser.parse_args()


def person_id(real_idx: int) -> str:
    return f"relabel_p{real_idx + 1:03d}"


def group_id(real_group_idx: int) -> str:
    return f"relabel_g{real_group_idx + 1:02d}"


def legacy_group_id(group_idx: int) -> str:
    return f"group_{group_idx + 1:02d}"


def parse_oracle_schedule(path: Path) -> list[list[list[int]]]:
    result = json.load(path.open())
    schedule_json = result["schedule"]
    schedule: list[list[list[int]]] = []
    for session_idx in range(NUM_SESSIONS):
        session_key = f"session_{session_idx}"
        session_json = schedule_json[session_key]
        groups: list[list[int]] = []
        for group_idx in range(NUM_GROUPS):
            people = []
            for person in session_json[legacy_group_id(group_idx)]:
                suffix = person.removeprefix("golfer_")
                people.append(int(suffix) - 1)
            groups.append(people)
        schedule.append(groups)
    return schedule


class PlantedModel:
    def __init__(self, oracle: list[list[list[int]]]) -> None:
        self.oracle = oracle
        rng = random.Random(SEED)
        self.real_person_by_oracle = list(range(NUM_PEOPLE))
        rng.shuffle(self.real_person_by_oracle)
        self.real_session_by_oracle = list(range(NUM_SESSIONS))
        rng.shuffle(self.real_session_by_oracle)
        self.real_group_by_oracle_group_by_real_session = []
        for _ in range(NUM_SESSIONS):
            perm = list(range(NUM_GROUPS))
            rng.shuffle(perm)
            self.real_group_by_oracle_group_by_real_session.append(perm)
        self._slot_by_pair = self._build_pair_meeting_index()

    def real_person(self, oracle_person: int) -> str:
        return person_id(self.real_person_by_oracle[oracle_person])

    def real_session(self, oracle_session: int) -> int:
        return self.real_session_by_oracle[oracle_session]

    def real_group(self, oracle_session: int, oracle_group: int) -> str:
        real_session = self.real_session(oracle_session)
        return group_id(self.real_group_by_oracle_group_by_real_session[real_session][oracle_group])

    def real_people_in_slot(self, oracle_session: int, oracle_group: int) -> list[str]:
        return [self.real_person(p) for p in self.oracle[oracle_session][oracle_group]]

    def _build_pair_meeting_index(self) -> dict[tuple[int, int], int]:
        pair_session: dict[tuple[int, int], int] = {}
        for session_idx, session in enumerate(self.oracle):
            for group in session:
                for i, left in enumerate(group):
                    for right in group[i + 1 :]:
                        pair_session[tuple(sorted((left, right)))] = session_idx
        return pair_session

    def meeting_session(self, left: int, right: int) -> int:
        return self._slot_by_pair[tuple(sorted((left, right)))]

    def apart_sessions(self, left: int, right: int) -> list[int]:
        meet = self.meeting_session(left, right)
        return [session for session in range(NUM_SESSIONS) if session != meet]


def base_solver() -> dict[str, Any]:
    return {
        "solver_type": "SimulatedAnnealing",
        "stop_conditions": {
            "max_iterations": 2_000_000,
            "time_limit_seconds": 300,
            "no_improvement_iterations": 1_000_000,
        },
        "solver_params": {
            "solver_type": "SimulatedAnnealing",
            "initial_temperature": 50.0,
            "final_temperature": 0.001,
            "cooling_schedule": "geometric",
        },
        "logging": {
            "log_frequency": 10000,
            "log_initial_state": False,
            "log_duration_and_score": False,
            "display_final_schedule": False,
            "log_initial_score_breakdown": False,
            "log_final_score_breakdown": False,
            "log_stop_condition": False,
        },
        "seed": 1691314,
    }


def base_people(model: PlantedModel) -> list[dict[str, Any]]:
    # Attributes are assigned from oracle-person structure then hidden behind the real-person
    # permutation. Attribute-balance constraints below derive their expected counts from the same
    # hidden oracle groups, so the cases are feasible without exposing the mapping.
    people_by_real = {}
    tracks = ["red", "blue", "green", "yellow"]
    regions = ["north", "south", "east"]
    roles = ["alpha", "beta", "gamma", "delta", "epsilon"]
    for oracle_person in range(NUM_PEOPLE):
        real_idx = model.real_person_by_oracle[oracle_person]
        people_by_real[real_idx] = {
            "id": person_id(real_idx),
            "attributes": {
                "relabel_cohort": "A" if oracle_person % 2 == 0 else "B",
                "relabel_track": tracks[oracle_person % len(tracks)],
                "relabel_region": regions[(oracle_person // NUM_GROUPS) % len(regions)],
                "relabel_role": roles[(oracle_person * 7 + 3) % len(roles)],
            },
        }
    return [people_by_real[idx] for idx in range(NUM_PEOPLE)]


def base_groups() -> list[dict[str, Any]]:
    return [{"id": group_id(idx), "size": GROUP_SIZE} for idx in range(NUM_GROUPS)]


def apply_attendance(people: list[dict[str, Any]], absences: list[tuple[str, int]]) -> None:
    absent_by_person: dict[str, set[int]] = defaultdict(set)
    for pid, session in absences:
        absent_by_person[pid].add(session)
    people_by_id = {person["id"]: person for person in people}
    for pid, absent_sessions in absent_by_person.items():
        people_by_id[pid]["sessions"] = [
            session for session in range(NUM_SESSIONS) if session not in absent_sessions
        ]


def with_session_sizes(groups: list[dict[str, Any]], capacities: dict[tuple[int, str], int]) -> None:
    for group in groups:
        sizes = [GROUP_SIZE] * NUM_SESSIONS
        changed = False
        for (session, gid), capacity in capacities.items():
            if gid == group["id"]:
                sizes[session] = capacity
                changed = True
        if changed:
            group["session_sizes"] = sizes


def repeat_constraint() -> dict[str, Any]:
    return {
        "type": "RepeatEncounter",
        "max_allowed_encounters": 1,
        "penalty_function": "squared",
        "penalty_weight": 3.0,
    }


def immovable_constraints(model: PlantedModel, *, singles: int, multis: int, start: int = 0) -> list[dict[str, Any]]:
    constraints: list[dict[str, Any]] = []
    for idx in range(multis):
        oracle_session = (start + idx * 3) % NUM_SESSIONS
        oracle_group = (start + idx * 5 + 2) % NUM_GROUPS
        people = model.real_people_in_slot(oracle_session, oracle_group)[idx % 4 : idx % 4 + 2]
        constraints.append(
            {
                "type": "ImmovablePeople",
                "people": people,
                "group_id": model.real_group(oracle_session, oracle_group),
                "sessions": [model.real_session(oracle_session)],
            }
        )
    for idx in range(singles):
        oracle_session = (start + idx) % NUM_SESSIONS
        oracle_group = (start * 2 + idx * 7 + 1) % NUM_GROUPS
        oracle_person = model.oracle[oracle_session][oracle_group][(idx * 3 + 1) % GROUP_SIZE]
        constraints.append(
            {
                "type": "ImmovablePerson",
                "person_id": model.real_person(oracle_person),
                "group_id": model.real_group(oracle_session, oracle_group),
                "sessions": [model.real_session(oracle_session)],
            }
        )
    return constraints


def clique_constraints(model: PlantedModel, *, count: int, start: int = 0) -> list[dict[str, Any]]:
    constraints = []
    for idx in range(count):
        oracle_session = (start + idx * 2) % NUM_SESSIONS
        oracle_group = (start + idx * 3 + 4) % NUM_GROUPS
        size = 3 if idx % 3 else 4
        offset = (idx * 2) % (GROUP_SIZE - size)
        people = model.real_people_in_slot(oracle_session, oracle_group)[offset : offset + size]
        constraints.append(
            {
                "type": "MustStayTogether",
                "people": people,
                "sessions": [model.real_session(oracle_session)],
            }
        )
    return constraints


def hard_apart_constraints(model: PlantedModel, *, count: int, start: int = 0) -> list[dict[str, Any]]:
    constraints = []
    for idx in range(count):
        left = (start * 11 + idx * 17 + 5) % NUM_PEOPLE
        right = (left + 37 + idx * 19) % NUM_PEOPLE
        if left == right:
            right = (right + 1) % NUM_PEOPLE
        apart = model.apart_sessions(left, right)
        oracle_sessions = [apart[(idx + delta * 3) % len(apart)] for delta in range(4)]
        constraints.append(
            {
                "type": "MustStayApart",
                "people": [model.real_person(left), model.real_person(right)],
                "sessions": sorted(model.real_session(session) for session in oracle_sessions),
            }
        )
    return constraints


def attribute_balance_constraints(
    model: PlantedModel,
    *,
    count: int,
    start: int = 0,
    active_by_person: dict[str, set[int]] | None = None,
) -> list[dict[str, Any]]:
    constraints = []
    attr_keys = ["relabel_cohort", "relabel_track", "relabel_region", "relabel_role"]
    people = {person["id"]: person for person in base_people(model)}
    for idx in range(count):
        oracle_session = (start + idx * 3) % NUM_SESSIONS
        real_session = model.real_session(oracle_session)
        oracle_group = (start + idx * 5 + 6) % NUM_GROUPS
        attr_key = attr_keys[idx % len(attr_keys)]
        counts: dict[str, int] = defaultdict(int)
        for pid in model.real_people_in_slot(oracle_session, oracle_group):
            if active_by_person is not None and real_session not in active_by_person[pid]:
                continue
            counts[people[pid]["attributes"][attr_key]] += 1
        constraints.append(
            {
                "type": "AttributeBalance",
                "group_id": model.real_group(oracle_session, oracle_group),
                "attribute_key": attr_key,
                "desired_values": dict(sorted(counts.items())),
                "penalty_weight": 4.0 + (idx % 3),
                "mode": "exact",
                "sessions": [real_session],
            }
        )
    return constraints


def pair_meeting_constraints(model: PlantedModel, *, count: int, start: int = 0) -> list[dict[str, Any]]:
    constraints = []
    for idx in range(count):
        left = (start * 13 + idx * 23 + 2) % NUM_PEOPLE
        right = (left + 41 + idx * 7) % NUM_PEOPLE
        if left == right:
            right = (right + 1) % NUM_PEOPLE
        meet = model.meeting_session(left, right)
        apart = model.apart_sessions(left, right)
        if idx % 4 == 0:
            selected = [apart[(idx + delta * 2) % len(apart)] for delta in range(3)]
            target = 0
        else:
            selected = [meet] + [apart[(idx + delta * 4) % len(apart)] for delta in range(2)]
            target = 1
        constraints.append(
            {
                "type": "PairMeetingCount",
                "people": [model.real_person(left), model.real_person(right)],
                "sessions": sorted(model.real_session(session) for session in selected),
                "target_meetings": target,
                "mode": "exact",
                "penalty_weight": 5.0,
            }
        )
    return constraints


def soft_pair_constraints(model: PlantedModel, *, count: int, start: int = 0) -> list[dict[str, Any]]:
    constraints = []
    for idx in range(count):
        left = (start * 29 + idx * 31 + 7) % NUM_PEOPLE
        right = (left + 53 + idx * 11) % NUM_PEOPLE
        if left == right:
            right = (right + 1) % NUM_PEOPLE
        if idx % 2 == 0:
            meet = model.meeting_session(left, right)
            constraints.append(
                {
                    "type": "ShouldStayTogether",
                    "people": [model.real_person(left), model.real_person(right)],
                    "penalty_weight": 3.0,
                    "sessions": [model.real_session(meet)],
                }
            )
        else:
            apart = model.apart_sessions(left, right)
            selected = [apart[(idx + delta * 5) % len(apart)] for delta in range(3)]
            constraints.append(
                {
                    "type": "ShouldNotBeTogether",
                    "people": [model.real_person(left), model.real_person(right)],
                    "penalty_weight": 3.0,
                    "sessions": sorted(model.real_session(session) for session in selected),
                }
            )
    return constraints


def partial_absences(model: PlantedModel, *, count: int, start: int = 0) -> list[tuple[str, int]]:
    absences = []
    used: set[tuple[str, int]] = set()
    for idx in range(count):
        oracle_session = (start + idx * 5) % NUM_SESSIONS
        oracle_group = (start + idx * 7 + 3) % NUM_GROUPS
        oracle_person = model.oracle[oracle_session][oracle_group][(idx * 4 + 2) % GROUP_SIZE]
        absence = (model.real_person(oracle_person), model.real_session(oracle_session))
        if absence not in used:
            absences.append(absence)
            used.add(absence)
    return absences


def active_sessions_by_person_after_absences(
    people: list[dict[str, Any]], absences: list[tuple[str, int]]
) -> dict[str, set[int]]:
    active = {person["id"]: set(range(NUM_SESSIONS)) for person in people}
    for pid, session in absences:
        active[pid].discard(session)
    return active


def capacity_variation(model: PlantedModel, *, count: int, start: int = 0, include_lower: bool = False) -> tuple[dict[tuple[int, str], int], list[tuple[str, int]]]:
    capacities: dict[tuple[int, str], int] = {}
    absences: list[tuple[str, int]] = []
    for idx in range(count):
        oracle_session = (start + idx * 4) % NUM_SESSIONS
        oracle_group = (start + idx * 6 + 1) % NUM_GROUPS
        real_session = model.real_session(oracle_session)
        real_group = model.real_group(oracle_session, oracle_group)
        if include_lower and idx % 2 == 0:
            capacities[(real_session, real_group)] = GROUP_SIZE - 1
            oracle_person = model.oracle[oracle_session][oracle_group][(idx * 3) % GROUP_SIZE]
            absences.append((model.real_person(oracle_person), real_session))
        else:
            capacities[(real_session, real_group)] = GROUP_SIZE + 1
    return capacities, absences


def scenario_parts(model: PlantedModel, case_kind: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    people = base_people(model)
    groups = base_groups()
    constraints = [repeat_constraint()]
    absences: list[tuple[str, int]] = []
    capacities: dict[tuple[int, str], int] = {}

    if case_kind == "immovable":
        constraints += immovable_constraints(model, singles=14, multis=6)
    elif case_kind == "partial_attendance":
        absences += partial_absences(model, count=26)
    elif case_kind == "capacity_variation":
        capacities.update(capacity_variation(model, count=10, include_lower=False)[0])
    elif case_kind == "cliques":
        constraints += clique_constraints(model, count=14)
    elif case_kind == "hard_apart":
        constraints += hard_apart_constraints(model, count=24)
    elif case_kind == "attribute_balance":
        constraints += attribute_balance_constraints(model, count=16)
    elif case_kind == "pair_meeting":
        constraints += pair_meeting_constraints(model, count=20)
    elif case_kind == "soft_pairs":
        constraints += soft_pair_constraints(model, count=24)
    elif case_kind == "mixed_light":
        constraints += immovable_constraints(model, singles=6, multis=2, start=1)
        constraints += clique_constraints(model, count=5, start=2)
        constraints += hard_apart_constraints(model, count=8, start=3)
        constraints += attribute_balance_constraints(model, count=5, start=4)
        constraints += pair_meeting_constraints(model, count=5, start=5)
    elif case_kind == "mixed_structural":
        cap, cap_absences = capacity_variation(model, count=8, start=2, include_lower=True)
        capacities.update(cap)
        absences += cap_absences
        absences += partial_absences(model, count=18, start=6)
        constraints += immovable_constraints(model, singles=5, multis=2, start=7)
    elif case_kind == "mixed_full":
        cap, cap_absences = capacity_variation(model, count=8, start=5, include_lower=True)
        capacities.update(cap)
        absences += cap_absences
        absences += partial_absences(model, count=20, start=4)
        constraints += immovable_constraints(model, singles=8, multis=3, start=2)
        constraints += clique_constraints(model, count=6, start=3)
        constraints += hard_apart_constraints(model, count=10, start=4)
        constraints += attribute_balance_constraints(
            model,
            count=8,
            start=5,
            active_by_person=active_sessions_by_person_after_absences(people, absences),
        )
        constraints += pair_meeting_constraints(model, count=8, start=6)
        constraints += soft_pair_constraints(model, count=8, start=7)
    else:
        raise ValueError(f"unknown case kind {case_kind}")

    apply_attendance(people, absences)
    with_session_sizes(groups, capacities)
    return people, groups, constraints


def case_manifest(model: PlantedModel, case_kind: str, title: str, description: str) -> dict[str, Any]:
    people, groups, constraints = scenario_parts(model, case_kind)
    case_id = f"stretch.relabeling-projection-13x13x14-{case_kind.replace('_', '-')}"
    tags = BASE_TAGS + ["relabeling-projection-suite", case_kind.replace("_", "-")]
    if case_kind.startswith("mixed"):
        tags.append("mixed-constraints")
    manifest = {
        "schema_version": 1,
        "id": case_id,
        "class": "stretch",
        "case_role": "helper",
        "canonical_case_id": CANONICAL_CASE_ID,
        "purpose": f"diagnostic_target.constraint_aware_relabeling_projection.{case_kind}",
        "provenance": (
            "generated_by_tools/benchmarking/generate_relabeling_projection_cases.py "
            "from a fixed solver6 13x13x14 zero-repeat oracle, then hidden person/session/"
            f"group-slot relabeling seed {SEED} planted this constraint family"
        ),
        "declared_budget": {"max_iterations": 40_000_000, "time_limit_seconds": 300},
        "tags": tags,
        "title": title,
        "description": description,
        "input": {
            "problem": {
                "people": people,
                "groups": groups,
                "num_sessions": NUM_SESSIONS,
            },
            "constraints": constraints,
            "objectives": [{"type": "maximize_unique_contacts", "weight": 1.0}],
            "solver": base_solver(),
            "initial_schedule": None,
        },
    }
    return manifest


def write_suite(path: Path, case_files: list[Path]) -> None:
    lines = [
        "schema_version: 1",
        "suite_id: solver3-relabeling-projection",
        "benchmark_mode: full_solve",
        "comparison_category: score_quality",
        "case_selection_policy: allow_non_canonical",
        "class: stretch",
        "timeout_policy: complexity_based_wall_time",
        "solver_policy: solver3_construct_then_search",
        "solver3_relabeling_projection:",
        "  enabled: true",
        "  relabeling_timeout_seconds: 5.0",
        "title: Solver3 relabeling projection diagnostic suite",
        "description: Diagnostic 13x13x14 SGP-shaped cases with constraints planted from a fixed solver6 oracle under hidden relabelings. The suite exercises constraint-aware oracle projection/relabeling without joining the canonical broad score lane. Cases are not scaled down to fit the current naive implementation.",
        "cases:",
    ]
    suite_dir = path.parent
    for case_file in case_files:
        rel = os.path.relpath(case_file, suite_dir).replace(os.sep, "/")
        lines.append(f"  - manifest: {rel}")
    path.write_text("\n".join(lines) + "\n")


def main() -> None:
    args = parse_args()
    oracle = parse_oracle_schedule(args.solver6_output)
    model = PlantedModel(oracle)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    case_files = []
    for case_kind, title, description in CASE_DEFS:
        manifest = case_manifest(model, case_kind, title, description)
        path = args.output_dir / f"{case_kind}.json"
        path.write_text(json.dumps(manifest, indent=2, sort_keys=False) + "\n")
        case_files.append(path)
    args.suite_path.parent.mkdir(parents=True, exist_ok=True)
    write_suite(args.suite_path, case_files)


if __name__ == "__main__":
    main()
