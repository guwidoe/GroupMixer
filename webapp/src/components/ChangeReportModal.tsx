import React from 'react';
import { X, AlertTriangle, Target, Users, Link as LinkIcon, Split, MinusCircle, PlusCircle, Users2 } from 'lucide-react';
import type { ComplianceCardData } from '../services/evaluator';
import type { Person } from '../types';
import PersonChip from './PersonCard';

interface ScoreSummary {
  final_score: number;
  unique_contacts: number;
  repetition_penalty: number;
  attribute_balance_penalty: number;
  constraint_penalty: number;
}

export interface ChangeReportData {
  before: {
    score: ScoreSummary;
    compliance: ComplianceCardData[];
  };
  after: {
    score: ScoreSummary;
    compliance: ComplianceCardData[];
  };
  people: Person[];
}

interface Props {
  open: boolean;
  onClose: () => void; // Generic close callback
  onAccept?: () => void; // Explicit accept
  onCancel?: () => void; // Explicit cancel
  data: ChangeReportData | null;
}

function formatDelta(v: number, invertGood = false): { text: string; className: string } {
  const sign = v > 0 ? '+' : '';
  const cls = invertGood ? (v <= 0 ? 'text-green-600' : 'text-red-600') : (v >= 0 ? 'text-green-600' : 'text-red-600');
  return { text: `${sign}${v.toFixed(2)}`, className: cls };
}

