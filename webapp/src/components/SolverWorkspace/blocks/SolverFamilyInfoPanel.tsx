import React from 'react';
import type { SolverSettings } from '../../../types';
import type { SolverCatalogEntry } from '../../../services/solverUi';
import { getSolverUiSpecForSettings, summarizeSolverSettings } from '../../../services/solverUi';

interface SolverFamilyInfoPanelProps {
  displaySettings: SolverSettings;
  solverCatalogEntry: SolverCatalogEntry | null;
}

export function SolverFamilyInfoPanel({ displaySettings, solverCatalogEntry }: SolverFamilyInfoPanelProps) {
  const solverUiSpec = getSolverUiSpecForSettings(displaySettings.solver_type);
  const summaryRows = summarizeSolverSettings(displaySettings);

  return (
    <section
      className="rounded-2xl border p-4 md:p-5"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <h3 className="mb-4 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        Algorithm Information
      </h3>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h4 className="mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>
            {solverCatalogEntry?.displayName ?? solverUiSpec?.displayName ?? displaySettings.solver_type}
          </h4>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {solverCatalogEntry?.notes ?? solverUiSpec?.shortDescription ?? 'Solver-family metadata is unavailable for this configuration.'}
          </p>
          {solverUiSpec ? (
            <ul className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {solverUiSpec.algorithmHighlights.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div>
          <h4 className="mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>
            Current Parameters
          </h4>
          <div className="space-y-2 text-sm">
            {summaryRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>{row.label}:</span>
                <span className="text-right font-medium" style={{ color: 'var(--text-primary)' }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
