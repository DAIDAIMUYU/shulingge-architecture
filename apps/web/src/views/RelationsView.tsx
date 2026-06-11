import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Edit3, Minus, Network, Plus, RefreshCw, Search, Trash2, Users, X, ZoomIn } from "lucide-react";

import {
  api,
  ApiError,
  type Character,
  type KnowledgeGraph,
  type ProjectSummary,
  type Relation,
  type RelationInput,
} from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { CenterState, ViewShell } from "./common.js";
import { ProjectSelector } from "./ProjectSelector.js";
import { filterRelations, layoutKnowledgeGraph, type GraphNodeLayout } from "./relations-graph.js";

const DEFAULT_PROJECT_ID = "demo-series";
const DEFAULT_NOVEL_ID = "main";
const GRAPH_WIDTH = 960;
const GRAPH_HEIGHT = 520;

type EditorMode = "create" | "edit";
type DragState =
  | { type: "pan"; startX: number; startY: number; originX: number; originY: number }
  | { type: "node"; nodeId: string; startX: number; startY: number; originX: number; originY: number; moved: boolean };

const NODE_LABELS: Record<string, string> = {
  character: "角色",
  worldbook: "世界大纲",
  timeline: "时间线",
  knowledge: "知识",
  reference: "引用",
};

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

function writeStoredProjectId(projectId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("shulingge.web.projectId", projectId);
}

function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function toLines(values: string[] | undefined): string {
  return (values ?? []).join("\n");
}

function slugify(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `relation-${Date.now().toString(36)}`;
}

function relationName(relation: Relation): string {
  return `${relation.from ?? relation.source ?? "?"} - ${relation.to ?? relation.target ?? "?"}`;
}

function nodeLabel(type?: string): string {
  return NODE_LABELS[type ?? ""] ?? String(type ?? "节点");
}

function createDraft(relation?: Relation): RelationInput {
  return {
    id: relation?.id ?? "",
    from: relation?.from ?? relation?.source ?? "",
    to: relation?.to ?? relation?.target ?? "",
    type: relation?.type ?? relation?.label ?? "",
    stage: relation?.stage ?? "",
    sourceChapters: relation?.sourceChapters ?? [],
  };
}

function formatCharacterName(characters: Character[], id: string | undefined): string {
  if (!id) {
    return "未选择";
  }
  const character = characters.find((item) => item.id === id);
  return character?.name ? `${character.name} (${id})` : id;
}

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * GRAPH_WIDTH,
    y: ((clientY - rect.top) / rect.height) * GRAPH_HEIGHT,
  };
}

function clientDeltaToSvg(svg: SVGSVGElement, dx: number, dy: number) {
  const rect = svg.getBoundingClientRect();
  return {
    x: dx * (GRAPH_WIDTH / rect.width),
    y: dy * (GRAPH_HEIGHT / rect.height),
  };
}

