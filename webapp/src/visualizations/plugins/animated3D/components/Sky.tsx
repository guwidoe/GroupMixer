import { useMemo } from "react";
import * as THREE from "three";

export function Sky() {
  const skyColor = useMemo(() => new THREE.Color("#87CEEB"), []);
  const horizonColor = useMemo(() => new THREE.Color("#E0F4FF"), []);

  return (
    <>
      {/* Sky dome */}
      <mesh scale={[-1, 1, 1]}>
        <sphereGeometry args={[200, 32, 32]} />
        <meshBasicMaterial color={skyColor} side={THREE.BackSide} />
      </mesh>

      {/* Sun */}
      <mesh position={[50, 80, -50]}>
        <sphereGeometry args={[8, 32, 32]} />
        <meshBasicMaterial color="#FFF8DC" />
      </mesh>

      {/* Ambient clouds (simple spheres) */}
      {Array.from({ length: 15 }, (_, i) => {
        const angle = (i / 15) * Math.PI * 2;
        const radius = 80 + Math.random() * 40;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = 40 + Math.random() * 30;

        return (
          <group key={i} position={[x, y, z]}>
            <mesh>
              <sphereGeometry args={[5 + Math.random() * 5, 8, 8]} />
              <meshBasicMaterial color="white" transparent opacity={0.8} />
            </mesh>
            <mesh position={[3, -1, 2]}>
              <sphereGeometry args={[3 + Math.random() * 3, 8, 8]} />
              <meshBasicMaterial color="white" transparent opacity={0.7} />
            </mesh>
            <mesh position={[-4, 0, 1]}>
              <sphereGeometry args={[4 + Math.random() * 3, 8, 8]} />
              <meshBasicMaterial color="white" transparent opacity={0.75} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
