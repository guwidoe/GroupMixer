import type { Constraint, Scenario } from '../../types';

type ConstraintController = {
  setEditingImmovableIndex: (index: number | null) => void;
  setShowImmovableModal: (open: boolean) => void;
  setEditingConstraintIndex: (index: number | null) => void;
  setShowMustStayTogetherModal: (open: boolean) => void;
  setShowMustStayApartModal: (open: boolean) => void;
  setShowRepeatEncounterModal: (open: boolean) => void;
  setShowAttributeBalanceModal: (open: boolean) => void;
  setShowShouldNotBeTogetherModal: (open: boolean) => void;
  setShowShouldStayTogetherModal: (open: boolean) => void;
  setShowPairMeetingCountModal: (open: boolean) => void;
  setConstraintForm: (updater: (previous: { type: Constraint['type']; penalty_weight?: number }) => { type: Constraint['type']; penalty_weight?: number }) => void;
  setShowConstraintForm: (open: boolean) => void;
  setEditingConstraint: (value: { constraint: Constraint; index: number } | null) => void;
  handleEditConstraint: (constraint: Constraint, index: number) => void;
};

type EntityController = {
  setShowPersonForm: (open: boolean) => void;
  setEditingPerson: (person: unknown | null) => void;
  setPersonForm: (value: { attributes: Record<string, string>; sessions: number[] }) => void;
  setShowGroupForm: (open: boolean) => void;
  setEditingGroup: (group: unknown | null) => void;
  setGroupForm: (value: { size: number }) => void;
  setGroupFormInputs: (value: { size?: string }) => void;
  setShowAttributeForm: (open: boolean) => void;
  setNewAttribute: (value: { key: string; values: string[] }) => void;
  setEditingAttribute: (attribute: unknown | null) => void;
};

interface CreateScenarioEditorActionsArgs {
  scenario: Scenario | null;
  updateScenario: (updates: Partial<Scenario>) => void;
  constraints: ConstraintController;
  entities: EntityController;
}

export function createScenarioEditorActions({ scenario, updateScenario, constraints, entities }: CreateScenarioEditorActionsArgs) {
  return {
    handleObjectiveCommit(newWeight: number) {
      if (!scenario) return;
      updateScenario({
        objectives: [
          {
            type: 'maximize_unique_contacts',
            weight: newWeight,
          },
        ],
      });
    },

    handleHardConstraintAdd(type: Constraint['type']) {
      if (type === 'ImmovablePeople') {
        constraints.setEditingImmovableIndex(null);
        constraints.setShowImmovableModal(true);
        return;
      }

      if (type === 'MustStayTogether') {
        constraints.setEditingConstraintIndex(null);
        constraints.setShowMustStayTogetherModal(true);
        return;
      }

      if (type === 'MustStayApart') {
        constraints.setEditingConstraintIndex(null);
        constraints.setShowMustStayApartModal(true);
        return;
      }

      constraints.setConstraintForm((previous) => ({ ...previous, type }));
      constraints.setShowConstraintForm(true);
    },

    handleHardConstraintEdit(constraint: Constraint, index: number) {
      if (constraint.type === 'ImmovablePeople') {
        constraints.setEditingImmovableIndex(index);
        constraints.setShowImmovableModal(true);
        return;
      }

      if (constraint.type === 'MustStayTogether') {
        constraints.setEditingConstraintIndex(index);
        constraints.setShowMustStayTogetherModal(true);
        return;
      }

      if (constraint.type === 'MustStayApart') {
        constraints.setEditingConstraintIndex(index);
        constraints.setShowMustStayApartModal(true);
        return;
      }

      constraints.handleEditConstraint(constraint, index);
    },

    handleSoftConstraintAdd(type: Constraint['type']) {
      constraints.setEditingConstraintIndex(null);
      switch (type) {
        case 'RepeatEncounter':
          constraints.setShowRepeatEncounterModal(true);
          break;
        case 'AttributeBalance':
          constraints.setShowAttributeBalanceModal(true);
          break;
        case 'ShouldNotBeTogether':
          constraints.setShowShouldNotBeTogetherModal(true);
          break;
        case 'ShouldStayTogether':
          constraints.setShowShouldStayTogetherModal(true);
          break;
        case 'PairMeetingCount':
          constraints.setShowPairMeetingCountModal(true);
          break;
        default:
          constraints.setConstraintForm((previous) => ({ ...previous, type }));
          constraints.setShowConstraintForm(true);
      }
    },

    handleSoftConstraintEdit(constraint: Constraint, index: number) {
      constraints.setEditingConstraintIndex(index);
      switch (constraint.type) {
        case 'RepeatEncounter':
          constraints.setShowRepeatEncounterModal(true);
          break;
        case 'AttributeBalance':
          constraints.setShowAttributeBalanceModal(true);
          break;
        case 'ShouldNotBeTogether':
          constraints.setShowShouldNotBeTogetherModal(true);
          break;
        case 'ShouldStayTogether':
          constraints.setShowShouldStayTogetherModal(true);
          break;
        case 'PairMeetingCount':
          constraints.setShowPairMeetingCountModal(true);
          break;
        default:
          constraints.handleEditConstraint(constraint, index);
      }
    },

    handleCancelPersonForm() {
      entities.setShowPersonForm(false);
      entities.setEditingPerson(null);
      entities.setPersonForm({ name: '', attributes: {}, sessions: [] });
    },

    handleCancelGroupForm() {
      entities.setShowGroupForm(false);
      entities.setEditingGroup(null);
      entities.setGroupForm({ size: 4 });
      entities.setGroupFormInputs({});
    },

    handleCancelAttributeForm() {
      entities.setShowAttributeForm(false);
      entities.setNewAttribute({ key: '', values: [''] });
      entities.setEditingAttribute(null);
    },

    handleCloseConstraintForm() {
      constraints.setShowConstraintForm(false);
      constraints.setEditingConstraint(null);
      constraints.setConstraintForm(() => ({ type: 'RepeatEncounter', penalty_weight: 1 }));
    },
  };
}
