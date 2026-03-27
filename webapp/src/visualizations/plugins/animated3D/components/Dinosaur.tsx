import { DinosaurModel } from "./DinosaurModel";
import { ProceduralDinosaur } from "./ProceduralDinosaur";
import type { DinosaurProps } from "./dinoTypes";
import { useOptionalModelAsset } from "./modelAssets";

const DINOSAUR_MODEL_ASSET_PATH = "models/dinosaur.glb?v=2";

export type { DinoState } from "./dinoTypes";

export function Dinosaur(props: DinosaurProps) {
  const { assetUrl, available } = useOptionalModelAsset(DINOSAUR_MODEL_ASSET_PATH);

  if (!available) {
    return <ProceduralDinosaur {...props} />;
  }

  return <DinosaurModel {...props} modelUrl={assetUrl} />;
}
