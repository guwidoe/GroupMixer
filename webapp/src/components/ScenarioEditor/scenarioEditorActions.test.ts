import { describe, expect, it, vi } from 'vitest';
import { createSampleScenario } from '../../test/fixtures';
import { createScenarioEditorActions } from './scenarioEditorActions';
import type { Constraint } from '../../types';

function createControllers() {
  const constraints = {
    setEditingImmovableIndex: vi.fn(),
    setShowImmovableModal: vi.fn(),
    setEditingConstraintIndex: vi.fn(),
    setShowMustStayTogetherModal: vi.fn(),
    setShowMustStayApartModal: vi.fn(),
    setShowRepeatEncounterModal: vi.fn(),
    setShowAttributeBalanceModal: vi.fn(),
    setShowShouldNotBeTogetherModal: vi.fn(),
    setShowShouldStayTogetherModal: vi.fn(),
    setShowPairMeetingCountModal: vi.fn(),
    setConstraintForm: vi.fn(),
    setShowConstraintForm: vi.fn(),
    setEditingConstraint: vi.fn(),
    handleEditConstraint: vi.fn(),
  };

  const entities = {
    setShowPersonForm: vi.fn(),
    setEditingPerson: vi.fn(),
    setPersonForm: vi.fn(),
    setShowGroupForm: vi.fn(),
    setEditingGroup: vi.fn(),
    setGroupForm: vi.fn(),
    setGroupFormInputs: vi.fn(),
    setShowAttributeForm: vi.fn(),
    setNewAttribute: vi.fn(),
    setEditingAttribute: vi.fn(),
  };

  return { constraints, entities };
}

describe('createScenarioEditorActions', () => {
  it('routes soft constraint add/edit actions to the correct modal handlers', () => {
    const { constraints, entities } = createControllers();
    const updateScenario = vi.fn();
    const actions = createScenarioEditorActions({
      scenario: createSampleScenario(),
      updateScenario,
      constraints,
      entities,
    });

    actions.handleSoftConstraintAdd('PairMeetingCount');
    expect(constraints.setEditingConstraintIndex).toHaveBeenCalledWith(null);
    expect(constraints.setShowPairMeetingCountModal).toHaveBeenCalledWith(true);

    const repeatConstraint: Constraint = {
      type: 'RepeatEncounter',
      max_allowed_encounters: 1,
      penalty_function: 'linear',
      penalty_weight: 3,
    };
    actions.handleSoftConstraintEdit(repeatConstraint, 2);
    expect(constraints.setEditingConstraintIndex).toHaveBeenCalledWith(2);
    expect(constraints.setShowRepeatEncounterModal).toHaveBeenCalledWith(true);
  });

  it('routes hard constraint add/edit actions and resets form state through helpers', () => {
    const { constraints, entities } = createControllers();
    const updateScenario = vi.fn();
    const actions = createScenarioEditorActions({
      scenario: createSampleScenario(),
      updateScenario,
      constraints,
      entities,
    });

    actions.handleHardConstraintAdd('ImmovablePeople');
    expect(constraints.setEditingImmovableIndex).toHaveBeenCalledWith(null);
    expect(constraints.setShowImmovableModal).toHaveBeenCalledWith(true);

    actions.handleHardConstraintAdd('MustStayApart');
    expect(constraints.setEditingConstraintIndex).toHaveBeenCalledWith(null);
    expect(constraints.setShowMustStayApartModal).toHaveBeenCalledWith(true);

    const mustStayTogether: Constraint = {
      type: 'MustStayTogether',
      people: ['p1', 'p2'],
    };
    actions.handleHardConstraintEdit(mustStayTogether, 4);
    expect(constraints.setEditingConstraintIndex).toHaveBeenCalledWith(4);
    expect(constraints.setShowMustStayTogetherModal).toHaveBeenCalledWith(true);

    const mustStayApart: Constraint = {
      type: 'MustStayApart',
      people: ['p1', 'p3'],
    };
    actions.handleHardConstraintEdit(mustStayApart, 5);
    expect(constraints.setEditingConstraintIndex).toHaveBeenCalledWith(5);
    expect(constraints.setShowMustStayApartModal).toHaveBeenCalledWith(true);

    actions.handleCancelPersonForm();
    expect(entities.setShowPersonForm).toHaveBeenCalledWith(false);
    expect(entities.setPersonForm).toHaveBeenCalledWith({ name: '', attributes: {}, sessions: [] });

    actions.handleCloseConstraintForm();
    expect(constraints.setShowConstraintForm).toHaveBeenCalledWith(false);
    expect(constraints.setEditingConstraint).toHaveBeenCalledWith(null);
    expect(constraints.setConstraintForm).toHaveBeenCalled();
  });

  it('updates objectives through a single helper', () => {
    const { constraints, entities } = createControllers();
    const updateScenario = vi.fn();
    const actions = createScenarioEditorActions({
      scenario: createSampleScenario(),
      updateScenario,
      constraints,
      entities,
    });

    actions.handleObjectiveCommit(7);

    expect(updateScenario).toHaveBeenCalledWith({
      objectives: [{ type: 'maximize_unique_contacts', weight: 7 }],
    });
  });
});
