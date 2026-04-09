import React from 'react';
import type { RuntimeSolverDescriptor } from '../../services/runtime';
import type { ScenarioResult, SavedScenario } from '../../types';
import { calculateMetrics, getColorClass } from '../../utils/metricCalculations';
import { compareScenarioConfigurations } from '../../services/scenarioStorage';
import { ResultCard, type ResultCardActions, type ResultCardMetrics, type ResultCardState } from './ResultCard';
import { getScoreColor } from './utils';

interface ResultsHistoryListState {
  selectedResultIds: string[];
  expandedResults: Set<string>;
  editingId: string | null;
  editingName: string;
  exportDropdownOpenId: string | null;
  configDetailsOpenId: string | null;
  bestResultId?: string;
  mostRecentResult: ScenarioResult | null;
}

interface ResultsHistoryListActions {
  onToggleSelected: (resultId: string) => void;
  onToggleExpanded: (resultId: string) => void;
  onStartRename: (result: ScenarioResult) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onChangeEditingName: (value: string) => void;
  onOpenDetails: (result: ScenarioResult) => void;
  onDelete: (resultId: string) => void;
  onExport: (result: ScenarioResult, format: 'json' | 'csv' | 'excel') => void;
  onToggleExportDropdown: (resultId: string) => void;
  onCloseExportDropdown: () => void;
  onToggleConfigDetails: (resultId: string) => void;
  onCloseConfigDetails: () => void;
  onRestoreConfig: (result: ScenarioResult) => void;
}

interface ResultsHistoryListProps {
  results: ScenarioResult[];
  currentScenario: SavedScenario;
  runtimeSolverCatalog: readonly RuntimeSolverDescriptor[];
  runtimeSolverCatalogStatus: 'idle' | 'loading' | 'ready' | 'error';
  runtimeSolverCatalogError: string | null;
  state: ResultsHistoryListState;
  actions: ResultsHistoryListActions;
}

export function ResultsHistoryList({
  results,
  currentScenario,
  runtimeSolverCatalog,
  runtimeSolverCatalogStatus,
  runtimeSolverCatalogError,
  state,
  actions,
}: ResultsHistoryListProps) {
  return (
    <div className="space-y-4">
      {results
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((result) => {
          const isExpanded = state.expandedResults.has(result.id);
          const isSelected = state.selectedResultIds.includes(result.id);
          const isBest = result.id === state.bestResultId;
          const isCurrent = result.id === state.mostRecentResult?.id;

          const metrics = (() => {
            const scenarioConfig = result.scenarioSnapshot || currentScenario.scenario;
            return calculateMetrics(scenarioConfig, result.solution);
          })();

          const repPenalty = result.solution.weighted_repetition_penalty ?? result.solution.repetition_penalty;
          const balPenalty = result.solution.attribute_balance_penalty;
          const conPenalty = result.solution.weighted_constraint_penalty ?? result.solution.constraint_penalty;

          const repColorClass = getColorClass(repPenalty === 0 ? 0 : 1, true);
          const balColorClass = getColorClass(balPenalty === 0 ? 0 : 1, true);
          const conColorClass = getColorClass(conPenalty === 0 ? 0 : 1, true);

          const configDiff = compareScenarioConfigurations(currentScenario.scenario, result.scenarioSnapshot);
          const scoreColorClass = getScoreColor(result.solution.final_score, result, results, state.mostRecentResult);

          return (
            <ResultCard
              key={result.id}
              result={result}
              runtimeSolverCatalog={runtimeSolverCatalog}
              runtimeSolverCatalogStatus={runtimeSolverCatalogStatus}
              runtimeSolverCatalogError={runtimeSolverCatalogError}
              state={{
                isExpanded,
                isSelected,
                isBest,
                isCurrent,
                editingId: state.editingId,
                editingName: state.editingName,
                exportDropdownOpen: state.exportDropdownOpenId === result.id,
                configDetailsOpen: state.configDetailsOpenId === result.id,
              } satisfies ResultCardState}
              actions={actions satisfies ResultCardActions}
              metrics={{
                configDiff,
                metrics,
                scoreColorClass,
                repPenalty,
                balPenalty,
                conPenalty,
                repColorClass,
                balColorClass,
                conColorClass,
              } satisfies ResultCardMetrics}
            />
          );
        })}
    </div>
  );
}
