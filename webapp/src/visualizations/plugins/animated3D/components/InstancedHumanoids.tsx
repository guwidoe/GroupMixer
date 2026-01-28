import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { PersonSessionData } from "../hooks/useAnimationState";
import type { PlaybackState, SessionTransition } from "../types";
import type { AnimationCoordination } from "./Scene";
import { usePersonBuffers } from "./InstancedHumanoids/buffers";
import { useHumanoidColors } from "./InstancedHumanoids/coloring";
import { hideInstancedPerson } from "./InstancedHumanoids/utils";
interface InstancedHumanoidsProps {
  personData: PersonSessionData[];
  playbackRef: React.MutableRefObject<PlaybackState>;
  transitions: SessionTransition[];
  sessionCount: number;
  onUIUpdate: (state: PlaybackState) => void;
  coordination: AnimationCoordination;
}

// Reusable objects
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3(1, 1, 1);
const tempEuler = new THREE.Euler();
export function InstancedHumanoids({
  personData,
  playbackRef,
  transitions,
  sessionCount,
  onUIUpdate,
  coordination,
}: InstancedHumanoidsProps) {
  const torsoRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const hairRef = useRef<THREE.InstancedMesh>(null);
  const leftUpperArmRef = useRef<THREE.InstancedMesh>(null);
  const rightUpperArmRef = useRef<THREE.InstancedMesh>(null);
  const leftLowerArmRef = useRef<THREE.InstancedMesh>(null);
  const rightLowerArmRef = useRef<THREE.InstancedMesh>(null);
  const leftUpperLegRef = useRef<THREE.InstancedMesh>(null);
  const rightUpperLegRef = useRef<THREE.InstancedMesh>(null);
  const leftLowerLegRef = useRef<THREE.InstancedMesh>(null);
  const rightLowerLegRef = useRef<THREE.InstancedMesh>(null);
  const leftFootRef = useRef<THREE.InstancedMesh>(null);
  const rightFootRef = useRef<THREE.InstancedMesh>(null);
  const leftHandRef = useRef<THREE.InstancedMesh>(null);
  const rightHandRef = useRef<THREE.InstancedMesh>(null);
  const meshRefs = useMemo(
    () => ({
      torsoRef,
      headRef,
      hairRef,
      leftUpperArmRef,
      rightUpperArmRef,
      leftLowerArmRef,
      rightLowerArmRef,
      leftUpperLegRef,
      rightUpperLegRef,
      leftLowerLegRef,
      rightLowerLegRef,
      leftFootRef,
      rightFootRef,
      leftHandRef,
      rightHandRef,
    }),
    []
  );
  const count = personData.length;

  const { positionsRef, targetPositionsRef, statesRef, lastSessionRef, prevSessionRef } =
    usePersonBuffers(personData);
  useHumanoidColors(personData, count, {
    headRef,
    hairRef,
    torsoRef,
    leftLowerArmRef,
    rightLowerArmRef,
    leftHandRef,
    rightHandRef,
    leftUpperArmRef,
    rightUpperArmRef,
  });

  // Use -1 as sentinel so first frame always triggers position setup
  const uiUpdateCounterRef = useRef(0);


  useFrame((state, delta) => {
    if (!torsoRef.current || !headRef.current) return;

    const playback = playbackRef.current;
    const currentSession = playback.currentSession;
    const nextSession = Math.min(currentSession + 1, sessionCount - 1);
    const progress = playback.transitionProgress;

    // Detect reset: when session goes backwards
    const wasReset = prevSessionRef.current > currentSession;
    if (wasReset) {
      lastSessionRef.current = -1; // Force position recalculation
    }
    prevSessionRef.current = currentSession;

    // Update positions when session changes (or on first frame via -1 sentinel)
    if (lastSessionRef.current !== currentSession) {
      lastSessionRef.current = currentSession;

      personData.forEach((p, i) => {
        const currentPos = p.sessionPositions[currentSession];
        const nextPos = p.sessionPositions[nextSession];
        const presentNow = p.presentInSession[currentSession];
        const presentNext = p.presentInSession[nextSession];

        positionsRef.current[i * 3] = currentPos.x;
        positionsRef.current[i * 3 + 1] = presentNow ? 0 : -10;
        positionsRef.current[i * 3 + 2] = currentPos.z;

        targetPositionsRef.current[i * 3] = nextPos.x;
        targetPositionsRef.current[i * 3 + 1] = presentNext ? 0 : -10;
        targetPositionsRef.current[i * 3 + 2] = nextPos.z;

        if (!presentNow && !presentNext) {
          statesRef.current[i] = 2; // hidden
        } else if (!presentNow && presentNext) {
          statesRef.current[i] = 3; // being delivered
        } else if (presentNow && !presentNext) {
          statesRef.current[i] = 4; // being eaten
        } else {
          const dx = nextPos.x - currentPos.x;
          const dz = nextPos.z - currentPos.z;
          statesRef.current[i] = dx * dx + dz * dz > 0.01 ? 1 : 0;
        }
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

      uiUpdateCounterRef.current++;
      if (uiUpdateCounterRef.current >= 10) {
        uiUpdateCounterRef.current = 0;
        onUIUpdate({ ...playbackRef.current });
      }
    }

    const t = progress;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < count; i++) {
      const personId = personData[i].personId;
      const personState = statesRef.current[i];

      // Check coordination for eaten people
      const eatenInfo = coordination.eatenPeople.get(personId);
      if (eatenInfo?.hidden) {
        hideInstancedPerson(meshRefs, i);
        continue;
      }

      // Check coordination for delivered people - hide until stork drops
      const deliveredInfo = coordination.deliveredPeople.get(personId);
      if (personState === 3 && deliveredInfo && !deliveredInfo.visible) {
        hideInstancedPerson(meshRefs, i);
        continue;
      }

      // Normal hidden state
      if (personState === 2 && t > 0.5) {
        hideInstancedPerson(meshRefs, i);
        continue;
      }

      tempScale.set(1, 1, 1);

      const x0 = positionsRef.current[i * 3];
      const y0 = positionsRef.current[i * 3 + 1];
      const z0 = positionsRef.current[i * 3 + 2];
      const x1 = targetPositionsRef.current[i * 3];
      const y1 = targetPositionsRef.current[i * 3 + 1];
      const z1 = targetPositionsRef.current[i * 3 + 2];

      const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const baseX = x0 + (x1 - x0) * easedT;
      const baseY = Math.max(0, y0 + (y1 - y0) * easedT);
      const baseZ = z0 + (z1 - z0) * easedT;

      let facingAngle = 0;
      const dx = x1 - x0;
      const dz = z1 - z0;
      if (dx !== 0 || dz !== 0) {
        facingAngle = Math.atan2(dx, dz);
      }

      // Walking animation
      const isWalking = personState === 1 && t > 0 && t < 1;
      const walkPhase = time * 8 + i * 1.7;
      const walkCycle = isWalking ? Math.sin(walkPhase) : 0;
      const walkBob = isWalking ? Math.abs(Math.sin(walkPhase)) * 0.05 : 0;

      // Idle animation
      const breath = personState === 0 ? Math.sin(time * 1.5 + i * 0.7) * 0.02 : 0;
      const idleSway = personState === 0 ? Math.sin(time * 0.8 + i * 0.5) * 0.02 : 0;

      // People being eaten run in panic!
      const panicRun = personState === 4 && !eatenInfo?.hidden;
      const panicPhase = time * 14 + i * 2;
      const panicCycle = panicRun ? Math.sin(panicPhase) : 0;
      const panicBob = panicRun ? Math.abs(Math.sin(panicPhase)) * 0.1 : 0;

      // Delivered: drop from sky when stork releases
      let deliveryOffset = 0;
      if (personState === 3 && deliveredInfo?.visible) {
        // Person just dropped - brief fall animation
        deliveryOffset = Math.max(0, 2 * (1 - Math.min(1, t * 3)));
      }

      const bodySway = (isWalking ? Math.sin(walkPhase * 2) * 0.03 : 0) + 
                       (panicRun ? Math.sin(panicPhase * 2) * 0.05 : 0);

      // === TORSO ===
      tempPosition.set(baseX, baseY + 0.85 + walkBob + breath + panicBob + deliveryOffset, baseZ);
      tempQuaternion.setFromEuler(tempEuler.set(panicRun ? -0.1 : 0, facingAngle, bodySway + idleSway));
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      torsoRef.current!.setMatrixAt(i, tempMatrix);

      // === HEAD ===
      const headBob = (isWalking ? Math.sin(walkPhase * 2) * 0.02 : 0) + 
                      (panicRun ? Math.sin(panicPhase * 2) * 0.03 : 0);
      tempPosition.set(baseX, baseY + 1.45 + walkBob + breath + panicBob + deliveryOffset + headBob, baseZ);
      // Look back when being chased!
      const lookBack = panicRun ? Math.sin(time * 3) * 0.3 : 0;
      tempQuaternion.setFromEuler(tempEuler.set(0, facingAngle + lookBack, 0));
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      headRef.current!.setMatrixAt(i, tempMatrix);

      // === HAIR ===
      if (hairRef.current) {
        tempPosition.set(baseX, baseY + 1.58 + walkBob + breath + panicBob + deliveryOffset + headBob, baseZ);
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        hairRef.current.setMatrixAt(i, tempMatrix);
      }

      // === ARMS ===
      const armSwing = walkCycle * 0.5 + panicCycle * 0.8;
      const armY = baseY + 1.15 + walkBob + breath + panicBob + deliveryOffset;

      if (leftUpperArmRef.current) {
        tempPosition.set(baseX - 0.22, armY, baseZ);
        tempQuaternion.setFromEuler(tempEuler.set(-armSwing, facingAngle, 0.15));
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        leftUpperArmRef.current.setMatrixAt(i, tempMatrix);
      }

      if (rightUpperArmRef.current) {
        tempPosition.set(baseX + 0.22, armY, baseZ);
        tempQuaternion.setFromEuler(tempEuler.set(armSwing, facingAngle, -0.15));
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        rightUpperArmRef.current.setMatrixAt(i, tempMatrix);
      }

      const elbowBend = (isWalking ? 0.3 + Math.abs(armSwing) * 0.3 : 0.1) +
                        (panicRun ? 0.5 + Math.abs(armSwing) * 0.4 : 0);
      if (leftLowerArmRef.current) {
        tempPosition.set(baseX - 0.24, armY - 0.18, baseZ);
        tempQuaternion.setFromEuler(tempEuler.set(-armSwing - elbowBend, facingAngle, 0.1));
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        leftLowerArmRef.current.setMatrixAt(i, tempMatrix);
      }
      if (rightLowerArmRef.current) {
        tempPosition.set(baseX + 0.24, armY - 0.18, baseZ);
        tempQuaternion.setFromEuler(tempEuler.set(armSwing - elbowBend, facingAngle, -0.1));
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        rightLowerArmRef.current.setMatrixAt(i, tempMatrix);
      }

      if (leftHandRef.current) {
        tempPosition.set(baseX - 0.26, armY - 0.36, baseZ);
        tempQuaternion.setFromEuler(tempEuler.set(-armSwing - elbowBend, facingAngle, 0));
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        leftHandRef.current.setMatrixAt(i, tempMatrix);
      }
      if (rightHandRef.current) {
        tempPosition.set(baseX + 0.26, armY - 0.36, baseZ);
        tempQuaternion.setFromEuler(tempEuler.set(armSwing - elbowBend, facingAngle, 0));
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        rightHandRef.current.setMatrixAt(i, tempMatrix);
      }

      // === LEGS ===
      const legSwing = walkCycle * 0.6 + panicCycle * 0.9;
      const legY = baseY + 0.45 + deliveryOffset;

      if (leftUpperLegRef.current) {
        tempPosition.set(baseX - 0.1, legY, baseZ);
        tempQuaternion.setFromEuler(tempEuler.set(legSwing, facingAngle, 0));
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        leftUpperLegRef.current.setMatrixAt(i, tempMatrix);
      }
      if (rightUpperLegRef.current) {
        tempPosition.set(baseX + 0.1, legY, baseZ);
        tempQuaternion.setFromEuler(tempEuler.set(-legSwing, facingAngle, 0));
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        rightUpperLegRef.current.setMatrixAt(i, tempMatrix);
      }

      const kneeBendL = ((isWalking || panicRun) && legSwing < 0) ? Math.abs(legSwing) * 0.8 : 0;
      const kneeBendR = ((isWalking || panicRun) && legSwing > 0) ? Math.abs(legSwing) * 0.8 : 0;

      if (leftLowerLegRef.current) {
        tempPosition.set(baseX - 0.1, legY - 0.22, baseZ);
        tempQuaternion.setFromEuler(tempEuler.set(legSwing + kneeBendL, facingAngle, 0));
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        leftLowerLegRef.current.setMatrixAt(i, tempMatrix);
      }
      if (rightLowerLegRef.current) {
        tempPosition.set(baseX + 0.1, legY - 0.22, baseZ);
        tempQuaternion.setFromEuler(tempEuler.set(-legSwing + kneeBendR, facingAngle, 0));
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        rightLowerLegRef.current.setMatrixAt(i, tempMatrix);
      }

      if (leftFootRef.current) {
        tempPosition.set(baseX - 0.1, baseY + 0.05 + deliveryOffset, baseZ);
        tempQuaternion.setFromEuler(tempEuler.set(0, facingAngle, 0));
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        leftFootRef.current.setMatrixAt(i, tempMatrix);
      }
      if (rightFootRef.current) {
        tempPosition.set(baseX + 0.1, baseY + 0.05 + deliveryOffset, baseZ);
        tempQuaternion.setFromEuler(tempEuler.set(0, facingAngle, 0));
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        rightFootRef.current.setMatrixAt(i, tempMatrix);
      }
    }

    // Update all matrices
    const meshes = [
      torsoRef, headRef, hairRef,
      leftUpperArmRef, rightUpperArmRef, leftLowerArmRef, rightLowerArmRef,
      leftHandRef, rightHandRef,
      leftUpperLegRef, rightUpperLegRef, leftLowerLegRef, rightLowerLegRef,
      leftFootRef, rightFootRef,
    ];
    meshes.forEach((ref) => {
      if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    });
  });

  const pantsColor = useMemo(() => new THREE.Color("#2c3e50"), []);
  const shoeColor = useMemo(() => new THREE.Color("#1a1a1a"), []);

  return (
    <>
      <instancedMesh ref={torsoRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[0.35, 0.45, 0.2]} />
        <meshStandardMaterial />
      </instancedMesh>

      <instancedMesh ref={headRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial />
      </instancedMesh>

      <instancedMesh ref={hairRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.12, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial />
      </instancedMesh>

      <instancedMesh ref={leftUpperArmRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.045, 0.15, 4, 8]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={rightUpperArmRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.045, 0.15, 4, 8]} />
        <meshStandardMaterial />
      </instancedMesh>

      <instancedMesh ref={leftLowerArmRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.04, 0.12, 4, 8]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={rightLowerArmRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.04, 0.12, 4, 8]} />
        <meshStandardMaterial />
      </instancedMesh>

      <instancedMesh ref={leftHandRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={rightHandRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshStandardMaterial />
      </instancedMesh>

      <instancedMesh ref={leftUpperLegRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.06, 0.18, 4, 8]} />
        <meshStandardMaterial color={pantsColor} />
      </instancedMesh>
      <instancedMesh ref={rightUpperLegRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.06, 0.18, 4, 8]} />
        <meshStandardMaterial color={pantsColor} />
      </instancedMesh>

      <instancedMesh ref={leftLowerLegRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.05, 0.18, 4, 8]} />
        <meshStandardMaterial color={pantsColor} />
      </instancedMesh>
      <instancedMesh ref={rightLowerLegRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.05, 0.18, 4, 8]} />
        <meshStandardMaterial color={pantsColor} />
      </instancedMesh>

      <instancedMesh ref={leftFootRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[0.08, 0.05, 0.14]} />
        <meshStandardMaterial color={shoeColor} />
      </instancedMesh>
      <instancedMesh ref={rightFootRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[0.08, 0.05, 0.14]} />
        <meshStandardMaterial color={shoeColor} />
      </instancedMesh>
    </>
  );
}

