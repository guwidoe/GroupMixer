import { useRef, useState, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type StorkState = "hidden" | "flying_in" | "descending" | "flying_out";

interface StorkProps {
  targetPosition: THREE.Vector3;
  personName: string;
  state: StorkState;
  onAnimationComplete?: () => void;
  onPlaySound?: (sound: "flap") => void;
}

export function Stork({
  targetPosition,
  personName,
  state,
  onAnimationComplete,
  onPlaySound,
}: StorkProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftWingRef = useRef<THREE.Group>(null);
  const rightWingRef = useRef<THREE.Group>(null);
  const legsRef = useRef<THREE.Group>(null);

  const [internalState, setInternalState] = useState<{
    phase: StorkState;
    progress: number;
    startPos: THREE.Vector3;
    targetPos: THREE.Vector3;
  }>({
    phase: "hidden",
    progress: 0,
    startPos: new THREE.Vector3(),
    targetPos: targetPosition.clone(),
  });

  // Stork colors
  const bodyColor = useMemo(() => new THREE.Color("#ffffff"), []);
  const wingTipColor = useMemo(() => new THREE.Color("#1a1a1a"), []);
  const beakColor = useMemo(() => new THREE.Color("#ff6b35"), []);
  const legColor = useMemo(() => new THREE.Color("#ff8888"), []);
  const bagColor = useMemo(() => new THREE.Color("#c9a87c"), []);

  // Reset internal state when external state changes
  useEffect(() => {
    if (state === "flying_in") {
      const angle = Math.random() * Math.PI * 2;
      const startPos = new THREE.Vector3(
        targetPosition.x + Math.cos(angle) * 30,
        20,
        targetPosition.z + Math.sin(angle) * 30
      );

      setInternalState({
        phase: "flying_in",
        progress: 0,
        startPos,
        targetPos: new THREE.Vector3(targetPosition.x, 8, targetPosition.z),
      });

      onPlaySound?.("flap");
    } else if (state === "hidden") {
      setInternalState((prev) => ({ ...prev, phase: "hidden", progress: 0 }));
    }
  }, [state, targetPosition, onPlaySound]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const stork = groupRef.current;

    // Wing flapping animation
    if (leftWingRef.current && rightWingRef.current && internalState.phase !== "hidden") {
      const flapSpeed = internalState.phase === "flying_in" ? 8 : 5;
      const flapAmount = internalState.phase === "flying_in" ? 0.6 : 0.4;
      const flap = Math.sin(Date.now() * 0.001 * flapSpeed) * flapAmount;

      leftWingRef.current.rotation.z = Math.PI / 6 + flap;
      rightWingRef.current.rotation.z = -(Math.PI / 6 + flap);
    }

    // Legs dangle while flying
    if (legsRef.current && internalState.phase !== "hidden") {
      legsRef.current.rotation.x = Math.sin(Date.now() * 0.002) * 0.1 + 0.3;
    }

    // State machine for animation
    if (internalState.phase === "flying_in") {
      const newProgress = Math.min(1, internalState.progress + delta * 0.5);

      // Fly towards drop point
      const pos = new THREE.Vector3().lerpVectors(
        internalState.startPos,
        internalState.targetPos,
        easeInOutQuad(newProgress)
      );
      stork.position.copy(pos);

      // Face flying direction
      const direction = internalState.targetPos.clone().sub(internalState.startPos);
      const angle = Math.atan2(direction.x, direction.z);
      stork.rotation.y = angle;

      // Slight pitch during flight
      stork.rotation.x = -0.1;

      if (newProgress >= 1) {
        setInternalState((prev) => ({
          ...prev,
          phase: "descending",
          progress: 0,
          startPos: prev.targetPos.clone(),
          targetPos: new THREE.Vector3(targetPosition.x, 2, targetPosition.z),
        }));
      } else {
        setInternalState((prev) => ({ ...prev, progress: newProgress }));
      }
    } else if (internalState.phase === "descending") {
      const newProgress = Math.min(1, internalState.progress + delta * 0.8);

      // Descend to drop off
      const pos = new THREE.Vector3().lerpVectors(
        internalState.startPos,
        internalState.targetPos,
        easeOutQuad(newProgress)
      );
      stork.position.copy(pos);

      // Hover at the end
      if (newProgress > 0.8) {
        stork.position.y += Math.sin(Date.now() * 0.005) * 0.2;
      }

      if (newProgress >= 1) {
        // Start flying out
        const exitAngle = Math.random() * Math.PI * 2;
        setInternalState((prev) => ({
          ...prev,
          phase: "flying_out",
          progress: 0,
          startPos: prev.targetPos.clone(),
          targetPos: new THREE.Vector3(
            targetPosition.x + Math.cos(exitAngle) * 40,
            25,
            targetPosition.z + Math.sin(exitAngle) * 40
          ),
        }));
      } else {
        setInternalState((prev) => ({ ...prev, progress: newProgress }));
      }
    } else if (internalState.phase === "flying_out") {
      const newProgress = Math.min(1, internalState.progress + delta * 0.6);

      // Fly away
      const pos = new THREE.Vector3().lerpVectors(
        internalState.startPos,
        internalState.targetPos,
        easeInQuad(newProgress)
      );
      stork.position.copy(pos);

      // Face flying direction
      const direction = internalState.targetPos.clone().sub(internalState.startPos);
      const angle = Math.atan2(direction.x, direction.z);
      stork.rotation.y = angle;

      // Pitch up as flying away
      stork.rotation.x = -0.15;

      if (newProgress >= 1) {
        setInternalState((prev) => ({ ...prev, phase: "hidden", progress: 0 }));
        onAnimationComplete?.();
      } else {
        setInternalState((prev) => ({ ...prev, progress: newProgress }));
      }
    }
  });

  if (internalState.phase === "hidden") {
    return null;
  }

  // Show bag only during flying_in and descending
  const showBag = internalState.phase === "flying_in" || internalState.phase === "descending";

  return (
    <group ref={groupRef} scale={[0.8, 0.8, 0.8]}>
      {/* Body */}
      <mesh position={[0, 0, 0]} rotation={[0.1, 0, 0]}>
        <capsuleGeometry args={[0.3, 0.8, 8, 16]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>

      {/* Neck */}
      <group position={[0, 0.5, 0.4]}>
        <mesh rotation={[-0.3, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.12, 0.6, 8]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
      </group>

      {/* Head */}
      <group position={[0, 0.8, 0.6]}>
        <mesh>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>

        {/* Beak */}
        <mesh position={[0, -0.05, 0.2]} rotation={[0.1, 0, 0]}>
          <coneGeometry args={[0.05, 0.4, 8]} />
          <meshStandardMaterial color={beakColor} />
        </mesh>

        {/* Eyes */}
        <mesh position={[0.08, 0.05, 0.08]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial color="black" />
        </mesh>
        <mesh position={[-0.08, 0.05, 0.08]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial color="black" />
        </mesh>
      </group>

      {/* Left Wing */}
      <group ref={leftWingRef} position={[0.3, 0.2, 0]}>
        <mesh rotation={[0, 0, Math.PI / 6]}>
          <boxGeometry args={[0.8, 0.05, 0.4]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
        {/* Wing tip (black) */}
        <mesh position={[0.5, 0, 0]} rotation={[0, 0, Math.PI / 6]}>
          <boxGeometry args={[0.3, 0.04, 0.35]} />
          <meshStandardMaterial color={wingTipColor} />
        </mesh>
      </group>

      {/* Right Wing */}
      <group ref={rightWingRef} position={[-0.3, 0.2, 0]}>
        <mesh rotation={[0, 0, -Math.PI / 6]}>
          <boxGeometry args={[0.8, 0.05, 0.4]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
        {/* Wing tip (black) */}
        <mesh position={[-0.5, 0, 0]} rotation={[0, 0, -Math.PI / 6]}>
          <boxGeometry args={[0.3, 0.04, 0.35]} />
          <meshStandardMaterial color={wingTipColor} />
        </mesh>
      </group>

      {/* Tail */}
      <mesh position={[0, 0.1, -0.6]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.15, 0.02, 0.3]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      <mesh position={[0.08, 0.1, -0.65]} rotation={[0.3, 0.1, 0]}>
        <boxGeometry args={[0.1, 0.02, 0.25]} />
        <meshStandardMaterial color={wingTipColor} />
      </mesh>
      <mesh position={[-0.08, 0.1, -0.65]} rotation={[0.3, -0.1, 0]}>
        <boxGeometry args={[0.1, 0.02, 0.25]} />
        <meshStandardMaterial color={wingTipColor} />
      </mesh>

      {/* Legs */}
      <group ref={legsRef} position={[0, -0.4, 0]}>
        {/* Left leg */}
        <mesh position={[0.1, 0, 0.1]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
          <meshStandardMaterial color={legColor} />
        </mesh>
        {/* Right leg */}
        <mesh position={[-0.1, 0, 0.1]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
          <meshStandardMaterial color={legColor} />
        </mesh>
      </group>

      {/* Delivery bag with baby */}
      {showBag && (
        <group position={[0, -0.7, 0.3]}>
          {/* Bag */}
          <mesh>
            <sphereGeometry args={[0.25, 16, 16]} />
            <meshStandardMaterial color={bagColor} />
          </mesh>
          {/* Bag tie/knot */}
          <mesh position={[0, 0.2, 0]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color={bagColor} />
          </mesh>
          {/* String to beak */}
          <mesh position={[0, 0.5, 0.15]} rotation={[0.2, 0, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.5, 4]} />
            <meshStandardMaterial color="#8b7355" />
          </mesh>
          {/* Little person head peeking out */}
          <mesh position={[0, 0.15, 0.15]}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshStandardMaterial color="#e0b89e" />
          </mesh>
        </group>
      )}
    </group>
  );
}

// Easing functions
function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function easeOutQuad(x: number): number {
  return 1 - (1 - x) * (1 - x);
}

function easeInQuad(x: number): number {
  return x * x;
}
