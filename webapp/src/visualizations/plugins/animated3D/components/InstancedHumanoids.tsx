import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { PersonSessionData } from "../hooks/useAnimationState";
import type { PlaybackState, SessionTransition } from "../types";

interface InstancedHumanoidsProps {
  personData: PersonSessionData[];
  playbackRef: React.MutableRefObject<PlaybackState>;
  transitions: SessionTransition[];
  sessionCount: number;
  onUIUpdate: (state: PlaybackState) => void;
}

// Temporary vectors for calculations (reused to avoid GC)
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3(1, 1, 1);
const tempColor = new THREE.Color();

export function InstancedHumanoids({
  personData,
  playbackRef,
  transitions,
  sessionCount,
  onUIUpdate,
}: InstancedHumanoidsProps) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);

  const count = personData.length;

  // Store current positions and target positions in typed arrays for GPU efficiency
  const positionsRef = useRef<Float32Array>(new Float32Array(count * 3));
  const targetPositionsRef = useRef<Float32Array>(new Float32Array(count * 3));
  const statesRef = useRef<Uint8Array>(new Uint8Array(count)); // 0=idle, 1=walking, 2=eaten, 3=delivered

  // Initialize colors once
  const colors = useMemo(() => {
    const arr = new Float32Array(count * 3);
    personData.forEach((p, i) => {
      arr[i * 3] = p.color.r;
      arr[i * 3 + 1] = p.color.g;
      arr[i * 3 + 2] = p.color.b;
    });
    return arr;
  }, [personData, count]);

  // Set initial colors on instanced meshes
  useEffect(() => {
    if (!bodyRef.current) return;
    
    for (let i = 0; i < count; i++) {
      tempColor.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
      bodyRef.current.setColorAt(i, tempColor);
    }
    bodyRef.current.instanceColor!.needsUpdate = true;
  }, [colors, count]);

  // Initialize positions from session 0
  useEffect(() => {
    personData.forEach((p, i) => {
      const pos = p.sessionPositions[0];
      positionsRef.current[i * 3] = pos.x;
      positionsRef.current[i * 3 + 1] = pos.y;
      positionsRef.current[i * 3 + 2] = pos.z;
      targetPositionsRef.current[i * 3] = pos.x;
      targetPositionsRef.current[i * 3 + 1] = pos.y;
      targetPositionsRef.current[i * 3 + 2] = pos.z;
      statesRef.current[i] = p.presentInSession[0] ? 0 : 2; // idle or hidden
    });
  }, [personData]);

  // Track last session for detecting changes
  const lastSessionRef = useRef(0);
  const uiUpdateCounterRef = useRef(0);

  // Main animation loop - runs every frame, no React state updates
  useFrame((state, delta) => {
    if (!bodyRef.current || !headRef.current) return;

    const playback = playbackRef.current;
    const currentSession = playback.currentSession;
    const nextSession = Math.min(currentSession + 1, sessionCount - 1);
    const progress = playback.transitionProgress;

    // Detect session change to update targets
    if (lastSessionRef.current !== currentSession) {
      lastSessionRef.current = currentSession;
      
      // Update target positions for all people
      personData.forEach((p, i) => {
        const currentPos = p.sessionPositions[currentSession];
        const nextPos = p.sessionPositions[nextSession];
        const presentNow = p.presentInSession[currentSession];
        const presentNext = p.presentInSession[nextSession];

        // Set current position
        positionsRef.current[i * 3] = currentPos.x;
        positionsRef.current[i * 3 + 1] = presentNow ? 0 : -10;
        positionsRef.current[i * 3 + 2] = currentPos.z;

        // Set target
        targetPositionsRef.current[i * 3] = nextPos.x;
        targetPositionsRef.current[i * 3 + 1] = presentNext ? 0 : -10;
        targetPositionsRef.current[i * 3 + 2] = nextPos.z;

        // Determine state
        if (!presentNow && !presentNext) {
          statesRef.current[i] = 2; // hidden
        } else if (!presentNow && presentNext) {
          statesRef.current[i] = 3; // being delivered
        } else if (presentNow && !presentNext) {
          statesRef.current[i] = 2; // being eaten
        } else {
          // Check if moving
          const dx = nextPos.x - currentPos.x;
          const dz = nextPos.z - currentPos.z;
          statesRef.current[i] = (dx * dx + dz * dz > 0.01) ? 1 : 0;
        }
      });
    }

    // Advance playback if playing
    if (playback.isPlaying) {
      const transitionDuration = 3 / playback.speed;
      const newProgress = playback.transitionProgress + delta / transitionDuration;

      if (newProgress >= 1) {
        // Transition complete
        if (currentSession < sessionCount - 1) {
          playbackRef.current = {
            ...playback,
            currentSession: currentSession + 1,
            transitionProgress: 0,
          };
        } else {
          // End of animation
          playbackRef.current = {
            ...playback,
            isPlaying: false,
            transitionProgress: 0,
          };
        }
      } else {
        playbackRef.current = {
          ...playback,
          transitionProgress: newProgress,
        };
      }

      // Throttled UI update (every 10 frames)
      uiUpdateCounterRef.current++;
      if (uiUpdateCounterRef.current >= 10) {
        uiUpdateCounterRef.current = 0;
        onUIUpdate({ ...playbackRef.current });
      }
    }

    // Update instance matrices based on interpolated positions
    const t = progress;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < count; i++) {
      const state_i = statesRef.current[i];
      
      // Skip hidden instances
      if (state_i === 2 && t > 0.8) {
        // Hide by scaling to 0
        tempScale.set(0.001, 0.001, 0.001);
        tempPosition.set(0, -100, 0);
      } else {
        tempScale.set(1, 1, 1);

        // Lerp position
        const x0 = positionsRef.current[i * 3];
        const y0 = positionsRef.current[i * 3 + 1];
        const z0 = positionsRef.current[i * 3 + 2];
        const x1 = targetPositionsRef.current[i * 3];
        const y1 = targetPositionsRef.current[i * 3 + 1];
        const z1 = targetPositionsRef.current[i * 3 + 2];

        // Smooth interpolation with easing
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        
        tempPosition.set(
          x0 + (x1 - x0) * easedT,
          y0 + (y1 - y0) * easedT,
          z0 + (z1 - z0) * easedT
        );

        // Add walking bob and rotation
        if (state_i === 1 && t > 0 && t < 1) {
          // Walking animation
          const walkBob = Math.abs(Math.sin(time * 10 + i)) * 0.1;
          tempPosition.y += walkBob;

          // Face direction of movement
          const dx = x1 - x0;
          const dz = z1 - z0;
          if (dx !== 0 || dz !== 0) {
            const angle = Math.atan2(dx, dz);
            tempQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
          }
        } else if (state_i === 3) {
          // Being delivered - come from above
          tempPosition.y = 15 * (1 - easedT);
        } else {
          // Idle - gentle breathing
          const breath = Math.sin(time * 2 + i * 0.5) * 0.02;
          tempPosition.y += breath;
          tempQuaternion.identity();
        }
      }

      // Body instance
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      bodyRef.current.setMatrixAt(i, tempMatrix);

      // Head instance (offset up)
      tempPosition.y += 0.6;
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      headRef.current.setMatrixAt(i, tempMatrix);
    }

    bodyRef.current.instanceMatrix.needsUpdate = true;
    headRef.current.instanceMatrix.needsUpdate = true;
  });

  // Skin tone for heads
  const skinTone = useMemo(() => new THREE.Color("#e0b89e"), []);

  return (
    <>
      {/* Bodies - instanced capsule meshes */}
      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.2, 0.5, 4, 8]} />
        <meshStandardMaterial />
      </instancedMesh>

      {/* Heads - instanced sphere meshes */}
      <instancedMesh ref={headRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshStandardMaterial color={skinTone} />
      </instancedMesh>

      {/* Name labels - only show for visible, non-moving people when zoomed in */}
      {/* We'll add this with a separate component that updates less frequently */}
    </>
  );
}

