import { createAppError } from "@shulingge/shared";

import type { ThemeDefinition } from "./types.js";

function assertColor(value: string, field: string): void {
  if (!/^#([0-9a-fA-F]{6})$/.test(value)) {
    throw new Error(`Invalid theme color for ${field}: ${value}`, {
      cause: createAppError("THEME_INVALID_COLOR", `Invalid theme color for ${field}`),
    });
  }
}

export function validateTheme(theme: ThemeDefinition): ThemeDefinition {
  assertColor(theme.colors.background, "colors.background");
  assertColor(theme.colors.surface, "colors.surface");
  assertColor(theme.colors.sidebar, "colors.sidebar");
  assertColor(theme.colors.textPrimary, "colors.textPrimary");
  assertColor(theme.colors.textSecondary, "colors.textSecondary");
  assertColor(theme.colors.accent, "colors.accent");
  assertColor(theme.colors.accentWeak, "colors.accentWeak");
  assertColor(theme.colors.border, "colors.border");
  assertColor(theme.colors.danger, "colors.danger");
  assertColor(theme.colors.warning, "colors.warning");
  assertColor(theme.colors.success, "colors.success");

  if (theme.editor.contentWidth <= 0 || theme.editor.fontSize <= 0 || theme.editor.lineHeight <= 0) {
    throw new Error("Theme editor metrics must be positive");
  }

  return theme;
}
