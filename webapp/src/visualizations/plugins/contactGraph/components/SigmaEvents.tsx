import { useEffect } from "react";
import { useRegisterEvents, useSigma } from "@react-sigma/core";

interface SigmaEventsProps {
  onHoverNode: (item: { type: "node"; id: string; label: string } | null) => void;
  onSelectNode: (nodeId: string | null) => void;
  onClear: () => void;
}

export function SigmaEvents({ onHoverNode, onSelectNode, onClear }: SigmaEventsProps) {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    registerEvents({
      enterNode: (e) => {
        const node = e.node;
        const graph = sigma.getGraph();
        const label = (graph.getNodeAttribute(node, "label") as string) || node;
        onHoverNode({ type: "node", id: node, label });
      },
      leaveNode: () => {
        onHoverNode(null);
      },
      clickNode: (e) => {
        const node = e.node;
        onSelectNode(node);
      },
      clickStage: () => {
        onClear();
      },
    });
  }, [registerEvents, sigma, onHoverNode, onSelectNode, onClear]);

  return null;
}
