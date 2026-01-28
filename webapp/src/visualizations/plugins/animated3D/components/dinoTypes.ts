import type * as THREE from "three";

export type DinoState = "hidden" | "emerging" | "chasing" | "chomping" | "digging";

export interface DinosaurProps {
  targetPosition: THREE.Vector3;
  personName: string;
  onAnimationComplete?: () => void;
  onPhaseChange?: (phase: DinoState, personId: string) => void;
  personId: string;
  state: DinoState;
  sceneScale: number;
  onPlaySound?: (sound: "roar" | "chomp" | "dig") => void;
}