export function RelationsView() {
  const [projectId, setProjectId] = useState(readStoredProjectId);
  const [novelId] = useState(readStoredNovelId);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaultMissing, setVaultMissing] = useState(false);
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [nodeOverrides, setNodeOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [draft, setDraft] = useState<RelationInput>(() => createDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Relation | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setVaultMissing(false);

    try {
      const health = await api.health();
      if (!health.vaultSelected) {
        setVaultMissing(true);
        setProjects([]);
        setCharacters([]);
        setRelations([]);
        setGraph({ nodes: [], edges: [] });
        setLoading(false);
        return;
      }

      const nextProjects = await api.listProjects();
      const effectiveProjectId = nextProjects.some((project) => project.projectId === projectId)
        ? projectId
        : nextProjects[0]?.projectId ?? projectId;

      if (effectiveProjectId !== projectId) {
        setProjectId(effectiveProjectId);
        writeStoredProjectId(effectiveProjectId);
      }

      const [nextCharacters, nextRelations, nextGraph] = await Promise.all([
        effectiveProjectId ? api.listCharactersByProject(effectiveProjectId) : Promise.resolve([]),
        effectiveProjectId ? api.listRelationsByProject(effectiveProjectId) : Promise.resolve([]),
        effectiveProjectId ? api.knowledgeGraph(effectiveProjectId, novelId) : Promise.resolve({ nodes: [], edges: [] }),
      ]);

      setProjects(nextProjects);
      setCharacters(nextCharacters);
      setRelations(nextRelations);
      setGraph(nextGraph);
      setSelectedRelationId((current) => current && nextRelations.some((relation) => relation.id === current) ? current : null);
      setNodeOverrides({});
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : "加载失败");
      setLoading(false);
    }
  }, [novelId, projectId]);

  useEffect(() => {
    writeStoredProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredRelations = useMemo(() => filterRelations(relations, search), [relations, search]);
  const baseLayout = useMemo(() => layoutKnowledgeGraph(graph, GRAPH_WIDTH, GRAPH_HEIGHT), [graph]);
  const layout = useMemo(() => ({
    nodes: baseLayout.nodes.map((node) => ({ ...node, ...(nodeOverrides[node.id] ?? {}) })),
    edges: baseLayout.edges,
  }), [baseLayout, nodeOverrides]);

  const nodeById = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout.nodes]);
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const selectedRelation = useMemo(
    () => filteredRelations.find((relation) => relation.id === selectedRelationId)
      ?? relations.find((relation) => relation.id === selectedRelationId)
      ?? null,
    [filteredRelations, relations, selectedRelationId],
  );

  const connectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedNodeId) {
      return ids;
    }
    ids.add(selectedNodeId);
    for (const edge of layout.edges) {
      if (edge.from === selectedNodeId) {
        ids.add(edge.to);
      }
      if (edge.to === selectedNodeId) {
        ids.add(edge.from);
      }
    }
    return ids;
  }, [layout.edges, selectedNodeId]);

  const degrees = useMemo(() => {
    const next = new Map<string, number>();
    for (const edge of layout.edges) {
      next.set(edge.from, (next.get(edge.from) ?? 0) + 1);
      next.set(edge.to, (next.get(edge.to) ?? 0) + 1);
    }
    return next;
  }, [layout.edges]);

  const relationEdgeIds = useMemo(() => new Set(filteredRelations.flatMap((relation) => {
    if (!relation.from || !relation.to) {
      return [];
    }
    return [`character:${relation.from}|character:${relation.to}`, `character:${relation.to}|character:${relation.from}`];
  })), [filteredRelations]);

  const selectedRelationEdgeIds = useMemo(() => {
    if (!selectedRelation?.from || !selectedRelation.to) {
      return new Set<string>();
    }
    return new Set([
      `character:${selectedRelation.from}|character:${selectedRelation.to}`,
      `character:${selectedRelation.to}|character:${selectedRelation.from}`,
    ]);
  }, [selectedRelation]);

  const showState = loading || error !== null || vaultMissing;

  function resetView() {
    setTransform({ x: 0, y: 0, scale: 1 });
  }

  function zoomBy(factor: number) {
    setTransform((current) => {
      const nextScale = Math.min(2.6, Math.max(0.45, current.scale * factor));
      const centerX = GRAPH_WIDTH / 2;
      const centerY = GRAPH_HEIGHT / 2;
      return {
        scale: nextScale,
        x: centerX - ((centerX - current.x) / current.scale) * nextScale,
        y: centerY - ((centerY - current.y) / current.scale) * nextScale,
      };
    });
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const point = svgPoint(svg, event.clientX, event.clientY);
    setTransform((current) => {
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      const nextScale = Math.min(2.6, Math.max(0.45, current.scale * factor));
      const graphX = (point.x - current.x) / current.scale;
      const graphY = (point.y - current.y) / current.scale;
      return {
        scale: nextScale,
        x: point.x - graphX * nextScale,
        y: point.y - graphY * nextScale,
      };
    });
  }

  function handleCanvasPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) {
      return;
    }
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    svg.setPointerCapture(event.pointerId);
    setDragState({
      type: "pan",
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    });
  }

  function handleNodePointerDown(event: PointerEvent<SVGGElement>, node: GraphNodeLayout) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    svg.setPointerCapture(event.pointerId);
    setDragState({
      type: "node",
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
      moved: false,
    });
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || !dragState) {
      return;
    }
    const delta = clientDeltaToSvg(svg, event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (dragState.type === "pan") {
      setTransform((current) => ({
        ...current,
        x: dragState.originX + delta.x,
        y: dragState.originY + delta.y,
      }));
      return;
    }
    const moved = Math.abs(event.clientX - dragState.startX) + Math.abs(event.clientY - dragState.startY) > 3;
    const nextX = dragState.originX + delta.x / transform.scale;
    const nextY = dragState.originY + delta.y / transform.scale;
    setDragState({ ...dragState, moved: dragState.moved || moved });
    setNodeOverrides((current) => ({
      ...current,
      [dragState.nodeId]: {
        x: Math.min(GRAPH_WIDTH - 30, Math.max(30, nextX)),
        y: Math.min(GRAPH_HEIGHT - 30, Math.max(30, nextY)),
      },
    }));
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (svg?.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
    if (dragState?.type === "node" && !dragState.moved) {
      setSelectedNodeId((current) => current === dragState.nodeId ? null : dragState.nodeId);
    }
    setDragState(null);
  }

  function openCreate() {
    setEditorMode("create");
    setDraft(createDraft());
    setSaveError(null);
  }

  function openEdit(relation: Relation) {
    setEditorMode("edit");
    setDraft(createDraft(relation));
    setSelectedRelationId(relation.id);
    setSaveError(null);
  }

  async function saveRelation() {
    const from = draft.from.trim();
    const to = draft.to.trim();
    const type = draft.type.trim();
    if (!from || !to || !type) {
      setSaveError("请完整选择双方角色，并填写关系类型。");
      return;
    }
    if (from === to) {
      setSaveError("关系双方不能是同一个角色。");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const payload: RelationInput = {
        ...draft,
        id: (draft.id || slugify(`${from}-${to}-${type}`)).trim(),
        from,
        to,
        type,
        stage: draft.stage?.trim() || undefined,
        sourceChapters: draft.sourceChapters ?? [],
      };
      if (editorMode === "edit") {
        await api.updateRelation(projectId, payload.id, payload);
      } else {
        await api.createRelation(projectId, payload);
      }
      setEditorMode(null);
      setDraft(createDraft());
      await reload();
    } catch (saveRelationError) {
      setSaveError(saveRelationError instanceof ApiError ? saveRelationError.message : "保存关系失败");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }
    try {
      await api.deleteRelation(projectId, deleteTarget.id);
      if (selectedRelationId === deleteTarget.id) {
        setSelectedRelationId(null);
      }
      setDeleteTarget(null);
      await reload();
    } catch (deleteError) {
      setError(deleteError instanceof ApiError ? deleteError.message : "删除关系失败");
      setDeleteTarget(null);
    }
  }

  return (
    <ViewShell
      title="关系"
      subtitle="角色、世界大纲和时间线的交互式知识图谱"
      actions={(
        <>
          <ProjectSelector
            projects={projects}
            projectId={projectId}
            disabled={loading || vaultMissing}
            onChange={(nextProjectId) => {
              setProjectId(nextProjectId);
              setSelectedNodeId(null);
              setSelectedRelationId(null);
              setNodeOverrides({});
            }}
          />
          <button type="button" className="btn btn-primary" onClick={openCreate} disabled={vaultMissing || projects.length === 0}>
            <Plus size={15} />
            新建关系
          </button>
        </>
      )}
    >
      <div className="toolbar-row">
        <div className="search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索关系、角色或节点" />
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={15} />
          刷新图谱
        </button>
        <span className="grow" />
        <span className="faint">关系 {filteredRelations.length} / {relations.length} 条 · 节点 {layout.nodes.length} 个</span>
      </div>

      {showState ? (
        <CenterState loading={loading} error={error} vaultMissing={vaultMissing} />
      ) : (
        <>
          <div className="relations-grid">
            <section className="info-card graph-panel">
              <div className="graph-panel-head">
                <div>
                  <h3>知识图谱</h3>
                  <p className="view-sub">滚轮缩放，拖动画布平移，拖动节点调整位置；点击节点查看直接关联。</p>
                </div>
                <div className="graph-controls" aria-label="图谱控制">
                  <button type="button" className="btn-icon" onClick={() => zoomBy(1.16)} title="放大">
                    <ZoomIn size={16} />
                  </button>
                  <button type="button" className="btn-icon" onClick={() => zoomBy(0.86)} title="缩小">
                    <Minus size={16} />
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={resetView}>重置</button>
                </div>
              </div>

              <div className="graph-legend">
                {["character", "worldbook", "timeline", "knowledge"].map((type) => (
                  <span key={type}><i className={`graph-legend-dot type-${type}`} />{nodeLabel(type)}</span>
                ))}
              </div>

              <div className="graph-stage interactive">
                {layout.nodes.length === 0 ? (
                  <div className="graph-canvas">
                    <Network size={42} strokeWidth={1.25} />
                    <div>当前项目还没有可展示的图谱节点</div>
                  </div>
                ) : (
                  <svg
                    ref={svgRef}
                    className="graph-svg"
                    viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                    role="img"
                    aria-label="知识关系图谱"
                    onWheel={handleWheel}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <rect width={GRAPH_WIDTH} height={GRAPH_HEIGHT} fill="transparent" />
                    <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
                      {layout.edges.map((edge) => {
                        const from = nodeById.get(edge.from);
                        const to = nodeById.get(edge.to);
                        if (!from || !to) {
                          return null;
                        }
                        const edgePair = `${edge.from}|${edge.to}`;
                        const dimmedBySearch = search.trim() && relationEdgeIds.size > 0 && !relationEdgeIds.has(edgePair);
                        const active = selectedRelationEdgeIds.has(edgePair)
                          || (selectedNodeId !== null && (edge.from === selectedNodeId || edge.to === selectedNodeId));
                        const muted = selectedNodeId !== null && !active;
                        return (
                          <g key={edge.id} className={active ? "active" : ""}>
                            <line
                              x1={from.x}
                              y1={from.y}
                              x2={to.x}
                              y2={to.y}
                              className={`graph-edge${active ? " active" : ""}${dimmedBySearch || muted ? " dimmed" : ""}`}
                            />
                            <text
                              x={(from.x + to.x) / 2}
                              y={(from.y + to.y) / 2 - 7}
                              className={`graph-edge-label${dimmedBySearch || muted ? " dimmed" : ""}`}
                            >
                              {edge.type}
                            </text>
                          </g>
                        );
                      })}

                      {layout.nodes.map((node) => {
                        const selected = selectedNodeId === node.id;
                        const connected = selectedNodeId === null || connectedNodeIds.has(node.id);
                        const muted = !connected;
                        const hovered = hoverNodeId === node.id;
                        return (
                          <g
                            key={node.id}
                            className={`graph-node${selected ? " active" : ""}${muted ? " muted" : ""}${hovered ? " hovered" : ""}${dragState?.type === "node" && dragState.nodeId === node.id ? " dragging" : ""}`}
                            transform={`translate(${node.x}, ${node.y})`}
                            onPointerDown={(event) => handleNodePointerDown(event, node)}
                            onPointerEnter={() => setHoverNodeId(node.id)}
                            onPointerLeave={() => setHoverNodeId(null)}
                          >
                            <title>{node.label}</title>
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
                    </g>
                  </svg>
                )}
              </div>
            </section>

            <aside className="info-card graph-side-panel">
              <h3>节点信息</h3>
              {selectedNode ? (
                <div className="stack-list">
                  <div className="field">
                    <span className="k">名称</span>
                    <span className="v stack-align-start">{selectedNode.label}</span>
                  </div>
                  <div className="field">
                    <span className="k">类型</span>
                    <span className="v">{nodeLabel(selectedNode.type)}</span>
                  </div>
                  <div className="field">
                    <span className="k">连接数</span>
                    <span className="v">{degrees.get(selectedNode.id) ?? 0}</span>
                  </div>
                  <div className="field">
                    <span className="k">ID</span>
                    <span className="v stack-align-start">{selectedNode.id}</span>
                  </div>
                </div>
              ) : (
                <div className="graph-side-empty">
                  <Network size={28} />
                  <span>点击任意节点查看详情和直接关联。</span>
                </div>
              )}
            </aside>
          </div>

          <section className="list-card relation-list-card">
            <div className="list-row head">
              <span className="col col-grow">人物关系</span>
              <span className="col" style={{ width: 160 }}>关系类型</span>
              <span className="col" style={{ width: 140 }}>阶段</span>
              <span className="col relation-row-actions">操作</span>
            </div>
            {filteredRelations.length === 0 ? (
              <div className="relation-empty">没有找到匹配的关系。可以新建一条人物关系来连接图谱中的角色。</div>
            ) : filteredRelations.map((relation) => (
              <div
                className={`list-row ${selectedRelationId === relation.id ? "active" : ""}`}
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
                  <div className="col-sub">
                    {formatCharacterName(characters, relation.from)} → {formatCharacterName(characters, relation.to)}
                  </div>
                </span>
                <span className="col" style={{ width: 160 }}>
                  <span className="tag">{relation.type ?? "关联"}</span>
                </span>
                <span className="col faint" style={{ width: 140 }}>{relation.stage || "-"}</span>
                <span className="col relation-row-actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" className="btn-icon" onClick={() => openEdit(relation)} title="编辑关系">
                    <Edit3 size={15} />
                  </button>
                  <button type="button" className="btn-icon danger" onClick={() => setDeleteTarget(relation)} title="删除关系">
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            ))}
          </section>
        </>
      )}

      {editorMode ? (
        <div className="vault-modal-backdrop character-modal-backdrop" onMouseDown={() => setEditorMode(null)}>
          <div className="vault-modal character-modal relation-editor-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="character-modal-head">
              <div>
                <h2>{editorMode === "create" ? "新建关系" : "编辑关系"}</h2>
                <p>选择项目内的两个角色，记录关系类型、阶段和来源章节。</p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setEditorMode(null)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            <div className="character-modal-body">
              <div className="form-grid form-grid-2">
                <label className="form-block">
                  <span>关系起点</span>
                  <select
                    className="input"
                    value={draft.from}
                    onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
                  >
                    <option value="">请选择角色</option>
                    {characters.map((character) => (
                      <option key={character.id} value={character.id}>{character.name || character.id}</option>
                    ))}
                  </select>
                </label>
                <label className="form-block">
                  <span>关系终点</span>
                  <select
                    className="input"
                    value={draft.to}
                    onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                  >
                    <option value="">请选择角色</option>
                    {characters.map((character) => (
                      <option key={character.id} value={character.id}>{character.name || character.id}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid form-grid-2">
                <label className="form-block">
                  <span>关系类型</span>
                  <input
                    className="input"
                    value={draft.type}
                    placeholder="如：师徒 / 恋人 / 敌对"
                    onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}
                  />
                </label>
                <label className="form-block">
                  <span>阶段</span>
                  <input
                    className="input"
                    value={draft.stage ?? ""}
                    placeholder="如：初遇 / 决裂 / 和解"
                    onChange={(event) => setDraft((current) => ({ ...current, stage: event.target.value }))}
                  />
                </label>
              </div>
              <label className="form-block">
                <span>来源章节</span>
                <textarea
                  className="textarea relation-source"
                  value={toLines(draft.sourceChapters)}
                  placeholder="每行一个章节 ID 或标题"
                  onChange={(event) => setDraft((current) => ({ ...current, sourceChapters: parseLines(event.target.value) }))}
                />
              </label>
              {characters.length === 0 ? (
                <div className="err-card">当前项目还没有角色，请先在角色页创建角色后再新增人物关系。</div>
              ) : null}
              {saveError ? <div className="err-card">{saveError}</div> : null}
            </div>

            <div className="agent-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditorMode(null)}>取消</button>
              <button type="button" className="btn btn-primary" onClick={() => void saveRelation()} disabled={saving || characters.length < 2}>
                {saving ? "保存中..." : "保存关系"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="删除关系"
          message={`确定删除关系「${relationName(deleteTarget)}」吗？`}
          confirmText="删除"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </ViewShell>
  );
}
