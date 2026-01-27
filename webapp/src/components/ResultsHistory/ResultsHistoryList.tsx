import React from 'react';
import type { ProblemResult, SavedProblem } from '../../types';
import { calculateMetrics, getColorClass } from '../../utils/metricCalculations';
import { compareProblemConfigurations } from '../../services/problemStorage';
import { ResultCard } from './ResultCard';
import { getScoreColor } from './utils';

interface ResultsHistoryListProps {
  results: ProblemResult[];
  currentProblem: SavedProblem;
  selectedResultIds: string[];
  expandedResults: Set<string>;
  editingId: string | null;
  editingName: string;
  exportDropdownOpenId: string | null;
  configDetailsOpenId: string | null;
  bestResultId?: string;
  mostRecentResult: ProblemResult | null;
  onToggleSelected: (resultId: string) => void;
  onToggleExpanded: (resultId: string) => void;
  onStartRename: (result: ProblemResult) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onChangeEditingName: (value: string) => void;
  onOpenDetails: (result: ProblemResult) => void;
  onDelete: (resultId: string) => void;
  onExport: (result: ProblemResult, format: 'json' | 'csv' | 'excel') => void;
  onToggleExportDropdown: (resultId: string) => void;
  onCloseExportDropdown: () => void;
  onToggleConfigDetails: (resultId: string) => void;
  onCloseConfigDetails: () => void;
  onRestoreConfig: (result: ProblemResult) => void;
}

export function ResultsHistoryList({
  results,
  currentProblem,
  selectedResultIds,
  expandedResults,
  editingId,
  editingName,
  exportDropdownOpenId,
  configDetailsOpenId,
  bestResultId,
  mostRecentResult,
  onToggleSelected,
  onToggleExpanded,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onChangeEditingName,
  onOpenDetails,
  onDelete,
  onExport,
  onToggleExportDropdown,
  onCloseExportDropdown,
  onToggleConfigDetails,
  onCloseConfigDetails,
  onRestoreConfig,
}: ResultsHistoryListProps) {
  return (
    <div className="space-y-4">
      {results
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((result) => {
          const isExpanded = expandedResults.has(result.id);
          const isSelected = selectedResultIds.includes(result.id);
          const isBest = result.id === bestResultId;
          const isCurrent = result.id === mostRecentResult?.id;

          const metrics = (() => {
            const problemConfig = result.problemSnapshot || currentProblem.problem;
            return calculateMetrics(problemConfig, result.solution);
          })();

          const repPenalty = result.solution.weighted_repetition_penalty ?? result.solution.repetition_penalty;
          const balPenalty = result.solution.attribute_balance_penalty;
          const conPenalty = result.solution.weighted_constraint_penalty ?? result.solution.constraint_penalty;

          const repColorClass = getColorClass(repPenalty === 0 ? 0 : 1, true);
          const balColorClass = getColorClass(balPenalty === 0 ? 0 : 1, true);
          const conColorClass = getColorClass(conPenalty === 0 ? 0 : 1, true);

          const configDiff = compareProblemConfigurations(currentProblem.problem, result.problemSnapshot);
          const scoreColorClass = getScoreColor(result.solution.final_score, result, results, mostRecentResult);

          return (
            <ResultCard
              key={result.id}
              result={result}
              isExpanded={isExpanded}
              isSelected={isSelected}
              isBest={isBest}
              isCurrent={isCurrent}
              editingId={editingId}
              editingName={editingName}
              onChangeEditingName={onChangeEditingName}
              onStartRename={onStartRename}
              onSaveRename={onSaveRename}
              onCancelRename={onCancelRename}
              onToggleSelected={onToggleSelected}
              onToggleExpanded={onToggleExpanded}
              onOpenDetails={onOpenDetails}
              onDelete={onDelete}
              onExport={onExport}
              exportDropdownOpen={exportDropdownOpenId === result.id}
              onToggleExportDropdown={onToggleExportDropdown}
              onCloseExportDropdown={onCloseExportDropdown}
              configDiff={configDiff}
              configDetailsOpen={configDetailsOpenId === result.id}
              onToggleConfigDetails={onToggleConfigDetails}
              onCloseConfigDetails={onCloseConfigDetails}
              onRestoreConfig={onRestoreConfig}
              metrics={metrics}
              scoreColorClass={scoreColorClass}
              repPenalty={repPenalty}
              balPenalty={balPenalty}
              conPenalty={conPenalty}
              repColorClass={repColorClass}
              balColorClass={balColorClass}
              conColorClass={conColorClass}
            />
          );
        })}
    </div>
  );
}
