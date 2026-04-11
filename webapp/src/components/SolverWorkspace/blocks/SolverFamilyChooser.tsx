import React from 'react';
import { getSolverUiSpec, type SolverCatalogEntry, type SolverFamilyId } from '../../../services/solverUi';

interface SolverFamilyChooserProps {
  selectedSolverFamilyId: SolverFamilyId;
  solverCatalog: readonly SolverCatalogEntry[];
  onSelectSolverFamily: (familyId: SolverFamilyId) => void;
  isRunning: boolean;
}

function getCompactSummary(entry: SolverCatalogEntry): string {
  return getSolverUiSpec(entry.id)?.shortDescription
    ?? (entry.experimental ? 'Experimental alternative solver family.' : 'Stable default solver family.');
}

export function SolverFamilyChooser({
  selectedSolverFamilyId,
  solverCatalog,
  onSelectSolverFamily,
  isRunning,
}: SolverFamilyChooserProps) {
  return (
    <section
      className="rounded-2xl border p-4"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Solver Family
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Pick the solver family for this run.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {solverCatalog.map((entry) => {
          const selected = entry.id === selectedSolverFamilyId;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelectSolverFamily(entry.id)}
              disabled={isRunning}
              className="rounded-lg border px-3 py-3 text-left transition-all"
              style={{
                borderColor: selected ? 'var(--color-accent)' : 'var(--border-secondary)',
                backgroundColor: selected ? 'var(--bg-tertiary)' : 'var(--background-secondary)',
                opacity: isRunning ? 0.8 : 1,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {entry.displayName}
                </span>
                <div className="flex items-center gap-2">
                  {entry.experimental ? (
                    <span
                      className="rounded-full border px-2 py-0.5 text-[11px]"
                      style={{
                        borderColor: 'var(--border-primary)',
                        color: 'var(--text-secondary)',
                        backgroundColor: 'var(--bg-primary)',
                      }}
                    >
                      Experimental
                    </span>
                  ) : null}
                  {selected ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px]"
                      style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
                    >
                      Selected
                    </span>
                  ) : null}
                </div>
              </div>

              <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                {getCompactSummary(entry)}
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {entry.capabilities.supportsRecommendedSettings ? (
                  <span className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--border-primary)' }}>
                    Recommended settings
                  </span>
                ) : null}
                {entry.capabilities.supportsInitialSchedule ? (
                  <span className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--border-primary)' }}>
                    Warm start
                  </span>
                ) : null}
                {entry.capabilities.supportsDeterministicSeed ? (
                  <span className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--border-primary)' }}>
                    Deterministic seed
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
