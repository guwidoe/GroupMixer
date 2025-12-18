import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFHumanoids } from "./GLTFHumanoids";
import { PersonLabels } from "./InstancedHumanoids";
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

interface ActiveDino {
  id: string;
  personId: string;
  targetPosition: THREE.Vector3;
  personName: string;
  state: DinoState;
}

interface ActiveStork {
  id: string;
  personId: string;
  targetPosition: THREE.Vector3;
  personName: string;
  state: StorkState;
}

// Track which people are being animated by dino/stork
export interface AnimationCoordination {
  eatenPeople: Map<string, { hidden: boolean }>;
  deliveredPeople: Map<string, { visible: boolean }>;
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
  const [activeDinos, setActiveDinos] = useState<ActiveDino[]>([]);
  const [activeStorks, setActiveStorks] = useState<ActiveStork[]>([]);

  const [coordination, setCoordination] = useState<AnimationCoordination>({
    eatenPeople: new Map(),
    deliveredPeople: new Map(),
  });

  const triggeredEventsRef = useRef<Set<string>>(new Set());
  const lastCheckedSessionRef = useRef<number>(-1);
  const lastProgressRef = useRef<number>(0);
  
  // Track the previous session to detect resets
  const prevSessionRef = useRef<number>(-1);

  // Clear everything when problem changes
  useEffect(() => {
    triggeredEventsRef.current = new Set();
    lastCheckedSessionRef.current = -1;
    lastProgressRef.current = 0;
    prevSessionRef.current = -1;
    setActiveDinos([]);
    setActiveStorks([]);
    setCoordination({ eatenPeople: new Map(), deliveredPeople: new Map() });
  }, [personSessionData]);

  const handleDinoPhaseChange = useCallback((phase: DinoState, personId: string) => {
    if (phase === "chomping") {
      setCoordination((prev) => {
        const newEaten = new Map(prev.eatenPeople);
        newEaten.set(personId, { hidden: true });
        return { ...prev, eatenPeople: newEaten };
      });
    }
  }, []);

  const handleStorkPhaseChange = useCallback((phase: StorkState, personId: string) => {
    if (phase === "dropping") {
      setCoordination((prev) => {
        const newDelivered = new Map(prev.deliveredPeople);
        newDelivered.set(personId, { visible: true });
        return { ...prev, deliveredPeople: newDelivered };
      });
    }
  }, []);

  // Check for events and handle resets
  useFrame(() => {
    const playback = playbackRef.current;
    const currentSession = playback.currentSession;
    const progress = playback.transitionProgress;

    // Detect reset: if we went backwards (e.g., from session 3 to session 0)
    if (prevSessionRef.current > currentSession) {
      // Clear all triggered events so they can trigger again
      triggeredEventsRef.current = new Set();
      lastCheckedSessionRef.current = -1;
      lastProgressRef.current = 0;
      setActiveDinos([]);
      setActiveStorks([]);
      setCoordination({ eatenPeople: new Map(), deliveredPeople: new Map() });
    }
    prevSessionRef.current = currentSession;

    const progressThreshold = 0.15;
    const wasBeforeThreshold = lastProgressRef.current < progressThreshold;
    const isAfterThreshold = progress >= progressThreshold;
    const sessionChanged = lastCheckedSessionRef.current !== currentSession;

    lastProgressRef.current = progress;

    // Clear coordination when session changes (but not the triggered events unless reset)
    if (sessionChanged && lastCheckedSessionRef.current !== -1) {
      setCoordination({ eatenPeople: new Map(), deliveredPeople: new Map() });
    }

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

    if (currentSession >= transitions.length) return;
    const transition = transitions[currentSession];
    if (!transition) return;

    for (const event of transition.events) {
      const eventId = `${event.type}-${event.personId}-t${currentSession}`;
      if (triggeredEventsRef.current.has(eventId)) continue;

      if (event.type === "eaten") {
        const personData = personSessionData.find((p) => p.personId === event.personId);
        if (personData && personData.presentInSession[currentSession]) {
          const pos = personData.sessionPositions[currentSession];
          triggeredEventsRef.current.add(eventId);

          setCoordination((prev) => {
            const newEaten = new Map(prev.eatenPeople);
            newEaten.set(event.personId, { hidden: false });
            return { ...prev, eatenPeople: newEaten };
          });

          setActiveDinos((prev) => [
            ...prev,
            {
              id: eventId,
              personId: event.personId,
              targetPosition: pos.clone(),
              personName: personData.name,
              state: "emerging" as DinoState,
            },
          ]);
        }
      } else if (event.type === "delivered") {
        const nextSession = currentSession + 1;
        if (nextSession >= schedule.sessionCount) continue;

        const personData = personSessionData.find((p) => p.personId === event.personId);
        if (personData && personData.presentInSession[nextSession]) {
          const pos = personData.sessionPositions[nextSession];
          triggeredEventsRef.current.add(eventId);

          setCoordination((prev) => {
            const newDelivered = new Map(prev.deliveredPeople);
            newDelivered.set(event.personId, { visible: false });
            return { ...prev, deliveredPeople: newDelivered };
          });

          setActiveStorks((prev) => [
            ...prev,
            {
              id: eventId,
              personId: event.personId,
              targetPosition: pos.clone(),
              personName: personData.name,
              state: "flying_in" as StorkState,
            },
          ]);
        }
      }
    }
  });

  const handleDinoComplete = useCallback((dinoId: string) => {
    setActiveDinos((prev) => prev.filter((d) => d.id !== dinoId));
  }, []);

  const handleStorkComplete = useCallback((storkId: string) => {
    setActiveStorks((prev) => prev.filter((s) => s.id !== storkId));
  }, []);

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

  const groundSize = Math.max(80, sceneScale * 2.5);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[sceneScale, sceneScale * 1.5, sceneScale]}
        intensity={1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={["#87CEEB", "#4a7c59", 0.4]} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={5}
        maxDistance={sceneScale * 5}
        maxPolarAngle={Math.PI / 2 - 0.1}
        target={[0, 0, 0]}
      />

      <Sky />
      <Ground size={groundSize} />

      {Array.from(groupLayouts.values()).map((layout) => (
        <GroupPlatform
          key={layout.groupId}
          layout={layout}
          peopleCount={peopleCountByGroup.get(layout.groupId) || 0}
        />
      ))}

      <GLTFHumanoids
        personData={personSessionData}
        playbackRef={playbackRef}
        transitions={transitions}
        sessionCount={schedule.sessionCount}
        onUIUpdate={onUIUpdate}
        coordination={coordination}
      />

      {activeDinos.map((dino) => (
        <Dinosaur
          key={dino.id}
          targetPosition={dino.targetPosition}
          personName={dino.personName}
          personId={dino.personId}
          state={dino.state}
          sceneScale={sceneScale}
          onAnimationComplete={() => handleDinoComplete(dino.id)}
          onPhaseChange={handleDinoPhaseChange}
          onPlaySound={onPlayDinoSound}
        />
      ))}

      {activeStorks.map((stork) => (
        <Stork
          key={stork.id}
          targetPosition={stork.targetPosition}
          personName={stork.personName}
          personId={stork.personId}
          state={stork.state}
          sceneScale={sceneScale}
          onAnimationComplete={() => handleStorkComplete(stork.id)}
          onPhaseChange={handleStorkPhaseChange}
          onPlaySound={onPlayStorkSound}
        />
      ))}
    </>
  );
}
