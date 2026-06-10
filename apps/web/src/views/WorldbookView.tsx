import { useEffect, useMemo, useState } from "react";
import { BookOpen, Globe, Plus, Save, Search, Sparkles } from "lucide-react";

import { api, ApiError, type WorldbookEntry, type WorldbookEntryInput } from "../api/client.js";
import { CenterState, ViewShell } from "./common.js";

type WorldbookTab = "overview" | "trigger" | "writing";
type EditorMode = "create" | "edit";

const DEFAULT_PROJECT_ID = "demo-series";
const TABS: Array<{ id: WorldbookTab; label: string }> = [
  { id: "overview", label: "基础设定" },
  { id: "trigger", label: "触发条件" },
  { id: "writing", label: "写作约束" },
];

interface WorldbookDraft {
  id: string;
  title: string;
  fact: string;
  adaptation: string;
  currentState: string;
  writingHint: string;
  forbidden: string;
  keywordsText: string;
  charactersText: string;
  placesText: string;
  timelineText: string;
  relatedNovelsText: string;
  appliesToAgentsText: string;
  semantic: boolean;
}

function readStoredProjectId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_PROJECT_ID;
  }

  return window.localStorage.getItem("shulingge.web.projectId") ?? DEFAULT_PROJECT_ID;
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

function toLines(value: string[] | undefined): string {
  return (value ?? []).join("\n");
}

function createDraft(entry?: WorldbookEntry): WorldbookDraft {
  return {
    id: entry?.id ?? "",
    title: entry?.title ?? "",
    fact: String(entry?.sections?.fact ?? ""),
    adaptation: String(entry?.sections?.adaptation ?? ""),
    currentState: String(entry?.sections?.currentState ?? ""),
    writingHint: String(entry?.sections?.writingHint ?? ""),
    forbidden: String(entry?.sections?.forbidden ?? ""),
    keywordsText: toLines(entry?.trigger?.keywords),
    charactersText: toLines(entry?.trigger?.characters),
    placesText: toLines(entry?.trigger?.places),
    timelineText: toLines(entry?.trigger?.timeline),
    relatedNovelsText: toLines(entry?.relatedNovels),
    appliesToAgentsText: toLines(entry?.appliesToAgents),
    semantic: Boolean(entry?.trigger?.semantic),
  };
}

function toPayload(draft: WorldbookDraft): WorldbookEntryInput {
  return {
    id: draft.id.trim(),
    title: draft.title.trim(),
    sections: {
      fact: draft.fact.trim() || undefined,
      adaptation: draft.adaptation.trim() || undefined,
      currentState: draft.currentState.trim() || undefined,
      writingHint: draft.writingHint.trim() || undefined,
      forbidden: draft.forbidden.trim() || undefined,
    },
    trigger: {
      keywords: parseLines(draft.keywordsText),
      characters: parseLines(draft.charactersText),
      places: parseLines(draft.placesText),
      timeline: parseLines(draft.timelineText),
      semantic: draft.semantic,
    },
    relatedNovels: parseLines(draft.relatedNovelsText),
    appliesToAgents: parseLines(draft.appliesToAgentsText),
  };
}

function filterEntries(entries: WorldbookEntry[], query: string): WorldbookEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return entries;
  }

  return entries.filter((entry) => {
    const values = [
      entry.id,
      entry.title,
      entry.sections?.fact,
      entry.sections?.adaptation,
      ...(entry.trigger?.keywords ?? []),
      ...(entry.trigger?.characters ?? []),
      ...(entry.trigger?.places ?? []),
    ]
      .filter(Boolean)
      .map((item) => String(item).toLowerCase());
    return values.some((value) => value.includes(normalized));
  });
}

