import { useEffect, useMemo, useState } from "react";
import { BookOpen, Layers, Plus, Save, Search, Trash2, X } from "lucide-react";

import {
  api,
  ApiError,
  type ProjectSummary,
  type WorldbookCategory,
  type WorldbookCustomField,
  type WorldbookEntry,
  type WorldbookEntryInput,
  type WorldbookOrigin,
} from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { CenterState, ViewShell } from "./common.js";
import { ProjectSelector } from "./ProjectSelector.js";

type EditorMode = "create" | "edit";

const DEFAULT_PROJECT_ID = "demo-series";
const ORIGIN_OPTIONS: Array<{ id: WorldbookOrigin; label: string }> = [
  { id: "canon", label: "原作设定" },
  { id: "original", label: "原创设定" },
];
const CATEGORY_OPTIONS: Array<{ id: WorldbookCategory; label: string }> = [
  { id: "place", label: "地点" },
  { id: "organization", label: "组织" },
  { id: "setting", label: "设定" },
  { id: "item", label: "物品" },
  { id: "event", label: "事件" },
  { id: "other", label: "其他" },
];

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

function slugify(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `worldbook-${Date.now().toString(36)}`;
}

function categoryLabel(category?: string): string {
  return CATEGORY_OPTIONS.find((option) => option.id === category)?.label ?? "其他";
}

function originLabel(origin?: string): string {
  return ORIGIN_OPTIONS.find((option) => option.id === origin)?.label ?? "原创设定";
}

function entrySummary(entry: WorldbookEntry): string {
  return entry.summary?.trim()
    || entry.description?.trim().slice(0, 80)
    || entry.sections?.fact?.trim().slice(0, 80)
    || "尚未填写简介";
}

function createDraft(origin: WorldbookOrigin, entry?: WorldbookEntry): WorldbookEntryInput {
  return {
    id: entry?.id ?? "",
    title: entry?.title ?? "",
    name: entry?.name ?? entry?.title ?? "",
    origin: entry?.origin ?? origin,
    category: entry?.category ?? "setting",
    summary: entry?.summary ?? "",
    description: entry?.description ?? entry?.sections?.fact ?? "",
    relatedCharacters: entry?.relatedCharacters ?? entry?.trigger?.characters ?? [],
    relatedChapters: entry?.relatedChapters ?? entry?.trigger?.timeline ?? [],
    custom: entry?.custom ?? [],
    sections: {
      fact: entry?.sections?.fact ?? "",
      adaptation: entry?.sections?.adaptation ?? "",
      currentState: entry?.sections?.currentState ?? "",
      writingHint: entry?.sections?.writingHint ?? "",
      forbidden: entry?.sections?.forbidden ?? "",
    },
    trigger: {
      keywords: entry?.trigger?.keywords ?? [],
      characters: entry?.trigger?.characters ?? entry?.relatedCharacters ?? [],
      places: entry?.trigger?.places ?? [],
      timeline: entry?.trigger?.timeline ?? entry?.relatedChapters ?? [],
      semantic: entry?.trigger?.semantic ?? false,
    },
    relatedNovels: entry?.relatedNovels ?? [],
    appliesToAgents: entry?.appliesToAgents ?? [],
  };
}

