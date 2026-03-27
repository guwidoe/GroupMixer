import { FolderOpen } from 'lucide-react';
import { useAppStore } from '../store';
import { AppHeader } from './AppHeader';

export function Header() {
  const { currentScenarioId, savedScenarios, setShowScenarioManager } = useAppStore();
  const currentScenarioName = currentScenarioId ? savedScenarios[currentScenarioId]?.name : null;

  return (
    <AppHeader
      renderDesktopActions={() =>
        !currentScenarioName ? (
          <button
            onClick={() => setShowScenarioManager(true)}
            className="btn-secondary flex items-center space-x-2 w-full sm:w-auto justify-center sm:justify-start"
            title="Manage scenarios"
          >
            <FolderOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Manage Scenarios</span>
            <span className="sm:hidden">Manage</span>
          </button>
        ) : (
          <div
            className="hidden sm:flex items-center space-x-2 text-sm p-2 rounded-md"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            <FolderOpen className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
            <span className="hidden md:inline">
              Current: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{currentScenarioName}</span>
            </span>
            <button
              onClick={() => setShowScenarioManager(true)}
              className="ml-1 text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: 'var(--color-accent)' }}
            >
              (Manage)
            </button>
          </div>
        )
      }
      renderMobileActions={({ closeMobileMenu }) =>
        !currentScenarioName ? (
          <button
            onClick={() => {
              setShowScenarioManager(true);
              closeMobileMenu();
            }}
            className="btn-secondary flex items-center space-x-2 w-full justify-start"
            title="Manage scenarios"
          >
            <FolderOpen className="h-4 w-4" />
            <span>Manage Scenarios</span>
          </button>
        ) : (
          <div
            className="flex items-center space-x-2 text-sm p-2 rounded-md"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            <FolderOpen className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
            <span>
              Current: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{currentScenarioName}</span>
            </span>
            <button
              onClick={() => {
                setShowScenarioManager(true);
                closeMobileMenu();
              }}
              className="ml-1 text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: 'var(--color-accent)' }}
            >
              (Manage)
            </button>
          </div>
        )
      }
    />
  );
}