const ChangeReportModal: React.FC<Props> = ({ open, onClose, onAccept, onCancel, data }) => {
  if (!open || !data) return null;

  const b = data.before.score;
  const a = data.after.score;
  const dScore = a.final_score - b.final_score; // lower is better
  const dUniq = a.unique_contacts - b.unique_contacts;
  const dRep = a.repetition_penalty - b.repetition_penalty;
  const dAttr = a.attribute_balance_penalty - b.attribute_balance_penalty;
  const dCon = a.constraint_penalty - b.constraint_penalty;

  // People helpers
  const peopleIndex = new Map<string, Person>(data.people.map((p) => [p.id, p]));
  const renderPerson = (id: string) => {
    const p = peopleIndex.get(id);
    if (!p) return <span className="font-mono">{id}</span>;
    return <PersonChip person={p} />;
  };

  // Build typed change items grouped by constraint type
  type ChangeItem = { before?: ComplianceCardData; after?: ComplianceCardData; key: string };
  const changedByType = new Map<string, ChangeItem[]>();
  const beforeMap = new Map<string, ComplianceCardData>();
  data.before.compliance.forEach((c) => beforeMap.set(`${c.type}#${c.id}`, c));
  const seenKeys = new Set<string>();
  // Normalize detail keys for robust comparisons (order-insensitive)
  const detailKeyFor = (d: any) => {
    switch (d.kind) {
      case 'RepeatEncounter':
        return `${d.kind}|${[d.pair[0], d.pair[1]].sort().join('|')}`;
      case 'AttributeBalance':
        return `${d.kind}|${d.session}|${d.groupId}|${d.attribute}`;
      case 'Immovable':
        return `${d.kind}|${d.session}|${d.personId}|${d.requiredGroup}|${d.assignedGroup ?? ''}`;
      case 'TogetherSplit':
        // include people identities, order-insensitive
        return `${d.kind}|${d.session}|${(d.people || []).map((p: any) => p.personId).sort().join(',')}`;
      case 'NotTogether':
        return `${d.kind}|${d.session}|${d.groupId}|${(d.people || []).slice().sort().join(',')}`;
      default:
        return `${d.kind}|${JSON.stringify(d)}`;
    }
  };

  data.after.compliance.forEach((c) => {
    const key = `${c.type}#${c.id}`;
    seenKeys.add(key);
    const prev = beforeMap.get(key);
    if (!prev) {
      const arr = changedByType.get(c.type) || [];
      arr.push({ before: prev, after: c, key });
      changedByType.set(c.type, arr);
    } else {
      const beforeSet = new Set<string>((prev.details || []).map(detailKeyFor));
      const afterSet = new Set<string>((c.details || []).map(detailKeyFor));
      const countsDiffer = prev.violationsCount !== c.violationsCount;
      let setsDiffer = false;
      if (beforeSet.size !== afterSet.size) setsDiffer = true;
      if (!setsDiffer) {
        for (const k of beforeSet) { if (!afterSet.has(k)) { setsDiffer = true; break; } }
      }
      if (countsDiffer || setsDiffer) {
        const arr = changedByType.get(c.type) || [];
        arr.push({ before: prev, after: c, key });
        changedByType.set(c.type, arr);
      }
    }
  });
  beforeMap.forEach((prev, key) => {
    if (!seenKeys.has(key)) {
      const arr = changedByType.get(prev.type) || [];
      arr.push({ before: prev, after: undefined, key });
      changedByType.set(prev.type, arr);
    }
  });

  // Hard constraint type set
  const HARD_TYPES = new Set<string>(['MustStayTogether', 'ImmovablePerson', 'ImmovablePeople']);
  const entriesAll = Array.from(changedByType.entries());
  const hardEntries = entriesAll.filter(([type]) => HARD_TYPES.has(type));
  const softEntries = entriesAll.filter(([type]) => !HARD_TYPES.has(type));

  // Helper to render rich detail per constraint type
  const renderConstraintCard = (item: ChangeItem) => {
    const before = item.before;
    const after = item.after;
    const type = after?.type || before?.type || 'Constraint';
    // Diff helpers keyed by detail kind
    const beforeDetails = before?.details || [];
    const afterDetails = after?.details || [];
    const keyFor = (d: any) => {
      switch (d.kind) {
        case 'RepeatEncounter':
          return `${d.kind}|${d.pair[0]}|${d.pair[1]}`;
        case 'AttributeBalance':
          return `${d.kind}|${d.session}|${d.groupId}|${d.attribute}`;
        case 'Immovable':
          return `${d.kind}|${d.session}|${d.personId}|${d.requiredGroup}`;
        case 'TogetherSplit':
          return `${d.kind}|${d.session}`;
        case 'NotTogether':
          return `${d.kind}|${d.session}|${d.groupId}`;
        case 'PairMeetingCountSummary':
          return `${d.kind}|${[d.people?.[0], d.people?.[1]].sort().join('|')}|${d.mode}|${d.target}|${d.actual}`;
        case 'PairMeetingTogether':
        case 'PairMeetingApart':
          return `${d.kind}|${d.session}|${[d.people?.[0], d.people?.[1]].sort().join('|')}`;
        default:
          return `${d.kind}|${JSON.stringify(d)}`;
      }
    };
    const beforeMapD = new Map<string, any>();
    beforeDetails.forEach((d) => beforeMapD.set(keyFor(d), d));
    const added: any[] = [];
    const removed: any[] = [];
    const seenD = new Set<string>();
    afterDetails.forEach((d) => {
      const k = keyFor(d);
      seenD.add(k);
      if (!beforeMapD.has(k)) added.push(d);
    });
    beforeDetails.forEach((d) => {
      const k = keyFor(d);
      if (!seenD.has(k)) removed.push(d);
    });
    const renderDetailRow = (icon: React.ReactNode, content: React.ReactNode, variant: 'add' | 'remove') => (
      <div className={`flex items-center gap-2 text-xs ${variant === 'add' ? 'text-green-600' : 'text-red-600'}`}>
        {icon}
        <div style={{ color: 'var(--text-secondary)' }}>{content}</div>
      </div>
    );
    if (type === 'RepeatEncounter') {
      return (
        <div className="mt-2 space-y-1">
          {added.slice(0, 5).map((d, i) => (
            <div key={`re-add-${d.pair?.[0]}-${d.pair?.[1]}-${d.count}-${i}`}>
              {renderDetailRow(<PlusCircle className="w-3 h-3" />, (
                <span>New pair {renderPerson(d.pair[0])} ↔ {renderPerson(d.pair[1])} ({d.count}×)</span>
              ), 'add')}
            </div>
          ))}
          {removed.slice(0, 5).map((d, i) => (
            <div key={`re-rem-${d.pair?.[0]}-${d.pair?.[1]}-${i}`}>
              {renderDetailRow(<MinusCircle className="w-3 h-3" />, (
                <span>Resolved pair {renderPerson(d.pair[0])} ↔ {renderPerson(d.pair[1])}</span>
              ), 'remove')}
            </div>
          ))}
        </div>
      );
    }
    if (type === 'AttributeBalance') {
      return (
        <div className="mt-2 space-y-1">
          {added.slice(0, 5).map((d, i) => (
            <div key={`ab-add-${d.session}-${d.groupId}-${d.attribute}-${i}`}>
              {renderDetailRow(<PlusCircle className="w-3 h-3" />, (
                <span>Session {d.session + 1}, group <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{d.groupId}</span>, value "{d.attribute}" shortfall</span>
              ), 'add')}
            </div>
          ))}
          {removed.slice(0, 5).map((d, i) => (
            <div key={`ab-rem-${d.session}-${d.groupId}-${d.attribute}-${i}`}>
              {renderDetailRow(<MinusCircle className="w-3 h-3" />, (
                <span>Session {d.session + 1}, group <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{d.groupId}</span>, value "{d.attribute}" fixed</span>
              ), 'remove')}
            </div>
          ))}
        </div>
      );
    }
    if (type === 'ImmovablePerson' || type === 'ImmovablePeople') {
      return (
        <div className="mt-2 space-y-1">
          {added.slice(0, 5).map((d, i) => (
            <div key={`imm-add-${d.session}-${d.personId}-${d.requiredGroup}-${i}`}>
              {renderDetailRow(<LinkIcon className="w-3 h-3" />, (
                <span>Session {d.session + 1}: {renderPerson(d.personId)} not in required <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{d.requiredGroup}</span></span>
              ), 'add')}
            </div>
          ))}
          {removed.slice(0, 5).map((d, i) => (
            <div key={`imm-rem-${d.session}-${d.personId}-${i}`}>
              {renderDetailRow(<MinusCircle className="w-3 h-3" />, (
                <span>Session {d.session + 1}: Requirement satisfied for {renderPerson(d.personId)}</span>
              ), 'remove')}
            </div>
          ))}
        </div>
      );
    }
    if (type === 'MustStayTogether' || type === 'ShouldStayTogether') {
      // Show person-level diffs rather than record-level
      const beforeBySession = new Map<number, any>();
      beforeDetails.filter(d => d.kind === 'TogetherSplit').forEach((d) => beforeBySession.set(d.session, d));
      const afterBySession = new Map<number, any>();
      afterDetails.filter(d => d.kind === 'TogetherSplit').forEach((d) => afterBySession.set(d.session, d));

      const sessionKeys = Array.from(new Set([...beforeBySession.keys(), ...afterBySession.keys()])).sort((a, b) => a - b);

      return (
        <div className="mt-2 space-y-2">
          {sessionKeys.map((s) => {
            const b = beforeBySession.get(s);
            const aDet = afterBySession.get(s);
            const beforeSet = new Set<string>((b?.people || []).map((p: any) => p.personId));
            const afterSet = new Set<string>((aDet?.people || []).map((p: any) => p.personId));
            const addedPeople = Array.from(afterSet).filter(pid => !beforeSet.has(pid));
            const removedPeople = Array.from(beforeSet).filter(pid => !afterSet.has(pid));
            const hasDiff = addedPeople.length > 0 || removedPeople.length > 0;
            return (
              <div key={`mst-${s}`} className="space-y-1">
                {hasDiff && addedPeople.length > 0 && renderDetailRow(<Split className="w-3 h-3" />, (<span>Session {s + 1}: new split</span>), 'add')}
                {hasDiff && addedPeople.length > 0 && (
                  <div className="pl-5 flex flex-wrap gap-1">
                    {addedPeople.map((pid) => {
                      const g = (aDet?.people || []).find((p: any) => p.personId === pid)?.groupId;
                      return (
                        <span key={`add-${pid}`} className="inline-flex items-center gap-2">
                          {renderPerson(pid)}
                          <span style={{ color: 'var(--text-secondary)' }}>{g ? `in ${g}` : '(not assigned)'}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
                {hasDiff && removedPeople.length > 0 && renderDetailRow(<MinusCircle className="w-3 h-3" />, (<span>Session {s + 1}: split resolved</span>), 'remove')}
                {hasDiff && removedPeople.length > 0 && (
                  <div className="pl-5 flex flex-wrap gap-1">
                    {removedPeople.map((pid) => {
                      const g = (b?.people || []).find((p: any) => p.personId === pid)?.groupId;
                      return (
                        <span key={`rem-${pid}`} className="inline-flex items-center gap-2">
                          {renderPerson(pid)}
                          <span style={{ color: 'var(--text-secondary)' }}>{g ? `was in ${g}` : '(not assigned)'}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
                {!hasDiff && aDet && (
                  <div className="pl-5 flex flex-wrap gap-2">
                    {(aDet.people || []).map((p: any, idx: number) => (
                      <span key={`all-${p.personId}-${idx}`} className="inline-flex items-center gap-2">
                        {renderPerson(p.personId)}
                        <span style={{ color: 'var(--text-secondary)' }}>{p.groupId ? `in ${p.groupId}` : '(not assigned)'}</span>
                      </span>
                    ))}
                  </div>
                )}
                {!hasDiff && !aDet && b && (
                  <div className="pl-5 flex flex-wrap gap-2">
                    {(b.people || []).map((p: any, idx: number) => (
                      <span key={`b-all-${p.personId}-${idx}`} className="inline-flex items-center gap-2">
                        {renderPerson(p.personId)}
                        <span style={{ color: 'var(--text-secondary)' }}>{p.groupId ? `was in ${p.groupId}` : '(not assigned)'}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    if (type === 'ShouldNotBeTogether') {
      return (
        <div className="mt-2 space-y-2">
          {added.slice(0, 5).map((d) => (
            <div key={`nt-added-${d.session}-${d.groupId}`} className="space-y-1">
              {renderDetailRow(<Users2 className="w-3 h-3" />, (
                <span>Session {d.session + 1}: new conflict in <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{d.groupId}</span></span>
              ), 'add')}
              <div className="pl-5 flex flex-wrap gap-1">
                {d.people?.map((pid: string, i: number) => (
                  <span key={pid + i}>{renderPerson(pid)}</span>
                ))}
              </div>
            </div>
          ))}
          {removed.slice(0, 5).map((d) => (
            <div key={`nt-removed-${d.session}-${d.groupId}`} className="space-y-1">
              {renderDetailRow(<MinusCircle className="w-3 h-3" />, (
                <span>Session {d.session + 1}: conflict resolved in <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{d.groupId}</span></span>
              ), 'remove')}
              <div className="pl-5 flex flex-wrap gap-1">
                {d.people?.map((pid: string, i: number) => (
                  <span key={pid + i}>{renderPerson(pid)}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (type === 'PairMeetingCount') {
      // Show summary delta and per-session changes
      const addedSummaries = added.filter(d => d.kind === 'PairMeetingCountSummary');
      const removedSummaries = removed.filter(d => d.kind === 'PairMeetingCountSummary');
      const addedSessions = added.filter(d => d.kind === 'PairMeetingTogether' || d.kind === 'PairMeetingApart');
      const removedSessions = removed.filter(d => d.kind === 'PairMeetingTogether' || d.kind === 'PairMeetingApart');
      return (
        <div className="mt-2 space-y-1">
          {addedSummaries.map((d, i) => (
            <div key={`pmc-sum-add-${i}`}>
              {renderDetailRow(<PlusCircle className="w-3 h-3" />, (
                <span>Pair {renderPerson(d.people[0])} & {renderPerson(d.people[1])}: now {d.actual} (target {d.target}, {d.mode})</span>
              ), 'add')}
            </div>
          ))}
          {removedSummaries.map((d, i) => (
            <div key={`pmc-sum-rem-${i}`}>
              {renderDetailRow(<MinusCircle className="w-3 h-3" />, (
                <span>Pair {renderPerson(d.people[0])} & {renderPerson(d.people[1])}: was {d.actual} (target {d.target}, {d.mode})</span>
              ), 'remove')}
            </div>
          ))}
          {addedSessions.slice(0, 5).map((d, i) => (
            <div key={`pmc-add-${d.kind}-${d.session}-${i}`}>
              {renderDetailRow(<PlusCircle className="w-3 h-3" />, (
                <span>Session {d.session + 1}: now {d.kind === 'PairMeetingTogether' ? 'together' : 'apart'}</span>
              ), 'add')}
            </div>
          ))}
          {removedSessions.slice(0, 5).map((d, i) => (
            <div key={`pmc-rem-${d.kind}-${d.session}-${i}`}>
              {renderDetailRow(<MinusCircle className="w-3 h-3" />, (
                <span>Session {d.session + 1}: no longer {d.kind === 'PairMeetingTogether' ? 'together' : 'apart'}</span>
              ), 'remove')}
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="rounded-lg border w-full max-w-5xl" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Change Report</h3>
          </div>
          <button onClick={onCancel || onClose} className="p-1 rounded hover:opacity-80" aria-label="Close" style={{ color: 'var(--text-secondary)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* Compact score bar – consistent alignment and spacing */}
          <div className="rounded border p-3" style={{ borderColor: 'var(--border-primary)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {[
                { label: 'Cost', value: a.final_score.toFixed(2), delta: dScore, invert: true, icon: null },
                { label: 'Unique', value: String(a.unique_contacts), delta: dUniq, invert: false, icon: <Users className="w-4 h-4" /> },
                { label: 'Repeat', value: String(a.repetition_penalty), delta: dRep, invert: true, icon: null },
                { label: 'Attr balance', value: a.attribute_balance_penalty.toFixed(2), delta: dAttr, invert: true, icon: null },
                { label: 'Constraints', value: String(a.constraint_penalty), delta: dCon, invert: true, icon: <AlertTriangle className="w-4 h-4" /> },
              ].map((kpi, idx) => (
                <div key={idx} className="rounded px-3 py-2 border" style={{ borderColor: 'var(--border-primary)' }}>
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="inline-flex items-center gap-1">{kpi.icon}{kpi.label}</span>
                    <span className={`${formatDelta(Number(kpi.delta) || 0, !!kpi.invert).className}`}>{formatDelta(Number(kpi.delta) || 0, !!kpi.invert).text}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-right" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{kpi.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Two-column constraint changes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {entriesAll.length === 0 ? (
              <div className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>No constraints changed.</div>
            ) : (
              <>
                {[{ label: 'Hard constraints', entries: hardEntries, hard: true }, { label: 'Other constraints', entries: softEntries, hard: false }].map(({ label, entries, hard }) => (
                  entries.length === 0 ? null : (
                    <div key={label} className="rounded border col-span-1" style={{ borderColor: 'var(--border-primary)' }}>
                      <div className="px-3 py-2 text-xs font-semibold flex items-center justify-between" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                        <span>{label}</span>
                        {hard && <span className="px-2 py-0.5 text-[10px] rounded border" style={{ borderColor: 'var(--color-error-600)', color: 'var(--color-error-600)' }}>HARD</span>}
                      </div>
                      <div className="p-2 space-y-3 max-h-80 overflow-auto">
                        {entries.map(([type, items]) => (
                          <div key={type} className="rounded border" style={{ borderColor: 'var(--border-primary)' }}>
                            <div className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{type}</div>
                            <div className="p-2 space-y-2">
                              {items.map((item) => {
                                const from = item.before?.violationsCount ?? 0;
                                const to = item.after?.violationsCount ?? 0;
                                const rawDelta = to - from;
                                // Pull optional penalty weight from the constraint definition (soft constraints)
                                const weight = (item.after?.constraint as any)?.penalty_weight ?? (item.before?.constraint as any)?.penalty_weight ?? 1;
                                const dv = rawDelta * (typeof weight === 'number' ? weight : 1);
                                const dvFmt = formatDelta(dv, true);
                                const borderStyle = dv > 0 ? 'var(--color-error-600)' : dv < 0 ? 'var(--color-success-600)' : 'var(--border-primary)';
                                return (
                                  <div key={item.key} className="rounded border p-2" style={{ borderColor: borderStyle }}>
                                    <div className="flex items-center justify-between text-sm">
                                      <div className="min-w-0">
                                        <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                          <span>{(item.after?.title || item.before?.title) ?? type}</span>
                                          {/* Show weight for soft constraints */}
                                          {!(HARD_TYPES.has(type)) && (typeof weight === 'number') && (
                                            <span className="px-1.5 py-0.5 text-[10px] rounded border" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>w {weight}</span>
                                          )}
                                        </div>
                                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                          {type}{hard ? ' • Hard' : ''}
                                          {/* RepeatEncounter penalty function */}
                                          {type === 'RepeatEncounter' && (
                                            <>
                                              {(() => {
                                                const pf = (item.after?.constraint as any)?.penalty_function || (item.before?.constraint as any)?.penalty_function;
                                                return pf ? <span> • {pf}</span> : null;
                                              })()}
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      <div className={`text-sm ${dvFmt.className}`}>{dvFmt.text}</div>
                                    </div>
                                    {renderConstraintCard(item)}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </>
            )}
          </div>
          {/* Footer actions */}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={onCancel || onClose}
              className="px-3 py-1.5 rounded border text-sm"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            >
              Cancel move
            </button>
            <button
              onClick={onAccept || onClose}
              className="px-3 py-1.5 rounded text-sm"
              style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangeReportModal;
