import React, { useRef } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  Save,
  Square,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { ScenarioResult } from '../../types';
import type { RuntimeSolverDescriptor } from '../../services/runtime';
import type { MetricCalculations } from '../../utils/metricCalculations';
import type { ScenarioConfigDifference } from '../../services/scenarioStorage';
import { resolveRuntimeSolverDisplayName, summarizeSolverSettings } from '../../services/solverUi';
import { useOutsideClick } from '../../hooks';
import { formatDate, formatDuration } from './utils';

export interface ResultCardState {
  isExpanded: boolean;
  isSelected: boolean;
  isBest: boolean;
  isCurrent: boolean;
  editingId: string | null;
  editingName: string;
  exportDropdownOpen: boolean;
  configDetailsOpen: boolean;
}

export interface ResultCardActions {
  onChangeEditingName: (value: string) => void;
  onStartRename: (result: ScenarioResult) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onToggleSelected: (resultId: string) => void;
  onToggleExpanded: (resultId: string) => void;
  onOpenDetails: (result: ScenarioResult) => void;
  onDelete: (resultId: string) => void;
  onExport: (result: ScenarioResult, format: 'json' | 'csv' | 'excel') => void;
  onToggleExportDropdown: (resultId: string) => void;
  onCloseExportDropdown: () => void;
  onToggleConfigDetails: (resultId: string) => void;
  onCloseConfigDetails: () => void;
  onRestoreConfig: (result: ScenarioResult) => void;
}

export interface ResultCardMetrics {
  configDiff: ScenarioConfigDifference | null;
  metrics: MetricCalculations;
  scoreColorClass: string;
  repPenalty: number;
  balPenalty: number;
  conPenalty: number;
  repColorClass: string;
  balColorClass: string;
  conColorClass: string;
}

interface ResultCardProps {
  result: ScenarioResult;
  runtimeSolverCatalog: readonly RuntimeSolverDescriptor[];
  runtimeSolverCatalogStatus: 'idle' | 'loading' | 'ready' | 'error';
  runtimeSolverCatalogError: string | null;
  state: ResultCardState;
  actions: ResultCardActions;
  metrics: ResultCardMetrics;
}

function formatRuntimeSolverLabel(
  displayName: string | null,
  solverType: string,
  status: 'idle' | 'loading' | 'ready' | 'error',
): string {
  if (displayName) {
    return displayName;
  }

  if (status === 'error') {
    return `Solver info unavailable (${solverType})`;
  }

  if (status === 'ready') {
    return `Unknown solver (${solverType})`;
  }

  return `Loading (${solverType})`;
}

