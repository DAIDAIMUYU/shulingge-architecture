import { useEffect, useMemo, useState } from "react";
import { Clock3, GitBranch, MapPin, Plus, Save, Search, Trash2, Users, X } from "lucide-react";

import {
  api,
  ApiError,
  type ProjectSummary,
  type TimelineEvent,
  type TimelineEventInput,
} from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { CenterState, ViewShell } from "./common.js";
import { ProjectSelector } from "./ProjectSelector.js";

type EditorMode = "create" | "edit";
type TimelineLineFilter = "all" | "main" | "character" | "relation" | "world" | "canon" | "branch" | "chapter";

const DEFAULT_PROJECT_ID = "demo-series";
const LINE_OPTIONS: Array<{ id: TimelineLineFilter; label: string }> = [
  { id: "all", label: "全部线" },
  { id: "main", label: "主线" },
  { id: "character", label: "角色线" },
  { id: "relation", label: "关系线" },
  { id: "world", label: "世界线" },
  { id: "canon", label: "原作线" },
  { id: "branch", label: "支线" },
  { id: "chapter", label: "章节线" },
];
const EDITABLE_LINES = LINE_OPTIONS.filter((line): line is { id: Exclude<TimelineLineFilter, "all">; label: string } => line.id !== "all");

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

function slugify(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `timeline-${Date.now().toString(36)}`;
}

function lineLabel(line?: string): string {
  return LINE_OPTIONS.find((option) => option.id === line)?.label ?? String(line ?? "主线");
}

function eventSummary(event: TimelineEvent): string {
  return event.summary?.trim() || event.description?.trim().slice(0, 90) || "尚未填写简介";
}

function createDraft(line: Exclude<TimelineLineFilter, "all">, event?: TimelineEvent): TimelineEventInput {
  return {
    id: event?.id ?? "",
    title: event?.title ?? "",
    line: event?.line ?? line,
    order: event?.order ?? 0,
    eventDate: event?.eventDate ?? "",
    summary: event?.summary ?? "",
    description: event?.description ?? "",
    location: event?.location ?? "",
    custom: event?.custom ?? [],
    boundChapters: event?.boundChapters ?? [],
    participants: event?.participants ?? [],
    stateSnapshotRef: event?.stateSnapshotRef ?? null,
  };
}

function sortEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((left, right) =>
    (left.order ?? 0) - (right.order ?? 0)
    || String(left.eventDate ?? "").localeCompare(String(right.eventDate ?? ""))
    || left.title.localeCompare(right.title),
  );
}

function filterEvents(events: TimelineEvent[], query: string): TimelineEvent[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return events;
  }

  return events.filter((event) =>
    [
      event.id,
      event.title,
      event.line,
      event.eventDate,
      event.summary,
      event.description,
      event.location,
      ...(event.boundChapters ?? []),
      ...(event.participants ?? []),
      JSON.stringify(event.custom ?? []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

function CustomFieldsEditor({
  rows,
  onChange,
}: {
  rows: Array<{ label?: string; value?: string }>;
  onChange(rows: Array<{ label?: string; value?: string }>): void;
}) {
  return (
    <div className="character-custom-fields">
      {rows.map((row, index) => (
        <div className="character-custom-row" key={index}>
          <input
            className="input"
            value={row.label ?? ""}
            placeholder="自定义标题"
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, label: event.target.value };
              onChange(next);
            }}
          />
          <input
            className="input"
            value={row.value ?? ""}
            placeholder="内容"
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, value: event.target.value };
              onChange(next);
            }}
          />
          <button type="button" className="btn-icon danger" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))} aria-label="删除自定义字段">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost character-add-custom" onClick={() => onChange([...rows, { label: "", value: "" }])}>
        <Plus size={14} />
        添加自定义字段
      </button>
    </div>
  );
}

