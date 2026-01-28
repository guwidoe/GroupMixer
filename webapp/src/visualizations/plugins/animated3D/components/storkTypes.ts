import type * as THREE from "three";

export type StorkState = "hidden" | "flying_in" | "hovering" | "dropping" | "flying_out";

export interface StorkProps {
  targetPosition: THREE.Vector3;
  personName: string;
  personId: string;
  state: StorkState;
  sceneScale: number;
  onAnimationComplete?: () => void;
  onPhaseChange?: (phase: StorkState, personId: string) => void;
  onPlaySound?: (sound: "flap") => void;
}
