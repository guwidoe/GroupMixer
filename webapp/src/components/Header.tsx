import { useState } from 'react';
import { Save, Upload } from 'lucide-react';
import { useAppStore } from '../store';
import { AppHeader } from './AppHeader';
import {
  HEADER_ACTION_DIVIDER_CLASS,
  HEADER_ACTION_GROUP_CLASS,
  HEADER_ACTION_TOOLBAR_CLASS,
} from './headerActionStyles';
import { DemoDataWarningModal } from './modals/DemoDataWarningModal';
import { DemoDataDropdown } from './ScenarioEditor/DemoDataDropdown';
import { Button } from './ui';

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
        <div
          className={HEADER_ACTION_TOOLBAR_CLASS}
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
        >
          <Button
            onClick={handleLoadScenario}
            variant="toolbar"
            size="md"
            title="Load scenario"
            leadingIcon={<Upload className="h-4 w-4" />}
          >
            <span>Load</span>
          </Button>
          <div
            className={HEADER_ACTION_DIVIDER_CLASS}
            style={{ backgroundColor: 'var(--border-primary)' }}
            aria-hidden="true"
          />
          <Button
            onClick={handleSaveScenario}
            variant="toolbar"
            size="md"
            title="Save scenario"
            leadingIcon={<Save className="h-4 w-4" />}
          >
            <span>Save</span>
          </Button>
          <div
            className={HEADER_ACTION_DIVIDER_CLASS}
            style={{ backgroundColor: 'var(--border-primary)' }}
            aria-hidden="true"
          />
          <DemoDataDropdown
            onDemoCaseClick={handleDemoCaseClick}
            variant="header"
            triggerLabel={closeMobileMenu ? 'Demo Data' : 'Demo'}
          />
        </div>
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
