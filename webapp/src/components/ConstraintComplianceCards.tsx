import React, { useMemo, useState } from 'react';
import { CheckCircle, ChevronDown, XCircle } from 'lucide-react';
import type { Constraint, Person, Problem, Solution } from '../types';
import ConstraintPersonChip from './ConstraintPersonChip';

type ConstraintType = Constraint['type'];

interface Props {
  problem: Problem;
  solution: Solution;
}

type ScheduleMap = Record<number, Record<string, string[]>>; // session -> group -> peopleIds

interface BaseCardData {
  id: number;
  constraint: Constraint;
  type: ConstraintType;
  title: string;
  subtitle?: string;
  adheres: boolean;
  violationsCount: number;
}

type ViolationDetail =
  | { kind: 'RepeatEncounter'; pair: [string, string]; count: number; maxAllowed: number; sessions: number[] }
  | { kind: 'AttributeBalance'; session: number; groupId: string; attribute: string; desired: number; actual: number }
  | { kind: 'Immovable'; session: number; personId: string; requiredGroup: string; assignedGroup?: string }
  | { kind: 'TogetherSplit'; session: number; people: { personId: string; groupId?: string }[] }
  | { kind: 'NotTogether'; session: number; groupId: string; people: string[] };

interface CardData extends BaseCardData {
  details: ViolationDetail[];
}

function formatSessions(sessions: number[] | undefined, total: number): string {
  if (!sessions || sessions.length === 0) return 'All sessions';
  if (sessions.length === total) return 'All sessions';
  return `Sessions ${sessions.map((s) => s + 1).join(', ')}`;
}

function useSchedule(solution: Solution): ScheduleMap {
  return useMemo(() => {
    const schedule: ScheduleMap = {};
    solution.assignments.forEach((a) => {
      if (!schedule[a.session_id]) schedule[a.session_id] = {};
      if (!schedule[a.session_id][a.group_id]) schedule[a.session_id][a.group_id] = [];
      schedule[a.session_id][a.group_id].push(a.person_id);
    });
    return schedule;
  }, [solution]);
}

