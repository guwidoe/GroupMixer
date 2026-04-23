/* eslint-disable react/no-multi-comp */
import { useMemo, useState, type MouseEvent } from 'react';
import { LoaderCircle, Play } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ScrollArea } from './ScrollArea';
import { useAppStore, useScenarioDocumentHistory } from '../store';
import { ScenarioDocumentHistoryBar } from './ScenarioEditor/ScenarioDocumentHistoryBar';
import { getScenarioSetupPath } from './ScenarioEditor/navigation/scenarioSetupNav';
import { useSolverWorkspaceRunController } from './SolverWorkspace/useSolverWorkspaceRunController';

type WorkflowTab = {
  kind: 'tab';
  id: 'scenario' | 'solver' | 'results' | 'editor';
  path: string;
  label: string;
  shortLabel?: string;
  description: string;
};

type WorkflowAction = {
  kind: 'action';
  id: 'generate';
  label: string;
  description: string;
};

type WorkflowItem = WorkflowTab | WorkflowAction;
type NavigationVariant = 'standalone' | 'embedded' | 'mobile-menu';

const EMBEDDED_SCENARIO_HISTORY_SLOT_CLASS = 'w-[5.25rem] shrink-0';

const ADVANCED_WORKFLOW_TABS: WorkflowTab[] = [
  {
    kind: 'tab',
    id: 'scenario',
    path: '/app/scenario',
    label: 'Setup',
    description: 'Configure people, sessions, and constraints',
  },
  {
    kind: 'tab',
    id: 'solver',
    path: '/app/solver',
    label: 'Solver',
    description: 'Run the optimization algorithm',
  },
  {
    kind: 'tab',
    id: 'results',
    path: '/app/results',
    label: 'Results',
    shortLabel: 'Results',
    description: 'Inspect the active result in detail',
  },
  {
    kind: 'tab',
    id: 'editor',
    path: '/app/editor',
    label: 'Manual Editor',
    shortLabel: 'Editor',
    description: 'Manually adjust assignments with live feedback',
  },
];

const BASIC_WORKFLOW_ITEMS: WorkflowItem[] = [
  ADVANCED_WORKFLOW_TABS[0],
  {
    kind: 'action',
    id: 'generate',
    label: 'Generate Groups',
    description: 'Run the recommended solver flow directly from the workflow bar',
  },
  ADVANCED_WORKFLOW_TABS[2],
];

interface NavigationProps {
  variant?: NavigationVariant;
  closeMobileMenu?: () => void;
}

function resolveActiveWorkflowTabId(pathname: string, advancedModeEnabled: boolean): WorkflowTab['id'] | null {
  if (pathname.startsWith('/app/scenario/')) {
    return 'scenario';
  }

  if (pathname.startsWith('/app/history') || pathname.startsWith('/app/results')) {
    return 'results';
  }

  if (pathname.startsWith('/app/editor')) {
    return 'editor';
  }

  if (advancedModeEnabled && pathname.startsWith('/app/solver')) {
    return 'solver';
  }

  return null;
}

