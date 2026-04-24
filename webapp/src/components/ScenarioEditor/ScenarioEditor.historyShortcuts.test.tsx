import { act, fireEvent, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioEditor } from './ScenarioEditor';
import type { ScenarioEditorController } from './useScenarioEditorController';

const mockUseScenarioEditorController = vi.fn();
const mockUndoScenarioDocument = vi.fn();
const mockRedoScenarioDocument = vi.fn();
let mockPastCount = 0;
let mockFutureCount = 0;

const mockStoreState = {
  setupGridUnsaved: false,
  setupGridLeaveHook: null,
  setLastScenarioSetupSection: vi.fn(),
  undoScenarioDocument: mockUndoScenarioDocument,
  redoScenarioDocument: mockRedoScenarioDocument,
};

vi.mock('../../store', () => ({
  useAppStore: Object.assign(
    (selector?: (state: typeof mockStoreState) => unknown) => (selector ? selector(mockStoreState) : mockStoreState),
    {
      getState: () => mockStoreState,
    },
  ),
  useScenarioDocumentHistory: (selector: (state: { pastStates: unknown[]; futureStates: unknown[] }) => unknown) => selector({
    pastStates: Array.from({ length: mockPastCount }),
    futureStates: Array.from({ length: mockFutureCount }),
  }),
}));

vi.mock('./useScenarioEditorController', () => ({
  useScenarioEditorController: () => mockUseScenarioEditorController(),
}));

vi.mock('./useDeferredScenarioSectionContent', () => ({
  useDeferredScenarioSectionContent: () => ({
    isContentReady: true,
    isContentLoading: false,
    deferredSectionLabel: 'people directory',
  }),
  useDeferredScenarioSetupSummary: () => ({
    areSummaryCountsReady: true,
    summaryScenario: null,
    summaryAttributeDefinitions: [],
    summaryObjectiveCount: 0,
  }),
}));

vi.mock('./layout/ScenarioSetupLayout', () => ({
  ScenarioSetupLayout: ({ children }: { children: React.ReactNode }) => (
    <div>
      <div>{children}</div>
    </div>
  ),
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
  DemoDataWarningModal: () => null,
}));

vi.mock('../modals/GeneratedDemoDataModal', () => ({
  GeneratedDemoDataModal: () => null,
}));

vi.mock('../modals/ReduceSessionsReviewModal', () => ({
  ReduceSessionsReviewModal: () => null,
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
      isLoading: false,
      notifications: [],
      showScenarioManager: false,
      showResultComparison: false,
      warmStartResultId: null,
      lastScenarioSetupSection: 'people',
    },
    entities: {
      showPersonForm: false,
      editingPerson: null,
      personForm: { name: '', attributes: {}, sessions: [] },
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
      handleDeleteConstraint: vi.fn(),
      handleEditConstraint: vi.fn(),
      createRepeatEncounterGridRow: vi.fn(),
      applyRepeatEncounterGridRows: vi.fn(),
      createAttributeBalanceGridRow: vi.fn(),
      applyAttributeBalanceGridRows: vi.fn(),
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

describe('ScenarioEditor history shortcuts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUndoScenarioDocument.mockReset();
    mockRedoScenarioDocument.mockReset();
    mockPastCount = 0;
    mockFutureCount = 0;
    mockUseScenarioEditorController.mockReturnValue(createController());
  });

  it('handles undo/redo keyboard shortcuts when history is available', () => {
    mockPastCount = 1;
    mockFutureCount = 1;

    render(
      <MemoryRouter initialEntries={['/app/scenario/people']}>
        <Routes>
          <Route path="/app/scenario/:section" element={<ScenarioEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    act(() => {
      vi.runAllTimers();
    });

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true });

    expect(mockUndoScenarioDocument).toHaveBeenCalledTimes(1);
    expect(mockRedoScenarioDocument).toHaveBeenCalledTimes(2);
  });
});
