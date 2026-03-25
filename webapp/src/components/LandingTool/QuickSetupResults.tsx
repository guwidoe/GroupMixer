import { Download, FolderOpen, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { QuickSetupController } from './useQuickSetup';

interface QuickSetupResultsProps {
  controller: QuickSetupController;
}

export function QuickSetupResults({ controller }: QuickSetupResultsProps) {
  const { result } = controller;

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
              onClick={controller.exportProjectDraft}
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <Save className="h-4 w-4" />
              Save draft file
            </button>
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              <FolderOpen className="h-4 w-4" />
              Open in advanced workspace
            </Link>
          </div>

          <div className="mt-6 space-y-6">
            {result.sessions.map((session) => (
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
            ))}
          </div>
        </>
      )}
    </section>
  );
}
