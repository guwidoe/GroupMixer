import React from 'react';
import type { SolverSettings } from '../../types';
import { getSolverCatalogEntry } from '../../services/solverCatalog';
import { getSolverUiSpecForSettings, summarizeSolverSettings } from '../../services/solverUi';

interface SolverAlgorithmInfoProps {
  displaySettings: SolverSettings;
}

export function SolverAlgorithmInfo({ displaySettings }: SolverAlgorithmInfoProps) {
  const solverEntry = getSolverCatalogEntry(displaySettings.solver_type);
  const solverUiSpec = getSolverUiSpecForSettings(displaySettings.solver_type);
  const summaryRows = summarizeSolverSettings(displaySettings);

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        Algorithm Information
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            {solverEntry?.displayName ?? solverUiSpec?.displayName ?? displaySettings.solver_type}
          </h4>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            {solverEntry?.notes ?? solverUiSpec?.shortDescription ?? 'Solver-family metadata is unavailable for this configuration.'}
          </p>
          {solverUiSpec && (
            <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
              {solverUiSpec.algorithmHighlights.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Current Parameters
          </h4>
          <div className="space-y-2 text-sm">
            {summaryRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>{row.label}:</span>
                <span className="font-medium text-right" style={{ color: 'var(--text-primary)' }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
