import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSampleScenario } from '../../test/fixtures';
import { useScenarioEditorController } from './useScenarioEditorController';

const mockSetScenario = vi.fn();
const mockAddNotification = vi.fn();
const mockLoadDemoCase = vi.fn();
const mockLoadDemoCaseOverwrite = vi.fn();
const mockLoadDemoCaseNewScenario = vi.fn();
const mockLoadGeneratedDemoScenario = vi.fn();
const mockLoadGeneratedDemoScenarioOverwrite = vi.fn();
const mockLoadGeneratedDemoScenarioNewScenario = vi.fn();
const mockSetShowScenarioManager = vi.fn();
const mockSaveScenario = vi.fn();
const mockUpdateCurrentScenario = vi.fn();
const mockUpdateScenario = vi.fn();
const mockNavigate = vi.fn();

const mockScenario = createSampleScenario({
  num_sessions: 4,
  people: [
    { id: 'p1', attributes: { name: 'Alice' } },
    { id: 'p2', attributes: { name: 'Bob' }, sessions: [0, 1, 2] },
    { id: 'p3', attributes: { name: 'Cara' } },
    { id: 'p4', attributes: { name: 'Dan' } },
  ],
  groups: [
    { id: 'g1', size: 2, session_sizes: [2, 2, 2, 2] },
    { id: 'g2', size: 2 },
  ],
  constraints: [
    { type: 'MustStayApart', people: ['p1', 'p2'], sessions: [1, 2, 3] },
  ],
});

const mockStore = {
  scenario: mockScenario,
  setScenario: mockSetScenario,
  resolveScenario: vi.fn(() => mockScenario),
  addNotification: mockAddNotification,
  loadDemoCase: mockLoadDemoCase,
  loadDemoCaseOverwrite: mockLoadDemoCaseOverwrite,
  loadDemoCaseNewScenario: mockLoadDemoCaseNewScenario,
  loadGeneratedDemoScenario: mockLoadGeneratedDemoScenario,
  loadGeneratedDemoScenarioOverwrite: mockLoadGeneratedDemoScenarioOverwrite,
  loadGeneratedDemoScenarioNewScenario: mockLoadGeneratedDemoScenarioNewScenario,
  attributeDefinitions: [],
  addAttributeDefinition: vi.fn(),
  removeAttributeDefinition: vi.fn(),
  setAttributeDefinitions: vi.fn(),
  setShowScenarioManager: mockSetShowScenarioManager,
  currentScenarioId: null,
  saveScenario: mockSaveScenario,
  updateCurrentScenario: mockUpdateCurrentScenario,
  updateScenario: mockUpdateScenario,
  ui: {
    activeTab: 'scenario',
    isLoading: false,
    notifications: [],
    showScenarioManager: false,
    showResultComparison: false,
    warmStartResultId: null,
    lastScenarioSetupSection: 'sessions',
  },
};

vi.mock('../../store', () => ({
  useAppStore: (selector?: (state: typeof mockStore) => unknown) => (selector ? selector(mockStore) : mockStore),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ section: 'sessions' }),
  };
});

vi.mock('./hooks/useScenarioEditorEntities', () => ({
  useScenarioEditorEntities: () => ({
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
  }),
}));

vi.mock('./hooks/useScenarioEditorConstraints', () => ({
  useScenarioEditorConstraints: () => ({
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
  }),
}));

vi.mock('./hooks/useScenarioEditorBulkUpdatePeople', () => ({
  useScenarioEditorBulkUpdatePeople: () => ({
    createRow: vi.fn(),
    applyRows: vi.fn(),
  }),
}));

vi.mock('./scenarioEditorActions', () => ({
  createScenarioEditorActions: () => ({
    handleCancelPersonForm: vi.fn(),
    handleCancelGroupForm: vi.fn(),
    handleCancelAttributeForm: vi.fn(),
    handleCloseConstraintForm: vi.fn(),
    handleObjectiveCommit: vi.fn(),
    handleHardConstraintAdd: vi.fn(),
    handleHardConstraintEdit: vi.fn(),
    handleSoftConstraintAdd: vi.fn(),
    handleSoftConstraintEdit: vi.fn(),
  }),
}));

describe('useScenarioEditorController session reductions', () => {
  beforeEach(() => {
    mockSetScenario.mockReset();
    mockAddNotification.mockReset();
    mockNavigate.mockReset();
  });

  it('opens a review plan instead of immediately applying a session reduction', () => {
    const { result } = renderHook(() => useScenarioEditorController());

    act(() => {
      result.current.handleSessionsCountChange(3);
    });

    expect(mockSetScenario).not.toHaveBeenCalled();
    expect(result.current.showSessionReductionReviewModal).toBe(true);
    expect(result.current.sessionReductionPlan).toEqual(
      expect.objectContaining({
        previousSessionCount: 4,
        nextSessionCount: 3,
        canApply: true,
      }),
    );
  });

  it('applies a reviewed reduction when confirmed', () => {
    const { result } = renderHook(() => useScenarioEditorController());

    act(() => {
      result.current.handleSessionsCountChange(3);
    });

    act(() => {
      result.current.handleConfirmSessionReduction();
    });

    expect(mockSetScenario).toHaveBeenCalledWith(
      expect.objectContaining({
        num_sessions: 3,
        constraints: [
          { type: 'MustStayApart', people: ['p1', 'p2'], sessions: [1, 2] },
        ],
      }),
    );
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: 'Sessions Updated',
      }),
    );
  });
});
