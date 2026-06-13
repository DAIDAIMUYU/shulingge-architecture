export type PreferredLanguage = "zh-CN" | "en-US";
export type SendShortcut = "enter" | "mod-enter";
export type InspectorTabPreference = "outline" | "annotations" | "locks";
export type WebThemeMode = "light" | "eye" | "dark";

export interface WebPreferences {
  preferredLanguage: PreferredLanguage;
  autosaveDelayMs: 800 | 1200 | 2000;
  startInFocusMode: boolean;
  themeMode: WebThemeMode;
  defaultInspectorTab: InspectorTabPreference;
  sendShortcut: SendShortcut;
  watchedAgentIds: string[];
}

const STORAGE_KEY = "shulingge.web.preferences";
let themeTransitionTimer: ReturnType<typeof setTimeout> | undefined;

export const DEFAULT_WEB_PREFERENCES: WebPreferences = {
  preferredLanguage: "zh-CN",
  autosaveDelayMs: 1200,
  startInFocusMode: false,
  themeMode: "light",
  defaultInspectorTab: "outline",
  sendShortcut: "enter",
  watchedAgentIds: ["writer", "rule-guard", "director"],
};

export function applyThemePreference(themeMode: WebThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const previousTheme = root.getAttribute("data-theme");

  if (previousTheme && previousTheme !== themeMode) {
    root.setAttribute("data-theme-prev", previousTheme);
    root.setAttribute("data-theme", themeMode);
    root.classList.remove("theme-switching");
    void root.offsetWidth;
    root.classList.add("theme-switching");

    if (themeTransitionTimer) {
      clearTimeout(themeTransitionTimer);
    }
    themeTransitionTimer = setTimeout(() => {
      root.classList.remove("theme-switching");
      root.removeAttribute("data-theme-prev");
    }, 380);
    return;
  }

  root.setAttribute("data-theme", themeMode);
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

function isThemeMode(value: unknown): value is WebThemeMode {
  return value === "light" || value === "eye" || value === "dark";
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
    themeMode: isThemeMode(record.themeMode) ? record.themeMode : DEFAULT_WEB_PREFERENCES.themeMode,
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
  applyThemePreference(normalized.themeMode);
  return normalized;
}

export function mergeWebPreferences(patch: Partial<WebPreferences>): WebPreferences {
  return writeWebPreferences({
    ...readWebPreferences(),
    ...patch,
  });
}
