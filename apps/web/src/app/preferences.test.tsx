import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_WEB_PREFERENCES, normalizeWebPreferences } from "./preferences.js";

test("normalizeWebPreferences keeps supported values and falls back for invalid ones", () => {
  assert.deepEqual(
    normalizeWebPreferences({
      preferredLanguage: "en-US",
      autosaveDelayMs: 800,
      startInFocusMode: true,
      themeMode: "eye",
      defaultInspectorTab: "annotations",
      sendShortcut: "mod-enter",
      watchedAgentIds: ["writer", "", "director"],
      titleAlign: "right",
      bodyFont: {
        id: "preset-kaiti",
        label: "楷体 KaiTi",
        family: '"KaiTi", "楷体", serif',
        source: "preset",
      },
    }),
    {
      preferredLanguage: "en-US",
      autosaveDelayMs: 800,
      startInFocusMode: true,
      themeMode: "eye",
      defaultInspectorTab: "annotations",
      sendShortcut: "mod-enter",
      watchedAgentIds: ["writer", "director"],
      uiFont: DEFAULT_WEB_PREFERENCES.uiFont,
      bodyFont: {
        id: "preset-kaiti",
        label: "楷体 KaiTi",
        family: '"KaiTi", "楷体", serif',
        source: "preset",
        fallback: undefined,
      },
      titleAlign: "right",
    },
  );

  assert.deepEqual(
    normalizeWebPreferences({
      preferredLanguage: "fr-FR",
      autosaveDelayMs: 999,
      defaultInspectorTab: "unknown",
      sendShortcut: "space",
      watchedAgentIds: "writer",
    }),
    DEFAULT_WEB_PREFERENCES,
  );
});
