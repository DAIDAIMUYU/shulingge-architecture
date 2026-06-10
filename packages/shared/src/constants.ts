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

export const CURRENT_SCHEMA_VERSION = 1;
