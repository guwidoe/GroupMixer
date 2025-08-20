import type {
  Constraint,
  Person,
  Problem,
  Solution,
  Assignment,
} from "../types";

export type ScheduleMap = Record<number, Record<string, string[]>>; // session -> group -> peopleIds

export interface ViolationDetail {
  kind: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ComplianceCardData {
  id: number;
  constraint: Constraint;
  type: Constraint["type"];
  title: string;
  subtitle?: string;
  adheres: boolean;
  violationsCount: number;
  details: ViolationDetail[];
}

export function buildScheduleMap(assignments: Assignment[]): ScheduleMap {
  const schedule: ScheduleMap = {};
  assignments.forEach((a) => {
    if (!schedule[a.session_id]) schedule[a.session_id] = {};
    if (!schedule[a.session_id][a.group_id])
      schedule[a.session_id][a.group_id] = [];
    schedule[a.session_id][a.group_id].push(a.person_id);
  });
  return schedule;
}

export function computeUniqueContacts(
  assignments: Assignment[],
  peopleCount: number
): { uniqueContacts: number; avgUniqueContacts: number } {
  const schedule = buildScheduleMap(assignments);
  const seenPairs = new Set<string>();
  Object.values(schedule).forEach((groups) => {
    Object.values(groups).forEach((peopleIds) => {
      for (let i = 0; i < peopleIds.length; i++) {
        for (let j = i + 1; j < peopleIds.length; j++) {
          const a = peopleIds[i];
          const b = peopleIds[j];
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          seenPairs.add(key);
        }
      }
    });
  });
  const uniqueContacts = seenPairs.size;
  const denom = Math.max(1, peopleCount);
  const avgUniqueContacts = (uniqueContacts * 2) / denom;
  return { uniqueContacts, avgUniqueContacts };
}

function formatSessions(sessions: number[] | undefined, total: number): string {
  if (!sessions || sessions.length === 0) return "All sessions";
  if (sessions.length === total) return "All sessions";
  return `Sessions ${sessions.map((s) => s + 1).join(", ")}`;
}

export function evaluateCompliance(
  problem: Problem,
  solution: Solution
): ComplianceCardData[] {
  const schedule = buildScheduleMap(solution.assignments);
  const personMap = new Map<string, Person>(
    problem.people.map((p) => [p.id, p])
  );

  const cards: ComplianceCardData[] = [];

  problem.constraints.forEach((c, index) => {
    switch (c.type) {
      case "RepeatEncounter": {
        const pairCounts = new Map<
          string,
          { count: number; sessions: Set<number> }
        >();
        Object.entries(schedule).forEach(([sessionStr, groups]) => {
          const session = Number(sessionStr);
          Object.values(groups).forEach((peopleIds) => {
            for (let i = 0; i < peopleIds.length; i++) {
              for (let j = i + 1; j < peopleIds.length; j++) {
                const a = peopleIds[i];
                const b = peopleIds[j];
                const key = [a, b].sort().join("|");
                const entry = pairCounts.get(key) || {
                  count: 0,
                  sessions: new Set<number>(),
                };
                entry.count += 1;
                entry.sessions.add(session);
                pairCounts.set(key, entry);
              }
            }
          });
        });

        const details: ViolationDetail[] = [];
        let violations = 0;
        pairCounts.forEach((entry, key) => {
          if (entry.count > c.max_allowed_encounters) {
            const [p1, p2] = key.split("|");
            const over = entry.count - c.max_allowed_encounters;
            violations += over;
            details.push({
              kind: "RepeatEncounter",
              pair: [p1, p2],
              count: entry.count,
              maxAllowed: c.max_allowed_encounters,
              sessions: Array.from(entry.sessions.values()).sort(
                (a, b) => a - b
              ),
            });
          }
        });

        cards.push({
          id: index,
          constraint: c,
          type: c.type,
          title: `Repeat Encounter (max ${c.max_allowed_encounters})`,
          subtitle: `Penalty: ${c.penalty_function}, Weight: ${c.penalty_weight}`,
          adheres: violations === 0,
          violationsCount: violations,
          details,
        });
        break;
      }
      case "AttributeBalance": {
        const sessions =
          c.sessions ??
          Array.from({ length: problem.num_sessions }, (_, i) => i);
        const details: ViolationDetail[] = [];
        let violations = 0;
        const mode = (c as unknown as { mode?: "exact" | "at_least" }).mode;
        sessions.forEach((session) => {
          const peopleIds = schedule[session]?.[c.group_id] || [];
          const counts: Record<string, number> = {};
          peopleIds.forEach((pid) => {
            const person = personMap.get(pid);
            const val = person?.attributes?.[c.attribute_key] ?? "__UNKNOWN__";
            counts[val] = (counts[val] || 0) + 1;
          });
          Object.entries(c.desired_values).forEach(([val, desired]) => {
            const actual = counts[val] || 0;
            if (mode === "at_least") {
              if (actual < desired) {
                violations += desired - actual;
                details.push({
                  kind: "AttributeBalance",
                  session,
                  groupId: c.group_id,
                  attribute: val,
                  desired,
                  actual,
                });
              }
            } else {
              if (actual !== desired) {
                violations += Math.abs(actual - desired);
                details.push({
                  kind: "AttributeBalance",
                  session,
                  groupId: c.group_id,
                  attribute: val,
                  desired,
                  actual,
                });
              }
            }
          });
        });
        cards.push({
          id: index,
          constraint: c,
          type: c.type,
          title: `Attribute Balance – ${c.group_id} (${c.attribute_key})`,
          subtitle:
            `${formatSessions(
              (c as unknown as { sessions?: number[] }).sessions,
              problem.num_sessions
            )} • Weight: ${c.penalty_weight}` +
            (mode === "at_least" ? " • Mode: At least" : ""),
          adheres: violations === 0,
          violationsCount: violations,
          details,
        });
        break;
      }
      case "ImmovablePerson": {
        const details: ViolationDetail[] = [];
        let violations = 0;
        c.sessions.forEach((session) => {
          const groups = schedule[session] || {};
          let assignedGroup: string | undefined;
          Object.entries(groups).forEach(([gid, ids]) => {
            if (ids.includes(c.person_id)) assignedGroup = gid;
          });
          if (assignedGroup !== c.group_id) {
            violations += 1;
            details.push({
              kind: "Immovable",
              session,
              personId: c.person_id,
              requiredGroup: c.group_id,
              assignedGroup,
            });
          }
        });
        cards.push({
          id: index,
          constraint: c,
          type: c.type,
          title: "Immovable Person",
          subtitle: `${formatSessions(
            (c as unknown as { sessions?: number[] }).sessions,
            problem.num_sessions
          )} • Group: ${c.group_id}`,
          adheres: violations === 0,
          violationsCount: violations,
          details,
        });
        break;
      }
      case "ImmovablePeople": {
        const sessions =
          c.sessions ??
          Array.from({ length: problem.num_sessions }, (_, i) => i);
        const details: ViolationDetail[] = [];
        let violations = 0;
        sessions.forEach((session) => {
          const peopleIds = schedule[session]?.[c.group_id] || [];
          c.people.forEach((pid) => {
            if (!peopleIds.includes(pid)) {
              violations += 1;
              details.push({
                kind: "Immovable",
                session,
                personId: pid,
                requiredGroup: c.group_id,
              });
            }
          });
        });
        cards.push({
          id: index,
          constraint: c,
          type: c.type,
          title: "Immovable People",
          subtitle: `${formatSessions(
            (c as unknown as { sessions?: number[] }).sessions,
            problem.num_sessions
          )} • Group: ${c.group_id}`,
          adheres: violations === 0,
          violationsCount: violations,
          details,
        });
        break;
      }
      case "MustStayTogether":
      case "ShouldStayTogether": {
        const sessions =
          (c as unknown as { sessions?: number[] }).sessions ??
          Array.from({ length: problem.num_sessions }, (_, i) => i);
        const details: ViolationDetail[] = [];
        let violations = 0;
        sessions.forEach((session) => {
          const groupIdSet = new Set<string>();
          const peopleStatus = (
            c as unknown as { people: string[] }
          ).people.map((pid) => {
            const groups = schedule[session];
            let assignedGroup: string | undefined;
            if (groups) {
              for (const [gid, ids] of Object.entries(groups)) {
                if ((ids as string[]).includes(pid)) {
                  assignedGroup = gid;
                  break;
                }
              }
            }
            if (assignedGroup) groupIdSet.add(assignedGroup);
            else violations += 1;
            return { personId: pid, groupId: assignedGroup };
          });
          if (groupIdSet.size > 1) violations += groupIdSet.size - 1;
          if (groupIdSet.size > 1 || peopleStatus.some((p) => !p.groupId)) {
            details.push({
              kind: "TogetherSplit",
              session,
              people: peopleStatus,
            });
          }
        });
        const title =
          c.type === "MustStayTogether"
            ? "Must Stay Together"
            : "Should Stay Together";
        cards.push({
          id: index,
          constraint: c,
          type: c.type,
          title,
          subtitle: formatSessions(
            (c as unknown as { sessions?: number[] }).sessions,
            problem.num_sessions
          ),
          adheres: violations === 0,
          violationsCount: violations,
          details,
        });
        break;
      }
      case "ShouldNotBeTogether": {
        const sessions =
          (c as unknown as { sessions?: number[] }).sessions ??
          Array.from({ length: problem.num_sessions }, (_, i) => i);
        const details: ViolationDetail[] = [];
        let violations = 0;
        sessions.forEach((session) => {
          const groups = schedule[session] || {};
          Object.entries(groups).forEach(([gid, ids]) => {
            const overlap = (ids as string[]).filter((id) =>
              (c as unknown as { people: string[] }).people.includes(id)
            );
            if (overlap.length > 1) {
              violations += overlap.length - 1;
              details.push({
                kind: "NotTogether",
                session,
                groupId: gid,
                people: overlap,
              });
            }
          });
        });
        cards.push({
          id: index,
          constraint: c,
          type: c.type,
          title: "Should Not Be Together",
          subtitle: `${formatSessions(
            (c as unknown as { sessions?: number[] }).sessions,
            problem.num_sessions
          )} • Weight: ${
            (c as unknown as { penalty_weight?: number }).penalty_weight
          }`,
          adheres: violations === 0,
          violationsCount: violations,
          details,
        });
        break;
      }
      default: {
        const anyConstraint = c as Constraint;
        cards.push({
          id: index,
          constraint: anyConstraint,
          type: anyConstraint.type,
          title: anyConstraint.type,
          adheres: true,
          violationsCount: 0,
          details: [],
        });
      }
    }
  });

  return cards;
}
