import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import { useAppStore } from '../../store';
import type { Constraint, Problem, Solution } from '../../types';
import { calculateMetrics } from '../../utils/metricCalculations';
import { computeUniqueContacts, evaluateCompliance } from '../../services/evaluator';
import ChangeReportModal, { ChangeReportData } from '../ChangeReportModal';
import ConstraintComplianceCards from '../ConstraintComplianceCards';
import { ManualEditorTopBar } from './ManualEditorTopBar';
import { ManualEditorSidebar } from './ManualEditorSidebar';
import { ManualEditorGroupColumn } from './ManualEditorGroupColumn';
import { ManualEditorStoragePanel } from './ManualEditorStoragePanel';
import { ManualEditorStatusBar } from './ManualEditorStatusBar';
import { ManualEditorNotReady } from './ManualEditorNotReady';
import { ManualEditorLeaveConfirmModal } from './ManualEditorLeaveConfirmModal';
import type { Mode, PendingMove } from './types';
import { cloneAssignments, groupBySessionAndGroup, snapshotToProblem } from './utils';
import { useManualEditorDraft } from './hooks/useManualEditorDraft';
import { useManualEditorEvaluation } from './hooks/useManualEditorEvaluation';
import { useManualEditorNavigationGuard } from './hooks/useManualEditorNavigationGuard';
import { pullNewConstraints, pullNewPeople } from './pullHandlers';
import { canDrop } from './moveUtils';
import { buildManualDraftSolution } from './draftSolution';
import { discardAndContinue, saveAndContinue } from './leaveActions';

