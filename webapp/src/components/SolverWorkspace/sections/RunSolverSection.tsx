import React from 'react';
import { SolverPanel } from '../../SolverPanel';

export function RunSolverSection() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
          Recommended workflow
        </div>
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Run Solver
          </h1>
          <p className="mt-2 max-w-3xl text-sm" style={{ color: 'var(--text-secondary)' }}>
            Use the default solver workspace to choose a solver family, apply recommended settings when available, and monitor live diagnostics during the run.
          </p>
        </div>
      </header>

      <SolverPanel hidePageHeader />
    </section>
  );
}
