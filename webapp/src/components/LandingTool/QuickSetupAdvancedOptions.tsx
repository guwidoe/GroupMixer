import { ArrowRight } from 'lucide-react';
import { NumberField, NUMBER_FIELD_PRESETS } from '../ui';
import { LandingResizableTextarea } from './LandingResizableTextarea';
import type { QuickSetupController } from './useQuickSetup';

interface QuickSetupAdvancedOptionsProps {
  controller: QuickSetupController;
  onOpenFullEditor?: () => void;
}

export function QuickSetupAdvancedOptions({ controller, onOpenFullEditor }: QuickSetupAdvancedOptionsProps) {
  const { draft, analysis } = controller;
  const labels = controller.ui.advancedOptions;
  const showBalanceSelector = draft.inputMode === 'csv' && analysis.availableBalanceKeys.length > 0;

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
        <div>
          <label htmlFor="keepTogetherInput" className="mb-2 block text-sm font-medium">
            {labels.keepTogetherLabel}
          </label>
          <LandingResizableTextarea
            id="keepTogetherInput"
            value={draft.keepTogetherInput}
            onChange={(value) => controller.updateDraft((current) => ({ ...current, keepTogetherInput: value }))}
            placeholder={labels.keepTogetherPlaceholder}
            minHeight={96}
            className="rounded-2xl"
            textareaClassName="px-4 py-3 text-sm outline-none"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
          />
        </div>

        <div>
          <label htmlFor="avoidPairingsInput" className="mb-2 block text-sm font-medium">
            {labels.avoidPairingLabel}
          </label>
          <LandingResizableTextarea
            id="avoidPairingsInput"
            value={draft.avoidPairingsInput}
            onChange={(value) => controller.updateDraft((current) => ({ ...current, avoidPairingsInput: value }))}
            placeholder={labels.avoidPairingPlaceholder}
            minHeight={96}
            className="rounded-2xl"
            textareaClassName="px-4 py-3 text-sm outline-none"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
          />
        </div>

        <div className={showBalanceSelector ? '' : 'sm:col-span-2 lg:col-span-1 2xl:col-span-2'}>
          <NumberField
            label={labels.sessionsLabel}
            value={draft.sessions}
            onChange={(value) => controller.updateDraft((current) => ({ ...current, sessions: Math.max(1, value ?? 1) }))}
            {...NUMBER_FIELD_PRESETS.sessionCount}
          />
        </div>

        {showBalanceSelector && (
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
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
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
          <div className="rounded-2xl px-4 py-3 text-sm sm:col-span-2 lg:col-span-1 2xl:col-span-2" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
            {labels.ignoredNamesPrefix} {analysis.ignoredConstraintNames.join(', ')}
          </div>
        )}

        {onOpenFullEditor && (
          <div
            className="rounded-2xl border px-4 py-4 sm:col-span-2 lg:col-span-1 2xl:col-span-2"
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
    </div>
  );
}
