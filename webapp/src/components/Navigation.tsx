import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ScrollArea } from './ScrollArea';
import { useAppStore } from '../store';

export function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const unsaved = useAppStore((s) => s.manualEditorUnsaved);
  const leaveHook = useAppStore((s) => s.manualEditorLeaveHook);

  const tabs = [
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
  ];

  return (
    <div
      className="sticky top-0 z-30 border-b"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-primary)',
      }}
    >
      <nav aria-label="Primary app navigation">
        <ScrollArea orientation="horizontal" className="px-4 py-3">
          <div className="mx-auto flex min-w-max items-center justify-start gap-2 md:justify-center">
            {tabs.map((tab, index) => (
              <div key={tab.id} className="flex items-center gap-2">
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
                  className={({ isActive }) =>
                    `inline-flex h-11 w-40 shrink-0 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${
                      isActive ? '' : ''
                    }`
                  }
                  style={({ isActive }) => ({
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
                    borderColor: isActive ? 'var(--color-accent)' : 'var(--border-primary)',
                    boxShadow: isActive ? '0 0 0 1px color-mix(in srgb, var(--color-accent) 35%, transparent)' : 'none',
                  })}
                  title={tab.description}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    {index + 1}
                  </span>
                  <span className="truncate">{tab.label}</span>
                </NavLink>

                {index < tabs.length - 1 && (
                  <ChevronRight
                    className="hidden h-4 w-4 flex-shrink-0 md:block"
                    style={{ color: 'var(--text-tertiary)' }}
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </nav>
    </div>
  );
}