// Labels component
interface PersonLabelsProps {
  personData: PersonSessionData[];
  playbackRef: React.MutableRefObject<PlaybackState>;
}

export function PersonLabels({ personData, playbackRef }: PersonLabelsProps) {
  const maxLabels = 30;
  const labelData = personData.slice(0, maxLabels);

  return (
    <>
      {labelData.map((p) => (
        <PersonLabel key={p.personId} personData={p} playbackRef={playbackRef} />
      ))}
    </>
  );
}

interface PersonLabelProps {
  personData: PersonSessionData;
  playbackRef: React.MutableRefObject<PlaybackState>;
}

function PersonLabel({ personData, playbackRef }: PersonLabelProps) {
  const currentSession = playbackRef.current.currentSession;
  const visible = personData.presentInSession[currentSession];
  const position = personData.sessionPositions[currentSession];

  if (!visible) return null;

  return (
    <Html
      position={[position.x, position.y + 1.8, position.z]}
      center
      distanceFactor={15}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      <div
        style={{
          background: "rgba(0, 0, 0, 0.75)",
          color: "white",
          padding: "3px 8px",
          borderRadius: "4px",
          fontSize: "11px",
          fontFamily: "system-ui, sans-serif",
          whiteSpace: "nowrap",
          fontWeight: 500,
        }}
      >
        {personData.name}
      </div>
    </Html>
  );
}
