import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Clock3, GitBranch, MapPin, Plus, Save, Search, Sparkles, Trash2, Users, X } from "lucide-react";

import {
  api,
  ApiError,
  type Character,
  type ProjectSummary,
  type TimelineCustomField,
  type TimelineEvent,
  type TimelineEventInput,
  type TimelineImportance,
  type TimelineLine,
  type TimelineProfile,
  type TimelineProfileGroup,
  type TimelineTemplate,
  type WorldbookEntry,
} from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { CenterState, ViewShell } from "./common.js";
import { ProjectSelector } from "./ProjectSelector.js";

type EditorMode = "create" | "edit";
type TimelineLineFilter = "all" | TimelineLine;
type FieldDef = { key: string; label: string; multiline?: boolean };
type GroupDef = {
  id: TimelineProfileGroup;
  title: string;
  description?: string;
  defaultOpen: boolean;
  fields: FieldDef[];
};

const DEFAULT_PROJECT_ID = "demo-series";

const LINE_OPTIONS: Array<{ id: TimelineLineFilter; label: string; hint: string }> = [
  { id: "all", label: "全部线", hint: "查看当前项目的所有事件" },
  { id: "main", label: "主线", hint: "推动小说核心剧情的关键事件" },
  { id: "character", label: "角色线", hint: "角色成长、转折和状态变化" },
  { id: "relation", label: "关系线", hint: "人物关系建立、升级或破裂" },
  { id: "world", label: "世界线", hint: "世界观、势力格局和大环境变化" },
  { id: "canon", label: "原作线", hint: "同人作品中对应原作事实或节点" },
  { id: "branch", label: "支线", hint: "非主线但会影响体验的事件" },
  { id: "chapter", label: "章节线", hint: "按章节落点整理的写作事件" },
];

const EDITABLE_LINES = LINE_OPTIONS.filter((line): line is { id: TimelineLine; label: string; hint: string } => line.id !== "all");

const IMPORTANCE_OPTIONS: Array<{ id: TimelineImportance; label: string }> = [
  { id: "core", label: "核心" },
  { id: "important", label: "重要" },
  { id: "minor", label: "次要" },
];

const GROUPS: GroupDef[] = [
  {
    id: "basic",
    title: "基本信息",
    defaultOpen: true,
    fields: [],
  },
  {
    id: "content",
    title: "事件内容",
    defaultOpen: true,
    fields: [
      { key: "cause", label: "起因/背景", multiline: true },
      { key: "development", label: "经过/发展", multiline: true },
      { key: "result", label: "结果/影响", multiline: true },
      { key: "turningPoint", label: "关键转折", multiline: true },
      { key: "conflict", label: "涉及的冲突", multiline: true },
    ],
  },
  {
    id: "relations",
    title: "关联",
    defaultOpen: true,
    fields: [
      { key: "previousEvents", label: "前置事件", multiline: true },
      { key: "nextEvents", label: "后续事件", multiline: true },
      { key: "boundChapters", label: "绑定章节", multiline: true },
    ],
  },
  {
    id: "writing",
    title: "写作参考",
    description: "这些字段不必每条都填，适合记录写作时需要提醒自己的处理方式。",
    defaultOpen: false,
    fields: [
      { key: "mood", label: "氛围/基调", multiline: true },
      { key: "foreshadowing", label: "伏笔/铺垫", multiline: true },
      { key: "writingNotes", label: "写作注意点", multiline: true },
      { key: "canonSource", label: "原作出处", multiline: true },
    ],
  },
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

function linesToArray(text: string): string[] {
  return text.split(/\r?\n|,/).map((line) => line.trim()).filter(Boolean);
}

function arrayToLines(values: string[] | undefined): string {
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
  return LINE_OPTIONS.find((option) => option.id === line)?.label ?? "主线";
}

function lineHint(line?: string): string {
  return LINE_OPTIONS.find((option) => option.id === line)?.hint ?? "推动小说核心剧情的关键事件";
}

function importanceLabel(importance?: string): string {
  return IMPORTANCE_OPTIONS.find((option) => option.id === importance)?.label ?? "未标注";
}

function eventSummary(event: TimelineEvent): string {
  return event.summary?.trim() || event.description?.trim().slice(0, 90) || event.profile?.content?.result?.trim().slice(0, 90) || "尚未填写简介";
}

function createEmptyProfile(template: TimelineTemplate): TimelineProfile {
  return {
    template,
    basic: {},
    content: {},
    relations: {},
    writing: {},
    custom: {
      basic: [],
      content: [],
      relations: [],
      writing: [],
    },
  };
}

function createDraft(line: TimelineLine, template: TimelineTemplate, event?: TimelineEvent): TimelineEventInput {
  const profile = {
    ...createEmptyProfile(template),
    ...(event?.profile ?? {}),
    template: event?.template ?? event?.profile?.template ?? template,
  };
  return {
    id: event?.id ?? "",
    title: event?.title ?? "",
    line: event?.line ?? line,
    order: event?.order ?? 0,
    template: profile.template ?? template,
    importance: event?.importance,
    eventDate: event?.eventDate ?? "",
    summary: event?.summary ?? "",
    description: event?.description ?? "",
    location: event?.location ?? "",
    relatedWorldbook: event?.relatedWorldbook ?? [],
    previousEvents: event?.previousEvents ?? [],
    nextEvents: event?.nextEvents ?? [],
    profile,
    custom: event?.custom ?? [],
    boundChapters: event?.boundChapters ?? [],
    participants: event?.participants ?? [],
    stateSnapshotRef: event?.stateSnapshotRef ?? null,
  };
}

function sortEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((left, right) =>
    (left.order ?? 0) - (right.order ?? 0)
    || String(left.eventDate ?? "").localeCompare(String(right.eventDate ?? ""), "zh-Hans-CN")
    || left.title.localeCompare(right.title, "zh-Hans-CN"),
  );
}

