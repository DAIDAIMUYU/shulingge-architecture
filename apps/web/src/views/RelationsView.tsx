import { useEffect, useMemo, useState } from "react";
import { Network, Search, Sparkles, Users } from "lucide-react";

import { api, ApiError, type KnowledgeGraph, type Relation } from "../api/client.js";
import { CenterState, ViewShell } from "./common.js";
import { filterRelations, layoutKnowledgeGraph } from "./relations-graph.js";

const DEFAULT_PROJECT_ID = "demo-series";
const DEFAULT_NOVEL_ID = "main";

function readStoredProjectId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_PROJECT_ID;
  }
  return window.localStorage.getItem("shulingge.web.projectId") ?? DEFAULT_PROJECT_ID;
}

function readStoredNovelId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_NOVEL_ID;
  }
  return window.localStorage.getItem("shulingge.web.novelId") ?? DEFAULT_NOVEL_ID;
}

function writeStoredKeys(projectId: string, novelId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("shulingge.web.projectId", projectId);
  window.localStorage.setItem("shulingge.web.novelId", novelId);
}

function relationName(relation: Relation): string {
  return `${relation.from ?? relation.source ?? "?"} — ${relation.to ?? relation.target ?? "?"}`;
}

function edgeKey(from: string, to: string): string {
  return [from, to].sort().join("|");
}

function edgeEndpointId(value: string): string {
  return value.startsWith("character:") ? value.slice("character:".length) : value;
}

