export type EdgeColorMode = "byCount" | "byDominantSession";
export type LayoutMode = "force" | "circle";
export type CircleOrder = "degree" | "id" | "attribute";

export interface EdgeInfo {
  edgeId: string;
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  total: number;
  perSession: number[];
}

export type HoveredItem =
  | null
  | { type: "node"; id: string; label: string }
  | {
      type: "edge";
      edgeId: string;
      a: string;
      b: string;
      aLabel: string;
      bLabel: string;
      total: number;
      perSession: number[];
    };
