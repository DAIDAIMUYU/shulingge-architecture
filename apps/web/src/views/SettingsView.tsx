import { useEffect, useMemo, useState } from "react";
import {
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
  DEFAULT_BODY_FONT,
  DEFAULT_UI_FONT,
  applyBodyFontPreference,
  applyTitleAlignPreference,
  applyUiFontPreference,
  mergeWebPreferences,
  readWebPreferences,
  writeWebPreferences,
  type FontPreference,
  type TitleAlignPreference,
  type WebThemeMode,
  type WebPreferences,
} from "../app/preferences.js";
import { customFontToPreference, loadCustomFonts as loadStoredCustomFonts, registerCustomFont } from "../app/fonts.js";
import {
  api,
  ApiError,
  type ModelConfig,
  type ModelConfigInput,
  type RemoteGatewayStatus,
  type CustomFontRecord,
  type SearchSourceInfo,
  type SearchSourceState,
} from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { AgentsView } from "./AgentsView.js";
import { Select } from "./Select.js";
import { ViewShell } from "./common.js";

const SECTIONS = ["资料库", "外观", "模型与 API", "联网查资料", "远程访问", "通用", "智能体", "快捷键", "关于"] as const;
type Section = (typeof SECTIONS)[number];

type ResearchConfigSource = "google" | "bing" | "custom";
type CustomResearchSourceDraft = { id: string; name: string; baseUrl: string };
type SourceStatesDraft = Record<string, SearchSourceState>;
type FontOption = FontPreference & { dataUrl?: string };

const UI_FONT_PRESETS: FontOption[] = [
  { id: "preset-source-han-sans", label: "思源黑体", family: '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif', source: "preset" },
  DEFAULT_BODY_FONT,
  { id: "preset-yahei", label: "微软雅黑", family: '"Microsoft YaHei", "微软雅黑", sans-serif', source: "preset" },
  { id: "preset-simhei", label: "黑体 SimHei", family: '"SimHei", "黑体", sans-serif', source: "preset" },
  { id: "preset-dengxian", label: "等线 DengXian", family: '"DengXian", "等线", sans-serif', source: "preset" },
  { id: "preset-pingfang", label: "苹方 PingFang SC", family: '"PingFang SC", "Microsoft YaHei", sans-serif', source: "preset" },
];

const BODY_FONT_PRESETS: FontOption[] = [
  { id: "body-follow-ui", label: "跟随界面字体", family: "var(--font-sans)", source: "preset" },
  DEFAULT_BODY_FONT,
  { id: "preset-simsun", label: "宋体", family: '"SimSun", "宋体", serif', source: "preset" },
  { id: "preset-kaiti", label: "楷体 KaiTi", family: '"KaiTi", "楷体", serif', source: "preset" },
  { id: "preset-fangsong", label: "仿宋 FangSong", family: '"FangSong", "仿宋", serif', source: "preset" },
  { id: "preset-source-han-sans-body", label: "思源黑体", family: '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif', source: "preset" },
];

const TITLE_ALIGN_OPTIONS: Array<{ value: TitleAlignPreference; label: string; description: string }> = [
  { value: "left", label: "居左", description: "章节标题靠左显示" },
  { value: "center", label: "居中", description: "章节标题居中显示" },
  { value: "right", label: "居右", description: "章节标题靠右显示" },
];

const FONT_IMPORT_ACCEPT = ".ttf,.otf,.woff,.woff2";
const MAX_FONT_FILE_BYTES = 8 * 1024 * 1024;

const RESEARCH_CONFIG_SOURCE_OPTIONS: Array<{ value: ResearchConfigSource; label: string; hint: string }> = [
  { value: "google", label: "谷歌 Google", hint: "API key + 搜索引擎 ID（cx）" },
  { value: "bing", label: "必应 Bing", hint: "Bing Web Search API key" },
  { value: "custom", label: "自定义 MediaWiki 源", hint: "公开 MediaWiki api.php 地址" },
];

function createLocalCustomSourceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 12);
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function customFontToOption(font: CustomFontRecord, fallback: FontPreference): FontOption {
  return customFontToPreference(font, fallback);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("字体文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function sourceHealthLabel(source: SearchSourceInfo): string {
  if (source.health?.status === "verified") return "已验证可用";
  if (source.health?.status === "failed") return "上次失败";
  if (!source.configured) return "待配置";
  if (source.free && !source.requiresKey) return "免费可用";
  return "未测试";
}

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
            <Select
              value={draft.provider}
              options={[
                ...(!providerKnownInSelector
                  ? [{ value: draft.provider, label: PROVIDER_LABELS[draft.provider] ?? draft.provider }]
                  : []),
                ...PROVIDER_OPTIONS,
              ]}
              onChange={(nextValue) => {
                const provider = nextValue;
                onChange({
                  provider,
                  baseUrl: DEFAULT_PROVIDER_BASE_URLS[provider] ?? "",
                });
              }}
              ariaLabel="服务商"
            />
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
  const shortcutGroups = [
    {
      title: "文件类",
      items: [
        { action: "保存当前章节", keys: "Ctrl / Cmd + S", note: "仅在正文编辑器获得焦点时触发" },
      ],
    },
    {
      title: "编辑格式类",
      items: [
        { action: "加粗", keys: "Ctrl / Cmd + B", note: "富文本模式" },
        { action: "斜体", keys: "Ctrl / Cmd + I", note: "富文本模式" },
        { action: "撤销", keys: "Ctrl / Cmd + Z", note: "使用编辑器原生撤销" },
        { action: "重做", keys: "Ctrl / Cmd + Shift + Z", note: "使用编辑器原生重做" },
      ],
    },
    {
      title: "视图类",
      items: [
        { action: "切换专注模式", keys: "Ctrl / Cmd + Shift + F", note: "仅在正文编辑器获得焦点时触发" },
        { action: "关闭浮层/弹窗", keys: "Esc", note: "关闭速查、弹窗或菜单" },
      ],
    },
    {
      title: "对话类",
      items: [
        { action: "发送总控消息", keys: sendLabel, note: "可在上方切换" },
        { action: "总控消息换行", keys: newlineLabel, note: "随发送组合键自动调整" },
      ],
    },
  ];

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
        <h3>快捷键列表</h3>
        <div className="shortcut-groups">
          {shortcutGroups.map((group) => (
            <div className="shortcut-group" key={group.title}>
              <div className="shortcut-group-title">
                <Keyboard size={15} />
                {group.title}
              </div>
              <div className="shortcut-list">
                {group.items.map((item) => (
                  <div className="shortcut-row" key={`${group.title}-${item.action}`}>
                    <div>
                      <div className="shortcut-action">{item.action}</div>
                      <div className="shortcut-note">{item.note}</div>
                    </div>
                    <kbd>{item.keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
  const [sec, setSec] = useState<Section>("资料库");
  const [preferences, setPreferences] = useState<WebPreferences>(() => readWebPreferences());
  const [preferencesFeedback, setPreferencesFeedback] = useState<string | null>(null);
  const [customFonts, setCustomFonts] = useState<CustomFontRecord[]>([]);
  const [fontFeedback, setFontFeedback] = useState<string | null>(null);
  const [fontImporting, setFontImporting] = useState(false);
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

  const [remoteStatus, setRemoteStatus] = useState<RemoteGatewayStatus | null>(null);
  const [remotePassword, setRemotePassword] = useState("");
  const [remotePort, setRemotePort] = useState("3000");
  const [remoteAutoStart, setRemoteAutoStart] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteFeedback, setRemoteFeedback] = useState<string | null>(null);
  const [searchSources, setSearchSources] = useState<SearchSourceInfo[]>([]);
  const [defaultResearchSource, setDefaultResearchSource] = useState("wikipedia");
  const [sourceStates, setSourceStates] = useState<SourceStatesDraft>({});
  const [customSources, setCustomSources] = useState<CustomResearchSourceDraft[]>([]);
  const [customSourceDraft, setCustomSourceDraft] = useState<CustomResearchSourceDraft>(() => ({
    id: createLocalCustomSourceId(),
    name: "",
    baseUrl: "",
  }));
  const [editingCustomSourceId, setEditingCustomSourceId] = useState<string | null>(null);
  const [googleCx, setGoogleCx] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [googleHasKey, setGoogleHasKey] = useState(false);
  const [bingApiKey, setBingApiKey] = useState("");
  const [bingHasKey, setBingHasKey] = useState(false);
  const [researchConfigSource, setResearchConfigSource] = useState<ResearchConfigSource>("google");
  const [savingResearchSettings, setSavingResearchSettings] = useState(false);
  const [testingResearchSource, setTestingResearchSource] = useState<ResearchConfigSource | null>(null);
  const [researchSettingsFeedback, setResearchSettingsFeedback] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );
  const uiFontOptions = useMemo<FontOption[]>(
    () => [...UI_FONT_PRESETS, ...customFonts.map((font) => customFontToOption(font, DEFAULT_UI_FONT))],
    [customFonts],
  );
  const bodyFontOptions = useMemo<FontOption[]>(
    () => [...BODY_FONT_PRESETS, ...customFonts.map((font) => customFontToOption(font, DEFAULT_BODY_FONT))],
    [customFonts],
  );

  function saveUiFont(fontId: string): void {
    const font = uiFontOptions.find((option) => option.id === fontId) ?? DEFAULT_UI_FONT;
    savePreferencePatch({ uiFont: font }, setPreferences, setPreferencesFeedback);
  }

  function saveBodyFont(fontId: string): void {
    const font = bodyFontOptions.find((option) => option.id === fontId) ?? DEFAULT_BODY_FONT;
    savePreferencePatch({ bodyFont: font }, setPreferences, setPreferencesFeedback);
  }

  async function importBodyFont(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    setFontFeedback(null);
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".ttf", ".otf", ".woff", ".woff2"].includes(extension)) {
      setFontFeedback("仅支持 .ttf、.otf、.woff、.woff2 字体文件");
      return;
    }
    if (file.size > MAX_FONT_FILE_BYTES) {
      setFontFeedback("字体文件需小于 8MB");
      return;
    }
    setFontImporting(true);
    try {
      const contentBase64 = await readFileAsBase64(file);
      const label = file.name.replace(/\.[^.]+$/, "");
      const font = await api.importCustomFont({
        label,
        fileName: file.name,
        mimeType: file.type || "font/ttf",
        contentBase64,
      });
      await registerCustomFont(font);
      setCustomFonts((current) => [...current.filter((item) => item.id !== font.id), font]);
      setFontFeedback(`已导入字体：${font.label}，可在界面字体和正文字体中选择`);
    } catch (error) {
      setFontFeedback(error instanceof ApiError ? error.message : "字体导入失败");
    } finally {
      setFontImporting(false);
    }
  }

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

  async function loadCustomFonts(): Promise<void> {
    try {
      const fonts = await loadStoredCustomFonts();
      setCustomFonts(fonts);
    } catch (error) {
      setFontFeedback(error instanceof ApiError ? error.message : "字体列表加载失败");
    }
  }

  async function loadResearchSettings() {
    try {
      const [sources, settings] = await Promise.all([
        api.listSearchSources(),
        api.getResearchSettings(),
      ]);
      setSearchSources(sources);
      setDefaultResearchSource(settings.defaultSource || "wikipedia");
      setSourceStates(settings.sourceStates ?? {});
      const loadedCustomSources = settings.customSources?.length
        ? settings.customSources
        : settings.customSource?.baseUrl
          ? [{
            id: "legacy",
            name: settings.customSource.name || "自定义源",
            baseUrl: settings.customSource.baseUrl,
          }]
          : [];
      setCustomSources(loadedCustomSources);
      setGoogleCx(settings.google?.cx ?? "");
      setGoogleHasKey(Boolean(settings.google?.hasKey));
      setBingHasKey(Boolean(settings.bing?.hasKey));
    } catch (error) {
      setResearchSettingsFeedback(error instanceof ApiError ? error.message : "联网查资料设置加载失败");
    }
  }

  useEffect(() => {
    void loadModels();
    void loadRemoteStatus();
    void loadResearchSettings();
    void loadCustomFonts();
  }, []);

  async function saveResearchDefaultSource(nextSource: string): Promise<void> {
    setDefaultResearchSource(nextSource);
    setResearchSettingsFeedback(null);
    try {
      const saved = await api.updateResearchSettings({ defaultSource: nextSource });
      setDefaultResearchSource(saved.defaultSource || nextSource);
      setResearchSettingsFeedback("联网查资料默认源已保存");
    } catch (error) {
      setResearchSettingsFeedback(error instanceof ApiError ? error.message : "联网查资料默认源保存失败");
    }
  }

  async function saveResearchSettings(): Promise<void> {
    setSavingResearchSettings(true);
    setResearchSettingsFeedback(null);
    try {
      const saved = await api.updateResearchSettings({
        defaultSource: defaultResearchSource,
        sourceStates,
        customSources: customSources
          .map((source) => ({
            id: source.id,
            name: source.name.trim(),
            baseUrl: source.baseUrl.trim(),
          }))
          .filter((source) => source.name && source.baseUrl),
        google: {
          cx: googleCx.trim() || undefined,
          apiKey: googleApiKey.trim() || undefined,
        },
        bing: {
          apiKey: bingApiKey.trim() || undefined,
        },
      });
      setDefaultResearchSource(saved.defaultSource || defaultResearchSource);
      setSourceStates(saved.sourceStates ?? {});
      setCustomSources(saved.customSources ?? []);
      setGoogleCx(saved.google?.cx ?? "");
      setGoogleHasKey(Boolean(saved.google?.hasKey));
      setBingHasKey(Boolean(saved.bing?.hasKey));
      setGoogleApiKey("");
      setBingApiKey("");
      await loadResearchSettings();
      setResearchSettingsFeedback("联网查资料配置已保存");
    } catch (error) {
      setResearchSettingsFeedback(error instanceof ApiError ? error.message : "联网查资料配置保存失败");
    } finally {
      setSavingResearchSettings(false);
    }
  }

  function resetCustomSourceDraft(): void {
    setCustomSourceDraft({ id: createLocalCustomSourceId(), name: "", baseUrl: "" });
    setEditingCustomSourceId(null);
  }

  function upsertCustomSourceDraft(): void {
    const name = customSourceDraft.name.trim();
    const baseUrl = customSourceDraft.baseUrl.trim();
    setResearchSettingsFeedback(null);
    if (!name || !baseUrl) {
      setResearchSettingsFeedback("请填写自定义源名称和 api.php base url");
      return;
    }

    const nextSource = { ...customSourceDraft, name, baseUrl };
    setCustomSources((current) => {
      if (editingCustomSourceId) {
        return current.map((source) => source.id === editingCustomSourceId ? nextSource : source);
      }
      return [...current, nextSource];
    });
    resetCustomSourceDraft();
  }

  function editCustomSource(source: CustomResearchSourceDraft): void {
    setResearchConfigSource("custom");
    setEditingCustomSourceId(source.id);
    setCustomSourceDraft(source);
  }

  function removeCustomSource(id: string): void {
    setCustomSources((current) => current.filter((source) => source.id !== id));
    setSourceStates((current) => {
      const next = { ...current };
      delete next[`custom:${id}`];
      return next;
    });
    if (editingCustomSourceId === id) {
      resetCustomSourceDraft();
    }
    if (defaultResearchSource === `custom:${id}`) {
      setDefaultResearchSource("wikipedia");
    }
  }

  function setResearchSourceEnabled(sourceId: string, enabled: boolean): void {
    setSourceStates((current) => ({
      ...current,
      [sourceId]: {
        ...(current[sourceId] ?? {}),
        enabled,
      },
    }));
    if (!enabled && defaultResearchSource === sourceId) {
      setResearchSettingsFeedback("当前默认源已停用，请选择一个已启用的默认源并保存。");
    }
  }

  function isResearchSourceEnabled(source: SearchSourceInfo): boolean {
    return sourceStates[source.id]?.enabled ?? source.enabled !== false;
  }

  async function testCurrentResearchSource(): Promise<void> {
    setTestingResearchSource(researchConfigSource);
    setResearchSettingsFeedback(null);
    try {
      const result = await api.testSearchSource({
        source: researchConfigSource,
        customSource: researchConfigSource === "custom"
          ? {
            id: customSourceDraft.id,
            name: customSourceDraft.name.trim(),
            baseUrl: customSourceDraft.baseUrl.trim(),
          }
          : undefined,
        google: researchConfigSource === "google"
          ? {
            cx: googleCx.trim() || undefined,
            apiKey: googleApiKey.trim() || undefined,
          }
          : undefined,
        bing: researchConfigSource === "bing"
          ? {
            apiKey: bingApiKey.trim() || undefined,
          }
          : undefined,
      });
      setResearchSettingsFeedback(result.message);
      await loadResearchSettings();
    } catch (error) {
      setResearchSettingsFeedback(error instanceof ApiError ? error.message : "测试连接失败");
      await loadResearchSettings();
    } finally {
      setTestingResearchSource(null);
    }
  }

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = preferences.preferredLanguage;
    }
  }, [preferences.preferredLanguage]);

  useEffect(() => {
    applyBodyFontPreference(preferences.bodyFont);
  }, [preferences.bodyFont]);

  useEffect(() => {
    applyTitleAlignPreference(preferences.titleAlign);
  }, [preferences.titleAlign]);

  useEffect(() => {
    applyUiFontPreference(preferences.uiFont);
  }, [preferences.uiFont]);

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
      await loadCustomFonts();
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
    setCustomFonts([]);
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
    <ViewShell title="设置" subtitle="外观、模型、联网查资料、远程访问、通用偏好、智能体与快捷键">
      <div className="settings-layout">
        <div className="settings-menu">
          {SECTIONS.map((section) => (
            <button key={section} type="button" className={sec === section ? "on" : ""} onClick={() => setSec(section)}>
              {section}
            </button>
          ))}
        </div>

        <div>
          {sec === "资料库" ? (
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
          ) : null}

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
                  <div className="fr-label">界面字体</div>
                  <div className="fr-desc">影响导航、按钮、列表、设置、弹窗、下拉菜单等所有界面文字。</div>
                </div>
                <Select
                  value={uiFontOptions.some((option) => option.id === preferences.uiFont.id) ? preferences.uiFont.id : DEFAULT_UI_FONT.id}
                  onChange={saveUiFont}
                  options={uiFontOptions.map((font) => ({
                    value: font.id,
                    label: font.label,
                    hint: font.source === "custom" ? "已导入字体" : "系统/预设字体",
                  }))}
                  ariaLabel="选择界面字体"
                />
              </div>
              <div className="form-row">
                <div>
                  <div className="fr-label">正文字体</div>
                  <div className="fr-desc">只影响编辑器正文和章节标题，优先级高于界面字体。</div>
                </div>
                <Select
                  value={bodyFontOptions.some((option) => option.id === preferences.bodyFont.id) ? preferences.bodyFont.id : DEFAULT_BODY_FONT.id}
                  onChange={saveBodyFont}
                  options={bodyFontOptions.map((font) => ({
                    value: font.id,
                    label: font.label,
                    hint: font.source === "custom" ? "已导入字体" : "系统/预设字体",
                  }))}
                  ariaLabel="选择正文字体"
                />
              </div>
              <div className="form-row">
                <div>
                  <div className="fr-label">章节标题对齐</div>
                  <div className="fr-desc">只影响写作页章节标题，不改变正文段落对齐。</div>
                </div>
                <div className="segmented">
                  {TITLE_ALIGN_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={preferences.titleAlign === option.value ? "on" : ""}
                      title={option.description}
                      onClick={() => savePreferencePatch({ titleAlign: option.value }, setPreferences, setPreferencesFeedback)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <div>
                  <div className="fr-label">导入字体</div>
                  <div className="fr-desc">支持 ttf、otf、woff、woff2，单个文件不超过 8MB。导入后会同时加入界面字体和正文字体列表。</div>
                </div>
                <div className="font-import-actions">
                  <label className={`btn ${fontImporting ? "disabled" : ""}`}>
                    {fontImporting ? "导入中..." : "选择字体文件"}
                    <input
                      type="file"
                      accept={FONT_IMPORT_ACCEPT}
                      disabled={fontImporting}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        void importBodyFont(file);
                      }}
                    />
                  </label>
                  <div className="font-preview-stack">
                    <div className="font-preview" style={{ fontFamily: preferences.uiFont.family }}>
                      界面预览 · 按钮列表菜单
                    </div>
                    <div className="font-preview" style={{ fontFamily: preferences.bodyFont.family }}>
                      山月入窗，正文预览
                    </div>
                  </div>
                </div>
              </div>
              {fontFeedback ? <div className="inspector-feedback">{fontFeedback}</div> : null}
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

          {sec === "联网查资料" ? (
            <div className="stack-list">
              <section className="info-card">
                <h3>默认搜索源</h3>
                <div className="form-row">
                  <div>
                    <div className="fr-label">联网查资料默认使用</div>
                    <div className="fr-desc">角色、世界大纲、时间线会默认使用这里选择的资料源；各弹窗里仍可临时切换。</div>
                  </div>
                  <Select
                    className="settings-source-select"
                    value={defaultResearchSource}
                    onChange={(value) => void saveResearchDefaultSource(value)}
                    options={searchSources.map((source) => ({
                      value: source.id,
                      label: source.name,
                      hint: `${isResearchSourceEnabled(source) ? "已启用" : "已停用"} · ${sourceHealthLabel(source)} · ${source.implemented ? (source.configured ? "已配置" : "未配置") : "占位"} · ${source.free ? "免费" : "付费/限额"}${source.requiresKey ? " · 需 key" : ""} · ${source.networkNote}`,
                      disabled: !source.implemented || !source.configured || !isResearchSourceEnabled(source),
                    }))}
                    placeholder="选择默认源"
                    ariaLabel="联网查资料默认搜索源"
                  />
                </div>
                {searchSources.find((source) => source.id === defaultResearchSource && !isResearchSourceEnabled(source)) ? (
                  <div className="inspector-feedback">当前默认源已停用，请选择一个已启用的默认源。</div>
                ) : null}
              </section>

              <section className="info-card research-settings-card">
                <h3>配置搜索源</h3>
                <div className="list-card">
                  <div className="list-row head">
                    <span className="col col-grow">搜索源状态</span>
                    <span className="col" style={{ width: 100 }}>健康</span>
                    <span className="col" style={{ width: 110 }}>启用</span>
                  </div>
                  {searchSources.map((source) => (
                    <div className="list-row model-list-row" key={source.id}>
                      <span className="col col-grow">
                        <div className="col-name">{source.name}</div>
                        <div className="col-sub">
                          {source.configured ? "已配置" : "未配置"} · {source.networkNote}
                          {source.health?.message ? ` · ${source.health.message}` : ""}
                        </div>
                      </span>
                      <span className={`tag ${source.health?.status === "verified" ? "primary" : ""}`}>
                        {sourceHealthLabel(source)}
                      </span>
                      <label className="switch-row">
                        <input
                          type="checkbox"
                          checked={isResearchSourceEnabled(source)}
                          onChange={(event) => setResearchSourceEnabled(source.id, event.target.checked)}
                        />
                        <span>{isResearchSourceEnabled(source) ? "启用" : "停用"}</span>
                      </label>
                    </div>
                  ))}
                </div>
                <div className="form-row">
                  <div>
                    <div className="fr-label">选择要配置的搜索源</div>
                    <div className="fr-desc">只在这里填写搜索源配置；角色、世界大纲、时间线里的下拉框只选择已配置好的源。</div>
                  </div>
                  <Select
                    value={researchConfigSource}
                    onChange={(value) => setResearchConfigSource(value as ResearchConfigSource)}
                    options={RESEARCH_CONFIG_SOURCE_OPTIONS}
                    ariaLabel="选择要配置的搜索源"
                  />
                </div>

                {researchConfigSource === "google" ? (
                  <div className="model-editor-section research-config-section">
                    <div className="model-editor-section-title">谷歌 Google</div>
                    <div className="form-grid form-grid-2">
                      <label className="form-block">
                        <span>Google API key</span>
                        <input
                          className="input"
                          type="password"
                          value={googleApiKey}
                          placeholder={googleHasKey ? "已保存，留空则不变" : "粘贴 API key"}
                          onChange={(event) => setGoogleApiKey(event.target.value)}
                        />
                      </label>
                      <label className="form-block">
                        <span>搜索引擎 ID（cx）</span>
                        <input
                          className="input"
                          value={googleCx}
                          placeholder="Google Custom Search cx"
                          onChange={(event) => setGoogleCx(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="fr-desc">Google Custom Search JSON API 每天免费 100 次，超出可能收费。API key 只写入本机凭据存储，Vault 只保存 keyRef。</div>
                    <div className="model-actions-row">
                      <button type="button" className="btn" onClick={() => void testCurrentResearchSource()} disabled={testingResearchSource === "google"}>
                        {testingResearchSource === "google" ? "测试中..." : "测试连接"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {researchConfigSource === "bing" ? (
                  <div className="model-editor-section research-config-section">
                    <div className="model-editor-section-title">必应 Bing</div>
                    <label className="form-block">
                      <span>Bing API key</span>
                      <input
                        className="input"
                        type="password"
                        value={bingApiKey}
                        placeholder={bingHasKey ? "已保存，留空则不变" : "粘贴 API key"}
                        onChange={(event) => setBingApiKey(event.target.value)}
                      />
                    </label>
                    <div className="fr-desc">使用 Bing Web Search API 的 Ocp-Apim-Subscription-Key。微软接口可能随账号和区域调整，有可用旧 key 时可继续使用。</div>
                    <div className="model-actions-row">
                      <button type="button" className="btn" onClick={() => void testCurrentResearchSource()} disabled={testingResearchSource === "bing"}>
                        {testingResearchSource === "bing" ? "测试中..." : "测试连接"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {researchConfigSource === "custom" ? (
                  <div className="model-editor-section research-config-section">
                    <div className="model-editor-section-title">自定义 MediaWiki 源</div>
                    <div className="list-card">
                      <div className="list-row head">
                        <span className="col col-grow">已添加的自定义源</span>
                        <span className="col" style={{ width: 92 }}>操作</span>
                      </div>
                      {customSources.length > 0 ? customSources.map((source) => (
                        <div className="list-row model-list-row" key={source.id}>
                          <span className="col col-grow">
                            <div className="col-name">{source.name}</div>
                            <div className="col-sub">{source.baseUrl}</div>
                          </span>
                          <span className="model-row-actions">
                            <button type="button" className="btn" onClick={() => editCustomSource(source)}>
                              编辑
                            </button>
                            <button type="button" className="btn btn-danger" onClick={() => removeCustomSource(source.id)}>
                              删除
                            </button>
                          </span>
                        </div>
                      )) : (
                        <div className="list-row">
                          <span className="col col-grow">
                            <div className="col-sub">还没有添加自定义源。添加后会出现在默认源和各处联网查资料下拉里。</div>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="model-editor-section research-custom-form">
                      <div className="model-editor-section-title">{editingCustomSourceId ? "编辑自定义源" : "添加自定义源"}</div>
                      <label className="form-block">
                        <span>源名称</span>
                        <input
                          className="input"
                          value={customSourceDraft.name}
                          placeholder="例如 Fandom 百科"
                          onChange={(event) => setCustomSourceDraft((current) => ({ ...current, name: event.target.value }))}
                        />
                      </label>
                      <label className="form-block">
                        <span>api.php base url</span>
                        <input
                          className="input"
                          value={customSourceDraft.baseUrl}
                          placeholder="https://xxx.fandom.com/api.php"
                          onChange={(event) => setCustomSourceDraft((current) => ({ ...current, baseUrl: event.target.value }))}
                        />
                      </label>
                      <div className="model-actions-row">
                        <button type="button" className="btn btn-primary" onClick={upsertCustomSourceDraft}>
                          {editingCustomSourceId ? "保存到列表" : "添加自定义源"}
                        </button>
                        {editingCustomSourceId || customSourceDraft.name || customSourceDraft.baseUrl ? (
                          <button type="button" className="btn" onClick={resetCustomSourceDraft}>
                            取消
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="fr-desc">自定义源按 MediaWiki 处理，复用维基/萌娘的 search、extracts 和信息框抓取逻辑；公开 MediaWiki 接口一般无需 key。</div>
                    <div className="model-actions-row">
                      <button type="button" className="btn" onClick={() => void testCurrentResearchSource()} disabled={testingResearchSource === "custom"}>
                        {testingResearchSource === "custom" ? "测试中..." : "测试连接"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="view-actions research-save-actions">
                  <button type="button" className="btn btn-primary" onClick={() => void saveResearchSettings()} disabled={savingResearchSettings}>
                    {savingResearchSettings ? "保存中..." : "保存联网查资料配置"}
                  </button>
                </div>
                {researchSettingsFeedback ? <div className="inspector-feedback">{researchSettingsFeedback}</div> : null}
              </section>
            </div>
          ) : null}

          {sec === "智能体" ? (
            <AgentsView embedded />
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
