import type { MutableRefObject } from 'react';
import type { Location, NavigateFunction } from 'react-router-dom';
import type { Assignment, Problem, Solution } from '../../types';
import { useAppStore } from '../../store';
import { buildManualDraftSolution } from './draftSolution';

interface LeaveActionArgs {
  setShowLeaveConfirm: (value: boolean) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  proceedingRef: MutableRefObject<boolean>;
  navigate: NavigateFunction;
  location: Location;
  pendingNextPath: string | null;
}

interface SaveAndContinueArgs extends LeaveActionArgs {
  effectiveProblem: Problem | null;
  draftAssignments: Assignment[];
  evaluated: Solution | null;
}

const resolveNextPath = (location: Location, pendingNextPath: string | null) => {
  const state = location.state as { nextPath?: string } | null;
  return state?.nextPath || pendingNextPath || '/app/results';
};

export function discardAndContinue({
  setShowLeaveConfirm,
  setHasUnsavedChanges,
  proceedingRef,
  navigate,
  location,
  pendingNextPath,
}: LeaveActionArgs) {
  setShowLeaveConfirm(false);
  setHasUnsavedChanges(false);
  useAppStore.getState().setManualEditorUnsaved(false);
  proceedingRef.current = true;
  const next = resolveNextPath(location, pendingNextPath);
  if (next) {
    window.history.pushState(null, '', next);
    navigate(next);
  }
  proceedingRef.current = false;
}

export function saveAndContinue({
  effectiveProblem,
  draftAssignments,
  evaluated,
  setShowLeaveConfirm,
  setHasUnsavedChanges,
  proceedingRef,
  navigate,
  location,
  pendingNextPath,
}: SaveAndContinueArgs) {
  if (effectiveProblem) {
    const draftSolution = buildManualDraftSolution({
      assignments: draftAssignments,
      peopleCount: effectiveProblem.people.length || 1,
      evaluated,
    });
    useAppStore.getState().addResult(draftSolution, effectiveProblem.settings, 'Manual Draft', effectiveProblem);
  }
  setShowLeaveConfirm(false);
  setHasUnsavedChanges(false);
  useAppStore.getState().setManualEditorUnsaved(false);
  proceedingRef.current = true;
  const next = resolveNextPath(location, pendingNextPath);
  window.history.pushState(null, '', next);
  navigate(next);
  proceedingRef.current = false;
}
