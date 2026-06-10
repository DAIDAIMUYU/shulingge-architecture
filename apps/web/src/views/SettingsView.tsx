import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  CloudOff,
  Keyboard,
  KeyRound,
  Languages,
  PlugZap,
  RefreshCw,
  ServerCog,
  TimerReset,
} from "lucide-react";

import {
  DEFAULT_WEB_PREFERENCES,
  mergeWebPreferences,
  readWebPreferences,
  writeWebPreferences,
  type WebPreferences,
} from "../app/preferences.js";
import {
  api,
  ApiError,
  type AgentInfo,
  type ModelConfig,
  type ModelConfigInput,
  type RemoteGatewayStatus,
} from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { ViewShell } from "./common.js";

const SECTIONS = ["外观", "模型与 API", "远程访问", "通用", "Agent", "快捷键", "关于"] as const;
type Section = (typeof SECTIONS)[number];

interface ModelDraft {
  id: string;
  provider: string;
  model: string;
  temperature: string;
  topP: string;
  maxTokens: string;
  contextWindow: string;
  fallbackModelId: string;
  costLimit: string;
  longContext: boolean;
  stream: boolean;
  jsonMode: boolean;
}

function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "light";
  }
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function createModelDraft(model?: ModelConfig): ModelDraft {
  return {
    id: model?.id ?? "",
    provider: String(model?.provider ?? "openai-compatible"),
    model: String(model?.model ?? ""),
    temperature: model?.temperature === undefined ? "" : String(model.temperature),
    topP: model?.topP === undefined ? "" : String(model.topP),
    maxTokens: model?.maxTokens === undefined ? "" : String(model.maxTokens),
    contextWindow: model?.contextWindow === undefined ? "" : String(model.contextWindow),
    fallbackModelId: String(model?.fallbackModelId ?? ""),
    costLimit: model?.costLimit === undefined ? "" : String(model.costLimit),
    longContext: Boolean(model?.longContext),
    stream: model?.stream !== false,
    jsonMode: Boolean(model?.jsonMode),
  };
}

function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const next = Number(trimmed);
  return Number.isFinite(next) ? next : undefined;
}

function toModelPayload(draft: ModelDraft): ModelConfigInput {
  return {
    id: draft.id.trim(),
    provider: draft.provider.trim(),
    model: draft.model.trim(),
    temperature: toOptionalNumber(draft.temperature),
    topP: toOptionalNumber(draft.topP),
    maxTokens: toOptionalNumber(draft.maxTokens),
    contextWindow: toOptionalNumber(draft.contextWindow),
    fallbackModelId: draft.fallbackModelId.trim() || undefined,
    costLimit: toOptionalNumber(draft.costLimit),
    longContext: draft.longContext,
    stream: draft.stream,
    jsonMode: draft.jsonMode,
  };
}

function savePreferencePatch(
  patch: Partial<WebPreferences>,
  setPreferences: (value: WebPreferences) => void,
  setFeedback: (value: string | null) => void,
) {
  const next = mergeWebPreferences(patch);
  setPreferences(next);
  setFeedback("偏好已保存到当前浏览器");
}

