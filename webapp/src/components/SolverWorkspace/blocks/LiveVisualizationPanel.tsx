import React from 'react';
import { LayoutGrid } from 'lucide-react';
import type { Scenario } from '../../../types';
import type { RuntimeProgressUpdate } from '../../../services/runtime';
import type { ScheduleSnapshot } from '../../../visualizations/types';
import { VisualizationPanel } from '../../../visualizations/VisualizationPanel';

interface LiveVizState {
  schedule: ScheduleSnapshot;
  progress: RuntimeProgressUpdate | null;
}

interface LiveVisualizationPanelProps {
  solverStateIsRunning: boolean;
  showLiveViz: boolean;
  onToggleLiveViz: () => void;
  liveVizState: LiveVizState | null;
  liveVizPluginId: string;
  onLiveVizPluginChange: (id: string) => void;
  getLiveVizScenario: () => Scenario | null;
}

export function LiveVisualizationPanel({
  solverStateIsRunning,
  showLiveViz,
  onToggleLiveViz,
  liveVizState,
  liveVizPluginId,
  onLiveVizPluginChange,
  getLiveVizScenario,
}: LiveVisualizationPanelProps) {
  return (
    <section
      className="rounded-2xl border p-4 md:p-5"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
          <div>
            <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
              Live visualization
            </h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Watch the current best schedule evolve while the solver is running.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="rounded border px-3 py-1 text-sm transition-colors"
          style={{
            backgroundColor: showLiveViz ? 'var(--bg-tertiary)' : 'transparent',
            color: showLiveViz ? 'var(--color-accent)' : 'var(--text-secondary)',
            borderColor: showLiveViz ? 'var(--color-accent)' : 'var(--border-primary)',
          }}
          onClick={onToggleLiveViz}
        >
          {showLiveViz ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {showLiveViz ? (
        solverStateIsRunning ? (
          liveVizState ? (
            (() => {
              const liveScenario = getLiveVizScenario();
              if (!liveScenario) {
                return null;
              }

              return (
                <div
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderColor: 'var(--border-primary)',
                  }}
                >
                  <VisualizationPanel
                    pluginId={liveVizPluginId}
                    onPluginChange={onLiveVizPluginChange}
                    data={{
                      kind: 'live',
                      scenario: liveScenario,
                      progress: liveVizState.progress,
                      schedule: liveVizState.schedule,
                    }}
                  />
                </div>
              );
            })()
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Waiting for best-schedule snapshots…
            </div>
          )
        ) : (
          <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Start the solver to see the schedule evolve over time.
          </div>
        )
      ) : (
        <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Enable live visualization to inspect the active schedule while solving.
        </div>
      )}
    </section>
  );
}