export function ManualEditorContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const problem = useAppStore((s) => s.problem);
  const solution = useAppStore((s) => s.solution);
  const addNotification = useAppStore((s) => s.addNotification);
  const addResult = useAppStore((s) => s.addResult);
  const currentProblemId = useAppStore((s) => s.currentProblemId);
  const savedProblems = useAppStore((s) => s.savedProblems);
  const setGlobalUnsaved = useAppStore((s) => s.setManualEditorUnsaved);
  const setLeaveHook = useAppStore((s) => s.setManualEditorLeaveHook);

  const [activeSession, setActiveSession] = useState(0);
  const [mode, setMode] = useState<Mode>('warn');
  const [lockedPeople, setLockedPeople] = useState<Set<string>>(new Set());
  const [lockedGroups, setLockedGroups] = useState<Set<string>>(new Set());
  const [draggingPerson, setDraggingPerson] = useState<string | null>(null);

  const {
    draft,
    setDraft,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    getStorageSet,
    addToStorage,
    removeFromStorage,
    pushHistory,
    undo,
    redo,
  } = useManualEditorDraft({ solution, setGlobalUnsaved });

  const [pulledConstraints, setPulledConstraints] = useState<Constraint[]>([]);

  const draftAssignments = useMemo(() => draft?.assignments ?? [], [draft]);
  const draftSchedule = useMemo(() => groupBySessionAndGroup(draftAssignments), [draftAssignments]);

  const currentResult = useMemo(() => {
    if (!currentProblemId || !solution) return undefined;
    const saved = savedProblems[currentProblemId];
    if (!saved) return undefined;
    return saved.results.find((r) => r.solution === solution);
  }, [currentProblemId, savedProblems, solution]);

  const effectiveProblem: Problem | null = useMemo(() => {
    if (currentResult?.problemSnapshot) {
      return snapshotToProblem(currentResult.problemSnapshot, currentResult.solverSettings);
    }
    return problem;
  }, [currentResult, problem]);

  const baselineMetrics = useMemo(
    () => (effectiveProblem && solution ? calculateMetrics(effectiveProblem, solution) : null),
    [effectiveProblem, solution],
  );
  const baselineCompliance = useMemo(
    () => (effectiveProblem && solution ? evaluateCompliance(effectiveProblem, solution) : []),
    [effectiveProblem, solution],
  );

  const compliance = useMemo(
    () => (effectiveProblem ? evaluateCompliance(effectiveProblem, { assignments: draftAssignments } as Solution) : []),
    [effectiveProblem, draftAssignments],
  );
  const complianceViolationCount = compliance.reduce((acc, c) => acc + c.violationsCount, 0);

  const { evaluated, evalLoading, evalError, previewDelta, computePreview, clearPreview } =
    useManualEditorEvaluation({
      effectiveProblem,
      draftAssignments,
      solution,
      complianceViolationCount,
    });

  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState<ChangeReportData | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingNextPath, setPendingNextPath] = useState<string | null>(null);
  const proceedingRef = React.useRef(false);

  useManualEditorNavigationGuard({
    hasUnsavedChanges,
    setShowLeaveConfirm,
    setPendingNextPath,
    setLeaveHook,
    setGlobalUnsaved,
    navigate,
    location,
    proceedingRef,
  });

  const hardViolationsCount = useMemo(() => {
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
          if (ct > g.size) count += ct - g.size;
        });
      });
    }
    return count;
  }, [compliance, draftSchedule, effectiveProblem]);

  const notReady = !effectiveProblem || !solution || !draft;

  const saveDraft = () => {
    if (!effectiveProblem) return;
    const draftSolution = buildManualDraftSolution({
      assignments: draftAssignments,
      peopleCount: effectiveProblem.people.length || 1,
    });

    try {
      addResult(draftSolution, effectiveProblem.settings, 'Manual Draft', effectiveProblem);
      addNotification({ type: 'success', title: 'Draft Saved', message: 'Saved as a new result.' });
    } catch (e) {
      addNotification({
        type: 'error',
        title: 'Save Failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  };

  const isGroupLocked = (groupId: string) => lockedGroups.has(groupId);
  const isPersonLocked = (personId: string) => lockedPeople.has(personId);

  const toggleGroupLock = (groupId: string) => {
    setLockedGroups((s) => {
      const next = new Set(s);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const togglePersonLock = (personId: string) => {
    setLockedPeople((s) => {
      const next = new Set(s);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  const movePerson = (personId: string, _fromGroupId: string | undefined, toGroupId: string, sessionId: number) => {
    if (!draft) return;
    const check = canDrop({
      effectiveProblem,
      draftSchedule,
      lockedPeople,
      lockedGroups,
      mode,
      personId,
      targetGroupId: toGroupId,
      sessionId,
    });
    if (!check.ok && mode === 'strict') {
      addNotification({ type: 'error', title: 'Move blocked', message: check.reason || 'Not allowed' });
      return;
    }

    const next = cloneAssignments(draft.assignments);
    for (let i = next.length - 1; i >= 0; i--) {
      const a = next[i];
      if (a.person_id === personId && a.session_id === sessionId) {
        next.splice(i, 1);
      }
    }
    next.push({ person_id: personId, group_id: toGroupId, session_id: sessionId });
    pushHistory(next);
    removeFromStorage(sessionId, personId);
  };

  const handlePullNewPeople = () => pullNewPeople({ effectiveProblem, draftAssignments, addToStorage, addNotification });
  const handlePullNewConstraints = () =>
    pullNewConstraints({
      effectiveProblem,
      solution,
      currentProblemId,
      savedProblems,
      setPulledConstraints,
      addNotification,
    });

  const handleDropPerson = async (personId: string, targetGroupId: string, sessionId: number) => {
    if (!draft) return;
    const check = canDrop({
      effectiveProblem,
      draftSchedule,
      lockedPeople,
      lockedGroups,
      mode,
      personId,
      targetGroupId,
      sessionId,
    });
    if (!check.ok && mode === 'strict') {
      addNotification({ type: 'error', title: 'Move blocked', message: check.reason || 'Not allowed' });
      return;
    }

    const fromGroupId = Object.entries(draftSchedule[sessionId] || {}).find(([, list]) => list.includes(personId))?.[0];
    let beforeScore = {
      final_score: 0,
      unique_contacts: 0,
      repetition_penalty: 0,
      attribute_balance_penalty: 0,
      constraint_penalty: 0,
    };
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
      } catch {
        // ignore eval failures for report preview
      }
    }

    const prevAssignments = draft ? cloneAssignments(draft.assignments) : [];
    const staged = draft ? cloneAssignments(draft.assignments).filter((a) => !(a.person_id === personId && a.session_id === sessionId)) : [];
    staged.push({ person_id: personId, group_id: targetGroupId, session_id: sessionId });

    const shouldShowReport = mode === 'warn' || mode === 'strict';
    if (shouldShowReport && effectiveProblem) {
      try {
        const afterEval = await wasmService.evaluateSolution(effectiveProblem, staged);
        const afterScore = {
          final_score: afterEval.final_score,
          unique_contacts: afterEval.unique_contacts,
          repetition_penalty: afterEval.repetition_penalty,
          attribute_balance_penalty: afterEval.attribute_balance_penalty,
          constraint_penalty: afterEval.constraint_penalty,
        };
        const afterCompliance = evaluateCompliance(effectiveProblem, afterEval as unknown as Solution);
        setReportData({
          before: { score: beforeScore, compliance: beforeCompliance },
          after: { score: afterScore, compliance: afterCompliance },
          people: effectiveProblem.people,
        });
        if (shouldShowReport) {
          setPendingMove({ personId, fromGroupId, toGroupId: targetGroupId, sessionId, prevAssignments });
          setShowReport(true);
        } else {
          movePerson(personId, fromGroupId, targetGroupId, sessionId);
        }
      } catch (e) {
        console.warn('Failed to build change report:', e);
        if (!shouldShowReport) {
          movePerson(personId, fromGroupId, targetGroupId, sessionId);
        }
      }
    } else {
      movePerson(personId, fromGroupId, targetGroupId, sessionId);
    }
    setDraggingPerson(null);
    clearPreview();
  };

  const handleDropToStorage = (personId: string) => {
    if (draft) {
      const next = cloneAssignments(draft.assignments).filter(
        (a) => !(a.person_id === personId && a.session_id === activeSession),
      );
      pushHistory(next);
    }
    addToStorage(activeSession, personId);
    setDraggingPerson(null);
    clearPreview();
  };

  const complianceSolution: Solution =
    evaluated ??
    ({
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
    } as Solution);

  const baseScore = solution?.final_score ?? 0;
  const draftScore = evaluated?.final_score ?? baseScore;
  const deltaScore = draftScore - baseScore;

  const draftUnique = evaluated?.unique_contacts ?? (() => {
    if (!effectiveProblem) return 0;
    const pc = effectiveProblem.people.length || 1;
    return computeUniqueContacts(draftAssignments, pc).uniqueContacts;
  })();
  const baseUnique = solution?.unique_contacts || 0;
  const deltaUnique = draftUnique - baseUnique;

  const draftConstraint = evaluated?.constraint_penalty ?? compliance.reduce((acc, c) => acc + c.violationsCount, 0);
  const baseConstraint = (solution?.constraint_penalty ?? 0) || baselineCompliance.reduce((acc, c) => acc + c.violationsCount, 0);
  const deltaViolations = draftConstraint - baseConstraint;

  const totalViolations = compliance.reduce((acc, c) => acc + c.violationsCount, 0);

  const handleCloseReport = () => {
    if (pendingMove) {
      setDraft({ assignments: cloneAssignments(pendingMove.prevAssignments) });
    }
    setShowReport(false);
    setPendingMove(null);
  };

  const handleDiscardAndContinue = () =>
    discardAndContinue({
      setShowLeaveConfirm,
      setHasUnsavedChanges,
      proceedingRef,
      navigate,
      location,
      pendingNextPath,
    });

  const handleSaveAndContinue = () =>
    saveAndContinue({
      effectiveProblem,
      draftAssignments,
      evaluated,
      setShowLeaveConfirm,
      setHasUnsavedChanges,
      proceedingRef,
      navigate,
      location,
      pendingNextPath,
    });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Target className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
        <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
          Manual Editor
        </h2>
        {hasUnsavedChanges && (
          <span
            className="ml-3 px-2 py-0.5 rounded text-xs border"
            style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
          >
            Unsaved changes
          </span>
        )}
      </div>
      {notReady ? (
        <ManualEditorNotReady />
      ) : (
        <>
          <ManualEditorTopBar
            mode={mode}
            onModeChange={setMode}
            onPullNewPeople={handlePullNewPeople}
            onPullNewConstraints={handlePullNewConstraints}
            onUndo={undo}
            onRedo={redo}
            onSaveDraft={saveDraft}
          />
          <div className="flex flex-col lg:flex-row gap-4">
            <ManualEditorSidebar
              avgUniqueContacts={baselineMetrics ? baselineMetrics.avgUniqueContacts : null}
              totalViolations={totalViolations}
              hardViolationsCount={hardViolationsCount}
              sessionCount={effectiveProblem ? effectiveProblem.num_sessions : 0}
              activeSession={activeSession}
              onSelectSession={setActiveSession}
            />
            <div className="flex-1 lg:flex lg:flex-row lg:items-start gap-4">
              <div className="flex-1 space-y-4">
                <div className="flex-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(effectiveProblem ? effectiveProblem.groups : []).map((group) => {
                      const peopleIds = draftSchedule[activeSession]?.[group.id] || [];
                      return (
                        <ManualEditorGroupColumn
                          key={group.id}
                          group={group}
                          activeSession={activeSession}
                          peopleIds={peopleIds}
                          effectiveProblem={effectiveProblem}
                          draggingPerson={draggingPerson}
                          previewDelta={previewDelta}
                          isGroupLocked={isGroupLocked}
                          isPersonLocked={isPersonLocked}
                          onToggleGroupLock={toggleGroupLock}
                          onTogglePersonLock={togglePersonLock}
                          onDropPerson={handleDropPerson}
                          onPreview={computePreview}
                          onClearPreview={clearPreview}
                          setDraggingPerson={setDraggingPerson}
                        />
                      );
                    })}
                  </div>
                </div>
                <ConstraintComplianceCards problem={effectiveProblem} solution={complianceSolution} />
                <ManualEditorStatusBar
                  evalLoading={evalLoading}
                  evalError={evalError}
                  draftScore={draftScore}
                  deltaScore={deltaScore}
                  draftUnique={draftUnique}
                  deltaUnique={deltaUnique}
                  draftConstraint={draftConstraint}
                  deltaViolations={deltaViolations}
                />
              </div>
              <ManualEditorStoragePanel
                activeSession={activeSession}
                storedIds={Array.from(getStorageSet(activeSession))}
                effectiveProblem={effectiveProblem}
                pulledConstraints={pulledConstraints}
                isPersonLocked={isPersonLocked}
                onDropToStorage={handleDropToStorage}
                onRemoveFromStorage={(personId) => removeFromStorage(activeSession, personId)}
                setDraggingPerson={setDraggingPerson}
              />
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
        onCancel={handleCloseReport}
        onClose={handleCloseReport}
      />

      <ManualEditorLeaveConfirmModal
        open={showLeaveConfirm}
        onCancel={() => setShowLeaveConfirm(false)}
        onDiscard={handleDiscardAndContinue}
        onSave={handleSaveAndContinue}
      />
    </div>
  );
}
