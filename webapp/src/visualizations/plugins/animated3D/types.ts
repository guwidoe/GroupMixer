import type * as THREE from "three";

// Group layout in 3D space
export interface GroupLayout {
  groupId: string;
  position: THREE.Vector3;
  radius: number;
  capacity: number;
}

// Animation event types
export type AnimationEvent =
  | { type: "walk"; personId: string; fromGroup: string; toGroup: string }
  | { type: "eaten"; personId: string; lastGroup: string }
  | { type: "delivered"; personId: string; toGroup: string };

// Session transition data
export interface SessionTransition {
  fromSession: number;
  toSession: number;
  events: AnimationEvent[];
}

// Playback state
export interface PlaybackState {
  isPlaying: boolean;
  currentSession: number;
  transitionProgress: number; // 0-1 progress through current transition
  speed: number; // Playback speed multiplier
}

// Audio manager interface
export interface AudioManager {
  playDinoRoar: () => void;
  playDinoChomp: () => void;
  playDinoDigging: () => void;
  playStorkFlap: () => void;
  playFootsteps: () => void;
  stopFootsteps: () => void;
  setMuted: (muted: boolean) => void;
}
