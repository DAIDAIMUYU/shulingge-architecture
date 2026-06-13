import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BookOpen, ChevronDown, ChevronRight, Clock3, GitBranch, MapPin, Plus, Save, Search, Sparkles, Trash2, Users, X } from "lucide-react";

import {
  api,
  ApiError,
  type AssistTimelineField,
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
import { CenterState, showToast, ViewShell } from "./common.js";
import { ProjectSelector } from "./ProjectSelector.js";
import { Select } from "./Select.js";

type EditorMode = "create" | "edit";
type AssistMode = "original" | "fanfic";
type TimelineLineFilter = "all" | TimelineLine;
type FieldDef = { key: string; label: string; multiline?: boolean };
type GroupDef = {
  id: TimelineProfileGroup;
  title: string;
  description?: string;
  defaultOpen: boolean;
  fields: FieldDef[];
};
interface TimelineAssistField extends AssistTimelineField {
  custom?: boolean;
  profileGroup?: TimelineProfileGroup;
}

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

function normalizeProfile(profile?: TimelineProfile, template: TimelineTemplate = "simple"): TimelineProfile {
  const base = createEmptyProfile(profile?.template ?? template);
  return {
    ...base,
    ...profile,
    basic: { ...base.basic, ...profile?.basic },
    content: { ...base.content, ...profile?.content },
    relations: { ...base.relations, ...profile?.relations },
    writing: { ...base.writing, ...profile?.writing },
    custom: {
      ...base.custom,
      ...profile?.custom,
    },
  };
}

function createDraft(line: TimelineLine, template: TimelineTemplate, event?: TimelineEvent): TimelineEventInput {
  const profile = normalizeProfile(event?.profile, event?.template ?? event?.profile?.template ?? template);
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

function collectAssistFields(profile: TimelineProfile, draft: TimelineEventInput): TimelineAssistField[] {
  const normalized = normalizeProfile(profile, draft.template ?? profile.template ?? "simple");
  const detailed = normalized.template === "detailed";
  const fields: TimelineAssistField[] = [
    { group: "核心信息", key: "title", label: "事件标题" },
    { group: "核心信息", key: "line", label: "线类型" },
    { group: "核心信息", key: "eventDate", label: "发生时间" },
    { group: "核心信息", key: "order", label: "时间排序" },
    { group: "核心信息", key: "location", label: "地点" },
    { group: "核心信息", key: "summary", label: "一句话简介" },
    { group: "核心信息", key: "description", label: "详细描述" },
    { group: "核心信息", key: "importance", label: "重要程度" },
  ];

  if (detailed) {
    for (const group of GROUPS) {
      for (const field of group.fields) {
        fields.push({
          group: group.title,
          key: field.key,
          label: field.label,
          profileGroup: group.id,
        });
      }

      for (const row of normalized.custom?.[group.id] ?? []) {
        const label = row.label?.trim();
        if (label) {
          fields.push({
            group: group.title,
            key: label,
            label,
            custom: true,
            profileGroup: group.id,
          });
        }
      }
    }
  } else {
    for (const row of normalized.custom?.basic ?? []) {
      const label = row.label?.trim();
      if (label) {
        fields.push({
          group: "自定义补充字段",
          key: label,
          label,
          custom: true,
          profileGroup: "basic",
        });
      }
    }
  }

  return fields;
}

function collectExistingValues(draft: TimelineEventInput, profile: TimelineProfile, fields: TimelineAssistField[]): Record<string, string> {
  const normalized = normalizeProfile(profile, draft.template ?? profile.template ?? "simple");
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (field.custom && field.profileGroup) {
      const row = normalized.custom?.[field.profileGroup]?.find((item) => item.label?.trim() === field.label);
      values[field.key] = row?.value?.trim() ?? "";
      continue;
    }

    if (field.profileGroup) {
      values[field.key] = normalized[field.profileGroup]?.[field.key]?.trim() ?? "";
      continue;
    }

    if (field.key === "line") {
      values[field.key] = lineLabel(draft.line);
    } else if (field.key === "order") {
      values[field.key] = String(draft.order ?? "");
    } else {
      values[field.key] = typeof draft[field.key as keyof TimelineEventInput] === "string"
        ? String(draft[field.key as keyof TimelineEventInput]).trim()
        : "";
    }
  }
  return values;
}

function mergeAssistFields(draft: TimelineEventInput, fields: TimelineAssistField[], generated: Record<string, string>): TimelineEventInput {
  let next: TimelineEventInput = {
    ...draft,
    profile: normalizeProfile(draft.profile, draft.template ?? "simple"),
  };

  for (const field of fields) {
    const generatedValue = (generated[field.key] ?? generated[field.label])?.trim();
    if (!generatedValue) {
      continue;
    }

    if (field.custom && field.profileGroup) {
      const profile = normalizeProfile(next.profile, next.template ?? "simple");
      const rows = [...(profile.custom?.[field.profileGroup] ?? [])];
      const rowIndex = rows.findIndex((row) => row.label?.trim() === field.label);
      if (rowIndex >= 0 && !rows[rowIndex].value?.trim()) {
        rows[rowIndex] = { ...rows[rowIndex], value: generatedValue };
        next = {
          ...next,
          profile: {
            ...profile,
            custom: { ...profile.custom, [field.profileGroup]: rows },
          },
        };
      }
      continue;
    }

    if (field.profileGroup) {
      const profile = normalizeProfile(next.profile, next.template ?? "simple");
      const currentValue = profile[field.profileGroup]?.[field.key]?.trim();
      if (!currentValue) {
        next = {
          ...next,
          profile: {
            ...profile,
            [field.profileGroup]: {
              ...(profile[field.profileGroup] ?? {}),
              [field.key]: generatedValue,
            },
          },
        };
      }
      continue;
    }

    if (field.key === "title" && !next.title.trim()) {
      next = { ...next, title: generatedValue };
    } else if (field.key === "eventDate" && !next.eventDate?.trim()) {
      next = { ...next, eventDate: generatedValue };
    } else if (field.key === "location" && !next.location?.trim()) {
      next = { ...next, location: generatedValue };
    } else if (field.key === "summary" && !next.summary?.trim()) {
      next = { ...next, summary: generatedValue };
    } else if (field.key === "description" && !next.description?.trim()) {
      next = { ...next, description: generatedValue };
    }
  }

  return next;
}

function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    setSeconds(0);
    const timer = window.setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return seconds;
}