function useCompliance(problem: Problem, solution: Solution): CardData[] {
  const schedule = useSchedule(solution);
  const personMap = useMemo(() => new Map<string, Person>(problem.people.map((p) => [p.id, p])), [problem.people]);

  return useMemo(() => {
    const cards: CardData[] = [];

    problem.constraints.forEach((c, index) => {
      switch (c.type) {
        case 'RepeatEncounter': {
          const pairCounts = new Map<string, { count: number; sessions: Set<number> }>();
          Object.entries(schedule).forEach(([sessionStr, groups]) => {
            const session = Number(sessionStr);
            Object.values(groups).forEach((peopleIds) => {
              for (let i = 0; i < peopleIds.length; i++) {
                for (let j = i + 1; j < peopleIds.length; j++) {
                  const a = peopleIds[i];
                  const b = peopleIds[j];
                  const key = [a, b].sort().join('|');
                  const entry = pairCounts.get(key) || { count: 0, sessions: new Set<number>() };
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
              const [p1, p2] = key.split('|');
              const over = entry.count - c.max_allowed_encounters;
              violations += over;
              details.push({
                kind: 'RepeatEncounter',
                pair: [p1, p2],
                count: entry.count,
                maxAllowed: c.max_allowed_encounters,
                sessions: Array.from(entry.sessions.values()).sort((a, b) => a - b),
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
        case 'AttributeBalance': {
          const sessions = c.sessions ?? Array.from({ length: problem.num_sessions }, (_, i) => i);
          const details: ViolationDetail[] = [];
          let violations = 0;
          sessions.forEach((session) => {
            const peopleIds = schedule[session]?.[c.group_id] || [];
            const counts: Record<string, number> = {};
            peopleIds.forEach((pid) => {
              const person = personMap.get(pid);
              const val = person?.attributes?.[c.attribute_key] ?? '__UNKNOWN__';
              counts[val] = (counts[val] || 0) + 1;
            });
            Object.entries(c.desired_values).forEach(([val, desired]) => {
              const actual = counts[val] || 0;
              if (actual !== desired) {
                violations += Math.abs(actual - desired);
                details.push({ kind: 'AttributeBalance', session, groupId: c.group_id, attribute: val, desired, actual });
              }
            });
          });
          cards.push({
            id: index,
            constraint: c,
            type: c.type,
            title: `Attribute Balance – ${c.group_id} (${c.attribute_key})`,
            subtitle: `${formatSessions(c.sessions, problem.num_sessions)} • Weight: ${c.penalty_weight}`,
            adheres: violations === 0,
            violationsCount: violations,
            details,
          });
          break;
        }
        case 'ImmovablePerson': {
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
              details.push({ kind: 'Immovable', session, personId: c.person_id, requiredGroup: c.group_id, assignedGroup });
            }
          });
          cards.push({
            id: index,
            constraint: c,
            type: c.type,
            title: 'Immovable Person',
            subtitle: `${formatSessions(c.sessions, problem.num_sessions)} • Group: ${c.group_id}`,
            adheres: violations === 0,
            violationsCount: violations,
            details,
          });
          break;
        }
        case 'ImmovablePeople': {
          const sessions = c.sessions ?? Array.from({ length: problem.num_sessions }, (_, i) => i);
          const details: ViolationDetail[] = [];
          let violations = 0;
          sessions.forEach((session) => {
            const peopleIds = schedule[session]?.[c.group_id] || [];
            c.people.forEach((pid) => {
              if (!peopleIds.includes(pid)) {
                violations += 1;
                details.push({ kind: 'Immovable', session, personId: pid, requiredGroup: c.group_id });
              }
            });
          });
          cards.push({
            id: index,
            constraint: c,
            type: c.type,
            title: 'Immovable People',
            subtitle: `${formatSessions(c.sessions, problem.num_sessions)} • Group: ${c.group_id}`,
            adheres: violations === 0,
            violationsCount: violations,
            details,
          });
          break;
        }
        case 'MustStayTogether':
        case 'ShouldStayTogether': {
          const sessions = c.sessions ?? Array.from({ length: problem.num_sessions }, (_, i) => i);
          const details: ViolationDetail[] = [];
          let violations = 0;
          sessions.forEach((session) => {
            const groupIdSet = new Set<string>();
            const peopleStatus = c.people.map((pid) => {
              const groups = schedule[session];
              let assignedGroup: string | undefined;
              if (groups) {
                for (const [gid, ids] of Object.entries(groups)) {
                  if (ids.includes(pid)) {
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
              details.push({ kind: 'TogetherSplit', session, people: peopleStatus });
            }
          });
          const title = c.type === 'MustStayTogether' ? 'Must Stay Together' : 'Should Stay Together';
          cards.push({
            id: index,
            constraint: c,
            type: c.type,
            title,
            subtitle: formatSessions(c.sessions, problem.num_sessions),
            adheres: violations === 0,
            violationsCount: violations,
            details,
          });
          break;
        }
        case 'ShouldNotBeTogether': {
          const sessions = c.sessions ?? Array.from({ length: problem.num_sessions }, (_, i) => i);
          const details: ViolationDetail[] = [];
          let violations = 0;
          sessions.forEach((session) => {
            const groups = schedule[session] || {};
            Object.entries(groups).forEach(([gid, ids]) => {
              const overlap = ids.filter((id) => c.people.includes(id));
              if (overlap.length > 1) {
                violations += overlap.length - 1;
                details.push({ kind: 'NotTogether', session, groupId: gid, people: overlap });
              }
            });
          });
          cards.push({
            id: index,
            constraint: c,
            type: c.type,
            title: 'Should Not Be Together',
            subtitle: `${formatSessions(c.sessions, problem.num_sessions)} • Weight: ${c.penalty_weight}`,
            adheres: violations === 0,
            violationsCount: violations,
            details,
          });
          break;
        }
        default: {
          cards.push({
            id: index,
            constraint: c,
            type: c.type,
            title: c.type,
            adheres: true,
            violationsCount: 0,
            details: [],
          });
        }
      }
    });

    return cards;
  }, [personMap, problem.constraints, problem.num_sessions, schedule]);
}

const typeLabels: Partial<Record<ConstraintType, string>> = {
  RepeatEncounter: 'Repeat Encounter',
  ShouldNotBeTogether: 'Should Not Be Together',
  ShouldStayTogether: 'Should Stay Together',
  MustStayTogether: 'Must Stay Together',
  AttributeBalance: 'Attribute Balance',
  ImmovablePerson: 'Immovable Person',
  ImmovablePeople: 'Immovable People',
};

const ConstraintComplianceCards: React.FC<Props> = ({ problem, solution }) => {
  const cards = useCompliance(problem, solution);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const grouped = useMemo(() =>
    cards.reduce((acc: Record<ConstraintType, CardData[]>, card) => {
      (acc[card.type] = acc[card.type] || []).push(card);
      return acc;
    }, {} as Record<ConstraintType, CardData[]>), [cards]);

  const toggle = (id: number) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const renderHeader = (card: CardData) => (
    <div className="flex items-start justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            {card.type}
          </span>
          {card.subtitle && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              {card.subtitle}
            </span>
          )}
        </div>
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{card.title}</div>
      </div>
      <div className="flex items-center gap-2">
        {card.adheres ? (
          <span className="inline-flex items-center gap-1 text-green-600 text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            <span>No violations</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-red-600 text-sm font-medium">
            <XCircle className="w-4 h-4" />
            <span>{card.violationsCount} violation{card.violationsCount !== 1 ? 's' : ''}</span>
          </span>
        )}
        <button
          onClick={() => toggle(card.id)}
          className="ml-2 p-1 rounded hover:opacity-80"
          aria-label="Toggle details"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded[card.id] ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );

  const renderDetail = (detail: ViolationDetail, key: number) => {
    switch (detail.kind) {
      case 'RepeatEncounter': {
        const [a, b] = detail.pair;
        return (
          <div key={key} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <ConstraintPersonChip personId={a} people={problem.people} />
              <span>met with</span>
              <ConstraintPersonChip personId={b} people={problem.people} />
              <span>
                {detail.count} times (max {detail.maxAllowed}) • Sessions {detail.sessions.map((s) => s + 1).join(', ')}
              </span>
            </div>
          </div>
        );
      }
      case 'AttributeBalance': {
        return (
          <div key={key} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Session {detail.session + 1}, Group <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{detail.groupId}</span> –
            {' '}value "{detail.attribute}": have {detail.actual}, want {detail.desired}
          </div>
        );
      }
      case 'Immovable': {
        return (
          <div key={key} className="text-sm flex flex-wrap items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            <span>Session {detail.session + 1}:</span>
            <ConstraintPersonChip personId={detail.personId} people={problem.people} />
            <span>must be in</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}>{detail.requiredGroup}</span>
            {detail.assignedGroup ? (
              <span>
                but was in <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}>{detail.assignedGroup}</span>
              </span>
            ) : (
              <span>but is not assigned</span>
            )}
          </div>
        );
      }
      case 'TogetherSplit': {
        return (
          <div key={key} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div>Session {detail.session + 1}:</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {detail.people.map((p, idx) => (
                <div key={idx} className="inline-flex items-center gap-2">
                  <ConstraintPersonChip personId={p.personId} people={problem.people} />
                  <span className="text-xs">{p.groupId ? `in ${p.groupId}` : '(not assigned)'}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }
      case 'NotTogether': {
        return (
          <div key={key} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <span>Session {detail.session + 1}, group {detail.groupId} contains</span>
              {detail.people.map((pid, i) => (
                <ConstraintPersonChip key={pid + i} personId={pid} people={problem.people} />
              ))}
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="rounded-lg border p-6 transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
      <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--text-primary)' }}>Constraint Compliance</h3>
      {cards.length === 0 ? (
        <p className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>No constraints defined for this problem.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, list]) => (
            <div key={type}>
              <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                {typeLabels[type as ConstraintType] || type}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {list.map((card) => (
                  <div key={card.id} className="rounded-lg border p-4 transition-colors hover:shadow-md" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                    {renderHeader(card)}
                    {expanded[card.id] && card.details.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {card.details.map((d, i) => renderDetail(d, i))}
                      </div>
                    )}
                    {expanded[card.id] && card.details.length === 0 && (
                      <div className="mt-3 text-sm italic" style={{ color: 'var(--text-tertiary)' }}>No details</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConstraintComplianceCards;


