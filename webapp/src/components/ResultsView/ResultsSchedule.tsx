import React from 'react';
import { BarChart3, Hash, LayoutGrid } from 'lucide-react';
import type { Scenario, Solution } from '../../types';
import { ResultsScheduleGrid } from './ResultsScheduleGrid';
import { ResultsScheduleList } from './ResultsScheduleList';
import { ResultsScheduleVisualization } from './ResultsScheduleVisualization';

interface SessionGroup {
  id: string;
  size: number;
  people: Array<Scenario['people'][number]>;
}

interface SessionData {
  sessionIndex: number;
  groups: SessionGroup[];
  totalPeople: number;
}

interface ResultsScheduleProps {
  viewMode: 'grid' | 'list' | 'visualize';
  onViewModeChange: (mode: 'grid' | 'list' | 'visualize') => void;
  sessionData: SessionData[];
  effectiveScenario: Scenario;
  solution: Solution;
  vizPluginId: string;
  onVizPluginChange: (id: string) => void;
  vizExportRef: React.RefObject<HTMLDivElement>;
}

export function ResultsSchedule({
  viewMode,
  onViewModeChange,
  sessionData,
  effectiveScenario,
  solution,
  vizPluginId,
  onVizPluginChange,
  vizExportRef,
}: ResultsScheduleProps) {
  return (
    <div className="rounded-lg border transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
      <div className="border-b px-6 py-4" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
          <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Group Assignments</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onViewModeChange('grid')}
              className="px-3 py-1 rounded text-sm transition-colors"
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
              className="px-3 py-1 rounded text-sm transition-colors"
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
              className="px-3 py-1 rounded text-sm transition-colors"
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
      </div>

      <div className="p-6">
        {viewMode === 'grid' ? (
          <ResultsScheduleGrid sessionData={sessionData} />
        ) : viewMode === 'list' ? (
          <ResultsScheduleList effectiveScenario={effectiveScenario} solution={solution} />
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
    </div>
  );
}
