/* eslint-disable max-lines */
import { ArrowRight, ChevronDown, Copy, Download, RotateCcw, Sparkles, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { LandingParticipantColumnsInput } from '../components/LandingTool/LandingParticipantColumnsInput';
import { LandingResizableTextarea } from '../components/LandingTool/LandingResizableTextarea';
import { QuickSetupAdvancedOptions } from '../components/LandingTool/QuickSetupAdvancedOptions';
import { QuickSetupFaq } from '../components/LandingTool/QuickSetupFaq';
import { useQuickSetup } from '../components/LandingTool/useQuickSetup';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { LandingLanguageSelector } from '../components/LandingPage/LandingLanguageSelector';
import { ResultsScheduleGrid } from '../components/ResultsView/ResultsScheduleGrid';
import { buildResultsSessionData } from '../components/results/buildResultsViewModel';
import { Tooltip } from '../components/Tooltip';
import { NumberField, NUMBER_FIELD_PRESETS, withContextualMax } from '../components/ui';
import { interpolate } from '../i18n/interpolate';
import { getLandingUiContent } from '../i18n/landingUi';
import { Seo } from '../components/Seo';
import {
  buildTelemetryPayload,
  buildTrackedAppPath,
  persistTelemetryAttribution,
  readTelemetryAttributionFromSearch,
  trackLandingEvent,
} from '../services/landingInstrumentation';
import { useAppStore } from '../store';
import { nextAttributeColumnId, normalizeParticipantColumns, withParticipantColumns } from '../utils/quickSetup/participantColumns';
import {
  buildToolPagePath,
  getLocaleDisplayName,
  getLocaleHomePath,
  getToolPageConfig,
  type SupportedLocale,
  type ToolPageKey,
} from './toolPageConfigs';

interface ToolLandingPageProps {
  pageKey: ToolPageKey;
  locale: SupportedLocale;
}

type ResultFormat = 'cards' | 'list' | 'text' | 'csv';

interface DisplaySession {
  sessionNumber: number;
  groups: Array<{
    id: string;
    members: string[];
  }>;
}

function buildDisplaySessions(
  sharedSessionData: Array<{ sessionIndex: number; groups: Array<{ id: string; people: Array<{ id: string }> }> }>,
  fallbackSessions: Array<{ sessionNumber: number; groups: Array<{ id: string; members: Array<{ name: string }> }> }>,
): DisplaySession[] {
  if (sharedSessionData.length > 0) {
    return sharedSessionData.map((session) => ({
      sessionNumber: session.sessionIndex + 1,
      groups: session.groups.map((group) => ({
        id: group.id,
        members: group.people.map((person) => person.id),
      })),
    }));
  }

  return fallbackSessions.map((session) => ({
    sessionNumber: session.sessionNumber,
    groups: session.groups.map((group) => ({
      id: group.id,
      members: group.members.map((member) => member.name),
    })),
  }));
}

function buildResultText(sessions: DisplaySession[], labels: ReturnType<typeof getLandingUiContent>['results']) {
  return sessions
    .map((session) =>
      [
        interpolate(labels.sessionHeadingTemplate, { number: session.sessionNumber }),
        ...session.groups.map((group) => `${group.id}: ${group.members.join(', ') || labels.noAssignmentsLabel}`),
      ].join('\n'),
    )
    .join('\n\n');
}

function buildResultCsv(sessions: DisplaySession[], labels: ReturnType<typeof getLandingUiContent>['results']) {
  const lines = [[labels.csvHeaderSession, labels.csvHeaderGroup, labels.csvHeaderMembers].join(',')];
  for (const session of sessions) {
    for (const group of session.groups) {
      lines.push(`${session.sessionNumber},${group.id},"${group.members.join(', ')}"`);
    }
  }
  return lines.join('\n');
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Ignore clipboard failures in unsupported environments.
  }
}