function TimelineEditor({
  mode,
  value,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  mode: EditorMode;
  value: TimelineEventInput;
  saving: boolean;
  error: string | null;
  onChange(next: TimelineEventInput): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  return (
    <div className="vault-modal-backdrop character-modal-backdrop" onMouseDown={onCancel}>
      <div className="vault-modal character-modal timeline-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head">
          <div>
            <h2>{mode === "create" ? "新建事件" : `编辑事件 · ${value.title}`}</h2>
            <p>事件归属于当前项目，并按线类型和排序值进入时序展示。</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="character-modal-body">
          {error ? <div className="err-card">保存失败：{error}</div> : null}
          <div className="form-grid form-grid-3">
            <label className="form-block">
              <span>标题</span>
              <input className="input" value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} />
            </label>
            <label className="form-block">
              <span>线类型</span>
              <select className="input" value={value.line} onChange={(event) => onChange({ ...value, line: event.target.value })}>
                {EDITABLE_LINES.map((line) => <option value={line.id} key={line.id}>{line.label}</option>)}
              </select>
            </label>
            <label className="form-block">
              <span>排序</span>
              <input className="input" type="number" value={String(value.order ?? 0)} onChange={(event) => onChange({ ...value, order: Number.parseInt(event.target.value, 10) || 0 })} />
            </label>
          </div>
          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>发生时间</span>
              <input className="input" value={value.eventDate ?? ""} onChange={(event) => onChange({ ...value, eventDate: event.target.value })} placeholder="第3章 / 开篇前 / 某年某月" />
            </label>
            <label className="form-block">
              <span>地点</span>
              <input className="input" value={value.location ?? ""} onChange={(event) => onChange({ ...value, location: event.target.value })} />
            </label>
          </div>
          <div className="form-grid">
            <label className="form-block">
              <span>简介</span>
              <input className="input" value={value.summary ?? ""} onChange={(event) => onChange({ ...value, summary: event.target.value })} />
            </label>
            <label className="form-block">
              <span>详细描述</span>
              <textarea className="textarea timeline-description" value={value.description ?? ""} onChange={(event) => onChange({ ...value, description: event.target.value })} />
            </label>
          </div>
          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>参与角色</span>
              <textarea className="textarea" value={toLines(value.participants)} onChange={(event) => onChange({ ...value, participants: parseLines(event.target.value) })} placeholder={"kanae\nshinobu"} />
            </label>
            <label className="form-block">
              <span>绑定章节</span>
              <textarea className="textarea" value={toLines(value.boundChapters)} onChange={(event) => onChange({ ...value, boundChapters: parseLines(event.target.value) })} placeholder={"chapter-001\nchapter-004"} />
            </label>
          </div>
          <label className="form-block">
            <span>状态快照引用</span>
            <input className="input" value={value.stateSnapshotRef ?? ""} onChange={(event) => onChange({ ...value, stateSnapshotRef: event.target.value.trim() || null })} />
          </label>
          <section className="agent-editor-section">
            <div className="model-editor-section-title">自定义字段</div>
            <CustomFieldsEditor rows={value.custom ?? []} onChange={(rows) => onChange({ ...value, custom: rows })} />
          </section>
        </div>
        <div className="agent-modal-actions view-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={saving || !value.title.trim()}>
            <Save size={15} />
            {saving ? "保存中…" : "保存事件"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TimelineView() {
  const [projectId, setProjectId] = useState(readStoredProjectId);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [search, setSearch] = useState("");
  const [lineFilter, setLineFilter] = useState<TimelineLineFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaultMissing, setVaultMissing] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [draft, setDraft] = useState<TimelineEventInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TimelineEvent | null>(null);

  const loadData = async (targetProjectId = projectId) => {
    setLoading(true);
    setError(null);
    setVaultMissing(false);
    try {
      const health = await api.health();
      if (!health.vaultSelected) {
        setVaultMissing(true);
        setProjects([]);
        setEvents([]);
        setLoading(false);
        return;
      }
      const nextProjects = await api.listProjects();
      const resolvedProjectId = nextProjects.some((project) => project.projectId === targetProjectId)
        ? targetProjectId
        : nextProjects[0]?.projectId ?? targetProjectId;
      if (resolvedProjectId !== projectId) {
        setProjectId(resolvedProjectId);
        writeStoredProjectId(resolvedProjectId);
      }
      const nextEvents = resolvedProjectId ? await api.listTimelineByProject(resolvedProjectId) : [];
      setProjects(nextProjects);
      setEvents(sortEvents(nextEvents));
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : "加载时间线失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filteredEvents = useMemo(() => {
    const byLine = lineFilter === "all" ? events : events.filter((event) => event.line === lineFilter);
    return sortEvents(filterEvents(byLine, search));
  }, [events, lineFilter, search]);

  const createLine = lineFilter === "all" ? "main" : lineFilter;

  const startCreate = () => {
    setDraft(createDraft(createLine as Exclude<TimelineLineFilter, "all">));
    setEditorMode("create");
    setSaveError(null);
  };

  const startEdit = (event: TimelineEvent) => {
    setDraft(createDraft("main", event));
    setEditorMode("edit");
    setSaveError(null);
  };

  const persist = async () => {
    if (!draft) {
      return;
    }
    const title = draft.title.trim();
    if (!title) {
      setSaveError("标题不能为空");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const payload: TimelineEventInput = {
        ...draft,
        id: editorMode === "create" ? slugify(draft.id || title) : draft.id,
        title,
        line: draft.line || "main",
        order: draft.order ?? 0,
        boundChapters: draft.boundChapters ?? [],
        participants: draft.participants ?? [],
        custom: draft.custom ?? [],
      };
      if (editorMode === "create") {
        await api.createTimelineEvent(projectId, payload);
      } else {
        await api.updateTimelineEvent(projectId, payload.id, payload);
      }
      setEditorMode(null);
      setDraft(null);
      setLineFilter((payload.line as TimelineLineFilter) || lineFilter);
      await loadData(projectId);
    } catch (persistError) {
      setSaveError(persistError instanceof ApiError ? persistError.message : "保存事件失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (event: TimelineEvent) => {
    try {
      await api.deleteTimelineEvent(projectId, event.id);
      setDeleteTarget(null);
      await loadData(projectId);
    } catch (deleteError) {
      setError(deleteError instanceof ApiError ? deleteError.message : "删除事件失败");
    }
  };

  const showState = loading || error !== null || vaultMissing || filteredEvents.length === 0;

  return (
    <ViewShell
      title="时间线"
      subtitle="按项目管理主线、角色线、关系线与世界线事件"
      actions={
        <>
          <ProjectSelector
            projects={projects}
            projectId={projectId}
            disabled={vaultMissing || loading}
            onChange={(nextProjectId) => {
              setProjectId(nextProjectId);
              writeStoredProjectId(nextProjectId);
            }}
          />
          <button type="button" className="btn btn-primary" onClick={startCreate} disabled={!projectId || vaultMissing || projects.length === 0}>
            <Plus size={15} />
            新建事件
          </button>
        </>
      }
    >
      <div className="toolbar-row">
        <div className="search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索事件、角色、章节或地点…" />
        </div>
        <span className="grow" />
        <span className="faint">共 {filteredEvents.length} / {events.length} 个事件</span>
      </div>
      <div className="worldbook-origin-tabs timeline-line-tabs">
        {LINE_OPTIONS.map((line) => (
          <button type="button" key={line.id} className={lineFilter === line.id ? "active" : ""} onClick={() => setLineFilter(line.id)}>
            {line.label}
          </button>
        ))}
      </div>

      {showState ? (
        <CenterState
          loading={loading}
          error={error}
          vaultMissing={vaultMissing}
          empty={filteredEvents.length === 0}
          emptyText={search ? "没有找到匹配的事件" : "还没有时间线事件，点右上角「新建事件」"}
        />
      ) : (
        <div className="timeline-stream">
          {filteredEvents.map((event, index) => (
            <article className="timeline-event-card" key={event.id}>
              <div className="timeline-marker">
                <span>{event.eventDate || `#${event.order ?? index + 1}`}</span>
              </div>
              <div className="timeline-dot" />
              <div className="timeline-event-body">
                <div className="timeline-event-head">
                  <div>
                    <div className="timeline-event-title">
                      <strong>{event.title}</strong>
                      <span className="tag primary">{lineLabel(event.line)}</span>
                    </div>
                    <p>{eventSummary(event)}</p>
                  </div>
                  <div className="view-actions">
                    <button type="button" className="btn" onClick={() => startEdit(event)}>编辑</button>
                    <button type="button" className="btn-icon danger" onClick={() => setDeleteTarget(event)} aria-label="删除事件">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="tag-row">
                  {event.location ? <span className="tag"><MapPin size={12} />{event.location}</span> : null}
                  <span className="tag"><Users size={12} />{(event.participants ?? []).length} 角色</span>
                  <span className="tag"><GitBranch size={12} />{(event.boundChapters ?? []).length} 章节</span>
                </div>
                {event.description ? <div className="timeline-event-description">{event.description}</div> : null}
                {event.custom?.length ? (
                  <div className="timeline-custom-list">
                    {event.custom.map((row, rowIndex) => (
                      row.label || row.value ? <span className="tag" key={rowIndex}>{row.label || "补充"}：{row.value}</span> : null
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {editorMode && draft ? (
        <TimelineEditor
          mode={editorMode}
          value={draft}
          saving={saving}
          error={saveError}
          onChange={setDraft}
          onCancel={() => {
            setEditorMode(null);
            setDraft(null);
            setSaveError(null);
          }}
          onSubmit={() => {
            void persist();
          }}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="删除事件"
          message={`确定删除事件「${deleteTarget.title}」吗？此操作不可恢复。`}
          confirmText="删除"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            void deleteEvent(deleteTarget);
          }}
        />
      ) : null}
    </ViewShell>
  );
}
