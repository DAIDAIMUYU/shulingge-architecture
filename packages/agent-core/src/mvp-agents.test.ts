import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CURRENT_SCHEMA_VERSION, type ProjectSeries } from "@shulingge/shared";
import {
  initializeProject,
  initializeVault,
  writeJsonFile,
  writeManuscriptFile,
} from "@shulingge/vault-core";

import { createMvpAgentHandlers } from "./mvp-agents.js";
import { createMvpWorkflowRun } from "./workflow.js";

async function createFixtureVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "shulingge-mvp-agents-"));
  await initializeVault({ rootPath: root });

  const series: ProjectSeries = {
    id: "demo-series",
    name: "演示系列",
    type: "original",
    defaultNovelId: "main",
    sharedPath: "shared",
    readPolicyPath: "shared/read-policy.json",
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  await initializeProject(root, series, {
    id: "main",
    name: "主线",
    branchType: "main",
  });

  await writeManuscriptFile(
    root,
    "projects/demo-series/novels/main/manuscripts/chapter-001.md",
    "蝶屋的夜风吹进走廊，香奈惠停下脚步。",
  );
  await writeJsonFile(root, "projects/demo-series/novels/main/metadata/chapters/chapter-001.json", {
    id: "chapter-001",
    novelId: "main",
    title: "chapter-001",
    order: 1,
    manuscriptPath: "manuscripts/chapter-001.md",
    status: "drafting",
    wordCount: 17,
    involvedCharacters: ["kanae"],
    locks: [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
  await writeJsonFile(root, "projects/demo-series/shared/worldbook/wb-butterfly-mansion.json", {
    id: "wb-butterfly-mansion",
    title: "蝶屋",
    sections: { fact: "蝶屋是治疗与休整的地点。" },
    trigger: {
      keywords: ["蝶屋"],
      characters: ["kanae"],
      places: ["蝶屋"],
      semantic: false,
    },
    relatedNovels: ["main"],
    appliesToAgents: ["writer-agent", "canon-agent"],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  return root;
}

test("agent handlers drive the nine-agent path with rewrite loop and dual-output guard", async () => {
  const vaultRoot = await createFixtureVault();
  const prompts: Array<{ modelConfigId: string; message: string }> = [];
  let guardCalls = 0;

  try {
    const handlers = createMvpAgentHandlers({
      vaultRoot,
      projectId: "demo-series",
      novelId: "main",
      chapterId: "chapter-001",
      modelRunner: {
        async chat(modelConfigId, request) {
          prompts.push({
            modelConfigId,
            message: request.messages.at(-1)?.content ?? "",
          });

          if (modelConfigId === "model-writer") {
            const content = guardCalls === 0
              ? { content: "---\ntitle: bad\n---\n这是带元数据的违规正文。" }
              : { content: "修复后的场景正文，没有元信息。" };
            return {
              model: "mock-writer",
              provider: "openai-compatible",
              content: JSON.stringify(content),
              usage: { in: 10, out: 20 },
            };
          }

          if (modelConfigId === "model-rule-guard") {
            guardCalls += 1;
            const payload =
              guardCalls === 1
                ? {
                    status: "fail",
                    score: 40,
                    lockedViolations: 0,
                    hardViolations: 1,
                    softViolations: 0,
                    mustRewrite: true,
                    rewriteScope: "paragraph",
                    rewriteInstructions: ["移除 frontmatter，只保留正文。"],
                    displayText: "检测到正文混入元信息，需要局部重写。",
                  }
                : {
                    status: "ok",
                    score: 91,
                    lockedViolations: 0,
                    hardViolations: 0,
                    softViolations: 0,
                    mustRewrite: false,
                    rewriteInstructions: [],
                    displayText: "规则守卫通过。",
                  };
            return {
              model: "mock-guard",
              provider: "openai-compatible",
              content: JSON.stringify(payload),
              usage: { in: 5, out: 6 },
            };
          }

          if (
            [
              "model-voice",
              "model-relationship",
              "model-timeline",
              "model-canon",
              "model-polish",
            ].includes(modelConfigId)
          ) {
            return {
              model: `mock-${modelConfigId}`,
              provider: "openai-compatible",
              content: JSON.stringify({
                status: modelConfigId === "model-polish" ? "warn" : "ok",
                score: 90,
                mustRewrite: false,
                rewriteInstructions: [],
                displayText: `${modelConfigId} checked`,
              }),
              usage: { in: 2, out: 3 },
            };
          }

          if (modelConfigId === "model-summary") {
            return {
              model: "mock-summary",
              provider: "openai-compatible",
              content: JSON.stringify({ summary: "香奈惠在蝶屋走廊停步并修正了草稿。" }),
              usage: { in: 3, out: 4 },
            };
          }

          throw new Error(`unexpected model config: ${modelConfigId}`);
        },
      },
    });

    const ruleGuardPreview = await handlers.ruleGuard({
      agent: {
        id: "rule-guard-agent",
        name: "规则守卫 Agent",
        description: "",
        enabled: true,
        type: "blocker",
        order: 20,
        workflowId: "mvp-default-workflow",
        modelConfigId: "model-rule-guard",
        readScope: [],
        builtInRules: [],
        skills: [],
        outputFormat: "json+text",
        permissions: {
          canWriteDraft: false,
          canRewriteDraft: false,
          canPatchParagraph: false,
          canBlockWorkflow: true,
          canRequestRewrite: true,
          canWriteState: false,
          canUpdateRules: false,
        },
        speak: {
          speak: true,
          showReasoning: false,
          showStructured: true,
          onlyOnFailure: true,
        },
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
      state: { chapterContent: "违规正文", repairRound: 0, reviewTrail: [] },
      attempt: 0,
    });

    assert.equal(typeof ruleGuardPreview.displayText, "string");
    assert.equal(ruleGuardPreview.displayText?.includes("元信息"), true);
    assert.equal((ruleGuardPreview.structured as { status: string }).status, "fail");
    guardCalls = 0;

    const outcome = await createMvpWorkflowRun(handlers, {
      chapterId: "chapter-001",
      initialContent: "",
      maxRepairRounds: 2,
    }).result;

    assert.equal(outcome.run.status, "ok");
    assert.equal(outcome.state.repairRound, 1);
    assert.equal(outcome.state.chapterContent, "修复后的场景正文，没有元信息。");
    assert.equal(outcome.state.summary, "香奈惠在蝶屋走廊停步并修正了草稿。");
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
    assert.equal(outcome.state.reviewTrail?.some((item) => item.agentId === "timeline-agent"), true);
    assert.equal(prompts.some((item) => item.message.includes("provider:")), false);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
