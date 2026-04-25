#!/usr/bin/env python3
"""Generate pair-sensitive relabeling projection benchmark cases.

The original relabeling projection suite uses a 13x13x14 complete/perfect SGP oracle. That is
excellent for session/group/slot symmetry, but weak for pair-family constraints because every pair
meets exactly once over the full horizon. This generator creates supplemental diagnostic cases from
non-complete oracle horizons, so hard-apart, pair-meeting, and soft-pair constraints are not mostly
constant under relabeling.

Generated shapes:

- 13x13x10: first ten parallel classes from the affine plane over F_13. Many pairs never meet in
  the observed horizon, while all meeting pairs still meet at most once.
- 6x6x3: small cyclic line schedule over Z_6 x Z_6 for fast pair-sensitive microdiagnostics.

The cases still use hidden deterministic person/session/group relabeling and planted constraints;
no benchmark runner depends on the generator at runtime.
"""

from __future__ import annotations

import argparse
import json
import os
import random
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

SEED = 90210
OUTPUT_DIR = Path("backend/benchmarking/cases/stretch/relabeling_projection_pair_sensitive")
NEW_SUITE_PATH = Path("backend/benchmarking/suites/solver3-relabeling-projection-pair-sensitive.yaml")
LEGACY_SUITE_PATH = Path(
    "backend/benchmarking/suites/solver3-relabeling-projection-pair-sensitive-legacy.yaml"
)

CASE_DEFS = [
    (
        "hard_apart",
        "hard-apart graph over non-complete pair horizon",
        "Full-horizon planted must-stay-apart pairs selected from oracle pairs that never meet.",
    ),
    (
        "pair_meeting",
        "pair-meeting counts over non-complete pair horizon",
        "Exact pair-meeting counts mixing full-horizon target-0 never-pairs and target-1 meeting-pairs.",
    ),
    (
        "soft_pairs",
        "soft pair preferences over non-complete pair horizon",
        "Should-together and should-not-together preferences that are not constant over the truncated oracle horizon.",
    ),
    (
        "pair_mixed",
        "mixed pair-sensitive constraints",
        "A planted mix of pair-family constraints plus light immovable anchors to expose relabeling/projection mistakes.",
    ),
]


@dataclass(frozen=True)
class Shape:
    slug: str
    groups: int
    group_size: int
    sessions: int
    canonical_case_id: str
    title: str

    @property
    def people(self) -> int:
        return self.groups * self.group_size


