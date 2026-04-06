#!/usr/bin/env python3
"""Generate a planted-feasible synthetic stretch benchmark.

This builder intentionally targets a gap in the current benchmark portfolio:
large heterogeneous scenarios that combine

- heavy partial participation with non-contiguous attendance masks
- strongly session-specific group capacities
- many session-scoped constraints

The script is deterministic and uses a planted-feasible schedule construction:
1. define attendance masks and per-session capacities
2. reserve anchors / cliques / buddy pairs / session-scoped immovables
3. fill the remaining schedule greedily while favoring new contacts
4. derive the benchmark manifest from the planted-feasible scenario

The planted schedule itself is *not* checked into the benchmark manifest. It is
only used during generation to ensure the synthetic case is honestly feasible.
"""

from __future__ import annotations

import argparse
import copy
import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

CASE_ID = "stretch.synthetic-partial-attendance-capacity-pressure-152p"
TITLE = "Synthetic partial-attendance capacity-pressure stretch"
DESCRIPTION = (
    "Deterministic planted-feasible synthetic stretch workload with heavy non-contiguous "
    "partial attendance, strongly session-specific capacities, and dense session-scoped "
    "constraint pressure."
)
NUM_SESSIONS = 6
GROUP_IDS = [f"crew_{index:02d}" for index in range(12)]
GROUP_SIZE_BASELINE = 8
CAPACITY_SLACK_PER_SESSION = 0
TIME_BUDGET_SECONDS = 15
FIXED_TIME_MAX_ITERATIONS = 4_500_000
DIAGNOSTIC_ITERATIONS = 260_000
DIAGNOSTIC_TIME_LIMIT_SECONDS = 25

MASK_SPECS: List[Tuple[str, Sequence[int], int]] = [
    ("full_core", [0, 1, 2, 3, 4, 5], 24),
    ("arrival_wave_a", [0, 1, 4, 5], 18),
    ("bridge_024", [0, 2, 4], 16),
    ("bridge_125", [1, 2, 5], 16),
    ("bridge_035", [0, 3, 5], 12),
    ("bridge_134", [1, 3, 4], 12),
    ("bridge_235", [2, 3, 5], 12),
    ("bridge_0235", [0, 2, 3, 5], 12),
    ("bridge_124", [1, 2, 4], 10),
    ("bridge_0134", [0, 1, 3, 4], 8),
    ("arrival_wave_b", [1, 4, 5], 6),
    ("bridge_025", [0, 2, 5], 6),
]

CLOSED_GROUPS_BY_SESSION = {
    0: {"crew_11"},
    1: {"crew_10"},
    2: {"crew_09"},
    3: {"crew_02", "crew_08", "crew_11"},
    4: {"crew_07"},
    5: set(),
}

CLIQUE_PLANS = [
    ("bridge_024", 3),
    ("bridge_125", 3),
    ("bridge_035", 3),
    ("bridge_134", 3),
    ("bridge_235", 3),
    ("bridge_0235", 3),
    ("bridge_124", 3),
    ("arrival_wave_a", 4),
]

BUDDY_PLANS = [
    ("arrival_wave_a", 2),
    ("bridge_024", 2),
    ("bridge_125", 2),
    ("bridge_035", 2),
    ("bridge_134", 2),
    ("bridge_235", 2),
    ("bridge_0235", 2),
    ("bridge_124", 2),
]

PARTIAL_IMMOVABLE_MASKS = [
    "arrival_wave_a",
    "bridge_024",
    "bridge_125",
    "bridge_035",
    "bridge_134",
    "bridge_235",
    "bridge_0235",
    "bridge_124",
]

TRACKS = ["ops", "product", "engineering", "design", "data", "community"]
REGIONS = ["europe", "americas", "apac", "africa"]
EXPERIENCE = ["veteran", "advanced", "intermediate", "newcomer"]
GENDERS = ["female", "male", "female", "male", "female", "male", "female", "nonbinary"]


@dataclass(frozen=True)
class PersonSpec:
    person_id: str
    sessions: Tuple[int, ...]
    mask_name: str
    attributes: Dict[str, str]


def session_key(session_index: int) -> str:
    return f"session_{session_index}"


