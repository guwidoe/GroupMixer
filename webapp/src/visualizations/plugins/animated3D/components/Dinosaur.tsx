import { useRef, useEffect, useMemo, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Html } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

export type DinoState = "hidden" | "emerging" | "chasing" | "chomping" | "digging";

// Add cache-busting parameter to force reload of model
const DINOSAUR_MODEL_URL = "/models/dinosaur.glb?v=2";

// Humorous quotes
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

function DinosaurModel({
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
  
  // Load GLTF model
  const { scene, animations } = useGLTF(DINOSAUR_MODEL_URL);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions, mixer } = useAnimations(animations, clone);

  // Animation state refs
  const phaseRef = useRef<DinoState>("hidden");
  const progressRef = useRef(0);
  const startPosRef = useRef(new THREE.Vector3());
  const targetPosRef = useRef(new THREE.Vector3());
  const isInitializedRef = useRef(false);
  const quoteRef = useRef("");
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  // Scale - adjust to be about 2-3x the size of humanoids (which are 0.5 scale)
  const chaseDistance = Math.max(5, sceneScale * 0.4);
  const dinoScale = 1.5; // Larger scale - model was invisible at 0.015

  // Start animation when model loads
  useEffect(() => {
    const animNames = Object.keys(actions);
    console.log("Dinosaur animations available:", animNames);
    
    // Play any available animation
    const anim = animNames[0];
    if (anim && actions[anim]) {
      const action = actions[anim];
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.setEffectiveTimeScale(1.0);
      action.play();
      currentActionRef.current = action;
    }
  }, [actions]);

  // Initialize animation
  useEffect(() => {
    if (state === "emerging" && !isInitializedRef.current) {
      isInitializedRef.current = true;
      quoteRef.current = DINO_QUOTES[Math.floor(Math.random() * DINO_QUOTES.length)];

      const offsetAngle = Math.random() * Math.PI * 2;
      startPosRef.current.set(
        targetPosition.x + Math.cos(offsetAngle) * chaseDistance,
        -2,
        targetPosition.z + Math.sin(offsetAngle) * chaseDistance
      );
      targetPosRef.current.copy(targetPosition);
      phaseRef.current = "emerging";
      progressRef.current = 0;

      // Animation already playing from useEffect
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

    mixer.update(delta);

    if (phase === "hidden") {
      dino.visible = false;
      return;
    }
    dino.visible = true;

    const startPos = startPosRef.current;
    const targetPos = targetPosRef.current;

    if (phase === "emerging") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.6);
      const p = progressRef.current;

      const y = THREE.MathUtils.lerp(-2, 0, easeOutBack(p));
      dino.position.set(startPos.x, y, startPos.z);

      const angle = Math.atan2(targetPos.x - startPos.x, targetPos.z - startPos.z);
      dino.rotation.y = angle;

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
      const stompY = Math.abs(Math.sin(p * 15)) * 0.2;

      dino.position.set(x, stompY, z);

      const angle = Math.atan2(targetPos.x - x, targetPos.z - z);
      dino.rotation.y = angle;

      if (p >= 1) {
        phaseRef.current = "chomping";
        progressRef.current = 0;
        onPhaseChange?.("chomping", personId);
        onPlaySound?.("chomp");
      }
    } else if (phase === "chomping") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.4);
      const p = progressRef.current;

      dino.position.set(targetPos.x, Math.abs(Math.sin(p * 12)) * 0.15, targetPos.z);
      
      // Shake while eating
      dino.rotation.z = Math.sin(p * 20) * 0.1;

      if (p >= 1) {
        phaseRef.current = "digging";
        progressRef.current = 0;
        onPhaseChange?.("digging", personId);
        onPlaySound?.("dig");
      }
    } else if (phase === "digging") {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.6);
      const p = progressRef.current;

      const y = THREE.MathUtils.lerp(0, -2.5, easeInBack(p));
      dino.position.set(targetPos.x, y, targetPos.z);
      dino.rotation.z = Math.sin(p * 25) * 0.1 * (1 - p);

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
      <primitive object={clone} />
      
      {/* Speech bubble - positioned above model */}
      <Html
        position={[0, 3, 0]}
        center
        distanceFactor={10}
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

      {/* Dirt particles */}
      {(phaseRef.current === "emerging" || phaseRef.current === "digging") && <DirtParticles />}
    </group>
  );
}

// Main component with Suspense fallback
export function Dinosaur(props: DinosaurProps) {
  return (
    <Suspense fallback={<ProceduralDinosaur {...props} />}>
      <DinosaurModel {...props} />
    </Suspense>
  );
}

// Fallback procedural dinosaur (simplified)
function ProceduralDinosaur({
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
  const phaseRef = useRef<DinoState>("hidden");
  const progressRef = useRef(0);
  const startPosRef = useRef(new THREE.Vector3());
  const targetPosRef = useRef(new THREE.Vector3());
  const isInitializedRef = useRef(false);
  const quoteRef = useRef("");

  const bodyColor = useMemo(() => new THREE.Color("#2d5a27"), []);
  const chaseDistance = Math.max(5, sceneScale * 0.4);
  const dinoScale = Math.max(1.2, sceneScale / 15);

  useEffect(() => {
    if (state === "emerging" && !isInitializedRef.current) {
      isInitializedRef.current = true;
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
    }
  }, [state, targetPosition, chaseDistance, onPlaySound, onPhaseChange, personId]);

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
    if (phaseRef.current === "hidden") {
      dino.visible = false;
      return;
    }
    dino.visible = true;
    // Simplified animation...
    progressRef.current = Math.min(1, progressRef.current + delta * 0.3);
  });

  if (phaseRef.current === "hidden" && state === "hidden") return null;

  return (
    <group ref={groupRef} scale={[dinoScale, dinoScale, dinoScale]}>
      <mesh>
        <boxGeometry args={[1, 1, 2]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
    </group>
  );
}

function DirtParticles() {
  const particlesRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const pos = new Float32Array(30 * 3);
    for (let i = 0; i < 30; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2;
      pos[i * 3 + 1] = Math.random() * 1.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    return pos;
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
      <pointsMaterial size={0.15} color="#8b4513" transparent opacity={0.7} />
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

// Preload
useGLTF.preload("/models/dinosaur.glb");
