import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { App } from "./app/App.js";
import { createAutosaveController, createEditorViewModel } from "./editor.js";

const require = createRequire(import.meta.url);
const React = require("react") as typeof import("react");
const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");

// App 内 WorkspaceView 用 useEffect + fetch 拉后端数据；renderToStaticMarkup 只渲染初始结构、
// 不触发 effect（不发请求），因此可安全做结构 smoke test。
test("App shell renders navigation rail and workspace skeleton", () => {
  const html = renderToStaticMarkup(React.createElement(App));

  assert.match(html, /app-shell/);
  assert.match(html, /rail-logo/);
  assert.match(html, /mobile-nav/);
  assert.match(html, /写作/);
  assert.match(html, /章节与资料/);
  assert.match(html, /workspace-mobile-tabs/);
  // 右侧总控 AI 对话窗
  assert.match(html, /总控/);
  assert.match(html, /智能体/);
  assert.match(html, /chat-input/);
});

test("editor view model counts words and tracks externalized metadata counters", () => {
  const viewModel = createEditorViewModel("zh", {
    content: "蝶屋夜深。\n\nKanae waits.",
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
    initialContent: "初稿",
    async save(content) {
      saved = content;
    },
  });

  autosave.update("修订后的正文");

  assert.equal(autosave.getStatus(), "dirty");
  assert.equal(autosave.getDraft(), "修订后的正文");

  await autosave.flush();

  assert.equal(saved, "修订后的正文");
  assert.equal(autosave.getStatus(), "saved");
});
