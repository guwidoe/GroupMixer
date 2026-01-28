import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { ContactEdgeStats } from "../buildContactGraph";
import type { CircleOrder, EdgeColorMode, LayoutMode } from "../types";
import { countToColor, hashToHex, hslToRgb, lerp, rgbToHex, sessionHue } from "./colorUtils";

interface BuildGraphArgs {
  people: Array<{ id: string; attributes: Record<string, string> }>;
  edges: ContactEdgeStats[];
  sessionCount: number;
  sessionFilter: number | null;
  edgeColorMode: EdgeColorMode;
  nodeColorAttributeKey: string | null;
  layoutMode: LayoutMode;
  circleOrder: CircleOrder;
  circleOrderAttributeKey: string | null;
  minMeetingCount: number;
}

export function buildGraphData({
  people,
  edges,
  sessionCount,
  sessionFilter,
  edgeColorMode,
  nodeColorAttributeKey,
  layoutMode,
  circleOrder,
  circleOrderAttributeKey,
  minMeetingCount,
}: BuildGraphArgs) {
  const g = new Graph({ multi: false, type: "undirected" });

  const attrKey = nodeColorAttributeKey;
  for (const p of people) {
    const label = p.attributes.name || p.id;
    const color =
      attrKey && p.attributes[attrKey]
        ? hashToHex(`${attrKey}:${p.attributes[attrKey]}`, 55, 55)
        : hashToHex(p.id, 35, 55);

    g.addNode(p.id, {
      label,
      color,
      size: 4,
      x: Math.random(),
      y: Math.random(),
    });
  }

  const maxCountAll = edges.reduce((m, e) => Math.max(m, e.total), 0);
  const maxCountFiltered =
    sessionFilter === null
      ? maxCountAll
      : edges.reduce((m, e) => Math.max(m, e.perSession[sessionFilter] || 0), 0);

  const filteredEdges: Array<{ e: ContactEdgeStats; count: number }> = [];
  for (const e of edges) {
    const count = sessionFilter === null ? e.total : (e.perSession[sessionFilter] || 0);
    if (count < minMeetingCount) continue;
    if (count <= 0) continue;
    filteredEdges.push({ e, count });
  }

  for (const { e, count } of filteredEdges) {
    let color = "rgba(148,163,184,0.65)";
    if (edgeColorMode === "byCount") {
      color = countToColor(count, Math.max(1, maxCountFiltered));
    } else {
      let bestS = 0;
      let bestC = -1;
      for (let s = 0; s < sessionCount; s++) {
        const c = e.perSession[s] || 0;
        if (c > bestC) {
          bestC = c;
          bestS = s;
        }
      }
      const hue = sessionHue(bestS, sessionCount);
      const t = Math.min(1, count / Math.max(1, maxCountFiltered));
      color = rgbToHex(hslToRgb(hue, 65, lerp(72, 50, t)));
    }

    const size = lerp(0.5, 4.5, Math.min(1, count / Math.max(1, maxCountFiltered)));

    g.addEdge(e.a, e.b, {
      color,
      size,
      total: e.total,
      perSession: e.perSession,
    });
  }

  if (layoutMode === "force") {
    forceAtlas2.assign(g, {
      iterations: 200,
      settings: {
        slowDown: 10,
        gravity: 1,
        scalingRatio: 10,
      },
    });
  } else {
    const nodes = g.nodes();
    const withDegree = nodes.map((id) => ({ id, degree: g.degree(id) }));
    const circleAttrKey = circleOrderAttributeKey;
    const attrById = new Map<string, string>();
    if (circleOrder === "attribute" && circleAttrKey) {
      for (const p of people) {
        attrById.set(p.id, (p.attributes[circleAttrKey] || "").toString());
      }
    }

    withDegree.sort((x, y) => {
      if (circleOrder === "degree") {
        if (y.degree !== x.degree) return y.degree - x.degree;
        return x.id.localeCompare(y.id);
      }
      if (circleOrder === "attribute" && circleAttrKey) {
        const ax = (g.getNodeAttribute(x.id, "label") as string) || x.id;
        const ay = (g.getNodeAttribute(y.id, "label") as string) || y.id;
        return ax.localeCompare(ay) || x.id.localeCompare(y.id);
      }
      return x.id.localeCompare(y.id);
    });

    if (circleOrder === "attribute" && circleAttrKey) {
      withDegree.sort((x, y) => {
        const vx = attrById.get(x.id) || "";
        const vy = attrById.get(y.id) || "";
        if (vx !== vy) return vx.localeCompare(vy);
        return x.id.localeCompare(y.id);
      });
    }

    const n = withDegree.length || 1;
    const radius = 10;
    for (let i = 0; i < withDegree.length; i++) {
      const angle = (2 * Math.PI * i) / n;
      g.setNodeAttribute(withDegree[i].id, "x", Math.cos(angle) * radius);
      g.setNodeAttribute(withDegree[i].id, "y", Math.sin(angle) * radius);
    }
  }

  const degrees = g.nodes().map((n) => g.degree(n));
  const maxDeg = degrees.reduce((m, d) => Math.max(m, d), 0);
  for (const n of g.nodes()) {
    const d = g.degree(n);
    g.setNodeAttribute(n, "size", lerp(3, 10, maxDeg > 0 ? d / maxDeg : 0));
  }

  return g;
}
