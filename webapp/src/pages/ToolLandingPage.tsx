/* eslint-disable max-lines */
import { ArrowRight, Users } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { EmbeddableTool } from '../components/EmbeddableTool';
import { QuickSetupFaq } from '../components/LandingTool/QuickSetupFaq';
import { useQuickSetup } from '../components/LandingTool/useQuickSetup';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { HomeAnimatedHeroTitle } from '../components/LandingPage/HomeAnimatedHeroTitle';
import { LandingLanguageSelector } from '../components/LandingPage/LandingLanguageSelector';
import { NotificationContainer } from '../components/NotificationContainer';
import { buildResultsSessionData } from '../components/results/buildResultsViewModel';
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
import { loadDemoCase } from '../services/demoDataService';
import { useAppStore } from '../store';
import { normalizeParticipantColumns } from '../utils/quickSetup/participantColumns';
import {
  buildToolPagePath,
  DEFAULT_LOCALE,
  getLocaleDisplayName,
  getLocaleHomePath,
  getToolPageConfig,
  type SupportedLocale,
  type ToolPageKey,
} from './toolPageConfigs';
import { GUIDE_PAGE_ROUTES, getGuidePageConfig } from './guidePageConfigs';

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
const HOME_ANIMATED_HERO_STATIC_TITLE = 'Group Generator - Random, Balanced & Multi-Round';
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

export default function ToolLandingPage({ pageKey, locale }: ToolLandingPageProps) {
  const config = getToolPageConfig(pageKey, locale);
  const ui = getLandingUiContent(locale);
  const usesAnimatedHomeTitle = config.key === 'home' && config.locale === 'en';
  const heroHeadingText = usesAnimatedHomeTitle ? HOME_ANIMATED_HERO_STATIC_TITLE : config.hero.title;
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
  const guideLinks = useMemo(() => {
    if (config.locale !== DEFAULT_LOCALE) {
      return [];
    }

    return GUIDE_PAGE_ROUTES.map((route) => {
      const guideConfig = getGuidePageConfig(route.key);
      return {
        key: route.key,
        href: guideConfig.canonicalPath,
        title: guideConfig.hero.title,
        description: guideConfig.hero.intro,
      };
    });
  }, [config.locale]);
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
        utilityRailFramed={false}
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
              <h1 className={usesAnimatedHomeTitle ? 'sr-only' : [
                'block w-full max-w-full overflow-hidden text-ellipsis font-bold leading-[1.08] tracking-normal sm:text-4xl lg:leading-[1.15]',
                'whitespace-nowrap text-[1.15rem] min-[340px]:text-[1.38rem] min-[390px]:text-2xl',
              ].join(' ')}>
                {heroHeadingText}
              </h1>
              {usesAnimatedHomeTitle ? (
                <div
                  data-testid="landing-home-hero-animation"
                  aria-hidden="true"
                  className="block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-bold leading-[1.08] tracking-normal text-base min-[340px]:text-[1.08rem] min-[390px]:text-xl sm:text-4xl lg:leading-[1.15]"
                >
                  <HomeAnimatedHeroTitle />
                </div>
              ) : null}
            </div>

            <EmbeddableTool
              config={config}
              ui={ui}
              controller={controller}
              participantColumns={participantColumns}
              participantCount={participantCount}
              estimatedGroupCount={estimatedGroupCount}
              estimatedGroupSize={estimatedGroupSize}
              displayedGroupCount={displayedGroupCount}
              displayedPeoplePerGroup={displayedPeoplePerGroup}
              participantInputAutoOuterHeight={participantInputAutoOuterHeight}
              canResizeToolColumns={canResizeToolColumns}
              toolColumnsStyle={toolColumnsStyle}
              isDraggingToolDivider={isDraggingToolDivider}
              activeResultFormat={activeResultFormat}
              activeCopiedFormat={activeCopiedFormat}
              sharedSessionData={sharedSessionData}
              displaySessions={displaySessions}
              resultText={resultText}
              resultLineText={resultLineText}
              resultCsv={resultCsv}
              resultsRef={resultsRef}
              toolColumnsRef={toolColumnsRef}
              participantsPaneRef={participantsPaneRef}
              advancedOptionsPaneRef={advancedOptionsPaneRef}
              participantInputSlotRef={setParticipantInputSlotRef}
              onClearAllInputs={handleClearAllInputs}
              onLandingDemoCaseClick={(demoCaseId) => {
                void handleLandingDemoCaseClick(demoCaseId);
              }}
              onOpenAdvancedWorkspace={openAdvancedWorkspace}
              onStartToolDividerDrag={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                setIsDraggingToolDivider(true);
              }}
              onGenerateGroups={() => {
                trackLandingEvent('landing_generate_clicked', {
                  preset: draft.preset,
                  participantCount,
                  groupingMode: draft.groupingMode,
                });
                controller.generateGroups();
              }}
              onChangeResultFormat={setResultFormat}
              onCopyActiveResult={async () => {
                const formatToCopy = activeResultFormat;
                await copyText(formatToCopy === 'csv' ? resultCsv : formatToCopy === 'lines' ? resultLineText : resultText);
                setCopiedFormat(formatToCopy);
                window.setTimeout(() => setCopiedFormat((current) => (current === formatToCopy ? null : current)), 1200);
              }}
            />

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

        {guideLinks.length > 0 ? (
          <section className="border-t px-4 pb-12 pt-10 sm:px-6" style={{ borderColor: 'var(--border-primary)' }}>
            <div className="mx-auto max-w-6xl">
              <h2 className="text-2xl font-semibold tracking-tight">Guides</h2>
              <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
                Practical playbooks for workshops, classrooms, and repeated group assignments.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {guideLinks.map((link) => (
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
