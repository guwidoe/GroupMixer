import type { QuickSetupController } from './useQuickSetup';

interface QuickSetupAdvancedOptionsProps {
  controller: QuickSetupController;
}

export function QuickSetupAdvancedOptions({ controller }: QuickSetupAdvancedOptionsProps) {
  const { draft, analysis } = controller;

  return (
    <section className="rounded-3xl border p-5" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
      <button
        type="button"
        onClick={controller.toggleAdvanced}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div>
          <div className="text-sm font-semibold">Advanced options</div>
          <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            Keep together, avoid pairing, multiple sessions, and optional balancing controls.
          </p>
        </div>
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {draft.advancedOpen ? 'Hide' : 'Show'}
        </span>
      </button>

      {draft.advancedOpen && (
        <div className="mt-5 space-y-5 border-t pt-5" style={{ borderColor: 'var(--border-primary)' }}>
          <div>
            <label htmlFor="sessions" className="mb-2 block text-sm font-medium">
              Sessions
            </label>
            <input
              id="sessions"
              type="number"
              min={1}
              value={draft.sessions}
              onChange={(event) => controller.updateDraft((current) => ({ ...current, sessions: Math.max(1, Number(event.target.value) || 1) }))}
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            />
          </div>

          <label className="flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
            <input
              type="checkbox"
              checked={draft.avoidRepeatPairings}
              onChange={(event) => controller.updateDraft((current) => ({ ...current, avoidRepeatPairings: event.target.checked }))}
            />
            <div>
              <div className="text-sm font-medium">Avoid repeat pairings</div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Spread people across sessions so the same pairs are less likely to repeat.
              </div>
            </div>
          </label>

          <div>
            <label htmlFor="keepTogetherInput" className="mb-2 block text-sm font-medium">
              Keep together
            </label>
            <textarea
              id="keepTogetherInput"
              value={draft.keepTogetherInput}
              onChange={(event) => controller.updateDraft((current) => ({ ...current, keepTogetherInput: event.target.value }))}
              placeholder={'One group per line\nAlex, Sam\nPriya, Jordan, Mina'}
              className="min-h-[96px] w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            />
          </div>

          <div>
            <label htmlFor="avoidPairingsInput" className="mb-2 block text-sm font-medium">
              Avoid pairing
            </label>
            <textarea
              id="avoidPairingsInput"
              value={draft.avoidPairingsInput}
              onChange={(event) => controller.updateDraft((current) => ({ ...current, avoidPairingsInput: event.target.value }))}
              placeholder={'One pair per line\nAlex - Sam\nPriya - Jordan'}
              className="min-h-[96px] w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            />
          </div>

          {draft.inputMode === 'csv' && analysis.availableBalanceKeys.length > 0 && (
            <div>
              <label htmlFor="balanceAttributeKey" className="mb-2 block text-sm font-medium">
                Balance groups by attribute
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
                <option value="">No balancing</option>
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
              Ignored names not found in the participant list: {analysis.ignoredConstraintNames.join(', ')}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