def build_people() -> List[PersonSpec]:
    people: List[PersonSpec] = []
    person_index = 0
    for mask_name, sessions, count in MASK_SPECS:
        for local_index in range(count):
            person_id = f"person_{person_index:03d}"
            attributes = {
                "Gender": GENDERS[person_index % len(GENDERS)],
                "Track": TRACKS[(person_index * 3 + local_index) % len(TRACKS)],
                "Region": REGIONS[(person_index * 5 + local_index) % len(REGIONS)],
                "Experience": EXPERIENCE[(person_index * 7 + local_index) % len(EXPERIENCE)],
                "Attendance Pattern": mask_name,
            }
            role = "member"
            if mask_name == "full_core" and local_index < len(GROUP_IDS):
                role = "lead"
                attributes["Experience"] = "veteran"
            elif (person_index + local_index) % 7 == 0:
                role = "specialist"
            attributes["Role"] = role
            people.append(
                PersonSpec(
                    person_id=person_id,
                    sessions=tuple(sessions),
                    mask_name=mask_name,
                    attributes=attributes,
                )
            )
            person_index += 1
    return people


def attendance_by_session(people: Sequence[PersonSpec]) -> Dict[int, List[str]]:
    by_session: Dict[int, List[str]] = {session: [] for session in range(NUM_SESSIONS)}
    for person in people:
        for session in person.sessions:
            by_session[session].append(person.person_id)
    for attendees in by_session.values():
        attendees.sort()
    return by_session


def build_group_capacities(attendance_counts: Dict[int, int]) -> Dict[str, List[int]]:
    capacities = {group_id: [0] * NUM_SESSIONS for group_id in GROUP_IDS}
    for session in range(NUM_SESSIONS):
        active_groups = [
            group_id
            for group_id in GROUP_IDS
            if group_id not in CLOSED_GROUPS_BY_SESSION[session]
        ]
        for group_id in active_groups:
            capacities[group_id][session] = GROUP_SIZE_BASELINE
        target_total = attendance_counts[session] + CAPACITY_SLACK_PER_SESSION
        extra_slots = target_total - GROUP_SIZE_BASELINE * len(active_groups)
        if extra_slots < 0:
            raise RuntimeError(f"negative extra slot budget in session {session}")
        order = sorted(
            active_groups,
            key=lambda group_id: ((int(group_id.split("_")[1]) * 5) + (session * 3)) % len(GROUP_IDS),
        )
        cursor = 0
        while extra_slots > 0:
            group_id = order[cursor % len(order)]
            capacities[group_id][session] += 1
            extra_slots -= 1
            cursor += 1
    return capacities