function ModelEditor({
  draft,
  onChange,
  onSubmit,
  saving,
  apiKey,
  setApiKey,
  onStoreKey,
  keySaving,
  onTest,
  testing,
  feedback,
  mode,
}: {
  draft: ModelDraft;
  onChange: (patch: Partial<ModelDraft>) => void;
  onSubmit: () => void;
  saving: boolean;
  apiKey: string;
  setApiKey: (value: string) => void;
  onStoreKey: () => void;
  keySaving: boolean;
  onTest: () => void;
  testing: boolean;
  feedback: string | null;
  mode: "create" | "edit";
}) {
  return (
    <section className="editor-card">
      <div className="editor-card-head">
        <div>
          <h2>{mode === "create" ? "新建模型配置" : `编辑模型 · ${draft.id || draft.model || "未命名"}`}</h2>
          <p className="view-sub">模型配置保存在 Vault，API Key 仍只进系统凭据管理器。</p>
        </div>
        <div className="view-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !draft.id.trim() || !draft.model.trim()}
            onClick={onSubmit}
          >
            {saving ? "保存中…" : "保存配置"}
          </button>
        </div>
      </div>

      {feedback ? <div className="err-card">{feedback}</div> : null}

      <div className="form-grid form-grid-3">
        <label className="form-block">
          <span>模型 ID</span>
          <input className="input" value={draft.id} disabled={mode === "edit"} onChange={(event) => onChange({ id: event.target.value })} />
        </label>
        <label className="form-block">
          <span>Provider</span>
          <input className="input" value={draft.provider} onChange={(event) => onChange({ provider: event.target.value })} />
        </label>
        <label className="form-block">
          <span>Model</span>
          <input className="input" value={draft.model} onChange={(event) => onChange({ model: event.target.value })} />
        </label>
      </div>

      <div className="form-grid form-grid-3">
        <label className="form-block">
          <span>Temperature</span>
          <input className="input" value={draft.temperature} onChange={(event) => onChange({ temperature: event.target.value })} />
        </label>
        <label className="form-block">
          <span>Top P</span>
          <input className="input" value={draft.topP} onChange={(event) => onChange({ topP: event.target.value })} />
        </label>
        <label className="form-block">
          <span>Max Tokens</span>
          <input className="input" value={draft.maxTokens} onChange={(event) => onChange({ maxTokens: event.target.value })} />
        </label>
      </div>

      <div className="form-grid form-grid-3">
        <label className="form-block">
          <span>Context Window</span>
          <input className="input" value={draft.contextWindow} onChange={(event) => onChange({ contextWindow: event.target.value })} />
        </label>
        <label className="form-block">
          <span>Fallback Model ID</span>
          <input className="input" value={draft.fallbackModelId} onChange={(event) => onChange({ fallbackModelId: event.target.value })} />
        </label>
        <label className="form-block">
          <span>Cost Limit</span>
          <input className="input" value={draft.costLimit} onChange={(event) => onChange({ costLimit: event.target.value })} />
        </label>
      </div>

      <div className="form-grid form-grid-3">
        <label className="switch-row"><input type="checkbox" checked={draft.longContext} onChange={(event) => onChange({ longContext: event.target.checked })} /><span>长上下文</span></label>
        <label className="switch-row"><input type="checkbox" checked={draft.stream} onChange={(event) => onChange({ stream: event.target.checked })} /><span>流式输出</span></label>
        <label className="switch-row"><input type="checkbox" checked={draft.jsonMode} onChange={(event) => onChange({ jsonMode: event.target.checked })} /><span>JSON 模式</span></label>
      </div>

      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>API Key</span>
          <input className="input" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="仅写入系统凭据管理器" />
        </label>
        <div className="model-actions-row">
          <button type="button" className="btn" disabled={keySaving || !draft.id.trim() || !apiKey.trim()} onClick={onStoreKey}>
            <KeyRound size={15} strokeWidth={2} />
            {keySaving ? "写入中…" : "写入 Key"}
          </button>
          <button type="button" className="btn btn-primary" disabled={testing || !draft.id.trim()} onClick={onTest}>
            <PlugZap size={15} strokeWidth={2} />
            {testing ? "测试中…" : "测试连通性"}
          </button>
        </div>
      </div>
    </section>
  );
}

