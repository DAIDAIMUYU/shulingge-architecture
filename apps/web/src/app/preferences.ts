export type PreferredLanguage = "zh-CN" | "en-US";
export type SendShortcut = "enter" | "mod-enter";
export type InspectorTabPreference = "outline" | "annotations" | "locks";

export interface WebPreferences {
  preferredLanguage: PreferredLanguage;
  autosaveDelayMs: 800 | 1200 | 2000;
  startInFocusMode: boolean;
  paperTextureEnabled: boolean;
  defaultInspectorTab: InspectorTabPreference;
  sendShortcut: SendShortcut;
  watchedAgentIds: string[];
}

const STORAGE_KEY = "shulingge.web.preferences";

export const DEFAULT_WEB_PREFERENCES: WebPreferences = {
  preferredLanguage: "zh-CN",
  autosaveDelayMs: 1200,
  startInFocusMode: false,
  paperTextureEnabled: true,
  defaultInspectorTab: "outline",
  sendShortcut: "enter",
  watchedAgentIds: ["writer", "rule-guard", "director"],
};

export function applyPaperTexturePreference(enabled: boolean): void {
  if (typeof document === "undefined") {
    return;
  }
  document.body.classList.toggle("paper-texture", enabled);
}

function isPreferredLanguage(value: unknown): value is PreferredLanguage {
  return value === "zh-CN" || value === "en-US";
}

function isAutosaveDelay(value: unknown): value is WebPreferences["autosaveDelayMs"] {
  return value === 800 || value === 1200 || value === 2000;
}

function isInspectorTab(value: unknown): value is InspectorTabPreference {
  return value === "outline" || value === "annotations" || value === "locks";
}

function isSendShortcut(value: unknown): value is SendShortcut {
  return value === "enter" || value === "mod-enter";
}

export function normalizeWebPreferences(input: unknown): WebPreferences {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};

  return {
    preferredLanguage: isPreferredLanguage(record.preferredLanguage)
      ? record.preferredLanguage
      : DEFAULT_WEB_PREFERENCES.preferredLanguage,
    autosaveDelayMs: isAutosaveDelay(record.autosaveDelayMs)
      ? record.autosaveDelayMs
      : DEFAULT_WEB_PREFERENCES.autosaveDelayMs,
    startInFocusMode: typeof record.startInFocusMode === "boolean"
      ? record.startInFocusMode
      : DEFAULT_WEB_PREFERENCES.startInFocusMode,
    paperTextureEnabled: typeof record.paperTextureEnabled === "boolean"
      ? record.paperTextureEnabled
      : DEFAULT_WEB_PREFERENCES.paperTextureEnabled,
    defaultInspectorTab: isInspectorTab(record.defaultInspectorTab)
      ? record.defaultInspectorTab
      : DEFAULT_WEB_PREFERENCES.defaultInspectorTab,
    sendShortcut: isSendShortcut(record.sendShortcut)
      ? record.sendShortcut
      : DEFAULT_WEB_PREFERENCES.sendShortcut,
    watchedAgentIds: Array.isArray(record.watchedAgentIds)
      ? record.watchedAgentIds.map((item) => String(item).trim()).filter(Boolean)
      : DEFAULT_WEB_PREFERENCES.watchedAgentIds,
  };
}

export function readWebPreferences(): WebPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_WEB_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_WEB_PREFERENCES;
    }
    return normalizeWebPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_WEB_PREFERENCES;
  }
}

export function writeWebPreferences(next: WebPreferences): WebPreferences {
  const normalized = normalizeWebPreferences(next);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = normalized.preferredLanguage;
  }
  applyPaperTexturePreference(normalized.paperTextureEnabled);
  return normalized;
}

export function mergeWebPreferences(patch: Partial<WebPreferences>): WebPreferences {
  return writeWebPreferences({
    ...readWebPreferences(),
    ...patch,
  });
}
