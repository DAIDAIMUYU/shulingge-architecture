import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CloudOff,
  Pencil,
  Keyboard,
  KeyRound,
  Languages,
  PlugZap,
  RefreshCw,
  ServerCog,
  TimerReset,
  Trash2,
} from "lucide-react";

import {
  DEFAULT_WEB_PREFERENCES,
  mergeWebPreferences,
  readWebPreferences,
  writeWebPreferences,
  type WebThemeMode,
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

const SECTIONS = ["外观", "模型与 API", "远程访问", "通用", "智能体", "快捷键", "关于"] as const;
type Section = (typeof SECTIONS)[number];

const THEME_OPTIONS: Array<{ value: WebThemeMode; label: string; description: string }> = [
  { value: "light", label: "浅色", description: "晨雾红日水墨，宣纸暖白，适合日间写作。" },
  { value: "eye", label: "护眼", description: "青绿山水背景，暖灰米黄，长时间阅读更柔和。" },
  { value: "dark", label: "深色", description: "夜雨孤灯暗调，低亮度沉浸写作。" },
];

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "gemini", label: "Google Gemini" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "siliconflow", label: "硅基流动" },
  { value: "volcengine", label: "火山引擎" },
  { value: "aliyun-bailian", label: "阿里百炼" },
  { value: "ollama", label: "Ollama (本地)" },
] as const;

const PROVIDER_LABELS: Record<string, string> = {
  ...Object.fromEntries(PROVIDER_OPTIONS.map((option) => [option.value, option.label])),
  "openai-compatible": "OpenAI 兼容",
  lmstudio: "LM Studio",
  vllm: "vLLM",
  "custom-local": "自定义本地",
};

const DEFAULT_PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  deepseek: "https://api.deepseek.com",
  openrouter: "https://openrouter.ai/api/v1",
  siliconflow: "https://api.siliconflow.cn/v1",
  volcengine: "https://ark.cn-beijing.volces.com/api/v3",
  "aliyun-bailian": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  ollama: "http://127.0.0.1:11434",
  "openai-compatible": "https://api.openai.com/v1",
  lmstudio: "http://127.0.0.1:1234/v1",
  vllm: "http://127.0.0.1:8000/v1",
  "custom-local": "http://127.0.0.1:8000/v1",
};

const MODEL_PLACEHOLDERS: Record<string, string> = {
  openai: "gpt-5.4",
  anthropic: "claude-opus-4-6",
  gemini: "gemini-3.1-pro",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-5.4",
  siliconflow: "Qwen/Qwen3-235B-A22B-Instruct-2507",
  volcengine: "doubao-seed-1-6",
  "aliyun-bailian": "qwen-plus",
  ollama: "qwen3:8b",
  "openai-compatible": "gpt-5.4",
  lmstudio: "local-model",
  vllm: "local-model",
  "custom-local": "local-model",
};

