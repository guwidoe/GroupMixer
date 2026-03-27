import type { ComponentProps } from "react";
import { GLTFHumanoids } from "./GLTFHumanoids";
import { ProceduralHumanoids } from "./ProceduralHumanoids";
import { useOptionalModelAsset } from "./modelAssets";

const CHARACTER_MODEL_ASSET_PATH = "models/character.glb";

type HumanoidsProps = Omit<ComponentProps<typeof GLTFHumanoids>, "modelUrl">;

export function Humanoids(props: HumanoidsProps) {
  const { assetUrl, available } = useOptionalModelAsset(CHARACTER_MODEL_ASSET_PATH);

  if (!available) {
    return <ProceduralHumanoids {...props} />;
  }

  return <GLTFHumanoids {...props} modelUrl={assetUrl} />;
}