function filterEntries(entries: WorldbookEntry[], query: string): WorldbookEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return entries;
  }

  return entries.filter((entry) =>
    [
      entry.id,
      entry.title,
      entry.name,
      entry.summary,
      entry.description,
      entry.sections?.fact,
      ...(entry.trigger?.keywords ?? []),
      ...(entry.relatedCharacters ?? []),
      ...(entry.relatedChapters ?? []),
      JSON.stringify(entry.custom ?? []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

function groupByCategory(entries: WorldbookEntry[]): Array<{ category: WorldbookCategory; entries: WorldbookEntry[] }> {
  return CATEGORY_OPTIONS.map((option) => ({
    category: option.id,
    entries: entries.filter((entry) => (entry.category ?? "setting") === option.id),
  })).filter((group) => group.entries.length > 0);
}

function CustomFieldsEditor({
  rows,
  onChange,
}: {
  rows: WorldbookCustomField[];
  onChange(rows: WorldbookCustomField[]): void;
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

function WorldbookEditor({
  mode,
  value,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  mode: EditorMode;
  value: WorldbookEntryInput;
  saving: boolean;
  error: string | null;
  onChange(next: WorldbookEntryInput): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const updateTextLines = (key: "relatedCharacters" | "relatedChapters" | "relatedNovels" | "appliesToAgents", text: string) => {
    onChange({ ...value, [key]: parseLines(text) });
  };
  const updateTriggerLines = (key: "keywords" | "characters" | "places" | "timeline", text: string) => {
    onChange({
      ...value,
      trigger: {
        keywords: value.trigger?.keywords ?? [],
        characters: value.trigger?.characters ?? [],
        places: value.trigger?.places ?? [],
        timeline: value.trigger?.timeline ?? [],
        semantic: value.trigger?.semantic ?? false,
        [key]: parseLines(text),
      },
    });
  };

  return (
    <div className="vault-modal-backdrop character-modal-backdrop" onMouseDown={onCancel}>
      <div className="vault-modal character-modal worldbook-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head">
          <div>
            <h2>{mode === "create" ? "新建设定" : `编辑设定 · ${value.title}`}</h2>
            <p>每条设定归属于当前项目，并在项目内区分原作/原创和类型。</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="character-modal-body">
          {error ? <div className="err-card">保存失败：{error}</div> : null}
          <div className="form-grid form-grid-3">
            <label className="form-block">
              <span>名称</span>
              <input className="input" value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value, name: event.target.value })} />
            </label>
            <label className="form-block">
              <span>来源</span>
              <select className="input" value={value.origin ?? "original"} onChange={(event) => onChange({ ...value, origin: event.target.value as WorldbookOrigin })}>
                {ORIGIN_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label className="form-block">
              <span>类型</span>
              <select className="input" value={value.category ?? "setting"} onChange={(event) => onChange({ ...value, category: event.target.value as WorldbookCategory })}>
                {CATEGORY_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label className="form-block">
              <span>简介</span>
              <input className="input" value={value.summary ?? ""} onChange={(event) => onChange({ ...value, summary: event.target.value })} />
            </label>
            <label className="form-block">
              <span>详细描述</span>
              <textarea
                className="textarea worldbook-description"
                value={value.description ?? ""}
                onChange={(event) => onChange({
                  ...value,
                  description: event.target.value,
                  sections: { ...value.sections, fact: event.target.value },
                })}
              />
            </label>
          </div>
          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>相关角色</span>
              <textarea className="textarea" value={toLines(value.relatedCharacters)} onChange={(event) => updateTextLines("relatedCharacters", event.target.value)} placeholder={"kanae\nshinobu"} />
            </label>
            <label className="form-block">
              <span>相关章节</span>
              <textarea className="textarea" value={toLines(value.relatedChapters)} onChange={(event) => updateTextLines("relatedChapters", event.target.value)} placeholder={"chapter-001\nchapter-004"} />
            </label>
          </div>
          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>触发关键词</span>
              <textarea className="textarea" value={toLines(value.trigger?.keywords)} onChange={(event) => updateTriggerLines("keywords", event.target.value)} />
            </label>
            <label className="form-block">
              <span>触发地点</span>
              <textarea className="textarea" value={toLines(value.trigger?.places)} onChange={(event) => updateTriggerLines("places", event.target.value)} />
            </label>
          </div>
          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>适用小说</span>
              <textarea className="textarea" value={toLines(value.relatedNovels)} onChange={(event) => updateTextLines("relatedNovels", event.target.value)} />
            </label>
            <label className="form-block">
              <span>适用 Agent</span>
              <textarea className="textarea" value={toLines(value.appliesToAgents)} onChange={(event) => updateTextLines("appliesToAgents", event.target.value)} />
            </label>
          </div>
          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>写作提示</span>
              <textarea className="textarea" value={value.sections?.writingHint ?? ""} onChange={(event) => onChange({ ...value, sections: { ...value.sections, writingHint: event.target.value } })} />
            </label>
            <label className="form-block">
              <span>禁止写法</span>
              <textarea className="textarea" value={value.sections?.forbidden ?? ""} onChange={(event) => onChange({ ...value, sections: { ...value.sections, forbidden: event.target.value } })} />
            </label>
          </div>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={Boolean(value.trigger?.semantic)}
              onChange={(event) => onChange({ ...value, trigger: { ...value.trigger, keywords: value.trigger?.keywords ?? [], characters: value.trigger?.characters ?? [], places: value.trigger?.places ?? [], semantic: event.target.checked } })}
            />
            <span>启用语义触发</span>
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
            {saving ? "保存中…" : "保存设定"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorldbookView() {
  const [projectId, setProjectId] = useState(readStoredProjectId);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [entries, setEntries] = useState<WorldbookEntry[]>([]);
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState<WorldbookOrigin>("canon");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaultMissing, setVaultMissing] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [draft, setDraft] = useState<WorldbookEntryInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorldbookEntry | null>(null);

  const loadData = async (targetProjectId = projectId) => {
    setLoading(true);
    setError(null);
    setVaultMissing(false);
    try {
      const health = await api.health();
      if (!health.vaultSelected) {
        setVaultMissing(true);
        setProjects([]);
        setEntries([]);
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
      const nextEntries = resolvedProjectId ? await api.listWorldbookByProject(resolvedProjectId) : [];
      setProjects(nextProjects);
      setEntries(nextEntries);
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : "加载世界书失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filteredEntries = useMemo(
    () => filterEntries(entries.filter((entry) => (entry.origin ?? "original") === origin), search),
    [entries, origin, search],
  );
  const groupedEntries = useMemo(() => groupByCategory(filteredEntries), [filteredEntries]);

  const startCreate = () => {
    setDraft(createDraft(origin));
    setEditorMode("create");
    setSaveError(null);
  };

  const startEdit = (entry: WorldbookEntry) => {
    setDraft(createDraft(origin, entry));
    setEditorMode("edit");
    setSaveError(null);
  };

  const persist = async () => {
    if (!draft) {
      return;
    }
    const title = draft.title.trim();
    if (!title) {
      setSaveError("名称不能为空");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const payload: WorldbookEntryInput = {
        ...draft,
        id: editorMode === "create" ? slugify(draft.id || title) : draft.id,
        title,
        name: draft.name?.trim() || title,
        origin: draft.origin ?? origin,
        category: draft.category ?? "setting",
        trigger: {
          keywords: draft.trigger?.keywords ?? [],
          characters: draft.trigger?.characters ?? draft.relatedCharacters ?? [],
          places: draft.trigger?.places ?? [],
          timeline: draft.trigger?.timeline ?? draft.relatedChapters ?? [],
          semantic: draft.trigger?.semantic ?? false,
        },
        relatedNovels: draft.relatedNovels ?? [],
        appliesToAgents: draft.appliesToAgents ?? [],
      };
      if (editorMode === "create") {
        await api.createWorldbookEntry(projectId, payload);
      } else {
        await api.updateWorldbookEntry(projectId, payload.id, payload);
      }
      setEditorMode(null);
      setDraft(null);
      setOrigin(payload.origin ?? origin);
      await loadData(projectId);
    } catch (persistError) {
      setSaveError(persistError instanceof ApiError ? persistError.message : "保存设定失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: WorldbookEntry) => {
    try {
      await api.deleteWorldbookEntry(projectId, entry.id);
      setDeleteTarget(null);
      await loadData(projectId);
    } catch (deleteError) {
      setError(deleteError instanceof ApiError ? deleteError.message : "删除设定失败");
    }
  };

  const showState = loading || error !== null || vaultMissing || filteredEntries.length === 0;

  return (
    <ViewShell
      title="世界书"
      subtitle="在当前项目内管理原作/原创设定，并按地点、组织、设定、物品、事件归类"
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
            新建设定
          </button>
        </>
      }
    >
      <div className="toolbar-row">
        <div className="search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索设定、简介、角色或关键词…" />
        </div>
        <span className="grow" />
        <span className="faint">共 {filteredEntries.length} / {entries.length} 条</span>
      </div>
      <div className="worldbook-origin-tabs">
        {ORIGIN_OPTIONS.map((option) => (
          <button type="button" key={option.id} className={origin === option.id ? "active" : ""} onClick={() => setOrigin(option.id)}>
            {option.label}
          </button>
        ))}
      </div>

      {showState ? (
        <CenterState
          loading={loading}
          error={error}
          vaultMissing={vaultMissing}
          empty={filteredEntries.length === 0}
          emptyText={search ? "没有找到匹配的设定" : `还没有${originLabel(origin)}，点右上角「新建设定」`}
        />
      ) : (
        <div className="worldbook-group-stack">
          {groupedEntries.map((group) => (
            <section className="worldbook-group" key={group.category}>
              <div className="worldbook-group-head">
                <Layers size={16} />
                <h3>{categoryLabel(group.category)}</h3>
                <span>{group.entries.length} 条</span>
              </div>
              <div className="worldbook-entry-list">
                {group.entries.map((entry) => (
                  <article className="worldbook-entry-row" key={entry.id}>
                    <div className="worldbook-entry-main">
                      <div className="worldbook-entry-title">
                        <BookOpen size={15} />
                        <strong>{entry.name || entry.title}</strong>
                        <span className="tag primary">{categoryLabel(entry.category)}</span>
                      </div>
                      <p>{entrySummary(entry)}</p>
                      <div className="tag-row">
                        <span className="tag">{originLabel(entry.origin)}</span>
                        <span className="tag">{(entry.relatedCharacters ?? []).length} 角色</span>
                        <span className="tag">{(entry.relatedChapters ?? []).length} 章节</span>
                      </div>
                    </div>
                    <div className="view-actions">
                      <button type="button" className="btn" onClick={() => startEdit(entry)}>编辑</button>
                      <button type="button" className="btn-icon danger" onClick={() => setDeleteTarget(entry)} aria-label="删除设定">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editorMode && draft ? (
        <WorldbookEditor
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
          title="删除设定"
          message={`确定删除设定「${deleteTarget.title}」吗？此操作不可恢复。`}
          confirmText="删除"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            void deleteEntry(deleteTarget);
          }}
        />
      ) : null}
    </ViewShell>
  );
}
