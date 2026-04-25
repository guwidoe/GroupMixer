import { CircleHelp } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { AttributeDistributionField, getAttributeDistributionBuckets } from '../ui';
import { FixedAssignmentsInput } from './FixedAssignmentsInput';
import { buildGroups } from '../../utils/quickSetup';
import {
  deriveBalancedTargetValues,
  isBalanceAttributeAutoDistributed,
  setBalanceAttributeAutoDistributionEnabled,
  setBalanceAttributeTargets,
  setBalanceTargetValues,
} from '../../utils/quickSetup/attributeBalanceTargets';
import {
  formatFixedAssignmentGroupValue,
  normalizeFixedAssignmentRows,
  resolveFixedAssignmentGroupId,
} from '../../utils/quickSetup/fixedAssignments';
import { ResizableTextarea } from './ResizableTextarea';
import { ScenarioEditorCta } from './ScenarioEditorCta';
import { useLayoutAutoResizeSuppression } from './layoutAutoResizeSuppression';
import type { ToolController } from './useToolSetup';
import type { ToolPageOptimizerCtaContent } from '../../pages/toolPageTypes';

interface AdvancedOptionsProps {
  controller: ToolController;
  scenarioEditorCtaContent: ToolPageOptimizerCtaContent;
  onOpenScenarioEditor: () => void;
}

function SectionLabelWithTooltip({
  label,
  help,
  htmlFor,
}: {
  label: string;
  help: string;
  htmlFor?: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      <Tooltip content={help} offset={6} maxWidth={360}>
        <button
          type="button"
          aria-label="Show section help"
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full text-[0.7rem] font-medium leading-none"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}

export function AdvancedOptions({ controller, scenarioEditorCtaContent, onOpenScenarioEditor }: AdvancedOptionsProps) {
  const { draft, analysis } = controller;
  const labels = controller.ui.advancedOptions;
  const balanceGroups = buildGroups(analysis.participants.length, draft);
  const showBalanceSection = true;
  const showBalanceTargets = analysis.balanceAttributes.length > 0 && balanceGroups.length > 0;
  const fixedAssignments = normalizeFixedAssignmentRows(draft.fixedAssignments);
  const fixedAssignmentsForInput = fixedAssignments.map((assignment) => ({
    ...assignment,
    groupId: formatFixedAssignmentGroupValue(assignment.groupId, balanceGroups),
  }));
  const fixedPeopleNamePlaceholder = analysis.participants.length > 0
    ? analysis.participants.slice(0, 2).map((participant) => participant.name).join('\n')
    : 'Alex\nElla';
  const fixedPeopleGroupPlaceholder = balanceGroups.length > 0
    ? balanceGroups.slice(0, 2).map((_group, index) => String(index + 1)).join('\n')
    : '1\n2';
  const keepTogetherLayout = useLayoutAutoResizeSuppression('keep-together');
  const keepApartLayout = useLayoutAutoResizeSuppression('keep-apart');
  const pinnedPeopleLayout = useLayoutAutoResizeSuppression('pinned-people');

  return (
    <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
        <div>
          <SectionLabelWithTooltip
            htmlFor="keepTogetherInput"
            label={labels.keepTogetherLabel}
            help={labels.keepTogetherHelp}
          />
          <ResizableTextarea
            id="keepTogetherInput"
            value={draft.keepTogetherInput}
            onChange={(value) => controller.updateDraft((current) => ({ ...current, keepTogetherInput: value }))}
            placeholder={labels.keepTogetherPlaceholder}
            minHeight={96}
            horizontalScroll
            clipFieldBorder
            interactiveSurface
            className="rounded-2xl"
            textareaClassName="px-4 py-3 text-sm outline-none"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
            onManualLayoutAdjustment={keepTogetherLayout.recordManualLayoutAdjustment}
          />
        </div>

        <div>
          <SectionLabelWithTooltip
            htmlFor="avoidPairingsInput"
            label={labels.avoidPairingLabel}
            help={labels.avoidPairingHelp}
          />
          <ResizableTextarea
            id="avoidPairingsInput"
            value={draft.avoidPairingsInput}
            onChange={(value) => controller.updateDraft((current) => ({ ...current, avoidPairingsInput: value }))}
            placeholder={labels.avoidPairingPlaceholder}
            minHeight={96}
            horizontalScroll
            clipFieldBorder
            interactiveSurface
            className="rounded-2xl"
            textareaClassName="px-4 py-3 text-sm outline-none"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
            onManualLayoutAdjustment={keepApartLayout.recordManualLayoutAdjustment}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <SectionLabelWithTooltip
            label={labels.fixedPeopleLabel}
            help={labels.fixedPeopleHelp}
          />
          <FixedAssignmentsInput
            label={labels.fixedPeopleLabel}
            participantColumnLabel={labels.fixedPersonNameLabel}
            participantColumnPlaceholder={fixedPeopleNamePlaceholder}
            groupColumnLabel={labels.fixedPersonGroupLabel}
            groupColumnPlaceholder={fixedPeopleGroupPlaceholder}
            assignments={fixedAssignmentsForInput}
            onChange={(nextAssignments) => controller.updateDraft((current) => ({
              ...current,
              fixedAssignments: nextAssignments.map((assignment) => ({
                ...assignment,
                groupId: resolveFixedAssignmentGroupId(assignment.groupId, balanceGroups) ?? assignment.groupId,
              })),
            }))}
            minHeight={112}
            autoResizeSuppressed={pinnedPeopleLayout.autoResizeSuppressed}
            onManualLayoutAdjustment={pinnedPeopleLayout.recordManualLayoutAdjustment}
          />
        </div>

        {analysis.ignoredConstraintNames.length > 0 && (
          <div style={{ gridColumn: '1 / -1', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }} className="rounded-2xl px-4 py-3 text-sm">
            {labels.ignoredNamesPrefix} {analysis.ignoredConstraintNames.join(', ')}
          </div>
        )}

        {showBalanceSection && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="mb-3">
              <SectionLabelWithTooltip
                label={labels.balanceGroupsByAttributeLabel}
                help={labels.balanceGroupsByAttributeHelp}
              />
            </div>

            {showBalanceTargets ? (
              <div className="grid gap-4">
                {analysis.balanceAttributes.map((attribute) => (
                  <div
                    key={attribute.key}
                    className="landing-balance-attribute-card rounded-2xl px-4 py-4"
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
                    <div className="landing-balance-target-grid">
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

        <div
          className="border-t pt-4"
          style={{ gridColumn: '1 / -1', borderColor: 'var(--border-primary)' }}
        >
          <ScenarioEditorCta
            content={scenarioEditorCtaContent}
            onOpen={onOpenScenarioEditor}
          />
        </div>

    </div>
  );
}
