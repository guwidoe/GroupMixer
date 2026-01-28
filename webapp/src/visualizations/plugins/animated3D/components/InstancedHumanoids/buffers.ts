import { useEffect, useRef } from 'react';
import type { PersonSessionData } from '../../hooks/useAnimationState';

export function usePersonBuffers(personData: PersonSessionData[]) {
  const count = personData.length;
  const positionsRef = useRef<Float32Array>(new Float32Array(count * 3));
  const targetPositionsRef = useRef<Float32Array>(new Float32Array(count * 3));
  const statesRef = useRef<Uint8Array>(new Uint8Array(count));
  const lastSessionRef = useRef(-1);
  const prevSessionRef = useRef(-1);

  useEffect(() => {
    if (positionsRef.current.length !== count * 3) {
      positionsRef.current = new Float32Array(count * 3);
      targetPositionsRef.current = new Float32Array(count * 3);
      statesRef.current = new Uint8Array(count);
    }
  }, [count]);

  useEffect(() => {
    personData.forEach((person, i) => {
      const pos = person.sessionPositions[0];
      positionsRef.current[i * 3] = pos.x;
      positionsRef.current[i * 3 + 1] = person.presentInSession[0] ? 0 : -10;
      positionsRef.current[i * 3 + 2] = pos.z;
      targetPositionsRef.current[i * 3] = pos.x;
      targetPositionsRef.current[i * 3 + 1] = person.presentInSession[0] ? 0 : -10;
      targetPositionsRef.current[i * 3 + 2] = pos.z;
      statesRef.current[i] = person.presentInSession[0] ? 0 : 2;
    });
    lastSessionRef.current = -1;
    prevSessionRef.current = -1;
  }, [personData]);

  return {
    positionsRef,
    targetPositionsRef,
    statesRef,
    lastSessionRef,
    prevSessionRef,
  };
}
