import assert from "node:assert/strict";
import test from "node:test";

import { applyInlineWrap, applyLinePrefix, buildOutline, createSelectionLock, parseChapterRef } from "./workspace-utils.js";

test("parseChapterRef splits project, novel, and chapter ids", () => {
  assert.deepEqual(parseChapterRef("demo-series/main/chapter-001"), {
    projectId: "demo-series",
    novelId: "main",
    chapterId: "chapter-001",
  });
});

test("inline and line formatting helpers preserve selection semantics", () => {
  assert.deepEqual(applyInlineWrap("hello", 0, 5, "**"), {
    content: "**hello**",
    selectionStart: 2,
    selectionEnd: 7,
  });
  assert.deepEqual(applyLinePrefix("alpha\nbeta", 1, 8, "> "), {
    content: "> alpha\n> beta",
    selectionStart: 0,
    selectionEnd: 14,
  });
});

test("buildOutline derives headings or paragraph fallback and selection lock is normalized", () => {
  assert.deepEqual(buildOutline("# 第一节\n正文"), [
    { id: "heading-1", label: "第一节", excerpt: "Markdown 标题", line: 1 },
  ]);
  assert.deepEqual(buildOutline("第一段内容足够长。\n\n第二段也存在。")[0], {
    id: "lead-1",
    label: "段落 1",
    excerpt: "第一段内容足够长。",
    line: 1,
  });
  assert.deepEqual(createSelectionLock(12, 4), {
    id: "lock-4-12",
    scope: "paragraph",
    level: "full",
    range: { start: 4, end: 12 },
  });
});
