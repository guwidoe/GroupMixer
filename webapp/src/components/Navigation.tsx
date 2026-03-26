import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Settings, Play, BarChart3, History, Edit3 } from 'lucide-react';

export function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const unsaved = useAppStore((s) => s.manualEditorUnsaved);
  const leaveHook = useAppStore((s) => s.manualEditorLeaveHook);

  const tabs = [
    {
      id: 'problem',
      path: '/app/problem',
      label: 'Problem Setup',
      icon: Settings,
      description: 'Configure people, sessions, and constraints',
    },
    {
      id: 'solver',
      path: '/app/solver',
      label: 'Solver',
      icon: Play,
      description: 'Run the optimization algorithm',
    },
    {
      id: 'manage',
      path: '/app/history',
      label: 'Results',
      icon: History,
      description: 'View and manage all saved results',
    },
    {
      id: 'results',
      path: '/app/results',
      label: 'Result Details',
      icon: BarChart3,
      description: 'Inspect a single result in depth',
    },
    {
      id: 'editor',
      path: '/app/editor',
      label: 'Manual Editor',
      icon: Edit3,
      description: 'Manually adjust assignments with live feedback',
    },
  ];

  return (
    <div
      className="sticky top-0 z-30 -mx-4 border-b px-4 backdrop-blur"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 92%, transparent)',
        borderColor: 'var(--border-primary)',
      }}
    >
      <nav aria-label="Primary app navigation">
        <div className="flex min-w-0 gap-1 overflow-x-auto py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;

            return (
              <NavLink
                key={tab.id}
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
                  `inline-flex min-w-fit items-center justify-center gap-2 rounded-md border-b-2 px-3 py-3 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
                    isActive ? '' : 'hover:bg-[var(--bg-primary)]/50'
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive ? 'var(--color-accent)' : 'var(--text-secondary)',
                  borderBottomColor: isActive ? 'var(--color-accent)' : 'transparent',
                })}
                title={tab.description}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="whitespace-nowrap">{tab.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
