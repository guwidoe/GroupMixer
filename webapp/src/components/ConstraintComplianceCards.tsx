import React, { useMemo, useState } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, XCircle, Info } from 'lucide-react';
import type { Constraint, Problem, Solution } from '../types';
import ConstraintPersonChip from './ConstraintPersonChip';
import { formatSessions, useCompliance } from './ConstraintComplianceCards/useCompliance';
import type { CardData, ConstraintType, ViolationDetail } from './ConstraintComplianceCards/types';
import { typeLabels } from './ConstraintComplianceCards/types';

interface Props {
  problem: Problem;
  solution: Solution;
}

const ConstraintComplianceCards: React.FC<Props> = ({ problem, solution }) => {
  const cards = useCompliance(problem, solution);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [collapsed, setCollapsed] = useState<boolean>(true);

  const grouped = useMemo(
    () =>
      cards.reduce((acc: Record<ConstraintType, CardData[]>, card) => {
        (acc[card.type] = acc[card.type] || []).push(card);
        return acc;
      }, {} as Record<ConstraintType, CardData[]>),
    [cards],
  );

  const toggle = (id: number) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const getConstraintPeople = (constraint: Constraint): string[] | null => {
    switch (constraint.type) {
      case 'ImmovablePerson':
        return [constraint.person_id];
      case 'ImmovablePeople':
        return constraint.people;
      case 'MustStayTogether':
      case 'ShouldStayTogether':
      case 'ShouldNotBeTogether':
        return constraint.people;
      case 'PairMeetingCount':
        return constraint.people;
      default:
        return null;
    }
  };

  const renderHeader = (card: CardData) => (
    <div className="flex items-start justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            {card.type}
          </span>
          {card.subtitle && (
            <span
              className="text-xs px-2 py-0.5 rounded"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              {card.subtitle}
            </span>
          )}
        </div>
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {card.title}
        </div>
        {(() => {
          const people = getConstraintPeople(card.constraint);
          if (!people || people.length === 0) return null;
          return (
            <div className="mt-1 flex flex-wrap gap-1">
              {people.map((pid) => (
                <ConstraintPersonChip key={pid} personId={pid} people={problem.people} />
              ))}
            </div>
          );
        })()}
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
    if (detail.kind === 'PairMeetingCountSummary') {
      const [a, b] = detail.people;
      return (
        <div key={key} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <ConstraintPersonChip personId={a} people={problem.people} />
            <span>&</span>
            <ConstraintPersonChip personId={b} people={problem.people} />
            <span>
              Target {detail.target} ({detail.mode.replace('_', ' ')}) • Actual {detail.actual} •{' '}
              {formatSessions(detail.sessions, problem.num_sessions)}
            </span>
          </div>
        </div>
      );
    }
    if (detail.kind === 'PairMeetingTogether') {
      return (
        <div key={key} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Session {detail.session + 1}: Together{detail.groupId ? ` in ${detail.groupId}` : ''}
        </div>
      );
    }
    if (detail.kind === 'PairMeetingApart') {
      return (
        <div key={key} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Session {detail.session + 1}: Apart
        </div>
      );
    }
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
            Session {detail.session + 1}, Group{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {detail.groupId}
            </span>{' '}
            – value "{detail.attribute}": have {detail.actual}, want {detail.desired}
          </div>
        );
      }
      case 'Immovable': {
        return (
          <div key={key} className="text-sm flex flex-wrap items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            <span>Session {detail.session + 1}:</span>
            <ConstraintPersonChip personId={detail.personId} people={problem.people} />
            <span>must be in</span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}
            >
              {detail.requiredGroup}
            </span>
            {detail.assignedGroup ? (
              <span>
                but was in{' '}
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}
                >
                  {detail.assignedGroup}
                </span>
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
    <div
      className="rounded-lg border p-6 transition-colors"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
          Constraint Compliance
        </h3>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="px-3 py-1 rounded text-sm border"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <span className="inline-flex items-center gap-1">
              <ChevronDown className="w-4 h-4" /> Expand
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <ChevronUp className="w-4 h-4" /> Collapse
            </span>
          )}
        </button>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>
          No constraints defined for this problem.
        </p>
      ) : collapsed ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(grouped).map(([type, list]) => {
            const total = list.length;
            const ok = list.filter((card) => card.adheres).length;
            const violations = list.reduce((sum, card) => sum + (card.adheres ? 0 : card.violationsCount), 0);
            return (
              <div
                key={type}
                className="rounded-lg border p-4"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
              >
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  {typeLabels[type as ConstraintType] || type}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-green-600" /> OK
                    </span>
                    <span className="font-medium">
                      {ok} / {total}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1">
                      <XCircle className="w-4 h-4 text-red-600" /> Violations
                    </span>
                    <span className="font-medium">{violations}</span>
                  </div>
                </div>
                <div className="mt-3 text-xs flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                  <Info className="w-3 h-3" /> Expand to see details
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, list]) => (
            <div key={type}>
              <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                {typeLabels[type as ConstraintType] || type}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {list.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-lg border p-4 transition-colors hover:shadow-md"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
                  >
                    {renderHeader(card)}
                    {expanded[card.id] && card.details.length > 0 && (
                      <div className="mt-3 space-y-2">{card.details.map((detail, i) => renderDetail(detail, i))}</div>
                    )}
                    {expanded[card.id] && card.details.length === 0 && (
                      <div className="mt-3 text-sm italic" style={{ color: 'var(--text-tertiary)' }}>
                        No details
                      </div>
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
