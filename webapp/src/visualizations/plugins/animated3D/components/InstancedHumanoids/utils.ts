import * as THREE from 'three';

interface HumanoidMeshRefs {
  torsoRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  headRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  hairRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  leftUpperArmRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  rightUpperArmRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  leftLowerArmRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  rightLowerArmRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  leftUpperLegRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  rightUpperLegRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  leftLowerLegRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  rightLowerLegRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  leftFootRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  rightFootRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  leftHandRef: React.MutableRefObject<THREE.InstancedMesh | null>;
  rightHandRef: React.MutableRefObject<THREE.InstancedMesh | null>;
}

export function hideInstancedPerson(refs: HumanoidMeshRefs, index: number) {
  const hiddenMatrix = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
  hiddenMatrix.setPosition(0, -100, 0);

  refs.torsoRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.headRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.hairRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.leftUpperArmRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.rightUpperArmRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.leftLowerArmRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.rightLowerArmRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.leftHandRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.rightHandRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.leftUpperLegRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.rightUpperLegRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.leftLowerLegRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.rightLowerLegRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.leftFootRef.current?.setMatrixAt(index, hiddenMatrix);
  refs.rightFootRef.current?.setMatrixAt(index, hiddenMatrix);
}
