import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { PersonSessionData } from "../hooks/useAnimationState";

interface ProceduralCharacterProps {
  person: PersonSessionData;
  currentPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  isMoving: boolean;
  progress: number;
  isEaten: boolean;
  isDelivered: boolean;
  isBeingDelivered: boolean;
  showLabel: boolean;
}

export function ProceduralCharacter({
  person,
  currentPosition,
  targetPosition,
  isMoving,
  progress,
  isEaten,
  isDelivered,
  isBeingDelivered,
  showLabel,
}: ProceduralCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const targetRotationRef = useRef(0);
  const shirtColor = useMemo(() => person.color.clone().offsetHSL(0, 0.05, -0.08), [person.color]);
  const limbColor = useMemo(() => person.color.clone().offsetHSL(0, 0.03, -0.2), [person.color]);
  const skinColor = useMemo(() => new THREE.Color("#f0c7a1"), []);
  const bobOffset = useMemo(() => {
    let hash = 0;
    for (let index = 0; index < person.personId.length; index += 1) {
      hash = person.personId.charCodeAt(index) + ((hash << 5) - hash);
    }
    return Math.abs(hash % 100) / 100;
  }, [person.personId]);

  useFrame((state) => {
    if (!groupRef.current) {
      return;
    }

    if (isEaten) {
      groupRef.current.visible = false;
      return;
    }

    if (isBeingDelivered && !isDelivered) {
      groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;

    const easedT =
      progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    groupRef.current.position.lerpVectors(currentPosition, targetPosition, easedT);
    groupRef.current.position.y = 0;

    const isActuallyMoving = isMoving && progress > 0.05 && progress < 0.95;
    if (isActuallyMoving) {
      groupRef.current.position.y += Math.sin((state.clock.elapsedTime + bobOffset) * 8) * 0.08;
    }

    if (isBeingDelivered && isDelivered && progress < 0.5) {
      groupRef.current.position.y += 4 * (1 - progress * 2);
    }

    if (isActuallyMoving) {
      const direction = targetPosition.clone().sub(currentPosition);
      if (direction.lengthSq() > 0.1) {
        targetRotationRef.current = Math.atan2(direction.x, direction.z) + Math.PI;
      }
    }

    const currentAngle = groupRef.current.rotation.y;
    let angleDiff = targetRotationRef.current - currentAngle;

    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    groupRef.current.rotation.y += angleDiff * (isActuallyMoving ? 0.15 : 0.05);
  });

  return (
    <group ref={groupRef}>
      <mesh castShadow receiveShadow position={[0, 1.15, 0]}>
        <capsuleGeometry args={[0.34, 0.95, 8, 16]} />
        <meshStandardMaterial color={shirtColor} roughness={0.75} metalness={0.05} />
      </mesh>
      <mesh castShadow position={[0, 2.05, 0]}>
        <sphereGeometry args={[0.3, 20, 20]} />
        <meshStandardMaterial color={skinColor} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[-0.42, 1.2, 0]} rotation={[0, 0, -0.2]}>
        <capsuleGeometry args={[0.08, 0.55, 6, 10]} />
        <meshStandardMaterial color={limbColor} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0.42, 1.2, 0]} rotation={[0, 0, 0.2]}>
        <capsuleGeometry args={[0.08, 0.55, 6, 10]} />
        <meshStandardMaterial color={limbColor} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[-0.16, 0.35, 0]}>
        <capsuleGeometry args={[0.09, 0.6, 6, 10]} />
        <meshStandardMaterial color={limbColor} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0.16, 0.35, 0]}>
        <capsuleGeometry args={[0.09, 0.6, 6, 10]} />
        <meshStandardMaterial color={limbColor} roughness={0.8} />
      </mesh>

      {showLabel && (
        <Html
          position={[0, 2.7, 0]}
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
