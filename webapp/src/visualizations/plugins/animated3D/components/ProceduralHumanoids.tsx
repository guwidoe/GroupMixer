import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { PersonSessionData } from "../hooks/useAnimationState";
import type { AnimationCoordination, PlaybackState } from "../types";
import { ProceduralCharacter } from "./ProceduralCharacter";

const MAX_PROCEDURAL_CHARACTERS = 80;

interface ProceduralHumanoidsProps {
  personData: PersonSessionData[];
  playbackRef: React.MutableRefObject<PlaybackState>;
  sessionCount: number;
  onUIUpdate: (state: PlaybackState) => void;
  coordination: AnimationCoordination;
  showLabels: boolean;
  playbackState: PlaybackState;
}

interface CharacterState {
  currentPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  isMoving: boolean;
  isBeingDelivered: boolean;
  isGone: boolean;
}

export function ProceduralHumanoids({
  personData,
  playbackRef,
  sessionCount,
  onUIUpdate,
  coordination,
  showLabels,
  playbackState,
}: ProceduralHumanoidsProps) {
  const visiblePeople = useMemo(
    () => personData.slice(0, MAX_PROCEDURAL_CHARACTERS),
    [personData]
  );

  const prevSessionRef = useRef(-1);
  const lastSessionRef = useRef(-1);
  const uiUpdateCounterRef = useRef(0);
  const visibleKeyRef = useRef("");
  const [characterStates, setCharacterStates] = useState<Map<string, CharacterState>>(new Map());

  const visibleKey = useMemo(
    () => visiblePeople.map((person) => person.personId).join("|"),
    [visiblePeople]
  );

  useFrame((_, delta) => {
    if (visibleKeyRef.current !== visibleKey) {
      visibleKeyRef.current = visibleKey;
      const states = new Map<string, CharacterState>();

      visiblePeople.forEach((person) => {
        const position = person.sessionPositions[0].clone();
        position.y = 0;
        states.set(person.personId, {
          currentPos: position,
          targetPos: position.clone(),
          isMoving: false,
          isBeingDelivered: !person.presentInSession[0],
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

    if (prevSessionRef.current > currentSession) {
      lastSessionRef.current = -1;
    }
    prevSessionRef.current = currentSession;

    if (lastSessionRef.current !== currentSession) {
      lastSessionRef.current = currentSession;

      setCharacterStates((previous) => {
        const nextStates = new Map(previous);

        visiblePeople.forEach((person) => {
          const currentPos = person.sessionPositions[currentSession].clone();
          const nextPos = person.sessionPositions[nextSession].clone();
          currentPos.y = 0;
          nextPos.y = 0;

          const presentNow = person.presentInSession[currentSession];
          const presentNext = person.presentInSession[nextSession];
          const dx = nextPos.x - currentPos.x;
          const dz = nextPos.z - currentPos.z;
          const isMoving = presentNow && presentNext && (dx * dx + dz * dz > 0.1);

          nextStates.set(person.personId, {
            currentPos,
            targetPos: nextPos,
            isMoving,
            isBeingDelivered: !presentNow && presentNext,
            isGone: (!presentNow && !presentNext) || (presentNow && !presentNext),
          });
        });

        return nextStates;
      });
    }

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

      uiUpdateCounterRef.current += 1;
      if (uiUpdateCounterRef.current >= 10) {
        uiUpdateCounterRef.current = 0;
        onUIUpdate({ ...playbackRef.current });
      }
    }
  });

  return (
    <>
      {visiblePeople.map((person, index) => {
        const characterState = characterStates.get(person.personId);
        if (!characterState) {
          return null;
        }

        const eatenInfo = coordination.eatenPeople.get(person.personId);
        const deliveredInfo = coordination.deliveredPeople.get(person.personId);
        const isEaten = (eatenInfo?.hidden ?? false) || characterState.isGone;
        const isDelivered = deliveredInfo?.visible ?? !characterState.isBeingDelivered;

        return (
          <ProceduralCharacter
            key={person.personId}
            person={person}
            currentPosition={characterState.currentPos}
            targetPosition={characterState.targetPos}
            isMoving={characterState.isMoving}
            progress={playbackState.transitionProgress}
            isEaten={isEaten}
            isDelivered={isDelivered}
            isBeingDelivered={characterState.isBeingDelivered}
            showLabel={showLabels && index < 30}
          />
        );
      })}
    </>
  );
}