export function ResultCard({
  result,
  runtimeSolverCatalog,
  runtimeSolverCatalogStatus,
  runtimeSolverCatalogError,
  state,
  actions,
  metrics,
}: ResultCardProps) {
  const solverDisplayName = resolveRuntimeSolverDisplayName(runtimeSolverCatalog, result.solverSettings.solver_type);
  const solverSummaryRows = summarizeSolverSettings(result.solverSettings);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const configDetailsRef = useRef<HTMLDivElement>(null);

  useOutsideClick({
    refs: [exportDropdownRef],
    onOutsideClick: () => actions.onCloseExportDropdown(),
    enabled: state.exportDropdownOpen,
  });

  useOutsideClick({
    refs: [configDetailsRef],
    onOutsideClick: () => actions.onCloseConfigDetails(),
    enabled: state.configDetailsOpen,
  });

  return (
    <div
      className={`card transition-all ${state.isCurrent ? '' : state.isSelected ? 'ring-2' : ''} ${state.isBest ? 'badge-best' : ''}`}
      style={{
        ...(state.isCurrent ? {
          borderColor: 'var(--text-accent-green)',
          boxShadow: `0 0 0 3px var(--text-accent-green)`,
        } : state.isSelected ? {
          borderColor: 'var(--color-accent)',
          boxShadow: `0 0 0 2px var(--color-accent)`,
        } : {}),
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea, svg')) return;
        actions.onToggleSelected(result.id);
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
        <div className="flex items-start sm:items-center space-x-3 min-w-0 flex-1">
          <button
            onClick={() => actions.onToggleSelected(result.id)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-1 sm:mt-0"
          >
            {state.isSelected ? (
              <CheckSquare className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
            ) : (
              <Square className="h-5 w-5" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            {state.editingId === result.id ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  className="input text-sm flex-1"
                  value={state.editingName}
                  onChange={(e) => actions.onChangeEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') actions.onSaveRename();
                    if (e.key === 'Escape') actions.onCancelRename();
                  }}
                  autoFocus
                />
                <button
                  onClick={actions.onSaveRename}
                  className="text-green-600 hover:text-green-700 flex-shrink-0"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  onClick={actions.onCancelRename}
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
                    onClick={() => actions.onStartRename(result)}
                    className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                    title="Rename result"
                  >
                    <Edit3 className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {state.isBest && (
                    <span className="px-2 py-1 rounded-full text-xs badge-best">Best</span>
                  )}
                  {state.isCurrent && (
                    <span
                      className="px-2 py-1 rounded-full text-xs border"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}
                    >
                      Latest
                    </span>
                  )}
                  {runtimeSolverCatalogStatus === 'error' && runtimeSolverCatalogError && (
                    <span
                      className="px-2 py-1 rounded-full text-xs border"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--color-danger)',
                        borderColor: 'var(--color-danger)',
                      }}
                      title={runtimeSolverCatalogError}
                    >
                      Solver info unavailable
                    </span>
                  )}
                  {metrics.configDiff && metrics.configDiff.isDifferent && (
                    <div className="relative" ref={configDetailsRef}>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          actions.onToggleConfigDetails(result.id);
                        }}
                        className="px-2 py-1 rounded-full text-xs border cursor-pointer flex items-center gap-1 transition-colors hover:opacity-80"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          color: '#dc2626',
                          borderColor: '#dc2626',
                          lineHeight: 1.2,
                        }}
                        title="Different Scenario Configuration - Click to see details"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        <span>Different Config</span>
                        <ChevronRight className={`h-3 w-3 transition-transform ${state.configDetailsOpen ? 'rotate-90' : ''}`} />
                      </span>

                      {state.configDetailsOpen && (
                        <div
                          className="absolute top-full left-0 mt-1 z-10 w-80 max-w-[calc(100vw-2rem)] p-3 rounded-lg border shadow-lg"
                          style={{
                            backgroundColor: 'var(--bg-primary)',
                            borderColor: '#dc2626',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2 mb-2">
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                              <span className="font-medium text-red-600">Different Scenario Configuration</span>
                            </div>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              This result was created with a different scenario setup than the most recent result and may not be directly comparable with the current configuration.
                            </p>
                            <div className="mt-2 space-y-1">
                              {Object.entries(metrics.configDiff.details).map(([key, detail]) => (
                                detail ? (
                                  <div key={key} className="flex items-start space-x-2 text-xs">
                                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5 flex-shrink-0" />
                                    <span style={{ color: 'var(--text-secondary)' }}>{detail}</span>
                                  </div>
                                ) : null
                              ))}
                            </div>
                            <div className="pt-2">
                              <button
                                className="btn-primary w-full text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  actions.onRestoreConfig(result);
                                }}
                              >
                                Restore this result&apos;s configuration as new scenario
                              </button>
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
            onClick={() => actions.onOpenDetails(result)}
            className="btn-secondary flex items-center gap-2 px-3 py-1 text-sm"
          >
            <Eye className="h-4 w-4" />
            Open Current Result
          </button>
          <button
            onClick={() => actions.onToggleExpanded(result.id)}
            className="text-gray-400 hover:text-gray-600"
          >
            {state.isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm items-center">
        <div className="flex items-center min-w-0 space-x-2">
          <BarChart3 className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Score:</span>
          <span className={`font-medium ${metrics.scoreColorClass}`}>{result.solution.final_score.toFixed(2)}</span>
        </div>
        <div className="flex items-center min-w-0 space-x-2">
          <Users className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Unique:</span>
          <span className={`font-medium ${metrics.metrics.uniqueColorClass}`} style={{ whiteSpace: 'nowrap' }}>
            {result.solution.unique_contacts} / {metrics.metrics.effectiveMaxUniqueTotal}
          </span>
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

      {state.isExpanded && (
        <div className="mt-4 pt-4 border-t space-y-4">
          <div>
            <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Score Breakdown</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <div style={{ color: 'var(--text-secondary)' }}>Unique Contacts</div>
                <div className={`font-medium ${metrics.metrics.uniqueColorClass}`}>
                  {result.solution.unique_contacts} / {metrics.metrics.effectiveMaxUniqueTotal}
                </div>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <div style={{ color: 'var(--text-secondary)' }}>Avg Contacts / Person</div>
                <div className={`font-medium ${metrics.metrics.avgColorClass}`}>
                  {metrics.metrics.avgUniqueContacts.toFixed(1)} / {metrics.metrics.effectiveMaxAvgContacts}
                </div>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <div style={{ color: 'var(--text-secondary)' }}>Repetition Penalty</div>
              <div className={`font-medium ${metrics.repColorClass}`}>{metrics.repPenalty.toFixed(2)}</div>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <div style={{ color: 'var(--text-secondary)' }}>Balance Penalty</div>
              <div className={`font-medium ${metrics.balColorClass}`}>{metrics.balPenalty.toFixed(2)}</div>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <div style={{ color: 'var(--text-secondary)' }}>Constraint Penalty</div>
              <div className={`font-medium ${metrics.conColorClass}`}>{metrics.conPenalty.toFixed(2)}</div>
            </div>
          </div>
          </div>

          <div>
            <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Solver Configuration</h4>
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Solver Family:</span>
                  <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {formatRuntimeSolverLabel(
                      solverDisplayName,
                      result.solverSettings.solver_type,
                      runtimeSolverCatalogStatus,
                    )}
                  </span>
                </div>
                {solverSummaryRows.map((row) => (
                  <div key={row.label}>
                    <span style={{ color: 'var(--text-secondary)' }}>{row.label}:</span>
                    <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-row flex-wrap items-center justify-between pt-3 border-t gap-3">
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => actions.onToggleExportDropdown(result.id)}
                className="btn-secondary flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Export</span>
                <ChevronDown className="h-3 w-3" />
              </button>

              {state.exportDropdownOpen && (
                <div
                  className="absolute left-0 mt-1 w-40 rounded-md shadow-lg z-10 border overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
                >
                  <button
                    onClick={() => actions.onExport(result, 'json')}
                    className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
                    style={{ color: 'var(--text-primary)', backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <FileText className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>Export as JSON</span>
                  </button>
                  <button
                    onClick={() => actions.onExport(result, 'csv')}
                    className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
                    style={{ color: 'var(--text-primary)', backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>Export as CSV</span>
                  </button>
                  <button
                    onClick={() => actions.onExport(result, 'excel')}
                    className="flex items-center w-full px-3 py-2 text-sm text-left transition-colors"
                    style={{ color: 'var(--text-primary)', backgroundColor: 'transparent' }}
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
              onClick={() => actions.onDelete(result.id)}
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
}
