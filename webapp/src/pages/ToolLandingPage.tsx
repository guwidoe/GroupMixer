/* eslint-disable max-lines */
import { ArrowRight, CircleHelp, Copy, Download, RotateCcw, Sparkles, Users } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { LandingParticipantColumnsInput } from '../components/LandingTool/LandingParticipantColumnsInput';
import { LandingResizableTextarea } from '../components/LandingTool/LandingResizableTextarea';
import { QuickSetupAdvancedOptions } from '../components/LandingTool/QuickSetupAdvancedOptions';
import { QuickSetupFaq } from '../components/LandingTool/QuickSetupFaq';
import { useQuickSetup } from '../components/LandingTool/useQuickSetup';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { HomeAnimatedHeroTitle } from '../components/LandingPage/HomeAnimatedHeroTitle';
import { LandingLanguageSelector } from '../components/LandingPage/LandingLanguageSelector';
import { NotificationContainer } from '../components/NotificationContainer';
import { ResultsScheduleGrid } from '../components/ResultsView/ResultsScheduleGrid';
import { DemoDataDropdown } from '../components/ScenarioEditor/DemoDataDropdown';
import { buildResultsSessionData } from '../components/results/buildResultsViewModel';
import { Tooltip } from '../components/Tooltip';
import { NumberField, NUMBER_FIELD_PRESETS, withContextualMax } from '../components/ui';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
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
import { loadDemoCase, loadLandingCompatibleDemoCasesWithMetrics } from '../services/demoDataService';
import { useAppStore } from '../store';
import { nextAttributeColumnId, normalizeParticipantColumns, withParticipantColumns } from '../utils/quickSetup/participantColumns';
import {
  buildToolPagePath,
  DEFAULT_LOCALE,
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

type ResultFormat = 'cards' | 'list' | 'text' | 'lines' | 'csv';

interface DisplaySession {
  sessionNumber: number;
  groups: Array<{
    id: string;
    members: string[];
  }>;
}

const LANDING_TOOL_RESIZE_STORAGE_KEY = 'landing:tool-split';
const LANDING_TOOL_RESIZE_HANDLE_WIDTH = 22;
const LANDING_TOOL_LEFT_MIN_WIDTH = 400;
const LANDING_TOOL_RIGHT_MIN_WIDTH = 340;
const LANDING_TOOL_RESIZE_MIN_WIDTH = LANDING_TOOL_LEFT_MIN_WIDTH + LANDING_TOOL_RIGHT_MIN_WIDTH + LANDING_TOOL_RESIZE_HANDLE_WIDTH;
const HOME_ANIMATED_HERO_STATIC_TITLE = 'Random Group Generator';
const RELATED_TOOL_PAGE_KEYS: ToolPageKey[] = [
  'home',
  'random-group-generator',
  'student-group-generator',
  'random-team-generator',
  'group-generator-with-constraints',
  'multi-round-group-assignment-tool',
  'speed-networking-generator',
];

const RELATED_TOOL_PAGE_COPY: Record<(typeof RELATED_TOOL_PAGE_KEYS)[number], { title: string; description: string }> = {
  home: {
    title: 'Group Generator',
    description: 'Start with the main instant tool for random, balanced, or multi-round groups.',
  },
  'random-group-generator': {
    title: 'Random Group Generator',
    description: 'Paste a list of names and split it into groups right away.',
  },
  'student-group-generator': {
    title: 'Student Group Generator',
    description: 'Create classroom groups for activities, projects, and rotations.',
  },
  'random-team-generator': {
    title: 'Random Team Generator',
    description: 'Turn names into teams and balance them by role, skill, or another attribute.',
  },
  'group-generator-with-constraints': {
    title: 'Group Generator with Constraints',
    description: 'Keep people together or apart and balance groups with extra rules.',
  },
  'multi-round-group-assignment-tool': {
    title: 'Multi-Round Group Assignment Tool',
    description: 'Generate several rounds while minimizing repeated pairings.',
  },
  'speed-networking-generator': {
    title: 'Speed Networking Generator',
    description: 'Plan repeated small-group rounds where people meet new participants.',
  },
};

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

function buildResultLineText(sessions: DisplaySession[], labels: ReturnType<typeof getLandingUiContent>['results']) {
  return sessions
    .map((session) =>
      [
        interpolate(labels.sessionHeadingTemplate, { number: session.sessionNumber }),
        ...session.groups.map((group) =>
          [
            group.id,
            ...(group.members.length > 0 ? group.members : [labels.noAssignmentsLabel]),
          ].join('\n'),
        ),
      ].join('\n\n'),
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

function SectionLabelWithTooltip({
  label,
  help,
  htmlFor,
  action,
}: {
  label: string;
  help: string;
  htmlFor?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={action ? 'relative mb-2 pr-28 sm:pr-32' : 'mb-2'}>
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

export default function ToolLandingPage({ pageKey, locale }: ToolLandingPageProps) {
  const config = getToolPageConfig(pageKey, locale);
  const ui = getLandingUiContent(locale);
  const usesAnimatedHomeTitle = config.key === 'home' && config.locale === 'en' && config.hero.title === HOME_ANIMATED_HERO_STATIC_TITLE;
  const controller = useQuickSetup(config);
  const loadWorkspaceAsNewScenario = useAppStore((state) => state.loadWorkspaceAsNewScenario);
  const addNotification = useAppStore((state) => state.addNotification);
  const navigate = useNavigate();
  const location = useLocation();
  const resultsRef = useRef<HTMLDivElement>(null);
  const toolColumnsRef = useRef<HTMLDivElement>(null);
  const participantsPaneRef = useRef<HTMLDivElement>(null);
  const participantInputSlotRef = useRef<HTMLDivElement>(null);
  const advancedOptionsPaneRef = useRef<HTMLDivElement>(null);
  const hasBalancedInitialToolColumnsRef = useRef(false);
  const lastNotifiedSolverErrorRef = useRef<string | null>(null);
  const [resultFormat, setResultFormat] = useState<ResultFormat>('cards');
  const [copiedFormat, setCopiedFormat] = useState<ResultFormat | null>(null);
  const [toolSplitRatio, setToolSplitRatio] = useLocalStorageState<number>(`${LANDING_TOOL_RESIZE_STORAGE_KEY}:${pageKey}`, 0.5);
  const [toolColumnsWidth, setToolColumnsWidth] = useState(0);
  const [isDraggingToolDivider, setIsDraggingToolDivider] = useState(false);
  const [participantInputAutoOuterHeight, setParticipantInputAutoOuterHeight] = useState<number | null>(null);
  const languageOptions = useMemo(
    () =>
      config.liveLocales.map((liveLocale) => ({
        locale: liveLocale,
        label: getLocaleDisplayName(liveLocale),
        to: `${buildToolPagePath(liveLocale, pageKey, config.slug)}${location.search}`,
      })),
    [config.liveLocales, config.slug, location.search, pageKey],
  );
  const relatedToolLinks = useMemo(() => {
    if (config.locale !== DEFAULT_LOCALE) {
      return [];
    }

    return RELATED_TOOL_PAGE_KEYS
      .filter((relatedPageKey) => relatedPageKey !== config.key)
      .map((relatedPageKey) => {
        const relatedConfig = getToolPageConfig(relatedPageKey, DEFAULT_LOCALE);
        return {
          key: relatedPageKey,
          href: buildToolPagePath(DEFAULT_LOCALE, relatedPageKey, relatedConfig.slug),
          ...RELATED_TOOL_PAGE_COPY[relatedPageKey],
        };
      });
  }, [config.key, config.locale]);
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
    hasBalancedInitialToolColumnsRef.current = false;
    setParticipantInputAutoOuterHeight(null);
  }, [config.locale, pageKey]);

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
  const resultLineText = useMemo(() => buildResultLineText(displaySessions, ui.results), [displaySessions, ui.results]);
  const resultCsv = useMemo(() => buildResultCsv(displaySessions, ui.results), [displaySessions, ui.results]);
  const activeResultFormat = controller.result ? resultFormat : 'cards';
  const activeCopiedFormat = controller.result ? copiedFormat : null;
  const { draft, participantCount, estimatedGroupCount, estimatedGroupSize } = controller;
  const participantColumns = normalizeParticipantColumns(draft);
  const displayedGroupCount = Math.max(1, estimatedGroupCount);
  const displayedPeoplePerGroup = Math.max(1, estimatedGroupSize || 0);
  const canResizeToolColumns = toolColumnsWidth >= LANDING_TOOL_RESIZE_MIN_WIDTH;
  const resolvedToolSplitRatio = Math.min(0.72, Math.max(0.4, toolSplitRatio));
  const resizableTrackWidth = Math.max(0, toolColumnsWidth - LANDING_TOOL_RESIZE_HANDLE_WIDTH);
  const leftColumnWidth = canResizeToolColumns
    ? Math.min(
        Math.max(resizableTrackWidth * resolvedToolSplitRatio, LANDING_TOOL_LEFT_MIN_WIDTH),
        Math.max(LANDING_TOOL_LEFT_MIN_WIDTH, resizableTrackWidth - LANDING_TOOL_RIGHT_MIN_WIDTH),
      )
    : null;
  const rightColumnWidth = canResizeToolColumns && leftColumnWidth != null
    ? Math.max(LANDING_TOOL_RIGHT_MIN_WIDTH, resizableTrackWidth - leftColumnWidth)
    : null;
  const toolColumnsStyle = canResizeToolColumns && leftColumnWidth != null && rightColumnWidth != null
    ? {
        gridTemplateColumns: `minmax(0, ${leftColumnWidth}px) ${LANDING_TOOL_RESIZE_HANDLE_WIDTH}px minmax(${LANDING_TOOL_RIGHT_MIN_WIDTH}px, ${rightColumnWidth}px)`,
      }
    : undefined;
  const useCasesGridClassName = config.sectionSet === 'technical'
    ? 'mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3'
    : 'mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
  const advancedGridClassName = config.sectionSet === 'technical'
    ? 'mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4'
    : 'mt-8 grid gap-4 sm:grid-cols-2';
  const setParticipantInputSlotRef = useCallback((node: HTMLDivElement | null) => {
    participantInputSlotRef.current = node;
  }, []);

  useEffect(() => {
    if (!controller.errorMessage) {
      lastNotifiedSolverErrorRef.current = null;
      return;
    }

    if (lastNotifiedSolverErrorRef.current === controller.errorMessage) {
      return;
    }

    lastNotifiedSolverErrorRef.current = controller.errorMessage;
    addNotification({
      type: 'error',
      title: 'Solver Error',
      message: controller.errorMessage,
    });
  }, [addNotification, controller.errorMessage]);

  useEffect(() => {
    if (!controller.result?.generatedAt) {
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('view') !== 'results') {
      searchParams.set('view', 'results');
      navigate(
        {
          pathname: location.pathname,
          search: searchParams.toString(),
          hash: location.hash,
        },
        { replace: false },
      );
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
  }, [controller.result?.generatedAt, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    const node = toolColumnsRef.current;
    if (!node) {
      return undefined;
    }

    const measure = () => {
      const nextWidth = node.getBoundingClientRect().width;
      setToolColumnsWidth((previous) => (Math.abs(previous - nextWidth) < 0.5 ? previous : nextWidth));
    };

    measure();
    window.addEventListener('resize', measure);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measure());
      observer.observe(node);
    }

    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    if (hasBalancedInitialToolColumnsRef.current) {
      return undefined;
    }

    let animationFrameId = 0;
    const timeoutIds: number[] = [];

    const measure = () => {
      if (hasBalancedInitialToolColumnsRef.current) {
        return;
      }

      const leftPane = participantsPaneRef.current;
      const participantInput = participantInputSlotRef.current;
      const rightPane = advancedOptionsPaneRef.current;
      if (!leftPane || !participantInput || !rightPane) {
        return;
      }

      const leftRect = leftPane.getBoundingClientRect();
      const inputRect = participantInput.getBoundingClientRect();
      const rightRect = rightPane.getBoundingClientRect();
      if (leftRect.width <= 0 || inputRect.height <= 0 || rightRect.width <= 0) {
        return;
      }

      const isHorizontalLayout = rightRect.left >= leftRect.right - 1;
      if (!isHorizontalLayout) {
        setParticipantInputAutoOuterHeight((previous) => (previous == null ? previous : null));
        return;
      }

      const leftContentBottom = Array.from(leftPane.children).reduce((bottom, child) => {
        const childBottom = child.getBoundingClientRect().bottom;
        return Math.max(bottom, childBottom);
      }, leftRect.top);
      const leftContentHeight = leftContentBottom - leftRect.top;
      const heightDelta = rightRect.height - leftContentHeight;
      if (heightDelta <= 1) {
        hasBalancedInitialToolColumnsRef.current = true;
        return;
      }

      const nextOuterHeight = inputRect.height + heightDelta;
      setParticipantInputAutoOuterHeight((previous) => (
        previous != null && Math.abs(previous - nextOuterHeight) < 0.5 ? previous : nextOuterHeight
      ));
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(measure);
    };

    measure();
    scheduleMeasure();
    timeoutIds.push(window.setTimeout(measure, 50));
    timeoutIds.push(window.setTimeout(measure, 200));

    const observedNodes = [
      participantsPaneRef.current,
      participantInputSlotRef.current,
      advancedOptionsPaneRef.current,
      toolColumnsRef.current,
    ].filter((node): node is HTMLDivElement => Boolean(node));

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && observedNodes.length > 0) {
      observer = new ResizeObserver(scheduleMeasure);
      observedNodes.forEach((node) => observer?.observe(node));
    }

    window.addEventListener('resize', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [canResizeToolColumns, config.locale, pageKey]);

  useEffect(() => {
    if (!isDraggingToolDivider || !canResizeToolColumns) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = toolColumnsRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextLeftWidth = Math.min(
        Math.max(event.clientX - bounds.left - (LANDING_TOOL_RESIZE_HANDLE_WIDTH / 2), LANDING_TOOL_LEFT_MIN_WIDTH),
        Math.max(LANDING_TOOL_LEFT_MIN_WIDTH, bounds.width - LANDING_TOOL_RESIZE_HANDLE_WIDTH - LANDING_TOOL_RIGHT_MIN_WIDTH),
      );
      const nextRatio = nextLeftWidth / Math.max(1, bounds.width - LANDING_TOOL_RESIZE_HANDLE_WIDTH);
      setToolSplitRatio(Math.min(0.72, Math.max(0.4, nextRatio)));
    };

    const stopDragging = () => setIsDraggingToolDivider(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [canResizeToolColumns, isDraggingToolDivider, setToolSplitRatio]);

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
          {(['cards', 'list', 'text', 'lines', 'csv'] as ResultFormat[]).map((format) => (
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
            onClick={async () => {
              const formatToCopy = activeResultFormat;
              await copyText(formatToCopy === 'csv' ? resultCsv : formatToCopy === 'lines' ? resultLineText : resultText);
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

      {activeResultFormat === 'lines' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {ui.results.lineTextDescription}
          </p>
          <LandingResizableTextarea
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

  const handleLandingDemoCaseClick = async (demoCaseId: string) => {
    try {
      const scenario = await loadDemoCase(demoCaseId);
      const loaded = controller.loadScenarioDraft(scenario);
      if (!loaded) {
        addNotification({
          type: 'error',
          title: 'Demo case not supported here',
          message: 'This demo uses session-aware settings that require the advanced workspace.',
        });
      }
    } catch (error) {
      console.error('Failed to load landing demo case:', error);
      addNotification({
        type: 'error',
        title: 'Failed to load demo data',
        message: 'Please try again or open the advanced workspace.',
      });
    }
  };

  const handleClearAllInputs = () => {
    if (controller.hasAnyInputData && !window.confirm(ui.quickSetup.clearAllConfirmMessage)) {
      return;
    }

    controller.clearDraft();
  };

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
        titleAs="div"
        desktopBreakpoint="landing"
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
        <section className="px-4 pb-8 pt-4 sm:px-6 lg:pb-14 lg:pt-6">
          <div className="mx-auto grid max-w-7xl gap-5 lg:gap-6">
            <div data-testid="landing-hero" className="order-1 min-w-0 max-w-4xl">
              <h1
                aria-label={usesAnimatedHomeTitle ? config.hero.title : undefined}
                className={[
                  'block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-bold leading-[1.08] tracking-normal sm:text-4xl lg:leading-[1.15]',
                  usesAnimatedHomeTitle
                    ? 'text-base min-[340px]:text-[1.08rem] min-[390px]:text-xl'
                    : 'text-[1.15rem] min-[340px]:text-[1.38rem] min-[390px]:text-2xl',
                ].join(' ')}
              >
                {usesAnimatedHomeTitle ? <HomeAnimatedHeroTitle /> : config.hero.title}
              </h1>
            </div>

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
                          onClick={handleClearAllInputs}
                          className="ui-button ui-button--ghost ui-button--sm min-h-0 px-2.5 py-1 text-xs leading-none shadow-none"
                        >
                          {ui.quickSetup.clearAllLabel}
                        </button>
                        <DemoDataDropdown
                          onDemoCaseClick={(demoCaseId) => {
                            void handleLandingDemoCaseClick(demoCaseId);
                          }}
                          variant="default"
                          triggerLabel="Example data"
                          triggerButtonSize="sm"
                          triggerClassName="landing-example-data-trigger min-h-0 px-2.5 py-1 text-xs leading-none shadow-none"
                          loadCases={loadLandingCompatibleDemoCasesWithMetrics}
                          includeGeneratedDemo={false}
                        />
                      </div>
                    )}
                  />
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
                    autoOuterHeight={participantInputAutoOuterHeight}
                    outerRef={setParticipantInputSlotRef}
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
                        <label className="text-sm font-medium" htmlFor="landing-sessions-slider">
                          {ui.advancedOptions.sessionsLabel}
                        </label>
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

                {canResizeToolColumns ? (
                  <button
                    type="button"
                    aria-label="Resize landing tool columns"
                    aria-orientation="vertical"
                    className={[
                      'landing-tool-columns__separator flex w-[22px] cursor-col-resize items-center justify-center rounded-full border-0 bg-transparent p-0',
                      isDraggingToolDivider ? 'landing-tool-columns__separator--dragging' : null,
                    ].filter(Boolean).join(' ')}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      setIsDraggingToolDivider(true);
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="landing-tool-columns__separator-line h-full min-h-16 w-px rounded-full transition-colors"
                    />
                  </button>
                ) : null}

                <div ref={advancedOptionsPaneRef} className={canResizeToolColumns ? 'pl-2' : undefined}>
                  <QuickSetupAdvancedOptions controller={controller} onOpenFullEditor={() => openAdvancedWorkspace('people')} />
                </div>
              </div>
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

        {relatedToolLinks.length > 0 ? (
          <section className="border-t px-4 pb-12 pt-10 sm:px-6" style={{ borderColor: 'var(--border-primary)' }}>
            <div className="mx-auto max-w-6xl">
              <h2 className="text-2xl font-semibold tracking-tight">More group generator tools</h2>
              <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
                Explore related tools for classrooms, teams, constraints, and multi-round group assignments.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {relatedToolLinks.map((link) => (
                  <a
                    key={link.key}
                    href={link.href}
                    className="rounded-xl border p-5 transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  >
                    <h3 className="text-base font-semibold">{link.title}</h3>
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                      {link.description}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          </section>
        ) : null}

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
      <NotificationContainer />
    </div>
  );
}
