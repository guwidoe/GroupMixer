import { useMemo, useCallback, Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { VisualizationComponentProps } from "../../types";
import { normalizeFromSnapshot, normalizeFromSolution } from "../../models/normalize";
import { useAnimationState } from "./hooks/useAnimationState";
import { useAudio } from "./hooks/useAudio";
import { Scene } from "./components/Scene";
import { PlaybackControls } from "./components/PlaybackControls";
import { Tag, EyeOff } from "lucide-react";
import type { PlaybackState } from "./types";
import { LoadingFallback } from "./components/LoadingFallback";

export function Animated3DVisualization({ data }: VisualizationComponentProps) {
  const problem = data.problem;

  // Normalize schedule data
  const schedule = useMemo(() => {
    if (data.kind === "final") {
      return normalizeFromSolution(problem, data.solution);
    }
    return normalizeFromSnapshot(problem, data.schedule);
  }, [data, problem]);

  // Animation state management (uses refs for performance)
  const {
    groupLayouts,
    personSessionData,
    transitions,
    playbackRef,
    sceneScale,
    play,
    pause,
    setSpeed,
    goToSession,
    reset,
    playbackState,
  } = useAnimationState(problem, schedule);

  const sceneKey = useMemo(() => JSON.stringify(schedule.sessions), [schedule.sessions]);

  // UI state for playback (throttled updates from animation loop)
  const [uiPlayback, setUIPlayback] = useState<PlaybackState>(playbackState);
  
  // Toggle for people labels
  const [showPeopleLabels, setShowPeopleLabels] = useState(true);

  // Callback for animation loop to update UI
  const handleUIUpdate = useCallback((state: PlaybackState) => {
    setUIPlayback(state);
  }, []);

  // Audio management
  const audio = useAudio();

  // Sound callbacks
  const handleDinoSound = useCallback(
    (sound: "roar" | "chomp" | "dig") => {
      switch (sound) {
        case "roar":
          audio.playDinoRoar();
          break;
        case "chomp":
          audio.playDinoChomp();
          break;
        case "dig":
          audio.playDinoDigging();
          break;
      }
    },
    [audio]
  );

  const handleStorkSound = useCallback(
    (sound: "flap") => {
      if (sound === "flap") {
        audio.playStorkFlap();
      }
    },
    [audio]
  );

  const handleToggleMute = useCallback(() => {
    audio.setMuted(!audio.isMuted);
  }, [audio]);

  // Sync UI state when controls are used
  const handlePlay = useCallback(() => {
    play();
    setUIPlayback(playbackRef.current);
  }, [play, playbackRef]);

  const handlePause = useCallback(() => {
    pause();
    setUIPlayback(playbackRef.current);
  }, [pause, playbackRef]);

  const handleSetSpeed = useCallback(
    (speed: number) => {
      setSpeed(speed);
      setUIPlayback(playbackRef.current);
    },
    [setSpeed, playbackRef]
  );

  const handleGoToSession = useCallback(
    (session: number) => {
      goToSession(session);
      setUIPlayback(playbackRef.current);
    },
    [goToSession, playbackRef]
  );

  const handleReset = useCallback(() => {
    reset();
    setUIPlayback(playbackRef.current);
  }, [reset, playbackRef]);

  // Calculate camera position based on scene scale
  const cameraPosition: [number, number, number] = useMemo(() => {
    const distance = Math.max(30, sceneScale * 1.5);
    return [distance, distance * 0.8, distance];
  }, [sceneScale]);

  return (
    <div className="relative w-full h-[600px] rounded-lg overflow-hidden border border-[var(--border-primary)]">
      {/* Info overlay */}
      <div
        className="absolute top-4 left-4 z-10 px-3 py-2 rounded-lg"
        style={{
          background: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="text-white text-sm">
          <div className="font-semibold">3D Schedule Animation</div>
          <div className="text-white/70 text-xs mt-1">
            {problem.people.length} people • {problem.groups.length} groups •{" "}
            {schedule.sessionCount} sessions
          </div>
        </div>
      </div>

      {/* Legend and Controls */}
      <div
        className="absolute top-4 right-4 z-10 px-3 py-2 rounded-lg"
        style={{
          background: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="text-white text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span>🦖</span>
            <span className="text-white/70">Person removed</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🦩</span>
            <span className="text-white/70">Person added</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🚶</span>
            <span className="text-white/70">Person moves</span>
          </div>
          <div className="border-t border-white/20 my-2" />
          <button
            onClick={() => setShowPeopleLabels(!showPeopleLabels)}
            className="flex items-center gap-2 w-full hover:bg-white/10 rounded px-1 py-0.5 transition-colors"
            title={showPeopleLabels ? "Hide people names" : "Show people names"}
          >
            {showPeopleLabels ? (
              <Tag size={14} className="text-green-400" />
            ) : (
              <EyeOff size={14} className="text-gray-400" />
            )}
            <span className={showPeopleLabels ? "text-white" : "text-white/50"}>
              People labels
            </span>
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div
        className="absolute top-1/2 left-4 -translate-y-1/2 z-10 px-2 py-1 rounded text-xs"
        style={{
          background: "rgba(0, 0, 0, 0.5)",
          color: "rgba(255, 255, 255, 0.6)",
        }}
      >
        <div>Drag to rotate</div>
        <div>Scroll to zoom</div>
        <div>Right-drag to pan</div>
      </div>

      {/* 3D Canvas */}
      <Canvas
        camera={{
          position: cameraPosition,
          fov: 50,
          near: 0.1,
          far: sceneScale * 10,
        }}
        shadows
        gl={{
          antialias: true,
          powerPreference: "high-performance",
        }}
        frameloop="always"
      >
        <Suspense fallback={null}>
          <Scene
            key={sceneKey}
            groupLayouts={groupLayouts}
            personSessionData={personSessionData}
            transitions={transitions}
            schedule={schedule}
            playbackRef={playbackRef}
            playbackState={uiPlayback}
            sceneScale={sceneScale}
            showPeopleLabels={showPeopleLabels}
            onPlayDinoSound={handleDinoSound}
            onPlayStorkSound={handleStorkSound}
            onUIUpdate={handleUIUpdate}
          />
        </Suspense>
      </Canvas>

      {/* Loading overlay */}
      <Suspense fallback={<LoadingFallback />}>
        <div />
      </Suspense>

      {/* Playback controls - use UI state for display */}
      <PlaybackControls
        playback={uiPlayback}
        sessionCount={schedule.sessionCount}
        onPlay={handlePlay}
        onPause={handlePause}
        onReset={handleReset}
        onGoToSession={handleGoToSession}
        onSetSpeed={handleSetSpeed}
        isMuted={audio.isMuted}
        onToggleMute={handleToggleMute}
      />
    </div>
  );
}
