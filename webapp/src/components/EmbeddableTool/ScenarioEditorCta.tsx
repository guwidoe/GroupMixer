import { ArrowRight, CircleHelp, Users } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import type { ToolPageOptimizerCtaContent } from '../../pages/toolPageTypes';

interface ScenarioEditorCtaProps {
  content: ToolPageOptimizerCtaContent;
  onOpen: () => void;
}

export function ScenarioEditorCta({ content, onOpen }: ScenarioEditorCtaProps) {
  return (
    <div
      className="rounded-2xl border p-5 sm:p-6"
      style={{
        borderColor: 'var(--border-primary)',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      <div className="max-w-3xl">
        <div className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
          {content.eyebrow}
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
          {content.title}
        </h2>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {content.featureBullets.map((feature, index) => (
            <span key={feature} className="inline-flex items-center gap-1 rounded-full px-3 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <span>{feature}</span>
              <Tooltip content={content.featureExplanations[index]} offset={6} maxWidth={340}>
                <button
                  type="button"
                  aria-label={`Explain ${feature}`}
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full leading-none"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </span>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
          >
            <Users className="h-4 w-4" />
            {content.buttonLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {content.supportingText}
          </span>
        </div>
      </div>
    </div>
  );
}
