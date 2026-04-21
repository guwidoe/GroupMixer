import { ArrowRight } from 'lucide-react';
import { NumberField, NUMBER_FIELD_PRESETS } from '../ui';
import type { QuickSetupController } from './useQuickSetup';

interface QuickSetupAdvancedOptionsProps {
  controller: QuickSetupController;
  onOpenFullEditor?: () => void;
}

export function QuickSetupAdvancedOptions({ controller, onOpenFullEditor }: QuickSetupAdvancedOptionsProps) {
  const { draft, analysis } = controller;
  const labels = controller.ui.advancedOptions;

  return (
    <section className="rounded-3xl border p-5" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
      <button
        type="button"
        onClick={() => {
          controller.toggleAdvanced();
        }}
        className="landing-action-button flex w-full items-center justify-between gap-4 rounded-2xl px-3 py-2 text-left"
      >
        <div>
          <div className="text-sm font-semibold">{labels.title}</div>
          <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            {labels.description}
          </p>
        </div>
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {draft.advancedOpen ? labels.hideLabel : labels.showLabel}
        </span>
      </button>

      {draft.advancedOpen && (
        <div className="mt-5 space-y-5 border-t pt-5" style={{ borderColor: 'var(--border-primary)' }}>
          <div>
            <NumberField
              label={labels.sessionsLabel}
              value={draft.sessions}
              onChange={(value) => controller.updateDraft((current) => ({ ...current, sessions: Math.max(1, value ?? 1) }))}
              {...NUMBER_FIELD_PRESETS.sessionCount}
              className="rounded-2xl border px-4 py-3"
            />
          </div>

          <div>
            <label htmlFor="keepTogetherInput" className="mb-2 block text-sm font-medium">
              {labels.keepTogetherLabel}
            </label>
            <textarea
              id="keepTogetherInput"
              value={draft.keepTogetherInput}
              onChange={(event) => controller.updateDraft((current) => ({ ...current, keepTogetherInput: event.target.value }))}
              placeholder={labels.keepTogetherPlaceholder}
              className="min-h-[96px] w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            />
          </div>

          <div>
            <label htmlFor="avoidPairingsInput" className="mb-2 block text-sm font-medium">
              {labels.avoidPairingLabel}
            </label>
            <textarea
              id="avoidPairingsInput"
              value={draft.avoidPairingsInput}
              onChange={(event) => controller.updateDraft((current) => ({ ...current, avoidPairingsInput: event.target.value }))}
              placeholder={labels.avoidPairingPlaceholder}
              className="min-h-[96px] w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            />
          </div>

          {onOpenFullEditor && (
            <div
              className="rounded-2xl border px-4 py-4"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            >
              <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                {labels.fullEditorPrompt}
              </p>
              <button
                type="button"
                onClick={onOpenFullEditor}
                className="landing-action-button mt-3 inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                {labels.fullEditorButtonLabel}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {draft.inputMode === 'csv' && analysis.availableBalanceKeys.length > 0 && (
            <div>
              <label htmlFor="balanceAttributeKey" className="mb-2 block text-sm font-medium">
                {labels.balanceGroupsByAttributeLabel}
              </label>
              <select
                id="balanceAttributeKey"
                value={draft.balanceAttributeKey ?? ''}
                onChange={(event) => controller.updateDraft((current) => ({
                  ...current,
                  balanceAttributeKey: event.target.value || null,
                }))}
                className="w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2"
                style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
              >
                <option value="">{labels.noBalancingLabel}</option>
                {analysis.availableBalanceKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
          )}

          {analysis.ignoredConstraintNames.length > 0 && (
            <div className="rounded-2xl px-4 py-3 text-sm" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
              {labels.ignoredNamesPrefix} {analysis.ignoredConstraintNames.join(', ')}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
