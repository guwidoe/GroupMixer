import React, { useMemo, useRef, useState } from 'react';
import { BarChart3, Target } from 'lucide-react';
import { useAppStore } from '../store';
import { createResultExportFile, type ResultExportAction } from '../utils/csvExport';
import { compareScenarioConfigurations } from '../services/scenarioStorage';
import { calculateMetrics, getColorClass } from '../utils/metricCalculations';
import { snapshotToScenario } from '../utils/scenarioSnapshot';
import { useLocalStorageState, useOutsideClick } from '../hooks';
import ConstraintComplianceCards from './ConstraintComplianceCards';
import { buildResultsViewModel } from '../services/results/buildResultsModel';
import { ResultsHeader } from './ResultsView/ResultsHeader';
import { ResultsMetrics } from './ResultsView/ResultsMetrics';
import { ResultsSchedule } from './ResultsView/ResultsSchedule';

export function ResultsView() {
  const { scenario, solution, solverState, currentScenarioId, currentResultId, savedScenarios, restoreResultAsNewScenario } = useAppStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'visualize'>('grid');
  const [vizPluginId, setVizPluginId] = useLocalStorageState('resultsVisualizationPlugin', 'scheduleMatrix');
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [configDetailsOpen, setConfigDetailsOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const configDetailsRef = useRef<HTMLDivElement>(null);
  const vizExportRef = useRef<HTMLDivElement>(null);

  useOutsideClick({
    refs: [exportDropdownRef],
    onOutsideClick: () => setExportDropdownOpen(false),
    enabled: exportDropdownOpen,
  });

  useOutsideClick({
    refs: [configDetailsRef],
    onOutsideClick: () => setConfigDetailsOpen(false),
    enabled: configDetailsOpen,
  });

  const currentResult = useMemo(() => {
    if (!currentScenarioId || !currentResultId) return undefined;
    const currentScenario = savedScenarios[currentScenarioId];
    if (!currentScenario) return undefined;
    return currentScenario.results.find((result) => result.id === currentResultId);
  }, [currentResultId, currentScenarioId, savedScenarios]);

  const resultName = currentResult?.name;

  const effectiveScenario = useMemo(() => {
    if (currentResult?.scenarioSnapshot) {
      return snapshotToScenario(currentResult.scenarioSnapshot, currentResult.solverSettings);
    }
    return scenario;
  }, [currentResult, scenario]);

  const configDiff = useMemo(() => {
    if (!scenario || !currentResult?.scenarioSnapshot) return null;
    const currentScenarioData = savedScenarios[currentScenarioId!];
    if (!currentScenarioData) return null;
    const mostRecentResult = currentScenarioData.results
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (currentResult.id === mostRecentResult?.id) {
      return compareScenarioConfigurations(
        scenario,
        snapshotToScenario(currentResult.scenarioSnapshot, currentResult.solverSettings)
      );
    }

    if (mostRecentResult?.scenarioSnapshot) {
      return compareScenarioConfigurations(
        snapshotToScenario(mostRecentResult.scenarioSnapshot, mostRecentResult.solverSettings),
        snapshotToScenario(currentResult.scenarioSnapshot, currentResult.solverSettings)
      );
    }

    return compareScenarioConfigurations(
      scenario,
      snapshotToScenario(currentResult.scenarioSnapshot, currentResult.solverSettings)
    );
  }, [scenario, currentResult, currentScenarioId, savedScenarios]);

  const metrics = useMemo(() => {
    if (!solution) return null;
    const scenarioConfig = currentResult?.scenarioSnapshot || scenario;
    if (!scenarioConfig) return null;
    return calculateMetrics(scenarioConfig, solution);
  }, [solution, currentResult, scenario]);

  const finalConstraintPenalty = solution?.weighted_constraint_penalty ?? solution?.constraint_penalty ?? 0;
  const baselineConstraintPenalty = useMemo(() => {
    const base = solverState.initialConstraintPenalty ?? solverState.currentConstraintPenalty ?? finalConstraintPenalty;
    return base === 0 ? (finalConstraintPenalty > 0 ? finalConstraintPenalty : 1) : base;
  }, [solverState.initialConstraintPenalty, solverState.currentConstraintPenalty, finalConstraintPenalty]);

  const constraintRatio = Math.min(finalConstraintPenalty / baselineConstraintPenalty, 1);
  const constraintColorClass = getColorClass(constraintRatio, true);

  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportAction = (action: ResultExportAction) => {
    if (!effectiveScenario || !solution) return;

    const exportFile = createResultExportFile(effectiveScenario, solution, action, {
      resultName: resultName || 'Current Result',
      exportedAt: Date.now(),
    });

    const blob = new Blob([exportFile.content], { type: exportFile.mimeType });
    downloadFile(blob, exportFile.filename);

    setExportDropdownOpen(false);
  };

  const handleExportVisualizationPng = async () => {
    if (!effectiveScenario || !solution) return;
    if (viewMode !== 'visualize') return;
    if (!vizExportRef.current) return;

    const fileName = (resultName || 'result')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();

    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(vizExportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${fileName}_visualization.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Failed to export visualization PNG:', e);
    } finally {
      setExportDropdownOpen(false);
    }
  };

  const resultsModel = useMemo(() => {
    if (!solution || !effectiveScenario) {
      return null;
    }

    return buildResultsViewModel(effectiveScenario, solution);
  }, [solution, effectiveScenario]);

  if (!solution) {
    return (
      <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-secondary)' }}>
        <Target className="w-16 h-16 mb-4" style={{ color: 'var(--text-tertiary)' }} />
        <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>No Results Yet</h3>
        <p className="text-center max-w-md" style={{ color: 'var(--text-secondary)' }}>
          Run the solver or select one of the results from the Results tab to see optimization results and group assignments.
        </p>
      </div>
    );
  }

  if (!effectiveScenario) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No Results Available</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Run the solver to generate results for this scenario.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ResultsHeader
        resultName={resultName}
        solution={solution}
        summary={resultsModel?.summary ?? null}
        configDiff={configDiff}
        configDetailsOpen={configDetailsOpen}
        onToggleConfigDetails={() => setConfigDetailsOpen(!configDetailsOpen)}
        onRestoreConfig={() => {
          if (!currentResult) return;
          const sourceName = savedScenarios[currentScenarioId!]?.name || 'Scenario';
          const suggested = `${sourceName} – ${currentResult.name || 'Result'} (restored)`;
          restoreResultAsNewScenario(currentResult.id, suggested);
        }}
        exportDropdownOpen={exportDropdownOpen}
        onToggleExportDropdown={() => setExportDropdownOpen(!exportDropdownOpen)}
        onExportAction={handleExportAction}
        onExportVisualizationPng={handleExportVisualizationPng}
        viewMode={viewMode}
        exportDropdownRef={exportDropdownRef}
        configDetailsRef={configDetailsRef}
      />

      <ResultsMetrics
        solution={solution}
        metrics={metrics}
        solverState={solverState}
        finalConstraintPenalty={finalConstraintPenalty}
        constraintColorClass={constraintColorClass}
      />

      <ConstraintComplianceCards scenario={effectiveScenario} solution={solution} />

      <ResultsSchedule
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        resultsModel={resultsModel}
        effectiveScenario={effectiveScenario}
        solution={solution}
        vizPluginId={vizPluginId}
        onVizPluginChange={setVizPluginId}
        vizExportRef={vizExportRef}
      />
    </div>
  );
}
