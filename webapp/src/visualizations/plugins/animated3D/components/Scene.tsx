import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { InstancedHumanoids, PersonLabels } from "./InstancedHumanoids";
import { Dinosaur, type DinoState } from "./Dinosaur";
import { Stork, type StorkState } from "./Stork";
import { GroupPlatform } from "./GroupPlatform";
import { Ground } from "./Ground";
import { Sky } from "./Sky";
import type { GroupLayout, AnimationEvent, PlaybackState, SessionTransition } from "../types";
import type { NormalizedSchedule } from "../../../models/normalize";
import type { PersonSessionData } from "../hooks/useAnimationState";

interface SceneProps {
  groupLayouts: Map<string, GroupLayout>;
  personSessionData: PersonSessionData[];
  transitions: SessionTransition[];
  schedule: NormalizedSchedule;
  playbackRef: React.MutableRefObject<PlaybackState>;
  onPlayDinoSound?: (sound: "roar" | "chomp" | "dig") => void;
  onPlayStorkSound?: (sound: "flap") => void;
  onUIUpdate: (state: PlaybackState) => void;
}

// Track active dinosaurs and storks
interface ActiveDino {
  id: string;
  targetPosition: THREE.Vector3;
  state: DinoState;
}

interface ActiveStork {
  id: string;
  targetPosition: THREE.Vector3;
  personName: string;
  state: StorkState;
}

export function Scene({
  groupLayouts,
  personSessionData,
  transitions,
  schedule,
  playbackRef,
  onPlayDinoSound,
  onPlayStorkSound,
  onUIUpdate,
}: SceneProps) {
  // Active special animations
  const [activeDinos, setActiveDinos] = useState<ActiveDino[]>([]);
  const [activeStorks, setActiveStorks] = useState<ActiveStork[]>([]);

  // Track which events have been triggered
  const triggeredEventsRef = useRef<Set<string>>(new Set());
  const lastSessionRef = useRef(-1);

  // Check for special events (dinos/storks) in the animation loop
  useFrame(() => {
    const playback = playbackRef.current;
    const currentSession = playback.currentSession;
    const progress = playback.transitionProgress;

    // Reset triggered events when session changes
    if (lastSessionRef.current !== currentSession) {
      lastSessionRef.current = currentSession;
      triggeredEventsRef.current = new Set();
    }

    // Only trigger events after progress threshold
    if (progress < 0.15 || currentSession >= transitions.length) return;

    const transition = transitions[currentSession];
    if (!transition) return;

    // Check for eaten and delivered events
    for (const event of transition.events) {
      const eventId = `${event.type}-${event.personId}-${currentSession}`;
      if (triggeredEventsRef.current.has(eventId)) continue;

      if (event.type === "eaten") {
        const personData = personSessionData.find(p => p.personId === event.personId);
        if (personData) {
          const pos = personData.sessionPositions[currentSession];
          triggeredEventsRef.current.add(eventId);
          setActiveDinos(prev => [...prev, {
            id: eventId,
            targetPosition: pos.clone(),
            state: "emerging" as DinoState,
          }]);
        }
      } else if (event.type === "delivered") {
        const groupLayout = groupLayouts.get(event.toGroup);
        if (groupLayout) {
          const personData = personSessionData.find(p => p.personId === event.personId);
          const personName = personData?.name || event.personId;
          triggeredEventsRef.current.add(eventId);
          setActiveStorks(prev => [...prev, {
            id: eventId,
            targetPosition: groupLayout.position.clone(),
            personName,
            state: "flying_in" as StorkState,
          }]);
        }
      }
    }
  });

  // Handle dino animation complete
  const handleDinoComplete = useCallback((dinoId: string) => {
    setActiveDinos(prev => prev.filter(d => d.id !== dinoId));
  }, []);

  // Handle stork animation complete
  const handleStorkComplete = useCallback((storkId: string) => {
    setActiveStorks(prev => prev.filter(s => s.id !== storkId));
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

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[30, 50, 30]}
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
        minDistance={10}
        maxDistance={150}
        maxPolarAngle={Math.PI / 2 - 0.1}
        target={[0, 0, 0]}
      />

      {/* Environment */}
      <Sky />
      <Ground size={100} />

      {/* Group platforms */}
      {Array.from(groupLayouts.values()).map(layout => (
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
      <PersonLabels
        personData={personSessionData}
        playbackRef={playbackRef}
      />

      {/* Dinosaurs */}
      {activeDinos.map(dino => (
        <Dinosaur
          key={dino.id}
          targetPosition={dino.targetPosition}
          state={dino.state}
          onAnimationComplete={() => handleDinoComplete(dino.id)}
          onPlaySound={onPlayDinoSound}
        />
      ))}

      {/* Storks */}
      {activeStorks.map(stork => (
        <Stork
          key={stork.id}
          targetPosition={stork.targetPosition}
          personName={stork.personName}
          state={stork.state}
          onAnimationComplete={() => handleStorkComplete(stork.id)}
          onPlaySound={onPlayStorkSound}
        />
      ))}
    </>
  );
}
