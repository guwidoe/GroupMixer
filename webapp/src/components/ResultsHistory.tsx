import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { useAppStore } from '../store';
import type { Problem, ProblemResult } from '../types';
import { generateAssignmentsCsv } from '../utils/csvExport';
import { snapshotToProblem } from '../utils/problemSnapshot';
import { ResultsHistoryHeader } from './ResultsHistory/ResultsHistoryHeader';
import { ResultsHistorySummary } from './ResultsHistory/ResultsHistorySummary';
import { ResultsHistoryList } from './ResultsHistory/ResultsHistoryList';
import { formatDuration, getBestResult } from './ResultsHistory/utils';

export function ResultsHistory() {
  const {
    currentProblemId,
    savedProblems,
    selectedResultIds,
    selectResultsForComparison,
    updateResultName,
    deleteResult,
    setShowResultComparison,
    setSolution,
    restoreResultAsNewProblem,
  } = useAppStore();
  const navigate = useNavigate();

  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [exportDropdownOpenId, setExportDropdownOpenId] = useState<string | null>(null);
  const [configDetailsOpenId, setConfigDetailsOpenId] = useState<string | null>(null);

  const currentProblem = currentProblemId ? savedProblems[currentProblemId] : null;
  const results = useMemo(() => currentProblem?.results || [], [currentProblem?.results]);
  const allResultIds = results.map(r => r.id);

  const mostRecentResult = useMemo(
    () => (results.length > 0 ? results.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)) : null),
    [results]
  );

  const bestResult = useMemo(() => getBestResult(results, mostRecentResult), [results, mostRecentResult]);

  const toggleExpanded = (resultId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId);
    } else {
      newExpanded.add(resultId);
    }
    setExpandedResults(newExpanded);
  };

  const toggleResultSelection = (resultId: string) => {
    const newSelection = selectedResultIds.includes(resultId)
      ? selectedResultIds.filter(id => id !== resultId)
      : [...selectedResultIds, resultId];
    selectResultsForComparison(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedResultIds.length === allResultIds.length) {
      selectResultsForComparison([]);
    } else {
      selectResultsForComparison(allResultIds);
    }
  };

  const handleOpenDetails = (result: ProblemResult) => {
    setSolution(result.solution);
    navigate('/app/results');
  };

  const handleRename = (result: ProblemResult) => {
    setEditingId(result.id);
    setEditingName(result.name || `Result ${results.indexOf(result) + 1}`);
  };

  const handleSaveRename = () => {
    if (editingId && editingName.trim()) {
      updateResultName(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleDelete = (resultId: string) => {
    if (confirm('Are you sure you want to delete this result? This action cannot be undone.')) {
      deleteResult(resultId);
    }
  };

  const handleBulkDelete = () => {
    if (selectedResultIds.length === 0) return;

    const count = selectedResultIds.length;
    const message = `Are you sure you want to delete ${count} result${count > 1 ? 's' : ''}? This action cannot be undone.`;

    if (confirm(message)) {
      selectedResultIds.forEach(resultId => {
        deleteResult(resultId);
      });
      selectResultsForComparison([]);
    }
  };

  const handleCompareSelected = () => {
    if (selectedResultIds.length >= 2) {
      setShowResultComparison(true);
    }
  };

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

  const generateCSV = (result: ProblemResult) => {
    const problemForAttributes: Problem | null = result.problemSnapshot
      ? snapshotToProblem(result.problemSnapshot, result.solverSettings)
      : (currentProblem?.problem ?? null);
    if (!problemForAttributes) return '';

    return generateAssignmentsCsv(problemForAttributes, result.solution, {
      resultName: result.name || 'Unnamed Result',
      exportedAt: Date.now(),
      extraMetadata: [['Duration', formatDuration(result.duration)]],
    });
  };

  const handleExportResult = (result: ProblemResult, format: 'json' | 'csv' | 'excel') => {
    const fileName = result.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'result';

    if (format === 'json') {
      const exportData = {
        result,
        currentProblem: currentProblem?.problem,
        problemSnapshot: result.problemSnapshot,
        exportedAt: Date.now(),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      downloadFile(blob, `${fileName}.json`);
    } else if (format === 'csv') {
      const csvData = generateCSV(result);
      const blob = new Blob([csvData], { type: 'text/csv' });
      downloadFile(blob, `${fileName}.csv`);
    } else if (format === 'excel') {
      const csvData = generateCSV(result);
      const blob = new Blob([csvData], { type: 'application/vnd.ms-excel' });
      downloadFile(blob, `${fileName}.xls`);
    }

    setExportDropdownOpenId(null);
  };

  if (!currentProblem) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No Problem Selected</h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Please select a problem to view its results history.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ResultsHistoryHeader
        resultsCount={results.length}
        currentProblemName={currentProblem.name}
        selectedCount={selectedResultIds.length}
        totalCount={allResultIds.length}
        onSelectAll={handleSelectAll}
        onCompareSelected={handleCompareSelected}
        onBulkDelete={handleBulkDelete}
        onClearSelection={() => selectResultsForComparison([])}
      />

      <ResultsHistorySummary currentProblem={currentProblem} bestResult={bestResult} />

      {results.length === 0 ? (
        <div className="text-center py-12">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No Results Yet</h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Run the solver to generate results for this problem.
          </p>
        </div>
      ) : (
        <ResultsHistoryList
          results={results}
          currentProblem={currentProblem}
          selectedResultIds={selectedResultIds}
          expandedResults={expandedResults}
          editingId={editingId}
          editingName={editingName}
          exportDropdownOpenId={exportDropdownOpenId}
          configDetailsOpenId={configDetailsOpenId}
          bestResultId={bestResult?.id}
          mostRecentResult={mostRecentResult}
          onToggleSelected={toggleResultSelection}
          onToggleExpanded={toggleExpanded}
          onStartRename={handleRename}
          onSaveRename={handleSaveRename}
          onCancelRename={handleCancelRename}
          onChangeEditingName={setEditingName}
          onOpenDetails={handleOpenDetails}
          onDelete={handleDelete}
          onExport={handleExportResult}
          onToggleExportDropdown={(resultId) => setExportDropdownOpenId(exportDropdownOpenId === resultId ? null : resultId)}
          onCloseExportDropdown={() => setExportDropdownOpenId(null)}
          onToggleConfigDetails={(resultId) => setConfigDetailsOpenId(configDetailsOpenId === resultId ? null : resultId)}
          onCloseConfigDetails={() => setConfigDetailsOpenId(null)}
          onRestoreConfig={(result) => {
            const suggested = `${currentProblem?.name || 'Problem'} – ${result.name || 'Result'} (restored)`;
            restoreResultAsNewProblem(result.id, suggested);
          }}
        />
      )}
    </div>
  );
}