export function RelationsView() {
  const [projectId, setProjectId] = useState(readStoredProjectId);
  const [novelId, setNovelId] = useState(readStoredNovelId);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaultMissing, setVaultMissing] = useState(false);
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    writeStoredKeys(projectId, novelId);
  }, [projectId, novelId]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      setVaultMissing(false);

      try {
        const health = await api.health();
        if (!health.vaultSelected) {
          if (!alive) return;
          setVaultMissing(true);
          setRelations([]);
          setGraph({ nodes: [], edges: [] });
          setLoading(false);
          return;
        }

        const [nextRelations, nextGraph] = await Promise.all([
          api.listRelationsByProject(projectId),
          api.knowledgeGraph(projectId, novelId),
        ]);

        if (!alive) return;
        setRelations(nextRelations);
        setGraph(nextGraph);
        setSelectedRelationId((current) => current && nextRelations.some((relation) => relation.id === current) ? current : nextRelations[0]?.id ?? null);
        setLoading(false);
      } catch (loadError) {
        if (!alive) return;
        setError(loadError instanceof ApiError ? loadError.message : "加载失败");
        setLoading(false);
      }
    }

    void load();

    return () => {
      alive = false;
    };
  }, [projectId, novelId]);

  const filteredRelations = useMemo(() => filterRelations(relations, search), [relations, search]);
  const showState = loading || error !== null || vaultMissing || filteredRelations.length === 0;
  const layout = useMemo(() => layoutKnowledgeGraph(graph, 960, 460), [graph]);
  const selectedRelation = useMemo(
    () => filteredRelations.find((relation) => relation.id === selectedRelationId) ?? relations.find((relation) => relation.id === selectedRelationId) ?? null,
    [filteredRelations, relations, selectedRelationId],
  );

  const relationEdgeKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const relation of filteredRelations) {
      if (relation.from && relation.to) {
        keys.add(edgeKey(`character:${relation.from}`, `character:${relation.to}`));
      }
    }
    return keys;
  }, [filteredRelations]);

  const selectedRelationEdgeKey = selectedRelation?.from && selectedRelation?.to
    ? edgeKey(`character:${selectedRelation.from}`, `character:${selectedRelation.to}`)
    : null;

  return (
    <ViewShell title="关系" subtitle="人物关系网络与情感线推进">
      <div className="toolbar-row">
        <div className="search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索关系、角色、标签…" />
        </div>
        <label className="project-inline-field">
          <span className="faint">Project</span>
          <input className="input" value={projectId} onChange={(event) => setProjectId(event.target.value)} />
        </label>
        <label className="project-inline-field">
          <span className="faint">Novel</span>
          <input className="input" value={novelId} onChange={(event) => setNovelId(event.target.value)} />
        </label>
        <span className="grow" />
        <span className="faint">共 {filteredRelations.length} / {relations.length} 条</span>
      </div>

      <div className="detail-grid" style={{ marginBottom: 20 }}>
        <section className="info-card graph-panel">
          <div className="graph-panel-head">
            <div>
              <h3>关系图谱</h3>
              <p className="view-sub">基于 `/api/v1/knowledge/graph` 的轻量 SVG 网络图，按节点类型分层布局。</p>
            </div>
          </div>

          {vaultMissing || loading ? (
            <div className="graph-canvas">
              <Network size={42} strokeWidth={1.25} />
              <div>关系图谱载入中…</div>
            </div>
          ) : (
            <div className="graph-stage">
              <svg className="graph-svg" viewBox="0 0 960 460" role="img" aria-label="人物关系图谱">
                {layout.edges.map((edge) => {
                  const from = layout.nodes.find((node) => node.id === edge.from);
                  const to = layout.nodes.find((node) => node.id === edge.to);
                  if (!from || !to) {
                    return null;
                  }

                  const currentEdgeKey = edgeKey(edge.from, edge.to);
                  const dimmed = relationEdgeKeys.size > 0 && !relationEdgeKeys.has(currentEdgeKey);
                  const active = selectedRelationEdgeKey === currentEdgeKey || (selectedNodeId !== null && (edge.from === selectedNodeId || edge.to === selectedNodeId));
                  return (
                    <g key={edge.id}>
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        className={`graph-edge${active ? " active" : ""}${dimmed ? " dimmed" : ""}`}
                      />
                      <text
                        x={(from.x + to.x) / 2}
                        y={(from.y + to.y) / 2 - 6}
                        className={`graph-edge-label${dimmed ? " dimmed" : ""}`}
                      >
                        {edge.type}
                      </text>
                    </g>
                  );
                })}

                {layout.nodes.map((node) => {
                  const active = selectedNodeId === node.id ||
                    selectedRelation?.from === edgeEndpointId(node.id) ||
                    selectedRelation?.to === edgeEndpointId(node.id);
                  const muted = relationEdgeKeys.size > 0 && !Array.from(relationEdgeKeys).some((key) => key.includes(node.id));
                  return (
                    <g
                      key={node.id}
                      className={`graph-node${active ? " active" : ""}${muted ? " muted" : ""}`}
                      transform={`translate(${node.x}, ${node.y})`}
                      onClick={() => setSelectedNodeId((current) => current === node.id ? null : node.id)}
                    >
                      <circle r={node.radius} className={`graph-node-dot type-${node.type}`} />
                      <text y="5" textAnchor="middle" className="graph-node-initial">
                        {node.label.slice(0, 1)}
                      </text>
                      <text y={node.radius + 18} textAnchor="middle" className="graph-node-label">
                        {node.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </section>

        <div>
          <section className="info-card">
            <h3>图谱信号</h3>
            <div className="signal-list">
              <div className="signal-item">
                <Users size={16} />
                <div>
                  <div className="mini-card-title">人物节点</div>
                  <div className="mini-card-sub">{layout.nodes.filter((node) => node.type === "character").length} 个</div>
                </div>
              </div>
              <div className="signal-item">
                <Network size={16} />
                <div>
                  <div className="mini-card-title">关系边</div>
                  <div className="mini-card-sub">{filteredRelations.length} 条当前可见关系</div>
                </div>
              </div>
              <div className="signal-item">
                <Sparkles size={16} />
                <div>
                  <div className="mini-card-title">知识节点</div>
                  <div className="mini-card-sub">{layout.nodes.filter((node) => node.type !== "character").length} 个</div>
                </div>
              </div>
            </div>
          </section>

          <section className="info-card">
            <h3>当前高亮</h3>
            <div className="stack-list">
              <div className="field">
                <span className="k">选中关系</span>
                <span className="v stack-align-start">{selectedRelation ? relationName(selectedRelation) : "未选择"}</span>
              </div>
              <div className="field">
                <span className="k">选中节点</span>
                <span className="v stack-align-start">{selectedNodeId ?? "未选择"}</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {showState ? (
        <CenterState
          loading={loading}
          error={error}
          vaultMissing={vaultMissing}
          empty={filteredRelations.length === 0}
          emptyText={search ? "没有匹配的人物关系" : "还没有人物关系"}
        />
      ) : (
        <div className="list-card">
          <div className="list-row head">
            <span className="col col-grow">关系</span>
            <span className="col" style={{ width: 140 }}>类型</span>
            <span className="col" style={{ width: 120 }}>阶段</span>
          </div>
          {filteredRelations.map((relation) => (
            <button
              type="button"
              className={`list-row ${selectedRelation?.id === relation.id ? "active" : ""}`}
              key={relation.id}
              onClick={() => {
                setSelectedRelationId(relation.id);
                if (relation.from) {
                  setSelectedNodeId(`character:${relation.from}`);
                }
              }}
            >
              <span className="col col-grow">
                <div className="col-name">{relationName(relation)}</div>
                {relation.label && <div className="col-sub">{relation.label}</div>}
              </span>
              <span className="col" style={{ width: 140 }}>
                <span className="tag">{relation.type ?? "关联"}</span>
              </span>
              <span className="col faint" style={{ width: 120 }}>
                {String((relation as { stage?: string }).stage ?? "—")}
              </span>
            </button>
          ))}
        </div>
      )}
    </ViewShell>
  );
}
