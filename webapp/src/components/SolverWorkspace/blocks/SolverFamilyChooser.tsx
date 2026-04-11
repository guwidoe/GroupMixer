import React from 'react';
import type { SolverCatalogEntry, SolverFamilyId } from '../../../services/solverUi';

interface SolverFamilyChooserProps {
  selectedSolverFamilyId: SolverFamilyId;
  solverCatalog: readonly SolverCatalogEntry[];
  onSelectSolverFamily: (familyId: SolverFamilyId) => void;
  isRunning: boolean;
}

export function SolverFamilyChooser({
  selectedSolverFamilyId,
  solverCatalog,
  onSelectSolverFamily,
  isRunning,
}: SolverFamilyChooserProps) {
  return (
    <section
      className="rounded-2xl border p-4 md:p-5"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Solver Family
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Choose which solver family should own the current run.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {solverCatalog.map((entry) => {
          const selected = entry.id === selectedSolverFamilyId;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelectSolverFamily(entry.id)}
              disabled={isRunning}
              className="rounded-lg border p-4 text-left transition-all"
              style={{
                borderColor: selected ? 'var(--color-accent)' : 'var(--border-secondary)',
                backgroundColor: selected ? 'var(--bg-tertiary)' : 'var(--background-secondary)',
                opacity: isRunning ? 0.8 : 1,
              }}
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {entry.displayName}
                </span>
                <div className="flex items-center gap-2">
                  {entry.experimental ? (
                    <span
                      className="rounded-full border px-2 py-0.5 text-xs"
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
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
                    >
                      Selected
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {entry.notes}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>Warm start: {entry.capabilities.supportsInitialSchedule ? 'Yes' : 'No'}</span>
                <span>Recommended settings: {entry.capabilities.supportsRecommendedSettings ? 'Yes' : 'No'}</span>
                <span>Deterministic seed: {entry.capabilities.supportsDeterministicSeed ? 'Yes' : 'No'}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
