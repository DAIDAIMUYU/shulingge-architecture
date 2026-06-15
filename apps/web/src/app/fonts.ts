import { api, type CustomFontRecord } from "../api/client.js";
import { DEFAULT_BODY_FONT, applyBodyFontPreference, type FontPreference } from "./preferences.js";

export function customFontToPreference(font: CustomFontRecord): FontPreference {
  return {
    id: `custom:${font.id}`,
    label: font.label,
    family: `"${font.family}", ${DEFAULT_BODY_FONT.family}`,
    source: "custom",
  };
}

export async function registerCustomFont(font: CustomFontRecord): Promise<void> {
  if (typeof FontFace === "undefined" || typeof document === "undefined") {
    return;
  }
  const face = new FontFace(font.family, `url(${font.dataUrl})`);
  await face.load();
  document.fonts.add(face);
}

export async function loadCustomFonts(): Promise<CustomFontRecord[]> {
  const fonts = await api.listCustomFonts();
  await Promise.all(fonts.map((font) => registerCustomFont(font).catch(() => undefined)));
  return fonts;
}

export async function hydrateSelectedCustomFont(font: FontPreference): Promise<void> {
  if (font.source !== "custom") {
    return;
  }
  const fonts = await loadCustomFonts();
  const selected = fonts.find((item) => `custom:${item.id}` === font.id);
  if (selected) {
    applyBodyFontPreference(customFontToPreference(selected));
  }
}
