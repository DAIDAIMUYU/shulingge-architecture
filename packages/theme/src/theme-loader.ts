import { baseTheme } from "./tokens/base.js";
import { mistStudyTheme } from "./tokens/mist-study.js";
import { validateTheme } from "./theme-validator.js";
import type { ThemeDefinition, ThemePreset } from "./types.js";

const PRESET_MAP: Record<string, Partial<ThemeDefinition>> = {
  "mist-study": mistStudyTheme,
};

export const themePresets: ThemePreset[] = [
  {
    id: "mist-study",
    name: "雾白书房",
    mode: "light",
  },
];

function mergeTheme(base: ThemeDefinition, override: Partial<ThemeDefinition>): ThemeDefinition {
  return {
    ...base,
    ...override,
    colors: {
      ...base.colors,
      ...override.colors,
    },
    editor: {
      ...base.editor,
      ...override.editor,
    },
    radius: {
      ...base.radius,
      ...override.radius,
    },
    shadow: {
      ...base.shadow,
      ...override.shadow,
    },
  };
}

export function loadTheme(themeId = "mist-study"): ThemeDefinition {
  const preset = PRESET_MAP[themeId];
  if (!preset) {
    throw new Error(`Unknown theme preset: ${themeId}`);
  }

  return validateTheme(mergeTheme(baseTheme as ThemeDefinition, preset));
}
