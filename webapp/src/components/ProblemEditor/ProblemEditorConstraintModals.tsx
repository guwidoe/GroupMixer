import React from 'react';
import type { Problem } from '../../types';
import ImmovablePeopleModal from '../modals/ImmovablePeopleModal';
import RepeatEncounterModal from '../modals/RepeatEncounterModal';
import AttributeBalanceModal from '../modals/AttributeBalanceModal';
import ShouldNotBeTogetherModal from '../modals/ShouldNotBeTogetherModal';
import ShouldStayTogetherModal from '../modals/ShouldStayTogetherModal';
import MustStayTogetherModal from '../modals/MustStayTogetherModal';
import PairMeetingCountModal from '../modals/PairMeetingCountModal';

interface ProblemEditorConstraintModalsProps {
  problem: Problem | null;
  sessionsCount: number;
  getProblem: () => Problem;
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
  problem,
  sessionsCount,
  getProblem,
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
  return (
    <>
      {showImmovableModal && (
        <ImmovablePeopleModal
          sessionsCount={sessionsCount}
          initial={editingImmovableIndex !== null ? (getProblem().constraints[editingImmovableIndex] || null) : null}
          onCancel={() => {
            setShowImmovableModal(false);
            setEditingImmovableIndex(null);
          }}
          onSave={(con) => {
            const currentProblem = getProblem();
            const updatedConstraints = [...currentProblem.constraints];
            if (editingImmovableIndex !== null) {
              updatedConstraints[editingImmovableIndex] = con;
            } else {
              updatedConstraints.push(con);
            }

            setProblem({
              ...currentProblem,
              constraints: updatedConstraints,
            });

            setShowImmovableModal(false);
            setEditingImmovableIndex(null);
          }}
        />
      )}

      {showRepeatEncounterModal && (
        <RepeatEncounterModal
          initial={editingConstraintIndex !== null ? (getProblem().constraints[editingConstraintIndex] || null) : null}
          onCancel={() => {
            setShowRepeatEncounterModal(false);
            setEditingConstraintIndex(null);
          }}
          onSave={(constraint) => {
            const currentProblem = getProblem();
            const updatedConstraints = [...currentProblem.constraints];
            if (editingConstraintIndex !== null) {
              updatedConstraints[editingConstraintIndex] = constraint;
            } else {
              updatedConstraints.push(constraint);
            }

            setProblem({
              ...currentProblem,
              constraints: updatedConstraints,
            });

            setShowRepeatEncounterModal(false);
            setEditingConstraintIndex(null);
          }}
        />
      )}

      {showAttributeBalanceModal && (
        <AttributeBalanceModal
          initial={editingConstraintIndex !== null ? (getProblem().constraints[editingConstraintIndex] || null) : null}
          onCancel={() => {
            setShowAttributeBalanceModal(false);
            setEditingConstraintIndex(null);
          }}
          onSave={(constraint) => {
            const currentProblem = getProblem();
            const updatedConstraints = [...currentProblem.constraints];
            if (editingConstraintIndex !== null) {
              updatedConstraints[editingConstraintIndex] = constraint;
            } else {
              updatedConstraints.push(constraint);
            }

            setProblem({
              ...currentProblem,
              constraints: updatedConstraints,
            });

            setShowAttributeBalanceModal(false);
            setEditingConstraintIndex(null);
          }}
        />
      )}

      {showShouldNotBeTogetherModal && (
        <ShouldNotBeTogetherModal
          sessionsCount={sessionsCount}
          initial={editingConstraintIndex !== null ? (getProblem().constraints[editingConstraintIndex] || null) : null}
          onCancel={() => {
            setShowShouldNotBeTogetherModal(false);
            setEditingConstraintIndex(null);
          }}
          onSave={(constraint) => {
            const currentProblem = getProblem();
            const updatedConstraints = [...currentProblem.constraints];
            if (editingConstraintIndex !== null) {
              updatedConstraints[editingConstraintIndex] = constraint;
            } else {
              updatedConstraints.push(constraint);
            }

            setProblem({
              ...currentProblem,
              constraints: updatedConstraints,
            });

            setShowShouldNotBeTogetherModal(false);
            setEditingConstraintIndex(null);
          }}
        />
      )}

      {showShouldStayTogetherModal && (
        <ShouldStayTogetherModal
          sessionsCount={sessionsCount}
          initial={editingConstraintIndex !== null ? (getProblem().constraints[editingConstraintIndex] || null) : null}
          onCancel={() => {
            setShowShouldStayTogetherModal(false);
            setEditingConstraintIndex(null);
          }}
          onSave={(constraint) => {
            const currentProblem = getProblem();
            const updatedConstraints = [...currentProblem.constraints];
            if (editingConstraintIndex !== null) {
              updatedConstraints[editingConstraintIndex] = constraint;
            } else {
              updatedConstraints.push(constraint);
            }
            setProblem({
              ...currentProblem,
              constraints: updatedConstraints,
            });
            setShowShouldStayTogetherModal(false);
            setEditingConstraintIndex(null);
          }}
        />
      )}

      {showPairMeetingCountModal && (
        <PairMeetingCountModal
          people={problem?.people ?? []}
          totalSessions={problem?.num_sessions ?? 0}
          initial={editingConstraintIndex !== null && problem ? problem.constraints[editingConstraintIndex] : null}
          onCancel={() => setShowPairMeetingCountModal(false)}
          onSave={(constraint) => {
            if (!problem) {
              setShowPairMeetingCountModal(false);
              return;
            }
            const next = [...problem.constraints];
            if (editingConstraintIndex !== null) next[editingConstraintIndex] = constraint;
            else next.push(constraint);
            setProblem({ ...problem, constraints: next });
            setShowPairMeetingCountModal(false);
          }}
        />
      )}

      {showMustStayTogetherModal && (
        <MustStayTogetherModal
          sessionsCount={sessionsCount}
          initial={editingConstraintIndex !== null ? (getProblem().constraints[editingConstraintIndex] || null) : null}
          onCancel={() => {
            setShowMustStayTogetherModal(false);
            setEditingConstraintIndex(null);
          }}
          onSave={(constraint) => {
            const currentProblem = getProblem();
            const updatedConstraints = [...currentProblem.constraints];
            if (editingConstraintIndex !== null) {
              updatedConstraints[editingConstraintIndex] = constraint;
            } else {
              updatedConstraints.push(constraint);
            }

            setProblem({
              ...currentProblem,
              constraints: updatedConstraints,
            });

            setShowMustStayTogetherModal(false);
            setEditingConstraintIndex(null);
          }}
        />
      )}
    </>
  );
}
