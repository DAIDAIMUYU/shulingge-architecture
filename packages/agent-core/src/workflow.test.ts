import assert from "node:assert/strict";
import test from "node:test";

import { createMvpWorkflowRun } from "./workflow.js";

test("workflow succeeds through nine-agent pipeline", async () => {
  const handle = createMvpWorkflowRun(
    {
      writer() {
        return {
          structured: { content: "第一版正文" },
          tokens: { in: 10, out: 20 },
        };
      },
      ruleGuard() {
        return {
          structured: { status: "ok", score: 92, mustRewrite: false },
          tokens: { in: 5, out: 6 },
        };
      },
      voice() {
        return { structured: { status: "ok", score: 90, mustRewrite: false }, tokens: { in: 2, out: 3 } };
      },
      relationship() {
        return { structured: { status: "ok", score: 89, mustRewrite: false }, tokens: { in: 2, out: 3 } };
      },
      timeline() {
        return { structured: { status: "ok", score: 93, mustRewrite: false }, tokens: { in: 2, out: 3 } };
      },
      canon() {
        return { structured: { status: "ok", score: 91, mustRewrite: false }, tokens: { in: 2, out: 3 } };
      },
      polish() {
        return { structured: { status: "warn", score: 84, mustRewrite: false }, tokens: { in: 1, out: 2 } };
      },
      summary() {
        return {
          structured: { summary: "一句话摘要" },
          tokens: { in: 3, out: 4 },
        };
      },
      controller(context) {
        return {
          structured: { finalText: `${context.state.chapterContent}\n\n[总控通过]` },
          tokens: { in: 2, out: 2 },
        };
      },
    },
    {
      chapterId: "chapter-001",
      initialContent: "",
    },
  );

  const outcome = await handle.result;

  assert.equal(outcome.run.status, "ok");
  assert.equal(outcome.state.summary, "一句话摘要");
  assert.equal(outcome.state.chapterContent.includes("[总控通过]"), true);
  assert.deepEqual(outcome.run.tokens, { in: 29, out: 46 });
  assert.deepEqual(outcome.run.nodes.map((node) => node.status), [
    "ok",
    "ok",
    "ok",
    "ok",
    "ok",
    "ok",
    "warn",
    "ok",
    "ok",
  ]);
});

test("workflow loops back to writer when rule guard fails, then passes", async () => {
  let writerCalls = 0;
  let guardCalls = 0;

  const handle = createMvpWorkflowRun(
    {
      writer() {
        writerCalls += 1;
        return {
          structured: { content: writerCalls === 1 ? "初稿" : "修复后的正文" },
        };
      },
      ruleGuard() {
        guardCalls += 1;
        if (guardCalls === 1) {
          return {
            structured: {
              status: "fail",
              mustRewrite: true,
              rewriteScope: "paragraph",
              rewriteInstructions: ["重写第 1 段"],
            },
          };
        }
        return {
          structured: { status: "ok", score: 88, mustRewrite: false },
        };
      },
      voice() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      relationship() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      timeline() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      canon() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      polish() {
        return { structured: { status: "warn", mustRewrite: false } };
      },
      summary() {
        return { structured: { summary: "修复后摘要" } };
      },
      controller(context) {
        return { structured: { finalText: context.state.chapterContent } };
      },
    },
    {
      chapterId: "chapter-001",
      initialContent: "",
      maxRepairRounds: 2,
    },
  );

  const outcome = await handle.result;

  assert.equal(outcome.run.status, "ok");
  assert.equal(writerCalls, 2);
  assert.equal(guardCalls, 2);
  assert.equal(outcome.state.repairRound, 1);
});

test("workflow pauses after exceeding maxRepairRounds", async () => {
  const handle = createMvpWorkflowRun(
    {
      writer() {
        return { structured: { content: "一直失败的正文" } };
      },
      ruleGuard() {
        return {
          structured: {
            status: "fail",
            mustRewrite: true,
            rewriteScope: "scene",
            rewriteInstructions: ["继续重写"],
          },
        };
      },
      voice() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      relationship() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      timeline() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      canon() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      polish() {
        return { structured: { status: "warn", mustRewrite: false } };
      },
      summary() {
        return { structured: { summary: "不会执行" } };
      },
      controller() {
        return { structured: { finalText: "不会执行" } };
      },
    },
    {
      chapterId: "chapter-001",
      initialContent: "",
      maxRepairRounds: 1,
    },
  );

  const outcome = await handle.result;

  assert.equal(outcome.run.status, "paused");
  assert.equal(outcome.state.repairRound, 2);
  assert.equal(outcome.run.nodes[1]?.status, "fail");
});

