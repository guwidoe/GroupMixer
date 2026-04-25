import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { interpolate } from '../../i18n/interpolate';
import { getLandingUiContent } from '../../i18n/landingUi';
import {
  buildTelemetryPayload,
  buildTrackedAppPath,
  readTelemetryAttributionFromSearch,
  trackLandingEvent,
} from '../../services/landingInstrumentation';
import { getPersonDisplayName } from '../../services/scenarioAttributes';
import { useAppStore } from '../../store';
import type { Person } from '../../types';
import { normalizeParticipantColumns } from '../../utils/quickSetup/participantColumns';
import { buildResultsSessionData } from '../results/buildResultsViewModel';
import { GroupTool, type ToolResultFormat } from './GroupTool';
import { useLayoutAutoResizeSuppression } from './layoutAutoResizeSuppression';
import { useToolSetup } from './useToolSetup';
import type { GuidePageKey } from '../../pages/guidePageTypes';
import { getToolPageConfig, type SupportedLocale, type ToolPageKey } from '../../pages/toolPageConfigs';

interface DisplaySession {
  sessionNumber: number;
  groups: Array<{
    id: string;
    members: string[];
  }>;
}

export interface EmbeddableToolHandle {
  hasResult: boolean;
  openAdvancedWorkspace: (target?: 'results' | 'people') => void;
}

interface EmbeddableToolProps {
  pageKey: ToolPageKey;
  locale: SupportedLocale;
  initialGuideExampleKey?: GuidePageKey;
  storageScope?: string;
  autoFocusParticipantInput?: boolean;
}

interface ToolDividerDragState {
  startX: number;
  startLeftWidth: number;
  trackWidth: number;
}

const EMBEDDABLE_TOOL_RESIZE_STORAGE_KEY = 'landing:tool-split';
const EMBEDDABLE_TOOL_RESIZE_HANDLE_WIDTH = 22;
const EMBEDDABLE_TOOL_COLUMN_GAP = 20;
const EMBEDDABLE_TOOL_RESIZE_GAP_COUNT = 2;
const EMBEDDABLE_TOOL_LEFT_MIN_WIDTH = 400;
const EMBEDDABLE_TOOL_RIGHT_MIN_WIDTH = 340;
const EMBEDDABLE_TOOL_RESIZE_MIN_WIDTH = EMBEDDABLE_TOOL_LEFT_MIN_WIDTH + EMBEDDABLE_TOOL_RIGHT_MIN_WIDTH + EMBEDDABLE_TOOL_RESIZE_HANDLE_WIDTH + (EMBEDDABLE_TOOL_COLUMN_GAP * EMBEDDABLE_TOOL_RESIZE_GAP_COUNT);