export default function ToolLandingPage({ pageKey, locale }: ToolLandingPageProps) {
  const config = getToolPageConfig(pageKey, locale);
  const ui = getLandingUiContent(locale);
  const controller = useQuickSetup(config);
  const loadWorkspaceAsNewScenario = useAppStore((state) => state.loadWorkspaceAsNewScenario);
  const navigate = useNavigate();
  const location = useLocation();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [resultFormat, setResultFormat] = useState<ResultFormat>('cards');
  const [copiedFormat, setCopiedFormat] = useState<ResultFormat | null>(null);
  const languageOptions = useMemo(
    () =>
      config.liveLocales.map((liveLocale) => ({
        locale: liveLocale,
        label: getLocaleDisplayName(liveLocale),
        to: `${buildToolPagePath(liveLocale, pageKey, config.slug)}${location.search}`,
      })),
    [config.liveLocales, config.slug, location.search, pageKey],
  );
  const telemetryAttribution = useMemo(
    () =>
      readTelemetryAttributionFromSearch({
        search: location.search,
        fallbackLandingSlug: pageKey,
      }),
    [location.search, pageKey],
  );

  useEffect(() => {
    persistTelemetryAttribution(telemetryAttribution);
  }, [telemetryAttribution]);

  useEffect(() => {
    trackLandingEvent(
      'landing_view',
      buildTelemetryPayload(
        {
          pageKey,
          canonicalPath: config.canonicalPath,
          preset: config.defaultPreset,
          locale: config.locale,
          audience: config.inventory.audience,
          pageExperimentLabel: config.experiment.label,
        },
        telemetryAttribution,
      ),
    );
  }, [
    config.canonicalPath,
    config.defaultPreset,
    config.experiment.label,
    config.inventory.audience,
    config.locale,
    pageKey,
    telemetryAttribution,
  ]);

  const workspacePayload = controller.workspacePayload;
  const solvedSolution = workspacePayload.solution ?? null;
  const sharedSessionData = useMemo(
    () => (solvedSolution
      ? buildResultsSessionData(workspacePayload.scenario, solvedSolution).map((session) => ({
          ...session,
          label: interpolate(ui.results.sessionHeadingTemplate, { number: session.sessionIndex + 1 }),
        }))
      : []),
    [solvedSolution, ui.results.sessionHeadingTemplate, workspacePayload.scenario],
  );
  const displaySessions = useMemo(
    () => buildDisplaySessions(sharedSessionData, controller.result?.sessions ?? []),
    [controller.result?.sessions, sharedSessionData],
  );
  const resultText = useMemo(() => buildResultText(displaySessions, ui.results), [displaySessions, ui.results]);
  const resultCsv = useMemo(() => buildResultCsv(displaySessions, ui.results), [displaySessions, ui.results]);
  const activeResultFormat = controller.result ? resultFormat : 'cards';
  const activeCopiedFormat = controller.result ? copiedFormat : null;

  useEffect(() => {
    if (!controller.result?.generatedAt) {
      return;
    }

    const scrollToResults = () => {
      resultsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    };

    const animationFrameId = window.requestAnimationFrame(scrollToResults);
    const timeoutId = window.setTimeout(scrollToResults, 250);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [controller.result?.generatedAt]);

  const navigateToAdvancedWorkspace = (target: 'results' | 'people') => {
    const nextScenarioId = loadWorkspaceAsNewScenario({
      ...workspacePayload,
      scenarioName: `${config.hero.title} draft`,
    });

    controller.updateDraft((current) => ({
      ...current,
      workspaceScenarioId: nextScenarioId,
    }));

    navigate(
      buildTrackedAppPath(
        target === 'results'
          ? '/app/results'
          : '/app/scenario/people',
        telemetryAttribution,
      ),
    );
  };

  const openAdvancedWorkspace = (target: 'results' | 'people') => {
    trackLandingEvent(
      'landing_open_advanced_workspace',
      buildTelemetryPayload(
        {
          hasResult: Boolean(controller.result),
          source: 'landing_page',
        },
        telemetryAttribution,
      ),
    );

    navigateToAdvancedWorkspace(target);
  };

  const { draft, participantCount, estimatedGroupCount, estimatedGroupSize } = controller;
  const participantColumns = normalizeParticipantColumns(draft);
  const displayedGroupCount = Math.max(1, estimatedGroupCount);
  const displayedPeoplePerGroup = Math.max(1, estimatedGroupSize || 0);
  const useCasesGridClassName = config.sectionSet === 'technical'
    ? 'mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3'
    : 'mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
  const advancedGridClassName = config.sectionSet === 'technical'
    ? 'mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4'
    : 'mt-8 grid gap-4 sm:grid-cols-2';
  const optimizerCtaCard = !controller.result ? (
    <div
      className="rounded-2xl border p-5 sm:p-6"
      style={{
        borderColor: 'var(--border-primary)',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      <div className="max-w-3xl">
        <div className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
          {config.optimizerCta.eyebrow}
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
          {config.optimizerCta.title}
        </h2>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {config.optimizerCta.featureBullets.map((feature) => (
            <span key={feature} className="rounded-full px-3 py-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              {feature}
            </span>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => openAdvancedWorkspace(controller.result ? 'results' : 'people')}
            className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
          >
            <Users className="h-4 w-4" />
            {config.optimizerCta.buttonLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {config.optimizerCta.supportingText}
          </span>
        </div>
      </div>
    </div>
  ) : null;

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
            onClick={() => openAdvancedWorkspace('results')}
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
          {(['cards', 'list', 'text', 'csv'] as ResultFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              role="tab"
              aria-selected={activeResultFormat === format}
              onClick={() => setResultFormat(format)}
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
                      : ui.results.csvFormatLabel
              }
            </button>
          ))}
        </div>

        {(activeResultFormat === 'text' || activeResultFormat === 'csv') && (
          <button
            type="button"
            onClick={async () => {
              const formatToCopy = activeResultFormat;
              await copyText(formatToCopy === 'csv' ? resultCsv : resultText);
              setCopiedFormat(formatToCopy);
              window.setTimeout(() => setCopiedFormat((current) => (current === formatToCopy ? null : current)), 1200);
            }}
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
        <div className="space-y-5">
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
          <LandingResizableTextarea
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

      {activeResultFormat === 'csv' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {ui.results.csvDescription}
          </p>
          <LandingResizableTextarea
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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <Seo
        title={config.seo.title}
        description={config.seo.description}
        canonicalPath={config.canonicalPath}
        faqEntries={config.faqEntries}
        locale={config.locale}
        alternates={config.alternates}
      />

      <AppHeader
        homeTo={getLocaleHomePath(config.locale)}
        logoAlt="GroupMixer logo"
        renderDesktopActions={() => (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => openAdvancedWorkspace(controller.result ? 'results' : 'people')}
              className="btn-secondary hidden sm:inline-flex items-center gap-1.5"
            >
              {config.chrome.expertWorkspaceLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        renderDesktopUtilityActions={() => (
          <LandingLanguageSelector
            currentLocale={config.locale}
            options={languageOptions}
            variant="header"
          />
        )}
        renderMobileActions={() => (
          <>
            <button
              type="button"
              onClick={() => openAdvancedWorkspace(controller.result ? 'results' : 'people')}
              className="btn-secondary flex items-center justify-center gap-1.5 w-full"
            >
              {config.chrome.expertWorkspaceLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        renderMobileUtilityActions={() => (
          <LandingLanguageSelector
            currentLocale={config.locale}
            options={languageOptions}
            className="h-10 w-full appearance-none rounded-md border pl-9 pr-8 text-sm font-medium outline-none transition-colors"
          />
        )}
      />

      <main>
        <section className="px-4 pb-10 pt-6 sm:px-6 lg:pb-16 lg:pt-8">
          <div className="mx-auto grid max-w-7xl gap-6 lg:gap-8">
            <div data-testid="landing-hero" className="order-2 max-w-4xl pt-2 lg:order-1 lg:pt-0">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl lg:leading-[1.15]">
                {config.hero.title}
              </h1>
            </div>

            <div
              data-testid="landing-tool-panel"
              className="order-1 rounded-2xl border p-5 shadow-sm sm:p-6 lg:order-2"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.9fr)] lg:gap-5">
                <div className="min-w-0">
                  <label className="mb-2 block text-sm font-medium">
                    {ui.quickSetup.participantsLabel}
                  </label>
                  <LandingParticipantColumnsInput
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
                      controller.updateDraft((current) => {
                        const columns = normalizeParticipantColumns(current);
                        const columnToRemove = columns[index];
                        const hasValues = Boolean(columnToRemove?.values.trim());

                        if (hasValues) {
                          const columnName = columnToRemove.name.trim() || `${ui.quickSetup.attributeColumnDefaultLabel} ${index}`;
                          const confirmed = window.confirm(
                            ui.quickSetup.removeAttributeConfirmMessage.replace('{name}', columnName),
                          );

                          if (!confirmed) {
                            return current;
                          }
                        }

                        return withParticipantColumns(
                          current,
                          columns.filter((_, columnIndex) => columnIndex !== index),
                        );
                      });
                    }}
                  />

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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

                    <div>
                      <div className="mb-[0.8rem] flex items-center justify-between gap-3">
                        <label className="text-sm font-medium" htmlFor="landing-sessions-slider">
                          {ui.advancedOptions.sessionsLabel}
                        </label>
                        <label
                          className="ml-auto flex min-w-0 max-w-[65%] items-center gap-2 text-xs font-medium sm:max-w-[70%] sm:text-sm"
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

                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl px-3 py-2.5 text-center text-sm" style={{ backgroundColor: 'var(--bg-secondary)' }}>
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

                  <div className="mt-5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        trackLandingEvent('landing_generate_clicked', {
                          preset: draft.preset,
                          participantCount,
                          groupingMode: draft.groupingMode,
                        });
                        controller.generateGroups();
                      }}
                      disabled={!controller.canGenerate || controller.isSolving}
                      className="btn-primary inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
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
                <div className="lg:pl-1">
                  <QuickSetupAdvancedOptions controller={controller} onOpenFullEditor={() => openAdvancedWorkspace('people')} />
                </div>
              </div>
            </div>

            <div className="order-3 max-w-4xl">
              <div className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
                {config.hero.eyebrow}
              </div>
              <p className="mt-5 text-base leading-7 sm:text-lg sm:leading-8" style={{ color: 'var(--text-secondary)' }}>
                {config.hero.subhead}
              </p>
              {config.hero.audienceSummary && (
                <p className="mt-3 max-w-2xl text-sm leading-6 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                  {config.hero.audienceSummary}
                </p>
              )}

              {config.hero.trustBullets.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {config.hero.trustBullets.map((bullet, index) => (
                    <span key={bullet} className="contents">
                      {index > 0 && (
                        <span aria-hidden="true" className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {' | '}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
                        {bullet}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {!controller.result && (
                <div className="mt-8 hidden text-sm lg:block" style={{ color: 'var(--text-secondary)' }}>
                  <span className="flex items-center gap-1">
                    <ChevronDown className="h-4 w-4" />
                    {config.chrome.scrollHint}
                  </span>
                </div>
              )}
            </div>

            {optimizerCtaCard && <div className="order-4">{optimizerCtaCard}</div>}

            {resultsSection}
          </div>
        </section>

        <section className="border-t px-4 pb-12 pt-10 sm:px-6" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold tracking-tight">{config.useCasesSection.title}</h2>
            <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
              {config.useCasesSection.description}
            </p>

            <div className={useCasesGridClassName}>
              {config.useCasesSection.cards.map((item) => (
                <div key={item.title} className="rounded-xl border p-5" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t px-4 pb-12 pt-10 sm:px-6" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold tracking-tight">{config.advancedSection.title}</h2>
            <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
              {config.advancedSection.description}
            </p>

            <div className={advancedGridClassName}>
              {config.advancedSection.cards.map((item) => (
                <div key={item.title} className="rounded-xl border p-5" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={() => openAdvancedWorkspace(controller.result ? 'results' : 'people')}
                className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
              >
                <Users className="h-4 w-4" />
                {config.advancedSection.buttonLabel}
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {config.advancedSection.supportingText}
              </p>
            </div>
          </div>
        </section>

        <section className="border-t px-4 pb-14 pt-10 sm:px-6" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">{config.chrome.faqHeading}</h2>
            <QuickSetupFaq entries={config.faqEntries} />
          </div>
        </section>
      </main>

      <LandingFooter
        expertWorkspaceTo={buildTrackedAppPath('/app', telemetryAttribution)}
        expertWorkspaceLabel={config.chrome.expertWorkspaceLabel}
        tagline={config.chrome.footerTagline}
        feedbackLabel={config.chrome.feedbackLabel}
        privacyNote={config.chrome.privacyNote}
      />
    </div>
  );
}