test("workflow retries invalid json and then succeeds", async () => {
  let writerAttempts = 0;

  const handle = createMvpWorkflowRun(
    {
      writer() {
        writerAttempts += 1;
        if (writerAttempts === 1) {
          return { rawText: "{not-json}" };
        }
        return { rawText: JSON.stringify({ content: "JSON 重试成功" }) };
      },
      ruleGuard() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      voice() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      relationship() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      timeline() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      canon() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      polish() {
        return { structured: { status: "warn", mustRewrite: false } };
      },
      summary() {
        return { structured: { summary: "ok" } };
      },
      controller(context) {
        return { structured: { finalText: context.state.chapterContent } };
      },
    },
    {
      chapterId: "chapter-001",
      initialContent: "",
      maxJsonRetries: 1,
    },
  );

  const outcome = await handle.result;

  assert.equal(outcome.run.status, "ok");
  assert.equal(writerAttempts, 2);
  assert.equal(outcome.state.chapterContent, "JSON 重试成功");
});

test("workflow pauses when cancelled", async () => {
  const handle = createMvpWorkflowRun(
    {
      async writer() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { structured: { content: "延迟正文" } };
      },
      ruleGuard() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      voice() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      relationship() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      timeline() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      canon() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      polish() {
        return { structured: { status: "warn", mustRewrite: false } };
      },
      summary() {
        return { structured: { summary: "ok" } };
      },
      controller(context) {
        return { structured: { finalText: context.state.chapterContent } };
      },
    },
    {
      chapterId: "chapter-001",
      initialContent: "",
    },
  );

  handle.cancel();
  const outcome = await handle.result;

  assert.equal(outcome.run.status, "paused");
});

test("workflow stops as failed on write errors and pauses on model errors", async () => {
  const writeFailed = createMvpWorkflowRun(
    {
      writer() {
        throw new Error("write failed: disk unavailable");
      },
      ruleGuard() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      voice() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      relationship() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      timeline() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      canon() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      polish() {
        return { structured: { status: "warn", mustRewrite: false } };
      },
      summary() {
        return { structured: { summary: "ok" } };
      },
      controller() {
        return { structured: { finalText: "ok" } };
      },
    },
    {
      chapterId: "chapter-001",
      initialContent: "",
    },
  );

  const modelPaused = createMvpWorkflowRun(
    {
      writer() {
        throw new Error("model request failed");
      },
      ruleGuard() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      voice() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      relationship() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      timeline() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      canon() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      polish() {
        return { structured: { status: "warn", mustRewrite: false } };
      },
      summary() {
        return { structured: { summary: "ok" } };
      },
      controller() {
        return { structured: { finalText: "ok" } };
      },
    },
    {
      chapterId: "chapter-001",
      initialContent: "",
    },
  );

  assert.equal((await writeFailed.result).run.status, "failed");
  assert.equal((await modelPaused.result).run.status, "paused");
});

test("workflow loops back when a downstream checker fails", async () => {
  let writerCalls = 0;
  let timelineCalls = 0;

  const handle = createMvpWorkflowRun(
    {
      writer() {
        writerCalls += 1;
        return { structured: { content: writerCalls === 1 ? "第一版" : "修复后版本" } };
      },
      ruleGuard() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      voice() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      relationship() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      timeline() {
        timelineCalls += 1;
        if (timelineCalls === 1) {
          return {
            structured: {
              status: "fail",
              mustRewrite: true,
              rewriteScope: "scene",
              rewriteInstructions: ["修正时间先后顺序"],
            },
          };
        }
        return { structured: { status: "ok", mustRewrite: false } };
      },
      canon() {
        return { structured: { status: "ok", mustRewrite: false } };
      },
      polish() {
        return { structured: { status: "warn", mustRewrite: false } };
      },
      summary() {
        return { structured: { summary: "通过" } };
      },
      controller(context) {
        return { structured: { finalText: context.state.chapterContent } };
      },
    },
    {
      chapterId: "chapter-001",
      initialContent: "",
      maxRepairRounds: 2,
    },
  );

  const outcome = await handle.result;

  assert.equal(outcome.run.status, "ok");
  assert.equal(writerCalls, 2);
  assert.equal(timelineCalls, 2);
  assert.equal(outcome.state.chapterContent, "修复后版本");
});
