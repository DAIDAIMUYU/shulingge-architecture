import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { App } from "./app/App.js";
import { createAutosaveController, createEditorViewModel } from "./editor.js";

const require = createRequire(import.meta.url);
const React = require("react") as typeof import("react");
const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");

test("App shell renders navigation rail and workspace skeleton", () => {
  const html = renderToStaticMarkup(React.createElement(App));

  assert.equal(html.includes("app-shell"), true);
  assert.equal(html.includes("rail-logo"), true);
  assert.equal(html.includes("mobile-nav"), true);
  assert.equal(html.includes("workspace-mobile-tabs"), true);
  assert.equal(html.includes("tree-panel"), true);
  assert.equal(html.includes("right-pane-tabs"), true);
  assert.equal(html.includes("creation-flow-panel"), true);
  assert.equal(html.includes("creation-flow-empty"), true);
});

test("editor view model counts words and tracks externalized metadata counters", () => {
  const viewModel = createEditorViewModel("zh", {
    content: "蝶屋夜深\n\nKanae waits.",
    annotationsCount: 3,
    locksCount: 2,
    saveStatus: "dirty",
  });

  assert.equal(viewModel.wordCount, 6);
  assert.equal(viewModel.annotationsCount, 3);
  assert.equal(viewModel.locksCount, 2);
  assert.equal(viewModel.saveStatus, "dirty");
});

test("autosave controller updates draft and flushes through save callback", async () => {
  let saved = "";
  const autosave = createAutosaveController({
    initialContent: "鍒濈",
    async save(content) {
      saved = content;
    },
  });

  autosave.update("淇鍚庣殑姝ｆ枃");

  assert.equal(autosave.getStatus(), "dirty");
  assert.equal(autosave.getDraft(), "淇鍚庣殑姝ｆ枃");

  await autosave.flush();

  assert.equal(saved, "淇鍚庣殑姝ｆ枃");
  assert.equal(autosave.getStatus(), "saved");
});
