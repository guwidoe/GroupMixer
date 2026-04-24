import { ArrowRight, CheckCircle2, CircleHelp } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import type { ToolPageOptimizerCtaContent } from '../../pages/toolPageTypes';

interface ScenarioEditorCtaProps {
  content: ToolPageOptimizerCtaContent;
  onOpen: () => void;
}

export function ScenarioEditorCta({ content, onOpen }: ScenarioEditorCtaProps) {
  const supportingText = content.supportingText
    .replace(/^Use this when you need controls this page does not expose\.\s*/i, '')
    .trim();

  return (
    <div
      className="px-0 py-0"
    >
      <div className="max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-secondary)' }}>
          {content.eyebrow}
        </div>
        <ul className="m-0 mt-3 grid auto-rows-min list-none content-start items-start gap-x-5 gap-y-1.5 p-0 text-xs font-medium sm:grid-cols-2 sm:gap-y-2 xl:grid-cols-3" style={{ color: 'var(--text-secondary)' }}>
          {content.featureBullets.map((feature, index) => (
            <li key={feature} className="flex min-h-0 min-w-0 items-center gap-1.5 leading-tight">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: 'var(--color-accent)' }}
                aria-hidden="true"
              />
              <span className="min-w-0 truncate">{feature}</span>
              <Tooltip content={content.featureExplanations[index]} offset={6} maxWidth={340}>
                <button
                  type="button"
                  aria-label={`Explain ${feature}`}
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full leading-none"
                  style={{ color: 'var(--text-tertiary)', minHeight: '1rem' }}
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2" data-scenario-editor-cta-action="true">
          <button
            type="button"
            onClick={onOpen}
            className="landing-action-button inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-accent) 42%, var(--border-primary) 58%)',
              backgroundColor: 'color-mix(in srgb, var(--color-accent) 9%, var(--bg-primary) 91%)',
              color: 'var(--text-primary)',
            }}
          >
            <span>{content.title}</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>

          {supportingText ? (
            <div className="inline-flex min-w-[14rem] flex-1 items-start gap-1.5 text-xs leading-snug sm:items-center" style={{ color: 'var(--text-secondary)' }}>
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:mt-0" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
              <span className="max-w-[24rem]">{supportingText}</span>
            </div>
          ) : null}
        </div>

      </div>
    </div>
  );
}