// Separate component for labels (updates less frequently)
interface PersonLabelsProps {
  personData: PersonSessionData[];
  playbackRef: React.MutableRefObject<PlaybackState>;
}

export function PersonLabels({ personData, playbackRef }: PersonLabelsProps) {
  const labelsRef = useRef<Array<{ visible: boolean; position: THREE.Vector3 }>>([]);
  
  // Only show first 50 labels to keep performance reasonable
  const maxLabels = 50;
  const labelData = personData.slice(0, maxLabels);

  // Update label positions less frequently
  useFrame(() => {
    const currentSession = playbackRef.current.currentSession;
    
    labelData.forEach((p, i) => {
      if (!labelsRef.current[i]) {
        labelsRef.current[i] = { visible: false, position: new THREE.Vector3() };
      }
      
      const present = p.presentInSession[currentSession];
      labelsRef.current[i].visible = present;
      
      if (present) {
        labelsRef.current[i].position.copy(p.sessionPositions[currentSession]);
        labelsRef.current[i].position.y = 1.5;
      }
    });
  });

  return (
    <>
      {labelData.map((p, i) => (
        <PersonLabel
          key={p.personId}
          name={p.name}
          position={p.sessionPositions[playbackRef.current.currentSession]}
          visible={p.presentInSession[playbackRef.current.currentSession]}
        />
      ))}
    </>
  );
}

interface PersonLabelProps {
  name: string;
  position: THREE.Vector3;
  visible: boolean;
}

function PersonLabel({ name, position, visible }: PersonLabelProps) {
  if (!visible) return null;
  
  return (
    <Html
      position={[position.x, position.y + 1.5, position.z]}
      center
      distanceFactor={15}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      <div
        style={{
          background: "rgba(0, 0, 0, 0.7)",
          color: "white",
          padding: "2px 6px",
          borderRadius: "4px",
          fontSize: "10px",
          fontFamily: "sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </div>
    </Html>
  );
}
