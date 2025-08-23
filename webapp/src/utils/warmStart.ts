import type { Problem, ProblemResult, Constraint, Person } from "../types";

type Schedule = Record<string, Record<string, string[]>>; // session_{i} -> group_id -> [person_id]

function getActiveSessionsForPerson(
  problem: Problem,
  person: Person
): number[] {
  if (Array.isArray(person.sessions) && person.sessions.length > 0) {
    return person.sessions.slice();
  }
  return Array.from({ length: problem.num_sessions }, (_, i) => i);
}

function* iterateSessions(problem: Problem): Generator<number> {
  for (let s = 0; s < problem.num_sessions; s += 1) {
    yield s;
  }
}

function sessionsForConstraint(
  problem: Problem,
  constraint: Constraint
): number[] {
  const all = Array.from({ length: problem.num_sessions }, (_, i) => i);
  const maybeSessions = (constraint as unknown as { sessions?: number[] })
    .sessions;
  if (Array.isArray(maybeSessions) && maybeSessions.length > 0) {
    return maybeSessions.filter((s) => s >= 0 && s < problem.num_sessions);
  }
  return all;
}

function initEmptySchedule(problem: Problem): Schedule {
  const schedule: Schedule = {};
  for (const s of iterateSessions(problem)) {
    const sessionKey = `session_${s}`;
    schedule[sessionKey] = {};
    for (const g of problem.groups) {
      schedule[sessionKey][g.id] = [];
    }
  }
  return schedule;
}

function buildCapacityMap(
  problem: Problem
): Record<number, Record<string, number>> {
  const caps: Record<number, Record<string, number>> = {};
  for (const s of iterateSessions(problem)) {
    caps[s] = {};
    for (const g of problem.groups) {
      caps[s][g.id] = g.size;
    }
  }
  return caps;
}

function decrementCapacity(
  caps: Record<number, Record<string, number>>,
  session: number,
  groupId: string,
  count = 1
) {
  const left = caps[session][groupId];
  if (left === undefined)
    throw new Error(`Unknown group '${groupId}' in capacity map`);
  if (left < count)
    throw new Error(
      `Capacity exceeded for group '${groupId}' in session ${session}`
    );
  caps[session][groupId] = left - count;
}

function ensurePersonNotAlreadyAssigned(
  assigned: Record<number, Set<string>>,
  session: number,
  personId: string
) {
  if (assigned[session].has(personId)) {
    throw new Error(
      `Person '${personId}' assigned multiple times in session ${session}`
    );
  }
  assigned[session].add(personId);
}

function place(
  schedule: Schedule,
  caps: Record<number, Record<string, number>>,
  assigned: Record<number, Set<string>>,
  session: number,
  groupId: string,
  personId: string
) {
  const sessionKey = `session_${session}`;
  if (!(groupId in schedule[sessionKey])) {
    throw new Error(`Group '${groupId}' does not exist in current problem`);
  }
  ensurePersonNotAlreadyAssigned(assigned, session, personId);
  decrementCapacity(caps, session, groupId, 1);
  schedule[sessionKey][groupId].push(personId);
}

function getImmovableMap(
  problem: Problem
): Record<number, Record<string, string>> {
  // session -> person_id -> group_id
  const map: Record<number, Record<string, string>> = {};
  for (const s of iterateSessions(problem)) map[s] = {};

  for (const c of problem.constraints) {
    if (c.type !== "ImmovablePerson" && c.type !== "ImmovablePeople") continue;
    const sessions = sessionsForConstraint(problem, c);
    if (c.type === "ImmovablePerson") {
      const personId = (c as unknown as { person_id: string }).person_id;
      const groupId = (c as unknown as { group_id: string }).group_id;
      for (const s of sessions) {
        map[s][personId] = groupId;
      }
    } else {
      const people = (c as unknown as { people: string[] }).people || [];
      const groupId = (c as unknown as { group_id: string }).group_id;
      for (const s of sessions) {
        for (const pid of people) {
          map[s][pid] = groupId;
        }
      }
    }
  }

  return map;
}

function buildCliqueComponents(problem: Problem, session: number): string[][] {
  // union-find over MustStayTogether constraints for a given session
  const parent: Record<string, string> = {};
  const find = (x: string): string => {
    if (parent[x] === undefined) {
      parent[x] = x;
      return x;
    }
    if (parent[x] === x) {
      return x;
    }
    parent[x] = find(parent[x]);
    return parent[x];
  };
  const unite = (a: string, b: string) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pb] = pa;
  };

  let hasAny = false;
  for (const c of problem.constraints) {
    if (c.type !== "MustStayTogether") continue;
    const sessions = sessionsForConstraint(problem, c);
    if (!sessions.includes(session)) continue;
    const people = (c as unknown as { people: string[] }).people || [];
    if (people.length >= 2) {
      hasAny = true;
      for (let i = 1; i < people.length; i += 1) unite(people[0], people[i]);
    }
  }
  if (!hasAny) return [];

  const compToMembers: Record<string, Set<string>> = {};
  Object.keys(parent).forEach((p) => {
    const fp = find(p);
    if (!compToMembers[fp]) compToMembers[fp] = new Set();
    compToMembers[fp].add(p);
  });

  return Object.values(compToMembers).map((s) => Array.from(s));
}

