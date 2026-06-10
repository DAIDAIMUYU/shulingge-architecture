import { useEffect, useMemo, useState } from "react";
import { Clock3, GitBranch, Plus, Save, Search, Users } from "lucide-react";

import { api, ApiError, type TimelineEvent, type TimelineEventInput } from "../api/client.js";
import { CenterState, ViewShell } from "./common.js";

type TimelineTab = "overview" | "participants" | "bindings";
type EditorMode = "create" | "edit";

const DEFAULT_PROJECT_ID = "demo-series";
const TABS: Array<{ id: TimelineTab; label: string }> = [
  { id: "overview", label: "事件概览" },
  { id: "participants", label: "参与角色" },
  { id: "bindings", label: "章节绑定" },
];

interface TimelineDraft {
  id: string;
  title: string;
  line: string;
  order: string;
  boundChaptersText: string;
  participantsText: string;
  stateSnapshotRef: string;
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

function toLines(values: string[] | undefined): string {
  return (values ?? []).join("\n");
}

function createDraft(event?: TimelineEvent): TimelineDraft {
  return {
    id: event?.id ?? "",
    title: event?.title ?? "",
    line: String(event?.line ?? "main"),
    order: String(event?.order ?? 0),
    boundChaptersText: toLines(event?.boundChapters),
    participantsText: toLines(event?.participants),
    stateSnapshotRef: String(event?.stateSnapshotRef ?? ""),
  };
}

function toPayload(draft: TimelineDraft): TimelineEventInput {
  return {
    id: draft.id.trim(),
    title: draft.title.trim(),
    line: draft.line.trim() || "main",
    order: Number.parseInt(draft.order, 10) || 0,
    boundChapters: parseLines(draft.boundChaptersText),
    participants: parseLines(draft.participantsText),
    stateSnapshotRef: draft.stateSnapshotRef.trim() || null,
  };
}

function filterEvents(events: TimelineEvent[], query: string): TimelineEvent[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return events;
  }

  return events.filter((event) => {
    const values = [
      event.id,
      event.title,
      event.line,
      ...(event.boundChapters ?? []),
      ...(event.participants ?? []),
    ]
      .filter(Boolean)
      .map((item) => String(item).toLowerCase());
    return values.some((value) => value.includes(normalized));
  });
}

function TimelineEditor({
  mode,
  draft,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  mode: EditorMode;
  draft: TimelineDraft;
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<TimelineDraft>) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <section className="editor-card">
      <div className="editor-card-head">
        <div>
          <h2>{mode === "create" ? "新建时间线事件" : `编辑事件 · ${draft.title || draft.id || "未命名"}`}</h2>
          <p className="view-sub">事件字段严格对齐后端 timeline schema：线路、顺位、参与者、章节绑定与快照引用。</p>
        </div>
        <div className="view-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={saving || !draft.id.trim() || !draft.title.trim()}>
            <Save size={15} strokeWidth={2} />
            {saving ? "保存中…" : "保存事件"}
          </button>
        </div>
      </div>

      {error ? <div className="err-card">保存失败：{error}</div> : null}

      <div className="form-grid form-grid-3">
        <label className="form-block">
          <span>事件 ID</span>
          <input className="input" value={draft.id} onChange={(event) => onChange({ id: event.target.value })} disabled={mode === "edit"} />
        </label>
        <label className="form-block">
          <span>标题</span>
          <input className="input" value={draft.title} onChange={(event) => onChange({ title: event.target.value })} />
        </label>
        <label className="form-block">
          <span>时间线线路</span>
          <input className="input" value={draft.line} onChange={(event) => onChange({ line: event.target.value })} placeholder="main / side / flashback" />
        </label>
      </div>

      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>顺位（order）</span>
          <input className="input" value={draft.order} onChange={(event) => onChange({ order: event.target.value })} placeholder="0" />
        </label>
        <label className="form-block">
          <span>状态快照引用</span>
          <input className="input" value={draft.stateSnapshotRef} onChange={(event) => onChange({ stateSnapshotRef: event.target.value })} placeholder="snapshots/chapter-001/..." />
        </label>
      </div>

      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>绑定章节</span>
          <textarea className="textarea" value={draft.boundChaptersText} onChange={(event) => onChange({ boundChaptersText: event.target.value })} placeholder={"chapter-001\nchapter-002"} />
        </label>
        <label className="form-block">
          <span>参与角色</span>
          <textarea className="textarea" value={draft.participantsText} onChange={(event) => onChange({ participantsText: event.target.value })} placeholder={"kanae\nshinobu"} />
        </label>
      </div>
    </section>
  );
}

