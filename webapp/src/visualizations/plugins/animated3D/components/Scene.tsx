import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { InstancedHumanoids, PersonLabels } from "./InstancedHumanoids";
import { Dinosaur, type DinoState } from "./Dinosaur";
import { Stork, type StorkState } from "./Stork";
import { GroupPlatform } from "./GroupPlatform";
import { Ground } from "./Ground";
import { Sky } from "./Sky";
import type { GroupLayout, PlaybackState, SessionTransition } from "../types";
import type { NormalizedSchedule } from "../../../models/normalize";
import type { PersonSessionData } from "../hooks/useAnimationState";

interface SceneProps {
  groupLayouts: Map<string, GroupLayout>;
  personSessionData: PersonSessionData[];
  transitions: SessionTransition[];
  schedule: NormalizedSchedule;
  playbackRef: React.MutableRefObject<PlaybackState>;
  sceneScale: number;
  onPlayDinoSound?: (sound: "roar" | "chomp" | "dig") => void;
  onPlayStorkSound?: (sound: "flap") => void;
  onUIUpdate: (state: PlaybackState) => void;
}

// Track active dinosaurs and storks
interface ActiveDino {
  id: string;
  targetPosition: THREE.Vector3;
  personName: string;
  state: DinoState;
  startTime: number;
}

interface ActiveStork {
  id: string;
  targetPosition: THREE.Vector3;
  personName: string;
  state: StorkState;
  startTime: number;
}