function GenerateGroupsWorkflowAction({
  variant,
  closeMobileMenu,
}: {
  variant: NavigationVariant;
  closeMobileMenu?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [hovered, setHovered] = useState(false);
  const manualEditorUnsaved = useAppStore((state) => state.manualEditorUnsaved);
  const setupGridUnsaved = useAppStore((state) => state.setupGridUnsaved);
  const setupGridLeaveHook = useAppStore((state) => state.setupGridLeaveHook);
  const controller = useSolverWorkspaceRunController();

  const generating = controller.solverState.isRunning;
  const blockedByManualDraft = manualEditorUnsaved && location.pathname.startsWith('/app/editor');
  const disabled = generating || !controller.scenario || blockedByManualDraft;
  const label = generating ? 'Generating…' : 'Generate Groups';
  const title = blockedByManualDraft
    ? 'Save or discard manual editor changes before generating a new result.'
    : controller.scenario
      ? 'Generate groups with the recommended solver workflow.'
      : 'Add some setup data before generating groups.';

  const runGenerateGroups = async () => {
    const previousState = useAppStore.getState();
    const previousResultId = previousState.currentResultId;
    const previousSolution = previousState.solution;
    const previousCompletion = previousState.solverState.isComplete;

    closeMobileMenu?.();
    await controller.handleStartSolver(true);

    const nextState = useAppStore.getState();
    const solvedSuccessfully = Boolean(
      nextState.currentResultId
      && nextState.solution
      && nextState.solverState.isComplete
      && !nextState.solverState.isRunning
      && (
        nextState.currentResultId !== previousResultId
        || nextState.solution !== previousSolution
        || !previousCompletion
      )
    );

    if (solvedSuccessfully) {
      navigate('/app/results');
    }
  };

  const handleClick = () => {
    if (disabled) {
      return;
    }

    if (setupGridUnsaved && location.pathname.startsWith('/app/scenario') && setupGridLeaveHook) {
      setupGridLeaveHook(() => {
        void runGenerateGroups();
      });
      return;
    }

    void runGenerateGroups();
  };

  if (variant === 'mobile-menu') {
    return (
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        disabled={disabled}
        title={title}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          backgroundColor: hovered && !disabled
            ? 'color-mix(in srgb, var(--color-accent) 20%, var(--bg-primary))'
            : 'color-mix(in srgb, var(--color-accent) 14%, var(--bg-primary))',
          color: 'var(--text-primary)',
          border: hovered && !disabled
            ? '1px solid color-mix(in srgb, var(--color-accent) 32%, var(--border-primary))'
            : '1px solid color-mix(in srgb, var(--color-accent) 22%, var(--border-primary))',
          transform: hovered && !disabled ? 'translateY(-1px)' : 'translateY(0)',
          boxShadow: hovered && !disabled
            ? '0 8px 18px color-mix(in srgb, var(--color-accent) 12%, transparent)'
            : 'none',
        }}
      >
        <span
          className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-accent) 18%, var(--bg-primary))',
            color: 'var(--color-accent)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
          }}
          aria-hidden="true"
        >
          {generating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0">
          <div className="truncate">{label}</div>
          <div className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {generating ? 'Solver is running…' : 'Use the recommended solver flow'}
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      title={title}
      className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-[0.9rem] px-3 text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 md:px-3.5"
      style={{
        color: 'var(--text-primary)',
        backgroundColor: hovered && !disabled
          ? 'color-mix(in srgb, var(--color-accent) 22%, var(--bg-primary))'
          : 'color-mix(in srgb, var(--color-accent) 14%, var(--bg-primary))',
        boxShadow: hovered && !disabled
          ? '0 10px 24px color-mix(in srgb, var(--color-accent) 14%, transparent), 0 0 0 1px color-mix(in srgb, var(--color-accent) 30%, var(--border-primary))'
          : '0 0 0 1px color-mix(in srgb, var(--color-accent) 22%, var(--border-primary))',
        transform: hovered && !disabled ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      {generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      <span>{label}</span>
    </button>
  );
}

export function Navigation({ variant = 'standalone', closeMobileMenu }: NavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const unsaved = useAppStore((s) => s.manualEditorUnsaved);
  const leaveHook = useAppStore((s) => s.manualEditorLeaveHook);
  const lastScenarioSetupSection = useAppStore((s) => s.ui.lastScenarioSetupSection);
  const advancedModeEnabled = useAppStore((s) => s.ui.advancedModeEnabled ?? false);
  const undoScenarioDocument = useAppStore((state) => state.undoScenarioDocument);
  const redoScenarioDocument = useAppStore((state) => state.redoScenarioDocument);
  const scenarioHistoryPastCount = useScenarioDocumentHistory((state) => state.pastStates.length);
  const scenarioHistoryFutureCount = useScenarioDocumentHistory((state) => state.futureStates.length);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);

  const workflowItems = useMemo(
    () => (advancedModeEnabled ? ADVANCED_WORKFLOW_TABS : BASIC_WORKFLOW_ITEMS),
    [advancedModeEnabled],
  );
  const workflowTabs = useMemo(
    () => workflowItems.filter((item): item is WorkflowTab => item.kind === 'tab'),
    [workflowItems],
  );
  const activeTabId = resolveActiveWorkflowTabId(location.pathname, advancedModeEnabled);
  const activeTabOrder = activeTabId ? workflowTabs.findIndex((tab) => tab.id === activeTabId) : -1;
  const showScenarioHistoryControls = activeTabId === 'scenario' && variant !== 'standalone';

  const getTabPath = (tabId: WorkflowTab['id'], path: string) => (tabId === 'scenario'
    ? getScenarioSetupPath(lastScenarioSetupSection)
    : path);

  const handleNavigate = (event: MouseEvent, path: string) => {
    const { setupGridUnsaved, setupGridLeaveHook } = useAppStore.getState();

    if (unsaved && location.pathname.startsWith('/app/editor') && path !== '/app/editor') {
      event.preventDefault();
      if (leaveHook) {
        leaveHook(path);
      } else {
        navigate(path);
      }
      return;
    }

    if (setupGridUnsaved && location.pathname.startsWith('/app/scenario') && path !== location.pathname) {
      event.preventDefault();
      if (setupGridLeaveHook) {
        setupGridLeaveHook(() => {
          closeMobileMenu?.();
          navigate(path);
        });
      } else {
        navigate(path);
      }
      return;
    }

    closeMobileMenu?.();
  };

  const scenarioHistoryControls = showScenarioHistoryControls ? (
    <ScenarioDocumentHistoryBar
      canUndo={scenarioHistoryPastCount > 0}
      canRedo={scenarioHistoryFutureCount > 0}
      onUndo={undoScenarioDocument}
      onRedo={redoScenarioDocument}
    />
  ) : null;

  const content = variant === 'mobile-menu' ? (
    <div className="space-y-1.5">
      <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
        Workflow
      </div>
      {showScenarioHistoryControls ? (
        <div className="px-1 pb-1">
          <ScenarioDocumentHistoryBar
            canUndo={scenarioHistoryPastCount > 0}
            canRedo={scenarioHistoryFutureCount > 0}
            onUndo={() => {
              undoScenarioDocument();
              closeMobileMenu?.();
            }}
            onRedo={() => {
              redoScenarioDocument();
              closeMobileMenu?.();
            }}
          />
        </div>
      ) : null}
      {workflowItems.map((item) => {
        if (item.kind === 'action') {
          return <GenerateGroupsWorkflowAction key={item.id} variant={variant} closeMobileMenu={closeMobileMenu} />;
        }

        const tabPath = getTabPath(item.id, item.path);
        const tabOrder = workflowTabs.findIndex((tab) => tab.id === item.id);
        const isActive = activeTabId === item.id;
        const isPast = activeTabOrder > tabOrder;
        const isHovered = hoveredTabId === item.id;

        return (
          <NavLink
            key={item.id}
            to={tabPath}
            onClick={(event) => handleNavigate(event, tabPath)}
            onMouseEnter={() => setHoveredTabId(item.id)}
            onMouseLeave={() => setHoveredTabId((current) => (current === item.id ? null : current))}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150"
            style={{
              backgroundColor: isActive
                ? 'var(--bg-primary)'
                : isHovered
                  ? 'color-mix(in srgb, var(--bg-primary) 72%, transparent)'
                  : 'transparent',
              color: isActive || isPast || isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
            aria-current={isActive ? 'page' : undefined}
            title={item.description}
          >
            <span
              className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold"
              style={{
                backgroundColor: isActive || isPast
                  ? 'color-mix(in srgb, var(--color-accent) 18%, var(--bg-primary))'
                  : 'var(--bg-primary)',
                color: isActive || isPast ? 'var(--color-accent)' : 'var(--text-tertiary)',
                border: isActive || isPast
                  ? '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)'
                  : '1px solid var(--border-primary)',
              }}
            >
              {tabOrder + 1}
            </span>
            <div className="min-w-0">
              <div className="truncate">{item.label}</div>
              <div className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {item.description}
              </div>
            </div>
          </NavLink>
        );
      })}
    </div>
  ) : (
    <div
      className={variant === 'embedded'
        ? 'grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)_5.25rem] items-center gap-2'
        : ''}
    >
      {variant === 'embedded' ? <div className={EMBEDDED_SCENARIO_HISTORY_SLOT_CLASS} aria-hidden="true" /> : null}
      <ScrollArea orientation="horizontal" className={variant === 'embedded' ? 'min-w-0' : 'px-4 py-2'}>
        <div className={variant === 'embedded' ? 'flex min-w-max items-center justify-center' : 'mx-auto flex min-w-max items-center justify-center'}>
          <div
            className="inline-flex items-center rounded-[1.1rem] border px-1.5 py-1"
            style={{
              backgroundColor: 'var(--header-rail-surface)',
              borderColor: 'var(--border-primary)',
              boxShadow: variant === 'embedded' ? 'none' : 'var(--shadow)',
            }}
          >
          {workflowItems.map((item, index) => {
            const nextItemExists = index < workflowItems.length - 1;

            if (item.kind === 'action') {
              return (
                <div key={item.id} className="flex items-center">
                  <GenerateGroupsWorkflowAction variant={variant} closeMobileMenu={closeMobileMenu} />
                  {nextItemExists ? (
                    <div
                      className="mx-1 h-px w-3.5 shrink-0 md:w-4"
                      style={{ backgroundColor: 'var(--border-primary)' }}
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              );
            }

            const tabPath = getTabPath(item.id, item.path);
            const tabOrder = workflowTabs.findIndex((tab) => tab.id === item.id);
            const isActive = activeTabId === item.id;
            const isPast = activeTabOrder > tabOrder;
            const isFuture = !isActive && !isPast;
            const isHovered = hoveredTabId === item.id;

            return (
              <div key={item.id} className="flex items-center">
                <NavLink
                  to={tabPath}
                  onClick={(event) => handleNavigate(event, tabPath)}
                  onMouseEnter={() => setHoveredTabId(item.id)}
                  onMouseLeave={() => setHoveredTabId((current) => (current === item.id ? null : current))}
                  className="group inline-flex h-9 shrink-0 items-center gap-2 rounded-[0.9rem] px-3 text-sm font-medium transition-colors duration-150 md:px-3.5"
                  style={{
                    color: isActive || isPast || isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
                    backgroundColor: isActive
                      ? 'var(--bg-primary)'
                      : isHovered
                        ? 'color-mix(in srgb, var(--bg-primary) 72%, transparent)'
                        : 'transparent',
                    boxShadow: isActive
                      ? '0 0 0 1px color-mix(in srgb, var(--color-accent) 18%, var(--border-primary))'
                      : 'none',
                    opacity: isFuture && !isHovered ? 0.9 : 1,
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  title={item.description}
                >
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold"
                    style={{
                      backgroundColor: isActive
                        ? 'color-mix(in srgb, var(--color-accent) 18%, var(--bg-primary))'
                        : isPast
                          ? 'color-mix(in srgb, var(--color-accent) 14%, var(--bg-secondary))'
                          : 'var(--bg-primary)',
                      color: isActive || isPast ? 'var(--color-accent)' : 'var(--text-tertiary)',
                      border: isActive || isPast
                        ? '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)'
                        : '1px solid var(--border-primary)',
                    }}
                  >
                    {tabOrder + 1}
                  </span>
                  <span className="truncate">{variant === 'embedded' ? (item.shortLabel ?? item.label) : item.label}</span>
                </NavLink>

                {nextItemExists ? (
                  <div
                    className="mx-1 h-px w-3.5 shrink-0 md:w-4"
                    style={{
                      backgroundColor: isPast
                        ? 'color-mix(in srgb, var(--color-accent) 34%, var(--border-primary))'
                        : 'var(--border-primary)',
                    }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            );
          })}
          </div>
        </div>
      </ScrollArea>
      {variant === 'embedded' ? (
        <div className={`${EMBEDDED_SCENARIO_HISTORY_SLOT_CLASS} flex items-center justify-end`}>
          {scenarioHistoryControls}
        </div>
      ) : null}
    </div>
  );

  if (variant === 'standalone') {
    return (
      <div
        className="sticky top-0 z-30 border-b"
        style={{
          backgroundColor: 'var(--header-surface)',
          borderColor: 'var(--border-primary)',
        }}
      >
        <nav aria-label="Primary app navigation">{content}</nav>
      </div>
    );
  }

  return <nav aria-label="Primary app navigation">{content}</nav>;
}
