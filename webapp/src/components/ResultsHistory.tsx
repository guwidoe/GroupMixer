import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart3, 
  Clock, 
  Zap, 
  ChevronDown, 
  ChevronUp, 
  Edit3, 
  Trash2, 
  Save, 
  X, 
  Calendar,
  CheckSquare,
  Square,
  GitCompare,
  Download,
  Target,
  Users,
  Layers,
  FileText,
  FileSpreadsheet,
  Eye,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';
import type { ProblemResult, Problem, ProblemSnapshot, SolverSettings } from '../types';
import { generateAssignmentsCsv } from '../utils/csvExport';
import { compareProblemConfigurations } from '../services/problemStorage';
import { calculateMetrics, getColorClass } from '../utils/metricCalculations';

// Helper: Convert a ProblemSnapshot and SolverSettings to a Problem
function snapshotToProblem(snapshot: ProblemSnapshot, settings: SolverSettings): Problem {
  return {
    ...snapshot,
    settings,
  };
}

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
  } = useAppStore();
  const navigate = useNavigate();

  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [exportDropdownOpen, setExportDropdownOpen] = useState<string | null>(null);
  const [configDetailsOpen, setConfigDetailsOpen] = useState<string | null>(null);

  const currentProblem = currentProblemId ? savedProblems[currentProblemId] : null;
  const results = currentProblem?.results || [];
  const allResultIds = results.map(r => r.id);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(null);
      }
    };

    if (exportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [exportDropdownOpen]);

  // Close config details when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.config-details-badge') && !target.closest('.relative')) {
        setConfigDetailsOpen(null);
      }
    };

    if (configDetailsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [configDetailsOpen]);

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

  // Open details tab for this result
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

  const handleExportResult = (result: ProblemResult, format: 'json' | 'csv' | 'excel') => {
    const fileName = result.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'result';
    
    if (format === 'json') {
      const exportData = {
        result,
        currentProblem: currentProblem?.problem, // Current problem configuration
        problemSnapshot: result.problemSnapshot, // Problem configuration when result was created
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
    
    setExportDropdownOpen(null);
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

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // Improved: Lower scores (better) are green, higher scores (worse) are red, relative to min/max in results
  const getScoreColor = (score: number, result: ProblemResult) => {
    if (!results.length) return 'text-gray-600';
    // Only use results with the same config for coloring
    const comparableResults = results.filter(r => isSameConfig(r, result));
    if (comparableResults.length <= 1) return 'text-gray-600';
    // If this result is not comparable to the latest, gray
    if (!isSameConfig(result, mostRecentResult)) return 'text-gray-600';
    const scores = comparableResults.map(r => r.solution.final_score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    if (min === max) return 'text-green-600';
    const ratio = (score - min) / (max - min);
    if (ratio <= 0.15) return 'text-green-600';
    if (ratio <= 0.35) return 'text-lime-600';
    if (ratio <= 0.6) return 'text-yellow-600';
    if (ratio <= 0.85) return 'text-orange-600';
    return 'text-red-600';
  };

  // Find the most recent result (by timestamp)
  const mostRecentResult = results.length > 0 ? results.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)) : null;
  const mostRecentResultId = mostRecentResult?.id;

  // Helper: check if two results have the same config
  function isSameConfig(resultA: ProblemResult | null, resultB: ProblemResult | null): boolean {
    if (!resultA || !resultB) return false;
    if (!resultA.problemSnapshot || !resultB.problemSnapshot) return false;
    const a = snapshotToProblem(resultA.problemSnapshot, resultA.solverSettings);
    const b = snapshotToProblem(resultB.problemSnapshot, resultB.solverSettings);
    const diff = compareProblemConfigurations(a, b);
    return !diff.isDifferent;
  }

  // Best result: only among those with the same config as the latest
  const getBestResult = () => {
    if (!results.length || !mostRecentResult) return null;
    const comparableResults = results.filter(r => isSameConfig(r, mostRecentResult));
    if (!comparableResults.length) return null;
    return comparableResults.reduce((best, current) =>
      current.solution.final_score < best.solution.final_score ? current : best
    );
  };

  const bestResult = getBestResult();

  const formatNumber = (num: number | undefined) => {
    if (num === undefined) return 'N/A';
    if (num < 0.001 && num !== 0) {
      return num.toExponential(2);
    }
    return num.toLocaleString(undefined, { 
      maximumFractionDigits: 6,
      minimumFractionDigits: 0
    });
  };

  const formatLargeNumber = (num: number | undefined) => {
    if (num === undefined) return 'N/A';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
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
      {/* Header & Bulk Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Results History</h2>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
            {results.length} result{results.length !== 1 ? 's' : ''} for "{currentProblem.name}"
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {results.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="btn-secondary text-sm w-full sm:w-auto"
            >
              {selectedResultIds.length === allResultIds.length ? 'Clear Selection' : 'Select All'}
            </button>
          )}
          {selectedResultIds.length > 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-sm w-full sm:w-auto" style={{ color: 'var(--text-secondary)' }}>
              <span className="text-center sm:text-left">{selectedResultIds.length} selected</span>
              <div className="flex flex-col sm:flex-row gap-2">
                {selectedResultIds.length >= 2 && (
                  <button
                    onClick={handleCompareSelected}
                    className="btn-primary flex items-center justify-center sm:justify-start space-x-2"
                  >
                    <GitCompare className="h-4 w-4" />
                    <span>Compare</span>
                  </button>
                )}
                <button
                  onClick={handleBulkDelete}
                  className="btn-danger flex items-center justify-center sm:justify-start space-x-2"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete {selectedResultIds.length > 1 ? `${selectedResultIds.length} Results` : 'Result'}</span>
                </button>
                <button
                  onClick={() => selectResultsForComparison([])}
                  className="btn-secondary"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Problem Summary */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0 mb-4">
                      <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Problem Overview</h3>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex items-center space-x-1">
              <Users className="h-4 w-4" />
              <span>{currentProblem.problem.people.length} people</span>
            </div>
            <div className="flex items-center space-x-1">
              <Layers className="h-4 w-4" />
              <span>{currentProblem.problem.groups.length} groups</span>
            </div>
            <div className="flex items-center space-x-1">
              <Calendar className="h-4 w-4" />
              <span>{currentProblem.problem.num_sessions} sessions</span>
            </div>
          </div>
        </div>
        
                  {bestResult && (
            <div className="rounded-lg p-4 border badge-best">
            <div className="flex items-center space-x-2 mb-2">
              <Target className="h-5 w-5" style={{ color: 'var(--badge-best-text)' }} />
              <span className="font-medium" style={{ color: 'var(--badge-best-text)' }}>Best Result</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <span style={{ color: 'var(--badge-best-text)' }}>Score:</span>
                <span className="ml-2 font-medium" style={{ color: 'var(--badge-best-text)' }}>
                  {bestResult.solution.final_score.toFixed(2)}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--badge-best-text)' }}>Duration:</span>
                <span className="ml-2 font-medium" style={{ color: 'var(--badge-best-text)' }}>
                  {formatDuration(bestResult.duration)}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--badge-best-text)' }}>Iterations:</span>
                <span className="ml-2 font-medium" style={{ color: 'var(--badge-best-text)' }}>
                  {bestResult.solution.iteration_count.toLocaleString()}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--badge-best-text)' }}>Name:</span>
                <span className="ml-2 font-medium" style={{ color: 'var(--badge-best-text)' }}>
                  {bestResult.name}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results List */}
      {results.length === 0 ? (
        <div className="text-center py-12">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No Results Yet</h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Run the solver to generate results for this problem.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {results
            .sort((a, b) => b.timestamp - a.timestamp) // Most recent first
            .map((result) => {
              const isExpanded = expandedResults.has(result.id);
              const isSelected = selectedResultIds.includes(result.id);
              const isBest = result.id === bestResult?.id;
              // Only the most recent result is 'Current'
              const isCurrent = result.id === mostRecentResultId;

              // === Derived metrics using cached configuration ===
              const metrics = (() => {
                // Use the result's problemSnapshot for metric calculations, fallback to current problem
                const problemConfig = result.problemSnapshot || currentProblem.problem;
                return calculateMetrics(problemConfig, result.solution);
              })();

              const repPenalty = result.solution.weighted_repetition_penalty ?? result.solution.repetition_penalty;
              const balPenalty = result.solution.attribute_balance_penalty;
              const conPenalty = result.solution.weighted_constraint_penalty ?? result.solution.constraint_penalty;

              const repColorClass = getColorClass(repPenalty === 0 ? 0 : 1, true);
              const balColorClass = getColorClass(balPenalty === 0 ? 0 : 1, true);
              const conColorClass = getColorClass(conPenalty === 0 ? 0 : 1, true);

              // Check if problem configuration has changed since result was created
              const configDiff = currentProblem ? compareProblemConfigurations(
                currentProblem.problem,
                result.problemSnapshot
              ) : null;

              return (
                <div
                  key={result.id}
                  className={`card transition-all ${isCurrent ? '' : isSelected ? 'ring-2' : ''} ${isBest ? 'badge-best' : ''}`}
                  style={{
                    ...(isCurrent ? {
                      borderColor: 'var(--text-accent-green)',
                      boxShadow: `0 0 0 3px var(--text-accent-green)`
                    } : isSelected ? {
                      borderColor: 'var(--color-accent)',
                      boxShadow: `0 0 0 2px var(--color-accent)`
                    } : {})
                  }}
                  onClick={(e) => {
                    // Ignore clicks on interactive elements to prevent double toggle
                    const target = e.target as HTMLElement;
                    if (target.closest('button, a, input, textarea, svg')) return;
                    toggleResultSelection(result.id);
                  }}
                >
                  {/* Result Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                    <div className="flex items-start sm:items-center space-x-3 min-w-0 flex-1">
                      <button
                        onClick={() => toggleResultSelection(result.id)}
                        className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-1 sm:mt-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
                        ) : (
                          <Square className="h-5 w-5" />
                        )}
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        {editingId === result.id ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              className="input text-sm flex-1"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename();
                                if (e.key === 'Escape') handleCancelRename();
                              }}
                              autoFocus
                            />
                            <button
                              onClick={handleSaveRename}
                              className="text-green-600 hover:text-green-700 flex-shrink-0"
                            >
                              <Save className="h-4 w-4" />
                            </button>
                            <button
                              onClick={handleCancelRename}
                              className="text-red-600 hover:text-red-700 flex-shrink-0"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <h3 className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                {result.name}
                              </h3>
                              <button
                                onClick={() => handleRename(result)}
                                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                                title="Rename result"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center">
                              {isBest && (
                                <span className="px-2 py-1 rounded-full text-xs badge-best">
                                  Best
                                </span>
                              )}
                              {isCurrent && (
                                <span className="px-2 py-1 rounded-full text-xs border" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}>
                                  Latest
                                </span>
                              )}
                              {configDiff && configDiff.isDifferent && (
                                <div className="relative">
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfigDetailsOpen(configDetailsOpen === result.id ? null : result.id);
                                    }}
                                    className="px-2 py-1 rounded-full text-xs border cursor-pointer flex items-center gap-1 transition-colors hover:opacity-80"
                                    style={{ 
                                      backgroundColor: 'var(--bg-secondary)', 
                                      color: '#dc2626', 
                                      borderColor: '#dc2626',
                                      lineHeight: 1.2
                                    }}
                                    title="Different Problem Configuration - Click to see details"
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    <span>Different Config</span>
                                    <ChevronRight className={`h-3 w-3 transition-transform ${configDetailsOpen === result.id ? 'rotate-90' : ''}`} />
                                  </span>
                                  
                                  {/* Expanded Badge Details */}
                                  {configDetailsOpen === result.id && (
                                    <div className="absolute top-full left-0 mt-1 z-10 w-80 max-w-[calc(100vw-2rem)] p-3 rounded-lg border shadow-lg"
                                         style={{ 
                                           backgroundColor: 'var(--bg-primary)', 
                                           borderColor: '#dc2626',
                                           color: 'var(--text-primary)'
                                         }}>
                                      <div className="space-y-2">
                                        <div className="flex items-center space-x-2 mb-2">
                                          <AlertTriangle className="h-4 w-4 text-red-500" />
                                          <span className="font-medium text-red-600">Different Problem Configuration</span>
                                        </div>
                                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                          This result was created with a different problem setup than the most recent result and may not be directly comparable with the current configuration.
                                        </p>
                                        <div className="mt-2 space-y-1">
                                          {Object.entries(configDiff.details).map(([key, detail]) => (
                                            detail && (
                                              <div key={key} className="flex items-start space-x-2 text-xs">
                                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5 flex-shrink-0"></div>
                                                <span style={{ color: 'var(--text-secondary)' }}>{detail}</span>
                                              </div>
                                            )
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0">
                        <button
                          onClick={() => handleOpenDetails(result)}
                          className="btn-secondary flex items-center gap-2 px-3 py-1 text-sm"
                        >
                          <Eye className="h-4 w-4" />
                          View in Result Details
                        </button>
                      <button
                        onClick={() => toggleExpanded(result.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Result Summary */}
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm items-center">
                    <div className="flex items-center min-w-0 space-x-2">
                      <BarChart3 className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Score:</span>
                      <span className={`font-medium ${getScoreColor(result.solution.final_score, result)}`}>{result.solution.final_score.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center min-w-0 space-x-2">
                      <Users className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Unique:</span>
                      <span className={`font-medium ${metrics.uniqueColorClass}`} style={{ whiteSpace: 'nowrap' }}>{result.solution.unique_contacts} / {metrics.effectiveMaxUniqueTotal}</span>
                    </div>
                    <div className="flex items-center min-w-0 space-x-2">
                      <Clock className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Duration:</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{formatDuration(result.duration)}</span>
                    </div>
                    <div className="flex items-center min-w-0 space-x-2">
                      <Zap className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Iterations:</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{result.solution.iteration_count.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center min-w-0 space-x-2">
                      <Calendar className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Created:</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{formatDate(result.timestamp)}</span>
                    </div>
                  </div>



                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      {/* Score Breakdown */}
                      <div>
                        <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Score Breakdown</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>Unique Contacts</div>
                            <div className={`font-medium ${metrics.uniqueColorClass}`}>{result.solution.unique_contacts} / {metrics.effectiveMaxUniqueTotal}</div>
                          </div>
                          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>Avg Contacts / Person</div>
                            <div className={`font-medium ${metrics.avgColorClass}`}>{metrics.avgUniqueContacts.toFixed(1)} / {metrics.effectiveMaxAvgContacts}</div>
                          </div>
                          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>Repetition Penalty</div>
                            <div className={`font-medium ${repColorClass}`}>{repPenalty.toFixed(2)}</div>
                          </div>
                          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>Balance Penalty</div>
                            <div className={`font-medium ${balColorClass}`}>{balPenalty.toFixed(2)}</div>
                          </div>
                          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>Constraint Penalty</div>
                            <div className={`font-medium ${conColorClass}`}>{conPenalty.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>

                      {/* Solver Settings */}
                      <div>
                        <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Solver Configuration</h4>
                        <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>Max Iterations:</span>
                              <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                                {formatLargeNumber(result.solverSettings.stop_conditions.max_iterations)}
                              </span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>Time Limit:</span>
                              <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                                {result.solverSettings.stop_conditions.time_limit_seconds}s
                              </span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>No Improvement:</span>
                              <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                                {formatLargeNumber(result.solverSettings.stop_conditions.no_improvement_iterations)}
                              </span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>Initial Temp:</span>
                              <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                                {formatNumber(result.solverSettings.solver_params.SimulatedAnnealing?.initial_temperature)}
                              </span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>Final Temp:</span>
                              <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                                {formatNumber(result.solverSettings.solver_params.SimulatedAnnealing?.final_temperature)}
                              </span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>Cooling:</span>
                              <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                                {result.solverSettings.solver_params.SimulatedAnnealing?.cooling_schedule}
                              </span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>Reheat After:</span>
                              <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                                {(result.solverSettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0) === 0 
                                  ? 'Disabled' 
                                  : formatLargeNumber(result.solverSettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0)
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-row flex-wrap items-center justify-between pt-3 border-t gap-3">
                        <div className="relative" ref={dropdownRef}>
                          <button
                            onClick={() => setExportDropdownOpen(
                              exportDropdownOpen === result.id ? null : result.id
                            )}
                            className="btn-secondary flex items-center space-x-2"
                          >
                            <Download className="h-4 w-4" />
                            <span>Export</span>
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          
                          {exportDropdownOpen === result.id && (
                            <div className="absolute left-0 mt-1 w-40 rounded-md shadow-lg z-10 border overflow-hidden" 
                                 style={{ 
                                   backgroundColor: 'var(--bg-primary)', 
                                   borderColor: 'var(--border-primary)' 
                                 }}>
                              <button
                                onClick={() => handleExportResult(result, 'json')}
                                className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
                                style={{ 
                                  color: 'var(--text-primary)',
                                  backgroundColor: 'transparent'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <FileText className="h-4 w-4 mr-2 flex-shrink-0" />
                                <span>Export as JSON</span>
                              </button>
                              <button
                                onClick={() => handleExportResult(result, 'csv')}
                                className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
                                style={{ 
                                  color: 'var(--text-primary)',
                                  backgroundColor: 'transparent'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <FileSpreadsheet className="h-4 w-4 mr-2 flex-shrink-0" />
                                <span>Export as CSV</span>
                              </button>
                              <button
                                onClick={() => handleExportResult(result, 'excel')}
                                className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
                                style={{ 
                                  color: 'var(--text-primary)',
                                  backgroundColor: 'transparent'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <FileSpreadsheet className="h-4 w-4 mr-2 flex-shrink-0" />
                                <span>Export as Excel</span>
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(result.id)}
                          className="btn-danger flex items-center space-x-2"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}


    </div>
  );
} 