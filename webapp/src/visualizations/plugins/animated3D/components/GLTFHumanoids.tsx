import { Suspense, useMemo, useRef, useEffect, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Html } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { PersonSessionData } from "../hooks/useAnimationState";
import type { PlaybackState, SessionTransition } from "../types";
import type { AnimationCoordination } from "./Scene";

// Model URL
const CHARACTER_MODEL_URL = "/models/character.glb";

// Performance limit - GLTF characters are more expensive
const MAX_GLTF_CHARACTERS = 40;

interface GLTFHumanoidsProps {
  personData: PersonSessionData[];
  playbackRef: React.MutableRefObject<PlaybackState>;
  transitions: SessionTransition[];
  sessionCount: number;
  onUIUpdate: (state: PlaybackState) => void;
  coordination: AnimationCoordination;
  showLabels: boolean;
}

// Individual character component
function Character({
  person,
  scene,
  animations,
  currentPosition,
  targetPosition,
  isMoving,
  progress,
  isEaten,
  isDelivered,
  isBeingDelivered,
  showLabel,
}: {
  person: PersonSessionData;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  currentPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  isMoving: boolean;
  progress: number;
  isEaten: boolean;
  isDelivered: boolean;
  isBeingDelivered: boolean;
  showLabel: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  
  // Clone scene for this character
  const clone = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene);
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return cloned;
  }, [scene]);
  
  const { actions, mixer } = useAnimations(animations, clone);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const lastAnimStateRef = useRef<string>("");
  const targetRotationRef = useRef<number>(0);
  
  // Start idle animation immediately when component mounts
  useEffect(() => {
    const animNames = Object.keys(actions);
    const idleAnim = animNames.find(n => 
      n.toLowerCase() === "idle"
    ) || animNames.find(n => 
      n.toLowerCase().includes("idle") || n.toLowerCase().includes("stand")
    ) || animNames[0];
    
    if (idleAnim && actions[idleAnim]) {
      actions[idleAnim]?.reset().fadeIn(0.1).play();
      currentActionRef.current = actions[idleAnim] || null;
      lastAnimStateRef.current = "idle";
    }
  }, [actions]);
  
  // Apply color tint
  useEffect(() => {
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        // Clone material to avoid affecting other instances
        if (Array.isArray(child.material)) {
          child.material = child.material.map(m => {
            const mat = m.clone();
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.color.lerp(person.color, 0.4);
            }
            return mat;
          });
        } else {
          const mat = child.material.clone();
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.color.lerp(person.color, 0.4);
          }
          child.material = mat;
        }
      }
    });
  }, [clone, person.color]);

  // Update position, animation, and rotation every frame
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    
    // Update animation mixer
    mixer.update(delta);
    
    // Handle visibility for eaten characters
    if (isEaten) {
      groupRef.current.visible = false;
      return;
    }
    
    // Handle visibility for characters being delivered (hide until stork drops them)
    if (isBeingDelivered && !isDelivered) {
      groupRef.current.visible = false;
      return;
    }
    
    groupRef.current.visible = true;
    
    // Determine if character should be walking or idle based on actual movement
    // Character walks only when: moving AND progress is between 0.05 and 0.95 (mid-transition)
    const isActuallyMoving = isMoving && progress > 0.05 && progress < 0.95;
    const animState = isActuallyMoving ? "walking" : "idle";
    
    // Handle animation transitions
    if (lastAnimStateRef.current !== animState) {
      lastAnimStateRef.current = animState;
      
      const animNames = Object.keys(actions);
      let targetAnimName: string | null = null;
      
      if (animState === "walking") {
        // Look for walk animation first, then run
        targetAnimName = animNames.find(n => 
          n.toLowerCase() === "walk"
        ) || animNames.find(n => 
          n.toLowerCase().includes("walk")
        ) || animNames.find(n => 
          n.toLowerCase().includes("run")
        ) || animNames[0];
      } else {
        // Idle animation
        targetAnimName = animNames.find(n => 
          n.toLowerCase() === "idle"
        ) || animNames.find(n => 
          n.toLowerCase().includes("idle") ||
          n.toLowerCase().includes("stand")
        ) || animNames[0];
      }
      
      if (targetAnimName) {
        const targetAction = actions[targetAnimName];
        if (targetAction) {
          // Crossfade to new animation
          if (currentActionRef.current && currentActionRef.current !== targetAction) {
            currentActionRef.current.fadeOut(0.3);
          }
          
          targetAction.reset().fadeIn(0.3).play();
          targetAction.setEffectiveTimeScale(animState === "walking" ? 1.0 : 0.8);
          currentActionRef.current = targetAction;
        }
      }
    }
    
    // Interpolate position
    const easedT = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    groupRef.current.position.lerpVectors(currentPosition, targetPosition, easedT);
    
    // Drop animation for delivered characters
    if (isBeingDelivered && isDelivered && progress < 0.5) {
      groupRef.current.position.y += 4 * (1 - progress * 2);
    }
    
    // Face movement direction - only update target when actually moving
    if (isActuallyMoving) {
      const dir = targetPosition.clone().sub(currentPosition);
      if (dir.lengthSq() > 0.1) {
        // Add PI to flip 180 degrees - model faces -Z by default
        targetRotationRef.current = Math.atan2(dir.x, dir.z) + Math.PI;
      }
    }
    
    // Always smoothly rotate towards target rotation
    const currentAngle = groupRef.current.rotation.y;
    let angleDiff = targetRotationRef.current - currentAngle;
    
    // Normalize angle difference
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    
    // Smooth rotation - faster when moving
    const rotSpeed = isActuallyMoving ? 0.15 : 0.05;
    groupRef.current.rotation.y += angleDiff * rotSpeed;
  });
  
  return (
    <group ref={groupRef} scale={[0.5, 0.5, 0.5]}>
      <primitive object={clone} />
      
      {showLabel && (
        <Html
          position={[0, 4, 0]}
          center
          distanceFactor={12}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            style={{
              background: "rgba(0, 0, 0, 0.8)",
              color: "white",
              padding: "4px 10px",
              borderRadius: "4px",
              fontSize: "12px",
              fontFamily: "system-ui, sans-serif",
              whiteSpace: "nowrap",
              fontWeight: 500,
            }}
          >
            {person.name}
          </div>
        </Html>
      )}
    </group>
  );
}

