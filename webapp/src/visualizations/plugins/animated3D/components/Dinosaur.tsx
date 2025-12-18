import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

export type DinoState = "hidden" | "emerging" | "chasing" | "chomping" | "digging";

// Humorous quotes the dinosaur says
const DINO_QUOTES = [
  "Snack time! 🦴",
  "Performance review time!",
  "You've been... downsized!",
  "HR sent me! 😈",
  "Budget cuts! Sorry!",
  "Your meeting is... cancelled!",
  "Lunch break! (for me)",
  "Deadline? More like... DEADline!",
  "Let's do lunch!",
  "Surprise audit! 📋",
  "You're fired... into my stomach!",
  "Restructuring in progress!",
  "This won't hurt... much!",
  "Nothing personal! 🦖",
  "Optimization complete!",
];

interface DinosaurProps {
  targetPosition: THREE.Vector3;
  personName: string;
  onAnimationComplete?: () => void;
  onPhaseChange?: (phase: DinoState, personId: string) => void;
  personId: string;
  state: DinoState;
  sceneScale: number;
  onPlaySound?: (sound: "roar" | "chomp" | "dig") => void;
}

export function Dinosaur({
  targetPosition,
  personName,
  personId,
  state,
  sceneScale,
  onAnimationComplete,
  onPhaseChange,
  onPlaySound,
}: DinosaurProps) {
  const groupRef = useRef<THREE.Group>(null);
  const jawRef = useRef<THREE.Mesh>(null);
  const tailRef = useRef<THREE.Group>(null);

  // Animation state in refs
  const phaseRef = useRef<DinoState>("hidden");
  const progressRef = useRef(0);
  const startPosRef = useRef(new THREE.Vector3());
  const targetPosRef = useRef(new THREE.Vector3());
  const isInitializedRef = useRef(false);
  const quoteRef = useRef("");

  // Colors
  const bodyColor = useMemo(() => new THREE.Color("#2d5a27"), []);
  const bellyColor = useMemo(() => new THREE.Color("#8fbc8f"), []);
  const eyeColor = useMemo(() => new THREE.Color("#ff4444"), []);

  // Scale distances
  const chaseDistance = Math.max(5, sceneScale * 0.4);
  const dinoScale = Math.max(1.2, sceneScale / 15);

  // Initialize animation
  useEffect(() => {
    if (state === "emerging" && !isInitializedRef.current) {
      isInitializedRef.current = true;

      // Pick a random quote
      quoteRef.current = DINO_QUOTES[Math.floor(Math.random() * DINO_QUOTES.length)];

      const offsetAngle = Math.random() * Math.PI * 2;
      startPosRef.current.set(
        targetPosition.x + Math.cos(offsetAngle) * chaseDistance,
        -3,
        targetPosition.z + Math.sin(offsetAngle) * chaseDistance
      );
      targetPosRef.current.copy(targetPosition);
      phaseRef.current = "emerging";
      progressRef.current = 0;

      onPhaseChange?.("emerging", personId);
      onPlaySound?.("dig");
      setTimeout(() => onPlaySound?.("roar"), 600);
    }
  }, [state, targetPosition, chaseDistance, onPlaySound, onPhaseChange, personId]);

  // Reset
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

    // Tail wagging
    if (tailRef.current) {
      tailRef.current.rotation.y = Math.sin(Date.now() * 0.008) * 0.3;
    }

    // Jaw animation
    if (jawRef.current) {
      if (phase === "chomping") {
        jawRef.current.rotation.x = Math.sin(Date.now() * 0.02) * 0.5 - 0.25;
      } else {
        jawRef.current.rotation.x = 0;
      }
    }

    const startPos = startPosRef.current;
    const targetPos = targetPosRef.current;

    if (phase === "emerging") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.6);
      const p = progressRef.current;

      const y = THREE.MathUtils.lerp(-3, 0, easeOutBack(p));
      dino.position.set(startPos.x, y, startPos.z);

      const angle = Math.atan2(targetPos.x - startPos.x, targetPos.z - startPos.z);
      dino.rotation.y = angle;
      dino.rotation.z = Math.sin(p * 20) * 0.08 * (1 - p);
      dino.rotation.x = 0;

      if (p >= 1) {
        phaseRef.current = "chasing";
        progressRef.current = 0;
        onPhaseChange?.("chasing", personId);
      }
    } else if (phase === "chasing") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.5);
      const p = progressRef.current;

      const easedP = easeInOutQuad(p);
      const x = THREE.MathUtils.lerp(startPos.x, targetPos.x, easedP);
      const z = THREE.MathUtils.lerp(startPos.z, targetPos.z, easedP);
      const stompY = Math.abs(Math.sin(p * 15)) * 0.3;

      dino.position.set(x, stompY, z);

      const angle = Math.atan2(targetPos.x - x, targetPos.z - z);
      dino.rotation.y = angle;
      dino.rotation.x = -0.12;
      dino.rotation.z = 0;

      if (p >= 1) {
        phaseRef.current = "chomping";
        progressRef.current = 0;
        onPhaseChange?.("chomping", personId); // Person should disappear NOW
        onPlaySound?.("chomp");
      }
    } else if (phase === "chomping") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.4);
      const p = progressRef.current;

      dino.position.set(
        targetPos.x,
        Math.abs(Math.sin(p * 12)) * 0.25,
        targetPos.z
      );
      dino.rotation.x = Math.sin(p * 10) * 0.15;
      dino.rotation.z = 0;

      if (p >= 1) {
        phaseRef.current = "digging";
        progressRef.current = 0;
        onPhaseChange?.("digging", personId);
        onPlaySound?.("dig");
      }
    } else if (phase === "digging") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.6);
      const p = progressRef.current;

      const y = THREE.MathUtils.lerp(0, -3.5, easeInBack(p));
      dino.position.set(targetPos.x, y, targetPos.z);
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

  if (phaseRef.current === "hidden" && state === "hidden") {
    return null;
  }

  return (
    <group ref={groupRef} scale={[dinoScale, dinoScale, dinoScale]}>
      {/* Speech bubble with quote */}
      <Html
        position={[0, 4, 0]}
        center
        distanceFactor={8}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            background: "rgba(180, 0, 0, 0.95)",
            color: "white",
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "13px",
            fontFamily: "system-ui, sans-serif",
            fontWeight: "bold",
            whiteSpace: "nowrap",
            boxShadow: "0 3px 12px rgba(0,0,0,0.5)",
            border: "2px solid #ff3333",
          }}
        >
          <div style={{ fontSize: "10px", opacity: 0.8, marginBottom: "2px" }}>
            🦖 Hunting: {personName}
          </div>
          <div style={{ fontSize: "14px" }}>{quoteRef.current}</div>
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
        <mesh>
          <boxGeometry args={[0.5, 0.4, 0.8]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
        <mesh position={[0, -0.1, 0.5]}>
          <boxGeometry args={[0.4, 0.25, 0.5]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
        {/* Teeth */}
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
          <mesh position={[0, 0.12, 0.2]}>
            <coneGeometry args={[0.025, 0.08, 4]} />
            <meshStandardMaterial color="white" />
          </mesh>
        </mesh>
        {/* Eyes */}
        <mesh position={[0.2, 0.1, 0.1]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[-0.2, 0.1, 0.1]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* Legs */}
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

      {/* Arms */}
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

      {/* Dirt particles */}
      {(phaseRef.current === "emerging" || phaseRef.current === "digging") && <DirtParticles />}
    </group>
  );
}

function DirtParticles() {
  const particlesRef = useRef<THREE.Points>(null);
  const [positions] = useMemo(() => {
    const pos = new Float32Array(30 * 3);
    for (let i = 0; i < 30; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2;
      pos[i * 3 + 1] = Math.random() * 1.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    return [pos];
  }, []);

  useFrame((_, delta) => {
    if (!particlesRef.current) return;
    const pos = particlesRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < 30; i++) {
      pos[i * 3] += (Math.random() - 0.5) * delta * 2;
      pos[i * 3 + 1] += delta * 2.5;
      pos[i * 3 + 2] += (Math.random() - 0.5) * delta * 2;
      if (pos[i * 3 + 1] > 2.5) {
        pos[i * 3] = (Math.random() - 0.5) * 2;
        pos[i * 3 + 1] = 0;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 2;
      }
    }
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={30} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.12} color="#8b4513" transparent opacity={0.7} />
    </points>
  );
}

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
