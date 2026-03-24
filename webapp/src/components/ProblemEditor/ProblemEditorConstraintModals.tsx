import React from 'react';
import type { Constraint, Problem } from '../../types';
import { IndexedConstraintModal } from './IndexedConstraintModal';
import { ImmovablePeopleModal } from '../modals/ImmovablePeopleModal';
import { RepeatEncounterModal } from '../modals/RepeatEncounterModal';
import { AttributeBalanceModal } from '../modals/AttributeBalanceModal';
import { ShouldNotBeTogetherModal } from '../modals/ShouldNotBeTogetherModal';
import { ShouldStayTogetherModal } from '../modals/ShouldStayTogetherModal';
import { MustStayTogetherModal } from '../modals/MustStayTogetherModal';
import { PairMeetingCountModal } from '../modals/PairMeetingCountModal';

interface ProblemEditorConstraintModalsProps {
  sessionsCount: number;
  resolveProblem: () => Problem;
  setProblem: (problem: Problem) => void;

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

export function ProblemEditorConstraintModals({
  sessionsCount,
  resolveProblem,
  setProblem,
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
}: ProblemEditorConstraintModalsProps) {
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
        resolveProblem={resolveProblem}
        setProblem={setProblem}
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
        resolveProblem={resolveProblem}
        setProblem={setProblem}
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
        resolveProblem={resolveProblem}
        setProblem={setProblem}
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
        resolveProblem={resolveProblem}
        setProblem={setProblem}
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
        resolveProblem={resolveProblem}
        setProblem={setProblem}
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
        resolveProblem={resolveProblem}
        setProblem={setProblem}
      >
        {({ problem, initial, onCancel, onSave }) => (
          <PairMeetingCountModal
            people={problem.people}
            totalSessions={problem.num_sessions}
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
        resolveProblem={resolveProblem}
        setProblem={setProblem}
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
