import type { KnowledgeGraph, Relation } from "../api/client.js";

export interface GraphNodeLayout {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  radius: number;
}

export interface GraphEdgeLayout {
  id: string;
  from: string;
  to: string;
  type: string;
}

export interface GraphLayoutResult {
  nodes: GraphNodeLayout[];
  edges: GraphEdgeLayout[];
}

const TYPE_ORDER = ["character", "worldbook", "timeline", "knowledge", "reference"];
const TYPE_RADII: Record<string, number> = {
  character: 0.28,
  worldbook: 0.44,
  timeline: 0.58,
  knowledge: 0.72,
  reference: 0.84,
};

export function layoutKnowledgeGraph(
  graph: KnowledgeGraph,
  viewportWidth: number,
  viewportHeight: number,
): GraphLayoutResult {
  const width = Math.max(viewportWidth, 320);
  const height = Math.max(viewportHeight, 280);
  const centerX = width / 2;
  const centerY = height / 2;
  const orbit = Math.min(width, height) / 2 - 42;

  const rawNodes = [...(graph.nodes ?? [])].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const rawEdges = [...(graph.edges ?? [])]
    .map((edge, index) => ({
      id: String(edge.id ?? `edge-${index}`),
      from: String(edge.from ?? edge.source ?? ""),
      to: String(edge.to ?? edge.target ?? ""),
      type: String(edge.type ?? edge.label ?? "related"),
    }))
    .filter((edge) => edge.from && edge.to);

  const groups = new Map<string, typeof rawNodes>();
  for (const type of TYPE_ORDER) {
    groups.set(type, []);
  }
  for (const node of rawNodes) {
    const type = String(node.type ?? "reference");
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)?.push(node);
  }

  const placedNodes: GraphNodeLayout[] = [];
  for (const [type, nodes] of groups.entries()) {
    if (!nodes.length) {
      continue;
    }

    const radiusFactor = TYPE_RADII[type] ?? 0.9;
    const ringRadius = Math.max(32, orbit * radiusFactor);
    const angleStep = (Math.PI * 2) / nodes.length;
    const angleOffset = TYPE_ORDER.indexOf(type) >= 0 ? TYPE_ORDER.indexOf(type) * 0.31 : 0;

    nodes.forEach((node, index) => {
      const angle = angleOffset + index * angleStep;
      placedNodes.push({
        id: String(node.id),
        label: String(node.label ?? node.id),
        type,
        x: centerX + Math.cos(angle) * ringRadius,
        y: centerY + Math.sin(angle) * ringRadius,
        radius: type === "character" ? 24 : 18,
      });
    });
  }

  return {
    nodes: placedNodes,
    edges: rawEdges,
  };
}

export function filterRelations(relations: Relation[], query: string): Relation[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return relations;
  }

  return relations.filter((relation) => {
    const values = [
      relation.id,
      relation.from,
      relation.to,
      relation.source,
      relation.target,
      relation.type,
      relation.label,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return values.some((value) => value.includes(normalized));
  });
}