function RemotePanel({
  status,
  password,
  setPassword,
  port,
  setPort,
  autoStart,
  setAutoStart,
  onEnable,
  onDisable,
  onResetPassword,
  loading,
  feedback,
}: {
  status: RemoteGatewayStatus | null;
  password: string;
  setPassword: (value: string) => void;
  port: string;
  setPort: (value: string) => void;
  autoStart: boolean;
  setAutoStart: (value: boolean) => void;
  onEnable: () => void;
  onDisable: () => void;
  onResetPassword: () => void;
  loading: boolean;
  feedback: string | null;
}) {
  return (
    <div className="stack-list">
      <section className="info-card">
        <h3>远程访问状态</h3>
        <div className="stack-list">
          <div className="field"><span className="k">启用状态</span><span className="v">{status?.enabled ? "已开启" : "默认关闭"}</span></div>
          <div className="field"><span className="k">访问地址</span><span className="v stack-align-start">{status?.address ?? "未监听"}</span></div>
          <div className="field"><span className="k">Tailscale 地址</span><span className="v stack-align-start">{status?.tailscaleAddress ?? "未提供"}</span></div>
          <div className="field"><span className="k">口令状态</span><span className="v">{status?.passwordConfigured ? "已配置" : "未配置"}</span></div>
        </div>
      </section>

      <section className="editor-card">
        <div className="editor-card-head">
          <div>
            <h2>远程访问</h2>
            <p className="view-sub">保持默认关闭，开启时必须设置口令。重置口令只能本地发起。</p>
          </div>
          <div className="view-actions">
            <button type="button" className="btn" disabled={loading || !status?.enabled} onClick={onDisable}>
              <CloudOff size={15} strokeWidth={2} />
              {loading ? "处理中…" : "关闭远程"}
            </button>
          </div>
        </div>

        {feedback ? <div className="err-card">{feedback}</div> : null}

        <div className="form-grid form-grid-3">
          <label className="form-block">
            <span>口令</span>
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label className="form-block">
            <span>端口</span>
            <input className="input" value={port} onChange={(event) => setPort(event.target.value)} placeholder="3000" />
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={autoStart} onChange={(event) => setAutoStart(event.target.checked)} />
            <span>启动时自动开启远程</span>
          </label>
        </div>

        <div className="model-actions-row">
          <button type="button" className="btn btn-primary" disabled={loading || !password.trim()} onClick={onEnable}>
            <ServerCog size={15} strokeWidth={2} />
            {loading ? "处理中…" : "启用远程访问"}
          </button>
          <button type="button" className="btn" disabled={loading || !password.trim()} onClick={onResetPassword}>
            <RefreshCw size={15} strokeWidth={2} />
            {loading ? "处理中…" : "本地重置口令"}
          </button>
        </div>
      </section>
    </div>
  );
}

