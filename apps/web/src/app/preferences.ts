export type PreferredLanguage = "zh-CN" | "en-US";
export type SendShortcut = "enter" | "mod-enter";
export type InspectorTabPreference = "outline" | "annotations" | "locks";
export type WebThemeMode = "light" | "eye" | "dark";
export type TitleAlignPreference = "left" | "center" | "right";
export type BodyAlignPreference = "left" | "center" | "right";

export interface FontPreference {
  id: string;
  label: string;
  family: string;
  source: "preset" | "custom";
  fallback?: string;
}

export interface WebPreferences {
  preferredLanguage: PreferredLanguage;
  autosaveDelayMs: 800 | 1200 | 2000;
  startInFocusMode: boolean;
  themeMode: WebThemeMode;
  defaultInspectorTab: InspectorTabPreference;
  sendShortcut: SendShortcut;
  watchedAgentIds: string[];
  uiFont: FontPreference;
  bodyFont: FontPreference;
  titleAlign: TitleAlignPreference;
  bodyAlign: BodyAlignPreference;
}

const STORAGE_KEY = "shulingge.web.preferences";
let themeTransitionTimer: ReturnType<typeof setTimeout> | undefined;

export const DEFAULT_BODY_FONT: FontPreference = {
  id: "preset-source-han-serif",
  label: "思源宋体",
  family: '"Noto Serif SC", "Source Han Serif SC", "宋体", serif',
  source: "preset",
};

export const DEFAULT_UI_FONT: FontPreference = {
  id: "preset-source-han-sans",
  label: "思源黑体",
  family: '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  source: "preset",
};

export const DEFAULT_WEB_PREFERENCES: WebPreferences = {
  preferredLanguage: "zh-CN",
  autosaveDelayMs: 1200,
  startInFocusMode: false,
  themeMode: "light",
  defaultInspectorTab: "outline",
  sendShortcut: "enter",
  watchedAgentIds: ["writer", "rule-guard", "director"],
  uiFont: DEFAULT_UI_FONT,
  bodyFont: DEFAULT_BODY_FONT,
  titleAlign: "center",
  bodyAlign: "left",
};

export function applyUiFontPreference(font: FontPreference): void {
  if (typeof document === "undefined") {
    return;
  }
  const family = font.family || DEFAULT_UI_FONT.family;
  document.documentElement.style.setProperty("--font-sans", family);
  document.body.style.fontFamily = family;
}

export function applyBodyFontPreference(font: FontPreference): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.style.setProperty("--body-font-family", font.family || DEFAULT_BODY_FONT.family);
}

export function applyTitleAlignPreference(align: TitleAlignPreference): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.style.setProperty("--chapter-title-align", align);
}

export function applyBodyAlignPreference(align: BodyAlignPreference): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.style.setProperty("--body-align", align);
}

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

function isTitleAlign(value: unknown): value is TitleAlignPreference {
  return value === "left" || value === "center" || value === "right";
}

function isBodyAlign(value: unknown): value is BodyAlignPreference {
  return value === "left" || value === "center" || value === "right";
}

function normalizeFontPreference(value: unknown, fallbackFont: FontPreference = DEFAULT_BODY_FONT): FontPreference {
  if (!value || typeof value !== "object") {
    return fallbackFont;
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : fallbackFont.id;
  const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : fallbackFont.label;
  const family = typeof record.family === "string" && record.family.trim() ? record.family.trim() : fallbackFont.family;
  const source = record.source === "custom" ? "custom" : "preset";
  const fallback = typeof record.fallback === "string" && record.fallback.trim() ? record.fallback.trim() : undefined;
  return { id, label, family, source, fallback };
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
    uiFont: normalizeFontPreference(record.uiFont, DEFAULT_UI_FONT),
    bodyFont: normalizeFontPreference(record.bodyFont),
    titleAlign: isTitleAlign(record.titleAlign) ? record.titleAlign : DEFAULT_WEB_PREFERENCES.titleAlign,
    bodyAlign: isBodyAlign(record.bodyAlign) ? record.bodyAlign : DEFAULT_WEB_PREFERENCES.bodyAlign,
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
  applyUiFontPreference(normalized.uiFont);
  applyThemePreference(normalized.themeMode);
  applyBodyFontPreference(normalized.bodyFont);
  applyTitleAlignPreference(normalized.titleAlign);
  applyBodyAlignPreference(normalized.bodyAlign);
  return normalized;
}

export function mergeWebPreferences(patch: Partial<WebPreferences>): WebPreferences {
  return writeWebPreferences({
    ...readWebPreferences(),
    ...patch,
  });
}
