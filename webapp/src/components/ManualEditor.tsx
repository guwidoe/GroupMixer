import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import type { Assignment, Group, Problem, Solution } from '../types';
import { AlertTriangle, CheckCircle2, Lock, LockOpen, Save, Undo2, Redo2, Users, Target } from 'lucide-react';
import PersonCard from './PersonCard';
import { calculateMetrics } from '../utils/metricCalculations';
import { evaluateCompliance, buildScheduleMap, computeUniqueContacts } from '../services/evaluator';
import { wasmService } from '../services/wasm';
import ChangeReportModal, { ChangeReportData } from './ChangeReportModal';
import ConstraintComplianceCards from './ConstraintComplianceCards';

type Mode = 'strict' | 'warn' | 'free';

interface DraftState {
  assignments: Assignment[];
}

function cloneAssignments(assignments: Assignment[]): Assignment[] {
  return assignments.map((a) => ({ ...a }));
}

function groupBySessionAndGroup(assignments: Assignment[]): Record<number, Record<string, string[]>> {
  return buildScheduleMap(assignments);
}

function ManualEditor() {
  const problem = useAppStore((s) => s.problem);
  const solution = useAppStore((s) => s.solution);
  const addNotification = useAppStore((s) => s.addNotification);
  const addResult = useAppStore((s) => s.addResult);

  const [activeSession, setActiveSession] = useState(0);
  const [mode, setMode] = useState<Mode>('warn');
  const [lockedPeople, setLockedPeople] = useState<Set<string>>(new Set());
  const [lockedGroups, setLockedGroups] = useState<Set<string>>(new Set());
  // Track the person being dragged for preview computations
  const [draggingPerson, setDraggingPerson] = useState<string | null>(null);

  // History stacks for undo/redo (we only use the setters)
  const [_history, setHistory] = useState<DraftState[]>([]);
  const [_future, setFuture] = useState<DraftState[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);

  // Initialize draft from existing solution
  useEffect(() => {
    if (solution) {
      setDraft({ assignments: cloneAssignments(solution.assignments) });
      setHistory([]);
      setFuture([]);
      setActiveSession(0);
    }
  }, [solution]);

  // Baseline reserved for future diffs
  // const baselineAssignments = solution?.assignments ?? [];
  // const baselineSchedule = useMemo(() => groupBySessionAndGroup(baselineAssignments), [baselineAssignments]);
  const draftAssignments = draft?.assignments ?? [];
  const draftSchedule = useMemo(() => groupBySessionAndGroup(draftAssignments), [draftAssignments]);

  const effectiveProblem: Problem | null = problem;

  const baselineMetrics = useMemo(() => (effectiveProblem && solution ? calculateMetrics(effectiveProblem, solution) : null), [effectiveProblem, solution]);
  const baselineCompliance = useMemo(() => (effectiveProblem && solution ? evaluateCompliance(effectiveProblem, solution) : []), [effectiveProblem, solution]);

  // Rust-evaluated metrics for the current draft (final_score, penalties, contacts)
  const [evaluated, setEvaluated] = useState<import('../types').Solution | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!effectiveProblem) return;
      setEvalLoading(true);
      setEvalError(null);
      try {
        const res = await wasmService.evaluateSolution(effectiveProblem, draftAssignments);
        if (!cancelled) setEvaluated(res);
      } catch (e) {
        if (!cancelled) setEvalError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setEvalLoading(false);
      }
    };
    const t = setTimeout(run, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [effectiveProblem, draftAssignments]);

  // === Pre-drop preview state ===
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  // Lightweight UX; if needed, we can show loading/error states later
  const [_previewLoading, setPreviewLoading] = useState(false);
  const [_previewError, setPreviewError] = useState<string | null>(null);
  const [previewDelta, setPreviewDelta] = useState<{
    groupId: string;
    sessionId: number;
    scoreDelta: number;
    uniqueDelta: number;
    constraintDelta: number;
  } | null>(null);

  const computePreview = async (personId: string, toGroupId: string, sessionId: number) => {
    if (!effectiveProblem) return;
    const baseScore = evaluated?.final_score ?? (solution?.final_score ?? 0);
    const baseUnique = evaluated?.unique_contacts ?? (solution?.unique_contacts ?? 0);
    const baseConstraint = evaluated?.constraint_penalty ?? (compliance.reduce((acc, c) => acc + c.violationsCount, 0));

    // Build hypothetical assignments: move personId to toGroupId for sessionId
    const hypothetic = cloneAssignments(draftAssignments).filter((a) => !(a.person_id === personId && a.session_id === sessionId));
    hypothetic.push({ person_id: personId, group_id: toGroupId, session_id: sessionId });

    const key = `${personId}|${sessionId}|${toGroupId}|${draftAssignments.length}`;
    if (previewKey === key && previewDelta) return; // don't recompute same
    setPreviewKey(key);
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await wasmService.evaluateSolution(effectiveProblem, hypothetic);
      setPreviewDelta({
        groupId: toGroupId,
        sessionId,
        scoreDelta: res.final_score - baseScore,
        uniqueDelta: (res.unique_contacts - baseUnique),
        constraintDelta: (res.constraint_penalty - baseConstraint),
      });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
      setPreviewDelta(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // === Change report modal ===
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState<ChangeReportData | null>(null);
  const [elaborateReportsEnabled, setElaborateReportsEnabled] = useState(false);

  const compliance = useMemo(() => (effectiveProblem ? evaluateCompliance(effectiveProblem, { assignments: draftAssignments } as Solution) : []), [effectiveProblem, draftAssignments]);

  const hardViolationsCount = useMemo(() => {
    // Treat MustStayTogether + Immovable* as hard; also capacity overflow
    let count = 0;
    compliance.forEach((c) => {
      if (c.type === 'MustStayTogether' || c.type === 'ImmovablePerson' || c.type === 'ImmovablePeople') {
        count += c.violationsCount;
      }
    });
    if (effectiveProblem) {
      const sessions = Array.from({ length: effectiveProblem.num_sessions }, (_, i) => i);
      sessions.forEach((s) => {
        const groups = draftSchedule[s] || {};
        effectiveProblem.groups.forEach((g) => {
          const ct = (groups[g.id] || []).length;
          if (ct > g.size) count += (ct - g.size);
        });
      });
    }
    return count;
  }, [compliance, draftSchedule, effectiveProblem]);

  if (!effectiveProblem || !solution || !draft) {
    return (
      <div className="p-6">
        <div className="rounded-lg border p-6" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            <AlertTriangle className="w-5 h-5" />
            <span>Select a result first. The Manual Editor activates when a solution is available.</span>
          </div>
        </div>
      </div>
    );
  }

  // Helpers
  const saveDraft = () => {
    if (!effectiveProblem) return;
    const peopleCount = effectiveProblem.people.length || 1;
    const { uniqueContacts } = computeUniqueContacts(draftAssignments, peopleCount);

    const draftSolution: Solution = {
      assignments: cloneAssignments(draftAssignments),
      final_score: 0,
      unique_contacts: uniqueContacts,
      repetition_penalty: 0,
      attribute_balance_penalty: 0,
      constraint_penalty: 0,
      iteration_count: 0,
      elapsed_time_ms: 0,
      weighted_repetition_penalty: 0,
      weighted_constraint_penalty: 0,
    } as unknown as Solution;

    try {
      addResult(draftSolution, effectiveProblem.settings, 'Manual Draft');
      addNotification({ type: 'success', title: 'Draft Saved', message: 'Saved as a new result.' });
    } catch (e) {
      addNotification({ type: 'error', title: 'Save Failed', message: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const pushHistory = (nextAssignments: Assignment[]) => {
    setHistory((h) => [...h, { assignments: cloneAssignments(draft.assignments) }]);
    setFuture([]);
    setDraft({ assignments: nextAssignments });
  };

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [{ assignments: cloneAssignments(draft.assignments) }, ...f]);
      setDraft({ assignments: cloneAssignments(prev.assignments) });
      return h.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setHistory((h) => [...h, { assignments: cloneAssignments(draft.assignments) }]);
      setDraft({ assignments: cloneAssignments(next.assignments) });
      return f.slice(1);
    });
  };

  const isGroupLocked = (groupId: string) => lockedGroups.has(groupId);
  const isPersonLocked = (personId: string) => lockedPeople.has(personId);

  const toggleGroupLock = (groupId: string) => {
    setLockedGroups((s) => {
      const next = new Set(s);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const togglePersonLock = (personId: string) => {
    setLockedPeople((s) => {
      const next = new Set(s);
      if (next.has(personId)) next.delete(personId); else next.add(personId);
      return next;
    });
  };

  const capacityOf = (group: Group) => group.size;

  const canDrop = (personId: string, targetGroupId: string, sessionId: number): { ok: boolean; reason?: string } => {
    if (isPersonLocked(personId)) return { ok: false, reason: 'Person is locked' };
    if (isGroupLocked(targetGroupId)) return { ok: false, reason: 'Group is locked' };

    const groups = draftSchedule[sessionId] || {};
    const targetPeople = groups[targetGroupId] || [];
    const groupDef = effectiveProblem.groups.find((g) => g.id === targetGroupId);
    if (groupDef) {
      const cap = capacityOf(groupDef);
      const currentCount = targetPeople.includes(personId) ? targetPeople.length : targetPeople.length + 1;
      if (currentCount > cap) {
        if (mode === 'strict') return { ok: false, reason: 'Capacity exceeded' };
      }
    }

    // Basic hard constraints check (ImmovablePerson/People + MustStayTogether) – allow in warn/free
    const personConstraints = effectiveProblem.constraints.filter((c) => {
      const allSessions = Array.from({ length: effectiveProblem.num_sessions }, (_, i) => i);
      if (c.type === 'ImmovablePerson') {
        const sessions = (c as unknown as { sessions?: number[] }).sessions ?? allSessions;
        const person_id = (c as unknown as { person_id: string }).person_id;
        return person_id === personId && sessions.includes(sessionId);
      }
      if (c.type === 'ImmovablePeople') {
        const sessions = (c as unknown as { sessions?: number[] }).sessions ?? allSessions;
        const people = (c as unknown as { people: string[] }).people || [];
        return sessions.includes(sessionId) && people.includes(personId);
      }
      return false;
    });
    for (const c of personConstraints) {
      const requiredGroup = (c as any).group_id as string;
      if (requiredGroup && requiredGroup !== targetGroupId) {
        if (mode === 'strict') return { ok: false, reason: 'Immovable constraint' };
      }
    }
    return { ok: true };
  };

  const movePerson = (personId: string, _fromGroupId: string | undefined, toGroupId: string, sessionId: number) => {
    if (!draft) return;
    const check = canDrop(personId, toGroupId, sessionId);
    if (!check.ok && mode === 'strict') {
      addNotification({ type: 'error', title: 'Move blocked', message: check.reason || 'Not allowed' });
      return;
    }

    const next = cloneAssignments(draft.assignments);
    // remove existing assignment for this person & session
    for (let i = next.length - 1; i >= 0; i--) {
      const a = next[i];
      if (a.person_id === personId && a.session_id === sessionId) {
        next.splice(i, 1);
      }
    }
    next.push({ person_id: personId, group_id: toGroupId, session_id: sessionId });
    pushHistory(next);
  };

  // UI builders
  const renderTopBar = () => {
    // Reserved for objective deltas in a future iteration

    return (
      <div className="rounded-lg border p-3 mb-4 flex flex-wrap gap-2 items-center justify-between" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Mode:</span>
          <button onClick={() => setMode('strict')} className="px-2 py-1 rounded text-xs border" style={{ color: mode==='strict' ? 'var(--color-accent)' : 'var(--text-secondary)', borderColor: mode==='strict' ? 'var(--color-accent)' : 'var(--border-primary)', backgroundColor: mode==='strict' ? 'var(--bg-tertiary)' : 'transparent' }}>Strict</button>
          <button onClick={() => setMode('warn')} className="px-2 py-1 rounded text-xs border" style={{ color: mode==='warn' ? 'var(--color-accent)' : 'var(--text-secondary)', borderColor: mode==='warn' ? 'var(--color-accent)' : 'var(--border-primary)', backgroundColor: mode==='warn' ? 'var(--bg-tertiary)' : 'transparent' }}>Warn</button>
          <button onClick={() => setMode('free')} className="px-2 py-1 rounded text-xs border" style={{ color: mode==='free' ? 'var(--color-accent)' : 'var(--text-secondary)', borderColor: mode==='free' ? 'var(--color-accent)' : 'var(--border-primary)', backgroundColor: mode==='free' ? 'var(--bg-tertiary)' : 'transparent' }}>Free</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={undo} className="px-2 py-1 rounded text-xs border" title="Undo" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}>
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={redo} className="px-2 py-1 rounded text-xs border" title="Redo" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}>
            <Redo2 className="w-4 h-4" />
          </button>
          <button onClick={saveDraft} className="px-2 py-1 rounded text-xs border" title="Save as new result" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}>
            <Save className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderSidebar = () => {
    const metrics = baselineMetrics;
    const totalViolations = compliance.reduce((acc, c) => acc + c.violationsCount, 0);
    return (
      <div className="w-full lg:w-64 flex-shrink-0 space-y-3">
        <div className="rounded-lg border p-3" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
          <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Live Metrics</div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex items-center justify-between py-1">
              <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> Unique Contacts</span>
              <span>{metrics ? `${metrics.avgUniqueContacts.toFixed(1)} avg` : '-'}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Violations</span>
              <span>{totalViolations}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Hard Violations</span>
              <span>{hardViolationsCount}</span>
            </div>
          </div>
        </div>
        <div className="rounded-lg border p-3" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
          <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Session</div>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: effectiveProblem.num_sessions }, (_, s) => (
              <button key={s} onClick={() => setActiveSession(s)} className="px-2 py-1 rounded text-xs border" style={{ color: activeSession===s ? 'var(--color-accent)' : 'var(--text-secondary)', borderColor: activeSession===s ? 'var(--color-accent)' : 'var(--border-primary)', backgroundColor: activeSession===s ? 'var(--bg-tertiary)' : 'transparent' }}>{s+1}</button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderGroupColumn = (group: Group) => {
    const peopleIds = draftSchedule[activeSession]?.[group.id] || [];
    const overBy = Math.max(0, peopleIds.length - group.size);
    const headerColor = overBy > 0 ? 'text-red-600' : 'var(--text-primary)';

    const onDropHandler = async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      try { console.debug('[ManualEditor] drop on', group.id, 'session', activeSession); } catch {}
      const personId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
      if (!personId) return;
      const fromGroupId = Object.entries(draftSchedule[activeSession] || {}).find(([_, list]) => list.includes(personId))?.[0];
      // Prepare before snapshot for report
      let beforeScore = { final_score: 0, unique_contacts: 0, repetition_penalty: 0, attribute_balance_penalty: 0, constraint_penalty: 0 };
      let beforeCompliance = compliance;
      if (effectiveProblem) {
        try {
          const beforeEval = await wasmService.evaluateSolution(effectiveProblem, draftAssignments);
          beforeScore = {
            final_score: beforeEval.final_score,
            unique_contacts: beforeEval.unique_contacts,
            repetition_penalty: beforeEval.repetition_penalty,
            attribute_balance_penalty: beforeEval.attribute_balance_penalty,
            constraint_penalty: beforeEval.constraint_penalty,
          };
          beforeCompliance = evaluateCompliance(effectiveProblem, beforeEval as unknown as Solution);
        } catch {}
      }

      movePerson(personId, fromGroupId, group.id, activeSession);

      if (elaborateReportsEnabled && effectiveProblem) {
        try {
          // After state has been pushed, evaluate with new assignments
          const afterEval = await wasmService.evaluateSolution(effectiveProblem, [...draftAssignments.filter(a => !(a.person_id === personId && a.session_id === activeSession)), { person_id: personId, group_id: group.id, session_id: activeSession }]);
          const afterScore = {
            final_score: afterEval.final_score,
            unique_contacts: afterEval.unique_contacts,
            repetition_penalty: afterEval.repetition_penalty,
            attribute_balance_penalty: afterEval.attribute_balance_penalty,
            constraint_penalty: afterEval.constraint_penalty,
          };
          const afterCompliance = evaluateCompliance(effectiveProblem, afterEval as unknown as Solution);
          setReportData({ before: { score: beforeScore, compliance: beforeCompliance }, after: { score: afterScore, compliance: afterCompliance }, people: effectiveProblem.people });
          setShowReport(true);
        } catch (e) {
          console.warn('Failed to build change report:', e);
        }
      }
      setDraggingPerson(null);
      setPreviewDelta(null);
      setPreviewKey(null);
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      try { console.debug('[ManualEditor] dragover on', group.id); } catch {}
      if (draggingPerson) {
        computePreview(draggingPerson, group.id, activeSession);
      }
    };

    const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (draggingPerson) {
        try { console.debug('[ManualEditor] dragenter on', group.id); } catch {}
        computePreview(draggingPerson, group.id, activeSession);
      }
    };

    const onDragLeave = () => {
      // Clear preview when leaving the target group (lightweight UX)
      try { console.debug('[ManualEditor] dragleave on', group.id); } catch {}
      setPreviewDelta(null);
      setPreviewKey(null);
    };

    return (
      <div key={group.id} className="flex flex-col rounded-lg border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="min-w-0">
            <div className="text-sm font-medium" style={{ color: headerColor }}>{group.id}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Capacity {peopleIds.length}/{group.size}</div>
          </div>
          <div className="flex items-center gap-2">
            {draggingPerson && previewDelta && previewDelta.groupId === group.id && (
              <span className="px-2 py-0.5 rounded text-xs font-medium border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
                <span className={previewDelta.scoreDelta <= 0 ? 'text-green-600' : 'text-red-600'}>Δscore {previewDelta.scoreDelta > 0 ? '+' : ''}{previewDelta.scoreDelta.toFixed(2)}</span>
                <span className="mx-1">·</span>
                <span className={previewDelta.uniqueDelta >= 0 ? 'text-green-600' : 'text-red-600'}>Δunique {previewDelta.uniqueDelta > 0 ? '+' : ''}{previewDelta.uniqueDelta}</span>
                <span className="mx-1">·</span>
                <span className={previewDelta.constraintDelta <= 0 ? 'text-green-600' : 'text-red-600'}>Δviol {previewDelta.constraintDelta > 0 ? '+' : ''}{previewDelta.constraintDelta}</span>
              </span>
            )}
            <button onClick={() => toggleGroupLock(group.id)} className="px-2 py-1 rounded text-xs border" title={isGroupLocked(group.id) ? 'Unlock group' : 'Lock group'} style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}>
              {isGroupLocked(group.id) ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div
          className="p-3 space-y-2 min-h-[120px]"
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDropHandler}
          onDragEnd={(e) => { e.preventDefault(); setDraggingPerson(null); setPreviewDelta(null); setPreviewKey(null); }}
        >
          <div className="space-y-2 select-none">
          {peopleIds.map((pid) => {
            const person = effectiveProblem.people.find((p) => p.id === pid);
            if (!person) return null;
            const dragStart = (e: React.DragEvent) => {
              if (isPersonLocked(pid) || isGroupLocked(group.id)) {
                e.preventDefault();
                return;
              }
              e.dataTransfer.setData('text/plain', pid);
              e.dataTransfer.setData('text', pid);
              try { e.dataTransfer.effectAllowed = 'move'; } catch {}
              try { console.debug('[ManualEditor] dragstart person', pid, 'from group', group.id, 'session', activeSession); } catch {}
              setDraggingPerson(pid);
            };
            const dragEnd = () => { setDraggingPerson(null); setPreviewDelta(null); setPreviewKey(null); };
            return (
              <div key={pid} draggable onDragStart={dragStart} onDragEnd={dragEnd} className="flex items-center justify-between pointer-events-auto">
                <PersonCard person={person} />
                <button onClick={() => togglePersonLock(pid)} className="ml-2 px-2 py-1 rounded text-xs border" title={isPersonLocked(pid) ? 'Unlock person' : 'Lock person'} style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}>
                  {isPersonLocked(pid) ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
          </div>
          {/* Empty drop zone filler to catch drops below the last item */}
          <div className="h-8" style={{ pointerEvents: 'none' }} />
        </div>
      </div>
    );
  };

  const renderCanvas = () => {
    return (
      <div className="flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {effectiveProblem.groups.map((g) => renderGroupColumn(g))}
        </div>
      </div>
    );
  };

  // Prepare a Solution object for the reusable compliance component
  const complianceSolution: Solution = evaluated ?? {
    assignments: draftAssignments,
    final_score: 0,
    unique_contacts: 0,
    repetition_penalty: 0,
    attribute_balance_penalty: 0,
    constraint_penalty: 0,
    iteration_count: 0,
    elapsed_time_ms: 0,
    weighted_repetition_penalty: 0,
    weighted_constraint_penalty: 0,
  } as Solution;

  const renderStatusBar = () => {
    const draftUnique = evaluated?.unique_contacts ?? (() => {
      const pc = effectiveProblem.people.length || 1;
      return computeUniqueContacts(draftAssignments, pc).uniqueContacts;
    })();
    const baseUnique = solution.unique_contacts || 0;

    const draftConstraint = evaluated?.constraint_penalty ?? compliance.reduce((acc, c) => acc + c.violationsCount, 0);
    const baseConstraint = solution.constraint_penalty ?? baselineCompliance.reduce((acc, c) => acc + c.violationsCount, 0);

    const deltaUnique = draftUnique - baseUnique;
    const deltaViolations = draftConstraint - baseConstraint;
    const deltaUniqueSign = deltaUnique === 0 ? '' : deltaUnique > 0 ? '+' : '';
    const deltaViolationsSign = deltaViolations === 0 ? '' : deltaViolations > 0 ? '+' : '';

    const baseScore = solution.final_score;
    const draftScore = evaluated?.final_score ?? baseScore;
    const deltaScore = draftScore - baseScore;
    const deltaScoreSign = deltaScore === 0 ? '' : deltaScore > 0 ? '+' : '';

    return (
      <div className="rounded-lg border p-3" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex flex-wrap gap-4 text-sm items-center">
          {evalLoading && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Evaluating…</span>
          )}
          {evalError && (
            <span className="text-xs text-red-600">{evalError}</span>
          )}
          <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            <Target className="w-4 h-4" />
            <span>Cost score: <span style={{ color: 'var(--text-primary)' }}>{draftScore.toFixed(2)}</span> (<span className={deltaScore <= 0 ? 'text-green-600' : 'text-red-600'}>{deltaScoreSign}{deltaScore.toFixed(2)}</span>)</span>
          </div>
          <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            <Users className="w-4 h-4" />
            <span>Unique contacts: <span style={{ color: 'var(--text-primary)' }}>{draftUnique}</span> (<span className={deltaUnique >= 0 ? 'text-green-600' : 'text-red-600'}>{deltaUniqueSign}{deltaUnique}</span>)</span>
          </div>
          <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            <AlertTriangle className="w-4 h-4" />
            <span>Violations: <span style={{ color: 'var(--text-primary)' }}>{draftConstraint}</span> (<span className={deltaViolations <= 0 ? 'text-green-600' : 'text-red-600'}>{deltaViolationsSign}{deltaViolations}</span>)</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Target className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
        <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Manual Editor</h2>
        <label className="ml-4 inline-flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={elaborateReportsEnabled} onChange={(e) => setElaborateReportsEnabled(e.target.checked)} />
          Enable detailed change report
        </label>
      </div>
      {renderTopBar()}
      <div className="flex flex-col lg:flex-row gap-4">
        {renderSidebar()}
        <div className="flex-1 space-y-4">
          {renderCanvas()}
          <ConstraintComplianceCards problem={effectiveProblem} solution={complianceSolution} />
          {renderStatusBar()}
        </div>
      </div>
      <ChangeReportModal open={showReport} onClose={() => setShowReport(false)} data={reportData} />
    </div>
  );
}

export { ManualEditor };