function GeneralPanel({
  preferences,
  setPreferences,
  feedback,
  setFeedback,
}: {
  preferences: WebPreferences;
  setPreferences: (value: WebPreferences) => void;
  feedback: string | null;
  setFeedback: (value: string | null) => void;
}) {
  return (
    <div className="stack-list">
      <section className="info-card">
        <h3>通用偏好</h3>
        <div className="form-row">
          <div>
            <div className="fr-label">界面语言</div>
            <div className="fr-desc">先保存浏览器端偏好，并同步到页面 `lang` 属性。</div>
          </div>
          <div className="segmented">
            <button type="button" className={preferences.preferredLanguage === "zh-CN" ? "on" : ""} onClick={() => savePreferencePatch({ preferredLanguage: "zh-CN" }, setPreferences, setFeedback)}>
              中文
            </button>
            <button type="button" className={preferences.preferredLanguage === "en-US" ? "on" : ""} onClick={() => savePreferencePatch({ preferredLanguage: "en-US" }, setPreferences, setFeedback)}>
              English
            </button>
          </div>
        </div>
        <div className="form-row">
          <div>
            <div className="fr-label">自动保存节奏</div>
            <div className="fr-desc">直接影响工作台正文自动保存延迟。</div>
          </div>
          <div className="segmented">
            {[800, 1200, 2000].map((delay) => (
              <button
                key={delay}
                type="button"
                className={preferences.autosaveDelayMs === delay ? "on" : ""}
                onClick={() => savePreferencePatch({ autosaveDelayMs: delay as 800 | 1200 | 2000 }, setPreferences, setFeedback)}
              >
                {delay}ms
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <div>
            <div className="fr-label">默认侧板</div>
            <div className="fr-desc">重新打开写作页时，工作台右侧默认进入哪个页签。</div>
          </div>
          <div className="segmented">
            {(["outline", "annotations", "locks"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={preferences.defaultInspectorTab === tab ? "on" : ""}
                onClick={() => savePreferencePatch({ defaultInspectorTab: tab }, setPreferences, setFeedback)}
              >
                {tab === "outline" ? "大纲" : tab === "annotations" ? "批注" : "锁定"}
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <div>
            <div className="fr-label">默认进入专注模式</div>
            <div className="fr-desc">开启后，工作台初次进入时直接隐藏左右两侧。</div>
          </div>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={preferences.startInFocusMode}
              onChange={(event) => savePreferencePatch({ startInFocusMode: event.target.checked }, setPreferences, setFeedback)}
            />
            <span>{preferences.startInFocusMode ? "已开启" : "关闭"}</span>
          </label>
        </div>
      </section>

      <section className="info-card">
        <h3>偏好说明</h3>
        {feedback ? <div className="inspector-feedback" style={{ marginTop: 0 }}>{feedback}</div> : null}
        <div className="signal-list">
          <div className="signal-item">
            <Languages size={16} />
            <div>
              <div className="mini-card-title">仅写浏览器本地</div>
              <div className="mini-card-sub">这组偏好不写入 Vault，不进入导出包，也不改变后端业务数据。</div>
            </div>
          </div>
          <div className="signal-item">
            <TimerReset size={16} />
            <div>
              <div className="mini-card-title">工作台即时生效</div>
              <div className="mini-card-sub">自动保存节奏、默认侧板和专注模式会在下次进入写作页时直接生效。</div>
            </div>
          </div>
        </div>
        <div className="skill-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const next = writeWebPreferences(DEFAULT_WEB_PREFERENCES);
              setPreferences(next);
              setFeedback("已恢复默认偏好");
            }}
          >
            恢复默认
          </button>
        </div>
      </section>
    </div>
  );
}

function AgentPanel({
  agents,
  loading,
  preferences,
  setPreferences,
  feedback,
  setFeedback,
}: {
  agents: AgentInfo[];
  loading: boolean;
  preferences: WebPreferences;
  setPreferences: (value: WebPreferences) => void;
  feedback: string | null;
  setFeedback: (value: string | null) => void;
}) {
  const watchedIds = new Set(preferences.watchedAgentIds);
  const sortedAgents = [...agents].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  const enabledCount = sortedAgents.filter((agent) => agent.enabled !== false).length;

  return (
    <div className="stack-list">
      <section className="info-card">
        <h3>Agent 工作流观察</h3>
        <div className="signal-list">
          <div className="signal-item">
            <Bot size={16} />
            <div>
              <div className="mini-card-title">当前可见 Agent</div>
              <div className="mini-card-sub">{enabledCount} / {sortedAgents.length} 处于启用状态</div>
            </div>
          </div>
          <div className="signal-item">
            <CheckCircle2 size={16} />
            <div>
              <div className="mini-card-title">关注 Agent</div>
              <div className="mini-card-sub">{preferences.watchedAgentIds.length} 个会在工作台运行卡里重点高亮</div>
            </div>
          </div>
        </div>
      </section>

      {feedback ? <div className="inspector-feedback">{feedback}</div> : null}

      <section className="list-card">
        <div className="list-row head">
          <span className="col" style={{ width: 36 }}>#</span>
          <span className="col col-grow">Agent</span>
          <span className="col" style={{ width: 90 }}>状态</span>
          <span className="col" style={{ width: 96 }}>关注</span>
        </div>
        {loading ? (
          <div className="center-state" style={{ minHeight: 220 }}>
            <div className="spinner" />
            <span>加载 Agent 中</span>
          </div>
        ) : (
          sortedAgents.map((agent, index) => {
            const watched = watchedIds.has(agent.id);
            return (
              <div className="list-row" key={agent.id} style={{ cursor: "default" }}>
                <span className="faint" style={{ width: 36 }}>{agent.order ?? index + 1}</span>
                <span className="col col-grow">
                  <div className="col-name">{agent.name}</div>
                  <div className="col-sub">{agent.role ?? agent.description ?? "暂无说明"}</div>
                </span>
                <span className="col" style={{ width: 90 }}>
                  <span className={`tag ${agent.enabled === false ? "" : "primary"}`}>{agent.enabled === false ? "停用" : "启用"}</span>
                </span>
                <span className="col" style={{ width: 96 }}>
                  <button
                    type="button"
                    className={`btn ${watched ? "btn-primary" : ""}`}
                    onClick={() => {
                      const nextIds = watched
                        ? preferences.watchedAgentIds.filter((id) => id !== agent.id)
                        : [...preferences.watchedAgentIds, agent.id];
                      savePreferencePatch({ watchedAgentIds: nextIds }, setPreferences, setFeedback);
                    }}
                  >
                    {watched ? "已关注" : "关注"}
                  </button>
                </span>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function ShortcutsPanel({
  preferences,
  setPreferences,
  feedback,
  setFeedback,
}: {
  preferences: WebPreferences;
  setPreferences: (value: WebPreferences) => void;
  feedback: string | null;
  setFeedback: (value: string | null) => void;
}) {
  const sendLabel = preferences.sendShortcut === "enter" ? "Enter" : "Ctrl / Cmd + Enter";
  const newlineLabel = preferences.sendShortcut === "enter" ? "Shift + Enter" : "Enter";

  return (
    <div className="stack-list">
      <section className="info-card">
        <h3>写作快捷键</h3>
        <div className="form-row">
          <div>
            <div className="fr-label">发送消息组合键</div>
            <div className="fr-desc">直接影响工作台右侧总控对话窗的发送行为。</div>
          </div>
          <div className="segmented">
            <button
              type="button"
              className={preferences.sendShortcut === "enter" ? "on" : ""}
              onClick={() => savePreferencePatch({ sendShortcut: "enter" }, setPreferences, setFeedback)}
            >
              Enter 发送
            </button>
            <button
              type="button"
              className={preferences.sendShortcut === "mod-enter" ? "on" : ""}
              onClick={() => savePreferencePatch({ sendShortcut: "mod-enter" }, setPreferences, setFeedback)}
            >
              Ctrl/Cmd+Enter
            </button>
          </div>
        </div>
        {feedback ? <div className="inspector-feedback" style={{ marginTop: 0 }}>{feedback}</div> : null}
      </section>

      <section className="info-card">
        <h3>当前映射</h3>
        <div className="signal-list">
          <div className="signal-item">
            <Keyboard size={16} />
            <div>
              <div className="mini-card-title">发送</div>
              <div className="mini-card-sub">{sendLabel}</div>
            </div>
          </div>
          <div className="signal-item">
            <Keyboard size={16} />
            <div>
              <div className="mini-card-title">换行</div>
              <div className="mini-card-sub">{newlineLabel}</div>
            </div>
          </div>
          <div className="signal-item">
            <Keyboard size={16} />
            <div>
              <div className="mini-card-title">格式操作</div>
              <div className="mini-card-sub">仍通过编辑器顶部工具栏触发，加粗 / 斜体 / 引用 / 列表已真实生效。</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

interface SettingsViewProps {
  vaultPath?: string | null;
  onSetVault?: (path: string) => Promise<void>;
  onClearVault?: () => void;
}

export function SettingsView({ vaultPath, onSetVault, onClearVault }: SettingsViewProps = {}) {
  const [sec, setSec] = useState<Section>("外观");
  const [theme, setTheme] = useState<"light" | "dark">(currentTheme);
  const [preferences, setPreferences] = useState<WebPreferences>(() => readWebPreferences());
  const [preferencesFeedback, setPreferencesFeedback] = useState<string | null>(null);
  const [vaultDraft, setVaultDraft] = useState(vaultPath ?? "");
  const [vaultFeedback, setVaultFeedback] = useState<string | null>(null);
  const [vaultSaving, setVaultSaving] = useState(false);
  const [confirmClearVault, setConfirmClearVault] = useState(false);

  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState<ModelDraft>(createModelDraft());
  const [modelMode, setModelMode] = useState<"create" | "edit">("create");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelFeedback, setModelFeedback] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [testingModel, setTestingModel] = useState(false);

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  const [remoteStatus, setRemoteStatus] = useState<RemoteGatewayStatus | null>(null);
  const [remotePassword, setRemotePassword] = useState("");
  const [remotePort, setRemotePort] = useState("3000");
  const [remoteAutoStart, setRemoteAutoStart] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteFeedback, setRemoteFeedback] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  const applyTheme = (nextTheme: "light" | "dark") => {
    document.documentElement.setAttribute("data-theme", nextTheme);
    setTheme(nextTheme);
  };

  async function loadModels() {
    setModelsLoading(true);
    try {
      const list = await api.listModels();
      setModels(list);
      setSelectedModelId((current) => current && list.some((model) => model.id === current) ? current : list[0]?.id ?? null);
    } catch (error) {
      setModelFeedback(error instanceof ApiError ? error.message : "模型加载失败");
    } finally {
      setModelsLoading(false);
    }
  }

  async function loadAgents() {
    setAgentsLoading(true);
    try {
      const list = await api.listAgents();
      setAgents(list);
    } catch (error) {
      setPreferencesFeedback(error instanceof ApiError ? error.message : "Agent 列表加载失败");
    } finally {
      setAgentsLoading(false);
    }
  }

  async function loadRemoteStatus() {
    try {
      const status = await api.remoteStatus();
      setRemoteStatus(status);
      setRemotePort(String(status.requestedPort ?? status.port ?? 3000));
      setRemoteAutoStart(Boolean(status.autoStart));
    } catch (error) {
      setRemoteFeedback(error instanceof ApiError ? error.message : "远程状态加载失败");
    }
  }

  useEffect(() => {
    void loadModels();
    void loadAgents();
    void loadRemoteStatus();
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = preferences.preferredLanguage;
    }
  }, [preferences.preferredLanguage]);

  useEffect(() => {
    setVaultDraft(vaultPath ?? "");
  }, [vaultPath]);

  const changeVault = async () => {
    if (!onSetVault) {
      return;
    }
    const nextPath = vaultDraft.trim();
    if (!nextPath) {
      setVaultFeedback("请输入 Vault 目录绝对路径");
      return;
    }

    setVaultSaving(true);
    setVaultFeedback(null);
    try {
      await onSetVault(nextPath);
      setVaultFeedback("资料库位置已更新");
    } catch (error) {
      setVaultFeedback(error instanceof Error ? error.message : "资料库位置更新失败");
    } finally {
      setVaultSaving(false);
    }
  };

  const clearVault = () => {
    if (!onClearVault) {
      return;
    }
    onClearVault();
    setVaultFeedback("资料库位置已清除");
    setConfirmClearVault(false);
  };

  useEffect(() => {
    if (!selectedModel) {
      setModelDraft(createModelDraft());
      setModelMode("create");
      return;
    }

    setModelDraft(createModelDraft(selectedModel));
    setModelMode("edit");
  }, [selectedModel]);

  return (
    <ViewShell title="设置" subtitle="外观、模型、远程访问、通用偏好、Agent 与快捷键">
      <div className="settings-layout">
        <div className="settings-menu">
          {SECTIONS.map((section) => (
            <button key={section} type="button" className={sec === section ? "on" : ""} onClick={() => setSec(section)}>
              {section}
            </button>
          ))}
        </div>

        <div>
          <section className="editor-card">
            <div className="editor-card-head">
              <div>
                <h2>资料库位置</h2>
                <p className="view-sub">当前 Vault：{vaultPath || "尚未选择"}</p>
              </div>
            </div>
            <div className="form-grid form-grid-2">
              <label className="form-block">
                <span>Vault 目录</span>
                <input
                  className="input"
                  value={vaultDraft}
                  onChange={(event) => setVaultDraft(event.target.value)}
                  placeholder={"输入 Vault 目录绝对路径，例如 C:\\书灵阁Vault"}
                />
              </label>
              <div className="model-actions-row">
                <button type="button" className="btn btn-primary" disabled={vaultSaving} onClick={() => void changeVault()}>
                  {vaultSaving ? "更换中..." : "更换"}
                </button>
                <button type="button" className="btn" onClick={() => setConfirmClearVault(true)}>
                  清除
                </button>
              </div>
            </div>
            {vaultFeedback ? <div className="inspector-feedback">{vaultFeedback}</div> : null}
          </section>

          {sec === "外观" ? (
            <div className="info-card">
              <h3>主题</h3>
              <div className="form-row">
                <div>
                  <div className="fr-label">配色模式</div>
                  <div className="fr-desc">浅色 / 深色文房主题，长时间写作建议深色护眼。</div>
                </div>
                <div className="segmented">
                  <button type="button" className={theme === "light" ? "on" : ""} onClick={() => applyTheme("light")}>
                    浅色
                  </button>
                  <button type="button" className={theme === "dark" ? "on" : ""} onClick={() => applyTheme("dark")}>
                    深色
                  </button>
                </div>
              </div>
              <div className="form-row">
                <div>
                  <div className="fr-label">正文字体</div>
                  <div className="fr-desc">编辑器正文使用的字体。</div>
                </div>
                <span className="tag">思源宋体</span>
              </div>
            </div>
          ) : null}

          {sec === "模型与 API" ? (
            <div className="stack-list">
              <section className="info-card">
                <h3>模型配置</h3>
                {modelsLoading ? (
                  <div className="faint">加载中…</div>
                ) : (
                  <div className="stack-list">
                    <div className="model-actions-row">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          setSelectedModelId(null);
                          setModelDraft(createModelDraft());
                          setModelMode("create");
                          setModelFeedback(null);
                        }}
                      >
                        新建模型
                      </button>
                    </div>
                    <div className="list-card">
                      <div className="list-row head">
                        <span className="col col-grow">模型</span>
                        <span className="col" style={{ width: 120 }}>Provider</span>
                        <span className="col" style={{ width: 90 }}>Key</span>
                      </div>
                      {models.map((model) => (
                        <button
                          type="button"
                          className={`list-row ${selectedModel?.id === model.id ? "active" : ""}`}
                          key={model.id}
                          onClick={() => {
                            setSelectedModelId(model.id);
                            setModelFeedback(null);
                          }}
                        >
                          <span className="col col-grow">
                            <div className="col-name">{model.id}</div>
                            <div className="col-sub">{model.model ?? "未设置模型名"}</div>
                          </span>
                          <span className="col" style={{ width: 120 }}>
                            <span className="tag">{model.provider ?? "—"}</span>
                          </span>
                          <span className="col" style={{ width: 90 }}>
                            <span className={`tag ${model.hasKey ? "primary" : ""}`}>{model.hasKey ? "已存" : "缺失"}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <ModelEditor
                draft={modelDraft}
                mode={modelMode}
                onChange={(patch) => setModelDraft((current) => ({ ...current, ...patch }))}
                onSubmit={() => {
                  void (async () => {
                    setSavingModel(true);
                    setModelFeedback(null);
                    try {
                      if (modelMode === "create") {
                        const saved = await api.createModel(toModelPayload(modelDraft));
                        await loadModels();
                        setSelectedModelId(saved.id);
                      } else if (selectedModel) {
                        await api.updateModel(selectedModel.id, toModelPayload(modelDraft));
                        await loadModels();
                      }
                      setModelFeedback("模型配置已保存");
                    } catch (error) {
                      setModelFeedback(error instanceof ApiError ? error.message : "模型保存失败");
                    } finally {
                      setSavingModel(false);
                    }
                  })();
                }}
                saving={savingModel}
                apiKey={apiKey}
                setApiKey={setApiKey}
                onStoreKey={() => {
                  void (async () => {
                    if (!modelDraft.id.trim()) return;
                    setKeySaving(true);
                    setModelFeedback(null);
                    try {
                      await api.storeModelApiKey(modelDraft.id.trim(), apiKey);
                      setApiKey("");
                      await loadModels();
                      setModelFeedback("API Key 已写入系统凭据管理器");
                    } catch (error) {
                      setModelFeedback(error instanceof ApiError ? error.message : "写入 Key 失败");
                    } finally {
                      setKeySaving(false);
                    }
                  })();
                }}
                keySaving={keySaving}
                onTest={() => {
                  void (async () => {
                    if (!modelDraft.id.trim()) return;
                    setTestingModel(true);
                    setModelFeedback(null);
                    try {
                      await api.testModelConnection(modelDraft.id.trim());
                      setModelFeedback("连通性测试通过");
                    } catch (error) {
                      setModelFeedback(error instanceof ApiError ? error.message : "连通性测试失败");
                    } finally {
                      setTestingModel(false);
                    }
                  })();
                }}
                testing={testingModel}
                feedback={modelFeedback}
              />
            </div>
          ) : null}

          {sec === "远程访问" ? (
            <RemotePanel
              status={remoteStatus}
              password={remotePassword}
              setPassword={setRemotePassword}
              port={remotePort}
              setPort={setRemotePort}
              autoStart={remoteAutoStart}
              setAutoStart={setRemoteAutoStart}
              loading={remoteLoading}
              feedback={remoteFeedback}
              onEnable={() => {
                void (async () => {
                  setRemoteLoading(true);
                  setRemoteFeedback(null);
                  try {
                    const status = await api.enableRemote(
                      remotePassword,
                      remotePort.trim() ? Number(remotePort) : undefined,
                      remoteAutoStart,
                    );
                    setRemoteStatus(status);
                    setRemoteFeedback("远程访问已启用");
                  } catch (error) {
                    setRemoteFeedback(error instanceof ApiError ? error.message : "启用远程访问失败");
                  } finally {
                    setRemoteLoading(false);
                  }
                })();
              }}
              onDisable={() => {
                void (async () => {
                  setRemoteLoading(true);
                  setRemoteFeedback(null);
                  try {
                    const status = await api.disableRemote();
                    setRemoteStatus(status);
                    setRemoteFeedback("远程访问已关闭");
                  } catch (error) {
                    setRemoteFeedback(error instanceof ApiError ? error.message : "关闭远程访问失败");
                  } finally {
                    setRemoteLoading(false);
                  }
                })();
              }}
              onResetPassword={() => {
                void (async () => {
                  setRemoteLoading(true);
                  setRemoteFeedback(null);
                  try {
                    const status = await api.updateRemotePassword(remotePassword);
                    setRemoteStatus(status);
                    setRemoteFeedback("远程口令已重置");
                  } catch (error) {
                    setRemoteFeedback(error instanceof ApiError ? error.message : "重置远程口令失败");
                  } finally {
                    setRemoteLoading(false);
                  }
                })();
              }}
            />
          ) : null}

          {sec === "通用" ? (
            <GeneralPanel
              preferences={preferences}
              setPreferences={setPreferences}
              feedback={preferencesFeedback}
              setFeedback={setPreferencesFeedback}
            />
          ) : null}

          {sec === "Agent" ? (
            <AgentPanel
              agents={agents}
              loading={agentsLoading}
              preferences={preferences}
              setPreferences={setPreferences}
              feedback={preferencesFeedback}
              setFeedback={setPreferencesFeedback}
            />
          ) : null}

          {sec === "快捷键" ? (
            <ShortcutsPanel
              preferences={preferences}
              setPreferences={setPreferences}
              feedback={preferencesFeedback}
              setFeedback={setPreferencesFeedback}
            />
          ) : null}

          {sec === "关于" ? (
            <div className="stack-list">
              <section className="info-card">
                <h3>当前能力</h3>
                <div className="signal-list">
                  <div className="signal-item">
                    <CheckCircle2 size={16} />
                    <div>
                      <div className="mini-card-title">本地优先</div>
                      <div className="mini-card-sub">正文与元数据仍以 Vault 的 Markdown/JSON 为真相源。</div>
                    </div>
                  </div>
                  <div className="signal-item">
                    <KeyRound size={16} />
                    <div>
                      <div className="mini-card-title">Key 安全</div>
                      <div className="mini-card-sub">API Key 仅写入系统凭据管理器，不进前端状态与导出。</div>
                    </div>
                  </div>
                  <div className="signal-item">
                    <ServerCog size={16} />
                    <div>
                      <div className="mini-card-title">桌面交付</div>
                      <div className="mini-card-sub">当前页面已可打入 `书灵阁.exe` 的 `web-dist` 资源目录。</div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
      {confirmClearVault ? (
        <ConfirmModal
          title="清除资料库位置"
          message="确定清除当前资料库位置吗？下次进入应用会重新选择。"
          confirmText="清除"
          danger
          onConfirm={clearVault}
          onCancel={() => setConfirmClearVault(false)}
        />
      ) : null}
    </ViewShell>
  );
}