export function Scene({
  groupLayouts,
  personSessionData,
  transitions,
  schedule,
  playbackRef,
  sceneScale,
  onPlayDinoSound,
  onPlayStorkSound,
  onUIUpdate,
}: SceneProps) {
  // Active special animations
  const [activeDinos, setActiveDinos] = useState<ActiveDino[]>([]);
  const [activeStorks, setActiveStorks] = useState<ActiveStork[]>([]);

  // Track which events have been triggered GLOBALLY (persists across sessions)
  const triggeredEventsRef = useRef<Set<string>>(new Set());

  // Track last checked session to avoid re-checking same transition
  const lastCheckedSessionRef = useRef<number>(-1);
  const lastProgressRef = useRef<number>(0);

  // Current time for synchronization
  const timeRef = useRef<number>(0);

  // Clear triggered events when problem changes
  useEffect(() => {
    triggeredEventsRef.current = new Set();
    lastCheckedSessionRef.current = -1;
    setActiveDinos([]);
    setActiveStorks([]);
  }, [personSessionData]);

  // Check for special events (dinos/storks) in the animation loop
  useFrame((state) => {
    const playback = playbackRef.current;
    const currentSession = playback.currentSession;
    const progress = playback.transitionProgress;
    timeRef.current = state.clock.elapsedTime;

    // Only check when progress crosses the threshold (0.15 - 0.25) for the first time
    const progressThreshold = 0.2;
    const wasBeforeThreshold = lastProgressRef.current < progressThreshold;
    const isAfterThreshold = progress >= progressThreshold;
    const sessionChanged = lastCheckedSessionRef.current !== currentSession;

    lastProgressRef.current = progress;

    // Only trigger events when:
    // 1. We just crossed the threshold for this session, OR
    // 2. Session changed and we're already past threshold
    if (
      !(
        (sessionChanged && isAfterThreshold) ||
        (wasBeforeThreshold && isAfterThreshold && !sessionChanged)
      )
    ) {
      if (sessionChanged) {
        lastCheckedSessionRef.current = currentSession;
      }
      return;
    }

    lastCheckedSessionRef.current = currentSession;

    // Get transition for current session
    if (currentSession >= transitions.length) return;
    const transition = transitions[currentSession];
    if (!transition) return;

    // Process events
    for (const event of transition.events) {
      // Create a globally unique event ID
      const eventId = `${event.type}-${event.personId}-t${currentSession}`;

      // Skip if already triggered
      if (triggeredEventsRef.current.has(eventId)) continue;

      if (event.type === "eaten") {
        const personData = personSessionData.find(
          (p) => p.personId === event.personId
        );
        if (personData && personData.presentInSession[currentSession]) {
          const pos = personData.sessionPositions[currentSession];

          // Mark as triggered
          triggeredEventsRef.current.add(eventId);

          setActiveDinos((prev) => [
            ...prev,
            {
              id: eventId,
              targetPosition: pos.clone(),
              personName: personData.name,
              state: "emerging" as DinoState,
              startTime: timeRef.current,
            },
          ]);
        }
      } else if (event.type === "delivered") {
        const nextSession = currentSession + 1;
        if (nextSession >= schedule.sessionCount) continue;

        const personData = personSessionData.find(
          (p) => p.personId === event.personId
        );
        if (personData && personData.presentInSession[nextSession]) {
          const pos = personData.sessionPositions[nextSession];
          const personName = personData.name;

          // Mark as triggered
          triggeredEventsRef.current.add(eventId);

          setActiveStorks((prev) => [
            ...prev,
            {
              id: eventId,
              targetPosition: pos.clone(),
              personName,
              state: "flying_in" as StorkState,
              startTime: timeRef.current,
            },
          ]);
        }
      }
    }
  });

  // Handle dino animation complete
  const handleDinoComplete = useCallback((dinoId: string) => {
    setActiveDinos((prev) => prev.filter((d) => d.id !== dinoId));
  }, []);

  // Handle stork animation complete
  const handleStorkComplete = useCallback((storkId: string) => {
    setActiveStorks((prev) => prev.filter((s) => s.id !== storkId));
  }, []);

  // Calculate people count per group for current session (for platform display)
  const [currentSession, setCurrentSession] = useState(0);

  useFrame(() => {
    if (playbackRef.current.currentSession !== currentSession) {
      setCurrentSession(playbackRef.current.currentSession);
    }
  });

  const peopleCountByGroup = useMemo(() => {
    const counts = new Map<string, number>();
    if (currentSession < schedule.sessions.length) {
      const session = schedule.sessions[currentSession];
      for (const groupId of schedule.groupOrder) {
        const cell = session.cellsByGroupId[groupId];
        counts.set(groupId, cell?.peopleIds.length || 0);
      }
    }
    return counts;
  }, [schedule, currentSession]);

  // Calculate ground size based on scene scale
  const groundSize = Math.max(100, sceneScale * 3);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[sceneScale, sceneScale * 1.5, sceneScale]}
        intensity={1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={["#87CEEB", "#4a7c59", 0.4]} />

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={5}
        maxDistance={sceneScale * 5}
        maxPolarAngle={Math.PI / 2 - 0.1}
        target={[0, 0, 0]}
      />

      {/* Environment */}
      <Sky />
      <Ground size={groundSize} />

      {/* Group platforms */}
      {Array.from(groupLayouts.values()).map((layout) => (
        <GroupPlatform
          key={layout.groupId}
          layout={layout}
          peopleCount={peopleCountByGroup.get(layout.groupId) || 0}
        />
      ))}

      {/* High-performance instanced humanoids */}
      <InstancedHumanoids
        personData={personSessionData}
        playbackRef={playbackRef}
        transitions={transitions}
        sessionCount={schedule.sessionCount}
        onUIUpdate={onUIUpdate}
      />

      {/* Person labels (limited for performance) */}
      <PersonLabels personData={personSessionData} playbackRef={playbackRef} />

      {/* Dinosaurs */}
      {activeDinos.map((dino) => (
        <Dinosaur
          key={dino.id}
          targetPosition={dino.targetPosition}
          personName={dino.personName}
          state={dino.state}
          sceneScale={sceneScale}
          onAnimationComplete={() => handleDinoComplete(dino.id)}
          onPlaySound={onPlayDinoSound}
        />
      ))}

      {/* Storks */}
      {activeStorks.map((stork) => (
        <Stork
          key={stork.id}
          targetPosition={stork.targetPosition}
          personName={stork.personName}
          state={stork.state}
          sceneScale={sceneScale}
          onAnimationComplete={() => handleStorkComplete(stork.id)}
          onPlaySound={onPlayStorkSound}
        />
      ))}
    </>
  );
}
