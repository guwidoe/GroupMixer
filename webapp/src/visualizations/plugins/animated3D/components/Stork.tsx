import { useRef, useEffect, useMemo, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Html } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

export type StorkState = "hidden" | "flying_in" | "hovering" | "dropping" | "flying_out";

// Use flamingo model which has wing flapping animation
const STORK_MODEL_URL = "/models/flamingo.glb?v=2";

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

function StorkModel({
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
  
  // Load GLTF model
  const { scene, animations } = useGLTF(STORK_MODEL_URL);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions, mixer } = useAnimations(animations, clone);

  // Animation state refs
  const phaseRef = useRef<StorkState>("hidden");
  const progressRef = useRef(0);
  const startPosRef = useRef(new THREE.Vector3());
  const hoverPosRef = useRef(new THREE.Vector3());
  const dropPosRef = useRef(new THREE.Vector3());
  const exitPosRef = useRef(new THREE.Vector3());
  const isInitializedRef = useRef(false);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  // Scale - flamingo model from three.js examples
  const flyDistance = Math.max(20, sceneScale * 1.2);
  const flyHeight = Math.max(12, sceneScale * 0.7);
  const storkScale = Math.max(0.01, sceneScale / 1500); // Smaller scale

  // Start animation immediately when model loads
  useEffect(() => {
    const animNames = Object.keys(actions);
    console.log("Stork animations available:", animNames);
    
    // Play the first available animation (flamingo_flyA_)
    const flyAnim = animNames.find(a => 
      a.toLowerCase().includes("fly")
    ) || animNames[0];
    
    if (flyAnim && actions[flyAnim]) {
      const action = actions[flyAnim];
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.setEffectiveTimeScale(1.5); // Faster flapping
      action.play();
      currentActionRef.current = action;
    }
  }, [actions]);

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
      // Animation already playing from useEffect
      onPhaseChange?.("flying_in", personId);
      onPlaySound?.("flap");
    }
  }, [state, targetPosition, flyDistance, flyHeight, onPlaySound, onPhaseChange, personId, actions]);

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

    mixer.update(delta);

    if (phase === "hidden") {
      stork.visible = false;
      return;
    }
    stork.visible = true;

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
      stork.rotation.z = Math.sin(Date.now() * 0.003) * 0.1; // Banking

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
      stork.rotation.z = 0;

      if (p >= 1) {
        phaseRef.current = "dropping";
        progressRef.current = 0;
        onPhaseChange?.("dropping", personId);
      }
    } else if (phase === "dropping") {
      progressRef.current = Math.min(1, progressRef.current + delta * 1.5);
      const p = progressRef.current;

      stork.position.copy(dropPos);
      stork.position.y += Math.sin(Date.now() * 0.006) * 0.08;

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
      stork.rotation.z = Math.sin(Date.now() * 0.003) * 0.1;

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

  const showBag = phaseRef.current === "flying_in" || phaseRef.current === "hovering";

  return (
    <group ref={groupRef} scale={[storkScale, storkScale, storkScale]}>
      <primitive object={clone} />
      
      {/* Label - positioned above model */}
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

      {/* Delivery bag */}
      {showBag && <DeliveryBag />}
    </group>
  );
}

// Delivery bag (procedural, attached to stork)
function DeliveryBag() {
  const bagColor = useMemo(() => new THREE.Color("#c9a87c"), []);
  const skinColor = useMemo(() => new THREE.Color("#e0b89e"), []);
  
  return (
    <group position={[0, -1.5, 0.5]}>
      {/* Bag */}
      <mesh>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshStandardMaterial color={bagColor} />
      </mesh>
      {/* Knot */}
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[0.25, 8, 8]} />
        <meshStandardMaterial color={bagColor} />
      </mesh>
      {/* Baby head */}
      <mesh position={[0, 0.4, 0.4]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
    </group>
  );
}

// Main component with Suspense fallback
export function Stork(props: StorkProps) {
  return (
    <Suspense fallback={<ProceduralStork {...props} />}>
      <StorkModel {...props} />
    </Suspense>
  );
}

// Fallback procedural stork (simplified)
function ProceduralStork({
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
  const phaseRef = useRef<StorkState>("hidden");
  const progressRef = useRef(0);
  const isInitializedRef = useRef(false);

  const bodyColor = useMemo(() => new THREE.Color("#ffffff"), []);
  const storkScale = Math.max(1, sceneScale / 20);

  useEffect(() => {
    if (state === "flying_in" && !isInitializedRef.current) {
      isInitializedRef.current = true;
      phaseRef.current = "flying_in";
      progressRef.current = 0;
      onPhaseChange?.("flying_in", personId);
      onPlaySound?.("flap");
    }
  }, [state, onPlaySound, onPhaseChange, personId]);

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
    if (phaseRef.current === "hidden") {
      stork.visible = false;
      return;
    }
    stork.visible = true;
    progressRef.current = Math.min(1, progressRef.current + delta * 0.3);
  });

  if (phaseRef.current === "hidden" && state === "hidden") return null;

  return (
    <group ref={groupRef} scale={[storkScale, storkScale, storkScale]} position={[targetPosition.x, 10, targetPosition.z]}>
      <mesh>
        <capsuleGeometry args={[0.3, 0.8, 8, 16]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
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

// Preload
useGLTF.preload("/models/flamingo.glb");