function WorldbookEditor({
  mode,
  draft,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  mode: EditorMode;
  draft: WorldbookDraft;
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<WorldbookDraft>) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <section className="editor-card">
      <div className="editor-card-head">
        <div>
          <h2>{mode === "create" ? "新建世界书词条" : `编辑词条 · ${draft.title || draft.id || "未命名"}`}</h2>
          <p className="view-sub">围绕事实、触发器和写作约束组织设定，保持与后端真实 schema 一致。</p>
        </div>
        <div className="view-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={saving || !draft.id.trim() || !draft.title.trim()}>
            <Save size={15} strokeWidth={2} />
            {saving ? "保存中…" : "保存词条"}
          </button>
        </div>
      </div>

      {error ? <div className="err-card">保存失败：{error}</div> : null}

      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>词条 ID</span>
          <input className="input" value={draft.id} onChange={(event) => onChange({ id: event.target.value })} disabled={mode === "edit"} />
        </label>
        <label className="form-block">
          <span>标题</span>
          <input className="input" value={draft.title} onChange={(event) => onChange({ title: event.target.value })} />
        </label>
      </div>

      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>事实描述</span>
          <textarea className="textarea" value={draft.fact} onChange={(event) => onChange({ fact: event.target.value })} />
        </label>
        <label className="form-block">
          <span>适配 / 原作映射</span>
          <textarea className="textarea" value={draft.adaptation} onChange={(event) => onChange({ adaptation: event.target.value })} />
        </label>
      </div>

      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>当前状态</span>
          <textarea className="textarea" value={draft.currentState} onChange={(event) => onChange({ currentState: event.target.value })} />
        </label>
        <label className="form-block">
          <span>写作提示</span>
          <textarea className="textarea" value={draft.writingHint} onChange={(event) => onChange({ writingHint: event.target.value })} />
        </label>
      </div>

      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>禁写约束</span>
          <textarea className="textarea" value={draft.forbidden} onChange={(event) => onChange({ forbidden: event.target.value })} />
        </label>
        <label className="form-block">
          <span>触发关键词</span>
          <textarea className="textarea" value={draft.keywordsText} onChange={(event) => onChange({ keywordsText: event.target.value })} placeholder={"蝶屋\n药臼"} />
        </label>
      </div>

      <div className="form-grid form-grid-3">
        <label className="form-block">
          <span>触发角色</span>
          <textarea className="textarea" value={draft.charactersText} onChange={(event) => onChange({ charactersText: event.target.value })} placeholder={"kanae\nshinobu"} />
        </label>
        <label className="form-block">
          <span>触发地点</span>
          <textarea className="textarea" value={draft.placesText} onChange={(event) => onChange({ placesText: event.target.value })} placeholder={"蝶屋\n药房"} />
        </label>
        <label className="form-block">
          <span>触发时间线</span>
          <textarea className="textarea" value={draft.timelineText} onChange={(event) => onChange({ timelineText: event.target.value })} placeholder={"chapter-001\nchapter-004"} />
        </label>
      </div>

      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>适用小说</span>
          <textarea className="textarea" value={draft.relatedNovelsText} onChange={(event) => onChange({ relatedNovelsText: event.target.value })} placeholder={"main\nbranch-a"} />
        </label>
        <label className="form-block">
          <span>适用 Agent</span>
          <textarea className="textarea" value={draft.appliesToAgentsText} onChange={(event) => onChange({ appliesToAgentsText: event.target.value })} placeholder={"writer-agent\nworldbook-agent"} />
        </label>
      </div>

      <label className="switch-row">
        <input type="checkbox" checked={draft.semantic} onChange={(event) => onChange({ semantic: event.target.checked })} />
        <span>启用语义触发（semantic）</span>
      </label>
    </section>
  );
}

