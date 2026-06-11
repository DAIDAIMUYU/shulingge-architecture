import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { AlertCircle, CheckCircle2, Pencil, Plus, Trash2, X } from "lucide-react";

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
} from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { ViewShell } from "./common.js";

const AGENT_TYPE_OPTIONS: Array<{ value: AgentPermissionMode; label: string }> = [
  { value: "controller", label: "总控" },
  { value: "writer", label: "正文写作" },
  { value: "blocker", label: "阻断器" },
  { value: "checker", label: "检查器" },
  { value: "advisor", label: "顾问" },
  { value: "state-updater", label: "状态更新器" },
];

const OUTPUT_FORMAT_OPTIONS: Array<{ value: AgentOutputFormat; label: string }> = [
  { value: "text", label: "纯文本" },
  { value: "json+text", label: "结构化 JSON + 文本" },
];

const PERMISSION_OPTIONS: Array<{ key: keyof AgentPermissions; label: string }> = [
  { key: "canWriteDraft", label: "可写正文" },
  { key: "canRewriteDraft", label: "可重写正文" },
  { key: "canPatchParagraph", label: "可改段落" },
  { key: "canBlockWorkflow", label: "可阻断流程" },
  { key: "canRequestRewrite", label: "可请求重写" },
  { key: "canWriteState", label: "可写状态" },
  { key: "canUpdateRules", label: "可更新规则" },
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

function toAgentPayload(draft: AgentDraft): AgentConfigInput {
  return {
    id: draft.id.trim() || undefined,
    name: draft.name.trim(),
    description: draft.description.trim(),
    enabled: draft.enabled,
    type: draft.type,
    workflowId: draft.workflowId.trim() || undefined,
    order: Number.isFinite(Number(draft.order)) ? Math.max(0, Number(draft.order)) : 0,
    modelConfigId: draft.modelConfigId.trim() || `model-${draft.id.trim() || "agent"}`,
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
    modelConfigId: agent.modelConfigId ?? `model-${agent.id}`,
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

function TagInput({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
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
      <div className="agent-tag-input">
        <div className="agent-tag-list">
          {values.map((value) => (
            <span className="tag agent-tag" key={value}>
              {value}
              <button
                type="button"
                aria-label={`删除 ${value}`}
                onClick={() => onChange(values.filter((item) => item !== value))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            value={draft}
            placeholder={values.length ? "" : placeholder}
            onBlur={addTag}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </label>
  );
}

export function AgentsView() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDraft>(() => createAgentDraft(undefined, 10));
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AgentConfig | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

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

  useEffect(() => {
    void loadAgents();
    void loadModels();
  }, []);

  function startCreate(): void {
    setSelectedAgentId(null);
    setDraft(createAgentDraft(undefined, nextOrder));
    setMode("create");
    setFeedback(null);
  }

  function startEdit(agent: AgentConfig): void {
    setSelectedAgentId(agent.id);
    setDraft(createAgentDraft(agent, nextOrder));
    setMode("edit");
    setFeedback(null);
  }

  function resetEditor(): void {
    setSelectedAgentId(null);
    setDraft(createAgentDraft(undefined, nextOrder));
    setMode("idle");
  }

  async function saveAgent(): Promise<void> {
    const payload = toAgentPayload(draft);
    if (!payload.name) {
      setFeedback({ kind: "error", message: "请填写 Agent 名称" });
      return;
    }
    if (mode === "create" && !payload.id) {
      setFeedback({ kind: "error", message: "请填写 Agent ID" });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const saved = mode === "edit" && selectedAgent
        ? await api.updateAgent(selectedAgent.id, payload)
        : await api.createAgent(payload);
      await loadAgents();
      if (mode === "create") {
        resetEditor();
        setFeedback({ kind: "success", message: `Agent「${saved.name}」已创建` });
      } else {
        setSelectedAgentId(saved.id);
        setDraft(createAgentDraft(saved, nextOrder));
        setFeedback({ kind: "success", message: `Agent「${saved.name}」已保存` });
      }
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Agent 保存失败" });
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
        resetEditor();
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
    <ViewShell title="Agent 管理" subtitle="管理写作流程中的 Agent、模型绑定、读取范围、权限与发言配置">
      <div className="stack-list">
        <section className="editor-card">
          <div className="editor-card-head">
            <div>
              <h2>Agent 列表</h2>
              <p className="view-sub">共 {sortedAgents.length} 个 Agent，按执行顺序排列。</p>
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
              sortedAgents.map((agent) => (
                <div
                  className={`list-row model-list-row ${selectedAgentId === agent.id ? "active" : ""}`}
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
                  <span className="faint" style={{ width: 54 }}>{agent.order}</span>
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
                    {agent.modelConfigId || "未指定"}
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
              ))
            )}
          </div>
        </section>

        {mode === "idle" ? (
          <section className="editor-card">
            <div className="center-state agent-empty-editor">
              <span>选择一个 Agent 进行编辑，或点击「新建 Agent」。</span>
            </div>
          </section>
        ) : (
          <section className="editor-card">
            <div className="editor-card-head">
              <div>
                <h2>{mode === "create" ? "新建 Agent" : `编辑 Agent · ${selectedAgent?.name ?? draft.name}`}</h2>
                <p className="view-sub">配置 Agent 的职责、模型绑定、读取范围、执行权限和对话区发言方式。</p>
              </div>
              <div className="view-actions">
                <button type="button" className="btn" disabled={saving} onClick={resetEditor}>
                  取消
                </button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveAgent()}>
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>

            <div className="model-editor-section">
              <div className="model-editor-section-title">基础</div>
              <div className="form-grid form-grid-3">
                <label className="form-block">
                  <span>Agent ID</span>
                  <input
                    className="input"
                    value={draft.id}
                    disabled={mode === "edit"}
                    placeholder="例如 plot-advisor"
                    onChange={(event) => updateDraft({ id: event.target.value })}
                  />
                </label>
                <label className="form-block">
                  <span>名称</span>
                  <input
                    className="input"
                    value={draft.name}
                    placeholder="例如 情节顾问"
                    onChange={(event) => updateDraft({ name: event.target.value })}
                  />
                </label>
                <label className="form-block">
                  <span>类型</span>
                  <select
                    className="input"
                    value={draft.type}
                    onChange={(event) => updateDraft({ type: event.target.value as AgentPermissionMode })}
                  >
                    {AGENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="form-block">
                <span>职责描述</span>
                <textarea
                  className="textarea"
                  value={draft.description}
                  placeholder="描述这个 Agent 应该关注什么、产出什么。"
                  onChange={(event) => updateDraft({ description: event.target.value })}
                />
              </label>

              <div className="form-grid form-grid-3">
                <label className="switch-row agent-switch-row">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => updateDraft({ enabled: event.target.checked })}
                  />
                  <span>启用</span>
                </label>
                <label className="form-block">
                  <span>执行顺序</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={draft.order}
                    onChange={(event) => updateDraft({ order: event.target.value })}
                  />
                </label>
                <label className="form-block">
                  <span>工作流 ID</span>
                  <input
                    className="input"
                    value={draft.workflowId}
                    placeholder="留空则不指定"
                    onChange={(event) => updateDraft({ workflowId: event.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="model-editor-section agent-editor-section">
              <div className="model-editor-section-title">模型</div>
              <label className="form-block">
                <span>绑定模型配置</span>
                <select
                  className="input"
                  value={draft.modelConfigId}
                  onChange={(event) => updateDraft({ modelConfigId: event.target.value })}
                >
                  <option value="">未指定</option>
                  {draft.modelConfigId && !models.some((model) => model.id === draft.modelConfigId) ? (
                    <option value={draft.modelConfigId}>{draft.modelConfigId}</option>
                  ) : null}
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id}{model.model ? ` · ${model.model}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="model-editor-section agent-editor-section">
              <div className="model-editor-section-title">读取范围与能力</div>
              <div className="form-grid form-grid-3">
                <TagInput
                  label="读取范围"
                  values={draft.readScope}
                  placeholder="输入后回车添加"
                  onChange={(readScope) => updateDraft({ readScope })}
                />
                <TagInput
                  label="技能"
                  values={draft.skills}
                  placeholder="输入技能 ID"
                  onChange={(skills) => updateDraft({ skills })}
                />
                <TagInput
                  label="内置规则"
                  values={draft.builtInRules}
                  placeholder="输入规则 ID"
                  onChange={(builtInRules) => updateDraft({ builtInRules })}
                />
              </div>
              <label className="form-block">
                <span>输出格式</span>
                <select
                  className="input"
                  value={draft.outputFormat}
                  onChange={(event) => updateDraft({ outputFormat: event.target.value as AgentOutputFormat })}
                >
                  {OUTPUT_FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="model-editor-section agent-editor-section">
              <div className="model-editor-section-title">权限</div>
              <div className="agent-switch-grid">
                {PERMISSION_OPTIONS.map((option) => (
                  <label className="switch-row agent-switch-row" key={option.key}>
                    <input
                      type="checkbox"
                      checked={draft.permissions[option.key]}
                      onChange={(event) => updatePermission(option.key, event.target.checked)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="model-editor-section agent-editor-section">
              <div className="model-editor-section-title">发言配置</div>
              <div className="form-grid form-grid-3">
                <label className="form-block">
                  <span>显示名称</span>
                  <input
                    className="input"
                    value={draft.speak.displayName ?? ""}
                    placeholder="留空使用 Agent 名称"
                    onChange={(event) => updateSpeak({ displayName: event.target.value })}
                  />
                </label>
                <label className="form-block">
                  <span>图标</span>
                  <input
                    className="input"
                    value={draft.speak.icon ?? ""}
                    placeholder="例如 ✦ 或 bot"
                    onChange={(event) => updateSpeak({ icon: event.target.value })}
                  />
                </label>
              </div>
              <div className="agent-switch-grid">
                <label className="switch-row agent-switch-row">
                  <input type="checkbox" checked={draft.speak.speak} onChange={(event) => updateSpeak({ speak: event.target.checked })} />
                  <span>在对话区发言</span>
                </label>
                <label className="switch-row agent-switch-row">
                  <input type="checkbox" checked={draft.speak.showReasoning} onChange={(event) => updateSpeak({ showReasoning: event.target.checked })} />
                  <span>显示推理</span>
                </label>
                <label className="switch-row agent-switch-row">
                  <input type="checkbox" checked={draft.speak.showStructured} onChange={(event) => updateSpeak({ showStructured: event.target.checked })} />
                  <span>显示结构化输出</span>
                </label>
                <label className="switch-row agent-switch-row">
                  <input type="checkbox" checked={draft.speak.onlyOnFailure} onChange={(event) => updateSpeak({ onlyOnFailure: event.target.checked })} />
                  <span>仅失败时发言</span>
                </label>
              </div>
            </div>
          </section>
        )}
      </div>

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
