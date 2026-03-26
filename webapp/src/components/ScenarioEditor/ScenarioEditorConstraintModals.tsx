import React from 'react';
import type { Constraint, Scenario } from '../../types';
import { IndexedConstraintModal } from './IndexedConstraintModal';
import { ImmovablePeopleModal } from '../modals/ImmovablePeopleModal';
import { RepeatEncounterModal } from '../modals/RepeatEncounterModal';
import { AttributeBalanceModal } from '../modals/AttributeBalanceModal';
import { ShouldNotBeTogetherModal } from '../modals/ShouldNotBeTogetherModal';
import { ShouldStayTogetherModal } from '../modals/ShouldStayTogetherModal';
import { MustStayTogetherModal } from '../modals/MustStayTogetherModal';
import { PairMeetingCountModal } from '../modals/PairMeetingCountModal';

interface ScenarioEditorConstraintModalsProps {
  sessionsCount: number;
  resolveScenario: () => Scenario;
  setScenario: (scenario: Scenario) => void;

  showImmovableModal: boolean;
  setShowImmovableModal: (open: boolean) => void;
  editingImmovableIndex: number | null;
  setEditingImmovableIndex: (index: number | null) => void;

  showRepeatEncounterModal: boolean;
  setShowRepeatEncounterModal: (open: boolean) => void;
  showAttributeBalanceModal: boolean;
  setShowAttributeBalanceModal: (open: boolean) => void;
  showShouldNotBeTogetherModal: boolean;
  setShowShouldNotBeTogetherModal: (open: boolean) => void;
  showShouldStayTogetherModal: boolean;
  setShowShouldStayTogetherModal: (open: boolean) => void;
  showMustStayTogetherModal: boolean;
  setShowMustStayTogetherModal: (open: boolean) => void;
  showPairMeetingCountModal: boolean;
  setShowPairMeetingCountModal: (open: boolean) => void;

  editingConstraintIndex: number | null;
  setEditingConstraintIndex: (index: number | null) => void;
}

export function ScenarioEditorConstraintModals({
  sessionsCount,
  resolveScenario,
  setScenario,
  showImmovableModal,
  setShowImmovableModal,
  editingImmovableIndex,
  setEditingImmovableIndex,
  showRepeatEncounterModal,
  setShowRepeatEncounterModal,
  showAttributeBalanceModal,
  setShowAttributeBalanceModal,
  showShouldNotBeTogetherModal,
  setShowShouldNotBeTogetherModal,
  showShouldStayTogetherModal,
  setShowShouldStayTogetherModal,
  showMustStayTogetherModal,
  setShowMustStayTogetherModal,
  showPairMeetingCountModal,
  setShowPairMeetingCountModal,
  editingConstraintIndex,
  setEditingConstraintIndex,
}: ScenarioEditorConstraintModalsProps) {
  type PeopleConstraint = Extract<Constraint, { type: 'ImmovablePeople' }>;
  type RepeatConstraint = Extract<Constraint, { type: 'RepeatEncounter' }>;
  type AttributeConstraint = Extract<Constraint, { type: 'AttributeBalance' }>;
  type ShouldNotConstraint = Extract<Constraint, { type: 'ShouldNotBeTogether' }>;
  type ShouldStayConstraint = Extract<Constraint, { type: 'ShouldStayTogether' }>;
  type PairMeetingConstraint = Extract<Constraint, { type: 'PairMeetingCount' }>;
  type MustStayConstraint = Extract<Constraint, { type: 'MustStayTogether' }>;

  return (
    <>
      <IndexedConstraintModal<PeopleConstraint>
        open={showImmovableModal}
        editingIndex={editingImmovableIndex}
        setEditingIndex={setEditingImmovableIndex}
        setOpen={setShowImmovableModal}
        resolveScenario={resolveScenario}
        setScenario={setScenario}
      >
        {({ initial, onCancel, onSave }) => (
          <ImmovablePeopleModal
            sessionsCount={sessionsCount}
            initial={initial}
            onCancel={onCancel}
            onSave={onSave}
          />
        )}
      </IndexedConstraintModal>

      <IndexedConstraintModal<RepeatConstraint>
        open={showRepeatEncounterModal}
        editingIndex={editingConstraintIndex}
        setEditingIndex={setEditingConstraintIndex}
        setOpen={setShowRepeatEncounterModal}
        resolveScenario={resolveScenario}
        setScenario={setScenario}
      >
        {({ initial, onCancel, onSave }) => (
          <RepeatEncounterModal initial={initial} onCancel={onCancel} onSave={onSave} />
        )}
      </IndexedConstraintModal>

      <IndexedConstraintModal<AttributeConstraint>
        open={showAttributeBalanceModal}
        editingIndex={editingConstraintIndex}
        setEditingIndex={setEditingConstraintIndex}
        setOpen={setShowAttributeBalanceModal}
        resolveScenario={resolveScenario}
        setScenario={setScenario}
      >
        {({ initial, onCancel, onSave }) => (
          <AttributeBalanceModal initial={initial} onCancel={onCancel} onSave={onSave} />
        )}
      </IndexedConstraintModal>

      <IndexedConstraintModal<ShouldNotConstraint>
        open={showShouldNotBeTogetherModal}
        editingIndex={editingConstraintIndex}
        setEditingIndex={setEditingConstraintIndex}
        setOpen={setShowShouldNotBeTogetherModal}
        resolveScenario={resolveScenario}
        setScenario={setScenario}
      >
        {({ initial, onCancel, onSave }) => (
          <ShouldNotBeTogetherModal
            sessionsCount={sessionsCount}
            initial={initial}
            onCancel={onCancel}
            onSave={onSave}
          />
        )}
      </IndexedConstraintModal>

      <IndexedConstraintModal<ShouldStayConstraint>
        open={showShouldStayTogetherModal}
        editingIndex={editingConstraintIndex}
        setEditingIndex={setEditingConstraintIndex}
        setOpen={setShowShouldStayTogetherModal}
        resolveScenario={resolveScenario}
        setScenario={setScenario}
      >
        {({ initial, onCancel, onSave }) => (
          <ShouldStayTogetherModal
            sessionsCount={sessionsCount}
            initial={initial}
            onCancel={onCancel}
            onSave={onSave}
          />
        )}
      </IndexedConstraintModal>

      <IndexedConstraintModal<PairMeetingConstraint>
        open={showPairMeetingCountModal}
        editingIndex={editingConstraintIndex}
        setEditingIndex={setEditingConstraintIndex}
        setOpen={setShowPairMeetingCountModal}
        resolveScenario={resolveScenario}
        setScenario={setScenario}
      >
        {({ scenario, initial, onCancel, onSave }) => (
          <PairMeetingCountModal
            people={scenario.people}
            totalSessions={scenario.num_sessions}
            initial={initial}
            onCancel={onCancel}
            onSave={onSave}
          />
        )}
      </IndexedConstraintModal>

      <IndexedConstraintModal<MustStayConstraint>
        open={showMustStayTogetherModal}
        editingIndex={editingConstraintIndex}
        setEditingIndex={setEditingConstraintIndex}
        setOpen={setShowMustStayTogetherModal}
        resolveScenario={resolveScenario}
        setScenario={setScenario}
      >
        {({ initial, onCancel, onSave }) => (
          <MustStayTogetherModal
            sessionsCount={sessionsCount}
            initial={initial}
            onCancel={onCancel}
            onSave={onSave}
          />
        )}
      </IndexedConstraintModal>
    </>
  );
}
