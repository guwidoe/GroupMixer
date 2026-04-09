import React from 'react';
import type { SolverCatalogEntry, SolverFamilyId } from '../../../services/solverUi';

interface SolverSelectorProps {
  selectedSolverFamilyId: SolverFamilyId;
  solverCatalog: readonly SolverCatalogEntry[];
  onSelectSolverFamily: (familyId: SolverFamilyId) => void;
  isRunning: boolean;
}

export function SolverSelector({
  selectedSolverFamilyId,
  solverCatalog,
  onSelectSolverFamily,
  isRunning,
}: SolverSelectorProps) {
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
        Solver Family
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {solverCatalog.map((entry) => {
          const selected = entry.id === selectedSolverFamilyId;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelectSolverFamily(entry.id)}
              disabled={isRunning}
              className="text-left p-4 rounded-lg border transition-all"
              style={{
                borderColor: selected ? 'var(--color-accent)' : 'var(--border-secondary)',
                backgroundColor: selected ? 'var(--bg-tertiary)' : 'var(--background-secondary)',
                opacity: isRunning ? 0.8 : 1,
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {entry.displayName}
                </span>
                <div className="flex items-center gap-2">
                  {entry.experimental && (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs border"
                      style={{
                        borderColor: 'var(--border-primary)',
                        color: 'var(--text-secondary)',
                        backgroundColor: 'var(--bg-primary)',
                      }}
                    >
                      Experimental
                    </span>
                  )}
                  {selected && (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs"
                      style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
                    >
                      Selected
                    </span>
                  )}
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
    </div>
  );
}
