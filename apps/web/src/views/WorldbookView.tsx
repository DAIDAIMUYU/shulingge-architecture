import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BookOpen, ChevronDown, ChevronRight, Layers, Plus, Save, Search, Sparkles, Trash2, X } from "lucide-react";

import {
  api,
  ApiError,
  type AssistWorldbookField,
  type Character,
  type ProjectSummary,
  type WorldbookCategory,
  type WorldbookCustomField,
  type WorldbookEntry,
  type WorldbookEntryInput,
  type WorldbookImportance,
  type WorldbookOrigin,
  type WorldbookProfile,
  type WorldbookProfileGroup,
  type WorldbookTemplate,
} from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { CenterState, showToast, ViewShell } from "./common.js";
import { ProjectSelector } from "./ProjectSelector.js";
import { Select } from "./Select.js";

type EditorMode = "create" | "edit";
type AssistMode = "original" | "fanfic";

type FieldDef = { key: string; label: string; multiline?: boolean };
type GroupDef = {
  id: WorldbookProfileGroup;
  title: string;
  description?: string;
  defaultOpen: boolean;
  fields: FieldDef[];
};
interface WorldbookAssistField extends AssistWorldbookField {
  custom?: boolean;
  profileGroup?: WorldbookProfileGroup;
}

const DEFAULT_PROJECT_ID = "demo-series";

const ORIGIN_OPTIONS: Array<{ id: WorldbookOrigin; label: string }> = [
  { id: "original", label: "原创设定" },
  { id: "canon", label: "原作设定" },
];

const CATEGORY_OPTIONS: Array<{ id: Exclude<WorldbookCategory, "setting">; label: string }> = [
  { id: "place", label: "地点/场所" },
  { id: "organization", label: "组织/势力" },
  { id: "people", label: "人物群体/种族" },
  { id: "history", label: "事件/历史" },
  { id: "item", label: "物品/道具" },
  { id: "power-system", label: "功法/能力体系" },
  { id: "rule", label: "规则/法则" },
  { id: "culture", label: "文化/习俗" },
  { id: "geography", label: "地理/环境" },
  { id: "politics", label: "政治/权力" },
  { id: "economy", label: "经济/资源" },
  { id: "religion", label: "宗教/信仰" },
  { id: "language", label: "语言/文字" },
  { id: "technology", label: "科技/技术水平" },
  { id: "faction-relation", label: "势力关系" },
  { id: "other", label: "其他" },
];

const IMPORTANCE_OPTIONS: Array<{ id: WorldbookImportance; label: string }> = [
  { id: "core", label: "核心" },
  { id: "important", label: "重要" },
  { id: "minor", label: "次要" },
];

