/* eslint-disable max-lines */
import { ArrowRight, ChevronDown, Copy, Download, RotateCcw, Sparkles, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { QuickSetupAdvancedOptions } from '../components/LandingTool/QuickSetupAdvancedOptions';
import { QuickSetupFaq } from '../components/LandingTool/QuickSetupFaq';
import { useQuickSetup } from '../components/LandingTool/useQuickSetup';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { LandingLanguageSelector } from '../components/LandingPage/LandingLanguageSelector';
import { ResultsScheduleGrid } from '../components/ResultsView/ResultsScheduleGrid';
import { buildResultsSessionData } from '../components/results/buildResultsViewModel';
import { interpolate } from '../i18n/interpolate';
import { getLandingUiContent } from '../i18n/landingUi';
import { ThemeToggle } from '../components/ThemeToggle';
import { Seo } from '../components/Seo';
import {
  buildTelemetryPayload,
  buildTrackedAppPath,
  persistTelemetryAttribution,
  readTelemetryAttributionFromSearch,
  trackLandingEvent,
} from '../services/landingInstrumentation';
import { useAppStore } from '../store';
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
  const syncWorkspaceDraft = useAppStore((state) => state.syncWorkspaceDraft);
  const navigate = useNavigate();
  const location = useLocation();
  const resultsRef = useRef<HTMLDivElement>(null);
  const hasScrolledToResultsRef = useRef(false);
  const assetBaseUrl = import.meta.env?.BASE_URL ?? '/';
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
    () => (solvedSolution ? buildResultsSessionData(workspacePayload.scenario, solvedSolution) : []),
    [solvedSolution, workspacePayload.scenario],
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
    const timeout = window.setTimeout(() => {
      const syncedScenarioId = syncWorkspaceDraft({
        ...workspacePayload,
        currentScenarioId: controller.draft.workspaceScenarioId,
        scenarioName: `${config.hero.title} draft`,
      });

      if (syncedScenarioId !== controller.draft.workspaceScenarioId) {
        controller.updateDraft((current) => ({
          ...current,
          workspaceScenarioId: syncedScenarioId,
        }));
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [
    config.hero.title,
    controller,
    controller.draft.workspaceScenarioId,
    syncWorkspaceDraft,
    workspacePayload,
  ]);

  useEffect(() => {
    if (!controller.result) {
      hasScrolledToResultsRef.current = false;
      return;
    }

    if (!hasScrolledToResultsRef.current && resultsRef.current) {
      hasScrolledToResultsRef.current = true;
      resultsRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [controller.result]);

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

    const syncedScenarioId = syncWorkspaceDraft({
      ...workspacePayload,
      currentScenarioId: controller.draft.workspaceScenarioId,
      scenarioName: `${config.hero.title} draft`,
    });

    if (syncedScenarioId !== controller.draft.workspaceScenarioId) {
      controller.updateDraft((current) => ({
        ...current,
        workspaceScenarioId: syncedScenarioId,
      }));
    }

    navigate(
      buildTrackedAppPath(target === 'results' ? '/app/results' : '/app/scenario/people', telemetryAttribution),
    );
  };

  const { draft, participantCount, estimatedGroupCount, estimatedGroupSize } = controller;
  const heroOrderClass = controller.result ? 'order-3 lg:order-1' : 'order-2 lg:order-1';
  const resultsSection = controller.result ? (
    <div
      ref={resultsRef}
      data-testid="landing-results-panel"
      className="order-2 border-t pt-8 lg:order-3 lg:col-span-2"
      style={{ borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{ui.results.yourGroupsHeading}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={controller.exportGroupsCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
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
              className="rounded-full border px-3 py-1.5 text-sm font-medium capitalize"
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
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
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
          <textarea
            aria-label={ui.results.textResultsAriaLabel}
            readOnly
            value={resultText}
            className="min-h-[260px] w-full rounded-xl border px-4 py-3 text-sm outline-none"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
        </div>
      )}

      {activeResultFormat === 'csv' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {ui.results.csvDescription}
          </p>
          <textarea
            aria-label={ui.results.csvResultsAriaLabel}
            readOnly
            value={resultCsv}
            className="min-h-[260px] w-full rounded-xl border px-4 py-3 font-mono text-sm outline-none"
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

      <header
        className="border-b"
        style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to={getLocaleHomePath(config.locale)} className="flex items-center gap-2.5">
            <img src={assetBaseUrl + 'logo.svg'} alt="GroupMixer logo" className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight">GroupMixer</span>
          </Link>
          <div className="flex items-center gap-2">
            <LandingLanguageSelector currentLocale={config.locale} options={languageOptions} />
            <button
              type="button"
              onClick={() => openAdvancedWorkspace(controller.result ? 'results' : 'people')}
              className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:inline-flex"
              style={{ color: 'var(--text-secondary)' }}
            >
              {config.chrome.expertWorkspaceLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <ThemeToggle size="md" />
          </div>
        </div>
      </header>

      <main>
        <section className="px-4 pb-10 pt-8 sm:px-6 lg:pb-16 lg:pt-12">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_minmax(340px,420px)] lg:items-start lg:gap-12">
            <div data-testid="landing-hero" className={`${heroOrderClass} max-w-xl pt-2`}>
              <div className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
                {config.hero.eyebrow}
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl lg:leading-[1.15]">
                {config.hero.title}
              </h1>
              <p className="mt-4 text-base leading-7 sm:text-lg sm:leading-8" style={{ color: 'var(--text-secondary)' }}>
                {config.hero.subhead}
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-6 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                {config.hero.audienceSummary}
              </p>

              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {config.hero.trustBullets.map((bullet) => (
                  <span key={bullet} className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
                    {bullet}
                  </span>
                ))}
              </div>

              <div
                className="mt-8 rounded-2xl border p-5 sm:p-6"
                style={{
                  borderColor: 'var(--border-primary)',
                  backgroundColor: 'var(--bg-primary)',
                }}
              >
                <div className="max-w-lg">
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

              {!controller.result && (
                <div className="mt-10 hidden text-sm lg:block" style={{ color: 'var(--text-secondary)' }}>
                  <span className="flex items-center gap-1">
                    <ChevronDown className="h-4 w-4" />
                    {config.chrome.scrollHint}
                  </span>
                </div>
              )}
            </div>

            <div
              data-testid="landing-tool-panel"
              className="order-1 rounded-2xl border p-5 shadow-sm sm:p-6 lg:order-2"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            >
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="participantInput" className="text-sm font-medium">
                    {ui.quickSetup.participantsLabel}
                  </label>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {draft.inputMode === 'names' ? (
                      <button
                        type="button"
                        className="font-medium"
                        onClick={() =>
                          controller.updateDraft((current) => ({
                            ...current,
                            inputMode: 'csv',
                            balanceAttributeKey: null,
                          }))
                        }
                      >
                        {ui.quickSetup.switchToCsvLabel}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="font-medium"
                        onClick={() =>
                          controller.updateDraft((current) => ({
                            ...current,
                            inputMode: 'names',
                            balanceAttributeKey: null,
                          }))
                        }
                      >
                        {ui.quickSetup.switchToNamesLabel}
                      </button>
                    )}
                    <span>·</span>
                    <button type="button" className="font-medium" onClick={controller.loadSampleData}>
                      {ui.quickSetup.sampleLabel}
                    </button>
                    <span>·</span>
                    <button type="button" className="font-medium" onClick={controller.resetDraft}>
                      {ui.quickSetup.resetLabel}
                    </button>
                  </div>
                </div>
                <textarea
                  id="participantInput"
                  value={draft.participantInput}
                  onChange={(event) =>
                    controller.updateDraft((current) => ({ ...current, participantInput: event.target.value }))
                  }
                  placeholder={draft.inputMode === 'csv' ? ui.quickSetup.csvPlaceholder : ui.quickSetup.namesPlaceholder}
                  className="min-h-[130px] w-full rounded-xl border px-3 py-2.5 text-sm leading-relaxed outline-none transition-shadow focus:ring-2"
                  style={{
                    borderColor: 'var(--border-primary)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div className="mt-4">
                <label htmlFor="groupingValue" className="mb-1.5 block text-sm font-medium">
                  {draft.groupingMode === 'groupCount'
                    ? ui.quickSetup.groupingValueGroupCountLabel
                    : ui.quickSetup.groupingValueGroupSizeLabel}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="groupingValue"
                    type="number"
                    min={1}
                    value={draft.groupingValue}
                    onChange={(event) =>
                      controller.updateDraft((current) => ({
                        ...current,
                        groupingValue: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                    className="w-24 rounded-xl border px-3 py-2 text-sm outline-none transition-shadow focus:ring-2"
                    style={{
                      borderColor: 'var(--border-primary)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-lg px-2.5 py-2 text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={() =>
                      controller.updateDraft((current) => ({
                        ...current,
                        groupingMode: current.groupingMode === 'groupCount' ? 'groupSize' : 'groupCount',
                      }))
                    }
                  >
                    {draft.groupingMode === 'groupCount'
                      ? ui.quickSetup.groupingToggleToGroupSizeLabel
                      : ui.quickSetup.groupingToggleToGroupCountLabel}
                  </button>
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
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ borderColor: 'var(--border-primary)' }}
                    title={ui.quickSetup.reshuffleLabel}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="mt-4">
                <QuickSetupAdvancedOptions controller={controller} />
              </div>
            </div>

            {resultsSection}
          </div>
        </section>

        <section className="border-t px-4 pb-12 pt-10 sm:px-6" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold tracking-tight">{config.useCasesSection.title}</h2>
            <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
              {config.useCasesSection.description}
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
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