export function reconcileResultToInitialSchedule(
  currentProblem: Problem,
  result: ProblemResult
): Schedule {
  // Base schedule and capacity
  const schedule = initEmptySchedule(currentProblem);
  const capacities = buildCapacityMap(currentProblem);
  const assigned: Record<number, Set<string>> = {};
  for (const s of iterateSessions(currentProblem))
    assigned[s] = new Set<string>();

  // Build quick lookup maps
  const peopleById = new Map(
    currentProblem.people.map((p) => [p.id, p] as const)
  );
  const groupIds = new Set(currentProblem.groups.map((g) => g.id));

  // Build immovable map once
  const immovableMap = getImmovableMap(currentProblem);

  // Preprocess result assignments per session -> person -> group
  const resultBySession: Record<number, Record<string, string>> = {};
  for (const s of iterateSessions(currentProblem)) resultBySession[s] = {};
  for (const a of result.solution.assignments) {
    if (a.session_id < 0 || a.session_id >= currentProblem.num_sessions)
      continue; // drop out-of-range sessions
    if (!groupIds.has(a.group_id)) continue; // drop deleted groups
    if (!peopleById.has(a.person_id)) continue; // drop removed people
    resultBySession[a.session_id][a.person_id] = a.group_id; // last write wins
  }

  // Per-session placement
  for (const s of iterateSessions(currentProblem)) {
    const sessionKey = `session_${s}`;

    // Active people this session
    const activePeople = currentProblem.people.filter((p) =>
      getActiveSessionsForPerson(currentProblem, p).includes(s)
    );
    const activeSet = new Set(activePeople.map((p) => p.id));

    // 1) Hard-place immovable constraints first
    for (const pid of Object.keys(immovableMap[s])) {
      if (!activeSet.has(pid)) {
        throw new Error(
          `Immovable constraint requires '${pid}' in session ${s}, but person is inactive for this session`
        );
      }
      const gid = immovableMap[s][pid];
      if (!groupIds.has(gid))
        throw new Error(`Immovable target group '${gid}' does not exist`);
      place(schedule, capacities, assigned, s, gid, pid);
    }

    // 2) MustStayTogether cliques → largest first, place into group with most spare capacity
    const cliques = buildCliqueComponents(currentProblem, s)
      .map((members) => members.filter((pid) => activeSet.has(pid)))
      .filter((members) => members.length > 0)
      .sort((a, b) => b.length - a.length);

    for (const members of cliques) {
      // Skip members already assigned (e.g., immovable)
      const unassigned = members.filter((pid) => !assigned[s].has(pid));
      if (unassigned.length === 0) continue;

      // If any member has an immovable group, all must go there; detect conflicts
      const immovableGroups = new Set<string>();
      for (const pid of members) {
        const g = immovableMap[s][pid];
        if (g) immovableGroups.add(g);
      }
      if (immovableGroups.size > 1) {
        throw new Error(
          `Conflicting immovable groups within a MustStayTogether clique in session ${s}`
        );
      }

      let targetGroup: string | null = null;
      if (immovableGroups.size === 1) {
        targetGroup = Array.from(immovableGroups)[0];
        if ((capacities[s][targetGroup] ?? 0) < unassigned.length) {
          throw new Error(
            `Not enough capacity in group '${targetGroup}' for clique of size ${unassigned.length} in session ${s}`
          );
        }
      } else {
        // Choose group with max spare capacity that can fit all
        const candidate = currentProblem.groups
          .map((g) => ({ id: g.id, spare: capacities[s][g.id] }))
          .filter((g) => g.spare >= unassigned.length)
          .sort((a, b) => b.spare - a.spare)[0];
        if (!candidate) {
          throw new Error(
            `No group has capacity for clique of size ${unassigned.length} in session ${s}`
          );
        }
        targetGroup = candidate.id;
      }

      for (const pid of unassigned) {
        place(schedule, capacities, assigned, s, targetGroup!, pid);
      }
    }

    // 3) Seed remaining from result's assignments (compatible only)
    const seed = resultBySession[s];
    for (const pid of Object.keys(seed)) {
      if (!activeSet.has(pid)) continue; // respect per-session activity
      if (assigned[s].has(pid)) continue; // already placed via immovable/clique
      const gid = seed[pid];
      if ((capacities[s][gid] ?? 0) <= 0) continue; // no room, skip
      place(schedule, capacities, assigned, s, gid, pid);
    }

    // 4) Fill remaining active people greedily (most spare capacity)
    for (const pid of activePeople.map((p) => p.id)) {
      if (assigned[s].has(pid)) continue;
      const immovableG = immovableMap[s][pid];
      if (immovableG) {
        if ((capacities[s][immovableG] ?? 0) <= 0) {
          throw new Error(
            `No capacity left in immovable group '${immovableG}' for person '${pid}' in session ${s}`
          );
        }
        place(schedule, capacities, assigned, s, immovableG, pid);
        continue;
      }

      // Choose the group with max spare capacity
      const candidate = currentProblem.groups
        .map((g) => ({ id: g.id, spare: capacities[s][g.id] }))
        .filter((g) => g.spare > 0)
        .sort((a, b) => b.spare - a.spare)[0];
      if (!candidate) {
        throw new Error(
          `No capacity available to place person '${pid}' in session ${s}`
        );
      }
      place(schedule, capacities, assigned, s, candidate.id, pid);
    }
  }

  return schedule;
}
