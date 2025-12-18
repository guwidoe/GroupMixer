import { useRef, useState, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

export type DinoState =
  | "hidden"
  | "emerging"
  | "chasing"
  | "chomping"
  | "digging";

interface DinosaurProps {
  targetPosition: THREE.Vector3;
  personName: string;
  onAnimationComplete?: () => void;
  state: DinoState;
  sceneScale: number;
  onPlaySound?: (sound: "roar" | "chomp" | "dig") => void;
}

export function Dinosaur({
  targetPosition,
  personName,
  state,
  sceneScale,
  onAnimationComplete,
  onPlaySound,
}: DinosaurProps) {
  const groupRef = useRef<THREE.Group>(null);
  const jawRef = useRef<THREE.Mesh>(null);
  const tailRef = useRef<THREE.Group>(null);

  // Use refs for animation state to avoid React re-renders during animation
  const phaseRef = useRef<DinoState>("hidden");
  const progressRef = useRef(0);
  const startPosRef = useRef(new THREE.Vector3());
  const targetPosRef = useRef(new THREE.Vector3());
  const isInitializedRef = useRef(false);

  // Dino colors
  const bodyColor = useMemo(() => new THREE.Color("#2d5a27"), []);
  const bellyColor = useMemo(() => new THREE.Color("#8fbc8f"), []);
  const eyeColor = useMemo(() => new THREE.Color("#ff4444"), []);

  // Scale chase distance with scene
  const chaseDistance = Math.max(5, sceneScale * 0.3);
  const dinoScale = Math.max(1, sceneScale / 20);

  // Initialize animation when state changes to "emerging"
  useEffect(() => {
    if (state === "emerging" && !isInitializedRef.current) {
      isInitializedRef.current = true;

      // Calculate a random start position away from target
      const offsetAngle = Math.random() * Math.PI * 2;
      startPosRef.current.set(
        targetPosition.x + Math.cos(offsetAngle) * chaseDistance,
        -3,
        targetPosition.z + Math.sin(offsetAngle) * chaseDistance
      );
      targetPosRef.current.copy(targetPosition);
      phaseRef.current = "emerging";
      progressRef.current = 0;

      // Play sounds
      onPlaySound?.("dig");
      setTimeout(() => onPlaySound?.("roar"), 600);
    }
  }, [state, targetPosition, chaseDistance, onPlaySound]);

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
    const dino = groupRef.current;
    const phase = phaseRef.current;

    if (phase === "hidden") {
      dino.visible = false;
      return;
    }
    dino.visible = true;

    // Tail wagging animation
    if (tailRef.current) {
      tailRef.current.rotation.y = Math.sin(Date.now() * 0.008) * 0.3;
    }

    // Jaw animation during chomping
    if (jawRef.current) {
      if (phase === "chomping") {
        jawRef.current.rotation.x = Math.sin(Date.now() * 0.015) * 0.4 - 0.2;
      } else {
        jawRef.current.rotation.x = 0;
      }
    }

    const startPos = startPosRef.current;
    const targetPos = targetPosRef.current;

    // State machine for animation
    if (phase === "emerging") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.5);
      const p = progressRef.current;

      // Rise from the ground
      const y = THREE.MathUtils.lerp(-3, 0, easeOutBack(p));
      dino.position.set(startPos.x, y, startPos.z);

      // Face the target while emerging
      const angle = Math.atan2(
        targetPos.x - startPos.x,
        targetPos.z - startPos.z
      );
      dino.rotation.y = angle;

      // Shake dirt off
      dino.rotation.z = Math.sin(p * 20) * 0.08 * (1 - p);
      dino.rotation.x = 0;

      if (p >= 1) {
        phaseRef.current = "chasing";
        progressRef.current = 0;
      }
    } else if (phase === "chasing") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.4);
      const p = progressRef.current;

      // Move towards target with stomping motion
      const easedP = easeInOutQuad(p);
      const x = THREE.MathUtils.lerp(startPos.x, targetPos.x, easedP);
      const z = THREE.MathUtils.lerp(startPos.z, targetPos.z, easedP);
      const stompY = Math.abs(Math.sin(p * 15)) * 0.3;

      dino.position.set(x, stompY, z);

      // Face the target
      const angle = Math.atan2(targetPos.x - x, targetPos.z - z);
      dino.rotation.y = angle;

      // Running motion - lean forward
      dino.rotation.x = -0.12;
      dino.rotation.z = 0;

      if (p >= 1) {
        phaseRef.current = "chomping";
        progressRef.current = 0;
        onPlaySound?.("chomp");
      }
    } else if (phase === "chomping") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.35);
      const p = progressRef.current;

      // Stay at target position with chomping animation
      dino.position.set(
        targetPos.x,
        Math.abs(Math.sin(p * 10)) * 0.2,
        targetPos.z
      );

      // Head bob while eating
      dino.rotation.x = Math.sin(p * 8) * 0.12;
      dino.rotation.z = 0;

      if (p >= 1) {
        phaseRef.current = "digging";
        progressRef.current = 0;
        onPlaySound?.("dig");
      }
    } else if (phase === "digging") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.5);
      const p = progressRef.current;

      // Sink back into the ground
      const y = THREE.MathUtils.lerp(0, -3.5, easeInBack(p));
      dino.position.set(targetPos.x, y, targetPos.z);

      // Digging motion
      dino.rotation.z = Math.sin(p * 25) * 0.12 * (1 - p);
      dino.rotation.x = 0;

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

  return (
    <group ref={groupRef} scale={[dinoScale, dinoScale, dinoScale]}>
      {/* Victim name label */}
      <Html
        position={[0, 3.5, 0]}
        center
        distanceFactor={10}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            background: "rgba(180, 0, 0, 0.9)",
            color: "white",
            padding: "4px 10px",
            borderRadius: "6px",
            fontSize: "12px",
            fontFamily: "sans-serif",
            fontWeight: "bold",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            border: "2px solid #ff0000",
          }}
        >
          🦖 Hunting: {personName}
        </div>
      </Html>

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
          <meshStandardMaterial
            color={eyeColor}
            emissive={eyeColor}
            emissiveIntensity={0.5}
          />
        </mesh>
        <mesh position={[-0.2, 0.1, 0.1]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial
            color={eyeColor}
            emissive={eyeColor}
            emissiveIntensity={0.5}
          />
        </mesh>
      </group>

      {/* Left leg */}
      <group position={[-0.3, 0.6, 0]}>
        <mesh>
          <capsuleGeometry args={[0.2, 0.6, 8, 16]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
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
        <mesh position={[0, -0.8, -0.3]} rotation={[0.5, 0, 0]}>
          <coneGeometry args={[0.15, 0.8, 8]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
      </group>

      {/* Dirt particles when emerging/digging */}
      {(phaseRef.current === "emerging" || phaseRef.current === "digging") && (
        <DirtParticles />
      )}
    </group>
  );
}

// Dirt particles effect
function DirtParticles() {
  const particlesRef = useRef<THREE.Points>(null);

  const [positions] = useState(() => {
    const pos = new Float32Array(30 * 3);
    for (let i = 0; i < 30; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2;
      pos[i * 3 + 1] = Math.random() * 1.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    return pos;
  });

  useFrame((_, delta) => {
    if (!particlesRef.current) return;
    const positions = particlesRef.current.geometry.attributes.position
      .array as Float32Array;

    for (let i = 0; i < 30; i++) {
      positions[i * 3] += (Math.random() - 0.5) * delta * 2;
      positions[i * 3 + 1] += delta * 2.5;
      positions[i * 3 + 2] += (Math.random() - 0.5) * delta * 2;

      if (positions[i * 3 + 1] > 2.5) {
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
          count={30}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.12} color="#8b4513" transparent opacity={0.7} />
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
