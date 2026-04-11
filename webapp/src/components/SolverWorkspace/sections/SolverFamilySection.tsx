import React from 'react';
import type { SolverWorkspaceResolvedSection } from '../navigation/solverWorkspaceNavTypes';
import { SolverPanel } from '../../SolverPanel';

interface SolverFamilySectionProps {
  section: SolverWorkspaceResolvedSection;
}

export function SolverFamilySection({ section }: SolverFamilySectionProps) {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
          Manual tuning
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {section.label}
          </h1>
          {section.catalogEntry?.experimental ? (
            <span
              className="rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.04em]"
              style={{
                borderColor: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
                color: 'var(--color-accent)',
              }}
            >
              Experimental
            </span>
          ) : null}
        </div>
        <p className="max-w-3xl text-sm" style={{ color: 'var(--text-secondary)' }}>
          {section.tooltipDescription ?? section.description}
        </p>
      </header>

      <SolverPanel hidePageHeader />
    </section>
  );
}
