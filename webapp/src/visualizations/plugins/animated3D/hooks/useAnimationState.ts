import { useState, useCallback, useMemo, useRef } from "react";
import * as THREE from "three";
import type { NormalizedSchedule } from "../../../models/normalize";
import type { Problem } from "../../../../types/index";
import type {
  GroupLayout,
  SessionTransition,
  AnimationEvent,
  PlaybackState,
} from "../types";

// Calculate group positions in a circle layout
function calculateGroupLayouts(
  groups: Array<{ id: string; size: number }>,
  radius: number = 20
): Map<string, GroupLayout> {
  const layouts = new Map<string, GroupLayout>();
  const count = groups.length;

  groups.forEach((group, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    // Group radius based on capacity (min 3, scale with sqrt of size)
    const groupRadius = Math.max(3, Math.sqrt(group.size) * 1.5);

    layouts.set(group.id, {
      groupId: group.id,
      position: new THREE.Vector3(x, 0, z),
      radius: groupRadius,
      capacity: group.size,
    });
  });

  return layouts;
}

// Calculate position for a person within a group
export function getPersonPositionInGroup(
  groupLayout: GroupLayout,
  personIndex: number,
  totalPeople: number
): THREE.Vector3 {
  if (totalPeople === 0) return groupLayout.position.clone();

  // Arrange people in concentric circles
  const maxPerRing = 8;
  let ring = 0;
  let indexInRing = personIndex;

  while (indexInRing >= maxPerRing * (ring + 1)) {
    indexInRing -= maxPerRing * (ring + 1);
    ring++;
  }

  const ringCapacity = maxPerRing * (ring + 1);
  const angle = (indexInRing / ringCapacity) * Math.PI * 2;
  const ringRadius = (ring + 1) * 1.2;

  return new THREE.Vector3(
    groupLayout.position.x + Math.cos(angle) * ringRadius,
    0,
    groupLayout.position.z + Math.sin(angle) * ringRadius
  );
}

// Generate a stable color for a person based on their ID
export function getPersonColor(personId: string): THREE.Color {
  let hash = 0;
  for (let i = 0; i < personId.length; i++) {
    hash = personId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360) / 360;
  const color = new THREE.Color();
  color.setHSL(hue, 0.7, 0.6);
  return color;
}

// Build session transition events
function buildTransitions(
  schedule: NormalizedSchedule,
  groupLayouts: Map<string, GroupLayout>
): SessionTransition[] {
  const transitions: SessionTransition[] = [];

  for (let i = 0; i < schedule.sessionCount - 1; i++) {
    const currentSession = schedule.sessions[i];
    const nextSession = schedule.sessions[i + 1];
    const events: AnimationEvent[] = [];

    // Build person -> group maps for both sessions
    const currentPersonGroup = new Map<string, string>();
    const nextPersonGroup = new Map<string, string>();

    for (const groupId of schedule.groupOrder) {
      const currentPeople =
        currentSession.cellsByGroupId[groupId]?.peopleIds || [];
      const nextPeople = nextSession.cellsByGroupId[groupId]?.peopleIds || [];

      for (const personId of currentPeople) {
        currentPersonGroup.set(personId, groupId);
      }
      for (const personId of nextPeople) {
        nextPersonGroup.set(personId, groupId);
      }
    }

    // Find all people across both sessions
    const allPeople = new Set([
      ...currentPersonGroup.keys(),
      ...nextPersonGroup.keys(),
    ]);

    for (const personId of allPeople) {
      const fromGroup = currentPersonGroup.get(personId);
      const toGroup = nextPersonGroup.get(personId);

      if (fromGroup && toGroup) {
        // Person walks from one group to another (or stays)
        if (fromGroup !== toGroup) {
          events.push({ type: "walk", personId, fromGroup, toGroup });
        }
      } else if (fromGroup && !toGroup) {
        // Person is removed - gets eaten by dinosaur!
        events.push({ type: "eaten", personId, lastGroup: fromGroup });
      } else if (!fromGroup && toGroup) {
        // Person appears - delivered by stork!
        events.push({ type: "delivered", personId, toGroup });
      }
    }

    transitions.push({
      fromSession: i,
      toSession: i + 1,
      events,
    });
  }

  return transitions;
}

// Precompute all positions for all people in all sessions
export interface PersonSessionData {
  personId: string;
  name: string;
  color: THREE.Color;
  sessionPositions: THREE.Vector3[]; // Position in each session
  presentInSession: boolean[]; // Whether present in each session
}

