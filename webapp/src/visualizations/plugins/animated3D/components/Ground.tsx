import * as THREE from "three";
import { useMemo } from "react";

interface GroundProps {
  size?: number;
}

export function Ground({ size = 100 }: GroundProps) {
  const grassColor = useMemo(() => new THREE.Color("#4a7c59"), []);
  const gridColor = useMemo(() => new THREE.Color("#3d6b4a"), []);

  return (
    <group>
      {/* Main ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color={grassColor} />
      </mesh>

      {/* Subtle grid pattern */}
      <gridHelper
        args={[size, 40, gridColor, gridColor]}
        position={[0, -0.14, 0]}
      />

      {/* Some decorative elements - small grass tufts */}
      {Array.from({ length: 100 }, (_, i) => {
        const x = (Math.random() - 0.5) * size * 0.9;
        const z = (Math.random() - 0.5) * size * 0.9;
        const scale = 0.3 + Math.random() * 0.4;

        return (
          <mesh
            key={i}
            position={[x, 0.1 * scale, z]}
            rotation={[0, Math.random() * Math.PI, 0]}
          >
            <coneGeometry args={[0.1 * scale, 0.3 * scale, 4]} />
            <meshStandardMaterial color="#5a8c69" />
          </mesh>
        );
      })}
    </group>
  );
}
