import { useState } from 'react';
import { FolderOpen, Save, Upload } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../store';
import { AppHeader } from './AppHeader';
import { DemoDataWarningModal } from './modals/DemoDataWarningModal';
import { DemoDataDropdown } from './ScenarioEditor/DemoDataDropdown';

function SetupHeaderActions({ closeMobileMenu }: { closeMobileMenu?: () => void }) {
  const {
    scenario,
    currentScenarioId,
    savedScenarios,
    setShowScenarioManager,
    saveScenario,
    loadDemoCase,
    loadDemoCaseOverwrite,
    loadDemoCaseNewScenario,
  } = useAppStore();
  const [showDemoWarningModal, setShowDemoWarningModal] = useState(false);
  const [pendingDemoCaseId, setPendingDemoCaseId] = useState<string | null>(null);
  const [pendingDemoCaseName, setPendingDemoCaseName] = useState<string | null>(null);

  const currentScenarioName = currentScenarioId
    ? savedScenarios[currentScenarioId]?.name ?? 'Untitled Scenario'
    : 'Untitled Scenario';

  const closeMenuIfNeeded = () => {
    closeMobileMenu?.();
  };

  const handleLoadScenario = () => {
    setShowScenarioManager(true);
    closeMenuIfNeeded();
  };

  const handleSaveScenario = () => {
    saveScenario(currentScenarioName);
    closeMenuIfNeeded();
  };

  const handleDemoCaseClick = (demoCaseId: string, demoCaseName: string) => {
    const hasContent =
      scenario &&
      (scenario.people.length > 0 || scenario.groups.length > 0 || scenario.constraints.length > 0);

    if (hasContent) {
      setPendingDemoCaseId(demoCaseId);
      setPendingDemoCaseName(demoCaseName);
      setShowDemoWarningModal(true);
      return;
    }

    loadDemoCase(demoCaseId);
    closeMenuIfNeeded();
  };

  const handleDemoOverwrite = () => {
    if (pendingDemoCaseId) {
      loadDemoCaseOverwrite(pendingDemoCaseId);
    }
    setShowDemoWarningModal(false);
    setPendingDemoCaseId(null);
    setPendingDemoCaseName(null);
    closeMenuIfNeeded();
  };

  const handleDemoLoadNew = () => {
    if (pendingDemoCaseId) {
      loadDemoCaseNewScenario(pendingDemoCaseId);
    }
    setShowDemoWarningModal(false);
    setPendingDemoCaseId(null);
    setPendingDemoCaseName(null);
    closeMenuIfNeeded();
  };

  const handleDemoCancel = () => {
    setShowDemoWarningModal(false);
    setPendingDemoCaseId(null);
    setPendingDemoCaseName(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
        <button
          onClick={handleLoadScenario}
          className="btn-secondary flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start"
          title="Load scenario"
        >
          <Upload className="h-4 w-4" />
          <span>Load</span>
        </button>
        <button
          onClick={handleSaveScenario}
          className="btn-secondary flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start"
          title="Save scenario"
        >
          <Save className="h-4 w-4" />
          <span>Save</span>
        </button>
        <DemoDataDropdown onDemoCaseClick={handleDemoCaseClick} />
      </div>

      <DemoDataWarningModal
        isOpen={showDemoWarningModal}
        onClose={handleDemoCancel}
        onOverwrite={handleDemoOverwrite}
        onLoadNew={handleDemoLoadNew}
        demoCaseName={pendingDemoCaseName || 'Demo Case'}
      />
    </>
  );
}

export function Header() {
  const location = useLocation();
  const { currentScenarioId, savedScenarios, setShowScenarioManager } = useAppStore();
  const currentScenarioName = currentScenarioId ? savedScenarios[currentScenarioId]?.name : null;
  const isScenarioSetupRoute = location.pathname.startsWith('/app/scenario');

  return (
    <AppHeader
      renderDesktopActions={() =>
        isScenarioSetupRoute ? (
          <SetupHeaderActions />
        ) : !currentScenarioName ? (
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
        isScenarioSetupRoute ? (
          <SetupHeaderActions closeMobileMenu={closeMobileMenu} />
        ) : !currentScenarioName ? (
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
