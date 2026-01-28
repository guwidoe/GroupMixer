import type { Assignment, Constraint, Notification, Problem, SavedProblem, Solution } from '../../types';

type AddNotification = (notification: Omit<Notification, 'id'>) => void;

interface PullNewPeopleArgs {
  effectiveProblem: Problem | null;
  draftAssignments: Assignment[];
  addToStorage: (sessionId: number, personId: string) => void;
  addNotification: AddNotification;
}

export function pullNewPeople({ effectiveProblem, draftAssignments, addToStorage, addNotification }: PullNewPeopleArgs) {
  if (!effectiveProblem) return;
  const allSessions = Array.from({ length: effectiveProblem.num_sessions }, (_, i) => i);
  const assignedBySession = new Map<number, Set<string>>();
  draftAssignments.forEach((a) => {
    if (!assignedBySession.has(a.session_id)) assignedBySession.set(a.session_id, new Set());
    assignedBySession.get(a.session_id)!.add(a.person_id);
  });

  const assignedAny = new Set(draftAssignments.map((a) => a.person_id));
  const newPeople = effectiveProblem.people.filter((p) => !assignedAny.has(p.id));

  let addedCount = 0;
  newPeople.forEach((p) => {
    const sessions = p.sessions && p.sessions.length > 0 ? p.sessions : allSessions;
    sessions.forEach((s) => {
      const setForSession = assignedBySession.get(s) ?? new Set<string>();
      if (!setForSession.has(p.id)) {
        addToStorage(s, p.id);
        addedCount++;
      }
    });
  });

  if (newPeople.length === 0) {
    addNotification({ type: 'info', title: 'No New People', message: 'All people already exist in this result.' });
  } else {
    addNotification({
      type: 'success',
      title: 'Pulled People',
      message: `Added ${newPeople.length} people into storage across sessions (${addedCount} entries).`,
    });
  }
}

interface PullNewConstraintsArgs {
  effectiveProblem: Problem | null;
  solution: Solution | null;
  currentProblemId: string | null;
  savedProblems: Record<string, SavedProblem>;
  setPulledConstraints: (constraints: Constraint[]) => void;
  addNotification: AddNotification;
}

export function pullNewConstraints({
  effectiveProblem,
  solution,
  currentProblemId,
  savedProblems,
  setPulledConstraints,
  addNotification,
}: PullNewConstraintsArgs) {
  if (!effectiveProblem || !solution || !currentProblemId) return;
  const currentSaved = savedProblems[currentProblemId];
  if (!currentSaved) return;
  const result = currentSaved.results.find((r) => r.solution === solution);
  const snapshotConstraints = result?.problemSnapshot?.constraints ?? [];
  const currentConstraints = effectiveProblem.constraints ?? [];
  const key = (c: Constraint) => JSON.stringify(c);
  const snapshotSet = new Set(snapshotConstraints.map(key));
  const newOnes = currentConstraints.filter((c) => !snapshotSet.has(key(c)));
  setPulledConstraints(newOnes);
  addNotification({
    type: 'info',
    title: 'Pulled Constraints',
    message: newOnes.length === 0 ? 'No new constraints.' : `Found ${newOnes.length} new constraints.`,
  });
}
