import type { ThemeDefinition } from "../types.js";

export const baseTheme: ThemeDefinition = {
  id: "base",
  name: "Base Theme",
  mode: "light",
  colors: {
    background: "#F7F5EF",
    surface: "#FFFFFF",
    sidebar: "#F3F5F2",
    textPrimary: "#253334",
    textSecondary: "#6B7774",
    accent: "#4F8F83",
    accentWeak: "#DDEBE7",
    border: "#E2E6E3",
    danger: "#C85C5C",
    warning: "#C49A4A",
    success: "#5E9C76",
  },
  editor: {
    fontFamily: "\"Source Han Serif\", \"Noto Serif CJK SC\", \"Songti SC\", \"SimSun\", serif",
    fontSize: 17,
    lineHeight: 1.8,
    paragraphSpacing: 12,
    contentWidth: 780,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
  },
  shadow: {
    panel: "0 8px 24px rgba(31, 58, 61, 0.06)",
  },
};
