import { useRef, useCallback, useEffect, useState } from "react";
import type { AudioManager } from "../types";

// Generate simple audio tones using Web Audio API
// (Real project would use actual sound files)

// Generate a roar-like sound
function playRoar(audioContext: AudioContext) {
  // Low rumbling roar
  const osc1 = audioContext.createOscillator();
  const osc2 = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();

  osc1.type = "sawtooth";
  osc2.type = "square";

  osc1.frequency.setValueAtTime(80, audioContext.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(
    40,
    audioContext.currentTime + 0.8
  );

  osc2.frequency.setValueAtTime(100, audioContext.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(
    50,
    audioContext.currentTime + 0.8
  );

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(500, audioContext.currentTime);

  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.1);
  gainNode.gain.exponentialRampToValueAtTime(
    0.01,
    audioContext.currentTime + 0.8
  );

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audioContext.destination);

  osc1.start();
  osc2.start();
  osc1.stop(audioContext.currentTime + 0.8);
  osc2.stop(audioContext.currentTime + 0.8);
}

// Generate a chomping sound
function playChomp(audioContext: AudioContext) {
  // Quick bite sounds
  const playBite = (delay: number) => {
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(200, audioContext.currentTime + delay);
    osc.frequency.exponentialRampToValueAtTime(
      50,
      audioContext.currentTime + delay + 0.1
    );

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + delay);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + delay + 0.1
    );

    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);

    osc.start(audioContext.currentTime + delay);
    osc.stop(audioContext.currentTime + delay + 0.1);
  };

  // Multiple chomps
  playBite(0);
  playBite(0.15);
  playBite(0.3);
}

// Generate digging sound
function playDigging(audioContext: AudioContext) {
  // Scratching/digging sounds using noise
  const bufferSize = audioContext.sampleRate * 0.5;
  const buffer = audioContext.createBuffer(
    1,
    bufferSize,
    audioContext.sampleRate
  );
  const data = buffer.getChannelData(0);

  // Generate noise
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gainNode = audioContext.createGain();

  noise.buffer = buffer;

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(800, audioContext.currentTime);
  filter.Q.setValueAtTime(2, audioContext.currentTime);

  gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.01,
    audioContext.currentTime + 0.5
  );

  noise.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audioContext.destination);

  noise.start();
  noise.stop(audioContext.currentTime + 0.5);
}

// Generate wing flapping sound
function playFlap(audioContext: AudioContext) {
  // Whooshing flap sounds
  const playWhoosh = (delay: number) => {
    const bufferSize = audioContext.sampleRate * 0.2;
    const buffer = audioContext.createBuffer(
      1,
      bufferSize,
      audioContext.sampleRate
    );
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / audioContext.sampleRate;
      // Envelope shaped noise
      const envelope = Math.sin((Math.PI * t) / 0.2);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }

    const noise = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gainNode = audioContext.createGain();

    noise.buffer = buffer;

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2000, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime + delay);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioContext.destination);

    noise.start(audioContext.currentTime + delay);
  };

  // Multiple flaps
  playWhoosh(0);
  playWhoosh(0.25);
  playWhoosh(0.5);
}

// Generate footsteps
let footstepsInterval: number | null = null;

function startFootsteps(audioContext: AudioContext) {
  if (footstepsInterval) return;

  const playStep = () => {
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(
      100 + Math.random() * 50,
      audioContext.currentTime
    );
    osc.frequency.exponentialRampToValueAtTime(
      50,
      audioContext.currentTime + 0.05
    );

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.05
    );

    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);

    osc.start();
    osc.stop(audioContext.currentTime + 0.05);
  };

  footstepsInterval = window.setInterval(playStep, 200);
}

function stopFootsteps() {
  if (footstepsInterval) {
    clearInterval(footstepsInterval);
    footstepsInterval = null;
  }
}

export function useAudio(): AudioManager & { isMuted: boolean } {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isMuted, setIsMutedState] = useState(true); // Start muted

  // Initialize audio context on first user interaction
  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playDinoRoar = useCallback(() => {
    if (isMuted) return;
    const ctx = initAudio();
    playRoar(ctx);
  }, [isMuted, initAudio]);

  const playDinoChomp = useCallback(() => {
    if (isMuted) return;
    const ctx = initAudio();
    playChomp(ctx);
  }, [isMuted, initAudio]);

  const playDinoDigging = useCallback(() => {
    if (isMuted) return;
    const ctx = initAudio();
    playDigging(ctx);
  }, [isMuted, initAudio]);

  const playStorkFlap = useCallback(() => {
    if (isMuted) return;
    const ctx = initAudio();
    playFlap(ctx);
  }, [isMuted, initAudio]);

  const playFootsteps = useCallback(() => {
    if (isMuted) return;
    initAudio();
    startFootsteps(audioContextRef.current!);
  }, [isMuted, initAudio]);

  const stopFootstepsCallback = useCallback(() => {
    stopFootsteps();
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    setIsMutedState(muted);
    if (muted) {
      stopFootsteps();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopFootsteps();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    playDinoRoar,
    playDinoChomp,
    playDinoDigging,
    playStorkFlap,
    playFootsteps,
    stopFootsteps: stopFootstepsCallback,
    setMuted,
    isMuted,
  };
}
