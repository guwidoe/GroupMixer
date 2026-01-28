import { Suspense, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { PersonSessionData } from "../hooks/useAnimationState";
import type { PlaybackState } from "../types";
import type { AnimationCoordination } from "./Scene";
import { GLTFCharacter } from "./GLTFCharacter";
import { ModelLoadError } from "./ModelLoadError";

// Model URL
const CHARACTER_MODEL_URL = "/models/character.glb";

// Performance limit - GLTF characters are more expensive
const MAX_GLTF_CHARACTERS = 40;

interface GLTFHumanoidsProps {
  personData: PersonSessionData[];
  playbackRef: React.MutableRefObject<PlaybackState>;
  sessionCount: number;
  onUIUpdate: (state: PlaybackState) => void;
  coordination: AnimationCoordination;
  showLabels: boolean;
  playbackState: PlaybackState;
}


// Main component
export function GLTFHumanoids({
  personData,
  playbackRef,
  sessionCount,
  onUIUpdate,
  coordination,
  showLabels,
  playbackState,
}: GLTFHumanoidsProps) {
  const [modelError, setModelError] = useState(false);
  
  // Load model
  const gltf = useGLTF(CHARACTER_MODEL_URL, true, true, (error) => {
    console.error("Failed to load character model:", error);
    setModelError(true);
  });
  
  const modelLoaded = Boolean(gltf.scene && gltf.animations);

  // Limit characters for performance
  const visiblePeople = useMemo(() => 
    personData.slice(0, MAX_GLTF_CHARACTERS),
    [personData]
  );
  
  const prevSessionRef = useRef(-1);
  const lastSessionRef = useRef(-1);
  const uiUpdateCounterRef = useRef(0);
  const visibleKeyRef = useRef("");

  // Track character states
  const [characterStates, setCharacterStates] = useState<Map<string, {
    currentPos: THREE.Vector3;
    targetPos: THREE.Vector3;
    isMoving: boolean;
    isBeingDelivered: boolean;
    isGone: boolean;
  }>>(new Map());

  const visibleKey = useMemo(
    () => visiblePeople.map((p) => p.personId).join("|"),
    [visiblePeople]
  );

  // Update character states and advance playback
  useFrame((_, delta) => {
    if (visibleKeyRef.current !== visibleKey) {
      visibleKeyRef.current = visibleKey;
      const states = new Map<string, {
        currentPos: THREE.Vector3;
        targetPos: THREE.Vector3;
        isMoving: boolean;
        isBeingDelivered: boolean;
        isGone: boolean;
      }>();

      visiblePeople.forEach((p) => {
        const pos = p.sessionPositions[0].clone();
        pos.y = 0;
        states.set(p.personId, {
          currentPos: pos,
          targetPos: pos.clone(),
          isMoving: false,
          isBeingDelivered: !p.presentInSession[0],
          isGone: false,
        });
      });

      setCharacterStates(states);
      lastSessionRef.current = -1;
      prevSessionRef.current = -1;
    }

    const playback = playbackRef.current;
    const currentSession = playback.currentSession;
    const nextSession = Math.min(currentSession + 1, sessionCount - 1);

    // Detect reset
    if (prevSessionRef.current > currentSession) {
      lastSessionRef.current = -1;
    }
    prevSessionRef.current = currentSession;

    // Update states on session change
    if (lastSessionRef.current !== currentSession) {
      lastSessionRef.current = currentSession;

      setCharacterStates((prev) => {
        const newStates = new Map(prev);
        
        visiblePeople.forEach((p) => {
          const currentPos = p.sessionPositions[currentSession].clone();
          const nextPos = p.sessionPositions[nextSession].clone();
          currentPos.y = 0;
          nextPos.y = 0;
          
          const presentNow = p.presentInSession[currentSession];
          const presentNext = p.presentInSession[nextSession];

          // Calculate movement distance
          const dx = nextPos.x - currentPos.x;
          const dz = nextPos.z - currentPos.z;
          const isMoving = presentNow && presentNext && (dx * dx + dz * dz > 0.1);
          
          // Determine special states
          const isBeingDelivered = !presentNow && presentNext; // Arriving via stork
          const isGone = (!presentNow && !presentNext) || (presentNow && !presentNext); // Gone or leaving

          newStates.set(p.personId, {
            currentPos,
            targetPos: nextPos,
            isMoving,
            isBeingDelivered,
            isGone,
          });
        });
        
        return newStates;
      });
    }

    // Advance playback
    if (playback.isPlaying) {
      const transitionDuration = 3 / playback.speed;
      const newProgress = playback.transitionProgress + delta / transitionDuration;

      if (newProgress >= 1) {
        if (currentSession < sessionCount - 1) {
          playbackRef.current = {
            ...playback,
            currentSession: currentSession + 1,
            transitionProgress: 0,
          };
        } else {
          playbackRef.current = {
            ...playback,
            isPlaying: false,
            transitionProgress: 0,
          };
        }
      } else {
        playbackRef.current = { ...playback, transitionProgress: newProgress };
      }

      // Throttled UI update
      uiUpdateCounterRef.current++;
      if (uiUpdateCounterRef.current >= 10) {
        uiUpdateCounterRef.current = 0;
        onUIUpdate({ ...playbackRef.current });
      }
    }
  });

  if (modelError) {
    return <ModelLoadError />;
  }

  if (!modelLoaded) {
    return null;
  }

  const playback = playbackState;

  return (
    <Suspense fallback={null}>
      {visiblePeople.map((person, index) => {
        const charState = characterStates.get(person.personId);
        if (!charState) return null;

        const eatenInfo = coordination.eatenPeople.get(person.personId);
        const deliveredInfo = coordination.deliveredPeople.get(person.personId);

        // Determine if eaten (by dinosaur coordination or gone state)
        const isEaten = (eatenInfo?.hidden ?? false) || charState.isGone;
        
        // Determine if delivered (stork has dropped them)
        const isDelivered = deliveredInfo?.visible ?? !charState.isBeingDelivered;

        return (
          <GLTFCharacter
            key={person.personId}
            person={person}
            scene={gltf.scene}
            animations={gltf.animations}
            currentPosition={charState.currentPos}
            targetPosition={charState.targetPos}
            isMoving={charState.isMoving}
            progress={playback.transitionProgress}
            isEaten={isEaten}
            isDelivered={isDelivered}
            isBeingDelivered={charState.isBeingDelivered}
            showLabel={showLabels && index < 30}
          />
        );
      })}
    </Suspense>
  );
}

// Preload
GLTFHumanoids.preload = () => {
  useGLTF.preload(CHARACTER_MODEL_URL);
};