const GROUPS: GroupDef[] = [
  {
    id: "basic",
    title: "基本信息",
    defaultOpen: true,
    fields: [
      { key: "alias", label: "别称/旧称" },
      { key: "parent", label: "所属/上级归属" },
    ],
  },
  {
    id: "content",
    title: "设定内容",
    defaultOpen: true,
    fields: [
      { key: "appearance", label: "外观/样貌", multiline: true },
      { key: "function", label: "功能/作用", multiline: true },
      { key: "history", label: "历史/起源", multiline: true },
      { key: "currentState", label: "现状", multiline: true },
      { key: "mechanism", label: "运作规则/机制", multiline: true },
      { key: "traits", label: "特性/特点", multiline: true },
      { key: "scale", label: "规模/范围" },
      { key: "structure", label: "内部构成/组成", multiline: true },
      { key: "details", label: "重要细节", multiline: true },
    ],
  },
  {
    id: "background",
    title: "世界背景维度",
    description: "主要给地点、组织、世界观类条目使用。物品或单一事件可保持为空。",
    defaultOpen: false,
    fields: [
      { key: "geography", label: "地理环境", multiline: true },
      { key: "historicalEvolution", label: "历史沿革", multiline: true },
      { key: "socialStructure", label: "社会结构", multiline: true },
      { key: "culture", label: "文化习俗", multiline: true },
      { key: "politics", label: "政治/权力", multiline: true },
      { key: "economy", label: "经济/资源", multiline: true },
      { key: "religion", label: "信仰/宗教", multiline: true },
      { key: "dailyLife", label: "日常生活", multiline: true },
      { key: "conflicts", label: "矛盾/冲突", multiline: true },
    ],
  },
  {
    id: "relations",
    title: "关联",
    defaultOpen: true,
    fields: [
      { key: "relatedSettings", label: "相关地点/设定", multiline: true },
      { key: "relatedEvents", label: "相关事件", multiline: true },
      { key: "canonRelation", label: "与原作的关系", multiline: true },
    ],
  },
  {
    id: "writing",
    title: "写作参考",
    defaultOpen: true,
    fields: [
      { key: "mood", label: "氛围/基调", multiline: true },
      { key: "writingNotes", label: "写作注意点", multiline: true },
      { key: "scenes", label: "代表性场景/桥段", multiline: true },
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
  return ascii || `world-outline-${Date.now().toString(36)}`;
}

function categoryLabel(category?: string): string {
  if (category === "setting") {
    return "其他";
  }
  return CATEGORY_OPTIONS.find((option) => option.id === category)?.label ?? "其他";
}

function originLabel(origin?: string): string {
  return ORIGIN_OPTIONS.find((option) => option.id === origin)?.label ?? "原创设定";
}

function importanceLabel(importance?: string): string {
  return IMPORTANCE_OPTIONS.find((option) => option.id === importance)?.label ?? "未标注";
}

function createEmptyProfile(template: WorldbookTemplate): WorldbookProfile {
  return {
    template,
    basic: {},
    content: {},
    background: {},
    relations: {},
    writing: {},
    custom: {
      basic: [],
      content: [],
      background: [],
      relations: [],
      writing: [],
    },
  };
}

function normalizeProfile(profile?: WorldbookProfile, template: WorldbookTemplate = "simple"): WorldbookProfile {
  const base = createEmptyProfile(profile?.template ?? template);
  return {
    ...base,
    ...profile,
    basic: { ...base.basic, ...profile?.basic },
    content: { ...base.content, ...profile?.content },
    background: { ...base.background, ...profile?.background },
    relations: { ...base.relations, ...profile?.relations },
    writing: { ...base.writing, ...profile?.writing },
    custom: {
      ...base.custom,
      ...profile?.custom,
    },
  };
}

function createDraft(origin: WorldbookOrigin, template: WorldbookTemplate, entry?: WorldbookEntry): WorldbookEntryInput {
  const profile = normalizeProfile(entry?.profile, entry?.template ?? entry?.profile?.template ?? template);
  const keywords = entry?.keywords ?? entry?.trigger?.keywords ?? [];
  const relatedCharacters = entry?.relatedCharacters ?? entry?.trigger?.characters ?? [];
  const relatedEvents = entry?.relatedEvents ?? entry?.trigger?.timeline ?? [];
  return {
    id: entry?.id ?? "",
    title: entry?.title ?? "",
    name: entry?.name ?? entry?.title ?? "",
    origin: entry?.origin ?? origin,
    category: entry?.category === "setting" ? "other" : entry?.category ?? "other",
    template: profile.template ?? template,
    importance: entry?.importance,
    summary: entry?.summary ?? "",
    description: entry?.description ?? entry?.sections?.fact ?? "",
    keywords,
    relatedCharacters,
    relatedSettings: entry?.relatedSettings ?? [],
    relatedEvents,
    custom: entry?.custom ?? [],
    profile,
  };
}

function entrySummary(entry: WorldbookEntry): string {
  return entry.summary?.trim()
    || entry.description?.trim().slice(0, 90)
    || entry.profile?.content?.details?.trim().slice(0, 90)
    || "尚未填写简介";
}

function profileSearchText(entry: WorldbookEntry): string {
  return JSON.stringify({
    keywords: entry.keywords,
    profile: entry.profile,
    custom: entry.custom,
    relatedCharacters: entry.relatedCharacters,
    relatedSettings: entry.relatedSettings,
    relatedEvents: entry.relatedEvents,
  });
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
      ...(entry.keywords ?? []),
      ...(entry.relatedCharacters ?? []),
      profileSearchText(entry),
    ].join(" ").toLowerCase().includes(normalized),
  );
}

