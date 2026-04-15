import { useState, type MouseEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ScrollArea } from './ScrollArea';
import { useAppStore } from '../store';
import { getScenarioSetupPath } from './ScenarioEditor/navigation/scenarioSetupNav';

const WORKFLOW_TABS = [
  {
    id: 'scenario',
    path: '/app/scenario',
    label: 'Setup',
    description: 'Configure people, sessions, and constraints',
  },
  {
    id: 'solver',
    path: '/app/solver',
    label: 'Solver',
    description: 'Run the optimization algorithm',
  },
  {
    id: 'manage',
    path: '/app/history',
    label: 'Saved Results',
    description: 'Browse, compare, and manage saved results',
  },
  {
    id: 'results',
    path: '/app/results',
    label: 'Current Result',
    shortLabel: 'Current',
    description: 'Inspect the active result in detail',
  },
  {
    id: 'editor',
    path: '/app/editor',
    label: 'Manual Editor',
    shortLabel: 'Editor',
    description: 'Manually adjust assignments with live feedback',
  },
] as const;

type NavigationVariant = 'standalone' | 'embedded' | 'mobile-menu';

interface NavigationProps {
  variant?: NavigationVariant;
  closeMobileMenu?: () => void;
}

function resolveWorkflowIndex(pathname: string) {
  return WORKFLOW_TABS.findIndex((tab) => pathname.startsWith(tab.path));
}

export function Navigation({ variant = 'standalone', closeMobileMenu }: NavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const unsaved = useAppStore((s) => s.manualEditorUnsaved);
  const leaveHook = useAppStore((s) => s.manualEditorLeaveHook);
  const lastScenarioSetupSection = useAppStore((s) => s.ui.lastScenarioSetupSection);
  const activeIndex = resolveWorkflowIndex(location.pathname);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);

  const getTabPath = (tabId: (typeof WORKFLOW_TABS)[number]['id'], path: string) => (tabId === 'scenario'
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

  const content = variant === 'mobile-menu' ? (
    <div className="space-y-1.5">
      <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
        Workflow
      </div>
      {WORKFLOW_TABS.map((tab, index) => {
        const tabPath = getTabPath(tab.id, tab.path);
        const isActive = activeIndex === index;
        const isPast = activeIndex > index;
        const isHovered = hoveredTabId === tab.id;

        return (
          <NavLink
            key={tab.id}
            to={tabPath}
            onClick={(event) => handleNavigate(event, tabPath)}
            onMouseEnter={() => setHoveredTabId(tab.id)}
            onMouseLeave={() => setHoveredTabId((current) => (current === tab.id ? null : current))}
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
            title={tab.description}
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
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="truncate">{tab.label}</div>
              <div className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {tab.description}
              </div>
            </div>
          </NavLink>
        );
      })}
    </div>
  ) : (
    <ScrollArea orientation="horizontal" className={variant === 'embedded' ? 'w-full' : 'px-4 py-2'}>
      <div className={variant === 'embedded' ? 'flex min-w-max items-center justify-center' : 'mx-auto flex min-w-max items-center justify-center'}>
        <div
          className="inline-flex items-center rounded-[1.1rem] border px-1.5 py-1"
          style={{
            backgroundColor: 'var(--header-rail-surface)',
            borderColor: 'var(--border-primary)',
            boxShadow: variant === 'embedded' ? 'none' : 'var(--shadow)',
          }}
        >
          {WORKFLOW_TABS.map((tab, index) => {
            const tabPath = getTabPath(tab.id, tab.path);
            const isActive = activeIndex === index;
            const isPast = activeIndex > index;
            const isFuture = !isActive && !isPast;
            const isHovered = hoveredTabId === tab.id;

            return (
              <div key={tab.id} className="flex items-center">
                <NavLink
                  to={tabPath}
                  onClick={(event) => handleNavigate(event, tabPath)}
                  onMouseEnter={() => setHoveredTabId(tab.id)}
                  onMouseLeave={() => setHoveredTabId((current) => (current === tab.id ? null : current))}
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
                  title={tab.description}
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
                    {index + 1}
                  </span>
                  <span className="truncate">{variant === 'embedded' ? (tab.shortLabel ?? tab.label) : tab.label}</span>
                </NavLink>

                {index < WORKFLOW_TABS.length - 1 && (
                  <div
                    className="mx-1 h-px w-3.5 shrink-0 md:w-4"
                    style={{
                      backgroundColor: isPast
                        ? 'color-mix(in srgb, var(--color-accent) 34%, var(--border-primary))'
                        : 'var(--border-primary)',
                    }}
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
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
