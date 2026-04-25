/* eslint-disable react/no-multi-comp */
import { useCallback, useRef, useState } from 'react';
import { Bug, Menu, Save, Upload } from 'lucide-react';
import { useAppStore } from '../store';
import { useOutsideClick } from '../hooks';
import { AppHeader } from './AppHeader';
import { HEADER_ACTION_GROUP_CLASS, HEADER_ACTION_TOOLBAR_CLASS } from './headerActionStyles';
import { DemoDataWarningModal } from './modals/DemoDataWarningModal';
import { GeneratedDemoDataModal } from './modals/GeneratedDemoDataModal';
import { DemoDataDropdown } from './ScenarioEditor/DemoDataDropdown';
import { ThemeToggle } from './ThemeToggle';
import { Button, getButtonClassName } from './ui';
import {
  createGeneratedDemoScenario,
  formatGeneratedDemoScenarioName,
  GENERATED_DEMO_CASE_ID,
} from '../services/demoScenarioGenerator';
import type { Scenario } from '../types';

const ISSUE_HREF = 'https://github.com/guwidoe/GroupMixer/issues';
const ISSUE_LABEL = 'Report an issue or suggest a feature';

interface WorkspaceActionHandlers {
  onLoadScenario: () => void;
  onSaveScenario: () => void;
  onDemoCaseClick: (demoCaseId: string, demoCaseName: string) => void;
  advancedModeEnabled: boolean;
  onSetAdvancedModeEnabled: (enabled: boolean) => void;
  showWorkflowGuideButton: boolean;
  onSetShowWorkflowGuideButton: (show: boolean) => void;
}

function PreferenceToggleMenuItem({
  checked,
  label,
  description,
  ariaLabel,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  ariaLabel: string;
  onChange: (enabled: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-all duration-150"
      title={description}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        color: 'var(--text-primary)',
        backgroundColor: hovered
          ? 'var(--bg-secondary)'
          : 'transparent',
      }}
    >
      <span className="min-w-0 text-sm font-medium">{label}</span>

      <span
        className="mt-0.5 inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-all duration-150"
        style={{
          backgroundColor: checked
            ? 'var(--color-accent)'
            : 'color-mix(in srgb, var(--border-primary) 72%, var(--bg-secondary))',
          boxShadow: hovered
            ? '0 0 0 1px color-mix(in srgb, var(--color-accent) 18%, var(--border-primary))'
            : 'none',
        }}
        aria-hidden="true"
      >
        <span
          className="h-5 w-5 rounded-full transition-all duration-150"
          style={{
            backgroundColor: 'var(--bg-primary)',
            boxShadow: '0 1px 3px color-mix(in srgb, black 20%, transparent)',
            transform: checked ? 'translateX(20px)' : 'translateX(0)',
          }}
        />
      </span>
    </button>
  );
}

