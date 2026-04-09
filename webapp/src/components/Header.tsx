import { useState } from 'react';
import { Save, Upload } from 'lucide-react';
import { useAppStore } from '../store';
import { AppHeader } from './AppHeader';
import { HEADER_ACTION_BUTTON_CLASS, HEADER_ACTION_GROUP_CLASS } from './headerActionStyles';
import { DemoDataWarningModal } from './modals/DemoDataWarningModal';
import { DemoDataDropdown } from './ScenarioEditor/DemoDataDropdown';

function WorkspaceHeaderActions({ closeMobileMenu }: { closeMobileMenu?: () => void }) {
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
      <div className={HEADER_ACTION_GROUP_CLASS}>
        <button
          onClick={handleLoadScenario}
          className={HEADER_ACTION_BUTTON_CLASS}
          title="Load scenario"
          style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
        >
          <Upload className="h-4 w-4" />
          <span>Load</span>
        </button>
        <button
          onClick={handleSaveScenario}
          className={HEADER_ACTION_BUTTON_CLASS}
          title="Save scenario"
          style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
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
  return (
    <AppHeader
      renderDesktopActions={() => <WorkspaceHeaderActions />}
      renderMobileActions={({ closeMobileMenu }) => <WorkspaceHeaderActions closeMobileMenu={closeMobileMenu} />}
    />
  );
}
