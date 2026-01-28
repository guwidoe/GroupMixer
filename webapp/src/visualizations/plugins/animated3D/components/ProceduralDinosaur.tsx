import { useRef, useMemo, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DinosaurProps, DinoState } from "./dinoTypes";

export function ProceduralDinosaur({
  targetPosition,
  personId,
  state,
  sceneScale,
  onAnimationComplete,
  onPhaseChange,
  onPlaySound,
}: DinosaurProps) {
  const groupRef = useRef<THREE.Group>(null);
  const phaseRef = useRef<DinoState>("hidden");
  const [phase, setPhase] = useState<DinoState>("hidden");
  const progressRef = useRef(0);
  const startPosRef = useRef(new THREE.Vector3());
  const targetPosRef = useRef(new THREE.Vector3());
  const isInitializedRef = useRef(false);

  const bodyColor = useMemo(() => new THREE.Color("#2d5a27"), []);
  const chaseDistance = Math.max(5, sceneScale * 0.4);
  const dinoScale = Math.max(1.2, sceneScale / 15);

  const setPhaseSafe = useCallback((next: DinoState) => {
    if (phaseRef.current !== next) {
      phaseRef.current = next;
      setPhase(next);
    }
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const dino = groupRef.current;

    if (state === "hidden") {
      if (phaseRef.current !== "hidden") {
        setPhaseSafe("hidden");
        progressRef.current = 0;
        isInitializedRef.current = false;
      }
      dino.visible = false;
      return;
    }

    if (state === "emerging" && !isInitializedRef.current) {
      isInitializedRef.current = true;
      const offsetAngle = Math.random() * Math.PI * 2;
      startPosRef.current.set(
        targetPosition.x + Math.cos(offsetAngle) * chaseDistance,
        -3,
        targetPosition.z + Math.sin(offsetAngle) * chaseDistance
      );
      targetPosRef.current.copy(targetPosition);
      setPhaseSafe("emerging");
      progressRef.current = 0;
      onPhaseChange?.("emerging", personId);
      onPlaySound?.("dig");
    }

    if (phaseRef.current === "hidden") {
      dino.visible = false;
      return;
    }

    dino.visible = true;
    progressRef.current = Math.min(1, progressRef.current + delta * 0.3);

    if (progressRef.current >= 1 && phaseRef.current !== "hidden") {
      setPhaseSafe("hidden");
      isInitializedRef.current = false;
      onAnimationComplete?.();
    }
  });

  if (phase === "hidden" && state === "hidden") return null;

  return (
    <group ref={groupRef} scale={[dinoScale, dinoScale, dinoScale]}>
      <mesh>
        <boxGeometry args={[1, 1, 2]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
    </group>
  );
}