function WorkspaceInlineActions({
  closeMobileMenu,
  handlers,
}: {
  closeMobileMenu?: () => void;
  handlers: WorkspaceActionHandlers;
}) {
  const closeMenuIfNeeded = () => {
    closeMobileMenu?.();
  };

  return (
    <div className={HEADER_ACTION_GROUP_CLASS}>
      <div
        className={HEADER_ACTION_TOOLBAR_CLASS}
        style={{ backgroundColor: 'var(--header-rail-surface)', borderColor: 'var(--border-primary)' }}
      >
        <Button
          onClick={() => {
            handlers.onLoadScenario();
            closeMenuIfNeeded();
          }}
          variant="toolbar"
          size="md"
          title="Load scenario"
          leadingIcon={<Upload className="h-4 w-4" />}
        >
          <span>Load</span>
        </Button>
        <Button
          onClick={() => {
            handlers.onSaveScenario();
            closeMenuIfNeeded();
          }}
          variant="toolbar"
          size="md"
          title="Save scenario"
          leadingIcon={<Save className="h-4 w-4" />}
        >
          <span>Save</span>
        </Button>
        <DemoDataDropdown
          onDemoCaseClick={(demoCaseId, demoCaseName) => {
            handlers.onDemoCaseClick(demoCaseId, demoCaseName);
            closeMenuIfNeeded();
          }}
          variant="header"
          triggerLabel={closeMobileMenu ? 'Demo Data' : 'Demo'}
        />
      </div>

      <div
        className="mt-2 rounded-2xl border px-3 py-3"
        style={{ backgroundColor: 'var(--header-rail-surface)', borderColor: 'var(--border-primary)' }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
          Preferences
        </div>
        <div className="mt-2 space-y-1.5">
          <PreferenceToggleMenuItem
            checked={handlers.advancedModeEnabled}
            label="Advanced mode"
            description="Show the dedicated solver page and full workflow steps."
            ariaLabel="Enable advanced mode"
            onChange={(enabled) => {
              handlers.onSetAdvancedModeEnabled(enabled);
            }}
          />
          <PreferenceToggleMenuItem
            checked={handlers.showWorkflowGuideButton}
            label="Show workflow guide button"
            description="Show the floating next-step button in the bottom-right corner."
            ariaLabel="Show workflow guide button"
            onChange={(show) => {
              handlers.onSetShowWorkflowGuideButton(show);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function WorkspaceDesktopMenu({ handlers }: { handlers: WorkspaceActionHandlers }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setIsOpen(false), []);

  useOutsideClick({
    refs: [triggerRef, panelRef],
    onOutsideClick: closeMenu,
    enabled: isOpen,
    ignoreSelectors: ['[data-outside-click-owner="workspace-menu"]'],
  });

  const menuItemClassName =
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors';

  return (
    <div className="relative hidden sm:block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={[
          getButtonClassName({ variant: 'toolbar', size: 'icon' }),
          'h-10 w-10 min-h-10 min-w-10 rounded-xl p-0',
        ].join(' ')}
        style={{
          backgroundColor: isOpen ? 'var(--bg-primary)' : 'transparent',
          color: isOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
        aria-label="Open workspace menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          className="absolute right-0 top-[calc(100%+0.6rem)] z-[80] w-[18rem] overflow-hidden rounded-2xl border shadow-lg"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-primary)',
            boxShadow: 'var(--shadow-lg)',
          }}
          role="menu"
          aria-label="Workspace menu"
        >
          <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-primary)' }}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
              Workspace
            </div>
            <div className="mt-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Project actions
            </div>
          </div>

          <div className="p-2" role="none">
            <button
              type="button"
              onClick={() => {
                handlers.onLoadScenario();
                closeMenu();
              }}
              className={menuItemClassName}
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              >
                <Upload className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                <span>Load scenario</span>
              </button>

            <button
              type="button"
              onClick={() => {
                handlers.onSaveScenario();
                closeMenu();
              }}
              className={menuItemClassName}
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              >
                <Save className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                <span>Save scenario</span>
              </button>

            <DemoDataDropdown
              onDemoCaseClick={handlers.onDemoCaseClick}
              triggerLabel="Demo Data"
              variant="menu"
              popupOwnerId="workspace-menu"
            />
          </div>

          <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border-primary)' }}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
              Preferences
            </div>
            <div className="mt-2 space-y-1.5">
              <PreferenceToggleMenuItem
                checked={handlers.advancedModeEnabled}
                label="Advanced mode"
                description="Show the dedicated solver page and full workflow steps."
                ariaLabel="Enable advanced mode"
                onChange={(enabled) => {
                  handlers.onSetAdvancedModeEnabled(enabled);
                }}
              />
              <PreferenceToggleMenuItem
                checked={handlers.showWorkflowGuideButton}
                label="Show workflow guide button"
                description="Show the floating next-step button in the bottom-right corner."
                ariaLabel="Show workflow guide button"
                onChange={(show) => {
                  handlers.onSetShowWorkflowGuideButton(show);
                }}
              />
            </div>
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
                Appearance
              </div>
              <div className="mt-3">
                <ThemeToggle showLabel size="sm" />
              </div>
            </div>
          </div>

          <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border-primary)' }}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
              Help
            </div>
            <div className="mt-2">
              <a
                href={ISSUE_HREF}
                target="_blank"
                rel="noopener noreferrer"
                title={ISSUE_LABEL}
                className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <Bug className="h-4 w-4" />
                <span>Report issue or request a feature</span>
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface HeaderProps {
  renderDesktopCenterContent?: () => React.ReactNode;
  renderMobileCenterContent?: (helpers: { closeMobileMenu: () => void }) => React.ReactNode;
  renderMobileBelowHeaderContent?: () => React.ReactNode;
}

export function Header({ renderDesktopCenterContent, renderMobileCenterContent, renderMobileBelowHeaderContent }: HeaderProps = {}) {
  const {
    scenario,
    currentScenarioId,
    savedScenarios,
    setShowScenarioManager,
    saveScenario,
    ui,
    setAdvancedModeEnabled,
    setShowWorkflowGuideButton,
    loadDemoCase,
    loadDemoCaseOverwrite,
    loadDemoCaseNewScenario,
    loadGeneratedDemoScenario,
    loadGeneratedDemoScenarioOverwrite,
    loadGeneratedDemoScenarioNewScenario,
  } = useAppStore();
  const [showDemoWarningModal, setShowDemoWarningModal] = useState(false);
  const [showGeneratedDemoModal, setShowGeneratedDemoModal] = useState(false);
  const [pendingDemoCaseId, setPendingDemoCaseId] = useState<string | null>(null);
  const [pendingDemoCaseName, setPendingDemoCaseName] = useState<string | null>(null);
  const [pendingGeneratedScenario, setPendingGeneratedScenario] = useState<Scenario | null>(null);

  const currentScenarioName = currentScenarioId
    ? savedScenarios[currentScenarioId]?.name ?? 'Untitled Scenario'
    : 'Untitled Scenario';

  const handlers: WorkspaceActionHandlers = {
    onLoadScenario: () => {
      setShowScenarioManager(true);
    },
    onSaveScenario: () => {
      saveScenario(currentScenarioName);
    },
    onDemoCaseClick: (demoCaseId, demoCaseName) => {
      if (demoCaseId === GENERATED_DEMO_CASE_ID) {
        setShowGeneratedDemoModal(true);
        return;
      }

      const hasContent =
        scenario && (scenario.people.length > 0 || scenario.groups.length > 0 || scenario.constraints.length > 0);

      if (hasContent) {
        setPendingDemoCaseId(demoCaseId);
        setPendingDemoCaseName(demoCaseName);
        setShowDemoWarningModal(true);
        return;
      }

      loadDemoCase(demoCaseId);
    },
    advancedModeEnabled: ui.advancedModeEnabled ?? false,
    onSetAdvancedModeEnabled: (enabled) => {
      setAdvancedModeEnabled(enabled);
    },
    showWorkflowGuideButton: ui.showWorkflowGuideButton ?? true,
    onSetShowWorkflowGuideButton: (show) => {
      setShowWorkflowGuideButton(show);
    },
  };

  return (
    <>
      <AppHeader
        renderDesktopCenterContent={renderDesktopCenterContent}
        renderMobileCenterContent={renderMobileCenterContent}
        renderMobileBelowHeaderContent={renderMobileBelowHeaderContent}
        renderDesktopActions={() => <WorkspaceDesktopMenu handlers={handlers} />}
        renderMobileActions={({ closeMobileMenu }) => (
          <WorkspaceInlineActions closeMobileMenu={closeMobileMenu} handlers={handlers} />
        )}
        hideDesktopUtilityRail
      />

      <DemoDataWarningModal
        isOpen={showDemoWarningModal}
        onClose={() => {
          setShowDemoWarningModal(false);
          setPendingDemoCaseId(null);
          setPendingDemoCaseName(null);
          setPendingGeneratedScenario(null);
        }}
        onOverwrite={() => {
          if (pendingGeneratedScenario) {
            loadGeneratedDemoScenarioOverwrite(pendingGeneratedScenario, pendingDemoCaseName ?? 'Random Demo');
          } else if (pendingDemoCaseId) {
            loadDemoCaseOverwrite(pendingDemoCaseId);
          }
          setShowDemoWarningModal(false);
          setPendingDemoCaseId(null);
          setPendingDemoCaseName(null);
          setPendingGeneratedScenario(null);
        }}
        onLoadNew={() => {
          if (pendingGeneratedScenario) {
            loadGeneratedDemoScenarioNewScenario(pendingGeneratedScenario, pendingDemoCaseName ?? 'Random Demo');
          } else if (pendingDemoCaseId) {
            loadDemoCaseNewScenario(pendingDemoCaseId);
          }
          setShowDemoWarningModal(false);
          setPendingDemoCaseId(null);
          setPendingDemoCaseName(null);
          setPendingGeneratedScenario(null);
        }}
        demoCaseName={pendingDemoCaseName || 'Demo Case'}
      />

      <GeneratedDemoDataModal
        isOpen={showGeneratedDemoModal}
        onClose={() => setShowGeneratedDemoModal(false)}
        onGenerate={(options) => {
          const generatedScenario = createGeneratedDemoScenario(options);
          const generatedScenarioName = formatGeneratedDemoScenarioName(options);
          const hasContent =
            scenario && (scenario.people.length > 0 || scenario.groups.length > 0 || scenario.constraints.length > 0);

          setShowGeneratedDemoModal(false);

          if (hasContent) {
            setPendingGeneratedScenario(generatedScenario);
            setPendingDemoCaseId(null);
            setPendingDemoCaseName(generatedScenarioName);
            setShowDemoWarningModal(true);
            return;
          }

          loadGeneratedDemoScenario(generatedScenario, generatedScenarioName);
        }}
      />
    </>
  );
}
