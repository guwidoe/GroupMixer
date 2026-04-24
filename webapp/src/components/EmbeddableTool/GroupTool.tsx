import { ArrowRight, CircleHelp, Copy, Download, RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { DemoDataDropdown } from '../ScenarioEditor/DemoDataDropdown';
import { Tooltip } from '../Tooltip';
import { NumberField, NUMBER_FIELD_PRESETS, withContextualMax } from '../ui';
import { ResultsScheduleGrid } from '../ResultsView/ResultsScheduleGrid';
import { interpolate } from '../../i18n/interpolate';
import type { GuidePageKey } from '../../pages/guidePageTypes';
import type { ToolPageConfig } from '../../pages/toolPageConfigs';
import type { ToolPageSharedUiContent } from '../../pages/toolPageTypes';
import type { ResultsSessionData } from '../../services/results/buildResultsModel';
import { loadLandingGuideExampleCasesWithMetrics } from '../../utils/quickSetup/landingGuideExamples';
import { nextAttributeColumnId, normalizeParticipantColumns, withParticipantColumns } from '../../utils/quickSetup/participantColumns';
import { ParticipantColumnsInput } from './ParticipantColumnsInput';
import { ResizableTextarea } from './ResizableTextarea';
import { AdvancedOptions } from './AdvancedOptions';
import type { QuickSetupParticipantColumn } from './types';
import type { ToolController } from './useToolSetup';

export type ToolResultFormat = 'cards' | 'list' | 'text' | 'lines' | 'csv';

const STICKY_GENERATE_MOBILE_QUERY = '(max-width: 767px)';

interface ToolDisplaySession {
  sessionNumber: number;
  groups: Array<{
    id: string;
    members: string[];
  }>;
}

interface GroupToolProps {
  config: ToolPageConfig;
  ui: ToolPageSharedUiContent;
  controller: ToolController;
  participantColumns: QuickSetupParticipantColumn[];
  participantCount: number;
  estimatedGroupCount: number;
  estimatedGroupSize: number;
  displayedGroupCount: number;
  displayedPeoplePerGroup: number;
  participantInputAutoOuterHeight: number | null;
  participantInputAutoResizeSuppressed: boolean;
  autoFocusParticipantInput?: boolean;
  canResizeToolColumns: boolean;
  toolColumnsStyle?: CSSProperties;
  isDraggingToolDivider: boolean;
  activeResultFormat: ToolResultFormat;
  activeCopiedFormat: ToolResultFormat | null;
  sharedSessionData: ResultsSessionData[];
  displaySessions: ToolDisplaySession[];
  resultText: string;
  resultLineText: string;
  resultCsv: string;
  resultsRef: RefObject<HTMLDivElement | null>;
  toolColumnsRef: RefObject<HTMLDivElement | null>;
  participantsPaneRef: RefObject<HTMLDivElement | null>;
  advancedOptionsPaneRef: RefObject<HTMLDivElement | null>;
  participantInputSlotRef: (node: HTMLDivElement | null) => void;
  onClearAllInputs: () => void;
  onParticipantInputManualLayoutAdjustment: () => void;
  onLandingExampleClick: (exampleKey: GuidePageKey) => void;
  onOpenAdvancedWorkspace: (target: 'results' | 'people') => void;
  onStartToolDividerDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onGenerateGroups: () => void;
  onChangeResultFormat: (format: ToolResultFormat) => void;
  onCopyActiveResult: () => void | Promise<void>;
}

function SectionLabelWithTooltip({
  label,
  help,
  htmlFor,
  action,
  className,
}: {
  label: string;
  help: string;
  htmlFor?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? (action ? 'relative mb-2 pr-28 sm:pr-32' : 'mb-2')}>
      <div className="flex min-w-0 items-center gap-1.5">
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
      {action ? (
        <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function GroupTool({
  config,
  ui,
  controller,
  participantColumns,
  participantCount,
  estimatedGroupCount,
  estimatedGroupSize,
  displayedGroupCount,
  displayedPeoplePerGroup,
  participantInputAutoOuterHeight,
  participantInputAutoResizeSuppressed,
  autoFocusParticipantInput = true,
  canResizeToolColumns,
  toolColumnsStyle,
  isDraggingToolDivider,
  activeResultFormat,
  activeCopiedFormat,
  sharedSessionData,
  displaySessions,
  resultText,
  resultLineText,
  resultCsv,
  resultsRef,
  toolColumnsRef,
  participantsPaneRef,
  advancedOptionsPaneRef,
  participantInputSlotRef,
  onClearAllInputs,
  onParticipantInputManualLayoutAdjustment,
  onLandingExampleClick,
  onOpenAdvancedWorkspace,
  onStartToolDividerDrag,
  onGenerateGroups,
  onChangeResultFormat,
  onCopyActiveResult,
}: GroupToolProps) {
  const { draft } = controller;
  const solvedSolution = controller.workspacePayload.solution ?? null;
  const generateButtonRef = useRef<HTMLButtonElement | null>(null);
  const stickyGenerateButtonRef = useRef<HTMLButtonElement | null>(null);
  const stickyGenerateAnimationTimeoutRef = useRef<number | null>(null);
  const [showStickyGenerateButton, setShowStickyGenerateButton] = useState(false);
  const [renderStickyGenerateButton, setRenderStickyGenerateButton] = useState(false);
  const [stickyGenerateButtonStyle, setStickyGenerateButtonStyle] = useState<CSSProperties>({});
  const [showStickyGenerateMeta, setShowStickyGenerateMeta] = useState(false);

  useEffect(() => {
    const button = generateButtonRef.current;

    if (!button || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mobileViewportQuery = window.matchMedia(STICKY_GENERATE_MOBILE_QUERY);
    let frameId: number | null = null;

    const updateVisibility = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const rect = button.getBoundingClientRect();
        const advancedOptionsBottom = advancedOptionsPaneRef.current?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY;
        setShowStickyGenerateButton(
          mobileViewportQuery.matches
          && rect.bottom < 0
          && advancedOptionsBottom > 0,
        );
      });
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);
    mobileViewportQuery.addEventListener?.('change', updateVisibility);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
      mobileViewportQuery.removeEventListener?.('change', updateVisibility);
    };
  }, [advancedOptionsPaneRef]);

  useEffect(() => {
    return () => {
      if (stickyGenerateAnimationTimeoutRef.current !== null) {
        window.clearTimeout(stickyGenerateAnimationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (stickyGenerateAnimationTimeoutRef.current !== null) {
      window.clearTimeout(stickyGenerateAnimationTimeoutRef.current);
      stickyGenerateAnimationTimeoutRef.current = null;
    }

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    if (showStickyGenerateButton) {
      const sourceRect = generateButtonRef.current?.getBoundingClientRect() ?? null;
      setRenderStickyGenerateButton(true);
      setShowStickyGenerateMeta(false);
      setStickyGenerateButtonStyle({});

      const firstFrame = window.requestAnimationFrame(() => {
        const targetRect = stickyGenerateButtonRef.current?.getBoundingClientRect() ?? null;

        if (!sourceRect || !targetRect || prefersReducedMotion) {
          setShowStickyGenerateMeta(true);
          return;
        }

        setStickyGenerateButtonStyle({
          opacity: 0.92,
          transform: `translate(${sourceRect.left - targetRect.left}px, ${sourceRect.top - targetRect.top}px) scale(${sourceRect.width / targetRect.width}, ${sourceRect.height / targetRect.height})`,
          transformOrigin: 'top left',
        });

        window.requestAnimationFrame(() => {
          setStickyGenerateButtonStyle({
            opacity: 1,
            transform: 'translate(0, 0) scale(1)',
            transformOrigin: 'top left',
            transition: 'transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 240ms ease',
          });
          setShowStickyGenerateMeta(true);
        });
      });

      return () => window.cancelAnimationFrame(firstFrame);
    }

    if (!renderStickyGenerateButton) {
      return;
    }

    setShowStickyGenerateMeta(false);

    const stickyRect = stickyGenerateButtonRef.current?.getBoundingClientRect() ?? null;
    const targetRect = generateButtonRef.current?.getBoundingClientRect() ?? null;
    const canMorphBack = Boolean(
      stickyRect
      && targetRect
      && targetRect.bottom > -80
      && targetRect.top < window.innerHeight + 80,
    );

    if (stickyRect && targetRect && canMorphBack && !prefersReducedMotion) {
      setStickyGenerateButtonStyle({
        opacity: 0.92,
        transform: `translate(${targetRect.left - stickyRect.left}px, ${targetRect.top - stickyRect.top}px) scale(${targetRect.width / stickyRect.width}, ${targetRect.height / stickyRect.height})`,
        transformOrigin: 'top left',
        transition: 'transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 240ms ease',
      });
    } else {
      setStickyGenerateButtonStyle({
        opacity: 0,
        transform: 'translate(0, 14px) scale(0.98)',
        transformOrigin: 'bottom right',
        transition: 'transform 280ms ease, opacity 220ms ease',
      });
    }

    stickyGenerateAnimationTimeoutRef.current = window.setTimeout(() => {
      stickyGenerateAnimationTimeoutRef.current = null;
      setRenderStickyGenerateButton(false);
      setStickyGenerateButtonStyle({});
    }, 400);
  }, [renderStickyGenerateButton, showStickyGenerateButton]);

  const resultsSection = controller.result ? (
    <div
      ref={resultsRef}
      data-testid="landing-results-panel"
      className="order-4 border-t pt-8"
      style={{ borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{ui.results.yourGroupsHeading}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={controller.exportGroupsCsv}
            className="landing-action-button inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <Download className="h-3.5 w-3.5" />
            {ui.results.exportCsvLabel}
          </button>
          <button
            type="button"
            onClick={() => onOpenAdvancedWorkspace('results')}
            className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold"
          >
            {ui.results.openInExpertWorkspaceLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {controller.errorMessage && (
        <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
          {controller.errorMessage}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={ui.results.resultFormatsAriaLabel}>
          {(['cards', 'list', 'text', 'lines', 'csv'] as ToolResultFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              role="tab"
              aria-selected={activeResultFormat === format}
              onClick={() => onChangeResultFormat(format)}
              className="landing-chip-button rounded-full border px-3 py-1.5 text-sm font-medium capitalize"
              style={{
                borderColor: activeResultFormat === format ? 'var(--color-accent)' : 'var(--border-primary)',
                backgroundColor: activeResultFormat === format ? 'var(--bg-secondary)' : 'transparent',
              }}
            >
              {
                format === 'cards'
                  ? ui.results.cardsFormatLabel
                  : format === 'list'
                    ? ui.results.listFormatLabel
                    : format === 'text'
                      ? ui.results.textFormatLabel
                      : format === 'lines'
                        ? ui.results.linesFormatLabel
                        : ui.results.csvFormatLabel
              }
            </button>
          ))}
        </div>

        {(activeResultFormat === 'text' || activeResultFormat === 'lines' || activeResultFormat === 'csv') && (
          <button
            type="button"
            onClick={onCopyActiveResult}
            className="landing-action-button inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <Copy className="h-3.5 w-3.5" />
            {activeCopiedFormat === activeResultFormat
              ? ui.results.copiedLabel
              : activeResultFormat === 'csv'
                ? ui.results.copyCsvLabel
                : ui.results.copyTextLabel}
          </button>
        )}
      </div>

      {activeResultFormat === 'cards' && (
        solvedSolution ? (
          <ResultsScheduleGrid
            sessionData={sharedSessionData}
            labels={{
              sessionHeadingTemplate: ui.results.sessionHeadingTemplate,
              peopleAssignedTemplate: ui.results.peopleAssignedTemplate,
              groupPeopleCountTemplate: ui.results.groupPeopleCountTemplate,
              noAssignmentsLabel: ui.results.noAssignmentsLabel,
            }}
          />
        ) : (
          controller.result.sessions.map((session) => (
            <div key={session.sessionNumber} className="mb-6">
              <h3 className="mb-3 text-base font-semibold">
                {interpolate(ui.results.sessionHeadingTemplate, { number: session.sessionNumber })}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {session.groups.map((group) => (
                  <div
                    key={`${session.sessionNumber}-${group.id}`}
                    className="rounded-xl border p-4"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold">{group.id}</span>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {interpolate(ui.results.groupPeopleCountTemplate, {
                          count: group.members.length,
                          size: group.members.length,
                        })}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {group.members.map((member) => (
                        <li
                          key={member.id}
                          className="rounded-lg px-2.5 py-1.5 text-sm"
                          style={{ backgroundColor: 'var(--bg-secondary)' }}
                        >
                          {member.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))
        )
      )}

      {activeResultFormat === 'list' && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-5">
          {displaySessions.map((session) => (
            <div key={session.sessionNumber} className="rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
              <h3 className="text-base font-semibold">
                {interpolate(ui.results.sessionHeadingTemplate, { number: session.sessionNumber })}
              </h3>
              <div className="mt-3 space-y-3">
                {session.groups.map((group) => (
                  <div key={`${session.sessionNumber}-${group.id}`}>
                    <div className="text-sm font-semibold">{group.id}</div>
                    <div className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                      {group.members.join(', ') || ui.results.noAssignmentsLabel}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeResultFormat === 'text' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {ui.results.plainTextDescription}
          </p>
          <ResizableTextarea
            ariaLabel={ui.results.textResultsAriaLabel}
            readOnly
            value={resultText}
            minHeight={260}
            className="rounded-xl"
            textareaClassName="px-4 py-3 text-sm outline-none"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
        </div>
      )}

      {activeResultFormat === 'lines' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {ui.results.lineTextDescription}
          </p>
          <ResizableTextarea
            ariaLabel={ui.results.lineTextResultsAriaLabel}
            readOnly
            value={resultLineText}
            minHeight={300}
            className="rounded-xl"
            textareaClassName="px-4 py-3 text-sm outline-none"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
        </div>
      )}

      {activeResultFormat === 'csv' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {ui.results.csvDescription}
          </p>
          <ResizableTextarea
            ariaLabel={ui.results.csvResultsAriaLabel}
            readOnly
            value={resultCsv}
            minHeight={260}
            className="rounded-xl"
            textareaClassName="px-4 py-3 font-mono text-sm outline-none"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <div
        data-testid="landing-tool-panel"
        className="order-2"
      >
        <div
          ref={toolColumnsRef}
          className={[
            'grid gap-5 lg:gap-5',
            canResizeToolColumns ? null : 'lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.92fr)]',
          ].filter(Boolean).join(' ')}
          style={toolColumnsStyle}
        >
          <div ref={participantsPaneRef} className="landing-participants-pane min-w-0">
            <SectionLabelWithTooltip
              label={ui.quickSetup.participantsLabel}
              help={ui.quickSetup.participantsHelp}
              action={(
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onClearAllInputs}
                    className="ui-button ui-button--ghost ui-button--sm min-h-0 px-2.5 py-1 text-xs leading-none shadow-none"
                  >
                    {ui.quickSetup.clearAllLabel}
                  </button>
                  <DemoDataDropdown
                    onDemoCaseClick={(exampleKey) => onLandingExampleClick(exampleKey as GuidePageKey)}
                    variant="default"
                    triggerLabel="Example data"
                    triggerButtonSize="sm"
                    triggerButtonVariant="ghost"
                    triggerClassName="landing-example-data-trigger min-h-0 px-2.5 py-1 text-xs leading-none shadow-none"
                    triggerChevronClassName="h-3 w-3"
                    showTriggerIcon={false}
                    loadCases={loadLandingGuideExampleCasesWithMetrics}
                    includeGeneratedDemo={false}
                    categoryLabels={{ Simple: 'Guide examples' }}
                  />
                </div>
              )}
            />
            <ParticipantColumnsInput
              label={ui.quickSetup.participantsLabel}
              nameColumnLabel={ui.quickSetup.nameColumnLabel}
              nameColumnPlaceholder={ui.quickSetup.namesPlaceholder}
              addAttributeLabel={ui.quickSetup.addAttributeLabel}
              ghostAttributeDisplayLabel={ui.quickSetup.ghostAttributeDisplayLabel}
              attributeNamePlaceholder={ui.quickSetup.attributeNamePlaceholder}
              ghostAttributeValuesPreview={ui.quickSetup.ghostAttributeValuesPreview}
              removeAttributeLabel={ui.quickSetup.removeAttributeLabel}
              columns={participantColumns}
              minHeight={130}
              autoOuterHeight={participantInputAutoOuterHeight}
              autoResizeSuppressed={participantInputAutoResizeSuppressed}
              autoFocusOnMount={autoFocusParticipantInput}
              outerRef={participantInputSlotRef}
              onManualLayoutAdjustment={onParticipantInputManualLayoutAdjustment}
              onAddAttribute={() => {
                let newColumnId: string | null = null;

                controller.updateDraft((current) => {
                  const columns = normalizeParticipantColumns(current);
                  newColumnId = nextAttributeColumnId(columns);

                  return withParticipantColumns(current, [
                    ...columns,
                    {
                      id: newColumnId,
                      name: '',
                      values: '',
                    },
                  ]);
                });

                return newColumnId;
              }}
              onChangeColumnName={(index, value) => {
                controller.updateDraft((current) => {
                  const columns = normalizeParticipantColumns(current);
                  const nextColumns = columns.map((column, columnIndex) => {
                    if (columnIndex !== index) {
                      return column;
                    }

                    return {
                      ...column,
                      name: value,
                    };
                  });

                  const previousName = columns[index]?.name ?? '';
                  const nextDraft = withParticipantColumns(current, nextColumns);
                  return previousName.trim() !== '' && current.balanceAttributeKey === previousName
                    ? { ...nextDraft, balanceAttributeKey: value.trim() || null }
                    : nextDraft;
                });
              }}
              onChangeColumnValues={(index, value) => {
                controller.updateDraft((current) => {
                  const columns = normalizeParticipantColumns(current);
                  return withParticipantColumns(
                    current,
                    columns.map((column, columnIndex) => (
                      columnIndex === index
                        ? { ...column, values: value }
                        : column
                    )),
                  );
                });
              }}
              onRemoveAttribute={(index) => {
                const columnToRemove = participantColumns[index];
                const hasValues = Boolean(columnToRemove?.values.trim());

                if (hasValues) {
                  const columnName = columnToRemove.name.trim() || `${ui.quickSetup.attributeColumnDefaultLabel} ${index}`;
                  const confirmed = window.confirm(
                    ui.quickSetup.removeAttributeConfirmMessage.replace('{name}', columnName),
                  );

                  if (!confirmed) {
                    return;
                  }
                }

                controller.updateDraft((current) => {
                  const columns = normalizeParticipantColumns(current);
                  return withParticipantColumns(
                    current,
                    columns.filter((_, columnIndex) => columnIndex !== index),
                  );
                });
              }}
            />

            <div className="landing-participants-controls mt-4">
              <div>
                <NumberField
                  label={ui.quickSetup.groupingValueGroupCountLabel}
                  value={displayedGroupCount}
                  onChange={(value) =>
                    controller.updateDraft((current) => ({
                      ...current,
                      groupingMode: 'groupCount',
                      groupingValue: Math.max(1, value ?? 1),
                    }))
                  }
                  {...withContextualMax(NUMBER_FIELD_PRESETS.groupCount, participantCount > 0 ? participantCount : undefined)}
                />
              </div>

              <div>
                <NumberField
                  label={ui.quickSetup.groupingValueGroupSizeLabel}
                  value={displayedPeoplePerGroup}
                  onChange={(value) =>
                    controller.updateDraft((current) => ({
                      ...current,
                      groupingMode: 'groupSize',
                      groupingValue: Math.max(1, value ?? 1),
                    }))
                  }
                  {...withContextualMax(NUMBER_FIELD_PRESETS.groupSize, participantCount > 0 ? participantCount : undefined)}
                />
              </div>

              <div className="landing-participants-controls__sessions min-w-0 w-full">
                <div className="mb-[0.86rem] flex items-center justify-between gap-3">
                  <SectionLabelWithTooltip
                    htmlFor="landing-sessions-slider"
                    label={ui.advancedOptions.sessionsLabel}
                    help={ui.advancedOptions.sessionsHelp}
                    className="min-w-0"
                  />
                  <label
                    className="landing-participants-controls__repeat-toggle"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={draft.avoidRepeatPairings}
                      onChange={(event) =>
                        controller.updateDraft((current) => ({
                          ...current,
                          avoidRepeatPairings: event.target.checked,
                        }))}
                    />
                    <Tooltip
                      content={(
                        <span>
                          <strong>{ui.advancedOptions.avoidRepeatPairingsLabel}.</strong>{' '}
                          {ui.advancedOptions.avoidRepeatPairingsDescription}
                        </span>
                      )}
                      className="min-w-0 flex-1"
                    >
                      <span className="block min-w-0 truncate whitespace-nowrap">{ui.advancedOptions.avoidRepeatPairingsLabel}</span>
                    </Tooltip>
                  </label>
                </div>
                <NumberField
                  id="landing-sessions-slider"
                  className="w-full"
                  value={draft.sessions}
                  onChange={(value) =>
                    controller.updateDraft((current) => ({
                      ...current,
                      sessions: Math.max(1, value ?? 1),
                    }))
                  }
                  {...NUMBER_FIELD_PRESETS.sessionCount}
                />
              </div>
            </div>

            <div className="mt-1 grid grid-cols-3 gap-2 rounded-xl px-3 py-0.5 text-center text-sm" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{ui.quickSetup.peopleStatLabel}</div>
                <div className="text-lg font-semibold">{participantCount}</div>
              </div>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{ui.quickSetup.groupsStatLabel}</div>
                <div className="text-lg font-semibold">{estimatedGroupCount}</div>
              </div>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{ui.quickSetup.approxSizeStatLabel}</div>
                <div className="text-lg font-semibold">{estimatedGroupSize}</div>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                ref={generateButtonRef}
                type="button"
                onClick={onGenerateGroups}
                disabled={!controller.canGenerate || controller.isSolving}
                className="btn-primary inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                style={{ opacity: renderStickyGenerateButton && !showStickyGenerateButton ? 0 : undefined }}
              >
                <Sparkles className="h-4 w-4" />
                {controller.isSolving ? ui.quickSetup.generatingLabel : ui.quickSetup.generateGroupsLabel}
              </button>
              {controller.result && (
                <button
                  type="button"
                  onClick={controller.reshuffle}
                  disabled={controller.isSolving}
                  className="landing-action-button inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ borderColor: 'var(--border-primary)' }}
                  title={ui.quickSetup.reshuffleLabel}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>

            {controller.result && (
              <p className="mt-3 text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
                {ui.quickSetup.resultsGeneratedHint}
              </p>
            )}
          </div>

          {canResizeToolColumns ? (
            <button
              type="button"
              aria-label="Resize landing tool columns"
              aria-orientation="vertical"
              className={[
                'landing-tool-columns__separator flex w-[22px] cursor-col-resize items-center justify-center rounded-full border-0 bg-transparent p-0',
                isDraggingToolDivider ? 'landing-tool-columns__separator--dragging' : null,
              ].filter(Boolean).join(' ')}
              onPointerDown={onStartToolDividerDrag}
            >
              <span
                aria-hidden="true"
                className="landing-tool-columns__separator-line h-full min-h-16 w-px rounded-full transition-colors"
              />
            </button>
          ) : null}

          <div ref={advancedOptionsPaneRef} className={canResizeToolColumns ? 'pl-2' : undefined}>
            <AdvancedOptions
              controller={controller}
              scenarioEditorCtaContent={config.optimizerCta}
              onOpenScenarioEditor={() => onOpenAdvancedWorkspace('people')}
            />
          </div>
        </div>
      </div>

      {renderStickyGenerateButton ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t px-4 py-3 shadow-lg md:hidden" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div
              className="min-w-0 flex-1 text-xs leading-tight transition-opacity duration-300"
              style={{
                color: 'var(--text-secondary)',
                opacity: showStickyGenerateMeta ? 1 : 0,
              }}
            >
              <div className="truncate">
                {participantCount} {ui.quickSetup.peopleStatLabel.toLowerCase()} · {estimatedGroupCount} {ui.quickSetup.groupsStatLabel.toLowerCase()}
              </div>
              <div className="truncate">
                {ui.quickSetup.approxSizeStatLabel} {estimatedGroupSize}
              </div>
            </div>
            <button
              ref={stickyGenerateButtonRef}
              type="button"
              onClick={onGenerateGroups}
              disabled={!controller.canGenerate || controller.isSolving}
              className="btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
              style={stickyGenerateButtonStyle}
            >
              <Sparkles className="h-4 w-4" />
              {controller.isSolving ? ui.quickSetup.generatingLabel : ui.quickSetup.generateGroupsLabel}
            </button>
          </div>
        </div>
      ) : null}

      {resultsSection}
    </>
  );
}
