import { Download, FolderOpen, Layers3, Save, Target, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trackLandingEvent } from '../../services/landingInstrumentation';
import { useAppStore } from '../../store';
import { MetricCard } from '../ResultsView/MetricCard';
import { ResultsScheduleGrid } from '../ResultsView/ResultsScheduleGrid';
import { buildResultsSessionData } from '../results/buildResultsViewModel';
import type { QuickSetupController } from './useQuickSetup';

interface QuickSetupResultsProps {
  controller: QuickSetupController;
}

export function QuickSetupResults({ controller }: QuickSetupResultsProps) {
  const { result } = controller;
  const replaceWorkspace = useAppStore((state) => state.replaceWorkspace);
  const navigate = useNavigate();
  const workspacePayload = controller.buildWorkspaceBridgePayload();
  const solvedSolution = workspacePayload.solution ?? null;
  const sharedSessionData = solvedSolution ? buildResultsSessionData(workspacePayload.scenario, solvedSolution) : [];

  const openAdvancedWorkspace = () => {
    trackLandingEvent('landing_open_advanced_workspace', {
      hasResult: Boolean(result),
      source: 'quick_setup_results',
    });
    replaceWorkspace(controller.buildWorkspaceBridgePayload());
    navigate(result ? '/app/results' : '/app/scenario/people');
  };

  return (
    <section className="rounded-3xl border p-5" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Generated groups</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Generate locally first, then continue into the expert workspace only if you want deeper controls.
          </p>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {controller.draftStorageLabel}
        </div>
      </div>

      {controller.errorMessage && (
        <div className="mt-5 rounded-2xl px-4 py-3 text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          {controller.errorMessage}
        </div>
      )}

      {!result ? (
        <div className="mt-5 rounded-3xl border border-dashed p-6 text-sm leading-7" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
          Paste names, pick group sizing, and click <strong>Generate groups</strong>. Results will appear here without touching the global app state.
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={controller.exportGroupsCsv}
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                trackLandingEvent('landing_save_project_clicked', {
                  hasResult: Boolean(result),
                });
                controller.exportProjectDraft();
              }}
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <Save className="h-4 w-4" />
              Save draft file
            </button>
            <button
              type="button"
              onClick={openAdvancedWorkspace}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              <FolderOpen className="h-4 w-4" />
              Open in advanced workspace
            </button>
          </div>

          <div className="mt-6 space-y-6">
            {solvedSolution ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <MetricCard title="Cost Score" value={solvedSolution.final_score.toFixed(1)} icon={Target} colorClass="text-green-600" />
                  <MetricCard title="Unique Contacts" value={solvedSolution.unique_contacts} icon={Users} colorClass="text-blue-600" />
                  <MetricCard title="Sessions" value={workspacePayload.scenario.num_sessions} icon={Layers3} colorClass="text-purple-600" />
                </div>
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">Inline results preview</h3>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Seed {result.seed}
                    </div>
                  </div>
                  <ResultsScheduleGrid sessionData={sharedSessionData} />
                </div>
              </>
            ) : (
              result.sessions.map((session) => (
                <div key={session.sessionNumber}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">Session {session.sessionNumber}</h3>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Seed {result.seed}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {session.groups.map((group) => (
                      <div
                        key={`${session.sessionNumber}-${group.id}`}
                        className="rounded-2xl border p-4"
                        style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
                      >
                        <div className="text-sm font-semibold">{group.id}</div>
                        <ul className="mt-3 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {group.members.map((member) => (
                            <li key={member.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--bg-primary)' }}>
                              <span>{member.name}</span>
                              {Object.keys(member.attributes).length > 0 && (
                                <span className="text-xs uppercase tracking-[0.18em]">{Object.values(member.attributes).join(' / ')}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