export function WorldbookView() {
  const [projectId, setProjectId] = useState(readStoredProjectId);
  const [entries, setEntries] = useState<WorldbookEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<WorldbookTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaultMissing, setVaultMissing] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [draft, setDraft] = useState<WorldbookDraft>(createDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    writeStoredProjectId(projectId);
  }, [projectId]);

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
          setEntries([]);
          setLoading(false);
          return;
        }

        const nextEntries = await api.listWorldbookByProject(projectId);
        if (!alive) return;
        setEntries(nextEntries);
        setSelectedEntryId((current) => {
          if (current && nextEntries.some((entry) => entry.id === current)) {
            return current;
          }
          return nextEntries[0]?.id ?? null;
        });
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
  }, [projectId]);

  const filteredEntries = useMemo(() => filterEntries(entries, search), [entries, search]);
  const selectedEntry = useMemo(
    () => filteredEntries.find((entry) => entry.id === selectedEntryId) ?? entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [entries, filteredEntries, selectedEntryId],
  );

  async function persist(mode: EditorMode) {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = toPayload(draft);
      const saved = mode === "create"
        ? await api.createWorldbookEntry(projectId, payload)
        : await api.updateWorldbookEntry(projectId, draft.id, payload);
      const nextEntries = await api.listWorldbookByProject(projectId);
      setEntries(nextEntries);
      setSelectedEntryId(saved.id);
      setEditorMode(null);
      setTab("overview");
    } catch (persistError) {
      setSaveError(persistError instanceof ApiError ? persistError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const showState = loading || error !== null || vaultMissing || filteredEntries.length === 0;

  return (
    <ViewShell
      title="世界书"
      subtitle="设定词条：地点、组织、物品、概念，按关键词触发注入"
      actions={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setDraft(createDraft());
            setEditorMode("create");
            setSaveError(null);
          }}
        >
          <Plus size={15} strokeWidth={2} />
          新建词条
        </button>
      }
    >
      <div className="toolbar-row">
        <div className="search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索词条、关键词、人物…" />
        </div>
        <label className="project-inline-field">
          <span className="faint">Project</span>
          <input className="input" value={projectId} onChange={(event) => setProjectId(event.target.value)} />
        </label>
        <span className="grow" />
        <span className="faint">共 {filteredEntries.length} / {entries.length} 条</span>
      </div>

      {editorMode ? (
        <WorldbookEditor
          mode={editorMode}
          draft={draft}
          saving={saving}
          error={saveError}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onCancel={() => {
            setEditorMode(null);
            setSaveError(null);
          }}
          onSubmit={() => {
            void persist(editorMode);
          }}
        />
      ) : null}

      {showState ? (
        <CenterState
          loading={loading}
          error={error}
          vaultMissing={vaultMissing}
          empty={filteredEntries.length === 0}
          emptyText={search ? "没有匹配的世界书词条" : "还没有世界书词条"}
        />
      ) : (
        <div className="split-layout">
          <div className="list-card">
            <div className="list-row head">
              <span className="col col-grow">词条</span>
              <span className="col" style={{ width: 120 }}>关键词</span>
              <span className="col" style={{ width: 100 }}>Agent</span>
              <span className="col" style={{ width: 120 }}>更新时间</span>
            </div>
            {filteredEntries.map((entry) => (
              <button
                type="button"
                className={`list-row ${selectedEntry?.id === entry.id ? "active" : ""}`}
                key={entry.id}
                onClick={() => {
                  setSelectedEntryId(entry.id);
                  setTab("overview");
                }}
              >
                <span className="col col-grow">
                  <div className="col-name">{entry.title}</div>
                  <div className="col-sub">{entry.sections?.fact?.slice(0, 40) || "尚未填写事实描述"}</div>
                </span>
                <span className="col" style={{ width: 120 }}>
                  <span className="tag primary">{entry.trigger?.keywords?.length ?? 0} 个</span>
                </span>
                <span className="col" style={{ width: 100 }}>
                  <span className="tag">{entry.appliesToAgents?.length ?? 0} 个</span>
                </span>
                <span className="col faint" style={{ width: 120 }}>{String(entry.updatedAt ?? "—")}</span>
              </button>
            ))}
          </div>

          {selectedEntry ? (
            <div className="detail-stack">
              <section className="hero-card">
                <div className="hero-card-main">
                  <span className="avatar lg">设</span>
                  <div>
                    <h2>{selectedEntry.title}</h2>
                    <p className="view-sub">ID：{selectedEntry.id}</p>
                    <div className="tag-row">
                      <span className="tag primary">{selectedEntry.trigger?.keywords?.length ?? 0} 个关键词</span>
                      <span className="tag">{selectedEntry.relatedNovels?.length ?? 0} 条小说关联</span>
                      <span className="tag">{selectedEntry.appliesToAgents?.length ?? 0} 个 Agent</span>
                    </div>
                  </div>
                </div>
                <div className="view-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setDraft(createDraft(selectedEntry));
                      setEditorMode("edit");
                      setSaveError(null);
                    }}
                  >
                    <Save size={15} strokeWidth={2} />
                    编辑词条
                  </button>
                </div>
              </section>

              <div className="tab-strip">
                {TABS.map((item) => (
                  <button type="button" key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="detail-grid">
                <div>
                  {tab === "overview" ? (
                    <section className="info-card">
                      <h3>基础设定</h3>
                      <div className="detail-section">
                        <h4>事实描述</h4>
                        <div className="quote-line">{selectedEntry.sections?.fact || "尚未填写"}</div>
                      </div>
                      <div className="detail-section">
                        <h4>适配 / 原作映射</h4>
                        <div className="quote-line">{selectedEntry.sections?.adaptation || "尚未填写"}</div>
                      </div>
                      <div className="detail-section">
                        <h4>当前状态</h4>
                        <div className="quote-line">{selectedEntry.sections?.currentState || "尚未填写"}</div>
                      </div>
                    </section>
                  ) : null}

                  {tab === "trigger" ? (
                    <section className="info-card">
                      <h3>触发条件</h3>
                      <div className="detail-section">
                        <h4>关键词</h4>
                        <div className="tag-row">
                          {(selectedEntry.trigger?.keywords ?? []).map((keyword) => <span className="tag primary" key={keyword}>{keyword}</span>)}
                          {(selectedEntry.trigger?.keywords ?? []).length === 0 ? <span className="faint">暂无关键词</span> : null}
                        </div>
                      </div>
                      <div className="detail-section">
                        <h4>角色 / 地点 / 时间线</h4>
                        <div className="stack-list">
                          <div className="field"><span className="k">角色</span><span className="v stack-align-start">{(selectedEntry.trigger?.characters ?? []).join(" / ") || "—"}</span></div>
                          <div className="field"><span className="k">地点</span><span className="v stack-align-start">{(selectedEntry.trigger?.places ?? []).join(" / ") || "—"}</span></div>
                          <div className="field"><span className="k">时间线</span><span className="v stack-align-start">{(selectedEntry.trigger?.timeline ?? []).join(" / ") || "—"}</span></div>
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {tab === "writing" ? (
                    <section className="info-card">
                      <h3>写作约束</h3>
                      <div className="detail-section">
                        <h4>写作提示</h4>
                        <div className="quote-line">{selectedEntry.sections?.writingHint || "尚未填写"}</div>
                      </div>
                      <div className="detail-section">
                        <h4>禁写约束</h4>
                        <div className="quote-line muted-line">{selectedEntry.sections?.forbidden || "尚未填写"}</div>
                      </div>
                    </section>
                  ) : null}
                </div>

                <div>
                  <section className="info-card">
                    <h3>注入范围</h3>
                    <div className="stack-list">
                      <div className="field"><span className="k">适用小说</span><span className="v stack-align-start">{(selectedEntry.relatedNovels ?? []).join(" / ") || "—"}</span></div>
                      <div className="field"><span className="k">适用 Agent</span><span className="v stack-align-start">{(selectedEntry.appliesToAgents ?? []).join(" / ") || "—"}</span></div>
                      <div className="field"><span className="k">语义触发</span><span className="v">{selectedEntry.trigger?.semantic ? "开启" : "关闭"}</span></div>
                    </div>
                  </section>

                  <section className="info-card">
                    <h3>设定信号</h3>
                    <div className="signal-list">
                      <div className="signal-item">
                        <Globe size={16} />
                        <div>
                          <div className="mini-card-title">关键词密度</div>
                          <div className="mini-card-sub">{selectedEntry.trigger?.keywords?.length ?? 0} 个关键词</div>
                        </div>
                      </div>
                      <div className="signal-item">
                        <Sparkles size={16} />
                        <div>
                          <div className="mini-card-title">人物触发</div>
                          <div className="mini-card-sub">{selectedEntry.trigger?.characters?.length ?? 0} 个角色</div>
                        </div>
                      </div>
                      <div className="signal-item">
                        <BookOpen size={16} />
                        <div>
                          <div className="mini-card-title">Agent 覆盖</div>
                          <div className="mini-card-sub">{selectedEntry.appliesToAgents?.length ?? 0} 个 Agent</div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          ) : (
            <CenterState loading={false} error={null} vaultMissing={false} empty emptyText="请选择左侧词条查看详情" />
          )}
        </div>
      )}
    </ViewShell>
  );
}
