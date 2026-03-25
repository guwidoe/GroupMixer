import { RotateCcw, Sparkles } from 'lucide-react';
import type { QuickSetupController } from './useQuickSetup';

interface QuickSetupBasicFormProps {
  controller: QuickSetupController;
}

export function QuickSetupBasicForm({ controller }: QuickSetupBasicFormProps) {
  const { draft, participantCount, estimatedGroupCount, estimatedGroupSize } = controller;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {[
          { value: 'random', label: 'Random' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'networking', label: 'Networking' },
        ].map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => controller.setPreset(preset.value as typeof draft.preset)}
            className="rounded-full border px-3 py-1.5 text-sm font-medium"
            style={{
              borderColor: draft.preset === preset.value ? 'var(--color-accent)' : 'var(--border-primary)',
              backgroundColor: draft.preset === preset.value ? 'var(--bg-tertiary)' : 'transparent',
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="participantInput" className="text-sm font-medium">
            Participants
          </label>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <button type="button" onClick={controller.loadSampleData} className="font-medium">
              Load sample
            </button>
            <span>•</span>
            <button type="button" onClick={controller.resetDraft} className="font-medium">
              Reset
            </button>
          </div>
        </div>

        <div className="mb-3 flex gap-2">
          {[
            { value: 'names', label: 'Names' },
            { value: 'csv', label: 'CSV' },
          ].map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => controller.updateDraft((current) => ({ ...current, inputMode: mode.value as typeof current.inputMode, balanceAttributeKey: null }))}
              className="rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em]"
              style={{
                borderColor: draft.inputMode === mode.value ? 'var(--color-accent)' : 'var(--border-primary)',
                backgroundColor: draft.inputMode === mode.value ? 'var(--bg-tertiary)' : 'transparent',
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <textarea
          id="participantInput"
          value={draft.participantInput}
          onChange={(event) => controller.updateDraft((current) => ({ ...current, participantInput: event.target.value }))}
          placeholder={draft.inputMode === 'csv' ? 'name,team,role\nAlex,Blue,Engineer' : 'One name per line'}
          className="min-h-[180px] w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-shadow focus:ring-2"
          style={{
            borderColor: 'var(--border-primary)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">How should the groups be sized?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { value: 'groupCount', label: 'Choose number of groups' },
            { value: 'groupSize', label: 'Choose people per group' },
          ].map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3"
              style={{
                borderColor: draft.groupingMode === option.value ? 'var(--color-accent)' : 'var(--border-primary)',
                backgroundColor: 'var(--bg-secondary)',
              }}
            >
              <input
                type="radio"
                name="groupingMode"
                value={option.value}
                checked={draft.groupingMode === option.value}
                onChange={() => controller.updateDraft((current) => ({ ...current, groupingMode: option.value as typeof current.groupingMode }))}
              />
              <span className="text-sm font-medium">{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="groupingValue" className="mb-2 block text-sm font-medium">
          {draft.groupingMode === 'groupCount' ? 'Number of groups' : 'People per group'}
        </label>
        <input
          id="groupingValue"
          type="number"
          min={1}
          value={draft.groupingValue}
          onChange={(event) => controller.updateDraft((current) => ({ ...current, groupingValue: Math.max(1, Number(event.target.value) || 1) }))}
          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-shadow focus:ring-2"
          style={{
            borderColor: 'var(--border-primary)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-3xl border p-4 text-sm" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
        <div>
          <div style={{ color: 'var(--text-secondary)' }}>People</div>
          <div className="mt-1 text-2xl font-semibold">{participantCount}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-secondary)' }}>Groups</div>
          <div className="mt-1 text-2xl font-semibold">{estimatedGroupCount}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-secondary)' }}>Approx size</div>
          <div className="mt-1 text-2xl font-semibold">{estimatedGroupSize}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={controller.generateGroups}
          disabled={!controller.canGenerate}
          className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          <Sparkles className="h-4 w-4" />
          Generate groups
        </button>
        <button
          type="button"
          onClick={controller.reshuffle}
          disabled={!controller.result}
          className="inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <RotateCcw className="h-4 w-4" />
          Reshuffle
        </button>
      </div>
    </div>
  );
}