function groupByCategory(entries: WorldbookEntry[]): Array<{ category: WorldbookCategory; entries: WorldbookEntry[] }> {
  const sorted = [...entries].sort((a, b) => (a.title || a.name || a.id).localeCompare(b.title || b.name || b.id, "zh-Hans-CN"));
  return CATEGORY_OPTIONS.map((option) => ({
    category: option.id,
    entries: sorted.filter((entry) => (entry.category === "setting" ? "other" : entry.category ?? "other") === option.id),
  })).filter((group) => group.entries.length > 0);
}

function customRows(profile: WorldbookProfile | undefined, group: WorldbookProfileGroup): WorldbookCustomField[] {
  return profile?.custom?.[group] ?? [];
}

function collectAssistFields(profile: WorldbookProfile, draft: WorldbookEntryInput): WorldbookAssistField[] {
  const normalized = normalizeProfile(profile, draft.template ?? profile.template ?? "simple");
  const detailed = normalized.template === "detailed";
  const fields: WorldbookAssistField[] = [
    { group: "核心信息", key: "title", label: "名称" },
    { group: "核心信息", key: "category", label: "类型" },
    { group: "核心信息", key: "summary", label: "一句话简介" },
    { group: "核心信息", key: "description", label: "详细描述" },
    { group: "核心信息", key: "importance", label: "重要程度" },
    { group: "核心信息", key: "keywords", label: "关键词" },
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

function collectExistingValues(draft: WorldbookEntryInput, profile: WorldbookProfile, fields: WorldbookAssistField[]): Record<string, string> {
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

    if (field.key === "keywords") {
      values[field.key] = (draft.keywords ?? []).join("，");
    } else if (field.key === "category") {
      values[field.key] = categoryLabel(draft.category);
    } else {
      values[field.key] = typeof draft[field.key as keyof WorldbookEntryInput] === "string"
        ? String(draft[field.key as keyof WorldbookEntryInput]).trim()
        : "";
    }
  }
  return values;
}

function mergeAssistFields(draft: WorldbookEntryInput, fields: WorldbookAssistField[], generated: Record<string, string>): WorldbookEntryInput {
  let next: WorldbookEntryInput = {
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
      next = { ...next, title: generatedValue, name: generatedValue };
    } else if (field.key === "summary" && !next.summary?.trim()) {
      next = { ...next, summary: generatedValue };
    } else if (field.key === "description" && !next.description?.trim()) {
      next = { ...next, description: generatedValue };
    } else if (field.key === "keywords" && !(next.keywords ?? []).length) {
      next = { ...next, keywords: linesToArray(generatedValue) };
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
  onChoose(template: WorldbookTemplate): void;
  onAiGenerate(): void;
  onCancel(): void;
}) {
  return (
    <div className="vault-modal-backdrop character-modal-backdrop" onMouseDown={onCancel}>
      <div className="vault-modal character-template-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head compact">
          <div>
            <h2>新建世界大纲条目</h2>
            <p>精简版用于快速记录核心设定，详细版适合整理完整世界观。</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="character-template-grid">
          <button type="button" className="character-template-card" onClick={() => onChoose("simple")}>
            <Sparkles size={22} />
            <strong>精简版</strong>
            <span>名称、类型、简介、描述、重要程度和关键词，先搭出写作会用到的骨架。</span>
          </button>
          <button type="button" className="character-template-card" onClick={() => onChoose("detailed")}>
            <BookOpen size={22} />
            <strong>详细版</strong>
            <span>按基本信息、设定内容、世界背景、关联和写作参考分块整理。</span>
          </button>
          <button type="button" className="character-template-card character-template-card-wide" onClick={onAiGenerate}>
            <Sparkles size={22} />
            <strong>AI 生成</strong>
            <span>通过几步问答生成一个世界大纲草稿，再进入编辑器检查和保存。</span>
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

function CharacterMultiSelect({
  characters,
  selected,
  onChange,
}: {
  characters: Character[];
  selected: string[];
  onChange(next: string[]): void;
}) {
  if (characters.length === 0) {
    return <div className="muted-box">当前项目还没有角色。相关角色可先留空。</div>;
  }

  return (
    <div className="worldbook-character-picker">
      {characters.map((character) => {
        const checked = selected.includes(character.id);
        return (
          <label className={checked ? "selected" : ""} key={character.id}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => {
                onChange(event.target.checked ? [...selected, character.id] : selected.filter((id) => id !== character.id));
              }}
            />
            <span>{character.name}</span>
          </label>
        );
      })}
    </div>
  );
}

function WorldbookAssistModal({
  loading,
  error,
  onCancel,
  onSubmit,
}: {
  loading: boolean;
  error: string | null;
  onCancel(): void;
  onSubmit(input: { mode: AssistMode; userPrompt: string; entryName?: string; sourceWork?: string; scopeInstruction?: string }): void;
}) {
  const [mode, setMode] = useState<AssistMode>("original");
  const [userPrompt, setUserPrompt] = useState("");
  const [entryName, setEntryName] = useState("");
  const [sourceWork, setSourceWork] = useState("");
  const [scopeInstruction, setScopeInstruction] = useState("");
  const elapsedSeconds = useElapsedSeconds(loading);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const prompt = userPrompt.trim();
    const name = entryName.trim();
    const work = sourceWork.trim();
    if (loading || (mode === "original" ? !prompt : (!name || !work))) {
      return;
    }
    onSubmit({
      mode,
      userPrompt: mode === "fanfic" ? [name, work, prompt].filter(Boolean).join("\n") : prompt,
      entryName: name,
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
            <p>AI 会读取当前世界大纲模板字段和自定义字段，只把生成内容填进空字段，保存前仍可修改。</p>
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
          <span>{mode === "fanfic" ? "补充要求" : "想要一个什么样的世界设定"}</span>
          {mode === "fanfic" ? (
            <div className="form-grid form-grid-2 character-assist-fanfic-grid">
              <label className="form-block">
                <span>条目名</span>
                <input className="input" value={entryName} placeholder="例如：无限城" onChange={(event) => setEntryName(event.target.value)} disabled={loading} />
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
            placeholder={mode === "fanfic" ? "可选：只填历史起源和写作注意点，或补充这个同人设定的偏差" : "例如：一个隐匿在云海里的剑修宗门，外表清冷，内部正在被资源枯竭逼到分裂"}
            onChange={(event) => setUserPrompt(event.target.value)}
            disabled={loading}
          />
        </label>
        <label className="form-block">
          <span>指定填充范围</span>
          <input
            className="input"
            value={scopeInstruction}
            placeholder="可选：例如只填设定内容，或只填世界背景维度；留空则填所有空字段"
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
          <button type="submit" className="btn btn-primary" disabled={loading || (mode === "original" ? !userPrompt.trim() : (!entryName.trim() || !sourceWork.trim()))}>
            <Sparkles size={15} />
            {loading ? `生成中...${elapsedSeconds}s` : "开始填充"}
          </button>
        </div>
      </form>
    </div>
  );
}

function WorldbookAiCreateModal({
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
  onGenerate(input: { mode: AssistMode; template: WorldbookTemplate; userPrompt: string; extraAnswer: string; entryName?: string; sourceWork?: string; category: WorldbookCategory }): void;
}) {
  const [mode, setMode] = useState<AssistMode | null>(null);
  const [userPrompt, setUserPrompt] = useState("");
  const [entryName, setEntryName] = useState("");
  const [sourceWork, setSourceWork] = useState("");
  const [template, setTemplate] = useState<WorldbookTemplate>("simple");
  const [category, setCategory] = useState<WorldbookCategory>("other");
  const [extraAnswer, setExtraAnswer] = useState("");
  const elapsedSeconds = useElapsedSeconds(loading);

  const fanficReady = Boolean(entryName.trim() && sourceWork.trim());
  const originalReady = Boolean(userPrompt.trim() && extraAnswer.trim());
  const canGenerate = Boolean(mode && (mode === "fanfic" ? fanficReady : originalReady));
  const step = !mode ? 1 : mode === "fanfic" ? (fanficReady ? 4 : 2) : !userPrompt.trim() ? 2 : !extraAnswer.trim() ? 3 : 4;

  return (
    <div className="vault-modal-backdrop" onMouseDown={loading ? undefined : onCancel}>
      <div className="vault-modal character-ai-create-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head compact">
          <div>
            <h2>AI 生成世界大纲</h2>
            <p>回答几步问题后，AI 会生成一份世界大纲草稿并打开编辑器，保存前可继续修改。</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} disabled={loading} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="character-ai-chat">
          <div className="character-ai-message ai">先告诉我，这是原创设定还是同人/原作设定？</div>
          <div className="character-assist-mode">
            <button type="button" className={mode === "original" ? "active" : ""} onClick={() => setMode("original")} disabled={loading}>
              原创设定
            </button>
            <button type="button" className={mode === "fanfic" ? "active" : ""} onClick={() => setMode("fanfic")} disabled={loading}>
              同人设定
            </button>
          </div>

          {mode ? (
            <>
              <div className="character-ai-message ai">这条设定属于哪一类？</div>
              <Select
                value={category}
                options={CATEGORY_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
                onChange={(nextValue) => setCategory(nextValue as WorldbookCategory)}
                disabled={loading}
                ariaLabel="世界大纲类型"
              />
            </>
          ) : null}

          {mode === "original" ? (
            <>
              <div className="character-ai-message ai">用一句话描述你想要的世界设定方向。</div>
              <textarea
                className="textarea character-assist-prompt"
                value={userPrompt}
                placeholder="例如：一个靠梦境交易维持秩序的地下城市，所有居民都害怕醒来后失去记忆"
                onChange={(event) => setUserPrompt(event.target.value)}
                disabled={loading}
              />
            </>
          ) : null}
          {mode === "fanfic" ? (
            <>
              <div className="character-ai-message ai">分别写清楚条目名和来源作品，避免 AI 混淆。</div>
              <div className="form-grid form-grid-2 character-assist-fanfic-grid">
                <label className="form-block">
                  <span>条目名</span>
                  <input className="input" value={entryName} placeholder="例如：蝶屋" onChange={(event) => setEntryName(event.target.value)} disabled={loading} />
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
              <div className="character-ai-message ai">这条世界大纲需要精简版还是详细版？</div>
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
              <div className="character-ai-message ai">再补一句：这个设定在故事里最重要的作用、冲突或代价是什么？</div>
              <textarea
                className="textarea character-ai-extra"
                value={extraAnswer}
                placeholder="例如：它提供主角躲避追杀的避难所，但每次进入都要交换一段真实记忆。"
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
                  category,
                  userPrompt: mode === "fanfic" ? `${entryName.trim()}，${sourceWork.trim()}` : userPrompt.trim(),
                  extraAnswer: extraAnswer.trim(),
                  entryName: entryName.trim(),
                  sourceWork: sourceWork.trim(),
                });
              }
            }}
          >
            <Sparkles size={15} />
            {loading ? `生成中...${elapsedSeconds}s` : "生成大纲草稿"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorldbookEditor({
  mode,
  value,
  characters,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  mode: EditorMode;
  value: WorldbookEntryInput;
  characters: Character[];
  saving: boolean;
  error: string | null;
  onChange(next: WorldbookEntryInput): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const profile = value.profile ?? createEmptyProfile(value.template ?? "simple");
  const isDetailed = (value.template ?? profile.template ?? "simple") === "detailed";
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assistNotice, setAssistNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<WorldbookProfileGroup, boolean>>(() =>
    GROUPS.reduce((result, group) => ({ ...result, [group.id]: group.defaultOpen }), {} as Record<WorldbookProfileGroup, boolean>),
  );

  const updateProfile = (nextProfile: WorldbookProfile) => {
    onChange({ ...value, profile: nextProfile, template: nextProfile.template ?? value.template });
  };

  const updateGroupField = (group: WorldbookProfileGroup, key: string, text: string) => {
    updateProfile({
      ...profile,
      [group]: {
        ...(profile[group] ?? {}),
        [key]: text,
      },
    });
  };

  const updateCustom = (group: WorldbookProfileGroup, rows: WorldbookCustomField[]) => {
    updateProfile({
      ...profile,
      custom: {
        ...(profile.custom ?? {}),
        [group]: rows,
      },
    });
  };

  const renderField = (group: WorldbookProfileGroup, field: FieldDef) => {
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
      <div className={compact ? "form-grid" : "character-field-grid"}>
        {group.fields.map((field) => renderField(group.id, field))}
      </div>
      <CustomFieldsEditor rows={customRows(profile, group.id)} onChange={(rows) => updateCustom(group.id, rows)} />
    </div>
  );

  const runAssist = async (input: { mode: AssistMode; userPrompt: string; entryName?: string; sourceWork?: string; scopeInstruction?: string }) => {
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
      const response = await api.assistWorldbook({
        mode: input.mode,
        userPrompt: input.userPrompt,
        entryName: input.entryName,
        sourceWork: input.sourceWork,
        scopeInstruction: input.scopeInstruction,
        template: value.template ?? normalizedProfile.template,
        category: categoryLabel(value.category),
        fields: fields.map(({ group, key, label }) => ({ group, key, label })),
        existingValues: collectExistingValues(value, normalizedProfile, fields),
      });
      const nextDraft = mergeAssistFields({ ...value, profile: normalizedProfile }, fields, response.fields);
      onChange(nextDraft);
      setAssistOpen(false);
      setAssistNotice(
        input.mode === "fanfic"
          ? "AI 已填入空字段。同人资料可能不准确，请核对后再保存。"
          : "AI 已填入空字段，请检查后再保存世界大纲。",
      );
    } catch (assistErrorValue) {
      setAssistError(assistErrorValue instanceof ApiError ? assistErrorValue.message : "AI 辅助填充失败");
    } finally {
      setAssistLoading(false);
    }
  };

  return (
    <div className="vault-modal-backdrop character-modal-backdrop" onMouseDown={onCancel}>
      <div className="vault-modal character-modal worldbook-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head">
          <div>
            <h2>{mode === "create" ? "新建世界大纲条目" : `编辑世界大纲 · ${value.title}`}</h2>
            <p>{isDetailed ? "详细版按分块折叠展示，世界背景维度默认收起。" : "精简版只保留 AI 写作最常用的核心信息。"}</p>
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
                <span>名称</span>
                <input className="input" value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value, name: event.target.value })} />
              </label>
              <label className="form-block">
                <span>来源</span>
                <Select
                  value={value.origin ?? "original"}
                  options={ORIGIN_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
                  onChange={(nextValue) => onChange({ ...value, origin: nextValue as WorldbookOrigin })}
                  ariaLabel="来源"
                />
              </label>
              <label className="form-block">
                <span>类型</span>
                <Select
                  value={value.category === "setting" ? "other" : value.category ?? "other"}
                  options={CATEGORY_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
                  onChange={(nextValue) => onChange({ ...value, category: nextValue as WorldbookCategory })}
                  ariaLabel="类型"
                />
              </label>
            </div>
            <div className="form-grid form-grid-3">
              <label className="form-block">
                <span>一句话简介</span>
                <input className="input" value={value.summary ?? ""} onChange={(event) => onChange({ ...value, summary: event.target.value })} />
              </label>
              <label className="form-block">
                <span>重要程度</span>
                <Select
                  value={value.importance ?? ""}
                  options={[
                    { value: "", label: "未标注" },
                    ...IMPORTANCE_OPTIONS.map((option) => ({ value: option.id, label: option.label })),
                  ]}
                  onChange={(nextValue) => onChange({ ...value, importance: (nextValue || undefined) as WorldbookImportance | undefined })}
                  ariaLabel="重要程度"
                />
              </label>
              <label className="form-block">
                <span>关键词</span>
                <input className="input" value={(value.keywords ?? []).join("，")} onChange={(event) => onChange({ ...value, keywords: linesToArray(event.target.value) })} placeholder="用逗号分隔" />
              </label>
            </div>
            <label className="form-block">
              <span>详细描述</span>
              <textarea className="textarea worldbook-description" value={value.description ?? ""} onChange={(event) => onChange({ ...value, description: event.target.value })} />
            </label>
          </section>

          {isDetailed ? (
            <div className="character-accordion">
              {GROUPS.map((group) => {
                const open = Boolean(expanded[group.id]);
                return (
                  <section className="character-accordion-item" key={group.id}>
                    <button
                      type="button"
                      className="character-accordion-head"
                      onClick={() => setExpanded((current) => ({ ...current, [group.id]: !open }))}
                    >
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span>{group.title}</span>
                    </button>
                    {open ? (
                      <div className="character-accordion-body">
                        {group.id === "relations" ? (
                          <div className="character-field-stack">
                            <label className="form-block">
                              <span>相关角色</span>
                              <CharacterMultiSelect characters={characters} selected={value.relatedCharacters ?? []} onChange={(next) => onChange({ ...value, relatedCharacters: next })} />
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
            <WorldbookAssistModal
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
            {saving ? "保存中..." : "保存大纲"}
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
  const [characters, setCharacters] = useState<Character[]>([]);
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState<WorldbookOrigin>("original");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaultMissing, setVaultMissing] = useState(false);
  const [templateChoosing, setTemplateChoosing] = useState(false);
  const [aiCreating, setAiCreating] = useState(false);
  const [aiCreateLoading, setAiCreateLoading] = useState(false);
  const [aiCreateError, setAiCreateError] = useState<string | null>(null);
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
        setCharacters([]);
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
      const [nextEntries, nextCharacters] = resolvedProjectId
        ? await Promise.all([api.listWorldbookByProject(resolvedProjectId), api.listCharactersByProject(resolvedProjectId)])
        : [[], []];
      setProjects(nextProjects);
      setEntries(nextEntries);
      setCharacters(nextCharacters);
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : "加载世界大纲失败");
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

  const startCreate = (template: WorldbookTemplate) => {
    setTemplateChoosing(false);
    setDraft(createDraft(origin, template));
    setSaveError(null);
    setEditorMode("create");
  };

  const generateWorldbookDraft = async (input: { mode: AssistMode; template: WorldbookTemplate; userPrompt: string; extraAnswer: string; entryName?: string; sourceWork?: string; category: WorldbookCategory }) => {
    const profile = createEmptyProfile(input.template);
    const baseDraft: WorldbookEntryInput = {
      ...createDraft(input.mode === "fanfic" ? "canon" : origin, input.template),
      category: input.category,
      template: input.template,
      profile,
      title: input.entryName ?? "",
      name: input.entryName ?? "",
    };
    const fields = collectAssistFields(profile, baseDraft);
    const prompt = [
      input.userPrompt,
      input.mode === "original" && input.extraAnswer ? `关键补充：${input.extraAnswer}` : "",
    ].filter(Boolean).join("\n");

    setAiCreateLoading(true);
    setAiCreateError(null);
    try {
      const response = await api.assistWorldbook({
        mode: input.mode,
        userPrompt: prompt,
        entryName: input.entryName,
        sourceWork: input.sourceWork,
        template: input.template,
        category: categoryLabel(input.category),
        projectId,
        fields: fields.map(({ group, key, label }) => ({ group, key, label })),
        existingValues: collectExistingValues(baseDraft, profile, fields),
      });
      const nextDraft = mergeAssistFields(baseDraft, fields, response.fields);
      const title = nextDraft.title || response.fields.title || response.fields["名称"] || input.entryName || input.userPrompt.split(/[，。,\n]/)[0] || "";
      setDraft({
        ...nextDraft,
        title: title.slice(0, 48),
        name: (nextDraft.name || title).slice(0, 48),
        origin: input.mode === "fanfic" ? "canon" : origin,
      });
      setAiCreating(false);
      setTemplateChoosing(false);
      setEditorMode("create");
      setSaveError(null);
      showToast(
        input.mode === "fanfic"
          ? "AI 已生成世界大纲草稿。同人资料可能不准确，请核对后再保存。"
          : "AI 已生成世界大纲草稿，请检查后再保存。",
        "success",
      );
    } catch (generateError) {
      setAiCreateError(generateError instanceof ApiError ? generateError.message : "AI 生成世界大纲失败");
    } finally {
      setAiCreateLoading(false);
    }
  };

  const startEdit = (entry: WorldbookEntry) => {
    setDraft(createDraft(entry.origin ?? origin, entry.template ?? entry.profile?.template ?? "simple", entry));
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
        category: draft.category === "setting" ? "other" : draft.category ?? "other",
        template: draft.template ?? draft.profile?.template ?? "simple",
        keywords: draft.keywords ?? [],
        relatedCharacters: draft.relatedCharacters ?? [],
        relatedSettings: linesToArray(draft.profile?.relations?.relatedSettings ?? arrayToLines(draft.relatedSettings)),
        relatedEvents: linesToArray(draft.profile?.relations?.relatedEvents ?? arrayToLines(draft.relatedEvents)),
        custom: draft.custom ?? [],
        profile: {
          ...(draft.profile ?? createEmptyProfile(draft.template ?? "simple")),
          template: draft.template ?? draft.profile?.template ?? "simple",
        },
        sections: undefined,
        trigger: undefined,
        relatedNovels: undefined,
        appliesToAgents: undefined,
        relatedChapters: undefined,
      };
      const isCreate = editorMode === "create";
      if (isCreate) {
        await api.createWorldbookEntry(projectId, payload);
      } else {
        await api.updateWorldbookEntry(projectId, payload.id, payload);
      }
      setEditorMode(null);
      setDraft(null);
      setOrigin(payload.origin ?? origin);
      showToast(isCreate ? "世界大纲条目已创建" : "世界大纲已保存", "success");
      await loadData(projectId);
    } catch (persistError) {
      setSaveError(persistError instanceof ApiError ? persistError.message : "保存世界大纲失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: WorldbookEntry) => {
    try {
      await api.deleteWorldbookEntry(projectId, entry.id);
      setDeleteTarget(null);
      showToast("世界大纲条目已删除", "success");
      await loadData(projectId);
    } catch (deleteError) {
      showToast(deleteError instanceof ApiError ? deleteError.message : "删除世界大纲失败", "error");
    }
  };

  const showState = loading || error !== null || vaultMissing || filteredEntries.length === 0;

  return (
    <ViewShell
      title="世界大纲"
      subtitle="按项目整理原创与原作设定，让 AI 通读世界观后再辅助写作。"
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
            新建大纲条目
          </button>
        </>
      }
    >
      <div className="toolbar-row">
        <div className="search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、简介、关键词或相关角色..." />
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
          emptyTitle={search ? "没有匹配的大纲条目" : `还没有${originLabel(origin)}`}
          emptyText={search ? "换个关键词试试，或切换原创/原作页签。" : "先创建第一条世界设定，AI 写作时会通读这些世界观资料。"}
          emptyActionLabel={search ? undefined : "新建第一个大纲条目"}
          onEmptyAction={search ? undefined : () => setTemplateChoosing(true)}
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
                        {entry.importance ? <span className="tag">{importanceLabel(entry.importance)}</span> : null}
                      </div>
                      <p>{entrySummary(entry)}</p>
                      <div className="tag-row">
                        <span className="tag">{originLabel(entry.origin)}</span>
                        <span className="tag">{entry.template === "detailed" || entry.profile?.template === "detailed" ? "详细版" : "精简版"}</span>
                        {(entry.keywords ?? []).slice(0, 4).map((keyword) => <span className="tag" key={keyword}>{keyword}</span>)}
                        <span className="tag">{(entry.relatedCharacters ?? []).length} 角色</span>
                      </div>
                    </div>
                    <div className="view-actions">
                      <button type="button" className="btn" onClick={() => startEdit(entry)}>编辑</button>
                      <button type="button" className="btn-icon danger" onClick={() => setDeleteTarget(entry)} aria-label="删除世界大纲条目">
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
        <WorldbookAiCreateModal
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
            void generateWorldbookDraft(input);
          }}
        />
      ) : null}

      {editorMode && draft ? (
        <WorldbookEditor
          mode={editorMode}
          value={draft}
          characters={characters}
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
          title="删除世界大纲条目"
          message={`确定删除世界大纲条目「${deleteTarget.title}」吗？此操作不可恢复。`}
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