// Fallback error display
function ModelLoadError() {
  return (
    <Html center>
      <div style={{
        background: "linear-gradient(135deg, #ff6b6b, #ee5a24)",
        color: "white",
        padding: "20px 30px",
        borderRadius: "12px",
        textAlign: "center",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        maxWidth: "300px"
      }}>
        <div style={{ fontSize: "24px", marginBottom: "10px" }}>⚠️</div>
        <div style={{ fontWeight: "bold", fontSize: "16px" }}>Character Model Not Found</div>
        <div style={{ fontSize: "12px", marginTop: "10px", opacity: 0.9 }}>
          Download a Mixamo character and save it to:
          <br />
          <code style={{ 
            background: "rgba(0,0,0,0.3)", 
            padding: "4px 8px", 
            borderRadius: "4px",
            display: "inline-block",
            marginTop: "5px"
          }}>
            public/models/character.glb
          </code>
        </div>
      </div>
    </Html>
  );
}

// Main component
export function GLTFHumanoids({
  personData,
  playbackRef,
  transitions,
  sessionCount,
  onUIUpdate,
  coordination,
  showLabels,
}: GLTFHumanoidsProps) {
  const [modelError, setModelError] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  
  // Load model
  const gltf = useGLTF(CHARACTER_MODEL_URL, true, true, (error) => {
    console.error("Failed to load character model:", error);
    setModelError(true);
  });
  
  useEffect(() => {
    if (gltf.scene && gltf.animations) {
      setModelLoaded(true);
      console.log("Character model loaded, animations:", gltf.animations.map(a => a.name));
    }
  }, [gltf]);

  // Limit characters for performance
  const visiblePeople = useMemo(() => 
    personData.slice(0, MAX_GLTF_CHARACTERS),
    [personData]
  );
  
  const prevSessionRef = useRef(-1);
  const lastSessionRef = useRef(-1);
  const uiUpdateCounterRef = useRef(0);

  // Track character states
  const [characterStates, setCharacterStates] = useState<Map<string, {
    currentPos: THREE.Vector3;
    targetPos: THREE.Vector3;
    isMoving: boolean;
    isBeingDelivered: boolean;
    isGone: boolean;
  }>>(new Map());

  // Initialize states
  useEffect(() => {
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
  }, [visiblePeople]);

  // Update character states and advance playback
  useFrame((_, delta) => {
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

  const playback = playbackRef.current;

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
          <Character
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
