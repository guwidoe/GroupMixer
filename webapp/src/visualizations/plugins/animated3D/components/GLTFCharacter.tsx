import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { PersonSessionData } from "../hooks/useAnimationState";

interface GLTFCharacterProps {
  person: PersonSessionData;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  currentPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  isMoving: boolean;
  progress: number;
  isEaten: boolean;
  isDelivered: boolean;
  isBeingDelivered: boolean;
  showLabel: boolean;
}

export function GLTFCharacter({
  person,
  scene,
  animations,
  currentPosition,
  targetPosition,
  isMoving,
  progress,
  isEaten,
  isDelivered,
  isBeingDelivered,
  showLabel,
}: GLTFCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Clone scene for this character
  const clone = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene);
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return cloned;
  }, [scene]);

  const { actions, mixer } = useAnimations(animations, clone);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const lastAnimStateRef = useRef<string>("");
  const targetRotationRef = useRef<number>(0);

  // Start idle animation immediately when component mounts
  useEffect(() => {
    const animNames = Object.keys(actions);
    const idleAnim =
      animNames.find((n) => n.toLowerCase() === "idle") ||
      animNames.find(
        (n) => n.toLowerCase().includes("idle") || n.toLowerCase().includes("stand")
      ) ||
      animNames[0];

    if (idleAnim && actions[idleAnim]) {
      actions[idleAnim]?.reset().fadeIn(0.1).play();
      currentActionRef.current = actions[idleAnim] || null;
      lastAnimStateRef.current = "idle";
    }
  }, [actions]);

  // Apply color tint
  useEffect(() => {
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        // Clone material to avoid affecting other instances
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => {
            const mat = m.clone();
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.color.lerp(person.color, 0.4);
            }
            return mat;
          });
        } else {
          const mat = child.material.clone();
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.color.lerp(person.color, 0.4);
          }
          child.material = mat;
        }
      }
    });
  }, [clone, person.color]);

  // Update position, animation, and rotation every frame
  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Update animation mixer
    mixer.update(delta);

    // Handle visibility for eaten characters
    if (isEaten) {
      groupRef.current.visible = false;
      return;
    }

    // Handle visibility for characters being delivered (hide until stork drops them)
    if (isBeingDelivered && !isDelivered) {
      groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;

    // Determine if character should be walking or idle based on actual movement
    const isActuallyMoving = isMoving && progress > 0.05 && progress < 0.95;
    const animState = isActuallyMoving ? "walking" : "idle";

    // Handle animation transitions
    if (lastAnimStateRef.current !== animState) {
      lastAnimStateRef.current = animState;

      const animNames = Object.keys(actions);
      let targetAnimName: string | null = null;

      if (animState === "walking") {
        targetAnimName =
          animNames.find((n) => n.toLowerCase() === "walk") ||
          animNames.find((n) => n.toLowerCase().includes("walk")) ||
          animNames.find((n) => n.toLowerCase().includes("run")) ||
          animNames[0];
      } else {
        targetAnimName =
          animNames.find((n) => n.toLowerCase() === "idle") ||
          animNames.find(
            (n) =>
              n.toLowerCase().includes("idle") ||
              n.toLowerCase().includes("stand")
          ) ||
          animNames[0];
      }

      if (targetAnimName) {
        const targetAction = actions[targetAnimName];
        if (targetAction) {
          if (currentActionRef.current && currentActionRef.current !== targetAction) {
            currentActionRef.current.fadeOut(0.3);
          }

          targetAction.reset().fadeIn(0.3).play();
          targetAction.setEffectiveTimeScale(animState === "walking" ? 1.0 : 0.8);
          currentActionRef.current = targetAction;
        }
      }
    }

    // Interpolate position
    const easedT =
      progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    groupRef.current.position.lerpVectors(
      currentPosition,
      targetPosition,
      easedT
    );

    // Drop animation for delivered characters
    if (isBeingDelivered && isDelivered && progress < 0.5) {
      groupRef.current.position.y += 4 * (1 - progress * 2);
    }

    // Face movement direction - only update target when actually moving
    if (isActuallyMoving) {
      const dir = targetPosition.clone().sub(currentPosition);
      if (dir.lengthSq() > 0.1) {
        targetRotationRef.current = Math.atan2(dir.x, dir.z) + Math.PI;
      }
    }

    // Always smoothly rotate towards target rotation
    const currentAngle = groupRef.current.rotation.y;
    let angleDiff = targetRotationRef.current - currentAngle;

    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const rotSpeed = isActuallyMoving ? 0.15 : 0.05;
    groupRef.current.rotation.y += angleDiff * rotSpeed;
  });

  return (
    <group ref={groupRef} scale={[0.5, 0.5, 0.5]}>
      <primitive object={clone} />

      {showLabel && (
        <Html
          position={[0, 4, 0]}
          center
          distanceFactor={12}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            style={{
              background: "rgba(0, 0, 0, 0.8)",
              color: "white",
              padding: "4px 10px",
              borderRadius: "4px",
              fontSize: "12px",
              fontFamily: "system-ui, sans-serif",
              whiteSpace: "nowrap",
              fontWeight: 500,
            }}
          >
            {person.name}
          </div>
        </Html>
      )}
    </group>
  );
}
