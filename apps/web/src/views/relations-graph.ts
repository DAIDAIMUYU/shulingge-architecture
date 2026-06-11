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
const TYPE_RADIUS: Record<string, number> = {
  character: 21,
  worldbook: 18,
  timeline: 18,
  knowledge: 16,
  reference: 15,
};

function normalizeNodeId(value: unknown): string {
  return String(value ?? "").trim();
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function initialPosition(id: string, index: number, total: number, width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(width, height) * (0.18 + Math.min(total, 36) / 140);
  const hash = hashString(id);
  const angle = ((Math.PI * 2) / Math.max(total, 1)) * index + (hash % 360) * Math.PI / 180;
  const jitter = ((hash % 97) / 97 - 0.5) * 34;
  return {
    x: centerX + Math.cos(angle) * (baseRadius + jitter),
    y: centerY + Math.sin(angle) * (baseRadius + jitter),
  };
}

export function layoutKnowledgeGraph(
  graph: KnowledgeGraph,
  viewportWidth: number,
  viewportHeight: number,
): GraphLayoutResult {
  const width = Math.max(viewportWidth, 320);
  const height = Math.max(viewportHeight, 280);
  const centerX = width / 2;
  const centerY = height / 2;
  const margin = 46;

  const rawNodes = [...(graph.nodes ?? [])].sort((left, right) => {
    const leftType = String(left.type ?? "reference");
    const rightType = String(right.type ?? "reference");
    return (TYPE_ORDER.indexOf(leftType) - TYPE_ORDER.indexOf(rightType))
      || String(left.id).localeCompare(String(right.id));
  });

  const nodeIds = new Set(rawNodes.map((node) => normalizeNodeId(node.id)).filter(Boolean));
  const rawEdges = [...(graph.edges ?? [])]
    .map((edge, index) => ({
      id: String(edge.id ?? `edge-${index}`),
      from: normalizeNodeId(edge.from ?? edge.source),
      to: normalizeNodeId(edge.to ?? edge.target),
      type: String(edge.type ?? edge.label ?? "related"),
    }))
    .filter((edge) => edge.from && edge.to && nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to);

  const nodes = rawNodes.map((node, index): GraphNodeLayout & { vx: number; vy: number } => {
    const id = normalizeNodeId(node.id);
    const type = String(node.type ?? "reference");
    const initial = initialPosition(id, index, rawNodes.length, width, height);
    return {
      id,
      label: String(node.label ?? node.id),
      type,
      x: initial.x,
      y: initial.y,
      vx: 0,
      vy: 0,
      radius: TYPE_RADIUS[type] ?? 15,
    };
  }).filter((node) => node.id);

  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const links = rawEdges
    .map((edge) => ({ ...edge, fromIndex: indexById.get(edge.from), toIndex: indexById.get(edge.to) }))
    .filter((edge): edge is GraphEdgeLayout & { fromIndex: number; toIndex: number } =>
      edge.fromIndex !== undefined && edge.toIndex !== undefined,
    );

  const iterations = nodes.length > 90 ? 120 : 190;
  const repulsion = nodes.length > 60 ? 5200 : 7600;
  const springLength = nodes.length > 40 ? 90 : 112;
  const springStrength = 0.012;
  const centerStrength = 0.006;

  for (let tick = 0; tick < iterations; tick += 1) {
    const alpha = 1 - tick / iterations;

    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      const left = nodes[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const right = nodes[rightIndex];
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        let distanceSq = dx * dx + dy * dy;
        if (distanceSq < 0.01) {
          const offset = (hashString(`${left.id}:${right.id}`) % 360) * Math.PI / 180;
          dx = Math.cos(offset) * 0.1;
          dy = Math.sin(offset) * 0.1;
          distanceSq = 0.01;
        }
        const distance = Math.sqrt(distanceSq);
        const minDistance = left.radius + right.radius + 18;
        const force = (repulsion / Math.max(distanceSq, minDistance * minDistance)) * alpha;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        left.vx -= fx;
        left.vy -= fy;
        right.vx += fx;
        right.vy += fy;
      }
    }

    for (const link of links) {
      const from = nodes[link.fromIndex];
      const to = nodes[link.toIndex];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const force = (distance - springLength) * springStrength * alpha;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      from.vx += fx;
      from.vy += fy;
      to.vx -= fx;
      to.vy -= fy;
    }

    for (const node of nodes) {
      node.vx += (centerX - node.x) * centerStrength * alpha;
      node.vy += (centerY - node.y) * centerStrength * alpha;
      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x = Math.min(width - margin, Math.max(margin, node.x + node.vx));
      node.y = Math.min(height - margin, Math.max(margin, node.y + node.vy));
    }
  }

  return {
    nodes: nodes.map(({ vx: _vx, vy: _vy, ...node }) => node),
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
      relation.stage,
      ...(relation.sourceChapters ?? []),
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return values.some((value) => value.includes(normalized));
  });
}
