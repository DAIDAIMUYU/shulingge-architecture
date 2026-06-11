import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  api,
  ApiError,
  type AgentConfig,
  type AgentConfigInput,
  type AgentInfo,
  type AgentOutputFormat,
  type AgentPermissionMode,
  type AgentPermissions,
  type AgentSpeakConfig,
  type ModelConfig,
  type SkillRegistryRecord,
} from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { ViewShell } from "./common.js";

const AGENT_TYPE_OPTIONS: Array<{ value: AgentPermissionMode; label: string; hint: string }> = [
  { value: "controller", label: "总控", hint: "汇总结果、做最终判断" },
  { value: "writer", label: "正文写作", hint: "允许产出或改写正文" },
  { value: "blocker", label: "阻断器", hint: "发现硬性问题时阻止流程继续" },
  { value: "checker", label: "检查器", hint: "检查设定、角色、时间线等问题" },
  { value: "advisor", label: "顾问", hint: "只给建议，不直接改正文" },
  { value: "state-updater", label: "状态更新器", hint: "更新摘要、状态和资料" },
];

const READ_SCOPE_OPTIONS = [
  { value: "manuscript", label: "正文", hint: "当前章节正文" },
  { value: "outline", label: "大纲", hint: "正文标题与章节结构" },
  { value: "worldbook", label: "世界书", hint: "设定、地点、体系" },
  { value: "characters", label: "角色", hint: "角色卡与人物信息" },
  { value: "relations", label: "关系", hint: "人物关系与情感线" },
  { value: "timeline", label: "时间线", hint: "事件顺序与在场状态" },
  { value: "rules", label: "规则", hint: "写作规则与禁区" },
  { value: "summaries", label: "摘要", hint: "章节摘要和历史上下文" },
  { value: "states", label: "状态", hint: "角色或世界状态" },
  { value: "chapter-metadata", label: "章节元数据", hint: "标题、状态、字数等" },
  { value: "runs", label: "运行记录", hint: "Agent 历史执行结果" },
  { value: "workflow-results", label: "流程结果", hint: "工作流汇总信息" },
] as const;

const OUTPUT_FORMAT_OPTIONS: Array<{ value: AgentOutputFormat; label: string; hint: string }> = [
  { value: "text", label: "普通文本", hint: "适合只给建议或说明的 Agent" },
  { value: "json+text", label: "结构化 + 文本", hint: "适合需要被流程读取结果的 Agent" },
];

const PERMISSION_OPTIONS: Array<{ key: keyof AgentPermissions; label: string; hint: string }> = [
  { key: "canWriteDraft", label: "可写正文", hint: "允许生成新正文" },
  { key: "canRewriteDraft", label: "可重写正文", hint: "允许重写整段或整章" },
  { key: "canPatchParagraph", label: "可改段落", hint: "允许局部修改段落" },
  { key: "canBlockWorkflow", label: "可阻断流程", hint: "发现问题时可让流程停下" },
  { key: "canRequestRewrite", label: "可请求重写", hint: "可要求写作 Agent 返工" },
  { key: "canWriteState", label: "可写状态", hint: "允许更新摘要、状态库等资料" },
  { key: "canUpdateRules", label: "可更新规则", hint: "允许写入规则变更" },
];

const DEFAULT_PERMISSIONS: AgentPermissions = {
  canWriteDraft: false,
  canRewriteDraft: false,
  canPatchParagraph: false,
  canBlockWorkflow: false,
  canRequestRewrite: false,
  canWriteState: false,
  canUpdateRules: false,
};

const DEFAULT_SPEAK: AgentSpeakConfig = {
  speak: true,
  showReasoning: false,
  showStructured: false,
  onlyOnFailure: false,
};

type FeedbackKind = "info" | "success" | "error";

interface FeedbackState {
  kind: FeedbackKind;
  message: string;
}

interface AgentDraft {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  type: AgentPermissionMode;
  workflowId: string;
  order: string;
  modelConfigId: string;
  readScope: string[];
  builtInRules: string[];
  skills: string[];
  outputFormat: AgentOutputFormat;
  permissions: AgentPermissions;
  speak: AgentSpeakConfig;
}

function typeLabel(type?: string): string {
  return AGENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type ?? "未指定";
}

