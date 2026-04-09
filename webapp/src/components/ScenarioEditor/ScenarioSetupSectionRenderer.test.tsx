import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScenarioSetupSectionRenderer } from './ScenarioSetupSectionRenderer';
import type { ScenarioEditorController } from './useScenarioEditorController';

function createController(overrides: Partial<ScenarioEditorController> = {}): ScenarioEditorController {
  return {
    activeSection: 'attributes',
    scenario: {
      people: [],
      groups: [],
      num_sessions: 3,
      constraints: [
        {
          type: 'RepeatEncounter',
          max_allowed_encounters: 1,
          penalty_function: 'linear',
          penalty_weight: 12,
        },
      ],
      settings: {
        solver_type: 'simulated_annealing',
        stop_conditions: {},
        solver_params: {},
      },
    },
    attributeDefinitions: [{ key: 'role', values: ['dev', 'pm'] }],
    removeAttributeDefinition: vi.fn(),
    addNotification: vi.fn(),
    sessionsCount: 3,
    currentObjectiveWeight: 1,
    handleSessionsCountChange: vi.fn(),
    entities: {
      setShowAttributeForm: vi.fn(),
      handleEditAttribute: vi.fn(),
      setShowPersonForm: vi.fn(),
      handleEditPerson: vi.fn(),
      handleDeletePerson: vi.fn(),
      setShowGroupForm: vi.fn(),
      handleEditGroup: vi.fn(),
      handleDeleteGroup: vi.fn(),
    },
    bulk: {
      addPeople: { openForm: vi.fn(), csvFileInputRef: { current: null } },
      updatePeople: { openForm: vi.fn() },
      addGroups: { openForm: vi.fn(), csvFileInputRef: { current: null } },
    },
    constraints: {
      handleDeleteConstraint: vi.fn(),
    },
    editorActions: {
      handleObjectiveCommit: vi.fn(),
      handleHardConstraintAdd: vi.fn(),
      handleHardConstraintEdit: vi.fn(),
      handleSoftConstraintAdd: vi.fn(),
      handleSoftConstraintEdit: vi.fn(),
    },
    ...overrides,
  } as unknown as ScenarioEditorController;
}

describe('ScenarioSetupSectionRenderer', () => {
  it('renders Attribute Definitions through the shared collection shell', () => {
    render(<ScenarioSetupSectionRenderer controller={createController()} />);

    expect(screen.getByRole('heading', { name: /attribute definitions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add attribute/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cards/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument();
    expect(screen.getByText(/attributes are key-value pairs/i)).toBeInTheDocument();
  });

  it('renders Repeat Encounter through the shared collection shell', () => {
    render(<ScenarioSetupSectionRenderer controller={createController({ activeSection: 'repeat-encounter' })} />);

    expect(screen.getByRole('heading', { name: /repeat encounter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add repeat limit/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/filter by limit, weight, or penalty function/i)).toBeInTheDocument();
    expect(screen.getByText(/penalty function: linear/i)).toBeInTheDocument();
  });
});
