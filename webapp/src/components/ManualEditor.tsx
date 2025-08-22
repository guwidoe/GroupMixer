import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import type { Assignment, Group, Problem, Solution, Constraint } from '../types';
import { AlertTriangle, CheckCircle2, Lock, LockOpen, Save, Undo2, Redo2, Users, Target, Archive, UserPlus, Gavel } from 'lucide-react';
import PersonCard from './PersonCard';
import { calculateMetrics } from '../utils/metricCalculations';
import { evaluateCompliance, buildScheduleMap, computeUniqueContacts } from '../services/evaluator';
import { wasmService } from '../services/wasm';
import ChangeReportModal, { ChangeReportData } from './ChangeReportModal';
import ConstraintComplianceCards from './ConstraintComplianceCards';
import { useNavigate, useLocation } from 'react-router-dom';

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
  const navigate = useNavigate();
  const location = useLocation();
  const problem = useAppStore((s) => s.problem);
  const solution = useAppStore((s) => s.solution);
  const addNotification = useAppStore((s) => s.addNotification);
  const addResult = useAppStore((s) => s.addResult);
  const currentProblemId = useAppStore((s) => s.currentProblemId);
  const savedProblems = useAppStore((s) => s.savedProblems);

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

  // Storage board state: explicit per-session membership of temporarily removed people
  const [storage, setStorage] = useState<Record<number, Set<string>>>({});
  const getStorageSet = (sessionId: number) => storage[sessionId] ?? new Set<string>();
  const addToStorage = (sessionId: number, personId: string) => {
    setStorage((prev) => {
      const next = { ...prev };
      const setForSession = new Set(next[sessionId] ?? []);
      setForSession.add(personId);
      next[sessionId] = setForSession;
      return next;
    });
  };
  const removeFromStorage = (sessionId: number, personId: string) => {
    setStorage((prev) => {
      const next = { ...prev };
      const setForSession = new Set(next[sessionId] ?? []);
      setForSession.delete(personId);
      next[sessionId] = setForSession;
      return next;
    });
  };

  // Newly detected constraints pulled from current problem compared to the active result's snapshot
  const [pulledConstraints, setPulledConstraints] = useState<Constraint[]>([]);

  // Initialize draft from existing solution
  useEffect(() => {
    if (solution) {
      setDraft({ assignments: cloneAssignments(solution.assignments) });
      setHistory([]);
      setFuture([]);
      setActiveSession(0);
      setStorage({});
      setPulledConstraints([]);
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
  const [pendingMove, setPendingMove] = useState<{
    personId: string;
    fromGroupId?: string;
    toGroupId: string;
    sessionId: number;
    prevAssignments: Assignment[];
  } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const setGlobalUnsaved = useAppStore((s) => s.setManualEditorUnsaved);
  const setLeaveHook = useAppStore((s) => s.setManualEditorLeaveHook);
  const [pendingNextPath, setPendingNextPath] = useState<string | null>(null);
  const proceedingRef = React.useRef(false);

  // Register a route-leave hook so Navigation can trigger our modal
  useEffect(() => {
    setLeaveHook((nextPath: string) => {
      if (hasUnsavedChanges) {
        setShowLeaveConfirm(true);
        // Remember intended destination
        navigate(location.pathname, { replace: true, state: { nextPath } });
      } else {
        navigate(nextPath);
      }
    });
    return () => {
      setLeaveHook(null);
      setGlobalUnsaved(false);
    };
  }, [hasUnsavedChanges, setLeaveHook, setGlobalUnsaved, navigate, location.pathname]);

  // Global route blocking for in-app navigations (pushState/replaceState, back/forward, anchor clicks)
  useEffect(() => {
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;

    function shouldBlock(nextUrl: string) {
      if (!hasUnsavedChanges) return false;
      try {
        const next = new URL(nextUrl, window.location.origin);
        const curr = new URL(window.location.href);
        return next.pathname !== curr.pathname || next.search !== curr.search || next.hash !== curr.hash;
      } catch {
        return hasUnsavedChanges;
      }
    }

    // Patch history methods
    (window.history as any).pushState = function pushStatePatched(this: History, ...args: any[]) {
      const url = args[2];
      if (!proceedingRef.current && typeof url === 'string' && shouldBlock(url)) {
        setPendingNextPath(url);
        setShowLeaveConfirm(true);
        return;
      }
      return originalPush.apply(this, args as any);
    } as typeof window.history.pushState;

    (window.history as any).replaceState = function replaceStatePatched(this: History, ...args: any[]) {
      const url = args[2];
      if (!proceedingRef.current && typeof url === 'string' && shouldBlock(url)) {
        setPendingNextPath(url);
        setShowLeaveConfirm(true);
        return;
      }
      return originalReplace.apply(this, args as any);
    } as typeof window.history.replaceState;

    // Intercept anchor clicks (capturing phase)
    const onClickCapture = (e: Event) => {
      if (!hasUnsavedChanges) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || anchor.target === '_blank') return;
      // Only handle same-origin relative navigations
      if (anchor.origin !== window.location.origin) return;
      e.preventDefault();
      setPendingNextPath(anchor.pathname + anchor.search + anchor.hash);
      setShowLeaveConfirm(true);
    };
    document.addEventListener('click', onClickCapture, true);

    // Intercept back/forward
    const onPopState = () => {
      if (!hasUnsavedChanges || proceedingRef.current) return;
      setPendingNextPath(null);
      setShowLeaveConfirm(true);
      // revert navigation immediately
      window.history.pushState(null, '', location.pathname + location.search + location.hash);
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      // restore originals
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
      document.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, [hasUnsavedChanges, location.pathname, location.search, location.hash]);

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

  const notReady = !effectiveProblem || !solution || !draft;

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
    if (!draft) return;
    setHistory((h) => [...h, { assignments: cloneAssignments(draft.assignments) }]);
    setFuture([]);
    setDraft({ assignments: nextAssignments });
    setHasUnsavedChanges(true);
    setGlobalUnsaved(true);
  };

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      if (draft) {
        setFuture((f) => [{ assignments: cloneAssignments(draft.assignments) }, ...f]);
        setDraft({ assignments: cloneAssignments(prev.assignments) });
      }
      return h.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      if (draft) {
        setHistory((h) => [...h, { assignments: cloneAssignments(draft.assignments) }]);
        setDraft({ assignments: cloneAssignments(next.assignments) });
      }
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
    if (!effectiveProblem) return { ok: false, reason: 'No problem loaded' };
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
    // Remove from storage if present
    removeFromStorage(sessionId, personId);
  };

  // UI builders
  const renderTopBar = () => {
    // Reserved for objective deltas in a future iteration

    const handlePullNewPeople = () => {
      if (!effectiveProblem) return;
      const allSessions = Array.from({ length: effectiveProblem.num_sessions }, (_, i) => i);
      const assignedBySession = new Map<number, Set<string>>();
      draftAssignments.forEach((a) => {
        if (!assignedBySession.has(a.session_id)) assignedBySession.set(a.session_id, new Set());
        assignedBySession.get(a.session_id)!.add(a.person_id);
      });

      const assignedAny = new Set(draftAssignments.map((a) => a.person_id));
      const newPeople = effectiveProblem.people.filter((p) => !assignedAny.has(p.id));

      let addedCount = 0;
      newPeople.forEach((p) => {
        const sessions = p.sessions && p.sessions.length > 0 ? p.sessions : allSessions;
        sessions.forEach((s) => {
          const setForSession = assignedBySession.get(s) ?? new Set<string>();
          // Only add to storage for sessions where they are not yet assigned
          if (!setForSession.has(p.id)) {
            addToStorage(s, p.id);
            addedCount++;
          }
        });
      });

      if (newPeople.length === 0) {
        addNotification({ type: 'info', title: 'No New People', message: 'All people already exist in this result.' });
      } else {
        addNotification({ type: 'success', title: 'Pulled People', message: `Added ${newPeople.length} people into storage across sessions (${addedCount} entries).` });
      }
    };

    const handlePullNewConstraints = () => {
      if (!effectiveProblem || !solution || !currentProblemId) return;
      const currentSaved = savedProblems[currentProblemId];
      if (!currentSaved) return;
      const result = currentSaved.results.find(r => r.solution === solution);
      const snapshotConstraints = result?.problemSnapshot?.constraints ?? [];
      const currentConstraints = effectiveProblem.constraints ?? [];
      const key = (c: Constraint) => JSON.stringify(c);
      const snapshotSet = new Set(snapshotConstraints.map(key));
      const newOnes = currentConstraints.filter(c => !snapshotSet.has(key(c)));
      setPulledConstraints(newOnes);
      addNotification({ type: 'info', title: 'Pulled Constraints', message: newOnes.length === 0 ? 'No new constraints.' : `Found ${newOnes.length} new constraints.` });
    };

    return (
      <div className="rounded-lg border p-3 mb-4 flex flex-wrap gap-2 items-center justify-between" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Mode:</span>
          <button onClick={() => setMode('strict')} className="px-2 py-1 rounded text-xs border" style={{ color: mode==='strict' ? 'var(--color-accent)' : 'var(--text-secondary)', borderColor: mode==='strict' ? 'var(--color-accent)' : 'var(--border-primary)', backgroundColor: mode==='strict' ? 'var(--bg-tertiary)' : 'transparent' }}>Strict</button>
          <button onClick={() => setMode('warn')} className="px-2 py-1 rounded text-xs border" style={{ color: mode==='warn' ? 'var(--color-accent)' : 'var(--text-secondary)', borderColor: mode==='warn' ? 'var(--color-accent)' : 'var(--border-primary)', backgroundColor: mode==='warn' ? 'var(--bg-tertiary)' : 'transparent' }}>Warn</button>
          <button onClick={() => setMode('free')} className="px-2 py-1 rounded text-xs border" style={{ color: mode==='free' ? 'var(--color-accent)' : 'var(--text-secondary)', borderColor: mode==='free' ? 'var(--color-accent)' : 'var(--border-primary)', backgroundColor: mode==='free' ? 'var(--bg-tertiary)' : 'transparent' }}>Free</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePullNewPeople} className="px-2 py-1 rounded text-xs border inline-flex items-center gap-1" title="Pull new people from current problem into storage for all relevant sessions" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}>
            <UserPlus className="w-4 h-4" /> Pull new people
          </button>
          <button onClick={handlePullNewConstraints} className="px-2 py-1 rounded text-xs border inline-flex items-center gap-1" title="Pull new constraints from current problem" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}>
            <Gavel className="w-4 h-4" /> Pull constraints
          </button>
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
            {Array.from({ length: effectiveProblem ? effectiveProblem.num_sessions : 0 }, (_, s) => (
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

      // Stage the move but do not commit yet
      const prevAssignments = draft ? cloneAssignments(draft.assignments) : [];
      const staged = draft ? cloneAssignments(draft.assignments).filter(a => !(a.person_id === personId && a.session_id === activeSession)) : [];
      staged.push({ person_id: personId, group_id: group.id, session_id: activeSession });

      // Mode behavior:
      // - free: commit immediately
      // - warn: show detailed change report
      // - strict: currently same as warn; stricter validation can be added later
      const shouldShowReport = (mode === 'warn' || mode === 'strict');
      if (shouldShowReport && effectiveProblem) {
        try {
          // After state has been pushed, evaluate with new assignments
          const afterEval = await wasmService.evaluateSolution(effectiveProblem, staged);
          const afterScore = {
            final_score: afterEval.final_score,
            unique_contacts: afterEval.unique_contacts,
            repetition_penalty: afterEval.repetition_penalty,
            attribute_balance_penalty: afterEval.attribute_balance_penalty,
            constraint_penalty: afterEval.constraint_penalty,
          };
          const afterCompliance = evaluateCompliance(effectiveProblem, afterEval as unknown as Solution);
          setReportData({ before: { score: beforeScore, compliance: beforeCompliance }, after: { score: afterScore, compliance: afterCompliance }, people: effectiveProblem.people });
          // Show modal for warn/strict
          if (shouldShowReport) {
            setPendingMove({ personId, fromGroupId, toGroupId: group.id, sessionId: activeSession, prevAssignments });
            setShowReport(true);
          } else {
            // Commit immediately
            movePerson(personId, fromGroupId, group.id, activeSession);
          }
        } catch (e) {
          console.warn('Failed to build change report:', e);
          // If evaluation fails, still perform the move to keep editor usable
          if (!shouldShowReport) {
            movePerson(personId, fromGroupId, group.id, activeSession);
          }
        }
      } else {
        // free mode: commit immediately
        movePerson(personId, fromGroupId, group.id, activeSession);
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
            const person = effectiveProblem ? effectiveProblem.people.find((p) => p.id === pid) : null;
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
          {(effectiveProblem ? effectiveProblem.groups : []).map((g) => renderGroupColumn(g))}
        </div>
      </div>
    );
  };

  const renderStoragePanel = () => {
    const storedIds = Array.from(getStorageSet(activeSession));

    const onDropToStorage = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const personId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
      if (!personId) return;
      if (isPersonLocked(personId)) return;

      // Remove assignment for active session and add to storage
      if (draft) {
        const next = cloneAssignments(draft.assignments).filter(a => !(a.person_id === personId && a.session_id === activeSession));
        pushHistory(next);
      }
      addToStorage(activeSession, personId);
      setDraggingPerson(null);
      setPreviewDelta(null);
      setPreviewKey(null);
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    };

    // Note: pull buttons moved to top bar to act across all sessions

    return (
      <div className="w-full lg:w-64 flex-shrink-0 space-y-3">
        <div className="rounded-lg border p-3" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Storage · Session {activeSession + 1}
            </div>
            <Archive className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          </div>
          {/* Pull buttons moved to top bar (global), not per-session */}
          <div
            className="p-2 rounded border min-h-[120px]"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
            onDragOver={onDragOver}
            onDrop={onDropToStorage}
          >
            {storedIds.length === 0 ? (
              <div className="text-xs italic" style={{ color: 'var(--text-tertiary)' }}>Drag people here to temporarily remove from this session</div>
            ) : (
              <div className="space-y-2">
                {storedIds.map((pid) => {
                  const person = effectiveProblem ? effectiveProblem.people.find((p) => p.id === pid) : null;
                  if (!person) return null;
                  const dragStart = (e: React.DragEvent) => {
                    if (isPersonLocked(pid)) { e.preventDefault(); return; }
                    e.dataTransfer.setData('text/plain', pid);
                    e.dataTransfer.setData('text', pid);
                    try { e.dataTransfer.effectAllowed = 'move'; } catch {}
                    setDraggingPerson(pid);
                  };
                  const dragEnd = () => { setDraggingPerson(null); };
                  return (
                    <div key={pid} draggable onDragStart={dragStart} onDragEnd={dragEnd} className="flex items-center justify-between pointer-events-auto">
                      <PersonCard person={person} />
                      <button onClick={() => removeFromStorage(activeSession, pid)} className="ml-2 px-2 py-1 rounded text-xs border" title="Remove from storage" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}>
                        <LockOpen className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {pulledConstraints && (
          <div className="rounded-lg border p-3" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
            <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>New Constraints</div>
            {pulledConstraints.length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>None</div>
            ) : (
              <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {pulledConstraints.map((c, idx) => (
                  <div key={idx} className="px-2 py-1 rounded border" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.type}</span>
                    <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>{/* lightweight summary */}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              Pulled from current problem configuration compared to the result's snapshot.
            </div>
          </div>
        )}
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
      if (!effectiveProblem) return 0;
      const pc = effectiveProblem.people.length || 1;
      return computeUniqueContacts(draftAssignments, pc).uniqueContacts;
    })();
    const baseUnique = solution?.unique_contacts || 0;

    const draftConstraint = evaluated?.constraint_penalty ?? compliance.reduce((acc, c) => acc + c.violationsCount, 0);
    const baseConstraint = (solution?.constraint_penalty ?? 0) || baselineCompliance.reduce((acc, c) => acc + c.violationsCount, 0);

    const deltaUnique = draftUnique - baseUnique;
    const deltaViolations = draftConstraint - baseConstraint;
    const deltaUniqueSign = deltaUnique === 0 ? '' : deltaUnique > 0 ? '+' : '';
    const deltaViolationsSign = deltaViolations === 0 ? '' : deltaViolations > 0 ? '+' : '';

    const baseScore = solution?.final_score ?? 0;
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
        {/* Detailed change report is controlled by mode: Warn/Strict show the modal; Free commits immediately */}
        {hasUnsavedChanges && (
          <span className="ml-3 px-2 py-0.5 rounded text-xs border" style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}>Unsaved changes</span>
        )}
      </div>
      {notReady ? (
        <div>
          <div className="rounded-lg border p-6" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
            <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <AlertTriangle className="w-5 h-5" />
              <span>Select a result first. The Manual Editor activates when a solution is available.</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          {renderTopBar()}
          <div className="flex flex-col lg:flex-row gap-4">
            {renderSidebar()}
            <div className="flex-1 lg:flex lg:flex-row lg:items-start gap-4">
              <div className="flex-1 space-y-4">
                {renderCanvas()}
                <ConstraintComplianceCards problem={effectiveProblem} solution={complianceSolution} />
                {renderStatusBar()}
              </div>
              {renderStoragePanel()}
            </div>
          </div>
        </>
      )}
      <ChangeReportModal
        open={showReport}
        data={reportData}
        onAccept={() => {
          if (pendingMove) {
            movePerson(pendingMove.personId, pendingMove.fromGroupId, pendingMove.toGroupId, pendingMove.sessionId);
          }
          setShowReport(false);
          setPendingMove(null);
        }}
        onCancel={() => {
          if (pendingMove) {
            // Revert to previous assignments
            setDraft({ assignments: cloneAssignments(pendingMove.prevAssignments) });
          }
          setShowReport(false);
          setPendingMove(null);
        }}
        onClose={() => {
          // Treat close like cancel per request
          if (pendingMove) {
            setDraft({ assignments: cloneAssignments(pendingMove.prevAssignments) });
          }
          setShowReport(false);
          setPendingMove(null);
        }}
      />

      {/* Leave confirmation modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="rounded-lg border w-full max-w-md" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Unsaved changes</div>
              <div className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                You have unsaved changes. Save as a new result before leaving?
              </div>
            </div>
            <div className="p-4 flex items-center justify-end gap-2">
              <button className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }} onClick={() => { setShowLeaveConfirm(false); }}>Cancel</button>
              <button className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }} onClick={() => { setShowLeaveConfirm(false); setHasUnsavedChanges(false); useAppStore.getState().setManualEditorUnsaved(false); proceedingRef.current = true; const next = (location.state as any)?.nextPath || pendingNextPath || '/app/results'; if (next) { window.history.pushState(null, '', next); navigate(next); } proceedingRef.current = false; }}>Discard and continue</button>
              <button className="px-3 py-1.5 rounded text-sm" style={{ backgroundColor: 'var(--color-accent)', color: 'white' }} onClick={() => {
                // Save draft as new result then continue
                const peopleCount = effectiveProblem?.people.length || 1;
                const { uniqueContacts } = computeUniqueContacts(draftAssignments, peopleCount);
                const draftSolution = {
                  assignments: cloneAssignments(draftAssignments),
                  final_score: evaluated?.final_score ?? 0,
                  unique_contacts: evaluated?.unique_contacts ?? uniqueContacts,
                  repetition_penalty: evaluated?.repetition_penalty ?? 0,
                  attribute_balance_penalty: evaluated?.attribute_balance_penalty ?? 0,
                  constraint_penalty: evaluated?.constraint_penalty ?? 0,
                  iteration_count: 0,
                  elapsed_time_ms: 0,
                  weighted_repetition_penalty: evaluated?.weighted_repetition_penalty ?? 0,
                  weighted_constraint_penalty: evaluated?.weighted_constraint_penalty ?? 0,
                } as unknown as import('../types').Solution;
                if (effectiveProblem) {
                  useAppStore.getState().addResult(draftSolution, effectiveProblem.settings, 'Manual Draft');
                }
                setShowLeaveConfirm(false);
                setHasUnsavedChanges(false);
                useAppStore.getState().setManualEditorUnsaved(false);
                proceedingRef.current = true;
                const next = (location.state as any)?.nextPath || pendingNextPath || '/app/results';
                window.history.pushState(null, '', next);
                navigate(next);
                proceedingRef.current = false;
              }}>Save as new result</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { ManualEditor };