class PlantedSchedule:
    def __init__(self, people: Sequence[PersonSpec], capacities: Dict[str, List[int]]):
        self.people = {person.person_id: person for person in people}
        self.capacities = capacities
        self.schedule: Dict[int, Dict[str, List[str]]] = {
            session: {group_id: [] for group_id in GROUP_IDS}
            for session in range(NUM_SESSIONS)
        }
        self.pair_meetings: Dict[Tuple[str, str], int] = defaultdict(int)
        self.reserved_people: set[str] = set()

    def active_sessions_for_group(self, group_id: str) -> List[int]:
        return [s for s, size in enumerate(self.capacities[group_id]) if size > 0]

    def remaining_capacity(self, session: int, group_id: str) -> int:
        return self.capacities[group_id][session] - len(self.schedule[session][group_id])

    def reserve_together(
        self,
        people: Sequence[str],
        sessions: Sequence[int],
        group_id: str,
    ) -> None:
        for session in sessions:
            if self.capacities[group_id][session] == 0:
                raise RuntimeError(
                    f"group {group_id} is closed in session {session} for reservation {people}"
                )
            if self.remaining_capacity(session, group_id) < len(people):
                raise RuntimeError(
                    f"insufficient capacity reserving {people} in {group_id} session {session}"
                )
            current_members = self.schedule[session][group_id]
            for person_id in people:
                if person_id in current_members:
                    raise RuntimeError(f"duplicate reservation for {person_id} in session {session}")
            current_members.extend(people)
            current_members.sort()
        self.reserved_people.update(people)

    def best_group_for_sessions(self, sessions: Sequence[int], seats_needed: int) -> str:
        candidates = []
        for group_id in GROUP_IDS:
            if any(self.capacities[group_id][session] == 0 for session in sessions):
                continue
            remaining = min(self.remaining_capacity(session, group_id) for session in sessions)
            if remaining < seats_needed:
                continue
            total_spare = sum(self.remaining_capacity(session, group_id) for session in sessions)
            candidates.append((remaining, total_spare, -int(group_id.split("_")[1]), group_id))
        if not candidates:
            raise RuntimeError(f"no compatible group available for sessions {sessions}")
        candidates.sort(reverse=True)
        return candidates[0][3]

    def place_reserved_structures(self) -> Dict[str, object]:
        people_by_mask: Dict[str, List[str]] = defaultdict(list)
        for person in self.people.values():
            people_by_mask[person.mask_name].append(person.person_id)
        for mask_people in people_by_mask.values():
            mask_people.sort()

        constraints: List[Dict[str, object]] = []
        anchors: List[Tuple[str, str, List[int]]] = []
        full_core = people_by_mask["full_core"]
        for group_id, person_id in zip(GROUP_IDS, full_core[: len(GROUP_IDS)]):
            sessions = self.active_sessions_for_group(group_id)
            self.reserve_together([person_id], sessions, group_id)
            anchors.append((person_id, group_id, sessions))
            constraints.append(
                {
                    "type": "ImmovablePerson",
                    "person_id": person_id,
                    "group_id": group_id,
                    "sessions": sessions,
                }
            )

        partial_immovables: List[Tuple[str, str, List[int]]] = []
        for mask_name in PARTIAL_IMMOVABLE_MASKS:
            person_id = people_by_mask[mask_name].pop(0)
            sessions = list(self.people[person_id].sessions)
            group_id = self.best_group_for_sessions(sessions, 1)
            self.reserve_together([person_id], sessions, group_id)
            partial_immovables.append((person_id, group_id, sessions))
            constraints.append(
                {
                    "type": "ImmovablePerson",
                    "person_id": person_id,
                    "group_id": group_id,
                    "sessions": sessions,
                }
            )

        cliques: List[Tuple[List[str], List[int], str]] = []
        for mask_name, clique_size in CLIQUE_PLANS:
            clique_people = [people_by_mask[mask_name].pop(0) for _ in range(clique_size)]
            sessions = list(self.people[clique_people[0]].sessions)
            group_id = self.best_group_for_sessions(sessions, clique_size)
            self.reserve_together(clique_people, sessions, group_id)
            cliques.append((clique_people, sessions, group_id))
            constraints.append(
                {
                    "type": "MustStayTogether",
                    "people": clique_people,
                    "sessions": sessions,
                }
            )

        buddies: List[Tuple[List[str], List[int], str]] = []
        for mask_name, buddy_size in BUDDY_PLANS:
            buddy_people = [people_by_mask[mask_name].pop(0) for _ in range(buddy_size)]
            sessions = list(self.people[buddy_people[0]].sessions)
            group_id = self.best_group_for_sessions(sessions, buddy_size)
            self.reserve_together(buddy_people, sessions, group_id)
            buddies.append((buddy_people, sessions, group_id))
            constraints.append(
                {
                    "type": "ShouldStayTogether",
                    "people": buddy_people,
                    "sessions": sessions,
                    "penalty_weight": 35.0,
                }
            )

        return {
            "constraints": constraints,
            "anchors": anchors,
            "partial_immovables": partial_immovables,
            "cliques": cliques,
            "buddies": buddies,
            "people_by_mask": people_by_mask,
        }

    def contact_cost(self, person_id: str, session: int, group_id: str) -> Tuple[int, int, int]:
        seen_members = self.schedule[session][group_id]
        repeated_contacts = 0
        for other_id in seen_members:
            key = tuple(sorted((person_id, other_id)))
            repeated_contacts += self.pair_meetings.get(key, 0)
        historical_group_reuse = sum(
            1
            for earlier_session in range(session)
            if person_id in self.schedule[earlier_session][group_id]
        )
        current_size = len(seen_members)
        return (repeated_contacts, historical_group_reuse, current_size)

    def fill_unreserved_attendees(self) -> None:
        for session in range(NUM_SESSIONS):
            unassigned = [
                person_id
                for person_id, person in sorted(self.people.items())
                if session in person.sessions
                and all(person_id not in members for members in self.schedule[session].values())
            ]
            for person_id in unassigned:
                candidate_groups = [
                    group_id
                    for group_id in GROUP_IDS
                    if self.capacities[group_id][session] > 0
                    and self.remaining_capacity(session, group_id) > 0
                ]
                if not candidate_groups:
                    raise RuntimeError(f"no remaining capacity for {person_id} in session {session}")
                candidate_groups.sort(
                    key=lambda group_id: (
                        self.contact_cost(person_id, session, group_id),
                        -self.remaining_capacity(session, group_id),
                        group_id,
                    )
                )
                chosen_group = candidate_groups[0]
                self.schedule[session][chosen_group].append(person_id)
                self.schedule[session][chosen_group].sort()

        for session in range(NUM_SESSIONS):
            for members in self.schedule[session].values():
                for left_index, left_person in enumerate(members):
                    for right_person in members[left_index + 1 :]:
                        key = tuple(sorted((left_person, right_person)))
                        self.pair_meetings[key] += 1

    def shared_sessions(self, left_person: str, right_person: str) -> List[int]:
        return sorted(
            set(self.people[left_person].sessions).intersection(self.people[right_person].sessions)
        )

    def together_sessions(self, left_person: str, right_person: str) -> List[int]:
        sessions: List[int] = []
        for session in self.shared_sessions(left_person, right_person):
            for members in self.schedule[session].values():
                if left_person in members and right_person in members:
                    sessions.append(session)
                    break
        return sessions

    def meetings_within_sessions(
        self, left_person: str, right_person: str, sessions: Sequence[int]
    ) -> int:
        session_set = set(sessions)
        return sum(1 for session in self.together_sessions(left_person, right_person) if session in session_set)

    def derive_soft_constraints(self, existing_constraints: List[Dict[str, object]]) -> List[Dict[str, object]]:
        constraints = list(existing_constraints)
        people_ids = sorted(self.people.keys())
        existing_pair_sets = {
            tuple(sorted(constraint["people"]))
            for constraint in existing_constraints
            if constraint["type"] in {"MustStayTogether", "ShouldStayTogether"}
        }
        protected_pair_sets = set(existing_pair_sets)

        should_not_candidates_by_window: Dict[Tuple[int, ...], List[Tuple[int, str, str]]] = defaultdict(list)
        for left_index, left_person in enumerate(people_ids):
            for right_person in people_ids[left_index + 1 :]:
                pair_key = tuple(sorted((left_person, right_person)))
                if pair_key in existing_pair_sets:
                    continue
                shared = self.shared_sessions(left_person, right_person)
                if len(shared) < 2:
                    continue
                together = self.together_sessions(left_person, right_person)
                if together:
                    continue
                if self.people[left_person].mask_name == self.people[right_person].mask_name:
                    continue
                overlap_score = len(shared)
                should_not_candidates_by_window[tuple(shared)].append(
                    (overlap_score, left_person, right_person)
                )

        for candidates in should_not_candidates_by_window.values():
            candidates.sort(key=lambda item: (-item[0], item[1], item[2]))

        person_should_not_count: Dict[str, int] = defaultdict(int)
        should_not_session_pressure: Dict[int, int] = defaultdict(int)
        target_should_not_count = 72
        window_offsets = {window: 0 for window in should_not_candidates_by_window}
        while len([constraint for constraint in constraints if constraint["type"] == "ShouldNotBeTogether"]) < target_should_not_count:
            added_any = False
            window_order = sorted(
                should_not_candidates_by_window,
                key=lambda window: (
                    sum(should_not_session_pressure[session] for session in window),
                    -len(window),
                    window,
                ),
            )
            for window in window_order:
                candidates = should_not_candidates_by_window[window]
                while window_offsets[window] < len(candidates):
                    _, left_person, right_person = candidates[window_offsets[window]]
                    window_offsets[window] += 1
                    if person_should_not_count[left_person] >= 4 or person_should_not_count[right_person] >= 4:
                        continue
                    constraints.append(
                        {
                            "type": "ShouldNotBeTogether",
                            "people": [left_person, right_person],
                            "sessions": list(window),
                            "penalty_weight": 45.0,
                        }
                    )
                    person_should_not_count[left_person] += 1
                    person_should_not_count[right_person] += 1
                    for session in window:
                        should_not_session_pressure[session] += 1
                    added_any = True
                    break
                if len([constraint for constraint in constraints if constraint["type"] == "ShouldNotBeTogether"]) >= target_should_not_count:
                    break
            if not added_any:
                break

        should_stay_candidates_by_window: Dict[Tuple[int, ...], List[Tuple[int, str, str]]] = defaultdict(list)
        for left_index, left_person in enumerate(people_ids):
            for right_person in people_ids[left_index + 1 :]:
                pair_key = tuple(sorted((left_person, right_person)))
                if pair_key in protected_pair_sets:
                    continue
                shared = self.shared_sessions(left_person, right_person)
                if len(shared) < 2:
                    continue
                together = self.together_sessions(left_person, right_person)
                if len(together) != len(shared):
                    continue
                should_stay_candidates_by_window[tuple(shared)].append(
                    (len(shared), left_person, right_person)
                )

        for candidates in should_stay_candidates_by_window.values():
            candidates.sort(key=lambda item: (-item[0], item[1], item[2]))

        should_stay_offsets = {window: 0 for window in should_stay_candidates_by_window}
        should_stay_participation_count: Dict[str, int] = defaultdict(int)
        target_soft_should_stay_count = 36
        while len([constraint for constraint in constraints if constraint["type"] == "ShouldStayTogether"]) < len([constraint for constraint in existing_constraints if constraint["type"] == "ShouldStayTogether"]) + target_soft_should_stay_count:
            added_any = False
            window_order = sorted(
                should_stay_candidates_by_window,
                key=lambda window: (
                    len(
                        [
                            constraint
                            for constraint in constraints
                            if constraint["type"] == "ShouldStayTogether"
                            and tuple(constraint["sessions"]) == window
                        ]
                    ),
                    -len(window),
                    window,
                ),
            )
            for window in window_order:
                candidates = should_stay_candidates_by_window[window]
                while should_stay_offsets[window] < len(candidates):
                    _, left_person, right_person = candidates[should_stay_offsets[window]]
                    should_stay_offsets[window] += 1
                    pair_key = tuple(sorted((left_person, right_person)))
                    if pair_key in protected_pair_sets:
                        continue
                    if should_stay_participation_count[left_person] >= 3 or should_stay_participation_count[right_person] >= 3:
                        continue
                    constraints.append(
                        {
                            "type": "ShouldStayTogether",
                            "people": [left_person, right_person],
                            "sessions": list(window),
                            "penalty_weight": 32.0,
                        }
                    )
                    protected_pair_sets.add(pair_key)
                    should_stay_participation_count[left_person] += 1
                    should_stay_participation_count[right_person] += 1
                    added_any = True
                    break
                if len([constraint for constraint in constraints if constraint["type"] == "ShouldStayTogether"]) >= len([constraint for constraint in existing_constraints if constraint["type"] == "ShouldStayTogether"]) + target_soft_should_stay_count:
                    break
            if not added_any:
                break

        def full_distribution(members: Sequence[str], attribute_key: str) -> Dict[str, int]:
            distribution: Dict[str, int] = defaultdict(int)
            for person_id in members:
                distribution[self.people[person_id].attributes[attribute_key]] += 1
            return dict(sorted(distribution.items()))

        for session in range(NUM_SESSIONS):
            gender_candidates: List[Tuple[int, str, Dict[str, int]]] = []
            track_candidates: List[Tuple[int, str, Dict[str, int]]] = []
            region_candidates: List[Tuple[int, str, Dict[str, int]]] = []
            for group_id, members in self.schedule[session].items():
                if len(members) < 6:
                    continue
                gender_distribution = full_distribution(members, "Gender")
                track_distribution = full_distribution(members, "Track")
                region_distribution = full_distribution(members, "Region")
                if len(gender_distribution) >= 2:
                    gender_candidates.append(
                        (
                            len(gender_distribution) * 10 + min(gender_distribution.values()),
                            group_id,
                            gender_distribution,
                        )
                    )
                if len(track_distribution) >= 2:
                    track_candidates.append(
                        (
                            len(track_distribution) * 10 + min(track_distribution.values()),
                            group_id,
                            track_distribution,
                        )
                    )
                if len(region_distribution) >= 3:
                    region_candidates.append(
                        (
                            len(region_distribution) * 10 + min(region_distribution.values()),
                            group_id,
                            region_distribution,
                        )
                    )

            gender_candidates.sort(key=lambda item: (-item[0], item[1]))
            track_candidates.sort(key=lambda item: (-item[0], item[1]))
            region_candidates.sort(key=lambda item: (-item[0], item[1]))

            for _, group_id, distribution in gender_candidates[:3]:
                constraints.append(
                    {
                        "type": "AttributeBalance",
                        "group_id": group_id,
                        "attribute_key": "Gender",
                        "desired_values": distribution,
                        "penalty_weight": 18.0,
                        "mode": "exact",
                        "sessions": [session],
                    }
                )

            added_track = 0
            for _, group_id, distribution in track_candidates:
                constraints.append(
                    {
                        "type": "AttributeBalance",
                        "group_id": group_id,
                        "attribute_key": "Track",
                        "desired_values": distribution,
                        "penalty_weight": 14.0,
                        "mode": "exact",
                        "sessions": [session],
                    }
                )
                added_track += 1
                if added_track >= 3:
                    break

            added_region = 0
            for _, group_id, distribution in region_candidates:
                constraints.append(
                    {
                        "type": "AttributeBalance",
                        "group_id": group_id,
                        "attribute_key": "Region",
                        "desired_values": distribution,
                        "penalty_weight": 10.0,
                        "mode": "exact",
                        "sessions": [session],
                    }
                )
                added_region += 1
                if added_region >= 2:
                    break

        pair_meeting_candidates_by_window: Dict[Tuple[int, ...], List[Tuple[int, str, str, int]]] = defaultdict(list)
        for left_index, left_person in enumerate(people_ids):
            for right_person in people_ids[left_index + 1 :]:
                pair_key = tuple(sorted((left_person, right_person)))
                if pair_key in existing_pair_sets:
                    continue
                shared = self.shared_sessions(left_person, right_person)
                if len(shared) < 3:
                    continue
                actual_meetings = self.meetings_within_sessions(left_person, right_person, shared)
                if actual_meetings not in {1, 2}:
                    continue
                pair_meeting_candidates_by_window[tuple(shared)].append(
                    (
                        abs(len(shared) - actual_meetings),
                        left_person,
                        right_person,
                        actual_meetings,
                    )
                )

        for candidates in pair_meeting_candidates_by_window.values():
            candidates.sort(key=lambda item: (item[0], item[1], item[2]))

        pair_window_offsets = {window: 0 for window in pair_meeting_candidates_by_window}
        pair_participation_count: Dict[str, int] = defaultdict(int)
        target_pair_constraints = 96
        while len([constraint for constraint in constraints if constraint["type"] == "PairMeetingCount"]) < target_pair_constraints:
            added_any = False
            window_order = sorted(
                pair_meeting_candidates_by_window,
                key=lambda window: (
                    len(
                        [
                            constraint
                            for constraint in constraints
                            if constraint["type"] == "PairMeetingCount"
                            and tuple(constraint["sessions"]) == window
                        ]
                    ),
                    -len(window),
                    window,
                ),
            )
            for window in window_order:
                candidates = pair_meeting_candidates_by_window[window]
                while pair_window_offsets[window] < len(candidates):
                    _, left_person, right_person, actual_meetings = candidates[pair_window_offsets[window]]
                    pair_window_offsets[window] += 1
                    if pair_participation_count[left_person] >= 4 or pair_participation_count[right_person] >= 4:
                        continue
                    constraints.append(
                        {
                            "type": "PairMeetingCount",
                            "people": [left_person, right_person],
                            "sessions": list(window),
                            "target_meetings": actual_meetings,
                            "mode": "exact",
                            "penalty_weight": 28.0,
                        }
                    )
                    pair_participation_count[left_person] += 1
                    pair_participation_count[right_person] += 1
                    added_any = True
                    break
                if len([constraint for constraint in constraints if constraint["type"] == "PairMeetingCount"]) >= target_pair_constraints:
                    break
            if not added_any:
                break

        constraints.insert(
            0,
            {
                "type": "RepeatEncounter",
                "max_allowed_encounters": 1,
                "penalty_function": "squared",
                "penalty_weight": 12.0,
            },
        )
        return constraints

    def export_schedule(self) -> Dict[str, Dict[str, List[str]]]:
        exported: Dict[str, Dict[str, List[str]]] = {}
        for session in range(NUM_SESSIONS):
            exported[session_key(session)] = {
                group_id: sorted(members)
                for group_id, members in self.schedule[session].items()
            }
        return exported


