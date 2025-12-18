import { useRef, useState, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

export type StorkState = "hidden" | "flying_in" | "descending" | "flying_out";

interface StorkProps {
  targetPosition: THREE.Vector3;
  personName: string;
  state: StorkState;
  sceneScale: number;
  onAnimationComplete?: () => void;
  onPlaySound?: (sound: "flap") => void;
}

export function Stork({
  targetPosition,
  personName,
  state,
  sceneScale,
  onAnimationComplete,
  onPlaySound,
}: StorkProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftWingRef = useRef<THREE.Group>(null);
  const rightWingRef = useRef<THREE.Group>(null);
  const legsRef = useRef<THREE.Group>(null);

  // Use refs for animation state to avoid React re-renders during animation
  const phaseRef = useRef<StorkState>("hidden");
  const progressRef = useRef(0);
  const startPosRef = useRef(new THREE.Vector3());
  const targetPosRef = useRef(new THREE.Vector3());
  const dropPosRef = useRef(new THREE.Vector3());
  const exitPosRef = useRef(new THREE.Vector3());
  const isInitializedRef = useRef(false);

  // Stork colors
  const bodyColor = useMemo(() => new THREE.Color("#ffffff"), []);
  const wingTipColor = useMemo(() => new THREE.Color("#1a1a1a"), []);
  const beakColor = useMemo(() => new THREE.Color("#ff6b35"), []);
  const legColor = useMemo(() => new THREE.Color("#ff8888"), []);
  const bagColor = useMemo(() => new THREE.Color("#c9a87c"), []);

  // Scale distances with scene
  const flyDistance = Math.max(25, sceneScale * 1.5);
  const flyHeight = Math.max(15, sceneScale * 0.8);
  const storkScale = Math.max(0.8, sceneScale / 25);

  // Initialize animation when state changes to "flying_in"
  useEffect(() => {
    if (state === "flying_in" && !isInitializedRef.current) {
      isInitializedRef.current = true;

      // Calculate start position (far away in the sky)
      const angle = Math.random() * Math.PI * 2;
      startPosRef.current.set(
        targetPosition.x + Math.cos(angle) * flyDistance,
        flyHeight,
        targetPosition.z + Math.sin(angle) * flyDistance
      );

      // Hover position above target
      targetPosRef.current.set(targetPosition.x, flyHeight * 0.6, targetPosition.z);

      // Drop position
      dropPosRef.current.set(targetPosition.x, 2, targetPosition.z);

      // Exit position (fly away in opposite direction)
      const exitAngle = angle + Math.PI + (Math.random() - 0.5);
      exitPosRef.current.set(
        targetPosition.x + Math.cos(exitAngle) * flyDistance * 1.5,
        flyHeight * 1.2,
        targetPosition.z + Math.sin(exitAngle) * flyDistance * 1.5
      );

      phaseRef.current = "flying_in";
      progressRef.current = 0;

      onPlaySound?.("flap");
    }
  }, [state, targetPosition, flyDistance, flyHeight, onPlaySound]);

  // Reset when hidden
  useEffect(() => {
    if (state === "hidden") {
      phaseRef.current = "hidden";
      progressRef.current = 0;
      isInitializedRef.current = false;
    }
  }, [state]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const stork = groupRef.current;
    const phase = phaseRef.current;

    if (phase === "hidden") {
      stork.visible = false;
      return;
    }
    stork.visible = true;

    // Wing flapping animation
    if (leftWingRef.current && rightWingRef.current) {
      const flapSpeed = phase === "flying_in" || phase === "flying_out" ? 6 : 4;
      const flapAmount = phase === "flying_in" || phase === "flying_out" ? 0.6 : 0.4;
      const flap = Math.sin(Date.now() * 0.001 * flapSpeed) * flapAmount;

      leftWingRef.current.rotation.z = Math.PI / 6 + flap;
      rightWingRef.current.rotation.z = -(Math.PI / 6 + flap);
    }

    // Legs dangle while flying
    if (legsRef.current) {
      legsRef.current.rotation.x = Math.sin(Date.now() * 0.002) * 0.1 + 0.3;
    }

    const startPos = startPosRef.current;
    const targetPos = targetPosRef.current;
    const dropPos = dropPosRef.current;
    const exitPos = exitPosRef.current;

    // State machine for animation
    if (phase === "flying_in") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.35);
      const p = progressRef.current;

      // Fly towards hover point
      const easedP = easeInOutQuad(p);
      stork.position.lerpVectors(startPos, targetPos, easedP);

      // Face flying direction
      const direction = targetPos.clone().sub(startPos);
      const angle = Math.atan2(direction.x, direction.z);
      stork.rotation.y = angle;
      stork.rotation.x = -0.1;

      if (p >= 1) {
        phaseRef.current = "descending";
        progressRef.current = 0;
      }
    } else if (phase === "descending") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.5);
      const p = progressRef.current;

      // Descend to drop off
      const easedP = easeOutQuad(p);
      stork.position.lerpVectors(targetPos, dropPos, easedP);

      // Hover at the end
      if (p > 0.7) {
        stork.position.y += Math.sin(Date.now() * 0.004) * 0.15;
      }

      stork.rotation.x = 0;

      if (p >= 1) {
        phaseRef.current = "flying_out";
        progressRef.current = 0;
      }
    } else if (phase === "flying_out") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.4);
      const p = progressRef.current;

      // Fly away
      const easedP = easeInQuad(p);
      stork.position.lerpVectors(dropPos, exitPos, easedP);

      // Face flying direction
      const direction = exitPos.clone().sub(dropPos);
      const angle = Math.atan2(direction.x, direction.z);
      stork.rotation.y = angle;
      stork.rotation.x = -0.12;

      if (p >= 1) {
        phaseRef.current = "hidden";
        progressRef.current = 0;
        isInitializedRef.current = false;
        onAnimationComplete?.();
      }
    }
  });

  // Don't render if hidden
  if (phaseRef.current === "hidden" && state === "hidden") {
    return null;
  }

  // Show bag only during flying_in and descending
  const showBag = phaseRef.current === "flying_in" || phaseRef.current === "descending";

  return (
    <group ref={groupRef} scale={[storkScale, storkScale, storkScale]}>
      {/* Person name label */}
      <Html
        position={[0, 2.5, 0]}
        center
        distanceFactor={10}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            background: "rgba(0, 100, 180, 0.9)",
            color: "white",
            padding: "4px 10px",
            borderRadius: "6px",
            fontSize: "12px",
            fontFamily: "sans-serif",
            fontWeight: "bold",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            border: "2px solid #00aaff",
          }}
        >
          🦩 Delivering: {personName}
        </div>
      </Html>

      {/* Body */}
      <mesh position={[0, 0, 0]} rotation={[0.1, 0, 0]}>
        <capsuleGeometry args={[0.35, 0.9, 8, 16]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>

      {/* Neck */}
      <group position={[0, 0.55, 0.45]}>
        <mesh rotation={[-0.3, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.14, 0.7, 8]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
      </group>

      {/* Head */}
      <group position={[0, 0.9, 0.7]}>
        <mesh>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>

        {/* Beak */}
        <mesh position={[0, -0.05, 0.25]} rotation={[0.1, 0, 0]}>
          <coneGeometry args={[0.06, 0.45, 8]} />
          <meshStandardMaterial color={beakColor} />
        </mesh>

        {/* Eyes */}
        <mesh position={[0.1, 0.06, 0.1]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="black" />
        </mesh>
        <mesh position={[-0.1, 0.06, 0.1]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="black" />
        </mesh>
      </group>

      {/* Left Wing */}
      <group ref={leftWingRef} position={[0.35, 0.25, 0]}>
        <mesh rotation={[0, 0, Math.PI / 6]}>
          <boxGeometry args={[1.1, 0.06, 0.55]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
        <mesh position={[0.65, 0, 0]} rotation={[0, 0, Math.PI / 6]}>
          <boxGeometry args={[0.45, 0.05, 0.5]} />
          <meshStandardMaterial color={wingTipColor} />
        </mesh>
      </group>

      {/* Right Wing */}
      <group ref={rightWingRef} position={[-0.35, 0.25, 0]}>
        <mesh rotation={[0, 0, -Math.PI / 6]}>
          <boxGeometry args={[1.1, 0.06, 0.55]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
        <mesh position={[-0.65, 0, 0]} rotation={[0, 0, -Math.PI / 6]}>
          <boxGeometry args={[0.45, 0.05, 0.5]} />
          <meshStandardMaterial color={wingTipColor} />
        </mesh>
      </group>

      {/* Tail */}
      <mesh position={[0, 0.12, -0.7]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.18, 0.03, 0.35]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      <mesh position={[0.1, 0.12, -0.75]} rotation={[0.3, 0.1, 0]}>
        <boxGeometry args={[0.12, 0.03, 0.3]} />
        <meshStandardMaterial color={wingTipColor} />
      </mesh>
      <mesh position={[-0.1, 0.12, -0.75]} rotation={[0.3, -0.1, 0]}>
        <boxGeometry args={[0.12, 0.03, 0.3]} />
        <meshStandardMaterial color={wingTipColor} />
      </mesh>

      {/* Legs */}
      <group ref={legsRef} position={[0, -0.45, 0]}>
        <mesh position={[0.12, 0, 0.12]}>
          <cylinderGeometry args={[0.025, 0.025, 0.45, 8]} />
          <meshStandardMaterial color={legColor} />
        </mesh>
        <mesh position={[-0.12, 0, 0.12]}>
          <cylinderGeometry args={[0.025, 0.025, 0.45, 8]} />
          <meshStandardMaterial color={legColor} />
        </mesh>
      </group>

      {/* Delivery bag with baby */}
      {showBag && (
        <group position={[0, -0.9, 0.35]}>
          <mesh>
            <sphereGeometry args={[0.35, 16, 16]} />
            <meshStandardMaterial color={bagColor} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial color={bagColor} />
          </mesh>
          <mesh position={[0, 0.7, 0.18]} rotation={[0.2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.65, 4]} />
            <meshStandardMaterial color="#8b7355" />
          </mesh>
          <mesh position={[0, 0.22, 0.2]}>
            <sphereGeometry args={[0.14, 16, 16]} />
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