function buildDisplaySessions(
  sharedSessionData: Array<{ sessionIndex: number; groups: Array<{ id: string; people: Person[] }> }>,
  fallbackSessions: Array<{ sessionNumber: number; groups: Array<{ id: string; members: Array<{ name: string }> }> }>,
): DisplaySession[] {
  if (sharedSessionData.length > 0) {
    return sharedSessionData.map((session) => ({
      sessionNumber: session.sessionIndex + 1,
      groups: session.groups.map((group) => ({
        id: group.id,
        members: group.people.map((person) => getPersonDisplayName(person)),
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

export const EmbeddableTool = forwardRef<EmbeddableToolHandle, EmbeddableToolProps>(function EmbeddableTool(
  { pageKey, locale, initialGuideExampleKey, storageScope, autoFocusParticipantInput = true },
  ref,
) {
  const config = getToolPageConfig(pageKey, locale);
  const ui = getLandingUiContent(locale);
  const controller = useToolSetup(config, { initialGuideExampleKey, storageScope });
  const loadWorkspaceAsNewScenario = useAppStore((state) => state.loadWorkspaceAsNewScenario);
  const addNotification = useAppStore((state) => state.addNotification);
  const navigate = useNavigate();
  const location = useLocation();
  const resultsRef = useRef<HTMLDivElement>(null);
  const toolColumnsRef = useRef<HTMLDivElement>(null);
  const participantsPaneRef = useRef<HTMLDivElement>(null);
  const participantInputSlotRef = useRef<HTMLDivElement>(null);
  const advancedOptionsPaneRef = useRef<HTMLDivElement>(null);
  const lastNotifiedSolverErrorRef = useRef<string | null>(null);
  const toolDividerDragStateRef = useRef<ToolDividerDragState | null>(null);
  const [resultFormat, setResultFormat] = useState<ToolResultFormat>('cards');
  const [copiedFormat, setCopiedFormat] = useState<ToolResultFormat | null>(null);
  const [toolSplitRatio, setToolSplitRatio] = useLocalStorageState<number>(`${EMBEDDABLE_TOOL_RESIZE_STORAGE_KEY}:${pageKey}`, 0.5);
  const [toolColumnsWidth, setToolColumnsWidth] = useState(0);
  const [isDraggingToolDivider, setIsDraggingToolDivider] = useState(false);
  const [participantInputAutoOuterHeight, setParticipantInputAutoOuterHeight] = useState<number | null>(null);
  const participantInputLayout = useLayoutAutoResizeSuppression('participants');
  const telemetryAttribution = useMemo(
    () =>
      readTelemetryAttributionFromSearch({
        search: location.search,
        fallbackLandingSlug: pageKey,
      }),
    [location.search, pageKey],
  );

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
  const canResizeToolColumns = toolColumnsWidth >= EMBEDDABLE_TOOL_RESIZE_MIN_WIDTH;
  const resolvedToolSplitRatio = Math.min(0.72, Math.max(0.4, toolSplitRatio));
  const resizableTrackWidth = Math.max(
    0,
    toolColumnsWidth - EMBEDDABLE_TOOL_RESIZE_HANDLE_WIDTH - (EMBEDDABLE_TOOL_COLUMN_GAP * EMBEDDABLE_TOOL_RESIZE_GAP_COUNT),
  );
  const leftColumnWidth = canResizeToolColumns
    ? Math.min(
        Math.max(resizableTrackWidth * resolvedToolSplitRatio, EMBEDDABLE_TOOL_LEFT_MIN_WIDTH),
        Math.max(EMBEDDABLE_TOOL_LEFT_MIN_WIDTH, resizableTrackWidth - EMBEDDABLE_TOOL_RIGHT_MIN_WIDTH),
      )
    : null;
  const rightColumnWidth = canResizeToolColumns && leftColumnWidth != null
    ? Math.max(EMBEDDABLE_TOOL_RIGHT_MIN_WIDTH, resizableTrackWidth - leftColumnWidth)
    : null;
  const toolColumnsStyle = canResizeToolColumns && leftColumnWidth != null && rightColumnWidth != null
    ? {
        gridTemplateColumns: `minmax(0, ${leftColumnWidth}px) ${EMBEDDABLE_TOOL_RESIZE_HANDLE_WIDTH}px minmax(${EMBEDDABLE_TOOL_RIGHT_MIN_WIDTH}px, ${rightColumnWidth}px)`,
      }
    : undefined;
  const setParticipantInputSlotRef = useCallback((node: HTMLDivElement | null) => {
    participantInputSlotRef.current = node;
  }, []);

  useEffect(() => {
    setParticipantInputAutoOuterHeight(null);
  }, [config.locale, pageKey]);

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
    if (participantInputLayout.autoResizeSuppressed) {
      setParticipantInputAutoOuterHeight((previous) => (previous == null ? previous : null));
      return undefined;
    }

    let animationFrameId = 0;
    const timeoutIds: number[] = [];

    const measure = () => {
      const leftPane = participantsPaneRef.current;
      const participantInput = participantInputSlotRef.current;
      const rightPane = advancedOptionsPaneRef.current;
      if (!leftPane || !participantInput || !rightPane) {
        return;
      }

      const leftRect = leftPane.getBoundingClientRect();
      const inputRect = participantInput.getBoundingClientRect();
      const rightRect = rightPane.getBoundingClientRect();
      if (leftRect.width <= 0 || inputRect.width <= 0 || inputRect.height <= 0 || rightRect.width <= 0) {
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
      const nextOuterHeight = Math.min(Math.max(0, inputRect.height + heightDelta), inputRect.width);
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
  }, [canResizeToolColumns, config.locale, pageKey, participantInputLayout.autoResizeSuppressed]);

  useEffect(() => {
    if (!isDraggingToolDivider || !canResizeToolColumns) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = toolDividerDragStateRef.current;
      if (!dragState) {
        return;
      }

      const nextLeftWidth = Math.min(
        Math.max(dragState.startLeftWidth + (event.clientX - dragState.startX), EMBEDDABLE_TOOL_LEFT_MIN_WIDTH),
        Math.max(EMBEDDABLE_TOOL_LEFT_MIN_WIDTH, dragState.trackWidth - EMBEDDABLE_TOOL_RIGHT_MIN_WIDTH),
      );
      const nextRatio = nextLeftWidth / Math.max(1, dragState.trackWidth);
      setToolSplitRatio(Math.min(0.72, Math.max(0.4, nextRatio)));
    };

    const stopDragging = () => {
      toolDividerDragStateRef.current = null;
      setIsDraggingToolDivider(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [canResizeToolColumns, isDraggingToolDivider, setToolSplitRatio]);

  const navigateToAdvancedWorkspace = useCallback((target: 'results' | 'people') => {
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
  }, [config.hero.title, controller, loadWorkspaceAsNewScenario, navigate, telemetryAttribution, workspacePayload]);

  const openAdvancedWorkspace = useCallback((target?: 'results' | 'people') => {
    const resolvedTarget = target ?? (controller.result ? 'results' : 'people');

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

    navigateToAdvancedWorkspace(resolvedTarget);
  }, [controller.result, navigateToAdvancedWorkspace, telemetryAttribution]);

  useImperativeHandle(ref, () => ({
    hasResult: Boolean(controller.result),
    openAdvancedWorkspace,
  }), [controller.result, openAdvancedWorkspace]);

  const handleLandingExampleClick = useCallback((exampleKey: Parameters<typeof controller.loadLandingGuideExample>[0]) => {
    controller.loadLandingGuideExample(exampleKey);
    trackLandingEvent('landing_example_loaded', {
      pageKey: config.key,
      locale: config.locale,
      exampleKey,
    });
  }, [config.key, config.locale, controller]);

  const handleClearAllInputs = useCallback(() => {
    if (controller.hasAnyInputData && !window.confirm(ui.quickSetup.clearAllConfirmMessage)) {
      return;
    }

    controller.clearDraft();
  }, [controller, ui.quickSetup.clearAllConfirmMessage]);

  return (
    <GroupTool
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
      participantInputAutoResizeSuppressed={participantInputLayout.autoResizeSuppressed}
      autoFocusParticipantInput={autoFocusParticipantInput}
      onParticipantInputManualLayoutAdjustment={participantInputLayout.recordManualLayoutAdjustment}
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
      onLandingExampleClick={handleLandingExampleClick}
      onOpenAdvancedWorkspace={openAdvancedWorkspace}
      onStartToolDividerDrag={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);

        const leftPane = event.currentTarget.previousElementSibling as HTMLDivElement | null;
        const bounds = toolColumnsRef.current?.getBoundingClientRect();
        const measuredLeftWidth = leftPane?.getBoundingClientRect().width;
        const trackWidth = Math.max(
          1,
          (bounds?.width ?? toolColumnsWidth) - EMBEDDABLE_TOOL_RESIZE_HANDLE_WIDTH - (EMBEDDABLE_TOOL_COLUMN_GAP * EMBEDDABLE_TOOL_RESIZE_GAP_COUNT),
        );

        toolDividerDragStateRef.current = {
          startX: event.clientX,
          startLeftWidth: measuredLeftWidth ?? leftColumnWidth ?? (trackWidth * resolvedToolSplitRatio),
          trackWidth,
        };
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
  );
});
