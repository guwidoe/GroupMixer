import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import type { PersonSessionData } from '../../hooks/useAnimationState';

interface HumanoidColorRefs {
  headRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  hairRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  torsoRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  leftLowerArmRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  rightLowerArmRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  leftHandRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  rightHandRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  leftUpperArmRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  rightUpperArmRef: React.MutableRefObject<THREE.InstancedMesh | null>;
}

const SKIN_TONES = [
  '#ffe0bd',
  '#ffcd94',
  '#eac086',
  '#d4a574',
  '#c68642',
  '#a57939',
  '#8d5524',
  '#6b4423',
];

const HAIR_COLORS = [
  '#1a1a1a',
  '#3d2314',
  '#5a3825',
  '#8b4513',
  '#d4a574',
  '#f0e68c',
  '#cd853f',
  '#2f1e0e',
];

const SHIRT_COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#9b59b6',
  '#f39c12',
  '#1abc9c',
  '#e91e63',
  '#607d8b',
  '#ff5722',
  '#795548',
  '#009688',
  '#673ab7',
];

const tempColor = new THREE.Color();

export function useHumanoidColors(
  personData: PersonSessionData[],
  count: number,
  refs: HumanoidColorRefs,
) {
  const { skinColors, hairColors, shirtColors } = useMemo(() => {
    const skins = new Float32Array(count * 3);
    const hairs = new Float32Array(count * 3);
    const shirts = new Float32Array(count * 3);

    personData.forEach((person, i) => {
      let hash = 0;
      for (let j = 0; j < person.personId.length; j++) {
        hash = person.personId.charCodeAt(j) + ((hash << 5) - hash);
      }

      const skinIdx = Math.abs(hash) % SKIN_TONES.length;
      const hairIdx = Math.abs(hash >> 4) % HAIR_COLORS.length;
      const shirtIdx = Math.abs(hash >> 8) % SHIRT_COLORS.length;

      const skinColor = new THREE.Color(SKIN_TONES[skinIdx]);
      const hairColor = new THREE.Color(HAIR_COLORS[hairIdx]);
      const shirtColor = new THREE.Color(SHIRT_COLORS[shirtIdx]);

      skins[i * 3] = skinColor.r;
      skins[i * 3 + 1] = skinColor.g;
      skins[i * 3 + 2] = skinColor.b;

      hairs[i * 3] = hairColor.r;
      hairs[i * 3 + 1] = hairColor.g;
      hairs[i * 3 + 2] = hairColor.b;

      shirts[i * 3] = shirtColor.r;
      shirts[i * 3 + 1] = shirtColor.g;
      shirts[i * 3 + 2] = shirtColor.b;
    });

    return { skinColors: skins, hairColors: hairs, shirtColors: shirts };
  }, [personData, count]);

  useEffect(() => {
    const setColors = (mesh: THREE.InstancedMesh | null, colors: Float32Array) => {
      if (!mesh) return;
      for (let i = 0; i < count; i++) {
        tempColor.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
        mesh.setColorAt(i, tempColor);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    setColors(refs.headRef.current, skinColors);
    setColors(refs.leftLowerArmRef.current, skinColors);
    setColors(refs.rightLowerArmRef.current, skinColors);
    setColors(refs.leftHandRef.current, skinColors);
    setColors(refs.rightHandRef.current, skinColors);
    setColors(refs.hairRef.current, hairColors);
    setColors(refs.torsoRef.current, shirtColors);
    setColors(refs.leftUpperArmRef.current, shirtColors);
    setColors(refs.rightUpperArmRef.current, shirtColors);
  }, [skinColors, hairColors, shirtColors, count, refs]);
}
