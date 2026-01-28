import { useMemo } from "react";
import * as THREE from "three";

export function Sky() {
  const skyColor = useMemo(() => new THREE.Color("#87CEEB"), []);
  const pseudoRandom = (seed: number) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  const clouds = useMemo(
    () =>
      Array.from({ length: 15 }, (_, i) => {
        const angle = (i / 15) * Math.PI * 2;
        const radius = 80 + pseudoRandom(i + 1) * 40;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = 40 + pseudoRandom(i + 2) * 30;

        return {
          key: i,
          position: [x, y, z] as [number, number, number],
          blobs: [
            { position: [0, 0, 0] as [number, number, number], radius: 5 + pseudoRandom(i + 3) * 5, opacity: 0.8 },
            { position: [3, -1, 2] as [number, number, number], radius: 3 + pseudoRandom(i + 4) * 3, opacity: 0.7 },
            { position: [-4, 0, 1] as [number, number, number], radius: 4 + pseudoRandom(i + 5) * 3, opacity: 0.75 },
          ],
        };
      }),
    []
  );

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
      {clouds.map((cloud) => (
        <group key={cloud.key} position={cloud.position}>
          {cloud.blobs.map((blob, idx) => (
            <mesh key={idx} position={blob.position}>
              <sphereGeometry args={[blob.radius, 8, 8]} />
              <meshBasicMaterial color="white" transparent opacity={blob.opacity} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}