def solver_config() -> Dict[str, object]:
    return {
        "solver_type": "SimulatedAnnealing",
        "stop_conditions": {
            "max_iterations": FIXED_TIME_MAX_ITERATIONS,
            "time_limit_seconds": TIME_BUDGET_SECONDS,
            "no_improvement_iterations": None,
        },
        "solver_params": {
            "solver_type": "SimulatedAnnealing",
            "initial_temperature": 8.0,
            "final_temperature": 0.0005,
            "cooling_schedule": "geometric",
            "reheat_after_no_improvement": 0,
            "reheat_cycles": 0,
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


def build_manifest(output_path: Path) -> Tuple[Dict[str, object], Dict[str, object], Dict[str, object]]:
    people = build_people()
    attendance = attendance_by_session(people)
    attendance_counts = {session: len(attendees) for session, attendees in attendance.items()}
    capacities = build_group_capacities(attendance_counts)
    scheduler = PlantedSchedule(people, capacities)
    reserved = scheduler.place_reserved_structures()
    scheduler.fill_unreserved_attendees()
    constraints = scheduler.derive_soft_constraints(reserved["constraints"])

    manifest = {
        "schema_version": 1,
        "id": CASE_ID,
        "class": "stretch",
        "case_role": "canonical",
        "purpose": "objective_target.stretch.synthetic_partial_attendance_capacity_pressure_152p",
        "provenance": "generated_by_tools/benchmarking/generate_partial_attendance_capacity_case.py_using_a_deterministic_planted_feasible_builder",
        "declared_budget": {
            "max_iterations": FIXED_TIME_MAX_ITERATIONS,
            "time_limit_seconds": TIME_BUDGET_SECONDS,
        },
        "tags": [
            "stretch",
            "synthetic",
            "planted-feasible",
            "partial-attendance",
            "session-capacity",
            "session-scoped-constraints",
            "152p",
            "objective-research",
        ],
        "title": TITLE,
        "description": DESCRIPTION,
        "input": {
            "initial_schedule": None,
            "problem": {
                "people": [
                    {
                        "id": person.person_id,
                        "attributes": person.attributes,
                        **(
                            {"sessions": list(person.sessions)}
                            if list(person.sessions) != list(range(NUM_SESSIONS))
                            else {}
                        ),
                    }
                    for person in people
                ],
                "groups": [
                    {
                        "id": group_id,
                        "size": max(capacities[group_id]),
                        "session_sizes": capacities[group_id],
                    }
                    for group_id in GROUP_IDS
                ],
                "num_sessions": NUM_SESSIONS,
            },
            "objectives": [{"type": "maximize_unique_contacts", "weight": 1.0}],
            "constraints": constraints,
            "solver": solver_config(),
        },
    }

    summary = {
        "case_id": CASE_ID,
        "people": len(people),
        "sessions": NUM_SESSIONS,
        "groups": len(GROUP_IDS),
        "attendance_per_session": attendance_counts,
        "capacity_per_session": {
            session: sum(capacities[group_id][session] for group_id in GROUP_IDS)
            for session in range(NUM_SESSIONS)
        },
        "constraint_counts": {
            constraint_type: sum(
                1 for constraint in constraints if constraint["type"] == constraint_type
            )
            for constraint_type in sorted({constraint["type"] for constraint in constraints})
        },
        "reserved_structures": {
            "anchors": len(reserved["anchors"]),
            "partial_immovables": len(reserved["partial_immovables"]),
            "cliques": len(reserved["cliques"]),
            "buddies": len(reserved["buddies"]),
        },
    }

    planted_schedule_manifest = copy.deepcopy(manifest)
    planted_schedule_manifest["input"]["initial_schedule"] = scheduler.export_schedule()

    output_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest, summary, planted_schedule_manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("backend/benchmarking/cases/stretch/synthetic_partial_attendance_capacity_pressure_152p.json"),
    )
    parser.add_argument(
        "--summary-output",
        type=Path,
        default=None,
        help="Optional path for a generation summary JSON file.",
    )
    parser.add_argument(
        "--planted-output",
        type=Path,
        default=None,
        help="Optional path for a helper manifest that includes the planted feasible schedule as initial_schedule.",
    )
    args = parser.parse_args()

    manifest, summary, planted_manifest = build_manifest(args.output)
    if args.summary_output:
        args.summary_output.write_text(json.dumps(summary, indent=2) + "\n")
    if args.planted_output:
        args.planted_output.write_text(json.dumps(planted_manifest, indent=2) + "\n")

    print(json.dumps(summary, indent=2))
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