function legacyRole(agent: AgentInfo | AgentConfig): string | undefined {
  return "role" in agent ? agent.role : undefined;
}

function modelDisplay(agent: AgentConfig, models: ModelConfig[]): { label: string; kind: "explicit" | "default" | "missing" } {
  const availableModels = models.filter((model) => model.hasKey);
  const boundModel = agent.modelConfigId
    ? models.find((model) => model.id === agent.modelConfigId && model.hasKey)
    : undefined;

  if (boundModel) {
    return {
      label: boundModel.model ? `${boundModel.id} · ${boundModel.model}` : boundModel.id,
      kind: "explicit",
    };
  }

  if (availableModels[0]) {
    return {
      label: "默认(第一个模型)",
      kind: "default",
    };
  }

  return {
    label: "暂无可用模型",
    kind: "missing",
  };
}

function createAgentDraft(agent?: AgentInfo | AgentConfig, nextOrder = 10): AgentDraft {
  return {
    id: agent?.id ?? "",
    name: agent?.name ?? "",
    description: agent?.description ?? (agent ? legacyRole(agent) : undefined) ?? "",
    enabled: agent?.enabled ?? true,
    type: agent?.type ?? "advisor",
    workflowId: agent?.workflowId ?? "",
    order: String(agent?.order ?? nextOrder),
    modelConfigId: agent?.modelConfigId ?? "",
    readScope: [...(agent?.readScope ?? [])],
    builtInRules: [...(agent?.builtInRules ?? [])],
    skills: [...(agent?.skills ?? [])],
    outputFormat: agent?.outputFormat ?? "text",
    permissions: { ...DEFAULT_PERMISSIONS, ...(agent?.permissions ?? {}) },
    speak: { ...DEFAULT_SPEAK, ...(agent?.speak ?? {}) },
  };
}

function toAgentPayload(draft: AgentDraft, mode: "create" | "edit"): AgentConfigInput {
  return {
    id: mode === "create" ? undefined : draft.id.trim() || undefined,
    name: draft.name.trim(),
    description: draft.description.trim(),
    enabled: draft.enabled,
    type: draft.type,
    workflowId: draft.workflowId.trim() || undefined,
    order: Number.isFinite(Number(draft.order)) ? Math.max(0, Number(draft.order)) : 0,
    modelConfigId: draft.modelConfigId.trim(),
    readScope: draft.readScope,
    builtInRules: draft.builtInRules,
    skills: draft.skills,
    outputFormat: draft.outputFormat,
    permissions: draft.permissions,
    speak: {
      ...draft.speak,
      displayName: draft.speak.displayName?.trim() || undefined,
      icon: draft.speak.icon?.trim() || undefined,
    },
  };
}

