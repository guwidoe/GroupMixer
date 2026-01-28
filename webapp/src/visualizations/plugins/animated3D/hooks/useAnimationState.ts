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

// Calculate group positions in a circle layout - SCALED based on problem size
function calculateGroupLayouts(
  groups: Array<{ id: string; size: number }>,
  totalPeople: number
): Map<string, GroupLayout> {
  const layouts = new Map<string, GroupLayout>();
  const count = groups.length;
  if (count === 0) return layouts;

  // Calculate average people per group for sizing
  const avgPeoplePerGroup = totalPeople / Math.max(1, count);

  // Group radius based on how many people need to fit
  const baseGroupRadius = Math.max(1.5, Math.sqrt(avgPeoplePerGroup) * 0.8);

  // Scene radius - groups should be spaced so they don't overlap
  // For 2 groups: place them closer together
  // For many groups: arrange in a circle with appropriate spacing
  let sceneRadius: number;
  if (count <= 2) {
    // For 1-2 groups, place them close together
    sceneRadius = baseGroupRadius * 2 + 3; // Just enough to not overlap
  } else {
    // For more groups, arrange in circle
    // Circumference needs to fit all groups with spacing
    const minSpacing = baseGroupRadius * 2.5; // Space between group centers
    const circumference = count * minSpacing;
    sceneRadius = Math.max(
      circumference / (2 * Math.PI),
      baseGroupRadius * 2 + 2
    );
  }

  groups.forEach((group, index) => {
    let x: number, z: number;

    if (count === 1) {
      // Single group at center
      x = 0;
      z = 0;
    } else if (count === 2) {
      // Two groups side by side
      x = index === 0 ? -sceneRadius / 2 : sceneRadius / 2;
      z = 0;
    } else {
      // Circular arrangement for 3+ groups
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      x = Math.cos(angle) * sceneRadius;
      z = Math.sin(angle) * sceneRadius;
    }

    // Scale group radius based on its actual capacity
    const groupRadius = Math.max(1.5, Math.sqrt(group.size) * 0.7);

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

  // Arrange people in concentric circles with better spacing
  const maxPerRing = Math.max(6, Math.floor(groupLayout.radius * 2));
  let ring = 0;
  let indexInRing = personIndex;
  let accumulated = 0;

  while (accumulated + maxPerRing * (ring + 1) <= personIndex) {
    accumulated += maxPerRing * (ring + 1);
    ring++;
  }
  indexInRing = personIndex - accumulated;

  const ringCapacity = maxPerRing * (ring + 1);
  const angle = (indexInRing / ringCapacity) * Math.PI * 2 + ring * 0.3; // Offset each ring
  const ringRadius = Math.min((ring + 1) * 0.8, groupLayout.radius * 0.8);

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
function buildTransitions(schedule: NormalizedSchedule): SessionTransition[] {
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

// Calculate scene scale factor for camera positioning
export function getSceneScale(totalPeople: number, groupCount: number): number {
  const avgPeoplePerGroup = totalPeople / Math.max(1, groupCount);
  const baseGroupRadius = Math.max(1.5, Math.sqrt(avgPeoplePerGroup) * 0.8);

  if (groupCount <= 2) {
    return baseGroupRadius * 2 + 3;
  }

  const minSpacing = baseGroupRadius * 2.5;
  const circumference = groupCount * minSpacing;
  return Math.max(circumference / (2 * Math.PI), baseGroupRadius * 2 + 2);
}

export interface AnimationStateResult {
  groupLayouts: Map<string, GroupLayout>;
  personSessionData: PersonSessionData[];
  transitions: SessionTransition[];
  playbackRef: React.MutableRefObject<PlaybackState>;
  sceneScale: number;
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
  const totalPeople = problem.people.length;

  // Memoize group layouts - now scaled
  const groupLayouts = useMemo(
    () => calculateGroupLayouts(problem.groups, totalPeople),
    [problem.groups, totalPeople]
  );

  // Calculate scene scale for camera
  const sceneScale = useMemo(
    () => getSceneScale(totalPeople, problem.groups.length),
    [totalPeople, problem.groups.length]
  );

  // Build transitions
  const transitions = useMemo(() => buildTransitions(schedule), [schedule]);

  // Precompute all person positions for all sessions
  const personSessionData = useMemo(
    () => buildPersonSessionData(problem, schedule, groupLayouts),
    [problem, schedule, groupLayouts]
  );

  const initialPlayback: PlaybackState = {
    isPlaying: false,
    currentSession: 0,
    transitionProgress: 0,
    speed: 1,
  };

  // Use ref for playback state to avoid re-renders during animation
  const playbackRef = useRef<PlaybackState>(initialPlayback);

  // Keep a state copy for UI updates (throttled)
  const [playbackState, setPlaybackState] = useState<PlaybackState>(
    initialPlayback
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
    sceneScale,
    play,
    pause,
    setSpeed,
    goToSession,
    reset,
    playbackState,
  };
}
