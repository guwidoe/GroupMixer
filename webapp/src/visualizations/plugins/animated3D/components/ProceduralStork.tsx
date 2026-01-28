import { useRef, useMemo, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { StorkProps, StorkState } from "./storkTypes";

export function ProceduralStork({
  targetPosition,
  personId,
  state,
  sceneScale,
  onAnimationComplete,
  onPhaseChange,
  onPlaySound,
}: StorkProps) {
  const groupRef = useRef<THREE.Group>(null);
  const phaseRef = useRef<StorkState>("hidden");
  const [phase, setPhase] = useState<StorkState>("hidden");
  const progressRef = useRef(0);
  const isInitializedRef = useRef(false);

  const bodyColor = useMemo(() => new THREE.Color("#ffffff"), []);
  const storkScale = Math.max(1, sceneScale / 20);

  const setPhaseSafe = useCallback((next: StorkState) => {
    if (phaseRef.current !== next) {
      phaseRef.current = next;
      setPhase(next);
    }
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const stork = groupRef.current;
    if (state === "hidden") {
      if (phaseRef.current !== "hidden") {
        setPhaseSafe("hidden");
        progressRef.current = 0;
        isInitializedRef.current = false;
      }
      stork.visible = false;
      return;
    }

    if (state === "flying_in" && !isInitializedRef.current) {
      isInitializedRef.current = true;
      setPhaseSafe("flying_in");
      progressRef.current = 0;
      onPhaseChange?.("flying_in", personId);
      onPlaySound?.("flap");
    }
    if (phaseRef.current === "hidden") {
      stork.visible = false;
      return;
    }
    stork.visible = true;
    progressRef.current = Math.min(1, progressRef.current + delta * 0.3);
    if (progressRef.current >= 1) {
      setPhaseSafe("hidden");
      isInitializedRef.current = false;
      onAnimationComplete?.();
    }
  });

  if (phase === "hidden" && state === "hidden") return null;

  return (
    <group
      ref={groupRef}
      scale={[storkScale, storkScale, storkScale]}
      position={[targetPosition.x, 10, targetPosition.z]}
    >
      <mesh>
        <capsuleGeometry args={[0.3, 0.8, 8, 16]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
    </group>
  );
}
