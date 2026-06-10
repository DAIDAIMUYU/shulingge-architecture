import assert from "node:assert/strict";
import test from "node:test";

import { createThemeCssVariables, loadTheme, renderThemeStyleTag } from "./index.js";

test("loadTheme returns the mist-study preset merged with base tokens", () => {
  const theme = loadTheme("mist-study");

  assert.equal(theme.id, "mist-study");
  assert.equal(theme.editor.contentWidth, 780);
  assert.equal(theme.colors.accent, "#4F8F83");
});

test("renderThemeStyleTag emits css variables for the editor and color system", () => {
  const css = renderThemeStyleTag(loadTheme("mist-study"));
  const variables = createThemeCssVariables(loadTheme("mist-study"));

  assert.match(css, /--color-bg: #F7F5EF;/);
  assert.match(css, /--editor-content-width: 780px;/);
  assert.equal(variables["--editor-font-size"], "17px");
});
