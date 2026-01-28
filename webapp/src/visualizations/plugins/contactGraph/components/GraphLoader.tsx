import { useEffect } from "react";
import { useLoadGraph, useSigma } from "@react-sigma/core";
import Graph from "graphology";

export function GraphLoader({ graph }: { graph: Graph }) {
  const loadGraph = useLoadGraph();
  const sigma = useSigma();
  useEffect(() => {
    loadGraph(graph);
    try {
      sigma.getCamera().animatedReset();
    } catch {
      // ignore camera errors
    }
  }, [graph, loadGraph, sigma]);
  return null;
}
