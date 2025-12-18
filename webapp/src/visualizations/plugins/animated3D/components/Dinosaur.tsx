import { useRef, useState, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type DinoState =
  | "hidden"
  | "emerging"
  | "chasing"
  | "chomping"
  | "digging";

interface DinosaurProps {
  targetPosition: THREE.Vector3;
  onAnimationComplete?: () => void;
  state: DinoState;
  onPlaySound?: (sound: "roar" | "chomp" | "dig") => void;
}

export function Dinosaur({
  targetPosition,
  state,
  onAnimationComplete,
  onPlaySound,
}: DinosaurProps) {
  const groupRef = useRef<THREE.Group>(null);
  const jawRef = useRef<THREE.Mesh>(null);
  const tailRef = useRef<THREE.Group>(null);

  const [internalState, setInternalState] = useState<{
    phase: DinoState;
    progress: number;
    startPos: THREE.Vector3;
    targetPos: THREE.Vector3;
  }>({
    phase: "hidden",
    progress: 0,
    startPos: new THREE.Vector3(),
    targetPos: targetPosition.clone(),
  });

  // Dino colors
  const bodyColor = useMemo(() => new THREE.Color("#2d5a27"), []);
  const bellyColor = useMemo(() => new THREE.Color("#8fbc8f"), []);
  const eyeColor = useMemo(() => new THREE.Color("#ff4444"), []);

  // Reset internal state when external state changes
  useEffect(() => {
    if (state === "emerging") {
      const offsetAngle = Math.random() * Math.PI * 2;
      const offsetDist = 3;
      const startPos = new THREE.Vector3(
        targetPosition.x + Math.cos(offsetAngle) * offsetDist,
        -2,
        targetPosition.z + Math.sin(offsetAngle) * offsetDist
      );

      setInternalState({
        phase: "emerging",
        progress: 0,
        startPos,
        targetPos: targetPosition.clone(),
      });

      onPlaySound?.("dig");
      setTimeout(() => onPlaySound?.("roar"), 500);
    } else if (state === "hidden") {
      setInternalState((prev) => ({ ...prev, phase: "hidden", progress: 0 }));
    }
  }, [state, targetPosition, onPlaySound]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const dino = groupRef.current;

    // Tail wagging animation
    if (tailRef.current && internalState.phase !== "hidden") {
      tailRef.current.rotation.y = Math.sin(Date.now() * 0.01) * 0.3;
    }

    // Jaw animation during chomping
    if (jawRef.current) {
      if (internalState.phase === "chomping") {
        jawRef.current.rotation.x = Math.sin(Date.now() * 0.02) * 0.4 - 0.2;
      } else {
        jawRef.current.rotation.x = 0;
      }
    }

    // State machine for animation
    if (internalState.phase === "emerging") {
      const newProgress = Math.min(1, internalState.progress + delta * 0.8);

      // Rise from the ground
      const y = THREE.MathUtils.lerp(-2, 0, easeOutBack(newProgress));
      dino.position.set(internalState.startPos.x, y, internalState.startPos.z);

      // Shake dirt off
      dino.rotation.z = Math.sin(newProgress * 20) * 0.1 * (1 - newProgress);

      if (newProgress >= 1) {
        setInternalState((prev) => ({ ...prev, phase: "chasing", progress: 0 }));
      } else {
        setInternalState((prev) => ({ ...prev, progress: newProgress }));
      }
    } else if (internalState.phase === "chasing") {
      const newProgress = Math.min(1, internalState.progress + delta * 1.5);

      // Move towards target with stomping motion
      const x = THREE.MathUtils.lerp(
        internalState.startPos.x,
        internalState.targetPos.x,
        easeInOutQuad(newProgress)
      );
      const z = THREE.MathUtils.lerp(
        internalState.startPos.z,
        internalState.targetPos.z,
        easeInOutQuad(newProgress)
      );
      const stompY = Math.abs(Math.sin(newProgress * 15)) * 0.3;

      dino.position.set(x, stompY, z);

      // Face the target
      const angle = Math.atan2(
        internalState.targetPos.x - x,
        internalState.targetPos.z - z
      );
      dino.rotation.y = angle;

      // Running motion - lean forward
      dino.rotation.x = -0.1;

      if (newProgress >= 1) {
        setInternalState((prev) => ({ ...prev, phase: "chomping", progress: 0 }));
        onPlaySound?.("chomp");
      } else {
        setInternalState((prev) => ({ ...prev, progress: newProgress }));
      }
    } else if (internalState.phase === "chomping") {
      const newProgress = Math.min(1, internalState.progress + delta * 0.7);

      // Chomping animation
      dino.position.set(
        internalState.targetPos.x,
        Math.abs(Math.sin(newProgress * 10)) * 0.2,
        internalState.targetPos.z
      );

      // Head bob while eating
      dino.rotation.x = Math.sin(newProgress * 8) * 0.1;

      if (newProgress >= 1) {
        setInternalState((prev) => ({ ...prev, phase: "digging", progress: 0 }));
        onPlaySound?.("dig");
      } else {
        setInternalState((prev) => ({ ...prev, progress: newProgress }));
      }
    } else if (internalState.phase === "digging") {
      const newProgress = Math.min(1, internalState.progress + delta * 1.0);

      // Sink back into the ground
      const y = THREE.MathUtils.lerp(0, -2.5, easeInBack(newProgress));
      dino.position.y = y;

      // Digging motion
      dino.rotation.z = Math.sin(newProgress * 30) * 0.15 * (1 - newProgress);

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

  return (
    <group ref={groupRef} scale={[1.2, 1.2, 1.2]}>
      {/* Body */}
      <mesh position={[0, 1.2, 0]} rotation={[0.1, 0, 0]}>
        <capsuleGeometry args={[0.6, 1.2, 8, 16]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>

      {/* Belly */}
      <mesh position={[0, 1, 0.3]} rotation={[0.3, 0, 0]}>
        <capsuleGeometry args={[0.45, 0.8, 8, 16]} />
        <meshStandardMaterial color={bellyColor} />
      </mesh>

      {/* Head */}
      <group position={[0, 1.8, 0.8]}>
        {/* Skull */}
        <mesh>
          <boxGeometry args={[0.5, 0.4, 0.8]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>

        {/* Snout */}
        <mesh position={[0, -0.1, 0.5]}>
          <boxGeometry args={[0.4, 0.25, 0.5]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>

        {/* Upper teeth */}
        <mesh position={[0, -0.2, 0.6]}>
          <coneGeometry args={[0.03, 0.1, 4]} />
          <meshStandardMaterial color="white" />
        </mesh>
        <mesh position={[0.1, -0.2, 0.55]}>
          <coneGeometry args={[0.03, 0.1, 4]} />
          <meshStandardMaterial color="white" />
        </mesh>
        <mesh position={[-0.1, -0.2, 0.55]}>
          <coneGeometry args={[0.03, 0.1, 4]} />
          <meshStandardMaterial color="white" />
        </mesh>

        {/* Lower jaw */}
        <mesh ref={jawRef} position={[0, -0.25, 0.3]}>
          <boxGeometry args={[0.35, 0.15, 0.6]} />
          <meshStandardMaterial color={bodyColor} />
          {/* Lower teeth */}
          <mesh position={[0, 0.12, 0.2]}>
            <coneGeometry args={[0.025, 0.08, 4]} />
            <meshStandardMaterial color="white" />
          </mesh>
          <mesh position={[0.08, 0.12, 0.15]}>
            <coneGeometry args={[0.025, 0.08, 4]} />
            <meshStandardMaterial color="white" />
          </mesh>
          <mesh position={[-0.08, 0.12, 0.15]}>
            <coneGeometry args={[0.025, 0.08, 4]} />
            <meshStandardMaterial color="white" />
          </mesh>
        </mesh>

        {/* Eyes */}
        <mesh position={[0.2, 0.1, 0.1]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[-0.2, 0.1, 0.1]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={0.3} />
        </mesh>
      </group>

      {/* Left leg */}
      <group position={[-0.3, 0.6, 0]}>
        <mesh>
          <capsuleGeometry args={[0.2, 0.6, 8, 16]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
        {/* Foot */}
        <mesh position={[0, -0.5, 0.2]}>
          <boxGeometry args={[0.25, 0.1, 0.4]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
      </group>

      {/* Right leg */}
      <group position={[0.3, 0.6, 0]}>
        <mesh>
          <capsuleGeometry args={[0.2, 0.6, 8, 16]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
        {/* Foot */}
        <mesh position={[0, -0.5, 0.2]}>
          <boxGeometry args={[0.25, 0.1, 0.4]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
      </group>

      {/* Tiny arms */}
      <group position={[0.35, 1.4, 0.4]} rotation={[0.5, 0, 0.3]}>
        <mesh>
          <capsuleGeometry args={[0.08, 0.25, 8, 16]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
      </group>
      <group position={[-0.35, 1.4, 0.4]} rotation={[0.5, 0, -0.3]}>
        <mesh>
          <capsuleGeometry args={[0.08, 0.25, 8, 16]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
      </group>

      {/* Tail */}
      <group ref={tailRef} position={[0, 1, -0.8]}>
        <mesh rotation={[0.3, 0, 0]}>
          <coneGeometry args={[0.3, 1.5, 8]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
        {/* Tail tip */}
        <mesh position={[0, -0.8, -0.3]} rotation={[0.5, 0, 0]}>
          <coneGeometry args={[0.15, 0.8, 8]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
      </group>

      {/* Dirt particles when emerging/digging */}
      {(internalState.phase === "emerging" || internalState.phase === "digging") && (
        <DirtParticles />
      )}
    </group>
  );
}

// Dirt particles effect
function DirtParticles() {
  const particlesRef = useRef<THREE.Points>(null);

  const [positions] = useState(() => {
    const pos = new Float32Array(50 * 3);
    for (let i = 0; i < 50; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2;
      pos[i * 3 + 1] = Math.random() * 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    return pos;
  });

  useFrame((_, delta) => {
    if (!particlesRef.current) return;
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < 50; i++) {
      // Move particles up and outward
      positions[i * 3] += (Math.random() - 0.5) * delta * 2;
      positions[i * 3 + 1] += delta * 3;
      positions[i * 3 + 2] += (Math.random() - 0.5) * delta * 2;

      // Reset particles that go too high
      if (positions[i * 3 + 1] > 3) {
        positions[i * 3] = (Math.random() - 0.5) * 2;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 2;
      }
    }

    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={50}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.1} color="#8b4513" transparent opacity={0.6} />
    </points>
  );
}

// Easing functions
function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function easeInBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * x * x * x - c1 * x * x;
}

function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
