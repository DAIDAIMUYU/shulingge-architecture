import { api, type CustomFontRecord } from "../api/client.js";
import { DEFAULT_BODY_FONT, DEFAULT_UI_FONT, applyBodyFontPreference, applyUiFontPreference, type FontPreference } from "./preferences.js";

export function customFontToPreference(font: CustomFontRecord, fallback = DEFAULT_BODY_FONT): FontPreference {
  return {
    id: `custom:${font.id}`,
    label: font.label,
    family: `"${font.family}", ${fallback.family}`,
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

export async function hydrateSelectedCustomFonts(input: { uiFont: FontPreference; bodyFont: FontPreference }): Promise<void> {
  if (input.uiFont.source !== "custom" && input.bodyFont.source !== "custom") {
    return;
  }
  const fonts = await loadCustomFonts();
  const selectedUi = fonts.find((item) => `custom:${item.id}` === input.uiFont.id);
  if (selectedUi) {
    applyUiFontPreference(customFontToPreference(selectedUi, DEFAULT_UI_FONT));
  }
  const selectedBody = fonts.find((item) => `custom:${item.id}` === input.bodyFont.id);
  if (selectedBody) {
    applyBodyFontPreference(customFontToPreference(selectedBody, DEFAULT_BODY_FONT));
  }
}
