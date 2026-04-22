import { ArrowRight } from 'lucide-react';
import { AttributeDistributionField, getAttributeDistributionBuckets } from '../ui';
import { LandingFixedAssignmentsInput } from './LandingFixedAssignmentsInput';
import { buildGroups } from '../../utils/quickSetup';
import {
  deriveBalancedTargetValues,
  isBalanceAttributeAutoDistributed,
  setBalanceAttributeAutoDistributionEnabled,
  setBalanceAttributeTargets,
  setBalanceTargetValues,
} from '../../utils/quickSetup/attributeBalanceTargets';
import { normalizeFixedAssignmentRows } from '../../utils/quickSetup/fixedAssignments';
import { LandingResizableTextarea } from './LandingResizableTextarea';
import type { QuickSetupController } from './useQuickSetup';

interface QuickSetupAdvancedOptionsProps {
  controller: QuickSetupController;
  onOpenFullEditor?: () => void;
}

export function QuickSetupAdvancedOptions({ controller, onOpenFullEditor }: QuickSetupAdvancedOptionsProps) {
  const { draft, analysis } = controller;
  const labels = controller.ui.advancedOptions;
  const balanceGroups = buildGroups(analysis.participants.length, draft);
  const showBalanceSection = true;
  const showBalanceTargets = analysis.balanceAttributes.length > 0 && balanceGroups.length > 0;
  const fixedAssignments = normalizeFixedAssignmentRows(draft.fixedAssignments);
  const fixedPeopleNamePlaceholder = analysis.participants.length > 0
    ? analysis.participants.slice(0, 2).map((participant) => participant.name).join('\n')
    : 'Alex\nSam';
  const fixedPeopleGroupPlaceholder = balanceGroups.length > 0
    ? balanceGroups.slice(0, 2).map((group) => group.id).join('\n')
    : 'Group 1\nGroup 2';

  return (
    <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
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
            clipFieldBorder
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
            clipFieldBorder
            className="rounded-2xl"
            textareaClassName="px-4 py-3 text-sm outline-none"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label className="mb-2 block text-sm font-medium">
            {labels.fixedPeopleLabel}
          </label>
          <LandingFixedAssignmentsInput
            label={labels.fixedPeopleLabel}
            participantColumnLabel={labels.fixedPersonNameLabel}
            participantColumnPlaceholder={fixedPeopleNamePlaceholder}
            groupColumnLabel={labels.fixedPersonGroupLabel}
            groupColumnPlaceholder={fixedPeopleGroupPlaceholder}
            assignments={fixedAssignments}
            onChange={(nextAssignments) => controller.updateDraft((current) => ({
              ...current,
              fixedAssignments: nextAssignments,
            }))}
            minHeight={112}
          />
        </div>

        {analysis.ignoredConstraintNames.length > 0 && (
          <div style={{ gridColumn: '1 / -1', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }} className="rounded-2xl px-4 py-3 text-sm">
            {labels.ignoredNamesPrefix} {analysis.ignoredConstraintNames.join(', ')}
          </div>
        )}

        {showBalanceSection && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="mb-3 block text-sm font-medium">
              {labels.balanceGroupsByAttributeLabel}
            </label>

            {showBalanceTargets ? (
              <div className="grid gap-4">
                {analysis.balanceAttributes.map((attribute) => (
                  <div
                    key={attribute.key}
                    className="rounded-2xl px-4 py-4"
                    style={{ backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{attribute.key}</div>
                      <label className="flex items-center gap-2 text-xs font-medium sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          aria-label={`${labels.autoDistributeAttributeLabel}: ${attribute.key}`}
                          checked={isBalanceAttributeAutoDistributed(draft.manualBalanceAttributeKeys, attribute.key)}
                          onChange={(event) => controller.updateDraft((current) => ({
                            ...current,
                            balanceAttributeKey: null,
                            manualBalanceAttributeKeys: setBalanceAttributeAutoDistributionEnabled(
                              current.manualBalanceAttributeKeys,
                              attribute.key,
                              event.target.checked,
                            ),
                            balanceTargets: event.target.checked
                              ? setBalanceAttributeTargets(
                                current.balanceTargets,
                                attribute.key,
                                deriveBalancedTargetValues(analysis.participants, balanceGroups, attribute.key),
                              )
                              : current.balanceTargets,
                          }))}
                        />
                        <span>{labels.autoDistributeAttributeLabel}</span>
                      </label>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                      {balanceGroups.map((group) => (
                        <div key={`${attribute.key}-${group.id}`}>
                          <div className="mb-2 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>
                            {group.id}
                          </div>
                          <AttributeDistributionField
                            buckets={getAttributeDistributionBuckets(attribute.values)}
                            value={draft.balanceTargets?.[attribute.key]?.[group.id]}
                            capacity={group.size}
                            onChange={(nextValue) => controller.updateDraft((current) => ({
                              ...current,
                              balanceAttributeKey: null,
                              manualBalanceAttributeKeys: setBalanceAttributeAutoDistributionEnabled(
                                current.manualBalanceAttributeKeys,
                                attribute.key,
                                false,
                              ),
                              balanceTargets: setBalanceTargetValues(current.balanceTargets, attribute.key, group.id, nextValue),
                            }))}
                            showSummary={false}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl px-4 py-4 text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                {labels.balanceGroupsEmptyState}
              </div>
            )}
          </div>
        )}

        {onOpenFullEditor && (
          <div
            className="rounded-2xl border px-4 py-4"
            style={{ gridColumn: '1 / -1', borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
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