function TemplateChooser({
  onChoose,
  onAiGenerate,
  onCancel,
}: {
  onChoose(template: TimelineTemplate): void;
  onAiGenerate(): void;
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
          <button type="button" className="character-template-card character-template-card-wide" onClick={onAiGenerate}>
            <Sparkles size={22} />
            <strong>AI 生成</strong>
            <span>通过几步问答生成一个时间线事件草稿，再进入编辑器检查和保存。</span>
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

function TimelineAssistModal({
  loading,
  error,
  onCancel,
  onSubmit,
}: {
  loading: boolean;
  error: string | null;
  onCancel(): void;
  onSubmit(input: { mode: AssistMode; userPrompt: string; eventName?: string; sourceWork?: string; scopeInstruction?: string }): void;
}) {
  const [mode, setMode] = useState<AssistMode>("original");
  const [userPrompt, setUserPrompt] = useState("");
  const [eventName, setEventName] = useState("");
  const [sourceWork, setSourceWork] = useState("");
  const [scopeInstruction, setScopeInstruction] = useState("");
  const elapsedSeconds = useElapsedSeconds(loading);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const prompt = userPrompt.trim();
    const name = eventName.trim();
    const work = sourceWork.trim();
    if (loading || (mode === "original" ? !prompt : (!name || !work))) {
      return;
    }
    onSubmit({
      mode,
      userPrompt: mode === "fanfic" ? [name, work, prompt].filter(Boolean).join("\n") : prompt,
      eventName: name,
      sourceWork: work,
      scopeInstruction: scopeInstruction.trim(),
    });
  };

  return (
    <div
      className="vault-modal-backdrop"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (!loading) {
          onCancel();
        }
      }}
    >
      <form className="vault-modal character-assist-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head compact">
          <div>
            <h2>AI 辅助填充</h2>
            <p>AI 会读取当前时间线模板字段和自定义字段，只把生成内容填进空字段，保存前仍可修改。</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} disabled={loading} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="character-assist-mode">
          <button type="button" className={mode === "original" ? "active" : ""} onClick={() => setMode("original")} disabled={loading}>
            原创
          </button>
          <button type="button" className={mode === "fanfic" ? "active" : ""} onClick={() => setMode("fanfic")} disabled={loading}>
            同人
          </button>
        </div>

        <label className="form-block">
          <span>{mode === "fanfic" ? "补充要求" : "想要一个什么样的事件"}</span>
          {mode === "fanfic" ? (
            <div className="form-grid form-grid-2 character-assist-fanfic-grid">
              <label className="form-block">
                <span>事件名</span>
                <input className="input" value={eventName} placeholder="例如：无限列车事件" onChange={(event) => setEventName(event.target.value)} disabled={loading} />
              </label>
              <label className="form-block">
                <span>来源作品</span>
                <input className="input" value={sourceWork} placeholder="例如：鬼灭之刃" onChange={(event) => setSourceWork(event.target.value)} disabled={loading} />
              </label>
            </div>
          ) : null}
          <textarea
            className="textarea character-assist-prompt"
            value={userPrompt}
            placeholder={mode === "fanfic" ? "可选：只填起因和影响，或补充这个同人事件的改编方向" : "例如：主角第一次发现师门隐藏真相的事件，表面是试炼，实际是一次清洗"}
            onChange={(event) => setUserPrompt(event.target.value)}
            disabled={loading}
          />
        </label>
        <label className="form-block">
          <span>指定填充范围</span>
          <input
            className="input"
            value={scopeInstruction}
            placeholder="可选：例如只填事件内容，或只填写作参考；留空则填所有空字段"
            onChange={(event) => setScopeInstruction(event.target.value)}
            disabled={loading}
          />
        </label>

        {mode === "fanfic" ? (
          <div className="character-assist-note">同人资料由 AI 依据其训练知识生成，可能不准确；不确定字段会尽量留空，请自行核对。</div>
        ) : null}
        {loading ? <div className="character-assist-note">正在生成…（已用 {elapsedSeconds} 秒）</div> : null}
        {error ? <div className="err-card">{error}</div> : null}

        <div className="vault-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading || (mode === "original" ? !userPrompt.trim() : (!eventName.trim() || !sourceWork.trim()))}>
            <Sparkles size={15} />
            {loading ? `生成中...${elapsedSeconds}s` : "开始填充"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TimelineAiCreateModal({
  projectId,
  loading,
  error,
  onCancel,
  onGenerate,
}: {
  projectId: string;
  loading: boolean;
  error: string | null;
  onCancel(): void;
  onGenerate(input: { mode: AssistMode; template: TimelineTemplate; line: TimelineLine; userPrompt: string; extraAnswer: string; eventName?: string; sourceWork?: string }): void;
}) {
  const [mode, setMode] = useState<AssistMode | null>(null);
  const [userPrompt, setUserPrompt] = useState("");
  const [eventName, setEventName] = useState("");
  const [sourceWork, setSourceWork] = useState("");
  const [template, setTemplate] = useState<TimelineTemplate>("simple");
  const [line, setLine] = useState<TimelineLine>("main");
  const [extraAnswer, setExtraAnswer] = useState("");
  const elapsedSeconds = useElapsedSeconds(loading);

  const fanficReady = Boolean(eventName.trim() && sourceWork.trim());
  const originalReady = Boolean(userPrompt.trim() && extraAnswer.trim());
  const canGenerate = Boolean(mode && (mode === "fanfic" ? fanficReady : originalReady));
  const step = !mode ? 1 : mode === "fanfic" ? (fanficReady ? 4 : 2) : !userPrompt.trim() ? 2 : !extraAnswer.trim() ? 3 : 4;

  return (
    <div className="vault-modal-backdrop" onMouseDown={loading ? undefined : onCancel}>
      <div className="vault-modal character-ai-create-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head compact">
          <div>
            <h2>AI 生成时间线事件</h2>
            <p>回答几步问题后，AI 会生成一条时间线事件草稿并打开编辑器，保存前可继续修改。</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} disabled={loading} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="character-ai-chat">
          <div className="character-ai-message ai">先告诉我，这是原创事件还是同人/原作事件？</div>
          <div className="character-assist-mode">
            <button type="button" className={mode === "original" ? "active" : ""} onClick={() => setMode("original")} disabled={loading}>
              原创事件
            </button>
            <button type="button" className={mode === "fanfic" ? "active" : ""} onClick={() => setMode("fanfic")} disabled={loading}>
              同人事件
            </button>
          </div>

          {mode ? (
            <>
              <div className="character-ai-message ai">这条事件属于哪条线？</div>
              <Select
                value={line}
                options={EDITABLE_LINES.map((option) => ({ value: option.id, label: option.label, hint: option.hint }))}
                onChange={(nextValue) => setLine(nextValue as TimelineLine)}
                disabled={loading}
                ariaLabel="时间线线类型"
              />
            </>
          ) : null}

          {mode === "original" ? (
            <>
              <div className="character-ai-message ai">用一句话描述你想要的事件方向。</div>
              <textarea
                className="textarea character-assist-prompt"
                value={userPrompt}
                placeholder="例如：主角误入禁地后救下敌方少年，这件事后来导致两派停战谈判破裂"
                onChange={(event) => setUserPrompt(event.target.value)}
                disabled={loading}
              />
            </>
          ) : null}
          {mode === "fanfic" ? (
            <>
              <div className="character-ai-message ai">分别写清楚事件名和来源作品，避免 AI 混淆。</div>
              <div className="form-grid form-grid-2 character-assist-fanfic-grid">
                <label className="form-block">
                  <span>事件名</span>
                  <input className="input" value={eventName} placeholder="例如：那田蜘蛛山事件" onChange={(event) => setEventName(event.target.value)} disabled={loading} />
                </label>
                <label className="form-block">
                  <span>来源作品</span>
                  <input className="input" value={sourceWork} placeholder="例如：鬼灭之刃" onChange={(event) => setSourceWork(event.target.value)} disabled={loading} />
                </label>
              </div>
            </>
          ) : null}

          {(mode === "original" ? userPrompt.trim() : fanficReady) ? (
            <>
              <div className="character-ai-message ai">这条时间线事件需要精简版还是详细版？</div>
              <div className="character-assist-mode">
                <button type="button" className={template === "simple" ? "active" : ""} onClick={() => setTemplate("simple")} disabled={loading}>
                  精简版
                </button>
                <button type="button" className={template === "detailed" ? "active" : ""} onClick={() => setTemplate("detailed")} disabled={loading}>
                  详细版
                </button>
              </div>
            </>
          ) : null}

          {mode === "original" && userPrompt.trim() ? (
            <>
              <div className="character-ai-message ai">再补一句：这个事件的关键转折点，或它对剧情造成的影响是什么？</div>
              <textarea
                className="textarea character-ai-extra"
                value={extraAnswer}
                placeholder="例如：转折是主角选择隐瞒真相，影响是他从此失去师兄信任。"
                onChange={(event) => setExtraAnswer(event.target.value)}
                disabled={loading}
              />
            </>
          ) : null}

          {mode === "fanfic" && fanficReady ? (
            <div className="character-assist-note">同人资料由 AI 依据其训练知识生成，可能不准确；不确定字段会尽量留空，请自行核对。</div>
          ) : null}
          {loading ? <div className="character-assist-note">正在生成…（已用 {elapsedSeconds} 秒）</div> : null}
        </div>

        {error ? <div className="err-card">{error}</div> : null}
        <div className="vault-modal-actions">
          <span className="faint">步骤 {step} / 4</span>
          <span className="grow" />
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || !canGenerate || !projectId}
            onClick={() => {
              if (mode) {
                onGenerate({
                  mode,
                  template,
                  line,
                  userPrompt: mode === "fanfic" ? `${eventName.trim()}，${sourceWork.trim()}` : userPrompt.trim(),
                  extraAnswer: extraAnswer.trim(),
                  eventName: eventName.trim(),
                  sourceWork: sourceWork.trim(),
                });
              }
            }}
          >
            <Sparkles size={15} />
            {loading ? `生成中...${elapsedSeconds}s` : "生成事件草稿"}
          </button>
        </div>
      </div>
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
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assistNotice, setAssistNotice] = useState<string | null>(null);
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

  const runAssist = async (input: { mode: AssistMode; userPrompt: string; eventName?: string; sourceWork?: string; scopeInstruction?: string }) => {
    const normalizedProfile = normalizeProfile(profile, value.template ?? "simple");
    const fields = collectAssistFields(normalizedProfile, value);
    if (!fields.length) {
      setAssistError("当前没有可填充的字段。");
      return;
    }

    setAssistLoading(true);
    setAssistError(null);
    setAssistNotice(null);
    try {
      const response = await api.assistTimeline({
        mode: input.mode,
        userPrompt: input.userPrompt,
        eventName: input.eventName,
        sourceWork: input.sourceWork,
        scopeInstruction: input.scopeInstruction,
        template: value.template ?? normalizedProfile.template,
        line: lineLabel(value.line),
        fields: fields.map(({ group, key, label }) => ({ group, key, label })),
        existingValues: collectExistingValues(value, normalizedProfile, fields),
      });
      const nextDraft = mergeAssistFields({ ...value, profile: normalizedProfile }, fields, response.fields);
      onChange(nextDraft);
      setAssistOpen(false);
      setAssistNotice(
        input.mode === "fanfic"
          ? "AI 已填入空字段。同人资料可能不准确，请核对后再保存。"
          : "AI 已填入空字段，请检查后再保存时间线事件。",
      );
    } catch (assistErrorValue) {
      setAssistError(assistErrorValue instanceof ApiError ? assistErrorValue.message : "AI 辅助填充失败");
    } finally {
      setAssistLoading(false);
    }
  };

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
          {assistNotice ? <div className="character-assist-success">{assistNotice}</div> : null}
          <section className="agent-editor-section">
            <div className="model-editor-section-title">核心信息</div>
            <div className="form-grid form-grid-3">
              <label className="form-block">
                <span>事件标题</span>
                <input className="input" value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} />
              </label>
              <label className="form-block">
                <span>线类型</span>
                <Select
                  value={value.line}
                  options={EDITABLE_LINES.map((line) => ({ value: line.id, label: line.label, hint: line.hint }))}
                  onChange={(nextValue) => onChange({ ...value, line: nextValue as TimelineLine })}
                  ariaLabel="线类型"
                />
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
                <Select
                  value={value.importance ?? ""}
                  options={[
                    { value: "", label: "未标注" },
                    ...IMPORTANCE_OPTIONS.map((option) => ({ value: option.id, label: option.label })),
                  ]}
                  onChange={(nextValue) => onChange({ ...value, importance: (nextValue || undefined) as TimelineImportance | undefined })}
                  ariaLabel="重要程度"
                />
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
          <button
            type="button"
            className="btn"
            onClick={() => {
              setAssistOpen(true);
              setAssistError(null);
            }}
          >
            <Sparkles size={15} />
            AI 辅助填充
          </button>
          <span className="grow" />
          {assistOpen ? (
            <TimelineAssistModal
              loading={assistLoading}
              error={assistError}
              onCancel={() => {
                if (!assistLoading) {
                  setAssistOpen(false);
                  setAssistError(null);
                }
              }}
              onSubmit={(input) => {
                void runAssist(input);
              }}
            />
          ) : null}
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
  const [aiCreating, setAiCreating] = useState(false);
  const [aiCreateLoading, setAiCreateLoading] = useState(false);
  const [aiCreateError, setAiCreateError] = useState<string | null>(null);
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
    setDraft(createDraft(createLine, template));
    setEditorMode("create");
    setSaveError(null);
  };

  const generateTimelineDraft = async (input: { mode: AssistMode; template: TimelineTemplate; line: TimelineLine; userPrompt: string; extraAnswer: string; eventName?: string; sourceWork?: string }) => {
    const profile = createEmptyProfile(input.template);
    const baseDraft: TimelineEventInput = {
      ...createDraft(input.line, input.template),
      line: input.line,
      template: input.template,
      profile,
      title: input.eventName ?? "",
    };
    const fields = collectAssistFields(profile, baseDraft);
    const prompt = [
      input.userPrompt,
      input.mode === "original" && input.extraAnswer ? `关键补充：${input.extraAnswer}` : "",
    ].filter(Boolean).join("\n");

    setAiCreateLoading(true);
    setAiCreateError(null);
    try {
      const response = await api.assistTimeline({
        mode: input.mode,
        userPrompt: prompt,
        eventName: input.eventName,
        sourceWork: input.sourceWork,
        template: input.template,
        line: lineLabel(input.line),
        projectId,
        fields: fields.map(({ group, key, label }) => ({ group, key, label })),
        existingValues: collectExistingValues(baseDraft, profile, fields),
      });
      const nextDraft = mergeAssistFields(baseDraft, fields, response.fields);
      const title = nextDraft.title || response.fields.title || response.fields["事件标题"] || input.eventName || input.userPrompt.split(/[，。,\n]/)[0] || "";
      setDraft({
        ...nextDraft,
        title: title.slice(0, 48),
        line: input.line,
      });
      setAiCreating(false);
      setTemplateChoosing(false);
      setEditorMode("create");
      setSaveError(null);
      showToast(
        input.mode === "fanfic"
          ? "AI 已生成时间线事件草稿。同人资料可能不准确，请核对后再保存。"
          : "AI 已生成时间线事件草稿，请检查后再保存。",
        "success",
      );
    } catch (generateError) {
      setAiCreateError(generateError instanceof ApiError ? generateError.message : "AI 生成时间线事件失败");
    } finally {
      setAiCreateLoading(false);
    }
  };

  const startEdit = (event: TimelineEvent) => {
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
      const isCreate = editorMode === "create";
      if (isCreate) {
        await api.createTimelineEvent(projectId, payload);
      } else {
        await api.updateTimelineEvent(projectId, payload.id, payload);
      }
      setEditorMode(null);
      setDraft(null);
      setLineFilter(payload.line || lineFilter);
      showToast(isCreate ? "时间线事件已创建" : "时间线事件已保存", "success");
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
      showToast("时间线事件已删除", "success");
      await loadData(projectId);
    } catch (deleteError) {
      showToast(deleteError instanceof ApiError ? deleteError.message : "删除事件失败", "error");
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
          emptyTitle={search ? "没有匹配的事件" : "还没有时间线事件"}
          emptyText={search ? "换个关键词试试，或切换线类型查看其它事件。" : "先创建第一个事件，把主线、角色线和章节落点串起来。"}
          emptyActionLabel={search ? undefined : "新建第一个事件"}
          onEmptyAction={search ? undefined : () => setTemplateChoosing(true)}
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
          onAiGenerate={() => {
            setTemplateChoosing(false);
            setAiCreating(true);
            setAiCreateError(null);
          }}
          onCancel={() => setTemplateChoosing(false)}
        />
      ) : null}

      {aiCreating ? (
        <TimelineAiCreateModal
          projectId={projectId}
          loading={aiCreateLoading}
          error={aiCreateError}
          onCancel={() => {
            if (!aiCreateLoading) {
              setAiCreating(false);
              setAiCreateError(null);
            }
          }}
          onGenerate={(input) => {
            void generateTimelineDraft(input);
          }}
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
