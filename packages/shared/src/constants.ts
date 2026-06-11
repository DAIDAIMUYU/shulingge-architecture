export const SCOPE_VALUES = [
  "system",
  "global",
  "vault",
  "project",
  "novel",
  "volume",
  "chapter",
  "task",
  "agent",
] as const;

export const RULE_LEVEL_VALUES = [
  "locked",
  "hard",
  "soft",
  "preference",
] as const;

export const AGENT_PERMISSION_MODE_VALUES = [
  "controller",
  "writer",
  "blocker",
  "checker",
  "advisor",
  "state-updater",
] as const;

export const CHAPTER_STATUS_VALUES = [
  "not-started",
  "planning",
  "drafting",
  "checking",
  "repairing",
  "await-human",
  "finalized",
  "archived",
] as const;

export const WRITING_FREEDOM_VALUES = [
  "strict",
  "light",
  "medium",
  "high",
] as const;

export const WRITE_SCOPE_VALUES = [
  "paragraph",
  "scene",
  "chapter",
] as const;

export const PROVIDER_TYPE_VALUES = [
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "openrouter",
  "siliconflow",
  "volcengine",
  "aliyun-bailian",
  "openai-compatible",
  "ollama",
  "lmstudio",
  "vllm",
  "custom-local",
] as const;

export const OVERRIDE_POLICY_VALUES = [
  "locked",
  "allow-branch-override",
  "append-only",
  "disable-in-branch",
  "no-override",
] as const;

export const PROJECT_SERIES_TYPE_VALUES = [
  "original",
  "fanfiction",
  "roleplay-adaptation",
  "short-collection",
  "blank",
] as const;

export const WORLDBOOK_ORIGIN_VALUES = [
  "canon",
  "original",
] as const;

export const WORLDBOOK_CATEGORY_VALUES = [
  "place",
  "organization",
  "people",
  "history",
  "event",
  "item",
  "power-system",
  "rule",
  "culture",
  "geography",
  "politics",
  "economy",
  "religion",
  "language",
  "technology",
  "faction-relation",
  "other",
  "setting",
] as const;

export const WORLDBOOK_IMPORTANCE_VALUES = [
  "core",
  "important",
  "minor",
] as const;

export const WORLDBOOK_TEMPLATE_VALUES = [
  "simple",
  "detailed",
] as const;

export const WORLDBOOK_PROFILE_GROUP_VALUES = [
  "basic",
  "content",
  "background",
  "relations",
  "writing",
] as const;

export const WORLDBOOK_CATEGORY_LABELS: Record<(typeof WORLDBOOK_CATEGORY_VALUES)[number], string> = {
  place: "地点/场所",
  organization: "组织/势力",
  people: "人物群体/种族",
  history: "事件/历史",
  event: "事件/历史",
  item: "物品/道具",
  "power-system": "功法/能力体系",
  rule: "规则/法则",
  culture: "文化/习俗",
  geography: "地理/环境",
  politics: "政治/权力",
  economy: "经济/资源",
  religion: "宗教/信仰",
  language: "语言/文字",
  technology: "科技/技术水平",
  "faction-relation": "势力关系",
  other: "其他",
  setting: "其他",
};

export const BRANCH_TYPE_VALUES = [
  "main",
  "if",
  "au",
  "spin-off",
  "collection",
] as const;

export const AGENT_OUTPUT_FORMAT_VALUES = [
  "json+text",
  "text",
] as const;

export const MODEL_THINKING_VALUES = [
  "off",
  "low",
  "medium",
  "high",
  "auto",
] as const;

export const WORKFLOW_FAIL_POLICY_VALUES = [
  "patch-first",
  "rewrite-chapter",
] as const;

export const RUN_STATUS_VALUES = [
  "running",
  "ok",
  "failed",
  "paused",
] as const;

export const RUN_NODE_STATUS_VALUES = [
  "ok",
  "fail",
  "warn",
  "error",
  "skipped",
] as const;

export const RULE_DETECT_BY_VALUES = [
  "hard-check",
  "ai-check",
  "manual",
  "mixed",
] as const;

export const RULE_VIOLATION_ACTION_VALUES = [
  "block",
  "rewrite",
  "warn",
  "record",
  "pause",
] as const;

export const SKILL_KIND_VALUES = [
  "normal",
  "tool",
] as const;

export const LOCK_SCOPE_VALUES = [
  "sentence",
  "paragraph",
  "scene",
  "chapter",
  "selection",
] as const;

export const LOCK_LEVEL_VALUES = [
  "full-lock",
  "light-lock",
  "style-lock",
  "plot-lock",
  "temp-lock",
  "permanent-lock",
] as const;

export const SNAPSHOT_REASON_VALUES = [
  "finalize",
  "auto",
  "pre-ai",
  "manual",
] as const;

export const OUTLINE_LEVEL_VALUES = [
  "book",
  "volume",
  "chapter",
  "scene",
] as const;

export const CONTEXT_SOURCE_REASON_VALUES = [
  "auto",
  "forced",
  "preset",
] as const;

export const READ_POLICY_DEFAULT_VALUES = [
  "shared-first",
  "branch-first",
  "merge",
] as const;

export const APP_UI_LANGUAGE_VALUES = [
  "zh",
  "en",
] as const;

export const APP_UI_MODE_VALUES = [
  "simple",
  "expert",
] as const;

export const APP_LOG_LEVEL_VALUES = [
  "off",
  "basic",
  "standard",
  "full",
] as const;

export const TIMELINE_LINE_VALUES = [
  "main",
  "character",
  "relation",
  "world",
  "canon",
  "branch",
  "chapter",
] as const;

export const TIMELINE_LINE_LABELS: Record<(typeof TIMELINE_LINE_VALUES)[number], string> = {
  main: "主线",
  character: "角色线",
  relation: "关系线",
  world: "世界线",
  canon: "原作线",
  branch: "支线",
  chapter: "章节线",
};

export const TIMELINE_LINE_DESCRIPTIONS: Record<(typeof TIMELINE_LINE_VALUES)[number], string> = {
  main: "推动小说核心剧情的关键事件",
  character: "角色成长、转折和状态变化",
  relation: "人物关系建立、升级或破裂",
  world: "世界观、势力格局和大环境变化",
  canon: "同人作品中对应原作事实或节点",
  branch: "非主线但会影响体验的事件",
  chapter: "按章节落点整理的写作事件",
};

export const TIMELINE_IMPORTANCE_VALUES = [
  "core",
  "important",
  "minor",
] as const;

export const TIMELINE_TEMPLATE_VALUES = [
  "simple",
  "detailed",
] as const;

export const TIMELINE_PROFILE_GROUP_VALUES = [
  "basic",
  "content",
  "relations",
  "writing",
] as const;

export const CURRENT_SCHEMA_VERSION = 1;
