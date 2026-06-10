export interface ThemeColors {
  background: string;
  surface: string;
  sidebar: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentWeak: string;
  border: string;
  danger: string;
  warning: string;
  success: string;
}

export interface ThemeEditor {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  contentWidth: number;
}

export interface ThemeRadius {
  sm: number;
  md: number;
  lg: number;
}

export interface ThemeShadow {
  panel: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  mode: "light" | "dark";
  colors: ThemeColors;
  editor: ThemeEditor;
  radius: ThemeRadius;
  shadow: ThemeShadow;
}

export interface ThemePreset {
  id: string;
  name: string;
  mode: "light" | "dark";
}
