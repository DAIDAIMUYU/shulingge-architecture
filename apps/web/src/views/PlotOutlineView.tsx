import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import {
  api,
  ApiError,
  type ChapterPlanInput,
  type ChapterPlanRecord,
  type KeyEventCustomField,
  type KeyEventInput,
  type KeyEventRecord,
  type NovelSummary,
  type PlotNoteCustomField,
  type PlotNoteInput,
  type PlotNoteRecord,
  type ProjectSummary,
  type TimelineEvent,
  type VolumeInput,
  type VolumeRecord,
  type VolumeStatus,
} from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { ProjectSelector } from "./ProjectSelector.js";
import { Select } from "./Select.js";
import { ViewShell } from "./common.js";

type FeedbackKind = "success" | "error" | "info";
type FeedbackState = { kind: FeedbackKind; message: string };
type PlotViewMode = "strip" | "table";
type PlotModuleTab = "volumes" | "chapterPlans" | "keyEvents" | "plotNotes";

interface VolumeDraft {
  title: string;
  status: VolumeStatus;
  positioning: string;
  themes: string;
  keyPoints: string;
  notes: string;
}

interface ChapterPlanDraft {
  title: string;
  volumeId: string;
  summary: string;
}

interface KeyEventDraft {
  title: string;
  positioning: string;
  prerequisites: string;
  flow: string;
  relationChanges: string;
  forbidden: string;
  customFields: KeyEventCustomField[];
  volumeId: string;
  chapterPlanId: string;
  timelineId: string;
}

interface PlotNoteDraft {
  title: string;
  category: string;
  content: string;
  customFields: PlotNoteCustomField[];
}

const PROJECT_STORAGE_KEY = "shulingge.web.plotOutline.projectId";
const VIEW_STORAGE_KEY = "shulingge.web.plotOutline.viewMode";
const NO_VOLUME = "__none__";
const NO_REFERENCE = "__none__";
const ALL_NOTE_CATEGORIES = "__all__";
const PLOT_NOTE_CATEGORIES = ["角色弧线", "伏笔回收", "冲突节奏", "高光场景"];
const PLOT_MODULE_TABS: Array<{ id: PlotModuleTab; label: string; description: string; createLabel: string }> = [
  { id: "volumes", label: "分卷大纲", description: "规划卷级定位、主题和重点。", createLabel: "新建分卷" },
  { id: "chapterPlans", label: "章节规划", description: "整理章节规划标题、归属分卷和梗概。", createLabel: "新建章节规划" },
  { id: "keyEvents", label: "关键事件", description: "设计事件定位、流程、关系变化和禁止写法。", createLabel: "新建关键事件" },
  { id: "plotNotes", label: "剧情笔记", description: "按分类整理角色弧线、伏笔回收、冲突节奏和高光场景。", createLabel: "新建剧情笔记" },
];

const STATUS_OPTIONS: Array<{ value: VolumeStatus; label: string; hint: string }> = [
  { value: "draft", label: "草稿", hint: "还在构思和调整" },
  { value: "finalized", label: "已定案", hint: "作为后续章节规划依据" },
];

function readStoredProjectId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(PROJECT_STORAGE_KEY) ?? window.localStorage.getItem("shulingge.web.projectId") ?? "";
}

function readStoredViewMode(): PlotViewMode {
  if (typeof window === "undefined") {
    return "strip";
  }
  const value = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return value === "table" ? "table" : "strip";
}

function writeStoredProjectId(projectId: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROJECT_STORAGE_KEY, projectId);
    window.localStorage.setItem("shulingge.web.projectId", projectId);
  }
}

function writeStoredViewMode(mode: PlotViewMode): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
  }
}

function statusLabel(status: VolumeStatus | undefined): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "草稿";
}

function createDraft(volume?: VolumeRecord): VolumeDraft {
  return {
    title: volume?.title ?? "",
    status: volume?.status ?? "draft",
    positioning: volume?.positioning ?? "",
    themes: volume?.themes ?? "",
    keyPoints: volume?.keyPoints ?? "",
    notes: volume?.notes ?? "",
  };
}

function toPayload(draft: VolumeDraft): VolumeInput {
  return {
    title: draft.title.trim(),
    status: draft.status,
    positioning: draft.positioning.trim(),
    themes: draft.themes.trim(),
    keyPoints: draft.keyPoints.trim(),
    notes: draft.notes.trim(),
  };
}

function createChapterPlanDraft(chapterPlan?: ChapterPlanRecord, fallbackVolumeId = NO_VOLUME): ChapterPlanDraft {
  return {
    title: chapterPlan?.title ?? "",
    volumeId: chapterPlan?.volumeId ?? fallbackVolumeId,
    summary: chapterPlan?.summary ?? "",
  };
}

function toChapterPlanPayload(draft: ChapterPlanDraft): ChapterPlanInput {
  return {
    title: draft.title.trim(),
    volumeId: draft.volumeId === NO_VOLUME ? null : draft.volumeId,
    summary: draft.summary.trim(),
  };
}

function createKeyEventDraft(keyEvent?: KeyEventRecord): KeyEventDraft {
  return {
    title: keyEvent?.title ?? "",
    positioning: keyEvent?.positioning ?? "",
    prerequisites: keyEvent?.prerequisites ?? "",
    flow: keyEvent?.flow ?? "",
    relationChanges: keyEvent?.relationChanges ?? "",
    forbidden: keyEvent?.forbidden ?? "",
    customFields: keyEvent?.customFields?.map((field) => ({ title: field.title, content: field.content })) ?? [],
    volumeId: keyEvent?.volumeId ?? NO_REFERENCE,
    chapterPlanId: keyEvent?.chapterPlanId ?? NO_REFERENCE,
    timelineId: keyEvent?.timelineId ?? NO_REFERENCE,
  };
}

function toKeyEventPayload(draft: KeyEventDraft): KeyEventInput {
  return {
    title: draft.title.trim(),
    positioning: draft.positioning.trim(),
    prerequisites: draft.prerequisites.trim(),
    flow: draft.flow.trim(),
    relationChanges: draft.relationChanges.trim(),
    forbidden: draft.forbidden.trim(),
    customFields: draft.customFields
      .map((field) => ({ title: field.title.trim(), content: field.content.trim() }))
      .filter((field) => field.title || field.content),
    volumeId: draft.volumeId === NO_REFERENCE ? null : draft.volumeId,
    chapterPlanId: draft.chapterPlanId === NO_REFERENCE ? null : draft.chapterPlanId,
    timelineId: draft.timelineId === NO_REFERENCE ? null : draft.timelineId,
  };
}

function createPlotNoteDraft(plotNote?: PlotNoteRecord): PlotNoteDraft {
  return {
    title: plotNote?.title ?? "",
    category: plotNote?.category ?? PLOT_NOTE_CATEGORIES[0],
    content: plotNote?.content ?? "",
    customFields: plotNote?.customFields?.map((field) => ({ title: field.title, content: field.content })) ?? [],
  };
}

function toPlotNotePayload(draft: PlotNoteDraft): PlotNoteInput {
  return {
    title: draft.title.trim(),
    category: draft.category.trim() || PLOT_NOTE_CATEGORIES[0],
    content: draft.content,
    customFields: draft.customFields
      .map((field) => ({ title: field.title.trim(), content: field.content.trim() }))
      .filter((field) => field.title || field.content),
  };
}

