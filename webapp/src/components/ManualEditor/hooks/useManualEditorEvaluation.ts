import { useEffect, useState } from 'react';
import type { Assignment, Problem, Solution } from '../../../types';
import { wasmService } from '../../../services/wasm';
import type { PreviewDelta } from '../types';

interface UseManualEditorEvaluationArgs {
  effectiveProblem: Problem | null;
  draftAssignments: Assignment[];
  solution: Solution | null;
  complianceViolationCount: number;
}

export function useManualEditorEvaluation({
  effectiveProblem,
  draftAssignments,
  solution,
  complianceViolationCount,
}: UseManualEditorEvaluationArgs) {
  const [evaluated, setEvaluated] = useState<Solution | null>(null);
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

  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [_previewLoading, setPreviewLoading] = useState(false);
  const [_previewError, setPreviewError] = useState<string | null>(null);
  const [previewDelta, setPreviewDelta] = useState<PreviewDelta | null>(null);

  const computePreview = async (personId: string, toGroupId: string, sessionId: number) => {
    if (!effectiveProblem) return;
    const baseScore = evaluated?.final_score ?? (solution?.final_score ?? 0);
    const baseUnique = evaluated?.unique_contacts ?? (solution?.unique_contacts ?? 0);
    const baseConstraint = evaluated?.constraint_penalty ?? complianceViolationCount;

    const hypothetic = draftAssignments.filter(
      (a) => !(a.person_id === personId && a.session_id === sessionId),
    );
    hypothetic.push({ person_id: personId, group_id: toGroupId, session_id: sessionId });

    const key = `${personId}|${sessionId}|${toGroupId}|${draftAssignments.length}`;
    if (previewKey === key && previewDelta) return;
    setPreviewKey(key);
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await wasmService.evaluateSolution(effectiveProblem, hypothetic);
      setPreviewDelta({
        groupId: toGroupId,
        sessionId,
        scoreDelta: res.final_score - baseScore,
        uniqueDelta: res.unique_contacts - baseUnique,
        constraintDelta: res.constraint_penalty - baseConstraint,
      });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
      setPreviewDelta(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const clearPreview = () => {
    setPreviewDelta(null);
    setPreviewKey(null);
  };

  return {
    evaluated,
    evalLoading,
    evalError,
    previewDelta,
    computePreview,
    clearPreview,
  };
}
