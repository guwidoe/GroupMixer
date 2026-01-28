import { Suspense } from "react";
import { StorkModel } from "./StorkModel";
import { ProceduralStork } from "./ProceduralStork";
import type { StorkProps } from "./storkTypes";

export type { StorkState } from "./storkTypes";

// Main component with Suspense fallback
export function Stork(props: StorkProps) {
  return (
    <Suspense fallback={<ProceduralStork {...props} />}>
      <StorkModel {...props} />
    </Suspense>
  );
}
