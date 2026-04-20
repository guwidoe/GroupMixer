import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ScenarioEditor } from './ScenarioEditor';
import type { ScenarioEditorController } from './useScenarioEditorController';

const mockUseScenarioEditorController = vi.fn();
const mockUseDeferredScenarioSectionContent = vi.fn();
const mockUseDeferredScenarioSetupSummary = vi.fn();

vi.mock('./useScenarioEditorController', () => ({
  useScenarioEditorController: () => mockUseScenarioEditorController(),
}));

vi.mock('./useDeferredScenarioSectionContent', () => ({
  useDeferredScenarioSectionContent: () => mockUseDeferredScenarioSectionContent(),
  useDeferredScenarioSetupSummary: () => mockUseDeferredScenarioSetupSummary(),
}));

vi.mock('./layout/ScenarioSetupLayout', () => ({
  ScenarioSetupLayout: ({ children }: { children: React.ReactNode }) => (
    <div>
      <aside aria-label="Scenario Setup navigation">Sidebar</aside>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock('./ScenarioEditorHeader', () => ({
  ScenarioEditorHeader: () => <div>Header</div>,
}));

vi.mock('./ScenarioSetupSectionRenderer', () => ({
  ScenarioSetupSectionRenderer: () => <div>Section content</div>,
}));

vi.mock('./ScenarioEditorForms', () => ({
  ScenarioEditorForms: () => <div>Forms</div>,
}));

vi.mock('./ScenarioEditorConstraintModals', () => ({
  ScenarioEditorConstraintModals: () => <div>Constraint modals</div>,
}));

vi.mock('./ConstraintFormModal', () => ({
  ConstraintFormModal: () => <div>Constraint form</div>,
}));

vi.mock('../modals/DemoDataWarningModal', () => ({
  DemoDataWarningModal: () => <div>Demo warning modal</div>,
}));

vi.mock('../modals/GeneratedDemoDataModal', () => ({
  GeneratedDemoDataModal: () => <div>Generated demo modal</div>,
}));

vi.mock('../modals/ReduceSessionsReviewModal', () => ({
  ReduceSessionsReviewModal: ({ people }: { people: Array<{ id: string }> }) => <div>Session reduction review modal ({people.length})</div>,
}));

function createController(overrides: Partial<ScenarioEditorController> = {}): ScenarioEditorController {
  return {
    activeSection: 'people',
    navigationSection: 'people',
    scenario: null,
    currentScenarioId: null,
    attributeDefinitions: [],
    objectiveCount: 1,
    sessionsCount: 3,
    currentObjectiveWeight: 1,
    setScenario: vi.fn(),
    resolveScenario: vi.fn(),
    addNotification: vi.fn(),
    removeAttributeDefinition: vi.fn(),
    handleLoadScenario: vi.fn(),
    handleSaveScenario: vi.fn(),
    handleDemoCaseClick: vi.fn(),
    handleDemoCancel: vi.fn(),
    handleDemoOverwrite: vi.fn(),
    handleDemoLoadNew: vi.fn(),
    handleGeneratedDemoSubmit: vi.fn(),
    handleSessionsCountChange: vi.fn(),
    sessionReductionPlan: null,
    sessionReductionInvalidations: [],
    showSessionReductionReviewModal: false,
    handleCancelSessionReduction: vi.fn(),
    handleConfirmSessionReduction: vi.fn(),
    navigateToSection: vi.fn(),
    showDemoWarningModal: false,
    showGeneratedDemoModal: false,
    pendingDemoCaseName: null,
    ui: {
      activeTab: 'scenario',
      isLoading: true,
      notifications: [],
      showScenarioManager: false,
      showResultComparison: false,
      warmStartResultId: null,
    },
    entities: {
      showPersonForm: false,
      editingPerson: null,
      personForm: { attributes: {}, sessions: [] },
      setPersonForm: vi.fn(),
      handleAddPerson: vi.fn(),
      handleUpdatePerson: vi.fn(),
      setShowPersonForm: vi.fn(),
      showGroupForm: false,
      editingGroup: null,
      groupForm: { size: 4 },
      setGroupForm: vi.fn(),
      groupFormInputs: {},
      setGroupFormInputs: vi.fn(),
      handleAddGroup: vi.fn(),
      handleUpdateGroup: vi.fn(),
      showAttributeForm: false,
      editingAttribute: null,
      newAttribute: { key: '', values: [''] },
      setNewAttribute: vi.fn(),
      handleAddAttribute: vi.fn(),
      handleUpdateAttribute: vi.fn(),
      handleEditPerson: vi.fn(),
      handleDeletePerson: vi.fn(),
      handleEditGroup: vi.fn(),
      handleDeleteGroup: vi.fn(),
      handleEditAttribute: vi.fn(),
      setShowGroupForm: vi.fn(),
      setShowAttributeForm: vi.fn(),
    },
    bulk: {
      updatePeople: {
        createRow: vi.fn(),
        applyRows: vi.fn(),
      },
    },
    constraints: {
      showConstraintForm: false,
      editingConstraint: null,
      constraintForm: {},
      setConstraintForm: vi.fn(),
      handleAddConstraint: vi.fn(),
      handleUpdateConstraint: vi.fn(),
      showImmovableModal: false,
      setShowImmovableModal: vi.fn(),
      editingImmovableIndex: null,
      setEditingImmovableIndex: vi.fn(),
      showRepeatEncounterModal: false,
      setShowRepeatEncounterModal: vi.fn(),
      showAttributeBalanceModal: false,
      setShowAttributeBalanceModal: vi.fn(),
      showShouldNotBeTogetherModal: false,
      setShowShouldNotBeTogetherModal: vi.fn(),
      showShouldStayTogetherModal: false,
      setShowShouldStayTogetherModal: vi.fn(),
      showMustStayTogetherModal: false,
      setShowMustStayTogetherModal: vi.fn(),
      showMustStayApartModal: false,
      setShowMustStayApartModal: vi.fn(),
      showPairMeetingCountModal: false,
      setShowPairMeetingCountModal: vi.fn(),
      editingConstraintIndex: null,
      setEditingConstraintIndex: vi.fn(),
      activeConstraintTab: 'hard',
      setActiveConstraintTab: vi.fn(),
      constraintCategoryTab: 'hard',
      setConstraintCategoryTab: vi.fn(),
      HARD_TYPES: [],
      SOFT_TYPES: [],
      handleDeleteConstraint: vi.fn(),
      handleEditConstraint: vi.fn(),
      handleHardConstraintAdd: vi.fn(),
      handleHardConstraintEdit: vi.fn(),
      handleSoftConstraintAdd: vi.fn(),
      handleSoftConstraintEdit: vi.fn(),
    },
    editorActions: {
      handleCancelPersonForm: vi.fn(),
      handleCancelGroupForm: vi.fn(),
      handleCancelAttributeForm: vi.fn(),
      handleCloseConstraintForm: vi.fn(),
      handleObjectiveCommit: vi.fn(),
      handleHardConstraintAdd: vi.fn(),
      handleHardConstraintEdit: vi.fn(),
      handleSoftConstraintAdd: vi.fn(),
      handleSoftConstraintEdit: vi.fn(),
    },
    ...overrides,
  } as unknown as ScenarioEditorController;
}

describe('ScenarioEditor', () => {
  it('renders the setup sidebar immediately before mounting the heavy controller', () => {
    vi.useFakeTimers();
    mockUseScenarioEditorController.mockReturnValue(createController());
    mockUseDeferredScenarioSectionContent.mockReturnValue({
      isContentReady: true,
      isContentLoading: false,
      deferredSectionLabel: 'people directory',
    });
    mockUseDeferredScenarioSetupSummary.mockReturnValue({
      areSummaryCountsReady: false,
      summaryScenario: null,
      summaryAttributeDefinitions: [],
      summaryObjectiveCount: 0,
    });

    render(
      <MemoryRouter initialEntries={['/app/scenario/people']}>
        <Routes>
          <Route path="/app/scenario/:section" element={<ScenarioEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Scenario Setup navigation')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/loading people/i);
    expect(mockUseScenarioEditorController).not.toHaveBeenCalled();
    expect(screen.queryByText('Forms')).not.toBeInTheDocument();

    act(() => {
      vi.runAllTimers();
    });

    expect(mockUseScenarioEditorController).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
