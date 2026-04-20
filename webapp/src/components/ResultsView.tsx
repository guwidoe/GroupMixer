import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, History, Target } from 'lucide-react';
import { useAppStore } from '../store';
import { createResultClipboardText, createResultExportFile, type ResultClipboardAction, type ResultExportAction } from '../utils/csvExport';
import { compareScenarioConfigurations } from '../services/scenarioStorage';
import { calculateMetrics, getColorClass } from '../utils/metricCalculations';
import { snapshotToScenario } from '../utils/scenarioSnapshot';
import { useLocalStorageState, useOutsideClick } from '../hooks';
import ConstraintComplianceCards from './ConstraintComplianceCards';
import { buildResultsViewModel } from '../services/results/buildResultsModel';
import { ResultsHeader } from './ResultsView/ResultsHeader';
import { ResultsMetrics } from './ResultsView/ResultsMetrics';
import { ResultsSchedule } from './ResultsView/ResultsSchedule';
import { Button } from './ui';

export function ResultsView() {
  const { scenario, solution, solverState, currentScenarioId, currentResultId, savedScenarios, restoreResultAsNewScenario, addNotification } = useAppStore();
  const navigate = useNavigate();
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
    if (viewMode !== 'visualize') {
      addNotification({
        type: 'error',
        title: 'Visualization unavailable',
        message: 'Switch to the visualization view before exporting a PNG.',
      });
      return;
    }
    if (!vizExportRef.current) {
      addNotification({
        type: 'error',
        title: 'Visualization unavailable',
        message: 'The current visualization is not ready to export yet.',
      });
      return;
    }

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
      addNotification({
        type: 'error',
        title: 'PNG export failed',
        message: 'The browser could not create an image from the current visualization.',
      });
    } finally {
      setExportDropdownOpen(false);
    }
  };

  const handleCopyAction = async (action: ResultClipboardAction) => {
    if (!effectiveScenario || !solution) return;

    if (!navigator.clipboard?.writeText) {
      addNotification({
        type: 'error',
        title: 'Clipboard unavailable',
        message: 'This browser cannot copy result tables directly. Use a download instead.',
      });
      setExportDropdownOpen(false);
      return;
    }

    const content = createResultClipboardText(effectiveScenario, solution, action);

    try {
      await navigator.clipboard.writeText(content);
      addNotification({
        type: 'success',
        title: 'Copied to clipboard',
        message: action === 'copy-full-schedule'
          ? 'Schedule table copied. Paste it into a spreadsheet, doc, or chat.'
          : 'Participant itineraries copied. Paste them into a spreadsheet, doc, or chat.',
      });
    } catch (error) {
      console.error('Failed to copy result export:', error);
      addNotification({
        type: 'error',
        title: 'Copy failed',
        message: 'The browser blocked clipboard access for this result export.',
      });
    } finally {
      setExportDropdownOpen(false);
    }
  };

  const handlePrintResult = () => {
    if (typeof window.print !== 'function') {
      addNotification({
        type: 'error',
        title: 'Print unavailable',
        message: 'This browser does not support printing from the current result view.',
      });
      setExportDropdownOpen(false);
      return;
    }

    window.print();
    setExportDropdownOpen(false);
  };

  const resultsModel = useMemo(() => {
    if (!solution || !effectiveScenario) {
      return null;
    }

    return buildResultsViewModel(effectiveScenario, solution);
  }, [solution, effectiveScenario]);

  const savedResultsAction = currentScenarioId ? (
    <Button
      variant="secondary"
      leadingIcon={<History className="h-4 w-4" />}
      onClick={() => navigate('/app/history')}
    >
      Saved Results
    </Button>
  ) : null;

  if (!solution) {
    return (
      <div className="space-y-6">
        {savedResultsAction ? <div className="flex justify-end">{savedResultsAction}</div> : null}
        <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-secondary)' }}>
          <Target className="w-16 h-16 mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>No Results Yet</h3>
          <p className="text-center max-w-md" style={{ color: 'var(--text-secondary)' }}>
            Run the solver or open a saved result from Saved Results to inspect assignments, exports, and group layouts.
          </p>
        </div>
      </div>
    );
  }

  if (!effectiveScenario) {
    return (
      <div className="space-y-6">
        {savedResultsAction ? <div className="flex justify-end">{savedResultsAction}</div> : null}
        <div className="text-center py-12">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No Results Available</h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Run the solver to generate results for this scenario.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="results-print-surface space-y-6">
      <ResultsHeader
        resultName={resultName}
        solution={solution}
        summary={resultsModel?.summary ?? null}
        configDiff={configDiff}
        showSavedResultsAction={Boolean(currentScenarioId)}
        onOpenSavedResults={() => navigate('/app/history')}
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
        onCopyAction={handleCopyAction}
        onPrintResult={handlePrintResult}
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