export function TimelineView() {
  const [projectId, setProjectId] = useState(readStoredProjectId);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TimelineTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaultMissing, setVaultMissing] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [draft, setDraft] = useState<TimelineDraft>(createDraft());
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
          setEvents([]);
          setLoading(false);
          return;
        }

        const nextEvents = await api.listTimelineByProject(projectId);
        if (!alive) return;

        const sorted = [...nextEvents].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
        setEvents(sorted);
        setSelectedEventId((current) => {
          if (current && sorted.some((event) => event.id === current)) {
            return current;
          }
          return sorted[0]?.id ?? null;
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

  const filteredEvents = useMemo(() => filterEvents(events, search), [events, search]);
  const selectedEvent = useMemo(
    () => filteredEvents.find((event) => event.id === selectedEventId) ?? events.find((event) => event.id === selectedEventId) ?? null,
    [events, filteredEvents, selectedEventId],
  );

  async function persist(mode: EditorMode) {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = toPayload(draft);
      const saved = mode === "create"
        ? await api.createTimelineEvent(projectId, payload)
        : await api.updateTimelineEvent(projectId, draft.id, payload);
      const nextEvents = await api.listTimelineByProject(projectId);
      const sorted = [...nextEvents].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
      setEvents(sorted);
      setSelectedEventId(saved.id);
      setEditorMode(null);
      setTab("overview");
    } catch (persistError) {
      setSaveError(persistError instanceof ApiError ? persistError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const showState = loading || error !== null || vaultMissing || filteredEvents.length === 0;

  return (
    <ViewShell
      title="时间线"
      subtitle="按发生顺序梳理事件，校对前后一致性"
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
          新建事件
        </button>
      }
    >
      <div className="toolbar-row">
        <div className="search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索事件、角色、章节…" />
        </div>
        <label className="project-inline-field">
          <span className="faint">Project</span>
          <input className="input" value={projectId} onChange={(event) => setProjectId(event.target.value)} />
        </label>
        <span className="grow" />
        <span className="faint">共 {filteredEvents.length} / {events.length} 个事件</span>
      </div>

      {editorMode ? (
        <TimelineEditor
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
          empty={filteredEvents.length === 0}
          emptyText={search ? "没有匹配的时间线事件" : "还没有时间线事件"}
        />
      ) : (
        <div className="split-layout">
          <div className="list-card">
            <div className="list-row head">
              <span className="col" style={{ width: 88 }}>顺位</span>
              <span className="col col-grow">事件</span>
              <span className="col" style={{ width: 120 }}>线路</span>
              <span className="col" style={{ width: 130 }}>绑定章节</span>
            </div>
            {filteredEvents.map((event) => (
              <button
                type="button"
                className={`list-row ${selectedEvent?.id === event.id ? "active" : ""}`}
                key={event.id}
                onClick={() => {
                  setSelectedEventId(event.id);
                  setTab("overview");
                }}
              >
                <span className="col" style={{ width: 88 }}>
                  <span className="tag primary">#{event.order ?? 0}</span>
                </span>
                <span className="col col-grow">
                  <div className="col-name">{event.title}</div>
                  <div className="col-sub">{(event.participants ?? []).join(" / ") || "暂无参与角色"}</div>
                </span>
                <span className="col" style={{ width: 120 }}>
                  <span className="tag">{String(event.line ?? "main")}</span>
                </span>
                <span className="col faint" style={{ width: 130 }}>
                  {(event.boundChapters ?? []).slice(0, 2).join(" / ") || "—"}
                </span>
              </button>
            ))}
          </div>

          {selectedEvent ? (
            <div className="detail-stack">
              <section className="hero-card">
                <div className="hero-card-main">
                  <span className="avatar lg">时</span>
                  <div>
                    <h2>{selectedEvent.title}</h2>
                    <p className="view-sub">ID：{selectedEvent.id}</p>
                    <div className="tag-row">
                      <span className="tag primary">#{selectedEvent.order ?? 0}</span>
                      <span className="tag">{String(selectedEvent.line ?? "main")}</span>
                      <span className="tag">{selectedEvent.participants?.length ?? 0} 位参与者</span>
                    </div>
                  </div>
                </div>
                <div className="view-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setDraft(createDraft(selectedEvent));
                      setEditorMode("edit");
                      setSaveError(null);
                    }}
                  >
                    <Save size={15} strokeWidth={2} />
                    编辑事件
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
                      <h3>事件概览</h3>
                      <div className="field"><span className="k">事件 ID</span><span className="v">{selectedEvent.id}</span></div>
                      <div className="field"><span className="k">标题</span><span className="v stack-align-start">{selectedEvent.title}</span></div>
                      <div className="field"><span className="k">线路</span><span className="v">{String(selectedEvent.line ?? "main")}</span></div>
                      <div className="field"><span className="k">顺位</span><span className="v">#{selectedEvent.order ?? 0}</span></div>
                      <div className="field"><span className="k">快照引用</span><span className="v stack-align-start">{String(selectedEvent.stateSnapshotRef ?? "未设置")}</span></div>
                    </section>
                  ) : null}

                  {tab === "participants" ? (
                    <section className="info-card">
                      <h3>参与角色</h3>
                      {(selectedEvent.participants ?? []).length ? (
                        <div className="stack-list">
                          {(selectedEvent.participants ?? []).map((participant) => (
                            <div className="mini-card" key={participant}>
                              <div className="mini-card-title">{participant}</div>
                              <div className="mini-card-sub">参与此事件的角色 ID</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="faint">暂无参与角色</div>
                      )}
                    </section>
                  ) : null}

                  {tab === "bindings" ? (
                    <section className="info-card">
                      <h3>章节绑定</h3>
                      {(selectedEvent.boundChapters ?? []).length ? (
                        <div className="stack-list">
                          {(selectedEvent.boundChapters ?? []).map((chapterId) => (
                            <div className="quote-line" key={chapterId}>{chapterId}</div>
                          ))}
                        </div>
                      ) : (
                        <div className="faint">暂无绑定章节</div>
                      )}
                    </section>
                  ) : null}
                </div>

                <div>
                  <section className="info-card">
                    <h3>事件信号</h3>
                    <div className="signal-list">
                      <div className="signal-item">
                        <Clock3 size={16} />
                        <div>
                          <div className="mini-card-title">时间顺位</div>
                          <div className="mini-card-sub">#{selectedEvent.order ?? 0}</div>
                        </div>
                      </div>
                      <div className="signal-item">
                        <Users size={16} />
                        <div>
                          <div className="mini-card-title">参与角色</div>
                          <div className="mini-card-sub">{selectedEvent.participants?.length ?? 0} 位</div>
                        </div>
                      </div>
                      <div className="signal-item">
                        <GitBranch size={16} />
                        <div>
                          <div className="mini-card-title">章节绑定</div>
                          <div className="mini-card-sub">{selectedEvent.boundChapters?.length ?? 0} 章</div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="info-card">
                    <h3>元数据</h3>
                    <div className="stack-list">
                      <div className="field"><span className="k">创建时间</span><span className="v">{String(selectedEvent.createdAt ?? "—")}</span></div>
                      <div className="field"><span className="k">更新时间</span><span className="v">{String(selectedEvent.updatedAt ?? "—")}</span></div>
                      <div className="field"><span className="k">绑定章节数</span><span className="v">{selectedEvent.boundChapters?.length ?? 0}</span></div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          ) : (
            <CenterState loading={false} error={null} vaultMissing={false} empty emptyText="请选择左侧事件查看详情" />
          )}
        </div>
      )}
    </ViewShell>
  );
}
