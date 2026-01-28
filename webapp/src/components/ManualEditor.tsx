import React, { useMemo } from 'react';
import { useAppStore } from '../store';
import { ManualEditorContent } from './ManualEditor/ManualEditorContent';

function ManualEditor() {
  const solution = useAppStore((s) => s.solution);
  const solutionKey = useMemo(() => {
    if (!solution) return 'no-solution';
    return [
      solution.assignments.length,
      solution.final_score,
      solution.unique_contacts,
      solution.repetition_penalty,
      solution.attribute_balance_penalty,
      solution.constraint_penalty,
      solution.iteration_count,
      solution.elapsed_time_ms,
    ].join(':');
  }, [solution]);

  return <ManualEditorContent key={solutionKey} />;
}

export { ManualEditor };
