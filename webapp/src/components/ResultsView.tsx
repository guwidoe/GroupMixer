import React, { useMemo, useRef, useState } from 'react';
import { BarChart3, Target } from 'lucide-react';
import { useAppStore } from '../store';
import { generateAssignmentsCsv } from '../utils/csvExport';
import { compareProblemConfigurations } from '../services/problemStorage';
import { calculateMetrics, getColorClass } from '../utils/metricCalculations';
import { snapshotToProblem } from '../utils/problemSnapshot';
import { useLocalStorageState, useOutsideClick } from '../hooks';
import ConstraintComplianceCards from './ConstraintComplianceCards';
import { ResultsHeader } from './ResultsView/ResultsHeader';
import { ResultsMetrics } from './ResultsView/ResultsMetrics';
import { ResultsSchedule } from './ResultsView/ResultsSchedule';

export function ResultsView() {
  const { problem, solution, solverState, currentProblemId, savedProblems, restoreResultAsNewProblem } = useAppStore();
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
    if (!currentProblemId || !solution) return undefined;
    const currentProblem = savedProblems[currentProblemId];
    if (!currentProblem) return undefined;
    return currentProblem.results.find(r => r.solution === solution);
  }, [currentProblemId, savedProblems, solution]);

  const resultName = currentResult?.name;

  const effectiveProblem = useMemo(() => {
    if (currentResult?.problemSnapshot) {
      return snapshotToProblem(currentResult.problemSnapshot, currentResult.solverSettings);
    }
    return problem;
  }, [currentResult, problem]);

  const configDiff = useMemo(() => {
    if (!problem || !currentResult?.problemSnapshot) return null;
    const currentProblemData = savedProblems[currentProblemId!];
    if (!currentProblemData) return null;
    const mostRecentResult = currentProblemData.results
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (currentResult.id === mostRecentResult?.id) {
      return compareProblemConfigurations(
        problem,
        snapshotToProblem(currentResult.problemSnapshot, currentResult.solverSettings)
      );
    }

    if (mostRecentResult?.problemSnapshot) {
      return compareProblemConfigurations(
        snapshotToProblem(mostRecentResult.problemSnapshot, mostRecentResult.solverSettings),
        snapshotToProblem(currentResult.problemSnapshot, currentResult.solverSettings)
      );
    }

    return compareProblemConfigurations(
      problem,
      snapshotToProblem(currentResult.problemSnapshot, currentResult.solverSettings)
    );
  }, [problem, currentResult, currentProblemId, savedProblems]);

  const metrics = useMemo(() => {
    if (!solution) return null;
    const problemConfig = currentResult?.problemSnapshot || problem;
    if (!problemConfig) return null;
    return calculateMetrics(problemConfig, solution);
  }, [solution, currentResult, problem]);

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

  const generateCSV = () => {
    if (!effectiveProblem || !solution) return '';
    return generateAssignmentsCsv(effectiveProblem, solution, {
      resultName: resultName || 'Current Result',
      exportedAt: Date.now(),
    });
  };

  const handleExportResult = (format: 'json' | 'csv' | 'excel') => {
    if (!effectiveProblem || !solution) return;

    const fileName = (resultName || 'result').replace(/[^a-z0-9]/gi, '_').toLowerCase();

    if (format === 'json') {
      const exportData = {
        problem: effectiveProblem,
        solution,
        exportedAt: Date.now(),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      downloadFile(blob, `${fileName}.json`);
    } else if (format === 'csv') {
      const csvData = generateCSV();
      const blob = new Blob([csvData], { type: 'text/csv' });
      downloadFile(blob, `${fileName}.csv`);
    } else if (format === 'excel') {
      const csvData = generateCSV();
      const blob = new Blob([csvData], { type: 'application/vnd.ms-excel' });
      downloadFile(blob, `${fileName}.xls`);
    }

    setExportDropdownOpen(false);
  };

  const handleExportVisualizationPng = async () => {
    if (!effectiveProblem || !solution) return;
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

  const sessionData = useMemo(() => {
    if (!solution || !effectiveProblem) {
      return [];
    }

    return Array.from({ length: effectiveProblem.num_sessions || 0 }, (_, sessionIndex) => {
      const sessionAssignments = solution.assignments.filter(a => a.session_id === sessionIndex);

      const groups = effectiveProblem.groups.map(group => {
        const groupAssignments = sessionAssignments.filter(a => a.group_id === group.id);
        const people = groupAssignments
          .map(a => effectiveProblem.people.find(p => p.id === a.person_id))
          .filter((person): person is typeof effectiveProblem.people[number] => Boolean(person));

        return {
          ...group,
          people,
        };
      }) || [];

      return {
        sessionIndex,
        groups,
        totalPeople: sessionAssignments.length,
      };
    });
  }, [solution, effectiveProblem]);

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

  if (!effectiveProblem) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No Results Available</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Run the solver to generate results for this problem.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ResultsHeader
        resultName={resultName}
        solution={solution}
        configDiff={configDiff}
        configDetailsOpen={configDetailsOpen}
        onToggleConfigDetails={() => setConfigDetailsOpen(!configDetailsOpen)}
        onRestoreConfig={() => {
          if (!currentResult) return;
          const sourceName = savedProblems[currentProblemId!]?.name || 'Problem';
          const suggested = `${sourceName} – ${currentResult.name || 'Result'} (restored)`;
          restoreResultAsNewProblem(currentResult.id, suggested);
        }}
        exportDropdownOpen={exportDropdownOpen}
        onToggleExportDropdown={() => setExportDropdownOpen(!exportDropdownOpen)}
        onExportResult={handleExportResult}
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

      <ConstraintComplianceCards problem={effectiveProblem} solution={solution} />

      <ResultsSchedule
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sessionData={sessionData}
        effectiveProblem={effectiveProblem}
        solution={solution}
        vizPluginId={vizPluginId}
        onVizPluginChange={setVizPluginId}
        vizExportRef={vizExportRef}
      />
    </div>
  );
}
