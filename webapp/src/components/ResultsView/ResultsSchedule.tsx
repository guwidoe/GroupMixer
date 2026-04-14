import React from 'react';
import { BarChart3, Hash, LayoutGrid } from 'lucide-react';
import type { Scenario, Solution } from '../../types';
import type { ResultsViewModel } from '../../services/results/buildResultsModel';
import { ResultsScheduleGrid } from './ResultsScheduleGrid';
import { ResultsScheduleList } from './ResultsScheduleList';
import { ResultsScheduleVisualization } from './ResultsScheduleVisualization';

interface ResultsScheduleProps {
  viewMode: 'grid' | 'list' | 'visualize';
  onViewModeChange: (mode: 'grid' | 'list' | 'visualize') => void;
  resultsModel: ResultsViewModel | null;
  effectiveScenario: Scenario;
  solution: Solution;
  vizPluginId: string;
  onVizPluginChange: (id: string) => void;
  vizExportRef: React.RefObject<HTMLDivElement>;
}

export function ResultsSchedule({
  viewMode,
  onViewModeChange,
  resultsModel,
  effectiveScenario,
  solution,
  vizPluginId,
  onVizPluginChange,
  vizExportRef,
}: ResultsScheduleProps) {
  const [selectedSessionIndex, setSelectedSessionIndex] = React.useState<number | null>(null);

  if (!resultsModel) {
    return null;
  }

  return (
    <section className="rounded-2xl border transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
      <div className="border-b px-4 py-4 sm:px-6" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Assignment Layout</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              Switch between session-first, participant-first, and visualization views depending on how you want to review the result.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border p-1" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
            <button
              onClick={() => onViewModeChange('grid')}
              className="px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                backgroundColor: viewMode === 'grid' ? 'var(--bg-tertiary)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--color-accent)' : 'var(--text-secondary)',
                border: viewMode === 'grid' ? '1px solid var(--color-accent)' : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (viewMode !== 'grid') {
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (viewMode !== 'grid') {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <Hash className="w-4 h-4 inline mr-1" />
              Grid
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className="px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                backgroundColor: viewMode === 'list' ? 'var(--bg-tertiary)' : 'transparent',
                color: viewMode === 'list' ? 'var(--color-accent)' : 'var(--text-secondary)',
                border: viewMode === 'list' ? '1px solid var(--color-accent)' : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (viewMode !== 'list') {
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (viewMode !== 'list') {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <BarChart3 className="w-4 h-4 inline mr-1" />
              List
            </button>
            <button
              onClick={() => onViewModeChange('visualize')}
              className="px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                backgroundColor: viewMode === 'visualize' ? 'var(--bg-tertiary)' : 'transparent',
                color: viewMode === 'visualize' ? 'var(--color-accent)' : 'var(--text-secondary)',
                border: viewMode === 'visualize' ? '1px solid var(--color-accent)' : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (viewMode !== 'visualize') {
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (viewMode !== 'visualize') {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <LayoutGrid className="w-4 h-4 inline mr-1" />
              Visualize
            </button>
          </div>
        </div>

        {viewMode === 'grid' && resultsModel.sessions.length > 1 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedSessionIndex(null)}
              className="rounded-full border px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: selectedSessionIndex === null ? 'var(--bg-tertiary)' : 'transparent',
                color: selectedSessionIndex === null ? 'var(--color-accent)' : 'var(--text-secondary)',
                borderColor: selectedSessionIndex === null ? 'var(--color-accent)' : 'var(--border-primary)',
              }}
            >
              All sessions
            </button>
            {resultsModel.sessions.map((session) => (
              <button
                key={session.sessionIndex}
                type="button"
                onClick={() => setSelectedSessionIndex(session.sessionIndex)}
                className="rounded-full border px-3 py-1.5 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: selectedSessionIndex === session.sessionIndex ? 'var(--bg-tertiary)' : 'transparent',
                  color: selectedSessionIndex === session.sessionIndex ? 'var(--color-accent)' : 'var(--text-secondary)',
                  borderColor: selectedSessionIndex === session.sessionIndex ? 'var(--color-accent)' : 'var(--border-primary)',
                }}
              >
                {session.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="p-4 sm:p-6">
        {viewMode === 'grid' ? (
          <ResultsScheduleGrid sessionData={resultsModel.sessions} selectedSessionIndex={selectedSessionIndex} />
        ) : viewMode === 'list' ? (
          <ResultsScheduleList participants={resultsModel.participants} sessionCount={resultsModel.summary.totalSessions} />
        ) : (
          <ResultsScheduleVisualization
            vizExportRef={vizExportRef}
            vizPluginId={vizPluginId}
            onPluginChange={onVizPluginChange}
            effectiveScenario={effectiveScenario}
            solution={solution}
          />
        )}
      </div>
    </section>
  );
}