function normalizeAgent(agent: AgentInfo): AgentConfig {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description ?? legacyRole(agent) ?? "",
    enabled: agent.enabled ?? true,
    type: agent.type ?? "advisor",
    workflowId: agent.workflowId,
    order: agent.order ?? 0,
    modelConfigId: agent.modelConfigId ?? "",
    readScope: agent.readScope ?? [],
    builtInRules: agent.builtInRules ?? [],
    skills: agent.skills ?? [],
    outputFormat: agent.outputFormat ?? "text",
    permissions: { ...DEFAULT_PERMISSIONS, ...(agent.permissions ?? {}) },
    speak: { ...DEFAULT_SPEAK, ...(agent.speak ?? {}) },
    schemaVersion: agent.schemaVersion,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

function ToggleRow({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch-row agent-switch-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <span className="agent-switch-label">{label}</span>
        {hint ? <span className="agent-field-hint">{hint}</span> : null}
      </span>
    </label>
  );
}

function TagInput({
  label,
  hint,
  values,
  placeholder,
  options,
  datalistId,
  onChange,
}: {
  label: string;
  hint?: string;
  values: string[];
  placeholder: string;
  options?: Array<{ value: string; label: string }>;
  datalistId?: string;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const addTag = () => {
    const next = draft.trim();
    if (!next || values.includes(next)) {
      setDraft("");
      return;
    }
    onChange([...values, next]);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    }
  };

  return (
    <label className="form-block agent-tag-block">
      <span>{label}</span>
      {hint ? <span className="agent-field-hint">{hint}</span> : null}
      <div className="agent-tag-input">
        <div className="agent-tag-list">
          {values.map((value) => {
            const option = options?.find((item) => item.value === value);
            return (
              <span className="tag agent-tag" key={value} title={value}>
                {option?.label ?? value}
                <button
                  type="button"
                  aria-label={`删除 ${option?.label ?? value}`}
                  onClick={() => onChange(values.filter((item) => item !== value))}
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
          <input
            value={draft}
            list={datalistId}
            placeholder={values.length ? "" : placeholder}
            onBlur={addTag}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {datalistId && options ? (
            <datalist id={datalistId}>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </datalist>
          ) : null}
        </div>
      </div>
    </label>
  );
}

function ScopePicker({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const toggle = (value: string, checked: boolean) => {
    if (checked) {
      onChange(values.includes(value) ? values : [...values, value]);
      return;
    }
    onChange(values.filter((item) => item !== value));
  };

  return (
    <div className="agent-scope-grid">
      {READ_SCOPE_OPTIONS.map((option) => (
        <label className="agent-scope-option" key={option.value}>
          <input
            type="checkbox"
            checked={values.includes(option.value)}
            onChange={(event) => toggle(option.value, event.target.checked)}
          />
          <span>
            <span className="agent-switch-label">{option.label}</span>
            <span className="agent-field-hint">{option.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function AgentEditorModal({
  mode,
  draft,
  models,
  skills,
  saving,
  feedback,
  onChange,
  onPermissionChange,
  onSpeakChange,
  onSave,
  onCancel,
}: {
  mode: "create" | "edit";
  draft: AgentDraft;
  models: ModelConfig[];
  skills: SkillRegistryRecord[];
  saving: boolean;
  feedback: FeedbackState | null;
  onChange: (patch: Partial<AgentDraft>) => void;
  onPermissionChange: (key: keyof AgentPermissions, value: boolean) => void;
  onSpeakChange: (patch: Partial<AgentSpeakConfig>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const skillOptions = skills.map((skill) => ({
    value: skill.id,
    label: skill.name ? `${skill.name} (${skill.id})` : skill.id,
  }));
  const availableModels = models.filter((model) => model.hasKey);
  const currentType = AGENT_TYPE_OPTIONS.find((option) => option.value === draft.type);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="vault-modal-backdrop agent-modal-backdrop" onMouseDown={onCancel}>
      <section
        className="vault-modal agent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="agent-modal-head">
          <div>
            <h2 id="agent-editor-title">{mode === "create" ? "新建 Agent" : "编辑 Agent"}</h2>
            <p>只需要填写常用区即可，高级设置可按需展开。</p>
          </div>
          <button type="button" className="btn-icon" aria-label="关闭" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        <div className="agent-modal-body">
          {feedback ? (
            <div className={`model-feedback model-feedback-${feedback.kind}`}>
              {feedback.kind === "success" ? <CheckCircle2 size={16} /> : feedback.kind === "error" ? <AlertCircle size={16} /> : null}
              <span>{feedback.message}</span>
            </div>
          ) : null}

          <div className="model-editor-section">
            <div className="model-editor-section-title">常用设置</div>
            <div className="form-grid form-grid-2">
              <label className="form-block">
                <span>名字</span>
                <span className="agent-field-hint">给这个 Agent 起一个你能看懂的名字。</span>
                <input
                  className="input"
                  value={draft.name}
                  placeholder="例如 情节顾问"
                  onChange={(event) => onChange({ name: event.target.value })}
                />
              </label>
              <label className="form-block">
                <span>类型</span>
                <span className="agent-field-hint">{currentType?.hint ?? "选择它在流程中的定位。"}</span>
                <select
                  className="input"
                  value={draft.type}
                  onChange={(event) => onChange({ type: event.target.value as AgentPermissionMode })}
                >
                  {AGENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="form-block">
              <span>职责描述</span>
              <span className="agent-field-hint">写清楚它负责检查什么、建议什么，或允许做什么。</span>
              <textarea
                className="textarea agent-description"
                value={draft.description}
                placeholder="例如：检查本章情节推进是否自然，指出节奏拖沓、动机不足或伏笔断裂的问题。"
                onChange={(event) => onChange({ description: event.target.value })}
              />
            </label>

            <div className="form-grid form-grid-2">
              <label className="form-block">
                <span>绑定模型</span>
                <span className="agent-field-hint">可以先留空，之后在模型配置完成后再回来绑定。</span>
                <select
                  className="input"
                  value={draft.modelConfigId}
                  onChange={(event) => onChange({ modelConfigId: event.target.value })}
                >
                  {availableModels.length > 0 ? (
                    <option value="">默认(使用第一个可用模型)</option>
                  ) : (
                    <option value="" disabled>暂无可用模型，请先在设置页配置模型</option>
                  )}
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id}{model.model ? ` · ${model.model}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <ToggleRow
                checked={draft.enabled}
                label="启用这个 Agent"
                hint="停用后它不会参与后续流程。"
                onChange={(enabled) => onChange({ enabled })}
              />
            </div>

            <ToggleRow
              checked={draft.speak.speak}
              label="允许在对话区发言"
              hint="开启后，流程运行时这个 Agent 的关键结论可以显示给用户。"
              onChange={(speak) => onSpeakChange({ speak })}
            />

            <div className="form-grid form-grid-2">
              <TagInput
                label="技能(Skill)"
                hint="可从已有技能中选择，也可以手动输入技能 ID 后回车添加。"
                values={draft.skills}
                placeholder={skillOptions.length ? "输入或选择技能 ID" : "暂无技能列表，可手动输入"}
                options={skillOptions}
                datalistId="agent-skill-options"
                onChange={(skillsValue) => onChange({ skills: skillsValue })}
              />
              <TagInput
                label="内置规则"
                hint="当前还没有可读取的规则列表接口；先手动输入规则 ID，后续规则页完善后再接下拉。"
                values={draft.builtInRules}
                placeholder="输入规则 ID 后回车添加"
                onChange={(builtInRules) => onChange({ builtInRules })}
              />
            </div>
          </div>

          <div className="agent-advanced">
            <button
              type="button"
              className="model-advanced-toggle"
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              {advancedOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              高级设置
            </button>
            {advancedOpen ? (
              <div className="model-advanced-panel agent-advanced-panel">
                <div className="model-editor-section">
                  <div className="model-editor-section-title">读取范围</div>
                  <p className="agent-section-note">决定这个 Agent 能读取哪些上下文。默认值来自预置 Agent，普通用户通常不用修改。</p>
                  <ScopePicker values={draft.readScope} onChange={(readScope) => onChange({ readScope })} />
                </div>

                <div className="model-editor-section agent-editor-section">
                  <div className="model-editor-section-title">权限</div>
                  <p className="agent-section-note">权限越高，后续编排时它能做的事越多。只聊天或提建议的 Agent 建议保持关闭。</p>
                  <div className="agent-switch-grid">
                    {PERMISSION_OPTIONS.map((option) => (
                      <ToggleRow
                        key={option.key}
                        checked={draft.permissions[option.key]}
                        label={option.label}
                        hint={option.hint}
                        onChange={(checked) => onPermissionChange(option.key, checked)}
                      />
                    ))}
                  </div>
                </div>

                <div className="model-editor-section agent-editor-section">
                  <div className="model-editor-section-title">输出与显示</div>
                  <div className="form-grid form-grid-2">
                    <label className="form-block">
                      <span>输出格式</span>
                      <span className="agent-field-hint">{OUTPUT_FORMAT_OPTIONS.find((item) => item.value === draft.outputFormat)?.hint}</span>
                      <select
                        className="input"
                        value={draft.outputFormat}
                        onChange={(event) => onChange({ outputFormat: event.target.value as AgentOutputFormat })}
                      >
                        {OUTPUT_FORMAT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="form-block">
                      <span>执行顺序</span>
                      <span className="agent-field-hint">数字越小越先运行。</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={draft.order}
                        onChange={(event) => onChange({ order: event.target.value })}
                      />
                    </label>
                    <label className="form-block">
                      <span>发言显示名</span>
                      <span className="agent-field-hint">留空时使用 Agent 名字。</span>
                      <input
                        className="input"
                        value={draft.speak.displayName ?? ""}
                        placeholder="例如 情节顾问"
                        onChange={(event) => onSpeakChange({ displayName: event.target.value })}
                      />
                    </label>
                    <label className="form-block">
                      <span>发言图标</span>
                      <span className="agent-field-hint">可填简短符号或图标名。</span>
                      <input
                        className="input"
                        value={draft.speak.icon ?? ""}
                        placeholder="例如 ✦ 或 bot"
                        onChange={(event) => onSpeakChange({ icon: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="agent-switch-grid">
                    <ToggleRow
                      checked={draft.speak.showReasoning}
                      label="显示推理"
                      hint="仅用于后续可解释输出。"
                      onChange={(showReasoning) => onSpeakChange({ showReasoning })}
                    />
                    <ToggleRow
                      checked={draft.speak.showStructured}
                      label="显示结构化输出"
                      hint="展示 JSON 或结构化检查结果。"
                      onChange={(showStructured) => onSpeakChange({ showStructured })}
                    />
                    <ToggleRow
                      checked={draft.speak.onlyOnFailure}
                      label="仅失败时发言"
                      hint="平时保持安静，只在发现问题时提示。"
                      onChange={(onlyOnFailure) => onSpeakChange({ onlyOnFailure })}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="vault-modal-actions agent-modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={onSave}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function AgentsView() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [skills, setSkills] = useState<SkillRegistryRecord[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDraft>(() => createAgentDraft(undefined, 10));
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AgentConfig | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [modalFeedback, setModalFeedback] = useState<FeedbackState | null>(null);

  const sortedAgents = useMemo(
    () => [...agents].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
    [agents],
  );
  const nextOrder = sortedAgents.reduce((max, agent) => Math.max(max, agent.order), 0) + 10;
  const selectedAgent = selectedAgentId ? agents.find((agent) => agent.id === selectedAgentId) ?? null : null;

  async function loadAgents(): Promise<void> {
    setLoading(true);
    try {
      const list = await api.listAgents();
      setAgents(list.map(normalizeAgent));
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "Agent 列表加载失败" });
    } finally {
      setLoading(false);
    }
  }

  async function loadModels(): Promise<void> {
    try {
      setModels(await api.listModels());
    } catch {
      setModels([]);
    }
  }

  async function loadSkills(): Promise<void> {
    try {
      setSkills(await api.listSkills());
    } catch {
      setSkills([]);
    }
  }

  useEffect(() => {
    void loadAgents();
    void loadModels();
    void loadSkills();
  }, []);

  function startCreate(): void {
    setSelectedAgentId(null);
    setDraft(createAgentDraft(undefined, nextOrder));
    setMode("create");
    setFeedback(null);
    setModalFeedback(null);
  }

  function startEdit(agent: AgentConfig): void {
    setSelectedAgentId(agent.id);
    setDraft(createAgentDraft(agent, nextOrder));
    setMode("edit");
    setFeedback(null);
    setModalFeedback(null);
  }

  function closeEditor(): void {
    setSelectedAgentId(null);
    setDraft(createAgentDraft(undefined, nextOrder));
    setMode("idle");
    setModalFeedback(null);
  }

  async function saveAgent(): Promise<void> {
    const payload = toAgentPayload(draft, mode === "edit" ? "edit" : "create");
    if (!payload.name) {
      setModalFeedback({ kind: "error", message: "请填写 Agent 名字" });
      return;
    }

    setSaving(true);
    setFeedback(null);
    setModalFeedback(null);
    try {
      const saved = mode === "edit" && selectedAgent
        ? await api.updateAgent(selectedAgent.id, payload)
        : await api.createAgent(payload);
      await loadAgents();
      closeEditor();
      setFeedback({
        kind: "success",
        message: mode === "create" ? `Agent「${saved.name}」已创建` : `Agent「${saved.name}」已保存`,
      });
    } catch (error) {
      setModalFeedback({ kind: "error", message: error instanceof Error ? error.message : "Agent 保存失败" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteAgent(agent: AgentConfig): Promise<void> {
    setAgentToDelete(null);
    setFeedback(null);
    try {
      await api.deleteAgent(agent.id);
      await loadAgents();
      if (selectedAgentId === agent.id) {
        closeEditor();
      }
      setFeedback({ kind: "success", message: `Agent「${agent.name}」已删除` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Agent 删除失败" });
    }
  }

  const updateDraft = (patch: Partial<AgentDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const updatePermission = (key: keyof AgentPermissions, value: boolean) =>
    setDraft((current) => ({
      ...current,
      permissions: { ...current.permissions, [key]: value },
    }));
  const updateSpeak = (patch: Partial<AgentSpeakConfig>) =>
    setDraft((current) => ({
      ...current,
      speak: { ...current.speak, ...patch },
    }));

  return (
    <ViewShell title="Agent 管理" subtitle="管理写作流程中的 Agent、模型绑定、技能、权限与发言配置">
      <div className="stack-list">
        <section className="editor-card">
          <div className="editor-card-head">
            <div>
              <h2>Agent 列表</h2>
              <p className="view-sub">共 {sortedAgents.length} 个 Agent，按执行顺序排列。点击某一行即可编辑。</p>
            </div>
            <div className="view-actions">
              <button type="button" className="btn btn-primary" onClick={startCreate}>
                <Plus size={15} />
                新建 Agent
              </button>
            </div>
          </div>

          {feedback ? (
            <div className={`model-feedback model-feedback-${feedback.kind}`}>
              {feedback.kind === "success" ? <CheckCircle2 size={16} /> : feedback.kind === "error" ? <AlertCircle size={16} /> : null}
              <span>{feedback.message}</span>
            </div>
          ) : null}

          <div className="list-card agent-list-card">
            <div className="list-row head">
              <span className="col" style={{ width: 54 }}>顺序</span>
              <span className="col col-grow">Agent</span>
              <span className="col" style={{ width: 112 }}>类型</span>
              <span className="col" style={{ width: 86 }}>状态</span>
              <span className="col" style={{ width: 150 }}>模型</span>
              <span className="col" style={{ width: 78 }}>操作</span>
            </div>
            {loading ? (
              <div className="center-state" style={{ minHeight: 220 }}>
                <div className="spinner" />
                <span>正在加载 Agent...</span>
              </div>
            ) : sortedAgents.length === 0 ? (
              <div className="center-state" style={{ minHeight: 220 }}>
                <span>还没有 Agent，点击「新建 Agent」创建一个。</span>
              </div>
            ) : (
              sortedAgents.map((agent, index) => {
                const model = modelDisplay(agent, models);
                return (
                  <div
                    className="list-row model-list-row"
                    key={agent.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => startEdit(agent)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        startEdit(agent);
                      }
                    }}
                  >
                    <span className="faint" style={{ width: 54 }}>{index + 1}</span>
                    <span className="col col-grow">
                      <div className="col-name">{agent.name}</div>
                      <div className="col-sub">{agent.description || "暂无职责描述"}</div>
                    </span>
                    <span className="col" style={{ width: 112 }}>
                      <span className="tag">{typeLabel(agent.type)}</span>
                    </span>
                    <span className="col" style={{ width: 86 }}>
                      <span className={`tag ${agent.enabled ? "primary" : ""}`}>{agent.enabled ? "启用" : "停用"}</span>
                    </span>
                    <span className="col agent-model-cell" style={{ width: 150 }}>
                      <span className={`agent-model-label agent-model-${model.kind}`} title={model.label}>
                        {model.label}
                      </span>
                    </span>
                    <span className="model-row-actions agent-row-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        title="编辑 Agent"
                        aria-label={`编辑 Agent ${agent.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          startEdit(agent);
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon danger"
                        title="删除 Agent"
                        aria-label={`删除 Agent ${agent.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setAgentToDelete(agent);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {mode !== "idle" ? (
        <AgentEditorModal
          mode={mode}
          draft={draft}
          models={models}
          skills={skills}
          saving={saving}
          feedback={modalFeedback}
          onChange={updateDraft}
          onPermissionChange={updatePermission}
          onSpeakChange={updateSpeak}
          onSave={() => void saveAgent()}
          onCancel={closeEditor}
        />
      ) : null}

      {agentToDelete ? (
        <ConfirmModal
          title="删除 Agent"
          message={`确定删除 Agent「${agentToDelete.name}」吗？`}
          confirmText="删除"
          danger
          onConfirm={() => void deleteAgent(agentToDelete)}
          onCancel={() => setAgentToDelete(null)}
        />
      ) : null}
    </ViewShell>
  );
}
