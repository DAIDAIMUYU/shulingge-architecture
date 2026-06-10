import type { ThemeDefinition } from "./types.js";

export function createThemeCssVariables(theme: ThemeDefinition): Record<string, string> {
  return {
    "--color-bg": theme.colors.background,
    "--color-surface": theme.colors.surface,
    "--color-sidebar": theme.colors.sidebar,
    "--color-text-primary": theme.colors.textPrimary,
    "--color-text-secondary": theme.colors.textSecondary,
    "--color-accent": theme.colors.accent,
    "--color-accent-weak": theme.colors.accentWeak,
    "--color-border": theme.colors.border,
    "--color-danger": theme.colors.danger,
    "--color-warning": theme.colors.warning,
    "--color-success": theme.colors.success,
    "--editor-font-family": theme.editor.fontFamily,
    "--editor-font-size": `${theme.editor.fontSize}px`,
    "--editor-line-height": String(theme.editor.lineHeight),
    "--editor-paragraph-spacing": `${theme.editor.paragraphSpacing}px`,
    "--editor-content-width": `${theme.editor.contentWidth}px`,
    "--radius-sm": `${theme.radius.sm}px`,
    "--radius-md": `${theme.radius.md}px`,
    "--radius-lg": `${theme.radius.lg}px`,
    "--shadow-panel": theme.shadow.panel,
  };
}

export function renderThemeStyleTag(theme: ThemeDefinition): string {
  const variables = createThemeCssVariables(theme);
  const declarations = Object.entries(variables)
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");

  return `:root { ${declarations} }`;
}