function buildPersonSessionData(
  problem: Problem,
  schedule: NormalizedSchedule,
  groupLayouts: Map<string, GroupLayout>
): PersonSessionData[] {
  const peopleMap = new Map<string, PersonSessionData>();

  // Initialize all people
  for (const person of problem.people) {
    const name = person.attributes?.name || person.id;
    peopleMap.set(person.id, {
      personId: person.id,
      name,
      color: getPersonColor(person.id),
      sessionPositions: Array(schedule.sessionCount)
        .fill(null)
        .map(() => new THREE.Vector3(0, -10, 0)),
      presentInSession: Array(schedule.sessionCount).fill(false),
    });
  }

  // Fill in positions for each session
  for (
    let sessionIndex = 0;
    sessionIndex < schedule.sessionCount;
    sessionIndex++
  ) {
    const session = schedule.sessions[sessionIndex];

    for (const groupId of schedule.groupOrder) {
      const cell = session.cellsByGroupId[groupId];
      const groupLayout = groupLayouts.get(groupId);
      if (!cell || !groupLayout) continue;

      cell.peopleIds.forEach((personId, idx) => {
        const personData = peopleMap.get(personId);
        if (personData) {
          personData.sessionPositions[sessionIndex] = getPersonPositionInGroup(
            groupLayout,
            idx,
            cell.peopleIds.length
          );
          personData.presentInSession[sessionIndex] = true;
        }
      });
    }
  }

  return Array.from(peopleMap.values());
}

export interface AnimationStateResult {
  groupLayouts: Map<string, GroupLayout>;
  personSessionData: PersonSessionData[];
  transitions: SessionTransition[];
  playbackRef: React.MutableRefObject<PlaybackState>;
  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  goToSession: (session: number) => void;
  reset: () => void;
  // For UI display only
  playbackState: PlaybackState;
}

export function useAnimationState(
  problem: Problem,
  schedule: NormalizedSchedule
): AnimationStateResult {
  // Memoize group layouts
  const groupLayouts = useMemo(
    () => calculateGroupLayouts(problem.groups),
    [problem.groups]
  );

  // Build transitions
  const transitions = useMemo(
    () => buildTransitions(schedule, groupLayouts),
    [schedule, groupLayouts]
  );

  // Precompute all person positions for all sessions
  const personSessionData = useMemo(
    () => buildPersonSessionData(problem, schedule, groupLayouts),
    [problem, schedule, groupLayouts]
  );

  // Use ref for playback state to avoid re-renders during animation
  const playbackRef = useRef<PlaybackState>({
    isPlaying: false,
    currentSession: 0,
    transitionProgress: 0,
    speed: 1,
  });

  // Keep a state copy for UI updates (throttled)
  const [playbackState, setPlaybackState] = useState<PlaybackState>(
    playbackRef.current
  );

  // Control functions - these update the ref immediately
  const play = useCallback(() => {
    playbackRef.current = { ...playbackRef.current, isPlaying: true };
    setPlaybackState({ ...playbackRef.current });
  }, []);

  const pause = useCallback(() => {
    playbackRef.current = { ...playbackRef.current, isPlaying: false };
    setPlaybackState({ ...playbackRef.current });
  }, []);

  const setSpeed = useCallback((speed: number) => {
    playbackRef.current = {
      ...playbackRef.current,
      speed: Math.max(0.1, Math.min(5, speed)),
    };
    setPlaybackState({ ...playbackRef.current });
  }, []);

  const goToSession = useCallback(
    (session: number) => {
      const clampedSession = Math.max(
        0,
        Math.min(schedule.sessionCount - 1, session)
      );
      playbackRef.current = {
        ...playbackRef.current,
        currentSession: clampedSession,
        transitionProgress: 0,
      };
      setPlaybackState({ ...playbackRef.current });
    },
    [schedule.sessionCount]
  );

  const reset = useCallback(() => {
    playbackRef.current = {
      isPlaying: false,
      currentSession: 0,
      transitionProgress: 0,
      speed: 1,
    };
    setPlaybackState({ ...playbackRef.current });
  }, []);

  return {
    groupLayouts,
    personSessionData,
    transitions,
    playbackRef,
    play,
    pause,
    setSpeed,
    goToSession,
    reset,
    playbackState,
  };
}
