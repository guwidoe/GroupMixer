import { Suspense } from "react";
import { DinosaurModel } from "./DinosaurModel";
import { ProceduralDinosaur } from "./ProceduralDinosaur";
import type { DinosaurProps } from "./dinoTypes";

export type { DinoState } from "./dinoTypes";

export function Dinosaur(props: DinosaurProps) {
  return (
    <Suspense fallback={<ProceduralDinosaur {...props} />}>
      <DinosaurModel {...props} />
    </Suspense>
  );
}