function profileSearchText(event: TimelineEvent): string {
  return JSON.stringify({
    profile: event.profile,
    custom: event.custom,
    relatedWorldbook: event.relatedWorldbook,
    previousEvents: event.previousEvents,
    nextEvents: event.nextEvents,
  });
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
      profileSearchText(event),
    ].join(" ").toLowerCase().includes(normalized),
  );
}

function customRows(profile: TimelineProfile | undefined, group: TimelineProfileGroup): TimelineCustomField[] {
  return profile?.custom?.[group] ?? [];
}

function TemplateChooser({
  onChoose,
  onCancel,
}: {
  onChoose(template: TimelineTemplate): void;
  onCancel(): void;
}) {
  return (
    <div className="vault-modal-backdrop character-modal-backdrop" onMouseDown={onCancel}>
      <div className="vault-modal character-template-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head compact">
          <div>
            <h2>新建时间线事件</h2>
            <p>精简版记录发生了什么，详细版补全因果、关联和写作参考。</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="character-template-grid">
          <button type="button" className="character-template-card" onClick={() => onChoose("simple")}>
            <Sparkles size={22} />
            <strong>精简版</strong>
            <span>标题、线类型、发生时间、简介和重要程度，快速搭建时序骨架。</span>
          </button>
          <button type="button" className="character-template-card" onClick={() => onChoose("detailed")}>
            <BookOpen size={22} />
            <strong>详细版</strong>
            <span>按基本信息、事件内容、关联和写作参考分块整理完整事件。</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomFieldsEditor({
  rows,
  onChange,
}: {
  rows: TimelineCustomField[];
  onChange(rows: TimelineCustomField[]): void;
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

function CheckboxMultiSelect<T extends { id: string; label: string }>({
  emptyText,
  options,
  selected,
  onChange,
}: {
  emptyText: string;
  options: T[];
  selected: string[];
  onChange(next: string[]): void;
}) {
  if (options.length === 0) {
    return <div className="muted-box">{emptyText}</div>;
  }

  return (
    <div className="worldbook-character-picker">
      {options.map((option) => {
        const checked = selected.includes(option.id);
        return (
          <label className={checked ? "selected" : ""} key={option.id}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => {
                onChange(event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id));
              }}
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function TimelineEditor({
  mode,
  value,
  characters,
  worldbookEntries,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  mode: EditorMode;
  value: TimelineEventInput;
  characters: Character[];
  worldbookEntries: WorldbookEntry[];
  saving: boolean;
  error: string | null;
  onChange(next: TimelineEventInput): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const profile = value.profile ?? createEmptyProfile(value.template ?? "simple");
  const isDetailed = (value.template ?? profile.template ?? "simple") === "detailed";
  const [expanded, setExpanded] = useState<Record<TimelineProfileGroup, boolean>>(() =>
    GROUPS.reduce((result, group) => ({ ...result, [group.id]: group.defaultOpen }), {} as Record<TimelineProfileGroup, boolean>),
  );

  const characterOptions = characters.map((character) => ({ id: character.id, label: character.name }));
  const worldbookOptions = worldbookEntries.map((entry) => ({ id: entry.id, label: entry.name || entry.title }));

  const updateProfile = (nextProfile: TimelineProfile) => {
    onChange({ ...value, profile: nextProfile, template: nextProfile.template ?? value.template });
  };

  const updateGroupField = (group: TimelineProfileGroup, key: string, text: string) => {
    updateProfile({
      ...profile,
      [group]: {
        ...(profile[group] ?? {}),
        [key]: text,
      },
    });
  };

  const updateCustom = (group: TimelineProfileGroup, rows: TimelineCustomField[]) => {
    updateProfile({
      ...profile,
      custom: {
        ...(profile.custom ?? {}),
        [group]: rows,
      },
    });
  };

  const renderField = (group: TimelineProfileGroup, field: FieldDef) => {
    const current = profile[group]?.[field.key] ?? "";
    return (
      <label className="form-block" key={`${group}-${field.key}`}>
        <span>{field.label}</span>
        {field.multiline ? (
          <textarea className="textarea" value={current} onChange={(event) => updateGroupField(group, field.key, event.target.value)} />
        ) : (
          <input className="input" value={current} onChange={(event) => updateGroupField(group, field.key, event.target.value)} />
        )}
      </label>
    );
  };

  const renderGroup = (group: GroupDef, compact: boolean) => (
    <div className="character-field-stack">
      {group.description ? <p className="worldbook-group-desc">{group.description}</p> : null}
      {group.fields.length > 0 ? <div className={compact ? "form-grid" : "character-field-grid"}>{group.fields.map((field) => renderField(group.id, field))}</div> : null}
      <CustomFieldsEditor rows={customRows(profile, group.id)} onChange={(rows) => updateCustom(group.id, rows)} />
    </div>
  );

  return (
    <div className="vault-modal-backdrop character-modal-backdrop" onMouseDown={onCancel}>
      <div className="vault-modal character-modal timeline-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head">
          <div>
            <h2>{mode === "create" ? "新建时间线事件" : `编辑事件 · ${value.title}`}</h2>
            <p>{isDetailed ? "详细版按分块整理因果、关联和写作参考。" : "精简版只保留最常用的时序信息。"}</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="character-modal-body">
          {error ? <div className="err-card">保存失败：{error}</div> : null}
          <section className="agent-editor-section">
            <div className="model-editor-section-title">核心信息</div>
            <div className="form-grid form-grid-3">
              <label className="form-block">
                <span>事件标题</span>
                <input className="input" value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} />
              </label>
              <label className="form-block">
                <span>线类型</span>
                <select className="input" value={value.line} onChange={(event) => onChange({ ...value, line: event.target.value as TimelineLine })}>
                  {EDITABLE_LINES.map((line) => <option value={line.id} key={line.id}>{line.label}：{line.hint}</option>)}
                </select>
              </label>
              <label className="form-block">
                <span>发生时间</span>
                <input className="input" value={value.eventDate ?? ""} onChange={(event) => onChange({ ...value, eventDate: event.target.value })} placeholder="第3章 / 开篇前 / 某年某月" />
              </label>
            </div>
            <div className="form-grid form-grid-3">
              <label className="form-block">
                <span>时间排序</span>
                <input className="input" type="number" value={String(value.order ?? 0)} onChange={(event) => onChange({ ...value, order: Number.parseInt(event.target.value, 10) || 0 })} />
              </label>
              <label className="form-block">
                <span>地点</span>
                <input className="input" value={value.location ?? ""} onChange={(event) => onChange({ ...value, location: event.target.value })} />
              </label>
              <label className="form-block">
                <span>重要程度</span>
                <select className="input" value={value.importance ?? ""} onChange={(event) => onChange({ ...value, importance: (event.target.value || undefined) as TimelineImportance | undefined })}>
                  <option value="">未标注</option>
                  {IMPORTANCE_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <label className="form-block">
              <span>一句话简介</span>
              <input className="input" value={value.summary ?? ""} onChange={(event) => onChange({ ...value, summary: event.target.value })} />
            </label>
            {isDetailed ? (
              <label className="form-block">
                <span>详细描述</span>
                <textarea className="textarea timeline-description" value={value.description ?? ""} onChange={(event) => onChange({ ...value, description: event.target.value })} />
              </label>
            ) : null}
          </section>

          {isDetailed ? (
            <div className="character-accordion">
              {GROUPS.map((group) => {
                const open = Boolean(expanded[group.id]);
                return (
                  <section className="character-accordion-item" key={group.id}>
                    <button type="button" className="character-accordion-head" onClick={() => setExpanded((current) => ({ ...current, [group.id]: !open }))}>
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span>{group.title}</span>
                    </button>
                    {open ? (
                      <div className="character-accordion-body">
                        {group.id === "relations" ? (
                          <div className="character-field-stack">
                            <label className="form-block">
                              <span>参与角色</span>
                              <CheckboxMultiSelect
                                emptyText="当前项目还没有角色。参与角色可先留空。"
                                options={characterOptions}
                                selected={value.participants ?? []}
                                onChange={(next) => onChange({ ...value, participants: next })}
                              />
                            </label>
                            <label className="form-block">
                              <span>相关地点/设定</span>
                              <CheckboxMultiSelect
                                emptyText="当前项目还没有世界大纲条目。相关设定可先留空。"
                                options={worldbookOptions}
                                selected={value.relatedWorldbook ?? []}
                                onChange={(next) => onChange({ ...value, relatedWorldbook: next })}
                              />
                            </label>
                            {renderGroup(group, false)}
                          </div>
                        ) : renderGroup(group, false)}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : (
            <section className="info-card character-simple-section">
              <h3>自定义补充字段</h3>
              <CustomFieldsEditor rows={customRows(profile, "basic")} onChange={(rows) => updateCustom("basic", rows)} />
            </section>
          )}
        </div>
        <div className="agent-modal-actions view-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={saving || !value.title.trim()}>
            <Save size={15} />
            {saving ? "保存中..." : "保存事件"}
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
  const [characters, setCharacters] = useState<Character[]>([]);
  const [worldbookEntries, setWorldbookEntries] = useState<WorldbookEntry[]>([]);
  const [search, setSearch] = useState("");
  const [lineFilter, setLineFilter] = useState<TimelineLineFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaultMissing, setVaultMissing] = useState(false);
  const [templateChoosing, setTemplateChoosing] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [draft, setDraft] = useState<TimelineEventInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TimelineEvent | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

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
        setCharacters([]);
        setWorldbookEntries([]);
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
      const [nextEvents, nextCharacters, nextWorldbook] = resolvedProjectId
        ? await Promise.all([
          api.listTimelineByProject(resolvedProjectId),
          api.listCharactersByProject(resolvedProjectId),
          api.listWorldbookByProject(resolvedProjectId),
        ])
        : [[], [], []];
      setProjects(nextProjects);
      setEvents(sortEvents(nextEvents));
      setCharacters(nextCharacters);
      setWorldbookEntries(nextWorldbook);
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

  const createLine: TimelineLine = lineFilter === "all" ? "main" : lineFilter;

  const startCreate = (template: TimelineTemplate) => {
    setTemplateChoosing(false);
    setFeedback(null);
    setDraft(createDraft(createLine, template));
    setEditorMode("create");
    setSaveError(null);
  };

  const startEdit = (event: TimelineEvent) => {
    setFeedback(null);
    setDraft(createDraft(event.line ?? "main", event.template ?? event.profile?.template ?? "simple", event));
    setEditorMode("edit");
    setSaveError(null);
  };

  const persist = async () => {
    if (!draft) {
      return;
    }
    const title = draft.title.trim();
    if (!title) {
      setSaveError("事件标题不能为空");
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
        template: draft.template ?? draft.profile?.template ?? "simple",
        relatedWorldbook: draft.relatedWorldbook ?? [],
        previousEvents: linesToArray(draft.profile?.relations?.previousEvents ?? arrayToLines(draft.previousEvents)),
        nextEvents: linesToArray(draft.profile?.relations?.nextEvents ?? arrayToLines(draft.nextEvents)),
        boundChapters: linesToArray(draft.profile?.relations?.boundChapters ?? arrayToLines(draft.boundChapters)),
        participants: draft.participants ?? [],
        custom: draft.custom ?? [],
        profile: {
          ...(draft.profile ?? createEmptyProfile(draft.template ?? "simple")),
          template: draft.template ?? draft.profile?.template ?? "simple",
        },
      };
      if (editorMode === "create") {
        await api.createTimelineEvent(projectId, payload);
      } else {
        await api.updateTimelineEvent(projectId, payload.id, payload);
      }
      setEditorMode(null);
      setDraft(null);
      setLineFilter(payload.line || lineFilter);
      setFeedback({ kind: "success", text: "时间线事件已保存" });
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
      setFeedback({ kind: "success", text: "时间线事件已删除" });
      await loadData(projectId);
    } catch (deleteError) {
      setFeedback({ kind: "error", text: deleteError instanceof ApiError ? deleteError.message : "删除事件失败" });
    }
  };

  const showState = loading || error !== null || vaultMissing || filteredEvents.length === 0;

  return (
    <ViewShell
      title="时间线"
      subtitle="按项目整理主线、角色线、关系线、世界线和章节落点。"
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
          <button type="button" className="btn btn-primary" onClick={() => setTemplateChoosing(true)} disabled={!projectId || vaultMissing || projects.length === 0}>
            <Plus size={15} />
            新建事件
          </button>
        </>
      }
    >
      <div className="toolbar-row">
        <div className="search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索事件、角色、章节、地点或设定..." />
        </div>
        <span className="grow" />
        <span className="faint">共 {filteredEvents.length} / {events.length} 个事件</span>
      </div>
      {feedback ? <div className={feedback.kind === "success" ? "character-assist-success" : "err-card"}>{feedback.text}</div> : null}
      <div className="worldbook-origin-tabs timeline-line-tabs">
        {LINE_OPTIONS.map((line) => (
          <button type="button" key={line.id} className={lineFilter === line.id ? "active" : ""} onClick={() => setLineFilter(line.id)}>
            {line.label}
          </button>
        ))}
      </div>
      {lineFilter !== "all" ? <p className="timeline-line-hint">{lineHint(lineFilter)}</p> : null}

      {showState ? (
        <CenterState
          loading={loading}
          error={error}
          vaultMissing={vaultMissing}
          empty={filteredEvents.length === 0}
          emptyText={search ? "没有找到匹配的事件" : "还没有时间线事件，点右上角「新建事件」开始整理。"}
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
                      {event.importance ? <span className="tag">{importanceLabel(event.importance)}</span> : null}
                      <span className="tag">{event.template === "detailed" || event.profile?.template === "detailed" ? "详细版" : "精简版"}</span>
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
                  <span className="tag"><Clock3 size={12} />排序 {event.order ?? 0}</span>
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

      {templateChoosing ? (
        <TemplateChooser
          onChoose={startCreate}
          onCancel={() => setTemplateChoosing(false)}
        />
      ) : null}

      {editorMode && draft ? (
        <TimelineEditor
          mode={editorMode}
          value={draft}
          characters={characters}
          worldbookEntries={worldbookEntries}
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
