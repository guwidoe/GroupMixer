import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  Gauge,
} from "lucide-react";
import type { PlaybackState } from "../types";

interface PlaybackControlsProps {
  playback: PlaybackState;
  sessionCount: number;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onGoToSession: (session: number) => void;
  onSetSpeed: (speed: number) => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export function PlaybackControls({
  playback,
  sessionCount,
  onPlay,
  onPause,
  onReset,
  onGoToSession,
  onSetSpeed,
  isMuted,
  onToggleMute,
}: PlaybackControlsProps) {
  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-lg"
      style={{
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Reset button */}
      <button
        onClick={onReset}
        className="p-2 rounded hover:bg-white/20 transition-colors"
        title="Reset"
      >
        <RotateCcw size={18} color="white" />
      </button>

      {/* Previous session */}
      <button
        onClick={() => onGoToSession(playback.currentSession - 1)}
        disabled={playback.currentSession === 0}
        className="p-2 rounded hover:bg-white/20 transition-colors disabled:opacity-40"
        title="Previous session"
      >
        <ChevronLeft size={18} color="white" />
      </button>

      {/* Play/Pause */}
      <button
        onClick={playback.isPlaying ? onPause : onPlay}
        className="p-3 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
        title={playback.isPlaying ? "Pause" : "Play"}
      >
        {playback.isPlaying ? (
          <Pause size={20} color="white" fill="white" />
        ) : (
          <Play size={20} color="white" fill="white" />
        )}
      </button>

      {/* Next session */}
      <button
        onClick={() => onGoToSession(playback.currentSession + 1)}
        disabled={playback.currentSession >= sessionCount - 1}
        className="p-2 rounded hover:bg-white/20 transition-colors disabled:opacity-40"
        title="Next session"
      >
        <ChevronRight size={18} color="white" />
      </button>

      {/* Session indicator */}
      <div className="flex items-center gap-2 px-3 border-l border-white/30">
        <span className="text-white text-sm">
          Session {playback.currentSession + 1} / {sessionCount}
        </span>
        {/* Progress bar */}
        <div className="w-20 h-1.5 bg-white/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-100"
            style={{
              width: `${((playback.currentSession + playback.transitionProgress) / Math.max(1, sessionCount - 1)) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Speed control */}
      <div className="flex items-center gap-2 px-3 border-l border-white/30">
        <Gauge size={16} color="white" className="opacity-70" />
        <select
          value={playback.speed}
          onChange={(e) => onSetSpeed(Number(e.target.value))}
          className="bg-transparent text-white text-sm border-none outline-none cursor-pointer"
          style={{ WebkitAppearance: "none" }}
        >
          <option value={0.25} style={{ color: "black" }}>0.25x</option>
          <option value={0.5} style={{ color: "black" }}>0.5x</option>
          <option value={1} style={{ color: "black" }}>1x</option>
          <option value={1.5} style={{ color: "black" }}>1.5x</option>
          <option value={2} style={{ color: "black" }}>2x</option>
          <option value={3} style={{ color: "black" }}>3x</option>
        </select>
      </div>

      {/* Mute button */}
      <button
        onClick={onToggleMute}
        className="p-2 rounded hover:bg-white/20 transition-colors"
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <VolumeX size={18} color="white" />
        ) : (
          <Volume2 size={18} color="white" />
        )}
      </button>
    </div>
  );
}
