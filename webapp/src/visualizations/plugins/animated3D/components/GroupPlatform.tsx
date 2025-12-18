import { useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { GroupLayout } from "../types";

interface GroupPlatformProps {
  layout: GroupLayout;
  peopleCount: number;
}

export function GroupPlatform({ layout, peopleCount }: GroupPlatformProps) {
  // Color based on utilization
  const color = useMemo(() => {
    const utilization = layout.capacity > 0 ? peopleCount / layout.capacity : 0;
    if (utilization > 1) return new THREE.Color("#ff6b6b"); // Over capacity
    if (utilization > 0.8) return new THREE.Color("#ffd93d"); // Near capacity
    if (utilization > 0.5) return new THREE.Color("#6bcb77"); // Good
    return new THREE.Color("#4d96ff"); // Under-utilized
  }, [peopleCount, layout.capacity]);

  const ringColor = useMemo(() => color.clone().multiplyScalar(0.7), [color]);

  // Calculate label scale to fit within the circle
  const labelScale = useMemo(() => {
    // Estimate text width: group name + " (X/Y)" suffix
    const fullText = `${layout.groupId} (${peopleCount}/${layout.capacity})`;
    const estimatedCharWidth = 0.6; // Approximate width per character at 100px font in 3D units
    const estimatedTextWidth = fullText.length * estimatedCharWidth;
    
    // Target width is about 80% of circle diameter
    const targetWidth = layout.radius * 1.6;
    
    // Scale to fit
    return Math.min(targetWidth / estimatedTextWidth, 0.5); // Cap at 0.5 to prevent oversized text
  }, [layout.groupId, layout.radius, peopleCount, layout.capacity]);

  return (
    <group position={layout.position}>
      {/* Main platform */}
      <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[layout.radius, 32]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Platform ring */}
      <mesh position={[0, -0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[layout.radius - 0.15, layout.radius, 32]} />
        <meshStandardMaterial
          color={ringColor}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Decorative pillars around the edge */}
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const x = Math.cos(angle) * layout.radius;
        const z = Math.sin(angle) * layout.radius;
        return (
          <mesh key={i} position={[x, 0.3, z]}>
            <cylinderGeometry args={[0.1, 0.1, 0.6, 8]} />
            <meshStandardMaterial color={ringColor} />
          </mesh>
        );
      })}

      {/* Group label flat on the floor using Html with transform */}
      <Html
        position={[0, 0.05, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        transform
        occlude={false}
        scale={labelScale}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            color: "#ffdd00",
            fontSize: "100px",
            fontFamily: "system-ui, sans-serif",
            fontWeight: "bold",
            textShadow: "3px 3px 6px rgba(0,0,0,0.9)",
            whiteSpace: "nowrap",
            transform: "translateX(-50%)",
          }}
        >
          {layout.groupId}
          <span style={{ opacity: 0.7, marginLeft: "10px", fontSize: "0.7em" }}>
            ({peopleCount}/{layout.capacity})
          </span>
        </div>
      </Html>
    </group>
  );
}
