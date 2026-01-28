import { useEffect, useState } from 'react';
import type { Assignment, Solution } from '../../../types';
import { cloneAssignments } from '../utils';

interface DraftState {
  assignments: Assignment[];
}

interface UseManualEditorDraftArgs {
  solution: Solution | null;
  setGlobalUnsaved: (value: boolean) => void;
}

export function useManualEditorDraft({ solution, setGlobalUnsaved }: UseManualEditorDraftArgs) {
  const [_history, setHistory] = useState<DraftState[]>([]);
  const [_future, setFuture] = useState<DraftState[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  useEffect(() => {
    if (solution) {
      setDraft({ assignments: cloneAssignments(solution.assignments) });
      setHistory([]);
      setFuture([]);
      setStorage({});
    }
  }, [solution]);

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

  return {
    draft,
    setDraft,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    storage,
    setStorage,
    getStorageSet,
    addToStorage,
    removeFromStorage,
    pushHistory,
    undo,
    redo,
  };
}
