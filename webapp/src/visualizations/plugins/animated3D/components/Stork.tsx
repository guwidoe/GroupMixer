import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

export type StorkState = "hidden" | "flying_in" | "hovering" | "dropping" | "flying_out";

interface StorkProps {
  targetPosition: THREE.Vector3;
  personName: string;
  personId: string;
  state: StorkState;
  sceneScale: number;
  onAnimationComplete?: () => void;
  onPhaseChange?: (phase: StorkState, personId: string) => void;
  onPlaySound?: (sound: "flap") => void;
}

export function Stork({
  targetPosition,
  personName,
  personId,
  state,
  sceneScale,
  onAnimationComplete,
  onPhaseChange,
  onPlaySound,
}: StorkProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftWingRef = useRef<THREE.Group>(null);
  const rightWingRef = useRef<THREE.Group>(null);
  const legsRef = useRef<THREE.Group>(null);
  const bagRef = useRef<THREE.Group>(null);

  // Animation state
  const phaseRef = useRef<StorkState>("hidden");
  const progressRef = useRef(0);
  const startPosRef = useRef(new THREE.Vector3());
  const hoverPosRef = useRef(new THREE.Vector3());
  const dropPosRef = useRef(new THREE.Vector3());
  const exitPosRef = useRef(new THREE.Vector3());
  const isInitializedRef = useRef(false);

  // Colors
  const bodyColor = useMemo(() => new THREE.Color("#ffffff"), []);
  const wingTipColor = useMemo(() => new THREE.Color("#1a1a1a"), []);
  const beakColor = useMemo(() => new THREE.Color("#ff6b35"), []);
  const legColor = useMemo(() => new THREE.Color("#ff8888"), []);
  const bagColor = useMemo(() => new THREE.Color("#c9a87c"), []);

  // Scale
  const flyDistance = Math.max(20, sceneScale * 1.2);
  const flyHeight = Math.max(12, sceneScale * 0.7);
  const storkScale = Math.max(1, sceneScale / 20);

  // Initialize
  useEffect(() => {
    if (state === "flying_in" && !isInitializedRef.current) {
      isInitializedRef.current = true;

      const angle = Math.random() * Math.PI * 2;
      startPosRef.current.set(
        targetPosition.x + Math.cos(angle) * flyDistance,
        flyHeight,
        targetPosition.z + Math.sin(angle) * flyDistance
      );
      hoverPosRef.current.set(targetPosition.x, flyHeight * 0.5, targetPosition.z);
      dropPosRef.current.set(targetPosition.x, 3, targetPosition.z);
      
      const exitAngle = angle + Math.PI + (Math.random() - 0.5) * 0.5;
      exitPosRef.current.set(
        targetPosition.x + Math.cos(exitAngle) * flyDistance * 1.2,
        flyHeight * 1.1,
        targetPosition.z + Math.sin(exitAngle) * flyDistance * 1.2
      );

      phaseRef.current = "flying_in";
      progressRef.current = 0;
      onPhaseChange?.("flying_in", personId);
      onPlaySound?.("flap");
    }
  }, [state, targetPosition, flyDistance, flyHeight, onPlaySound, onPhaseChange, personId]);

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

    // Wing flapping
    if (leftWingRef.current && rightWingRef.current) {
      const flapSpeed = phase === "flying_in" || phase === "flying_out" ? 8 : 5;
      const flapAmount = phase === "flying_in" || phase === "flying_out" ? 0.7 : 0.4;
      const flap = Math.sin(Date.now() * 0.001 * flapSpeed) * flapAmount;
      leftWingRef.current.rotation.z = Math.PI / 6 + flap;
      rightWingRef.current.rotation.z = -(Math.PI / 6 + flap);
    }

    // Legs dangle
    if (legsRef.current) {
      legsRef.current.rotation.x = Math.sin(Date.now() * 0.002) * 0.1 + 0.3;
    }

    const startPos = startPosRef.current;
    const hoverPos = hoverPosRef.current;
    const dropPos = dropPosRef.current;
    const exitPos = exitPosRef.current;

    if (phase === "flying_in") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.4);
      const p = progressRef.current;
      const easedP = easeInOutQuad(p);

      stork.position.lerpVectors(startPos, hoverPos, easedP);

      const direction = hoverPos.clone().sub(startPos);
      stork.rotation.y = Math.atan2(direction.x, direction.z);
      stork.rotation.x = -0.1;

      if (p >= 1) {
        phaseRef.current = "hovering";
        progressRef.current = 0;
        onPhaseChange?.("hovering", personId);
      }
    } else if (phase === "hovering") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.6);
      const p = progressRef.current;
      const easedP = easeOutQuad(p);

      stork.position.lerpVectors(hoverPos, dropPos, easedP);
      stork.position.y += Math.sin(Date.now() * 0.005) * 0.1;
      stork.rotation.x = 0;

      if (p >= 1) {
        phaseRef.current = "dropping";
        progressRef.current = 0;
        onPhaseChange?.("dropping", personId); // Person should appear NOW
      }
    } else if (phase === "dropping") {
      progressRef.current = Math.min(1, progressRef.current + delta * 1.5);
      const p = progressRef.current;

      // Stork hovers while "dropping" the bag
      stork.position.copy(dropPos);
      stork.position.y += Math.sin(Date.now() * 0.006) * 0.08;

      // Bag drops down
      if (bagRef.current) {
        const bagDrop = easeInQuad(p) * 3;
        bagRef.current.position.y = -0.9 - bagDrop;
        bagRef.current.visible = p < 0.8; // Bag disappears as person "emerges"
      }

      if (p >= 1) {
        phaseRef.current = "flying_out";
        progressRef.current = 0;
        onPhaseChange?.("flying_out", personId);
      }
    } else if (phase === "flying_out") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.5);
      const p = progressRef.current;
      const easedP = easeInQuad(p);

      stork.position.lerpVectors(dropPos, exitPos, easedP);

      const direction = exitPos.clone().sub(dropPos);
      stork.rotation.y = Math.atan2(direction.x, direction.z);
      stork.rotation.x = -0.12;

      if (p >= 1) {
        phaseRef.current = "hidden";
        progressRef.current = 0;
        isInitializedRef.current = false;
        onAnimationComplete?.();
      }
    }
  });

  if (phaseRef.current === "hidden" && state === "hidden") {
    return null;
  }

  const showBag = phaseRef.current === "flying_in" || phaseRef.current === "hovering" || phaseRef.current === "dropping";

  return (
    <group ref={groupRef} scale={[storkScale, storkScale, storkScale]}>
      {/* Label */}
      <Html
        position={[0, 3, 0]}
        center
        distanceFactor={8}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            background: "rgba(0, 100, 180, 0.95)",
            color: "white",
            padding: "5px 10px",
            borderRadius: "6px",
            fontSize: "12px",
            fontFamily: "system-ui, sans-serif",
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
        <mesh position={[0, -0.05, 0.25]} rotation={[0.1, 0, 0]}>
          <coneGeometry args={[0.06, 0.45, 8]} />
          <meshStandardMaterial color={beakColor} />
        </mesh>
        <mesh position={[0.1, 0.06, 0.1]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="black" />
        </mesh>
        <mesh position={[-0.1, 0.06, 0.1]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="black" />
        </mesh>
      </group>

      {/* Wings */}
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

      {/* Delivery bag */}
      {showBag && (
        <group ref={bagRef} position={[0, -0.9, 0.35]}>
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
          {/* Baby head poking out */}
          <mesh position={[0, 0.22, 0.2]}>
            <sphereGeometry args={[0.14, 16, 16]} />
            <meshStandardMaterial color="#e0b89e" />
          </mesh>
        </group>
      )}
    </group>
  );
}

function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function easeOutQuad(x: number): number {
  return 1 - (1 - x) * (1 - x);
}

function easeInQuad(x: number): number {
  return x * x;
}
