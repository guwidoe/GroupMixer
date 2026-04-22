import { ArrowRight } from 'lucide-react';
import { AttributeDistributionField, getAttributeDistributionBuckets } from '../ui';
import { buildGroups } from '../../utils/quickSetup';
import {
  deriveBalancedTargetValues,
  setBalanceAttributeTargets,
  setBalanceTargetValues,
} from '../../utils/quickSetup/attributeBalanceTargets';
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
  const showBalanceTargets = analysis.balanceAttributes.length > 0 && balanceGroups.length > 0;
  const showFixedAssignments = analysis.participants.length > 0 && balanceGroups.length > 0;
  const fixedAssignments = draft.fixedAssignments ?? [];
  const assignedFixedPeople = new Set(fixedAssignments.map((assignment) => assignment.personId));
  const addableFixedPeople = analysis.participants.filter((participant) => !assignedFixedPeople.has(participant.id));

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

        {showBalanceTargets && (
          <div className="sm:col-span-2 lg:col-span-1 2xl:col-span-2">
            <label className="mb-3 block text-sm font-medium">
              {labels.balanceGroupsByAttributeLabel}
            </label>
            <div className="grid gap-4">
              {analysis.balanceAttributes.map((attribute) => (
                <div
                  key={attribute.key}
                  className="rounded-2xl px-4 py-4"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{attribute.key}</div>
                    <button
                      type="button"
                      className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm"
                      style={{
                        borderColor: 'var(--border-primary)',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                      }}
                      aria-label={`${labels.autoDistributeAttributeLabel}: ${attribute.key}`}
                      onClick={() => controller.updateDraft((current) => ({
                        ...current,
                        balanceAttributeKey: null,
                        balanceTargets: setBalanceAttributeTargets(
                          current.balanceTargets,
                          attribute.key,
                          deriveBalancedTargetValues(analysis.participants, balanceGroups, attribute.key),
                        ),
                      }))}
                    >
                      {labels.autoDistributeAttributeLabel}
                    </button>
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
          </div>
        )}

        {showFixedAssignments && (
          <div className="sm:col-span-2 lg:col-span-1 2xl:col-span-2">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <label className="block text-sm font-medium">
                  {labels.fixedPeopleLabel}
                </label>
                <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                  {labels.fixedPeopleDescription}
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm"
                style={{
                  borderColor: 'var(--border-primary)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                }}
                onClick={() => {
                  const nextPerson = addableFixedPeople[0];
                  const nextGroup = balanceGroups[0];
                  if (!nextPerson || !nextGroup) {
                    return;
                  }

                  controller.updateDraft((current) => ({
                    ...current,
                    fixedAssignments: [
                      ...(current.fixedAssignments ?? []),
                      { personId: nextPerson.id, groupId: nextGroup.id },
                    ],
                  }));
                }}
                disabled={addableFixedPeople.length === 0}
              >
                {labels.addFixedPersonLabel}
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              {fixedAssignments.length > 0 ? (
                <>
                  <div
                    className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2.75rem] gap-3 px-4 py-3 text-[0.7rem] font-medium uppercase tracking-[0.08em]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <div>{labels.fixedPersonNameLabel}</div>
                    <div>{labels.fixedPersonGroupLabel}</div>
                    <div className="sr-only">{labels.removeFixedPersonLabel}</div>
                  </div>

                  {fixedAssignments.map((assignment, index) => {
                    const selectablePeople = analysis.participants.filter((participant) => (
                      participant.id === assignment.personId || !fixedAssignments.some((candidate, candidateIndex) => (
                        candidateIndex !== index && candidate.personId === participant.id
                      ))
                    ));

                    return (
                      <div
                        key={`${assignment.personId}-${assignment.groupId}-${index}`}
                        className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2.75rem] items-center gap-3 border-t px-4 py-3"
                        style={{ borderColor: 'var(--border-primary)' }}
                      >
                        <select
                          aria-label={`${labels.fixedPersonNameLabel} ${index + 1}`}
                          className="h-11 min-w-0 rounded-xl border px-3 text-sm font-medium outline-none"
                          style={{
                            borderColor: 'var(--border-primary)',
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                          }}
                          value={selectablePeople.some((participant) => participant.id === assignment.personId) ? assignment.personId : ''}
                          onChange={(event) => controller.updateDraft((current) => ({
                            ...current,
                            fixedAssignments: (current.fixedAssignments ?? []).map((candidate, candidateIndex) => (
                              candidateIndex === index
                                ? { ...candidate, personId: event.target.value }
                                : candidate
                            )),
                          }))}
                        >
                          <option value="">{labels.fixedPersonSelectPlaceholder}</option>
                          {selectablePeople.map((participant) => (
                            <option key={participant.id} value={participant.id}>{participant.name}</option>
                          ))}
                        </select>

                        <select
                          aria-label={`${labels.fixedPersonGroupLabel} ${index + 1}`}
                          className="h-11 min-w-0 rounded-xl border px-3 text-sm font-medium outline-none"
                          style={{
                            borderColor: 'var(--border-primary)',
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                          }}
                          value={balanceGroups.some((group) => group.id === assignment.groupId) ? assignment.groupId : ''}
                          onChange={(event) => controller.updateDraft((current) => ({
                            ...current,
                            fixedAssignments: (current.fixedAssignments ?? []).map((candidate, candidateIndex) => (
                              candidateIndex === index
                                ? { ...candidate, groupId: event.target.value }
                                : candidate
                            )),
                          }))}
                        >
                          <option value="">{labels.fixedGroupSelectPlaceholder}</option>
                          {balanceGroups.map((group) => (
                            <option key={group.id} value={group.id}>{group.id}</option>
                          ))}
                        </select>

                        <button
                          type="button"
                          className="inline-flex h-10 w-10 items-center justify-center self-center rounded-xl border text-lg leading-none font-medium transition-colors"
                          style={{
                            borderColor: 'var(--border-primary)',
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                          }}
                          aria-label={`${labels.removeFixedPersonLabel}: ${assignment.personId || index + 1}`}
                          onClick={() => controller.updateDraft((current) => ({
                            ...current,
                            fixedAssignments: (current.fixedAssignments ?? []).filter((_, candidateIndex) => candidateIndex !== index),
                          }))}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="px-4 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {labels.fixedPeopleDescription}
                </div>
              )}
            </div>
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
