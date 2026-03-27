import { StorkModel } from "./StorkModel";
import { ProceduralStork } from "./ProceduralStork";
import type { StorkProps } from "./storkTypes";
import { useOptionalModelAsset } from "./modelAssets";

const STORK_MODEL_ASSET_PATH = "models/flamingo.glb?v=2";

export type { StorkState } from "./storkTypes";

export function Stork(props: StorkProps) {
  const { assetUrl, available } = useOptionalModelAsset(STORK_MODEL_ASSET_PATH);

  if (!available) {
    return <ProceduralStork {...props} />;
  }

  return <StorkModel {...props} modelUrl={assetUrl} />;
}