interface ModelDraft {
  id: string;
  provider: string;
  model: string;
  baseUrl: string;
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

type FeedbackKind = "info" | "success" | "error";

interface FeedbackState {
  kind: FeedbackKind;
  message: string;
}

function createModelDraft(model?: ModelConfig): ModelDraft {
  const provider = String(model?.provider ?? "openai");
  return {
    id: model?.id ?? "",
    provider,
    model: String(model?.model ?? ""),
    baseUrl: String(model?.baseUrl ?? DEFAULT_PROVIDER_BASE_URLS[provider] ?? ""),
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
    baseUrl: draft.baseUrl.trim(),
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
  onTest,
  testing,
  feedback,
  mode,
  hasKey,
  vaultReady,
}: {
  draft: ModelDraft;
  onChange: (patch: Partial<ModelDraft>) => void;
  onSubmit: () => void;
  saving: boolean;
  apiKey: string;
  setApiKey: (value: string) => void;
  onTest: () => void;
  testing: boolean;
  feedback: FeedbackState | null;
  mode: "create" | "edit";
  hasKey: boolean;
  vaultReady: boolean;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const providerKnownInSelector = PROVIDER_OPTIONS.some((option) => option.value === draft.provider);
  const modelPlaceholder = MODEL_PLACEHOLDERS[draft.provider] ?? "请输入模型名";

  return (
    <section className="editor-card">
      <div className="editor-card-head">
        <div>
          <h2>{mode === "create" ? "新建模型配置" : `编辑模型 · ${draft.id || draft.model || "未命名"}`}</h2>
          <p className="view-sub">模型配置保存在资料库，API 密钥仍只进系统凭据管理器。</p>
        </div>
        <div className="view-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!vaultReady || saving || testing || !draft.id.trim() || !draft.model.trim()}
            onClick={onSubmit}
          >
            {saving ? "保存中…" : "保存配置"}
          </button>
        </div>
      </div>

      {!vaultReady ? <div className="inspector-feedback">请先在设置页或弹窗选择资料库，再配置模型。</div> : null}
      {feedback ? (
        <div className={`model-feedback model-feedback-${feedback.kind}`}>
          {feedback.kind === "success" ? <CheckCircle2 size={16} /> : feedback.kind === "error" ? <AlertCircle size={16} /> : null}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      <div className="model-editor-section">
        <div className="model-editor-section-title">基础配置</div>
        <div className="form-grid form-grid-3">
          <label className="form-block">
            <span>配置 ID</span>
            <input
              className="input"
              value={draft.id}
              disabled={mode === "edit"}
              placeholder="例如 main-writer"
              onChange={(event) => onChange({ id: event.target.value })}
            />
          </label>
          <label className="form-block">
            <span>服务商</span>
            <select
              className="input"
              value={draft.provider}
              onChange={(event) => {
                const provider = event.target.value;
                onChange({
                  provider,
                  baseUrl: DEFAULT_PROVIDER_BASE_URLS[provider] ?? "",
                });
              }}
            >
              {!providerKnownInSelector ? (
                <option value={draft.provider}>{PROVIDER_LABELS[draft.provider] ?? draft.provider}</option>
              ) : null}
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="form-block">
            <span>模型名</span>
            <input
              className="input"
              value={draft.model}
              placeholder={modelPlaceholder}
              onChange={(event) => onChange({ model: event.target.value })}
            />
          </label>
        </div>
        <label className="form-block">
          <span>API 地址</span>
          <input
            className="input"
            value={draft.baseUrl}
            placeholder={DEFAULT_PROVIDER_BASE_URLS[draft.provider] ?? "留空使用服务商默认地址"}
            onChange={(event) => onChange({ baseUrl: event.target.value })}
          />
        </label>

        <div className="model-key-row">
          <label className="form-block model-key-input">
            <span>API 密钥</span>
            <input
              className="input"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="仅写入系统凭据管理器"
            />
          </label>
          <span className={`tag ${hasKey ? "primary" : ""}`}>{hasKey ? "已存密钥" : "缺失密钥"}</span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!vaultReady || saving || testing || !draft.id.trim() || !draft.model.trim()}
            onClick={onTest}
          >
            <PlugZap size={15} strokeWidth={2} />
            {testing ? "测试中…" : "测试连通性"}
          </button>
        </div>
      </div>

      <div className="model-advanced">
        <button
          type="button"
          className="model-advanced-toggle"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          {advancedOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          高级参数
        </button>
        {advancedOpen ? (
          <div className="model-advanced-panel">
            <div className="form-grid form-grid-3">
              <label className="form-block">
                <span>温度</span>
                <input className="input" value={draft.temperature} placeholder="例如 0.7" onChange={(event) => onChange({ temperature: event.target.value })} />
              </label>
              <label className="form-block">
                <span>Top P</span>
                <input className="input" value={draft.topP} placeholder="例如 0.9" onChange={(event) => onChange({ topP: event.target.value })} />
              </label>
              <label className="form-block">
                <span>最大输出 Tokens</span>
                <input className="input" value={draft.maxTokens} placeholder="例如 4096" onChange={(event) => onChange({ maxTokens: event.target.value })} />
              </label>
            </div>

            <div className="form-grid form-grid-3">
              <label className="form-block">
                <span>上下文窗口</span>
                <input className="input" value={draft.contextWindow} placeholder="例如 128000" onChange={(event) => onChange({ contextWindow: event.target.value })} />
              </label>
              <label className="form-block">
                <span>备用模型 ID</span>
                <input className="input" value={draft.fallbackModelId} onChange={(event) => onChange({ fallbackModelId: event.target.value })} />
              </label>
              <label className="form-block">
                <span>费用上限</span>
                <input className="input" value={draft.costLimit} placeholder="留空不限制" onChange={(event) => onChange({ costLimit: event.target.value })} />
              </label>
            </div>

            <div className="form-grid form-grid-3">
              <label className="switch-row"><input type="checkbox" checked={draft.longContext} onChange={(event) => onChange({ longContext: event.target.checked })} /><span>长上下文</span></label>
              <label className="switch-row"><input type="checkbox" checked={draft.stream} onChange={(event) => onChange({ stream: event.target.checked })} /><span>流式输出</span></label>
              <label className="switch-row"><input type="checkbox" checked={draft.jsonMode} onChange={(event) => onChange({ jsonMode: event.target.checked })} /><span>JSON 模式</span></label>
            </div>
          </div>
        ) : null}
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
              英文
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
              <div className="mini-card-sub">这组偏好不写入资料库，不进入导出包，也不改变后端业务数据。</div>
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
        <h3>智能体工作流观察</h3>
        <div className="signal-list">
          <div className="signal-item">
            <Bot size={16} />
            <div>
              <div className="mini-card-title">当前可见智能体</div>
              <div className="mini-card-sub">{enabledCount} / {sortedAgents.length} 处于启用状态</div>
            </div>
          </div>
          <div className="signal-item">
            <CheckCircle2 size={16} />
            <div>
              <div className="mini-card-title">关注智能体</div>
              <div className="mini-card-sub">{preferences.watchedAgentIds.length} 个会在工作台运行卡里重点高亮</div>
            </div>
          </div>
        </div>
      </section>

      {feedback ? <div className="inspector-feedback">{feedback}</div> : null}

      <section className="list-card">
        <div className="list-row head">
          <span className="col" style={{ width: 36 }}>#</span>
          <span className="col col-grow">智能体</span>
          <span className="col" style={{ width: 90 }}>状态</span>
          <span className="col" style={{ width: 96 }}>关注</span>
        </div>
        {loading ? (
          <div className="center-state" style={{ minHeight: 220 }}>
            <div className="spinner" />
            <span>正在加载智能体</span>
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
  const [modelFeedback, setModelFeedback] = useState<FeedbackState | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [testingModel, setTestingModel] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<ModelConfig | null>(null);

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

  async function loadModels() {
    setModelsLoading(true);
    try {
      const list = await api.listModels();
      setModels(list);
      setSelectedModelId((current) => current && list.some((model) => model.id === current) ? current : null);
    } catch (error) {
      setModelFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "模型加载失败" });
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
      setPreferencesFeedback(error instanceof ApiError ? error.message : "智能体列表加载失败");
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
      setVaultFeedback("请输入资料库目录绝对路径");
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

  function resetModelEditor(): void {
    setSelectedModelId(null);
    setModelDraft(createModelDraft());
    setModelMode("create");
    setApiKey("");
  }

  async function saveModelDraftWithOptionalKey(): Promise<{ saved: ModelConfig; wasCreate: boolean }> {
    const payload = toModelPayload(modelDraft);
    if (!payload.id || !payload.provider || !payload.model) {
      throw new Error("请先填写配置 ID、服务商和模型名");
    }

    const wasCreate = modelMode === "create" || !selectedModel;
    const saved = wasCreate ? await api.createModel(payload) : await api.updateModel(selectedModel.id, payload);

    if (apiKey.trim()) {
      await api.storeModelApiKey(saved.id, apiKey.trim());
      setApiKey("");
    }

    await loadModels();
    if (wasCreate) {
      resetModelEditor();
    } else {
      setSelectedModelId(saved.id);
    }
    return { saved, wasCreate };
  }

  return (
    <ViewShell title="设置" subtitle="外观、模型、远程访问、通用偏好、智能体与快捷键">
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
                <p className="view-sub">当前资料库：{vaultPath || "尚未选择"}</p>
              </div>
            </div>
            <div className="form-grid form-grid-2">
              <label className="form-block">
                <span>资料库目录</span>
                <input
                  className="input"
                  value={vaultDraft}
                  onChange={(event) => setVaultDraft(event.target.value)}
                  placeholder={"输入资料库目录绝对路径，例如 C:\\书灵阁资料库"}
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
                  <div className="fr-desc">浅色 / 护眼 / 深色三套文房主题，背景、面板和文字会整体切换。</div>
                </div>
                <div className="segmented">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={preferences.themeMode === option.value ? "on" : ""}
                      title={option.description}
                      onClick={() => savePreferencePatch({ themeMode: option.value }, setPreferences, setPreferencesFeedback)}
                    >
                      {option.label}
                    </button>
                  ))}
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
                          resetModelEditor();
                          setModelFeedback(null);
                        }}
                      >
                        新建模型
                      </button>
                    </div>
                    <div className="list-card">
                      <div className="list-row head">
                        <span className="col col-grow">模型</span>
                        <span className="col" style={{ width: 120 }}>服务商</span>
                        <span className="col" style={{ width: 90 }}>密钥</span>
                      </div>
                      {models.map((model) => (
                        <div
                          className={`list-row model-list-row ${selectedModel?.id === model.id ? "active" : ""}`}
                          key={model.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedModelId(model.id);
                            setModelFeedback(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedModelId(model.id);
                              setModelFeedback(null);
                            }
                          }}
                        >
                          <span className="col col-grow">
                            <div className="col-name">{model.id}</div>
                            <div className="col-sub">{model.model ?? "未设置模型名"} · {model.baseUrl ?? "默认 API 地址"}</div>
                          </span>
                          <span className="col" style={{ width: 120 }}>
                            <span className="tag">{PROVIDER_LABELS[String(model.provider ?? "")] ?? model.provider ?? "—"}</span>
                          </span>
                          <span className="col" style={{ width: 90 }}>
                            <span className={`tag ${model.hasKey ? "primary" : ""}`}>{model.hasKey ? "已存" : "缺失"}</span>
                          </span>
                          <span className="model-row-actions">
                            <button
                              type="button"
                              className="btn-icon"
                              title="编辑模型"
                              aria-label={`编辑模型 ${model.id}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedModelId(model.id);
                                setModelFeedback(null);
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon danger"
                              title="删除模型"
                              aria-label={`删除模型 ${model.id}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setModelToDelete(model);
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </span>
                        </div>
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
                    if (!vaultPath) {
                      setModelFeedback({ kind: "error", message: "请先在设置页或弹窗选择资料库" });
                      return;
                    }
                    setSavingModel(true);
                    setModelFeedback(null);
                    try {
                      const { wasCreate } = await saveModelDraftWithOptionalKey();
                      setModelFeedback({
                        kind: "success",
                        message: wasCreate
                          ? "模型配置已保存，可以继续新建下一个"
                          : apiKey.trim()
                            ? "模型配置和 API 密钥已保存"
                            : "模型配置已保存",
                      });
                    } catch (error) {
                      setModelFeedback({ kind: "error", message: error instanceof Error ? error.message : "模型保存失败" });
                    } finally {
                      setSavingModel(false);
                    }
                  })();
                }}
                saving={savingModel}
                apiKey={apiKey}
                setApiKey={setApiKey}
                onTest={() => {
                  void (async () => {
                    if (!vaultPath) {
                      setModelFeedback({ kind: "error", message: "请先在设置页或弹窗选择资料库" });
                      return;
                    }
                    setTestingModel(true);
                    setModelFeedback(null);
                    try {
                      const { saved } = await saveModelDraftWithOptionalKey();
                      await api.testModelConnection(saved.id);
                      setModelFeedback({ kind: "success", message: "连接成功，配置已保存" });
                    } catch (error) {
                      setModelFeedback({ kind: "error", message: error instanceof Error ? error.message : "连通性测试失败" });
                    } finally {
                      setTestingModel(false);
                    }
                  })();
                }}
                testing={testingModel}
                feedback={modelFeedback}
                hasKey={Boolean(selectedModel?.hasKey)}
                vaultReady={Boolean(vaultPath)}
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

          {sec === "智能体" ? (
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
                      <div className="mini-card-sub">正文与元数据仍以资料库里的 Markdown/JSON 为真相源。</div>
                    </div>
                  </div>
                  <div className="signal-item">
                    <KeyRound size={16} />
                    <div>
                      <div className="mini-card-title">密钥安全</div>
                      <div className="mini-card-sub">API 密钥仅写入系统凭据管理器，不进前端状态与导出。</div>
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
      {modelToDelete ? (
        <ConfirmModal
          title="删除模型配置"
          message={`确定删除模型配置「${modelToDelete.id}」吗？`}
          confirmText="删除"
          danger
          onConfirm={() => {
            void (async () => {
              const deleting = modelToDelete;
              setModelToDelete(null);
              setModelFeedback(null);
              try {
                await api.deleteModel(deleting.id);
                await loadModels();
                if (selectedModelId === deleting.id) {
                  resetModelEditor();
                }
                setModelFeedback({ kind: "success", message: `模型配置「${deleting.id}」已删除` });
              } catch (error) {
                setModelFeedback({ kind: "error", message: error instanceof Error ? error.message : "删除模型配置失败" });
              }
            })();
          }}
          onCancel={() => setModelToDelete(null)}
        />
      ) : null}
    </ViewShell>
  );
}
