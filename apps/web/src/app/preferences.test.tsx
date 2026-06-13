import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_WEB_PREFERENCES, normalizeWebPreferences } from "./preferences.js";

test("normalizeWebPreferences keeps supported values and falls back for invalid ones", () => {
  assert.deepEqual(
    normalizeWebPreferences({
      preferredLanguage: "en-US",
      autosaveDelayMs: 800,
      startInFocusMode: true,
      paperTextureEnabled: false,
      backgroundDecorationEnabled: false,
      defaultInspectorTab: "annotations",
      sendShortcut: "mod-enter",
      watchedAgentIds: ["writer", "", "director"],
    }),
    {
      preferredLanguage: "en-US",
      autosaveDelayMs: 800,
      startInFocusMode: true,
      paperTextureEnabled: false,
      backgroundDecorationEnabled: false,
      defaultInspectorTab: "annotations",
      sendShortcut: "mod-enter",
      watchedAgentIds: ["writer", "director"],
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
