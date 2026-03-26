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
      className="sticky top-0 z-30 border-b"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-primary)',
      }}
    >
      <nav aria-label="Primary app navigation">
        <div className="flex min-w-0 gap-2 overflow-x-auto">
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
                  `inline-flex min-w-fit items-center justify-center gap-2 border-r px-5 py-4 text-xs font-medium transition-colors sm:px-6 sm:text-sm ${
                    isActive ? '' : ''
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  backgroundColor: isActive ? 'var(--bg-secondary)' : 'transparent',
                  borderRightColor: 'var(--border-primary)',
                  boxShadow: isActive ? 'inset 0 -2px 0 var(--color-accent)' : 'none',
                })}
                title={tab.description}
              >
                <Icon className="h-4 w-4 flex-shrink-0" style={{ color: 'currentColor' }} />
                <span className="whitespace-nowrap">{tab.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
