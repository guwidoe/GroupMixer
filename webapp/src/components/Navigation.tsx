import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ScrollArea } from './ScrollArea';
import { useAppStore } from '../store';

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
    label: 'Results',
    description: 'View and manage all saved results',
  },
  {
    id: 'results',
    path: '/app/results',
    label: 'Result Details',
    description: 'Inspect a single result in depth',
  },
  {
    id: 'editor',
    path: '/app/editor',
    label: 'Manual Editor',
    description: 'Manually adjust assignments with live feedback',
  },
] as const;

function resolveWorkflowIndex(pathname: string) {
  return WORKFLOW_TABS.findIndex((tab) => pathname.startsWith(tab.path));
}

export function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const unsaved = useAppStore((s) => s.manualEditorUnsaved);
  const leaveHook = useAppStore((s) => s.manualEditorLeaveHook);
  const activeIndex = resolveWorkflowIndex(location.pathname);

  return (
    <div
      className="sticky top-0 z-30 border-b"
      style={{
        backgroundColor: 'var(--header-surface)',
        borderColor: 'var(--border-primary)',
      }}
    >
      <nav aria-label="Primary app navigation">
        <ScrollArea orientation="horizontal" className="px-4 py-2.5">
          <div className="mx-auto flex min-w-max justify-start md:justify-center">
            <div
              className="inline-flex items-center rounded-[1.35rem] border p-1.5"
              style={{
                backgroundColor: 'var(--header-rail-surface)',
                borderColor: 'var(--border-primary)',
                boxShadow: 'var(--shadow)',
              }}
            >
              {WORKFLOW_TABS.map((tab, index) => {
                const isActive = activeIndex === index;
                const isPast = activeIndex > index;
                const isFuture = !isActive && !isPast;

                return (
                  <div key={tab.id} className="flex items-center">
                    <NavLink
                      to={tab.path}
                      onClick={(e) => {
                        if (unsaved && location.pathname.startsWith('/app/editor') && tab.path !== '/app/editor') {
                          e.preventDefault();
                          if (leaveHook) {
                            leaveHook(tab.path);
                          } else {
                            navigate(tab.path);
                          }
                        }
                      }}
                      className="group inline-flex h-10 shrink-0 items-center gap-2.5 rounded-[1rem] px-3.5 text-sm font-medium transition-all duration-150 hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)] focus-visible:outline-none md:px-4"
                      style={{
                        color: isActive
                          ? 'var(--text-primary)'
                          : isPast
                            ? 'var(--text-primary)'
                            : 'var(--text-secondary)',
                        backgroundColor: isActive ? 'var(--bg-primary)' : 'transparent',
                        boxShadow: isActive
                          ? '0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px color-mix(in srgb, var(--color-accent) 20%, var(--border-primary))'
                          : '0 0 0 0 transparent',
                        opacity: isFuture ? 0.9 : 1,
                      }}
                      title={tab.description}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span
                        className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold transition-colors"
                        style={{
                          backgroundColor: isActive
                            ? 'color-mix(in srgb, var(--color-accent) 18%, var(--bg-primary))'
                            : isPast
                              ? 'color-mix(in srgb, var(--color-accent) 14%, var(--bg-secondary))'
                              : 'var(--bg-primary)',
                          color: isActive || isPast ? 'var(--color-accent)' : 'var(--text-tertiary)',
                          border: isActive || isPast
                            ? '1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)'
                            : '1px solid var(--border-primary)',
                        }}
                      >
                        {index + 1}
                      </span>
                      <span className="truncate">{tab.label}</span>
                    </NavLink>

                    {index < WORKFLOW_TABS.length - 1 && (
                      <div
                        className="mx-1 h-px w-4 shrink-0 md:w-5"
                        style={{
                          backgroundColor: isPast
                            ? 'color-mix(in srgb, var(--color-accent) 38%, var(--border-primary))'
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
      </nav>
    </div>
  );
}
