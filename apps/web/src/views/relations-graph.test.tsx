import assert from "node:assert/strict";
import test from "node:test";

import type { KnowledgeGraph, Relation } from "../api/client.js";
import { filterRelations, layoutKnowledgeGraph } from "./relations-graph.js";

test("layoutKnowledgeGraph places nodes and edges deterministically by type ring", () => {
  const graph: KnowledgeGraph = {
    nodes: [
      { id: "character:kanae", type: "character", label: "Kanae" },
      { id: "worldbook:butterfly", type: "worldbook", label: "蝶屋" },
      { id: "timeline:arrival", type: "timeline", label: "Arrival" },
    ],
    edges: [
      { id: "relation-1", from: "character:kanae", to: "worldbook:butterfly", type: "related-worldbook" },
    ],
  };

  const layout = layoutKnowledgeGraph(graph, 520, 360);
  const kanae = layout.nodes.find((node) => node.id === "character:kanae");
  const butterfly = layout.nodes.find((node) => node.id === "worldbook:butterfly");

  assert.equal(layout.nodes.length, 3);
  assert.equal(layout.edges.length, 1);
  assert.ok(kanae);
  assert.ok(butterfly);
  assert.ok((kanae?.radius ?? 0) > (butterfly?.radius ?? 99));
});

test("filterRelations matches ids, endpoints, labels, and type", () => {
  const relations: Relation[] = [
    { id: "rel-1", from: "kanae", to: "shinobu", type: "sisters", label: "照护与依赖" },
    { id: "rel-2", from: "giyu", to: "tanjiro", type: "mentor", label: "观察" },
  ];

  assert.equal(filterRelations(relations, "kanae").length, 1);
  assert.equal(filterRelations(relations, "依赖").length, 1);
  assert.equal(filterRelations(relations, "mentor")[0]?.id, "rel-2");
});