function compactText(value: string | undefined, fallback = "未填写摘要"): string {
  const normalized = (value ?? "").split(/\n+/).map((line) => line.trim()).filter(Boolean).join(" / ");
  return normalized || fallback;
}

function volumeSummary(volume: VolumeRecord): string {
  return compactText(volume.positioning || volume.themes || volume.keyPoints);
}

function chapterPlanSummary(chapterPlan: ChapterPlanRecord): string {
  return compactText(chapterPlan.summary, "未填写梗概");
}

function keyEventSummary(keyEvent: KeyEventRecord): string {
  return compactText(keyEvent.positioning, "未填写事件定位");
}

function plotNoteSummary(plotNote: PlotNoteRecord): string {
  return compactText(plotNote.content.replace(/[|#*_`>-]/g, " "), "未填写内容");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function isMarkdownTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitMarkdownTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }
    if (trimmed.startsWith("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1] ?? "")) {
      const headers = splitMarkdownTableRow(trimmed);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        rows.push(splitMarkdownTableRow(lines[index] ?? ""));
        index += 1;
      }
      html.push(`<table><thead><tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (trimmed.startsWith("### ")) {
      html.push(`<h3>${renderInlineMarkdown(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith("## ")) {
      html.push(`<h2>${renderInlineMarkdown(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith("# ")) {
      html.push(`<h1>${renderInlineMarkdown(trimmed.slice(2))}</h1>`);
    } else if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test((lines[index] ?? "").trim())) {
        items.push(`<li>${renderInlineMarkdown((lines[index] ?? "").trim().replace(/^[-*]\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    } else if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test((lines[index] ?? "").trim())) {
        items.push(`<li>${renderInlineMarkdown((lines[index] ?? "").trim().replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    } else {
      html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
    }
    index += 1;
  }
  return html.join("");
}

function VolumeEditorModal({
  draft,
  editing,
  saving,
  disabled,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: VolumeDraft;
  editing: boolean;
  saving: boolean;
  disabled: boolean;
  error?: string | null;
  onChange(patch: Partial<VolumeDraft>): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="vault-modal-backdrop" onMouseDown={onCancel}>
      <form className="vault-modal input-modal plot-volume-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div>
          <h2>{editing ? "编辑分卷" : "新建分卷"}</h2>
          <p className="view-sub">本步只规划卷级结构；章节规划和关键事件会在后续步骤接入。</p>
        </div>

        <div className="plot-modal-body">
          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>卷名</span>
              <input
                className="input"
                value={draft.title}
                autoFocus
                placeholder="例如 第一卷_香奈惠命运改写篇"
                onChange={(event) => onChange({ title: event.target.value })}
              />
            </label>
            <label className="form-block">
              <span>状态</span>
              <Select
                value={draft.status}
                options={STATUS_OPTIONS}
                onChange={(value) => onChange({ status: value as VolumeStatus })}
                ariaLabel="分卷状态"
              />
            </label>
          </div>

          <label className="form-block">
            <span>卷定位</span>
            <textarea
              className="textarea plot-textarea"
              value={draft.positioning}
              placeholder="这一卷的核心是什么，承担什么剧情功能"
              onChange={(event) => onChange({ positioning: event.target.value })}
            />
          </label>
          <label className="form-block">
            <span>核心主题</span>
            <textarea
              className="textarea plot-textarea"
              value={draft.themes}
              placeholder="可逐条写下主题、人物命题、情绪关键词"
              onChange={(event) => onChange({ themes: event.target.value })}
            />
          </label>
          <label className="form-block">
            <span>本卷重点</span>
            <textarea
              className="textarea plot-textarea-lg"
              value={draft.keyPoints}
              placeholder="写本卷必须推进的主线、人物变化、冲突和伏笔"
              onChange={(event) => onChange({ keyPoints: event.target.value })}
            />
          </label>
          <label className="form-block">
            <span>备注 / 补充</span>
            <textarea
              className="textarea plot-textarea"
              value={draft.notes}
              placeholder="可选：临时想法、风险点、待确认设定"
              onChange={(event) => onChange({ notes: event.target.value })}
            />
          </label>
        </div>

        {error ? (
          <div className="model-feedback model-feedback-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="vault-modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={saving || disabled}>
            <Save size={15} strokeWidth={2} />
            {saving ? "保存中..." : "保存分卷"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ChapterPlanEditorModal({
  draft,
  editing,
  volumes,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: ChapterPlanDraft;
  editing: boolean;
  volumes: VolumeRecord[];
  saving: boolean;
  error?: string | null;
  onChange(patch: Partial<ChapterPlanDraft>): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const volumeOptions = [
    { value: NO_VOLUME, label: "不归属分卷", hint: "直接在当前小说下新建章节" },
    ...volumes.map((volume) => ({ value: volume.id, label: volume.title, hint: statusLabel(volume.status) })),
  ];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="vault-modal-backdrop" onMouseDown={onCancel}>
      <form className="vault-modal input-modal plot-chapter-plan-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <h2>{editing ? "编辑章节规划" : "新建章节规划"}</h2>
        <div className="plot-modal-body">
          <label className="form-block">
            <span>章节规划标题</span>
            <input
              className="input"
              value={draft.title}
              autoFocus
              onChange={(event) => onChange({ title: event.target.value })}
              placeholder="例如 第一章 破局规划"
            />
          </label>
          <label className="form-block">
            <span>归属分卷</span>
            <Select
              value={draft.volumeId}
              options={volumeOptions}
              onChange={(value) => onChange({ volumeId: value })}
              ariaLabel="归属分卷"
            />
          </label>
          <label className="form-block">
            <span>章节梗概</span>
            <textarea
              className="textarea plot-textarea-lg"
              value={draft.summary}
              onChange={(event) => onChange({ summary: event.target.value })}
              placeholder="自由写这一章打算写什么、涉及谁、要点和节奏。"
            />
          </label>
        </div>
        {error ? (
          <div className="model-feedback model-feedback-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="vault-modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "保存中..." : editing ? "保存章节规划" : "创建章节规划"}</button>
        </div>
      </form>
    </div>
  );
}

function KeyEventEditorModal({
  draft,
  editing,
  volumes,
  chapterPlans,
  timelineEvents,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: KeyEventDraft;
  editing: boolean;
  volumes: VolumeRecord[];
  chapterPlans: ChapterPlanRecord[];
  timelineEvents: TimelineEvent[];
  saving: boolean;
  error?: string | null;
  onChange(patch: Partial<KeyEventDraft>): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const volumeOptions = [
    { value: NO_REFERENCE, label: "不关联分卷" },
    ...volumes.map((volume) => ({ value: volume.id, label: volume.title, hint: statusLabel(volume.status) })),
  ];
  const chapterPlanOptions = [
    { value: NO_REFERENCE, label: "不关联章节规划" },
    ...chapterPlans.map((chapterPlan) => ({ value: chapterPlan.id, label: chapterPlan.title, hint: chapterPlanSummary(chapterPlan) })),
  ];
  const timelineOptions = [
    { value: NO_REFERENCE, label: "不关联时间线" },
    ...timelineEvents.map((event) => ({ value: event.id, label: event.title, hint: compactText(event.description) })),
  ];

  const updateCustomField = (index: number, patch: Partial<KeyEventCustomField>) => {
    const next = [...draft.customFields];
    next[index] = { ...next[index], ...patch };
    onChange({ customFields: next });
  };
  const removeCustomField = (index: number) => {
    onChange({ customFields: draft.customFields.filter((_, rowIndex) => rowIndex !== index) });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="vault-modal-backdrop" onMouseDown={onCancel}>
      <form className="vault-modal input-modal plot-key-event-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <h2>{editing ? "编辑关键事件" : "新建关键事件"}</h2>
        <div className="plot-modal-body">
          <label className="form-block">
            <span>事件名</span>
            <input
              className="input"
              value={draft.title}
              autoFocus
              onChange={(event) => onChange({ title: event.target.value })}
              placeholder="例如 蝶屋初入"
            />
          </label>
          <div className="form-grid form-grid-3">
            <label className="form-block">
              <span>关联分卷</span>
              <Select value={draft.volumeId} options={volumeOptions} onChange={(value) => onChange({ volumeId: value })} ariaLabel="关联分卷" />
            </label>
            <label className="form-block">
              <span>关联章节规划</span>
              <Select value={draft.chapterPlanId} options={chapterPlanOptions} onChange={(value) => onChange({ chapterPlanId: value })} ariaLabel="关联章节规划" />
            </label>
            <label className="form-block">
              <span>关联时间线</span>
              <Select value={draft.timelineId} options={timelineOptions} onChange={(value) => onChange({ timelineId: value })} ariaLabel="关联时间线" />
            </label>
          </div>
          <label className="form-block">
            <span>事件定位</span>
            <textarea className="textarea plot-textarea" value={draft.positioning} onChange={(event) => onChange({ positioning: event.target.value })} placeholder="这个事件是什么、不是什么" />
          </label>
          <label className="form-block">
            <span>前置条件</span>
            <textarea className="textarea plot-textarea" value={draft.prerequisites} onChange={(event) => onChange({ prerequisites: event.target.value })} />
          </label>
          <label className="form-block">
            <span>事件流程</span>
            <textarea className="textarea plot-textarea-lg" value={draft.flow} onChange={(event) => onChange({ flow: event.target.value })} placeholder="事件经过、关键动作、转折和落点" />
          </label>
          <label className="form-block">
            <span>关系变化</span>
            <textarea className="textarea plot-textarea" value={draft.relationChanges} onChange={(event) => onChange({ relationChanges: event.target.value })} />
          </label>
          <label className="form-block">
            <span>禁止写法</span>
            <textarea className="textarea plot-textarea" value={draft.forbidden} onChange={(event) => onChange({ forbidden: event.target.value })} />
          </label>
          <div className="character-custom-fields">
            {draft.customFields.map((field, index) => (
              <div className="character-custom-row" key={index}>
                <input className="input" value={field.title} placeholder="自定义标题" onChange={(event) => updateCustomField(index, { title: event.target.value })} />
                <input className="input" value={field.content} placeholder="内容" onChange={(event) => updateCustomField(index, { content: event.target.value })} />
                <button type="button" className="btn-icon danger" onClick={() => removeCustomField(index)} aria-label="删除自定义字段">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost character-add-custom" onClick={() => onChange({ customFields: [...draft.customFields, { title: "", content: "" }] })}>
              <Plus size={14} />
              添加自定义字段
            </button>
          </div>
        </div>
        {error ? (
          <div className="model-feedback model-feedback-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="vault-modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "保存中..." : editing ? "保存关键事件" : "创建关键事件"}</button>
        </div>
      </form>
    </div>
  );
}

function PlotNoteEditorModal({
  draft,
  editing,
  categories,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: PlotNoteDraft;
  editing: boolean;
  categories: string[];
  saving: boolean;
  error?: string | null;
  onChange(patch: Partial<PlotNoteDraft>): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const categoryOptions = [...new Set([...PLOT_NOTE_CATEGORIES, ...categories, draft.category].filter(Boolean))]
    .map((category) => ({ value: category, label: category }));
  const updateCustomField = (index: number, patch: Partial<PlotNoteCustomField>) => {
    const next = [...draft.customFields];
    next[index] = { ...next[index], ...patch };
    onChange({ customFields: next });
  };
  const removeCustomField = (index: number) => {
    onChange({ customFields: draft.customFields.filter((_, rowIndex) => rowIndex !== index) });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="vault-modal-backdrop" onMouseDown={onCancel}>
      <form className="vault-modal input-modal plot-note-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <h2>{editing ? "编辑剧情笔记" : "新建剧情笔记"}</h2>
        <div className="plot-modal-body">
          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>标题</span>
              <input
                className="input"
                value={draft.title}
                autoFocus
                onChange={(event) => onChange({ title: event.target.value })}
                placeholder="例如 童磨反派弧线"
              />
            </label>
            <label className="form-block">
              <span>分类</span>
              <Select value={draft.category} options={categoryOptions} onChange={(value) => onChange({ category: value })} ariaLabel="剧情笔记分类" />
            </label>
          </div>
          <label className="form-block">
            <span>自定义分类</span>
            <input className="input" value={draft.category} onChange={(event) => onChange({ category: event.target.value })} placeholder="可输入新的分类名称" />
          </label>
          <label className="form-block">
            <span>内容 Markdown</span>
            <textarea
              className="textarea plot-note-markdown"
              value={draft.content}
              onChange={(event) => onChange({ content: event.target.value })}
              placeholder={"可写 Markdown，包括表格：\n| 伏笔 | 回收 |\n| --- | --- |\n| 药味 | 蝶屋揭示 |"}
            />
          </label>
          <div className="form-block">
            <span>预览</span>
            <div className="plot-markdown-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.content) || "<p>暂无内容</p>" }} />
          </div>
          <div className="character-custom-fields">
            {draft.customFields.map((field, index) => (
              <div className="character-custom-row" key={index}>
                <input className="input" value={field.title} placeholder="自定义标题" onChange={(event) => updateCustomField(index, { title: event.target.value })} />
                <input className="input" value={field.content} placeholder="内容" onChange={(event) => updateCustomField(index, { content: event.target.value })} />
                <button type="button" className="btn-icon danger" onClick={() => removeCustomField(index)} aria-label="删除自定义字段">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost character-add-custom" onClick={() => onChange({ customFields: [...draft.customFields, { title: "", content: "" }] })}>
              <Plus size={14} />
              添加自定义字段
            </button>
          </div>
        </div>
        {error ? (
          <div className="model-feedback model-feedback-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="vault-modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "保存中..." : editing ? "保存剧情笔记" : "创建剧情笔记"}</button>
        </div>
      </form>
    </div>
  );
}

export function PlotOutlineView() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [novels, setNovels] = useState<NovelSummary[]>([]);
  const [projectId, setProjectId] = useState(readStoredProjectId);
  const [novelId, setNovelId] = useState("");
  const [volumes, setVolumes] = useState<VolumeRecord[]>([]);
  const [chapterPlans, setChapterPlans] = useState<ChapterPlanRecord[]>([]);
  const [keyEvents, setKeyEvents] = useState<KeyEventRecord[]>([]);
  const [plotNotes, setPlotNotes] = useState<PlotNoteRecord[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VolumeDraft>(() => createDraft());
  const [chapterPlanDraft, setChapterPlanDraft] = useState<ChapterPlanDraft>(() => createChapterPlanDraft());
  const [keyEventDraft, setKeyEventDraft] = useState<KeyEventDraft>(() => createKeyEventDraft());
  const [plotNoteDraft, setPlotNoteDraft] = useState<PlotNoteDraft>(() => createPlotNoteDraft());
  const [viewMode, setViewMode] = useState<PlotViewMode>(readStoredViewMode);
  const [activeTab, setActiveTab] = useState<PlotModuleTab>("volumes");
  const [plotNoteCategoryFilter, setPlotNoteCategoryFilter] = useState(ALL_NOTE_CATEGORIES);
  const [volumeModalOpen, setVolumeModalOpen] = useState(false);
  const [chapterPlanModalOpen, setChapterPlanModalOpen] = useState(false);
  const [keyEventModalOpen, setKeyEventModalOpen] = useState(false);
  const [plotNoteModalOpen, setPlotNoteModalOpen] = useState(false);
  const [editingChapterPlan, setEditingChapterPlan] = useState<ChapterPlanRecord | null>(null);
  const [editingKeyEvent, setEditingKeyEvent] = useState<KeyEventRecord | null>(null);
  const [editingPlotNote, setEditingPlotNote] = useState<PlotNoteRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingChapterPlan, setSavingChapterPlan] = useState(false);
  const [savingKeyEvent, setSavingKeyEvent] = useState(false);
  const [savingPlotNote, setSavingPlotNote] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [volumeModalError, setVolumeModalError] = useState<string | null>(null);
  const [chapterPlanModalError, setChapterPlanModalError] = useState<string | null>(null);
  const [keyEventModalError, setKeyEventModalError] = useState<string | null>(null);
  const [plotNoteModalError, setPlotNoteModalError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VolumeRecord | null>(null);
  const [deleteChapterPlanTarget, setDeleteChapterPlanTarget] = useState<ChapterPlanRecord | null>(null);
  const [deleteKeyEventTarget, setDeleteKeyEventTarget] = useState<KeyEventRecord | null>(null);
  const [deletePlotNoteTarget, setDeletePlotNoteTarget] = useState<PlotNoteRecord | null>(null);

  const selectedVolume = useMemo(
    () => volumes.find((volume) => volume.id === selectedVolumeId) ?? null,
    [selectedVolumeId, volumes],
  );
  const sortedVolumes = useMemo(
    () => [...volumes].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title)),
    [volumes],
  );
  const sortedChapterPlans = useMemo(
    () => [...chapterPlans].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title)),
    [chapterPlans],
  );
  const sortedKeyEvents = useMemo(
    () => [...keyEvents].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title)),
    [keyEvents],
  );
  const sortedPlotNotes = useMemo(
    () => [...plotNotes].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title)),
    [plotNotes],
  );
  const plotNoteCategories = useMemo(
    () => [...new Set([...PLOT_NOTE_CATEGORIES, ...sortedPlotNotes.map((note) => note.category).filter(Boolean)])],
    [sortedPlotNotes],
  );
  const filteredPlotNotes = useMemo(
    () => plotNoteCategoryFilter === ALL_NOTE_CATEGORIES ? sortedPlotNotes : sortedPlotNotes.filter((note) => note.category === plotNoteCategoryFilter),
    [plotNoteCategoryFilter, sortedPlotNotes],
  );
  const plotNotesByCategory = useMemo(() => {
    const groups = new Map<string, PlotNoteRecord[]>();
    for (const plotNote of filteredPlotNotes) {
      const key = plotNote.category || PLOT_NOTE_CATEGORIES[0];
      groups.set(key, [...(groups.get(key) ?? []), plotNote]);
    }
    return groups;
  }, [filteredPlotNotes]);
  const chapterPlansByVolume = useMemo(() => {
    const groups = new Map<string, ChapterPlanRecord[]>();
    for (const chapterPlan of sortedChapterPlans) {
      const key = chapterPlan.volumeId ?? NO_VOLUME;
      groups.set(key, [...(groups.get(key) ?? []), chapterPlan]);
    }
    return groups;
  }, [sortedChapterPlans]);

  async function loadProjects() {
    setLoading(true);
    setFeedback(null);
    try {
      const list = await api.listProjects();
      setProjects(list);
      const resolvedProjectId = list.some((project) => project.projectId === projectId)
        ? projectId
        : list[0]?.projectId ?? "";
      if (resolvedProjectId !== projectId) {
        setProjectId(resolvedProjectId);
        if (resolvedProjectId) {
          writeStoredProjectId(resolvedProjectId);
        }
      }
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "项目列表加载失败" });
    } finally {
      setLoading(false);
    }
  }

  async function loadNovels(nextProjectId = projectId) {
    if (!nextProjectId) {
      setNovels([]);
      setNovelId("");
      setVolumes([]);
      setChapterPlans([]);
      setKeyEvents([]);
      setPlotNotes([]);
      setTimelineEvents([]);
      return;
    }
    try {
      const list = await api.listNovels(nextProjectId);
      setNovels(list);
      setNovelId((current) => current && list.some((novel) => novel.novelId === current) ? current : list[0]?.novelId ?? "");
    } catch (error) {
      setNovels([]);
      setNovelId("");
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "小说列表加载失败" });
    }
  }

  async function loadVolumes(nextProjectId = projectId, nextNovelId = novelId) {
    if (!nextProjectId || !nextNovelId) {
      setVolumes([]);
      setChapterPlans([]);
      setKeyEvents([]);
      setPlotNotes([]);
      setTimelineEvents([]);
      setSelectedVolumeId(null);
      setDraft(createDraft());
      return;
    }
    setLoading(true);
    try {
      const [volumeList, chapterList, keyEventList, plotNoteList, timelineList] = await Promise.all([
        api.listVolumes(nextProjectId, nextNovelId),
        api.listChapterPlans(nextProjectId, nextNovelId),
        api.listKeyEvents(nextProjectId, nextNovelId),
        api.listPlotNotes(nextProjectId, nextNovelId),
        api.listTimelineByProject(nextProjectId),
      ]);
      setVolumes(volumeList);
      setChapterPlans(chapterList);
      setKeyEvents(keyEventList);
      setPlotNotes(plotNoteList);
      setTimelineEvents(timelineList);
      setSelectedVolumeId((current) => current && volumeList.some((volume) => volume.id === current) ? current : volumeList[0]?.id ?? null);
    } catch (error) {
      setVolumes([]);
      setChapterPlans([]);
      setKeyEvents([]);
      setPlotNotes([]);
      setTimelineEvents([]);
      setSelectedVolumeId(null);
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "分卷大纲加载失败" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    void loadNovels(projectId);
  }, [projectId]);

  useEffect(() => {
    void loadVolumes(projectId, novelId);
  }, [projectId, novelId]);

  useEffect(() => {
    setDraft(createDraft(selectedVolume ?? undefined));
  }, [selectedVolume?.id]);

  function changeViewMode(mode: PlotViewMode) {
    setViewMode(mode);
    writeStoredViewMode(mode);
  }

  const activeTabConfig = PLOT_MODULE_TABS.find((tab) => tab.id === activeTab) ?? PLOT_MODULE_TABS[0];

  function startCreateForActiveTab() {
    if (activeTab === "volumes") {
      startCreateVolume();
    } else if (activeTab === "chapterPlans") {
      startCreateChapterPlan();
    } else if (activeTab === "keyEvents") {
      startCreateKeyEvent();
    } else {
      startCreatePlotNote();
    }
  }

  function startCreateVolume() {
    setSelectedVolumeId(null);
    setDraft(createDraft());
    setVolumeModalOpen(true);
    setVolumeModalError(null);
    setFeedback(null);
  }

  function startEditVolume(volume: VolumeRecord) {
    setSelectedVolumeId(volume.id);
    setDraft(createDraft(volume));
    setVolumeModalOpen(true);
    setVolumeModalError(null);
    setFeedback(null);
  }

  function startCreateChapterPlan() {
    setEditingChapterPlan(null);
    setChapterPlanDraft(createChapterPlanDraft(undefined, selectedVolumeId ?? NO_VOLUME));
    setChapterPlanModalOpen(true);
    setChapterPlanModalError(null);
    setFeedback(null);
  }

  function startEditChapterPlan(chapterPlan: ChapterPlanRecord) {
    setEditingChapterPlan(chapterPlan);
    setChapterPlanDraft(createChapterPlanDraft(chapterPlan));
    setChapterPlanModalOpen(true);
    setChapterPlanModalError(null);
    setFeedback(null);
  }

  function startCreateKeyEvent() {
    setEditingKeyEvent(null);
    setKeyEventDraft(createKeyEventDraft());
    setKeyEventModalOpen(true);
    setKeyEventModalError(null);
    setFeedback(null);
  }

  function startEditKeyEvent(keyEvent: KeyEventRecord) {
    setEditingKeyEvent(keyEvent);
    setKeyEventDraft(createKeyEventDraft(keyEvent));
    setKeyEventModalOpen(true);
    setKeyEventModalError(null);
    setFeedback(null);
  }

  function startCreatePlotNote() {
    setEditingPlotNote(null);
    setPlotNoteDraft(createPlotNoteDraft());
    setPlotNoteModalOpen(true);
    setPlotNoteModalError(null);
    setFeedback(null);
  }

  function startEditPlotNote(plotNote: PlotNoteRecord) {
    setEditingPlotNote(plotNote);
    setPlotNoteDraft(createPlotNoteDraft(plotNote));
    setPlotNoteModalOpen(true);
    setPlotNoteModalError(null);
    setFeedback(null);
  }

  async function refreshChapterPlans() {
    if (!projectId || !novelId) {
      setChapterPlans([]);
      return;
    }
    setChapterPlans(await api.listChapterPlans(projectId, novelId));
  }

  async function refreshKeyEvents() {
    if (!projectId || !novelId) {
      setKeyEvents([]);
      return;
    }
    setKeyEvents(await api.listKeyEvents(projectId, novelId));
  }

  async function refreshPlotNotes() {
    if (!projectId || !novelId) {
      setPlotNotes([]);
      return;
    }
    setPlotNotes(await api.listPlotNotes(projectId, novelId));
  }

  async function saveVolume() {
    if (!projectId || !novelId) {
      setFeedback({ kind: "error", message: "请先选择项目和小说" });
      return;
    }
    const payload = toPayload(draft);
    if (!payload.title) {
      setVolumeModalError("请填写卷名");
      setFeedback({ kind: "error", message: "请填写卷名" });
      return;
    }

    setSaving(true);
    setVolumeModalError(null);
    setFeedback(null);
    try {
      const saved = selectedVolume
        ? await api.updateVolume(projectId, novelId, selectedVolume.id, payload)
        : await api.createVolume(projectId, novelId, payload);
      const list = await api.listVolumes(projectId, novelId);
      setVolumes(list);
      setSelectedVolumeId(saved.id);
      setVolumeModalOpen(false);
      setFeedback({ kind: "success", message: selectedVolume ? "分卷大纲已保存" : "分卷大纲已创建" });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "分卷保存失败" });
    } finally {
      setSaving(false);
    }
  }

  async function saveChapterPlan() {
    if (!projectId || !novelId) {
      setFeedback({ kind: "error", message: "请先选择项目和小说" });
      return;
    }
    const payload = toChapterPlanPayload(chapterPlanDraft);
    if (!payload.title) {
      setChapterPlanModalError("请填写章节规划标题");
      setFeedback({ kind: "error", message: "请填写章节规划标题" });
      return;
    }

    setSavingChapterPlan(true);
    setChapterPlanModalError(null);
    try {
      const saved = editingChapterPlan
        ? await api.updateChapterPlan(projectId, novelId, editingChapterPlan.id, payload)
        : await api.createChapterPlan(projectId, novelId, payload);
      await refreshChapterPlans();
      setChapterPlanModalOpen(false);
      setEditingChapterPlan(null);
      setFeedback({ kind: "success", message: editingChapterPlan ? `章节规划「${saved.title}」已保存` : `章节规划「${saved.title}」已创建` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "章节规划保存失败" });
    } finally {
      setSavingChapterPlan(false);
    }
  }

  async function saveKeyEvent() {
    if (!projectId || !novelId) {
      setFeedback({ kind: "error", message: "请先选择项目和小说" });
      return;
    }
    const payload = toKeyEventPayload(keyEventDraft);
    if (!payload.title) {
      setKeyEventModalError("请填写事件名");
      setFeedback({ kind: "error", message: "请填写事件名" });
      return;
    }

    setSavingKeyEvent(true);
    setKeyEventModalError(null);
    try {
      const saved = editingKeyEvent
        ? await api.updateKeyEvent(projectId, novelId, editingKeyEvent.id, payload)
        : await api.createKeyEvent(projectId, novelId, payload);
      await refreshKeyEvents();
      setKeyEventModalOpen(false);
      setEditingKeyEvent(null);
      setFeedback({ kind: "success", message: editingKeyEvent ? `关键事件「${saved.title}」已保存` : `关键事件「${saved.title}」已创建` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "关键事件保存失败" });
    } finally {
      setSavingKeyEvent(false);
    }
  }

  async function savePlotNote() {
    if (!projectId || !novelId) {
      setFeedback({ kind: "error", message: "请先选择项目和小说" });
      return;
    }
    const payload = toPlotNotePayload(plotNoteDraft);
    if (!payload.title) {
      setPlotNoteModalError("请填写剧情笔记标题");
      setFeedback({ kind: "error", message: "请填写剧情笔记标题" });
      return;
    }

    setSavingPlotNote(true);
    setPlotNoteModalError(null);
    try {
      const saved = editingPlotNote
        ? await api.updatePlotNote(projectId, novelId, editingPlotNote.id, payload)
        : await api.createPlotNote(projectId, novelId, payload);
      await refreshPlotNotes();
      setPlotNoteModalOpen(false);
      setEditingPlotNote(null);
      setFeedback({ kind: "success", message: editingPlotNote ? `剧情笔记「${saved.title}」已保存` : `剧情笔记「${saved.title}」已创建` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "剧情笔记保存失败" });
    } finally {
      setSavingPlotNote(false);
    }
  }

  async function deleteChapterPlan(chapterPlan: ChapterPlanRecord) {
    if (!projectId || !novelId) {
      return;
    }
    setDeleteChapterPlanTarget(null);
    try {
      await api.deleteChapterPlan(projectId, novelId, chapterPlan.id);
      await refreshChapterPlans();
      setFeedback({ kind: "success", message: `章节规划「${chapterPlan.title}」已删除` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "章节规划删除失败" });
    }
  }

  async function deleteKeyEvent(keyEvent: KeyEventRecord) {
    if (!projectId || !novelId) {
      return;
    }
    setDeleteKeyEventTarget(null);
    try {
      await api.deleteKeyEvent(projectId, novelId, keyEvent.id);
      await refreshKeyEvents();
      setFeedback({ kind: "success", message: `关键事件「${keyEvent.title}」已删除` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "关键事件删除失败" });
    }
  }

  async function deletePlotNote(plotNote: PlotNoteRecord) {
    if (!projectId || !novelId) {
      return;
    }
    setDeletePlotNoteTarget(null);
    try {
      await api.deletePlotNote(projectId, novelId, plotNote.id);
      await refreshPlotNotes();
      setFeedback({ kind: "success", message: `剧情笔记「${plotNote.title}」已删除` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "剧情笔记删除失败" });
    }
  }

  async function deleteVolume(volume: VolumeRecord) {
    if (!projectId || !novelId) {
      return;
    }
    setDeleteTarget(null);
    try {
      await api.deleteVolume(projectId, novelId, volume.id);
      const [list, chapterList, keyEventList, plotNoteList] = await Promise.all([
        api.listVolumes(projectId, novelId),
        api.listChapterPlans(projectId, novelId),
        api.listKeyEvents(projectId, novelId),
        api.listPlotNotes(projectId, novelId),
      ]);
      setVolumes(list);
      setChapterPlans(chapterList);
      setKeyEvents(keyEventList);
      setPlotNotes(plotNoteList);
      setSelectedVolumeId(list[0]?.id ?? null);
      setFeedback({ kind: "success", message: `分卷「${volume.title}」已删除` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "分卷删除失败" });
    }
  }

  async function moveVolume(volume: VolumeRecord, direction: -1 | 1) {
    if (!projectId || !novelId) {
      return;
    }
    const index = sortedVolumes.findIndex((item) => item.id === volume.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sortedVolumes.length) {
      return;
    }
    const next = [...sortedVolumes];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    try {
      const updated = await api.reorderVolumes(projectId, novelId, next.map((item) => item.id));
      setVolumes(updated);
      setSelectedVolumeId(volume.id);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "分卷排序失败" });
    }
  }

  async function moveChapterPlan(chapterPlan: ChapterPlanRecord, direction: -1 | 1) {
    if (!projectId || !novelId) {
      return;
    }
    const index = sortedChapterPlans.findIndex((item) => item.id === chapterPlan.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sortedChapterPlans.length) {
      return;
    }
    const next = [...sortedChapterPlans];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    try {
      const updated = await api.reorderChapterPlans(projectId, novelId, next.map((item) => item.id));
      setChapterPlans(updated);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "章节规划排序失败" });
    }
  }

  async function moveKeyEvent(keyEvent: KeyEventRecord, direction: -1 | 1) {
    if (!projectId || !novelId) {
      return;
    }
    const index = sortedKeyEvents.findIndex((item) => item.id === keyEvent.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sortedKeyEvents.length) {
      return;
    }
    const next = [...sortedKeyEvents];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    try {
      const updated = await api.reorderKeyEvents(projectId, novelId, next.map((item) => item.id));
      setKeyEvents(updated);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "关键事件排序失败" });
    }
  }

  async function movePlotNote(plotNote: PlotNoteRecord, direction: -1 | 1) {
    if (!projectId || !novelId) {
      return;
    }
    const index = sortedPlotNotes.findIndex((item) => item.id === plotNote.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sortedPlotNotes.length) {
      return;
    }
    const next = [...sortedPlotNotes];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    try {
      const updated = await api.reorderPlotNotes(projectId, novelId, next.map((item) => item.id));
      setPlotNotes(updated);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "剧情笔记排序失败" });
    }
  }

  function renderVolumeActions(volume: VolumeRecord, index: number) {
    return (
      <div className="plot-volume-actions">
        <button type="button" className="btn-icon" title="上移" disabled={index === 0} onClick={(event) => {
          event.stopPropagation();
          void moveVolume(volume, -1);
        }}>
          <ArrowUp size={15} />
        </button>
        <button type="button" className="btn-icon" title="下移" disabled={index === sortedVolumes.length - 1} onClick={(event) => {
          event.stopPropagation();
          void moveVolume(volume, 1);
        }}>
          <ArrowDown size={15} />
        </button>
        <button type="button" className="btn-icon" title="编辑" onClick={(event) => {
          event.stopPropagation();
          startEditVolume(volume);
        }}>
          <Pencil size={15} />
        </button>
        <button type="button" className="btn-icon danger" title="删除" onClick={(event) => {
          event.stopPropagation();
          setDeleteTarget(volume);
        }}>
          <Trash2 size={15} />
        </button>
      </div>
    );
  }

  function renderChapterPlanRow(chapterPlan: ChapterPlanRecord) {
    const index = sortedChapterPlans.findIndex((item) => item.id === chapterPlan.id);
    return (
      <article className="plot-chapter-row" key={chapterPlan.id}>
        <div className="plot-chapter-main">
          <span className="plot-chapter-title">{chapterPlan.title}</span>
          <span className="plot-chapter-meta">{chapterPlanSummary(chapterPlan)}</span>
        </div>
        <div className="plot-volume-actions">
          <button type="button" className="btn-icon" title="上移" disabled={index === 0} onClick={() => void moveChapterPlan(chapterPlan, -1)}>
            <ArrowUp size={15} />
          </button>
          <button type="button" className="btn-icon" title="下移" disabled={index === sortedChapterPlans.length - 1} onClick={() => void moveChapterPlan(chapterPlan, 1)}>
            <ArrowDown size={15} />
          </button>
          <button type="button" className="btn-icon" title="编辑章节规划" onClick={() => startEditChapterPlan(chapterPlan)}>
            <Pencil size={15} />
          </button>
          <button type="button" className="btn-icon danger" title="删除章节规划" onClick={() => setDeleteChapterPlanTarget(chapterPlan)}>
            <Trash2 size={15} />
          </button>
        </div>
      </article>
    );
  }

  function keyEventRelationLabel(keyEvent: KeyEventRecord): string {
    const labels = [
      keyEvent.volumeId ? sortedVolumes.find((volume) => volume.id === keyEvent.volumeId)?.title : "",
      keyEvent.chapterPlanId ? sortedChapterPlans.find((chapterPlan) => chapterPlan.id === keyEvent.chapterPlanId)?.title : "",
      keyEvent.timelineId ? timelineEvents.find((event) => event.id === keyEvent.timelineId)?.title : "",
    ].filter(Boolean);
    return labels.length ? `关联：${labels.join(" · ")}` : "未关联";
  }

  function renderKeyEventRow(keyEvent: KeyEventRecord) {
    const index = sortedKeyEvents.findIndex((item) => item.id === keyEvent.id);
    return (
      <article className="plot-chapter-row" key={keyEvent.id}>
        <div className="plot-chapter-main">
          <span className="plot-chapter-title">{keyEvent.title}</span>
          <span className="plot-chapter-meta">{keyEventSummary(keyEvent)}</span>
          <span className="plot-chapter-meta">{keyEventRelationLabel(keyEvent)}</span>
        </div>
        <div className="plot-volume-actions">
          <button type="button" className="btn-icon" title="上移" disabled={index === 0} onClick={() => void moveKeyEvent(keyEvent, -1)}>
            <ArrowUp size={15} />
          </button>
          <button type="button" className="btn-icon" title="下移" disabled={index === sortedKeyEvents.length - 1} onClick={() => void moveKeyEvent(keyEvent, 1)}>
            <ArrowDown size={15} />
          </button>
          <button type="button" className="btn-icon" title="编辑关键事件" onClick={() => startEditKeyEvent(keyEvent)}>
            <Pencil size={15} />
          </button>
          <button type="button" className="btn-icon danger" title="删除关键事件" onClick={() => setDeleteKeyEventTarget(keyEvent)}>
            <Trash2 size={15} />
          </button>
        </div>
      </article>
    );
  }

  function renderPlotNoteRow(plotNote: PlotNoteRecord) {
    const index = sortedPlotNotes.findIndex((item) => item.id === plotNote.id);
    return (
      <article className="plot-chapter-row" key={plotNote.id}>
        <div className="plot-chapter-main">
          <span className="plot-chapter-title">{plotNote.title}</span>
          <span className="plot-chapter-meta">{plotNoteSummary(plotNote)}</span>
          <div className="plot-note-rendered" dangerouslySetInnerHTML={{ __html: renderMarkdown(plotNote.content) || "<p>暂无内容</p>" }} />
          <span className="tag">{plotNote.category || PLOT_NOTE_CATEGORIES[0]}</span>
        </div>
        <div className="plot-volume-actions">
          <button type="button" className="btn-icon" title="上移" disabled={index === 0} onClick={() => void movePlotNote(plotNote, -1)}>
            <ArrowUp size={15} />
          </button>
          <button type="button" className="btn-icon" title="下移" disabled={index === sortedPlotNotes.length - 1} onClick={() => void movePlotNote(plotNote, 1)}>
            <ArrowDown size={15} />
          </button>
          <button type="button" className="btn-icon" title="编辑剧情笔记" onClick={() => startEditPlotNote(plotNote)}>
            <Pencil size={15} />
          </button>
          <button type="button" className="btn-icon danger" title="删除剧情笔记" onClick={() => setDeletePlotNoteTarget(plotNote)}>
            <Trash2 size={15} />
          </button>
        </div>
      </article>
    );
  }

  return (
    <ViewShell
      title="剧情大纲"
      subtitle="先搭好分卷、章节规划、关键事件和剧情笔记，按模块逐步整理故事结构。"
      actions={
        <>
          <ProjectSelector
            projects={projects}
            projectId={projectId}
            disabled={loading}
            onChange={(nextProjectId) => {
              setProjectId(nextProjectId);
              setNovelId("");
              setVolumes([]);
              setChapterPlans([]);
              setKeyEvents([]);
              setPlotNotes([]);
              setTimelineEvents([]);
              setSelectedVolumeId(null);
              setDraft(createDraft());
              writeStoredProjectId(nextProjectId);
            }}
          />
          <label className="plot-novel-select">
            <span>当前小说</span>
            <Select
              value={novelId}
              options={novels.map((novel) => ({ value: novel.novelId, label: novel.title }))}
              onChange={setNovelId}
              ariaLabel="当前小说"
              disabled={loading || novels.length === 0}
            />
          </label>
        </>
      }
    >
      <div className="plot-layout">
        <div className="plot-module-tabs">
          <div className="segmented" aria-label="剧情大纲模块切换">
            {PLOT_MODULE_TABS.map((tab) => (
              <button type="button" className={activeTab === tab.id ? "on" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <section className="editor-card plot-index-card">
          <div className="editor-card-head">
            <div>
              <h2>{activeTabConfig.label}</h2>
              <p className="view-sub">{activeTabConfig.description}</p>
            </div>
            <div className="plot-head-actions">
              {activeTab === "volumes" ? (
                <div className="segmented" aria-label="分卷视图切换">
                  <button type="button" className={viewMode === "strip" ? "on" : ""} onClick={() => changeViewMode("strip")}>
                    横条
                  </button>
                  <button type="button" className={viewMode === "table" ? "on" : ""} onClick={() => changeViewMode("table")}>
                    表格
                  </button>
                </div>
              ) : null}
              <button type="button" className="btn btn-primary" disabled={!projectId || !novelId} onClick={startCreateForActiveTab}>
                <Plus size={15} strokeWidth={2} />
                {activeTabConfig.createLabel}
              </button>
            </div>
          </div>

          {feedback ? (
            <div className={`model-feedback model-feedback-${feedback.kind}`}>
              {feedback.kind === "success" ? <CheckCircle2 size={16} /> : feedback.kind === "error" ? <AlertCircle size={16} /> : null}
              <span>{feedback.message}</span>
            </div>
          ) : null}

          {loading ? (
            <div className="center-state" style={{ minHeight: 180 }}>
              <div className="spinner" />
              <span>正在加载剧情大纲...</span>
            </div>
          ) : activeTab === "volumes" ? (
            sortedVolumes.length ? (
              viewMode === "strip" ? (
                <div className="plot-volume-list plot-volume-list-strip">
                  {sortedVolumes.map((volume, index) => (
                    <article
                      className={`plot-volume-strip ${volume.id === selectedVolumeId ? "active" : ""}`}
                      key={volume.id}
                      onClick={() => setSelectedVolumeId(volume.id)}
                    >
                      <button type="button" className="plot-strip-main">
                        <span className="plot-volume-order">{String(index + 1).padStart(2, "0")}</span>
                        <span className="plot-strip-text">
                          <span className="plot-volume-title">{volume.title}</span>
                          <span className="plot-volume-summary">{volumeSummary(volume)}</span>
                        </span>
                        <span className={`status-pill status-pill-${volume.status ?? "draft"}`}>{statusLabel(volume.status)}</span>
                      </button>
                      {renderVolumeActions(volume, index)}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="plot-volume-table">
                  <div className="plot-volume-table-head">
                    <span>卷名</span>
                    <span>状态</span>
                    <span>定位 / 主题摘要</span>
                    <span>操作</span>
                  </div>
                  {sortedVolumes.map((volume, index) => (
                    <article
                      className={`plot-volume-table-row ${volume.id === selectedVolumeId ? "active" : ""}`}
                      key={volume.id}
                      onClick={() => setSelectedVolumeId(volume.id)}
                    >
                      <button type="button" className="plot-table-title">
                        <span className="plot-volume-order">{String(index + 1).padStart(2, "0")}</span>
                        <span>{volume.title}</span>
                      </button>
                      <span className={`status-pill status-pill-${volume.status ?? "draft"}`}>{statusLabel(volume.status)}</span>
                      <span className="plot-table-summary">{volumeSummary(volume)}</span>
                      {renderVolumeActions(volume, index)}
                    </article>
                  ))}
                </div>
              )
            ) : (
              <div className="empty-card">还没有分卷。可以新建分卷做卷级规划，也可以直接规划章节。</div>
            )
          ) : activeTab === "chapterPlans" ? (
            sortedChapterPlans.length ? (
              <div className="plot-chapter-groups">
                {sortedVolumes.map((volume) => {
                  const volumeChapterPlans = chapterPlansByVolume.get(volume.id) ?? [];
                  if (!volumeChapterPlans.length) {
                    return null;
                  }
                  return (
                    <div className="plot-chapter-group" key={volume.id}>
                      <div className="plot-chapter-group-title">{volume.title}</div>
                      <div className="plot-chapter-list">{volumeChapterPlans.map(renderChapterPlanRow)}</div>
                    </div>
                  );
                })}
                {(chapterPlansByVolume.get(NO_VOLUME) ?? []).length ? (
                  <div className="plot-chapter-group">
                    <div className="plot-chapter-group-title">未归属分卷</div>
                    <div className="plot-chapter-list">{(chapterPlansByVolume.get(NO_VOLUME) ?? []).map(renderChapterPlanRow)}</div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty-card">还没有章节规划。可以只写分卷大纲，也可以新建章节规划。</div>
            )
          ) : activeTab === "keyEvents" ? (
            sortedKeyEvents.length ? (
              <div className="plot-chapter-list">{sortedKeyEvents.map(renderKeyEventRow)}</div>
            ) : (
              <div className="empty-card">还没有关键事件。新建关键事件来设计重要剧情节点。</div>
            )
          ) : (
            <>
              <div className="plot-note-filter-row">
                <div className="segmented" aria-label="剧情笔记分类筛选">
                  <button type="button" className={plotNoteCategoryFilter === ALL_NOTE_CATEGORIES ? "on" : ""} onClick={() => setPlotNoteCategoryFilter(ALL_NOTE_CATEGORIES)}>
                    全部
                  </button>
                  {plotNoteCategories.map((category) => (
                    <button type="button" className={plotNoteCategoryFilter === category ? "on" : ""} key={category} onClick={() => setPlotNoteCategoryFilter(category)}>
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              {filteredPlotNotes.length ? (
                <div className="plot-chapter-groups">
                  {plotNoteCategories.map((category) => {
                    const notes = plotNotesByCategory.get(category) ?? [];
                    if (!notes.length) {
                      return null;
                    }
                    return (
                      <div className="plot-chapter-group" key={category}>
                        <div className="plot-chapter-group-title">{category}</div>
                        <div className="plot-chapter-list">{notes.map(renderPlotNoteRow)}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-card">还没有剧情笔记。新建剧情笔记来整理辅助剧情资料。</div>
              )}
            </>
          )}
        </section>
      </div>

      {volumeModalOpen ? (
        <VolumeEditorModal
          draft={draft}
          editing={Boolean(selectedVolume)}
          saving={saving}
          disabled={!projectId || !novelId}
          error={volumeModalError}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onCancel={() => {
            if (!saving) {
              setVolumeModalOpen(false);
              setVolumeModalError(null);
              setDraft(createDraft(selectedVolume ?? undefined));
            }
          }}
          onSubmit={() => void saveVolume()}
        />
      ) : null}

      {chapterPlanModalOpen ? (
        <ChapterPlanEditorModal
          draft={chapterPlanDraft}
          editing={Boolean(editingChapterPlan)}
          volumes={sortedVolumes}
          saving={savingChapterPlan}
          error={chapterPlanModalError}
          onChange={(patch) => setChapterPlanDraft((current) => ({ ...current, ...patch }))}
          onCancel={() => {
            if (!savingChapterPlan) {
              setChapterPlanModalOpen(false);
              setEditingChapterPlan(null);
              setChapterPlanModalError(null);
            }
          }}
          onSubmit={() => void saveChapterPlan()}
        />
      ) : null}

      {keyEventModalOpen ? (
        <KeyEventEditorModal
          draft={keyEventDraft}
          editing={Boolean(editingKeyEvent)}
          volumes={sortedVolumes}
          chapterPlans={sortedChapterPlans}
          timelineEvents={timelineEvents}
          saving={savingKeyEvent}
          error={keyEventModalError}
          onChange={(patch) => setKeyEventDraft((current) => ({ ...current, ...patch }))}
          onCancel={() => {
            if (!savingKeyEvent) {
              setKeyEventModalOpen(false);
              setEditingKeyEvent(null);
              setKeyEventModalError(null);
            }
          }}
          onSubmit={() => void saveKeyEvent()}
        />
      ) : null}

      {plotNoteModalOpen ? (
        <PlotNoteEditorModal
          draft={plotNoteDraft}
          editing={Boolean(editingPlotNote)}
          categories={plotNoteCategories}
          saving={savingPlotNote}
          error={plotNoteModalError}
          onChange={(patch) => setPlotNoteDraft((current) => ({ ...current, ...patch }))}
          onCancel={() => {
            if (!savingPlotNote) {
              setPlotNoteModalOpen(false);
              setEditingPlotNote(null);
              setPlotNoteModalError(null);
            }
          }}
          onSubmit={() => void savePlotNote()}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="删除分卷"
          message={`确定删除分卷「${deleteTarget.title}」吗？此操作不可恢复。`}
          confirmText="删除"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void deleteVolume(deleteTarget)}
        />
      ) : null}

      {deleteChapterPlanTarget ? (
        <ConfirmModal
          title="删除章节规划"
          message={`确定删除章节规划「${deleteChapterPlanTarget.title}」吗？此操作不可恢复。`}
          confirmText="删除"
          danger
          onCancel={() => setDeleteChapterPlanTarget(null)}
          onConfirm={() => void deleteChapterPlan(deleteChapterPlanTarget)}
        />
      ) : null}

      {deleteKeyEventTarget ? (
        <ConfirmModal
          title="删除关键事件"
          message={`确定删除关键事件「${deleteKeyEventTarget.title}」吗？此操作不可恢复。`}
          confirmText="删除"
          danger
          onCancel={() => setDeleteKeyEventTarget(null)}
          onConfirm={() => void deleteKeyEvent(deleteKeyEventTarget)}
        />
      ) : null}

      {deletePlotNoteTarget ? (
        <ConfirmModal
          title="删除剧情笔记"
          message={`确定删除剧情笔记「${deletePlotNoteTarget.title}」吗？此操作不可恢复。`}
          confirmText="删除"
          danger
          onCancel={() => setDeletePlotNoteTarget(null)}
          onConfirm={() => void deletePlotNote(deletePlotNoteTarget)}
        />
      ) : null}
    </ViewShell>
  );
}