SHAPES = [
    Shape(
        slug="13x13x10",
        groups=13,
        group_size=13,
        sessions=10,
        canonical_case_id="diagnostic.social-golfer-13x13x10-truncated-affine",
        title="13x13x10 truncated affine SGP",
    ),
    Shape(
        slug="6x6x3",
        groups=6,
        group_size=6,
        sessions=3,
        canonical_case_id="diagnostic.social-golfer-6x6x3-cyclic",
        title="6x6x3 cyclic SGP microcase",
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_DIR,
        help="Directory for generated benchmark case JSON files.",
    )
    parser.add_argument(
        "--new-suite-path",
        type=Path,
        default=NEW_SUITE_PATH,
        help="Suite manifest path for the constraint-aware projection lane.",
    )
    parser.add_argument(
        "--legacy-suite-path",
        type=Path,
        default=LEGACY_SUITE_PATH,
        help="Suite manifest path for the legacy projection control lane.",
    )
    return parser.parse_args()


def person_id(shape: Shape, real_idx: int) -> str:
    return f"pair_{shape.slug.replace('x', '_')}_p{real_idx + 1:03d}"


def group_id(shape: Shape, real_group_idx: int) -> str:
    return f"pair_{shape.slug.replace('x', '_')}_g{real_group_idx + 1:02d}"


def affine_prime_schedule(q: int, sessions: int) -> list[list[list[int]]]:
    """Return the first `sessions` slope classes from the affine plane over F_q."""
    if sessions > q + 1:
        raise ValueError(f"affine plane over F_{q} only has {q + 1} parallel classes")
    schedule: list[list[list[int]]] = []

    def point(x: int, y: int) -> int:
        return x * q + y

    # Use finite slopes first, then the vertical class if requested. Any prefix preserves the
    # at-most-one-meeting property while intentionally leaving many pairs uncovered.
    for slope in range(min(sessions, q)):
        session: list[list[int]] = []
        for intercept in range(q):
            group = [point(x, (slope * x + intercept) % q) for x in range(q)]
            session.append(group)
        schedule.append(session)
    if sessions > q:
        vertical_session = [[point(x, y) for y in range(q)] for x in range(q)]
        schedule.append(vertical_session)
    return schedule


def cyclic_square_schedule(n: int, sessions: int) -> list[list[list[int]]]:
    """Return a small non-complete line schedule over Z_n x Z_n.

    The first three classes are vertical, horizontal, and slope-1 cyclic diagonals. For n=6 these
    classes partition the 36 people and distinct pairs meet at most once across the selected classes.
    """
    if sessions > 3:
        raise ValueError("cyclic square helper currently defines three classes")

    def point(x: int, y: int) -> int:
        return x * n + y

    classes: list[list[list[int]]] = []
    classes.append([[point(x, y) for y in range(n)] for x in range(n)])
    classes.append([[point(x, y) for x in range(n)] for y in range(n)])
    classes.append([[point(x, (intercept - x) % n) for x in range(n)] for intercept in range(n)])
    return classes[:sessions]


def oracle_schedule(shape: Shape) -> list[list[list[int]]]:
    if shape.slug == "13x13x10":
        return affine_prime_schedule(13, shape.sessions)
    if shape.slug == "6x6x3":
        return cyclic_square_schedule(6, shape.sessions)
    raise ValueError(f"unknown shape {shape.slug}")


class PlantedModel:
    def __init__(self, shape: Shape, oracle: list[list[list[int]]]) -> None:
        self.shape = shape
        self.oracle = oracle
        rng = random.Random(f"{SEED}:{shape.slug}")
        self.real_person_by_oracle = list(range(shape.people))
        rng.shuffle(self.real_person_by_oracle)
        self.real_session_by_oracle = list(range(shape.sessions))
        rng.shuffle(self.real_session_by_oracle)
        self.real_group_by_oracle_group_by_real_session = []
        for _ in range(shape.sessions):
            perm = list(range(shape.groups))
            rng.shuffle(perm)
            self.real_group_by_oracle_group_by_real_session.append(perm)
        self._meeting_sessions_by_pair = self._build_pair_meeting_index()
        self.meeting_pairs = sorted(
            pair for pair, sessions in self._meeting_sessions_by_pair.items() if sessions
        )
        self.never_pairs = sorted(
            pair for pair, sessions in self._meeting_sessions_by_pair.items() if not sessions
        )

    def real_person(self, oracle_person: int) -> str:
        return person_id(self.shape, self.real_person_by_oracle[oracle_person])

    def real_session(self, oracle_session: int) -> int:
        return self.real_session_by_oracle[oracle_session]

    def real_group(self, oracle_session: int, oracle_group: int) -> str:
        real_session = self.real_session(oracle_session)
        return group_id(
            self.shape,
            self.real_group_by_oracle_group_by_real_session[real_session][oracle_group],
        )

    def real_people_in_slot(self, oracle_session: int, oracle_group: int) -> list[str]:
        return [self.real_person(p) for p in self.oracle[oracle_session][oracle_group]]

    def _build_pair_meeting_index(self) -> dict[tuple[int, int], list[int]]:
        pair_sessions: dict[tuple[int, int], list[int]] = {
            (left, right): []
            for left in range(self.shape.people)
            for right in range(left + 1, self.shape.people)
        }
        for session_idx, session in enumerate(self.oracle):
            for group in session:
                for idx, left in enumerate(group):
                    for right in group[idx + 1 :]:
                        pair_sessions[tuple(sorted((left, right)))].append(session_idx)
        repeated = {pair: sessions for pair, sessions in pair_sessions.items() if len(sessions) > 1}
        if repeated:
            sample = next(iter(repeated.items()))
            raise ValueError(f"oracle has repeated pair meeting {sample}")
        return pair_sessions

    def meeting_sessions(self, left: int, right: int) -> list[int]:
        return self._meeting_sessions_by_pair[tuple(sorted((left, right)))]

    def all_real_sessions(self) -> list[int]:
        return sorted(self.real_session(session) for session in range(self.shape.sessions))


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
    people_by_real = {}
    cohorts = ["red", "blue", "green"]
    tracks = ["alpha", "beta", "gamma", "delta"]
    for oracle_person in range(model.shape.people):
        real_idx = model.real_person_by_oracle[oracle_person]
        people_by_real[real_idx] = {
            "id": person_id(model.shape, real_idx),
            "attributes": {
                "pair_shape": model.shape.slug,
                "pair_cohort": cohorts[oracle_person % len(cohorts)],
                "pair_track": tracks[(oracle_person * 5 + 1) % len(tracks)],
            },
        }
    return [people_by_real[idx] for idx in range(model.shape.people)]


def base_groups(shape: Shape) -> list[dict[str, Any]]:
    return [{"id": group_id(shape, idx), "size": shape.group_size} for idx in range(shape.groups)]


def repeat_constraint() -> dict[str, Any]:
    return {
        "type": "RepeatEncounter",
        "max_allowed_encounters": 1,
        "penalty_function": "squared",
        "penalty_weight": 3.0,
    }


def cycle_pairs(pairs: list[tuple[int, int]], count: int, *, start: int = 0) -> Iterable[tuple[int, int]]:
    if not pairs:
        raise ValueError("cannot select from empty pair set")
    for idx in range(count):
        yield pairs[(start + idx * 17) % len(pairs)]


def immovable_constraints(model: PlantedModel, *, singles: int, start: int = 0) -> list[dict[str, Any]]:
    constraints: list[dict[str, Any]] = []
    for idx in range(singles):
        oracle_session = (start + idx * 2) % model.shape.sessions
        oracle_group = (start * 3 + idx * 5 + 1) % model.shape.groups
        oracle_person = model.oracle[oracle_session][oracle_group][
            (idx * 3 + 1) % model.shape.group_size
        ]
        constraints.append(
            {
                "type": "ImmovablePerson",
                "person_id": model.real_person(oracle_person),
                "group_id": model.real_group(oracle_session, oracle_group),
                "sessions": [model.real_session(oracle_session)],
            }
        )
    return constraints


def hard_apart_constraints(model: PlantedModel, *, count: int, start: int = 0) -> list[dict[str, Any]]:
    constraints = []
    for left, right in cycle_pairs(model.never_pairs, count, start=start):
        constraints.append(
            {
                "type": "MustStayApart",
                "people": [model.real_person(left), model.real_person(right)],
                "sessions": model.all_real_sessions(),
            }
        )
    return constraints


def pair_meeting_constraints(model: PlantedModel, *, count: int, start: int = 0) -> list[dict[str, Any]]:
    constraints = []
    half = count // 2
    for left, right in cycle_pairs(model.meeting_pairs, half, start=start):
        constraints.append(
            {
                "type": "PairMeetingCount",
                "people": [model.real_person(left), model.real_person(right)],
                "sessions": model.all_real_sessions(),
                "target_meetings": 1,
                "mode": "exact",
                "penalty_weight": 5.0,
            }
        )
    for left, right in cycle_pairs(model.never_pairs, count - half, start=start + 11):
        constraints.append(
            {
                "type": "PairMeetingCount",
                "people": [model.real_person(left), model.real_person(right)],
                "sessions": model.all_real_sessions(),
                "target_meetings": 0,
                "mode": "exact",
                "penalty_weight": 5.0,
            }
        )
    return constraints


def soft_pair_constraints(model: PlantedModel, *, count: int, start: int = 0) -> list[dict[str, Any]]:
    constraints = []
    half = count // 2
    for left, right in cycle_pairs(model.meeting_pairs, half, start=start):
        constraints.append(
            {
                "type": "ShouldStayTogether",
                "people": [model.real_person(left), model.real_person(right)],
                "penalty_weight": 3.0,
                "sessions": model.all_real_sessions(),
            }
        )
    for left, right in cycle_pairs(model.never_pairs, count - half, start=start + 23):
        constraints.append(
            {
                "type": "ShouldNotBeTogether",
                "people": [model.real_person(left), model.real_person(right)],
                "penalty_weight": 3.0,
                "sessions": model.all_real_sessions(),
            }
        )
    return constraints


def constraint_count(shape: Shape, large: int, small: int) -> int:
    return large if shape.slug == "13x13x10" else small


def scenario_parts(
    model: PlantedModel, case_kind: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    people = base_people(model)
    groups = base_groups(model.shape)
    constraints = [repeat_constraint()]

    if case_kind == "hard_apart":
        constraints += hard_apart_constraints(
            model, count=constraint_count(model.shape, 28, 10), start=3
        )
        constraints += immovable_constraints(model, singles=constraint_count(model.shape, 8, 3), start=1)
    elif case_kind == "pair_meeting":
        constraints += pair_meeting_constraints(
            model, count=constraint_count(model.shape, 32, 12), start=5
        )
        constraints += immovable_constraints(model, singles=constraint_count(model.shape, 8, 3), start=2)
    elif case_kind == "soft_pairs":
        constraints += soft_pair_constraints(
            model, count=constraint_count(model.shape, 32, 12), start=7
        )
        constraints += immovable_constraints(model, singles=constraint_count(model.shape, 8, 3), start=3)
    elif case_kind == "pair_mixed":
        constraints += hard_apart_constraints(
            model, count=constraint_count(model.shape, 14, 5), start=11
        )
        constraints += pair_meeting_constraints(
            model, count=constraint_count(model.shape, 18, 8), start=13
        )
        constraints += soft_pair_constraints(
            model, count=constraint_count(model.shape, 18, 8), start=17
        )
        constraints += immovable_constraints(model, singles=constraint_count(model.shape, 12, 4), start=5)
    else:
        raise ValueError(f"unknown case kind {case_kind}")

    return people, groups, constraints


def case_manifest(
    model: PlantedModel, case_kind: str, title_suffix: str, description: str
) -> dict[str, Any]:
    people, groups, constraints = scenario_parts(model, case_kind)
    case_slug = case_kind.replace("_", "-")
    case_id = f"stretch.relabeling-projection-pair-sensitive-{model.shape.slug}-{case_slug}"
    tags = [
        "stretch",
        "diagnostic",
        "relabeling",
        "projection",
        "constraint-aware-projection",
        "oracle-planted",
        "social-golfer",
        "sgp",
        model.shape.slug,
        "pair-sensitive",
        case_slug,
    ]
    if case_kind == "pair_mixed":
        tags.append("mixed-constraints")
    return {
        "schema_version": 1,
        "id": case_id,
        "class": "stretch",
        "case_role": "helper",
        "canonical_case_id": model.shape.canonical_case_id,
        "purpose": f"diagnostic_target.constraint_aware_relabeling_projection.pair_sensitive.{case_kind}",
        "provenance": (
            "generated_by_tools/benchmarking/generate_pair_sensitive_relabeling_projection_cases.py "
            f"from a fixed {model.shape.slug} non-complete SGP oracle, then hidden person/session/"
            f"group-slot relabeling seed {SEED} planted pair-sensitive constraints"
        ),
        "declared_budget": {"max_iterations": 20_000_000, "time_limit_seconds": 300},
        "tags": tags,
        "title": f"Relabeling projection pair-sensitive {model.shape.slug} — {title_suffix}",
        "description": f"{model.shape.title}: {description}",
        "input": {
            "problem": {
                "people": people,
                "groups": groups,
                "num_sessions": model.shape.sessions,
            },
            "constraints": constraints,
            "objectives": [{"type": "maximize_unique_contacts", "weight": 1.0}],
            "solver": base_solver(),
            "initial_schedule": None,
        },
    }


def write_suite(path: Path, case_files: list[Path], *, enabled: bool) -> None:
    suite_id = path.stem
    lines = [
        "schema_version: 1",
        f"suite_id: {suite_id}",
        "benchmark_mode: full_solve",
        "comparison_category: score_quality",
        "case_selection_policy: allow_non_canonical",
        "class: stretch",
        "timeout_policy: complexity_based_wall_time",
        "solver_policy: solver3_construct_then_search",
        "solver3_relabeling_projection:",
        f"  enabled: {str(enabled).lower()}",
        "  relabeling_timeout_seconds: 5.0",
        "title: Solver3 relabeling projection pair-sensitive diagnostic suite",
        "description: Supplemental non-complete SGP-shaped relabeling cases where hard-apart, pair-meeting, and soft-pair constraints are not constant over a perfect full horizon.",
        "cases:",
    ]
    suite_dir = path.parent
    for case_file in case_files:
        rel = os.path.relpath(case_file, suite_dir).replace(os.sep, "/")
        lines.append(f"  - manifest: {rel}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n")


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    case_files: list[Path] = []
    for shape in SHAPES:
        model = PlantedModel(shape, oracle_schedule(shape))
        for case_kind, title_suffix, description in CASE_DEFS:
            manifest = case_manifest(model, case_kind, title_suffix, description)
            path = args.output_dir / f"{shape.slug}_{case_kind}.json"
            path.write_text(json.dumps(manifest, indent=2, sort_keys=False) + "\n")
            case_files.append(path)
    write_suite(args.new_suite_path, case_files, enabled=True)
    write_suite(args.legacy_suite_path, case_files, enabled=False)


if __name__ == "__main__":
    main()
