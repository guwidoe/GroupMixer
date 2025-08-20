import { NavLink } from 'react-router-dom';
import { Settings, Play, BarChart3, History, Edit3 } from 'lucide-react';

export function Navigation() {


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
    <div className="space-y-4">
      {/* Navigation Tabs */}
      <nav className="rounded-lg border p-1 transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', boxShadow: 'var(--shadow)' }}>
        <div className="flex space-x-1 min-w-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;

            return (
              <NavLink
                key={tab.id}
                to={tab.path}
                className={({ isActive }) =>
                  `flex-1 flex items-center justify-center space-x-1 sm:space-x-2 px-1 sm:px-2 md:px-4 py-3 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 border min-w-0 ${
                    isActive
                      ? 'shadow-sm'
                      : 'border-transparent hover:bg-opacity-50'
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive ? 'var(--color-accent)' : 'var(--text-secondary)',
                  backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
                  borderColor: isActive ? 'var(--color-accent)' : 'transparent'
                })}
                title={tab.description}
              >
                <Icon className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="truncate text-xs sm:text-sm">{tab.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
} 