import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import git from "isomorphic-git";

import { CredentialService, InMemoryCredentialStore } from "@shulingge/security";
import { CURRENT_SCHEMA_VERSION, type ProjectSeries } from "@shulingge/shared";
import {
  initializeProject,
  initializeVault,
  readJsonFile,
  readManuscriptFile,
  writeJsonFile,
  writeManuscriptFile,
} from "@shulingge/vault-core";

import { startServer } from "./index.js";

async function createFixtureVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "shulingge-server-"));

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

  await writeJsonFile(root, "projects/demo-series/shared/worldbook/wb-butterfly-mansion.json", {
    id: "wb-butterfly-mansion",
    title: "蝶屋",
    sections: {
      fact: "蝶屋是治疗与休整的地点。",
    },
    trigger: {
      keywords: ["蝶屋"],
      characters: ["kanae"],
      places: ["蝶屋"],
      semantic: false,
    },
    relatedNovels: ["main"],
    appliesToAgents: ["worldbook-agent"],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  return root;
}

async function createWebDistFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "shulingge-web-dist-"));
  const assetsDirectory = path.join(root, "assets");
  await fs.promises.mkdir(assetsDirectory, { recursive: true });
  await fs.promises.writeFile(
    path.join(root, "index.html"),
    '<!doctype html><html><body><div id="root">书灵阁 Web UI</div><script type="module" src="/assets/app.js"></script></body></html>',
    "utf8",
  );
  await fs.promises.writeFile(path.join(assetsDirectory, "app.js"), 'console.log("web-ui");', "utf8");
  return root;
}

function createMockModelFetch() {
  const requests: Array<{ url: string; body: string; headers: Headers }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : "";
    const payload = body ? JSON.parse(body) as { max_tokens?: number } : {};
    requests.push({ url, body, headers });

    let content = "connectivity ok";
    if (payload.max_tokens === 1200) {
      content = JSON.stringify({ content: "AI refined chapter text." });
    } else if (payload.max_tokens === 900 || payload.max_tokens === 700) {
      content = JSON.stringify({
        status: "ok",
        score: 96,
        mustRewrite: false,
        lockedViolations: 0,
        hardViolations: 0,
        softViolations: 0,
        rewriteInstructions: [],
        displayText: "ok",
      });
    } else if (payload.max_tokens === 600) {
      content = JSON.stringify({ summary: "本章摘要：AI 完成了润色与审查。" });
    }

    return new Response(
      JSON.stringify({
        choices: [{ message: { content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  };

  return { fetchImpl, requests };
}

async function seedWorkflowFallbackModel(
  vaultRoot: string,
  credentialService: CredentialService,
) {
  await writeJsonFile(vaultRoot, "settings/models/workflow-default.json", {
    id: "workflow-default",
    provider: "openai-compatible",
    model: "workflow-default",
    keyRef: "provider:openai-compatible:workflow-default",
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
  await credentialService.storeApiKey("provider:openai-compatible:workflow-default", "sk-workflow-default");
}

test("health check succeeds and server binds to 127.0.0.1 by default", async () => {
  const server = await startServer();

  try {
    assert.equal(server.host, "127.0.0.1");

    const response = await fetch(`${server.baseUrl}/api/v1/health`);
    const payload = (await response.json()) as { ok: true; data: { status: string } };

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.status, "ok");
  } finally {
    await server.close();
  }
});

test("search and index rebuild routes work against a selected vault", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    const rebuildResponse = await fetch(`${server.baseUrl}/api/v1/index/rebuild`, {
      method: "POST",
    });
    const rebuildPayload = (await rebuildResponse.json()) as {
      ok: true;
      data: { indexedCount: number };
    };

    const searchResponse = await fetch(
      `${server.baseUrl}/api/v1/search?q=${encodeURIComponent("蝶屋")}&project=demo-series`,
    );
    const semanticSearchResponse = await fetch(
      `${server.baseUrl}/api/v1/search?q=${encodeURIComponent("Kanae injury")}&project=demo-series&novel=main&type=knowledge-item&semantic=1&semanticProvider=local`,
    );
    const searchPayload = (await searchResponse.json()) as {
      ok: true;
      data: { results: Array<{ type: string; title: string }> };
    };
    const semanticSearchPayload = (await semanticSearchResponse.json()) as {
      ok: true;
      data: { results: Array<{ type: string; path: string }> };
    };

    assert.equal(rebuildResponse.status, 200);
    assert.ok(rebuildPayload.data.indexedCount >= 2);
    assert.ok(searchPayload.data.results.some((item) => item.type === "worldbook"));
    assert.equal(semanticSearchResponse.status, 200);
    assert.equal(Array.isArray(semanticSearchPayload.data.results), true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("health report, context presets, and consistency check routes work for V1.5", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    await writeJsonFile(vaultRoot, "projects/demo-series/shared/characters/kanae.json", {
      id: "kanae",
      name: "Kanae",
      links: [],
      voice: {
        typicalLines: ["Stay calm."],
        forbiddenLines: [],
        honorifics: {},
      },
      forbiddenWrites: [],
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    await writeJsonFile(vaultRoot, "projects/demo-series/shared/relations/rel-missing.json", {
      id: "rel-missing",
      from: "kanae",
      to: "shinobu",
      type: "siblings",
      sourceChapters: ["chapter-404"],
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    await writeJsonFile(vaultRoot, "projects/demo-series/shared/timeline/ev-missing.json", {
      id: "ev-missing",
      title: "Missing binding",
      line: "main",
      order: 2,
      boundChapters: ["chapter-404"],
      participants: ["kanae"],
      stateSnapshotRef: null,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    const presetCreateResponse = await fetch(`${server.baseUrl}/api/v1/context-presets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "preset-a",
        name: "Preset A",
        agentId: "writer-agent",
        tokenBudget: 900,
        forceInclude: ["projects/demo-series/shared/worldbook/wb-butterfly-mansion.json"],
        exclude: [],
      }),
    });
    await fetch(`${server.baseUrl}/api/v1/context-presets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "preset-b",
        name: "Preset B",
        agentId: "writer-agent",
        tokenBudget: 1400,
        systemPrompt: "Keep prose restrained.",
        forceInclude: [
          "projects/demo-series/shared/worldbook/wb-butterfly-mansion.json",
          "projects/demo-series/shared/characters/kanae.json",
        ],
        exclude: ["projects/demo-series/novels/main/summaries/chapter-000.json"],
        pinnedSources: ["projects/demo-series/shared/characters/kanae.json"],
      }),
    });

    const presetsResponse = await fetch(`${server.baseUrl}/api/v1/context-presets`);
    const diffResponse = await fetch(`${server.baseUrl}/api/v1/context-presets/diff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leftPresetId: "preset-a",
        rightPresetId: "preset-b",
        agentId: "writer-agent",
        projectId: "demo-series",
        novelId: "main",
        chapterId: "chapter-001",
      }),
    });
    const notificationsResponse = await fetch(
      `${server.baseUrl}/api/v1/notifications?projectId=demo-series&novelId=main&chapterId=chapter-001`,
    );
    const deletePresetResponse = await fetch(`${server.baseUrl}/api/v1/context-presets/preset-a`, {
      method: "DELETE",
    });
    const consistencyResponse = await fetch(`${server.baseUrl}/api/v1/consistency/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
      }),
    });
    const healthResponse = await fetch(`${server.baseUrl}/api/v1/health/report`);

    const presetsPayload = (await presetsResponse.json()) as {
      ok: true;
      data: { presets: Array<{ id: string }> };
    };
    const diffPayload = (await diffResponse.json()) as {
      ok: true;
      data: {
        diff: {
          tokenBudgetChanged: boolean;
          systemPromptChanged: boolean;
          addedForceInclude: string[];
          addedExclude: string[];
          addedPinnedSources: string[];
        };
      };
    };
    const notificationsPayload = (await notificationsResponse.json()) as {
      ok: true;
      data: { notifications: Array<{ source: string }> };
    };
    const deletePresetPayload = (await deletePresetResponse.json()) as {
      ok: true;
      data: { deleted: true; presetId: string };
    };
    const consistencyPayload = (await consistencyResponse.json()) as {
      ok: true;
      data: { totalIssues: number; issues: Array<{ category: string }> };
    };
    const healthPayload = (await healthResponse.json()) as {
      ok: true;
      data: {
        reminders: Array<{ id: string }>;
        backupCount: number;
        checks: Array<{ id: string; status: string }>;
        summary: { vaultReady: boolean; projectReady: boolean };
      };
    };

    assert.equal(presetCreateResponse.status, 200);
    assert.equal(presetsResponse.status, 200);
    assert.equal(presetsPayload.data.presets.length >= 2, true);
    assert.equal(diffResponse.status, 200);
    assert.equal(diffPayload.data.diff.tokenBudgetChanged, true);
    assert.equal(diffPayload.data.diff.systemPromptChanged, true);
    assert.equal(diffPayload.data.diff.addedForceInclude.some((item) => item.includes("characters/kanae.json")), true);
    assert.equal(diffPayload.data.diff.addedExclude[0]?.includes("summaries/chapter-000.json"), true);
    assert.equal(diffPayload.data.diff.addedPinnedSources[0]?.includes("characters/kanae.json"), true);
    assert.equal(notificationsResponse.status, 200);
    assert.equal(notificationsPayload.data.notifications.some((item) => item.source === "health"), true);
    assert.equal(deletePresetResponse.status, 200);
    assert.equal(deletePresetPayload.data.deleted, true);
    assert.equal(deletePresetPayload.data.presetId, "preset-a");
    assert.equal(consistencyResponse.status, 200);
    assert.equal(consistencyPayload.data.totalIssues >= 2, true);
    assert.equal(consistencyPayload.data.issues.some((item) => item.category === "timeline"), true);
    assert.equal(consistencyPayload.data.issues.some((item) => item.category === "character"), true);
    assert.equal(healthResponse.status, 200);
    assert.equal(Array.isArray(healthPayload.data.reminders), true);
    assert.equal(typeof healthPayload.data.backupCount, "number");
    assert.equal(Array.isArray(healthPayload.data.checks), true);
    assert.equal(healthPayload.data.summary.vaultReady, true);
    assert.equal(healthPayload.data.summary.projectReady, true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("bootstrap status and completion routes initialize first-run state", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "shulingge-bootstrap-"));
  const server = await startServer();

  try {
    const initialResponse = await fetch(`${server.baseUrl}/api/v1/bootstrap/status`);
    const initialPayload = (await initialResponse.json()) as {
      ok: true;
      data: { completed: boolean; hasVault: boolean; checklist: Array<{ id: string; done: boolean }> };
    };

    assert.equal(initialResponse.status, 200);
    assert.equal(initialPayload.data.completed, false);
    assert.equal(initialPayload.data.hasVault, false);
    assert.equal(initialPayload.data.checklist.find((item) => item.id === "vault")?.done, false);

    const completeResponse = await fetch(`${server.baseUrl}/api/v1/bootstrap/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rootPath,
        createDemoProject: true,
        preferredTheme: "paper-ink",
        preferredLanguage: "zh-CN",
      }),
    });
    const completePayload = (await completeResponse.json()) as {
      ok: true;
      data: {
        vaultRoot: string;
        status: { hasVault: boolean; hasAnyProject: boolean; preferredTheme: string; preferredLanguage: string };
      };
    };

    assert.equal(completeResponse.status, 200);
    assert.equal(completePayload.data.vaultRoot, rootPath);
    assert.equal(completePayload.data.status.hasVault, true);
    assert.equal(completePayload.data.status.hasAnyProject, true);
    assert.equal(completePayload.data.status.preferredTheme, "paper-ink");
    assert.equal(completePayload.data.status.preferredLanguage, "zh-CN");

    const selectedVault = await readJsonFile<{ completed: boolean; preferredTheme: string }>(
      rootPath,
      "settings/bootstrap.json",
    );
    assert.equal(selectedVault.completed, true);
    assert.equal(selectedVault.preferredTheme, "paper-ink");
  } finally {
    await server.close();
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("V2 replay, advanced consistency, theme community, and update workflow routes work", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    await writeJsonFile(vaultRoot, "projects/demo-series/shared/characters/kanae.json", {
      id: "kanae",
      name: "Kanae",
      links: [],
      voice: {
        typicalLines: ["Stay calm."],
        forbiddenLines: [],
        honorifics: {},
      },
      forbiddenWrites: [],
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    await writeJsonFile(vaultRoot, "projects/demo-series/shared/relations/rel-1.json", {
      id: "rel-1",
      from: "kanae",
      to: "shinobu",
      type: "siblings",
      stage: "close",
      sourceChapters: ["chapter-001"],
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    await writeJsonFile(vaultRoot, "projects/demo-series/shared/timeline/ev-1.json", {
      id: "ev-1",
      title: "Arrival",
      line: "main",
      order: 1,
      boundChapters: ["chapter-001"],
      participants: ["kanae"],
      stateSnapshotRef: null,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    const replayResponse = await fetch(
      `${server.baseUrl}/api/v1/knowledge/replay?projectId=demo-series&novelId=main`,
    );
    const advancedConsistencyResponse = await fetch(`${server.baseUrl}/api/v1/consistency/check/advanced`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
      }),
    });
    const themePublishResponse = await fetch(`${server.baseUrl}/api/v1/themes/community`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "paper-ink",
        name: "Paper Ink",
        author: "codex",
        description: "Warm editorial light theme.",
        tokensCssPath: "themes/paper-ink.css",
      }),
    });
    const themeListResponse = await fetch(`${server.baseUrl}/api/v1/themes/community`);
    const updateCheckResponse = await fetch(`${server.baseUrl}/api/v1/app/update/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentVersion: "2.0.0",
        targetVersion: "2.1.0",
        releaseNotes: "稳定版更新",
      }),
    });
    const updateDownloadResponse = await fetch(`${server.baseUrl}/api/v1/app/update/download`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentVersion: "2.0.0",
        targetVersion: "2.1.0",
        artifactName: "书灵阁-Setup-2.1.0-stable-x64.exe",
        downloadUrl: "https://downloads.shulingge.local/stable/书灵阁-Setup-2.1.0-stable-x64.exe",
      }),
    });
    const updatePrepareResponse = await fetch(`${server.baseUrl}/api/v1/app/update/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentVersion: "2.0.0", targetVersion: "2.1.0" }),
    });
    const updateApplyResponse = await fetch(`${server.baseUrl}/api/v1/app/update/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentVersion: "2.0.0", targetVersion: "2.1.0" }),
    });
    const updateStatusResponse = await fetch(`${server.baseUrl}/api/v1/app/update/status`);
    const updateRollbackResponse = await fetch(`${server.baseUrl}/api/v1/app/update/rollback`, {
      method: "POST",
    });

    const replayPayload = (await replayResponse.json()) as {
      ok: true;
      data: { frames: Array<{ chapterId: string; relations: Array<{ relationId: string }> }> };
    };
    const advancedConsistencyPayload = (await advancedConsistencyResponse.json()) as {
      ok: true;
      data: { level: string; totalIssues: number };
    };
    const themePublishPayload = (await themePublishResponse.json()) as {
      ok: true;
      data: { theme: { id: string; author: string } };
    };
    const themeListPayload = (await themeListResponse.json()) as {
      ok: true;
      data: { themes: Array<{ id: string }> };
    };
    const updateCheckPayload = (await updateCheckResponse.json()) as {
      ok: true;
      data: { updateAvailable: boolean; stage: string; targetVersion: string; releaseNotes?: string };
    };
    const updateDownloadPayload = (await updateDownloadResponse.json()) as {
      ok: true;
      data: { downloaded: true; stage: string; downloadFile: string };
    };
    const updatePreparePayload = (await updatePrepareResponse.json()) as {
      ok: true;
      data: { prepared: true; targetVersion: string; preservesVaultData: true; backupPath: string; stage: string };
    };
    const updateApplyPayload = (await updateApplyResponse.json()) as {
      ok: true;
      data: { applied: true; currentVersion: string; rollbackAvailable: boolean; stage: string };
    };
    const updateStatusPayload = (await updateStatusResponse.json()) as {
      ok: true;
      data: { currentVersion: string; stage: string; rollbackAvailable: boolean };
    };
    const updateRollbackPayload = (await updateRollbackResponse.json()) as {
      ok: true;
      data: { rolledBack: true; currentVersion: string; rollbackAvailable: boolean; stage: string };
    };

    assert.equal(replayResponse.status, 200);
    assert.equal(replayPayload.data.frames[0]?.chapterId, "chapter-001");
    assert.equal(replayPayload.data.frames[0]?.relations[0]?.relationId, "rel-1");
    assert.equal(advancedConsistencyResponse.status, 200);
    assert.equal(advancedConsistencyPayload.data.level, "advanced");
    assert.equal(typeof advancedConsistencyPayload.data.totalIssues, "number");
    assert.equal(themePublishResponse.status, 200);
    assert.equal(themePublishPayload.data.theme.id, "paper-ink");
    assert.equal(themePublishPayload.data.theme.author, "codex");
    assert.equal(themeListResponse.status, 200);
    assert.equal(themeListPayload.data.themes.some((item) => item.id === "paper-ink"), true);
    assert.equal(updateCheckResponse.status, 200);
    assert.equal(updateCheckPayload.data.updateAvailable, true);
    assert.equal(updateCheckPayload.data.stage, "available");
    assert.equal(updateCheckPayload.data.targetVersion, "2.1.0");
    assert.equal(updateCheckPayload.data.releaseNotes, "稳定版更新");
    assert.equal(updateDownloadResponse.status, 200);
    assert.equal(updateDownloadPayload.data.downloaded, true);
    assert.equal(updateDownloadPayload.data.stage, "downloaded");
    assert.equal(updateDownloadPayload.data.downloadFile.includes("global/app-updates/downloads/2.1.0.json"), true);
    assert.equal(updatePrepareResponse.status, 200);
    assert.equal(updatePreparePayload.data.prepared, true);
    assert.equal(updatePreparePayload.data.targetVersion, "2.1.0");
    assert.equal(updatePreparePayload.data.preservesVaultData, true);
    assert.equal(updatePreparePayload.data.stage, "prepared");
    assert.equal(updatePreparePayload.data.backupPath.includes("pre-update-2.1.0"), true);
    assert.equal(updateApplyResponse.status, 200);
    assert.equal(updateApplyPayload.data.applied, true);
    assert.equal(updateApplyPayload.data.currentVersion, "2.1.0");
    assert.equal(updateApplyPayload.data.rollbackAvailable, true);
    assert.equal(updateApplyPayload.data.stage, "applied");
    assert.equal(updateStatusResponse.status, 200);
    assert.equal(updateStatusPayload.data.currentVersion, "2.1.0");
    assert.equal(updateStatusPayload.data.stage, "applied");
    assert.equal(updateStatusPayload.data.rollbackAvailable, true);
    assert.equal(updateRollbackResponse.status, 200);
    assert.equal(updateRollbackPayload.data.rolledBack, true);
    assert.equal(updateRollbackPayload.data.currentVersion, "2.0.0");
    assert.equal(updateRollbackPayload.data.rollbackAvailable, false);
    assert.equal(updateRollbackPayload.data.stage, "rolled-back");

    const storedUpdateStatus = await readJsonFile<{
      currentVersion: string;
      stage: string;
      backupPath?: string;
      downloadFile?: string;
    }>(vaultRoot, "settings/app-update.json");
    assert.equal(storedUpdateStatus.currentVersion, "2.0.0");
    assert.equal(storedUpdateStatus.stage, "rolled-back");
    assert.equal(storedUpdateStatus.backupPath?.includes("pre-update-2.1.0"), true);
    assert.equal(storedUpdateStatus.downloadFile?.includes("global/app-updates/downloads/2.1.0.json"), true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("desktop shell routes expose real workspace, mobile preview, and runs pages", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    const workspaceResponse = await fetch(`${server.baseUrl}/desktop/workspace`);
    const mobileResponse = await fetch(`${server.baseUrl}/desktop/mobile`);
    const runsResponse = await fetch(`${server.baseUrl}/desktop/runs`);

    const workspaceHtml = await workspaceResponse.text();
    const mobileHtml = await mobileResponse.text();
    const runsHtml = await runsResponse.text();

    assert.equal(workspaceResponse.status, 200);
    assert.equal(mobileResponse.status, 200);
    assert.equal(runsResponse.status, 200);
    assert.equal(workspaceHtml.includes("书灵阁桌面工作台"), true);
    assert.equal(workspaceHtml.includes("/desktop/mobile"), true);
    assert.equal(workspaceHtml.includes("运行 9 Agent"), true);
    assert.equal(mobileHtml.includes("移动控制台桌面预览"), true);
    assert.equal(mobileHtml.includes("<iframe"), true);
    assert.equal(mobileHtml.includes('src="/m"'), true);
    assert.equal(runsHtml.includes("运行记录与更新状态"), true);
    assert.equal(runsHtml.includes("/api/v1/app/update/status"), true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("server can host bundled web ui assets for desktop runtime", async () => {
  const webDistPath = await createWebDistFixture();
  const server = await startServer({ webDistPath });

  try {
    const indexResponse = await fetch(`${server.baseUrl}/`);
    const assetResponse = await fetch(`${server.baseUrl}/assets/app.js`);
    const routeResponse = await fetch(`${server.baseUrl}/characters`);

    const indexHtml = await indexResponse.text();
    const assetText = await assetResponse.text();
    const routeHtml = await routeResponse.text();

    assert.equal(indexResponse.status, 200);
    assert.equal(indexResponse.headers.get("content-type")?.includes("text/html"), true);
    assert.equal(indexHtml.includes("书灵阁 Web UI"), true);

    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get("content-type")?.includes("application/javascript"), true);
    assert.equal(assetText.includes('console.log("web-ui")'), true);

    assert.equal(routeResponse.status, 200);
    assert.equal(routeHtml.includes("书灵阁 Web UI"), true);
  } finally {
    await server.close();
    await rm(webDistPath, { recursive: true, force: true });
  }
});

test("knowledge routes manage shared entries, novel knowledge items, and graph links", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    const createCharacterResponse = await fetch(`${server.baseUrl}/api/v1/knowledge/characters`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "demo-series",
        id: "kanae",
        name: "Kanae",
        links: ["[[Butterfly Mansion]]"],
        voice: {
          typicalLines: ["Stay calm."],
          forbiddenLines: ["I do not care about anyone."],
          honorifics: {
            shinobu: "Shinobu",
          },
        },
        knowledgeScopeRef: "states/knowledge.json",
        currentStateRef: "states/kanae.state.json",
        forbiddenWrites: ["out-of-character rage"],
        relatedWorldbook: ["wb-butterfly-mansion"],
      }),
    });

    const createRelationResponse = await fetch(`${server.baseUrl}/api/v1/knowledge/relations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "demo-series",
        id: "rel-kanae-shinobu",
        from: "kanae",
        to: "shinobu",
        type: "sisters",
        stage: "close",
        sourceChapters: ["chapter-001"],
      }),
    });

    const createTimelineResponse = await fetch(`${server.baseUrl}/api/v1/knowledge/timeline`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "demo-series",
        id: "ev-first-meet",
        title: "First Meeting",
        line: "main",
        order: 1,
        boundChapters: ["chapter-001"],
        participants: ["kanae"],
        stateSnapshotRef: null,
      }),
    });

    const createKnowledgeResponse = await fetch(`${server.baseUrl}/api/v1/knowledge/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        id: "know-secret-wound",
        content: "Kanae knows the protagonist is injured.",
        knownBy: ["kanae"],
        unknownBy: ["shinobu"],
        sourceChapter: "chapter-001",
        spreadMethod: "observed",
        happenedAt: "2026-06-09T00:00:00.000Z",
        canSpread: false,
        secret: true,
        affectsBehavior: true,
      }),
    });

    const listCharactersResponse = await fetch(
      `${server.baseUrl}/api/v1/knowledge/characters?projectId=demo-series`,
    );
    const updateWorldbookResponse = await fetch(
      `${server.baseUrl}/api/v1/knowledge/worldbook/wb-butterfly-mansion`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "demo-series",
          title: "Butterfly Mansion",
          sections: {
            fact: "A place for treatment and rest.",
            currentState: "The lamps are still on tonight.",
          },
          trigger: {
            keywords: ["Butterfly Mansion", "hallway"],
            characters: ["kanae"],
            places: ["Butterfly Mansion"],
            timeline: ["ev-first-meet"],
            semantic: false,
          },
          relatedNovels: ["main"],
          appliesToAgents: ["writer-agent"],
        }),
      },
    );

    const graphResponse = await fetch(
      `${server.baseUrl}/api/v1/knowledge/graph?projectId=demo-series&novelId=main`,
    );
    const rebuildResponse = await fetch(`${server.baseUrl}/api/v1/index/rebuild`, {
      method: "POST",
    });
    const searchResponse = await fetch(
      `${server.baseUrl}/api/v1/search?q=${encodeURIComponent("Kanae")}&project=demo-series`,
    );

    const createCharacterPayload = (await createCharacterResponse.json()) as {
      ok: true;
      data: { character: { id: string; voice: { typicalLines: string[] } } };
    };
    const createRelationPayload = (await createRelationResponse.json()) as {
      ok: true;
      data: { relation: { id: string; type: string } };
    };
    const createTimelinePayload = (await createTimelineResponse.json()) as {
      ok: true;
      data: { event: { id: string; participants: string[] } };
    };
    const createKnowledgePayload = (await createKnowledgeResponse.json()) as {
      ok: true;
      data: { item: { id: string; secret: boolean } };
    };
    const listCharactersPayload = (await listCharactersResponse.json()) as {
      ok: true;
      data: { characters: Array<{ id: string }> };
    };
    const updateWorldbookPayload = (await updateWorldbookResponse.json()) as {
      ok: true;
      data: { entry: { title: string; trigger: { timeline?: string[]; characters: string[] } } };
    };
    const graphPayload = (await graphResponse.json()) as {
      ok: true;
      data: {
        nodes: Array<{ id: string }>;
        edges: Array<{ from: string; to: string; type: string }>;
      };
    };
    const rebuildPayload = (await rebuildResponse.json()) as {
      ok: true;
      data: { indexedCount: number };
    };
    const searchPayload = (await searchResponse.json()) as {
      ok: true;
      data: { results: Array<{ type: string; title: string }> };
    };

    const savedCharacter = await readJsonFile<{ links: string[]; relatedWorldbook?: string[] }>(
      vaultRoot,
      "projects/demo-series/shared/characters/kanae.json",
    );
    const savedWorldbook = await readJsonFile<{ title: string; trigger: { keywords: string[] } }>(
      vaultRoot,
      "projects/demo-series/shared/worldbook/wb-butterfly-mansion.json",
    );
    const savedKnowledge = await readJsonFile<{ knownBy: string[]; secret: boolean }>(
      vaultRoot,
      "projects/demo-series/novels/main/states/knowledge/know-secret-wound.json",
    );

    assert.equal(createCharacterResponse.status, 200);
    assert.equal(createRelationResponse.status, 200);
    assert.equal(createTimelineResponse.status, 200);
    assert.equal(createKnowledgeResponse.status, 200);
    assert.equal(createCharacterPayload.data.character.id, "kanae");
    assert.equal(createCharacterPayload.data.character.voice.typicalLines[0], "Stay calm.");
    assert.equal(createRelationPayload.data.relation.type, "sisters");
    assert.equal(createTimelinePayload.data.event.participants[0], "kanae");
    assert.equal(createKnowledgePayload.data.item.secret, true);
    assert.equal(listCharactersPayload.data.characters.some((item) => item.id === "kanae"), true);
    assert.equal(updateWorldbookPayload.data.entry.title, "Butterfly Mansion");
    assert.deepEqual(updateWorldbookPayload.data.entry.trigger.timeline, ["ev-first-meet"]);
    assert.equal(updateWorldbookPayload.data.entry.trigger.characters[0], "kanae");
    assert.equal(graphResponse.status, 200);
    assert.equal(graphPayload.data.nodes.some((node) => node.id === "character:kanae"), true);
    assert.equal(
      graphPayload.data.edges.some(
        (edge) =>
          edge.from === "character:kanae" &&
          edge.to === "worldbook:wb-butterfly-mansion" &&
          edge.type === "related-worldbook",
      ),
      true,
    );
    assert.equal(
      graphPayload.data.edges.some(
        (edge) =>
          edge.from === "knowledge:know-secret-wound" &&
          edge.to === "character:kanae" &&
          edge.type === "known-by",
      ),
      true,
    );
    assert.equal(
      graphPayload.data.edges.some(
        (edge) =>
          edge.from === "character:kanae" &&
          edge.to === "worldbook:wb-butterfly-mansion" &&
          edge.type === "wikilink",
      ),
      true,
    );
    assert.equal(rebuildResponse.status, 200);
    assert.ok(rebuildPayload.data.indexedCount >= 5);
    assert.equal(searchResponse.status, 200);
    assert.equal(searchPayload.data.results.some((item) => item.type === "character"), true);
    assert.deepEqual(savedCharacter.links, ["[[Butterfly Mansion]]"]);
    assert.equal(savedCharacter.relatedWorldbook?.[0], "wb-butterfly-mansion");
    assert.equal(savedWorldbook.title, "Butterfly Mansion");
    assert.deepEqual(savedWorldbook.trigger.keywords, ["Butterfly Mansion", "hallway"]);
    assert.deepEqual(savedKnowledge.knownBy, ["kanae"]);
    assert.equal(savedKnowledge.secret, true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("export and backup routes write sanitized artifacts inside vault", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    await writeJsonFile(vaultRoot, "settings/app.json", {
      id: "settings",
      remote: {
        enabled: false,
        passwordHashRef: "secret-hash-ref",
      },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    await writeJsonFile(vaultRoot, "settings/models/writer-main.json", {
      id: "writer-main",
      provider: "openai-compatible",
      model: "gpt-test",
      keyRef: "provider:openai-compatible:writer-main",
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    const exportResponse = await fetch(`${server.baseUrl}/api/v1/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        chapterId: "chapter-001",
        scope: "chapter",
        format: "txt",
      }),
    });
    const backupResponse = await fetch(`${server.baseUrl}/api/v1/backup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "server-test",
      }),
    });

    const exportPayload = (await exportResponse.json()) as {
      ok: true;
      data: { outputPath: string };
    };
    const backupPayload = (await backupResponse.json()) as {
      ok: true;
      data: { outputPath: string; encrypted: boolean };
    };

    const exportedText = await readManuscriptFile(vaultRoot, exportPayload.data.outputPath);
    const backupBytes = await fs.promises.readFile(path.join(vaultRoot, backupPayload.data.outputPath));

    assert.equal(exportResponse.status, 200);
    assert.equal(backupResponse.status, 200);
    assert.equal(exportPayload.data.outputPath.includes("backups/exports/"), true);
    assert.equal(exportedText, "蝶屋的夜风吹进走廊，香奈惠停下脚步。");
    assert.equal(backupPayload.data.encrypted, false);
    assert.equal(backupPayload.data.outputPath.includes("backups/"), true);
    assert.equal(backupBytes.length > 0, true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("diagnostics export writes a sanitized bundle inside vault", async () => {
  const vaultRoot = await createFixtureVault();
  const credentialService = new CredentialService(new InMemoryCredentialStore());
  await seedWorkflowFallbackModel(vaultRoot, credentialService);
  const server = await startServer({ vaultRoot, credentialService });

  try {
    const diagnosticsResponse = await fetch(`${server.baseUrl}/api/v1/diagnostics/export`, {
      method: "POST",
    });
    const diagnosticsPayload = (await diagnosticsResponse.json()) as {
      ok: true;
      data: { outputPath: string; includes: string[] };
    };

    const diagnosticsText = await fs.promises.readFile(path.join(vaultRoot, diagnosticsPayload.data.outputPath), "utf8");
    const diagnosticsJson = JSON.parse(diagnosticsText) as {
      models: Array<{ id: string; hasKey: boolean }>;
      health: { summary: { vaultReady: boolean } };
    };

    assert.equal(diagnosticsResponse.status, 200);
    assert.equal(diagnosticsPayload.data.outputPath.includes("backups/diagnostics/"), true);
    assert.equal(diagnosticsPayload.data.includes.includes("model-status"), true);
    assert.equal(diagnosticsJson.models.some((item) => item.id === "workflow-default" && item.hasKey), true);
    assert.equal(diagnosticsJson.health.summary.vaultReady, true);
    assert.equal(diagnosticsText.includes("sk-workflow-default"), false);
    assert.equal(diagnosticsText.includes("蝶屋的夜风吹进走廊"), false);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("V2.1 release acceptance covers update rollback, backup restore, offline access, and remote-default-off", async () => {
  const vaultRoot = await createFixtureVault();
  const credentialService = new CredentialService(new InMemoryCredentialStore());
  await seedWorkflowFallbackModel(vaultRoot, credentialService);
  const server = await startServer({ vaultRoot, credentialService });

  try {
    const healthResponse = await fetch(`${server.baseUrl}/api/v1/health`);
    const remoteStatusResponse = await fetch(`${server.baseUrl}/api/v1/remote/status`);
    const updateCheckResponse = await fetch(`${server.baseUrl}/api/v1/app/update/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentVersion: "2.1.0",
        targetVersion: "2.1.1",
        releaseNotes: "V2.1.1 release candidate",
      }),
    });
    const updateDownloadResponse = await fetch(`${server.baseUrl}/api/v1/app/update/download`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentVersion: "2.1.0",
        targetVersion: "2.1.1",
        artifactName: "书灵阁-Setup-2.1.1-stable-x64.exe",
      }),
    });
    const updatePrepareResponse = await fetch(`${server.baseUrl}/api/v1/app/update/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentVersion: "2.1.0", targetVersion: "2.1.1" }),
    });
    const updateApplyResponse = await fetch(`${server.baseUrl}/api/v1/app/update/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentVersion: "2.1.0", targetVersion: "2.1.1" }),
    });
    const updateRollbackResponse = await fetch(`${server.baseUrl}/api/v1/app/update/rollback`, {
      method: "POST",
    });

    const backupResponse = await fetch(`${server.baseUrl}/api/v1/backup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        encrypt: true,
        password: "release-restore-pass",
        label: "release-restore",
      }),
    });
    const backupPayload = (await backupResponse.json()) as {
      ok: true;
      data: { outputPath: string };
    };

    await writeManuscriptFile(
      vaultRoot,
      "projects/demo-series/novels/main/manuscripts/chapter-001.md",
      "被恢复前的临时改动。",
    );

    const restoreResponse = await fetch(`${server.baseUrl}/api/v1/backup/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        backupPath: backupPayload.data.outputPath,
        password: "release-restore-pass",
      }),
    });
    const restorePayload = (await restoreResponse.json()) as {
      ok: true;
      data: { restoredFiles: number; encrypted: boolean };
    };

    const restoredManuscript = await readManuscriptFile(
      vaultRoot,
      "projects/demo-series/novels/main/manuscripts/chapter-001.md",
    );
    const updateStatus = await readJsonFile<{
      currentVersion: string;
      stage: string;
      rollbackAvailable: boolean;
    }>(vaultRoot, "settings/app-update.json");
    const remoteStatusPayload = (await remoteStatusResponse.json()) as {
      ok: true;
      data: { enabled: boolean; passwordConfigured: boolean };
    };

    assert.equal(healthResponse.status, 200);
    assert.equal(remoteStatusResponse.status, 200);
    assert.equal(remoteStatusPayload.data.enabled, false);
    assert.equal(remoteStatusPayload.data.passwordConfigured, false);
    assert.equal(updateCheckResponse.status, 200);
    assert.equal(updateDownloadResponse.status, 200);
    assert.equal(updatePrepareResponse.status, 200);
    assert.equal(updateApplyResponse.status, 200);
    assert.equal(updateRollbackResponse.status, 200);
    assert.equal(updateStatus.currentVersion, "2.1.0");
    assert.equal(updateStatus.stage, "rolled-back");
    assert.equal(updateStatus.rollbackAvailable, false);
    assert.equal(backupResponse.status, 200);
    assert.equal(restoreResponse.status, 200);
    assert.equal(restorePayload.data.encrypted, true);
    assert.equal(restorePayload.data.restoredFiles > 0, true);
    assert.equal(restoredManuscript, "蝶屋的夜风吹进走廊，香奈惠停下脚步。");
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("export route supports docx/pdf/epub templates and publish prepare writes publish assets", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    const docxResponse = await fetch(`${server.baseUrl}/api/v1/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        scope: "novel",
        format: "docx",
        template: "submission",
      }),
    });
    const epubResponse = await fetch(`${server.baseUrl}/api/v1/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        scope: "novel",
        format: "epub",
      }),
    });
    const publishResponse = await fetch(`${server.baseUrl}/api/v1/publish/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        chapterId: "chapter-001",
        scope: "chapter",
        platform: "qidian",
        title: "chapter-001 publish",
        summary: "含血腥词的简介用于测试",
        tags: ["测试"],
        authorNote: "发布备注",
        sensitiveWords: ["血腥", "违禁词"],
      }),
    });

    const docxPayload = (await docxResponse.json()) as {
      ok: true;
      data: { outputPath: string; template: string };
    };
    const epubPayload = (await epubResponse.json()) as {
      ok: true;
      data: { outputPath: string; template: string };
    };
    const publishPayload = (await publishResponse.json()) as {
      ok: true;
      data: { manifestPath: string; outputPaths: string[]; sensitiveHits: string[] };
    };

    const docxBytes = await fs.promises.readFile(path.join(vaultRoot, docxPayload.data.outputPath));
    const epubBytes = await fs.promises.readFile(path.join(vaultRoot, epubPayload.data.outputPath));
    const publishManifest = await readJsonFile<{ platform: string; sensitiveHits: string[] }>(
      vaultRoot,
      publishPayload.data.manifestPath,
    );
    const publishMarkdown = await fs.promises.readFile(
      path.join(vaultRoot, publishPayload.data.outputPaths[0] ?? ""),
      "utf8",
    );

    assert.equal(docxResponse.status, 200);
    assert.equal(docxPayload.data.template, "submission");
    assert.equal(docxPayload.data.outputPath.endsWith(".docx"), true);
    assert.equal(docxBytes.length > 0, true);
    assert.equal(epubResponse.status, 200);
    assert.equal(epubPayload.data.template, "epub-reader");
    assert.equal(epubPayload.data.outputPath.endsWith(".epub"), true);
    assert.equal(epubBytes.length > 0, true);
    assert.equal(publishResponse.status, 200);
    assert.equal(publishPayload.data.manifestPath.includes("/publish/qidian-"), true);
    assert.deepEqual(publishPayload.data.sensitiveHits, ["血腥"]);
    assert.equal(publishManifest.platform, "qidian");
    assert.deepEqual(publishManifest.sensitiveHits, ["血腥"]);
    assert.equal(publishMarkdown.includes("发布备注"), true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("models CRUD stores only keyRef in vault and writes api key to credential manager", async () => {
  const vaultRoot = await createFixtureVault();
  const credentialService = new CredentialService(new InMemoryCredentialStore());
  const { fetchImpl, requests } = createMockModelFetch();
  const server = await startServer({
    vaultRoot,
    credentialService,
    fetchImpl,
    providerEndpoints: {
      "openai-compatible": {
        baseUrl: "https://mock.local/v1",
        apiPath: "/chat/completions",
      },
    },
  });

  try {
    const createResponse = await fetch(`${server.baseUrl}/api/v1/models`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "writer-main",
        provider: "openai-compatible",
        model: "gpt-compat",
        jsonMode: true,
      }),
    });
    const createPayload = (await createResponse.json()) as {
      ok: true;
      data: { model: { id: string; hasKey: boolean; provider: string; keyRef?: string } };
    };

    const keyResponse = await fetch(`${server.baseUrl}/api/v1/models/writer-main/key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        apiKey: "sk-server-model-123",
      }),
    });
    const keyPayload = (await keyResponse.json()) as {
      ok: true;
      data: { id: string; hasKey: boolean; keyRef: string };
    };

    const listResponse = await fetch(`${server.baseUrl}/api/v1/models`);
    const listPayload = (await listResponse.json()) as {
      ok: true;
      data: { models: Array<{ id: string; hasKey: boolean; keyRef?: string }> };
    };

    const updateResponse = await fetch(`${server.baseUrl}/api/v1/models/writer-main`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-compat-2",
        stream: true,
      }),
    });
    const updatePayload = (await updateResponse.json()) as {
      ok: true;
      data: { model: { model: string; stream?: boolean; hasKey: boolean } };
    };

    const testResponse = await fetch(`${server.baseUrl}/api/v1/models/writer-main/test`, {
      method: "POST",
    });
    const testPayload = (await testResponse.json()) as {
      ok: true;
      data: { ok: true; modelId: string; contentPreview: string };
    };

    const savedModel = await readJsonFile<{
      id: string;
      provider: string;
      model: string;
      keyRef?: string;
    }>(vaultRoot, "settings/models/writer-main.json");
    const storedKey = await credentialService.getApiKey("provider:openai-compatible:writer-main");

    assert.equal(createResponse.status, 200);
    assert.equal(createPayload.data.model.id, "writer-main");
    assert.equal(createPayload.data.model.hasKey, false);
    assert.equal(keyResponse.status, 200);
    assert.equal(keyPayload.data.hasKey, true);
    assert.equal(keyPayload.data.keyRef, "provider:openai-compatible:writer-main");
    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.data.models[0]?.hasKey, true);
    assert.equal(updateResponse.status, 200);
    assert.equal(updatePayload.data.model.model, "gpt-compat-2");
    assert.equal(updatePayload.data.model.hasKey, true);
    assert.equal(testResponse.status, 200);
    assert.equal(testPayload.data.ok, true);
    assert.equal(testPayload.data.modelId, "writer-main");
    assert.equal(testPayload.data.contentPreview, "connectivity ok");
    assert.equal(savedModel.keyRef, "provider:openai-compatible:writer-main");
    assert.equal("apiKey" in savedModel, false);
    assert.equal(storedKey, "sk-server-model-123");
    assert.equal(JSON.stringify(keyPayload).includes("sk-server-model-123"), false);
    assert.equal(JSON.stringify(testPayload).includes("sk-server-model-123"), false);
    assert.equal(requests[0]?.headers.get("authorization"), "Bearer sk-server-model-123");
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("versioning creates snapshots and diffs on chapter save", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    const response = await fetch(`${server.baseUrl}/api/v1/editor/chapters/chapter-001/save`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        content: "新稿第一段。\n\n新稿第二段。",
      }),
    });

    assert.equal(response.status, 200);

    const timelineResponse = await fetch(
      `${server.baseUrl}/api/v1/version/chapters/chapter-001/timeline?projectId=demo-series&novelId=main`,
    );
    const timelinePayload = (await timelineResponse.json()) as {
      ok: true;
      data: {
        snapshots: Array<{ path: string }>;
        diffs: Array<{ patch: string }>;
      };
    };

    assert.equal(timelineResponse.status, 200);
    assert.equal(timelinePayload.data.snapshots.length >= 1, true);
    assert.equal(timelinePayload.data.diffs.length >= 1, true);
    assert.match(timelinePayload.data.diffs[0]?.patch ?? "", /\+\u65b0稿第一段/);

    const snapshotFiles = await readdir(
      path.join(vaultRoot, "projects", "demo-series", "novels", "main", "snapshots"),
    );
    const diffFiles = await readdir(
      path.join(vaultRoot, "projects", "demo-series", "novels", "main", "diffs"),
    );

    assert.equal(snapshotFiles.some((entry) => entry.endsWith(".md")), true);
    assert.equal(diffFiles.some((entry) => entry.endsWith(".json")), true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("finalize locks the chapter, creates git tag, and requires explicit unlock before editing", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    const finalizeResponse = await fetch(
      `${server.baseUrl}/api/v1/version/chapters/chapter-001/finalize`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "demo-series",
          novelId: "main",
          actor: "tester",
        }),
      },
    );
    const finalizePayload = (await finalizeResponse.json()) as {
      ok: true;
      data: { gitTag: string; metadata: { status: string; locks: Array<{ id: string }> } };
    };

    assert.equal(finalizeResponse.status, 200);
    assert.equal(finalizePayload.data.metadata.status, "finalized");
    assert.equal(
      finalizePayload.data.metadata.locks.some((lock) => lock.id === "finalized-lock-chapter-001"),
      true,
    );

    const tags = await git.listTags({
      fs,
      dir: path.join(vaultRoot, "projects", "demo-series", "novels", "main"),
    });
    assert.equal(tags.includes(finalizePayload.data.gitTag), true);

    const blockedSaveResponse = await fetch(`${server.baseUrl}/api/v1/editor/chapters/chapter-001/save`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        content: "定稿后不能直接改。",
      }),
    });
    assert.equal(blockedSaveResponse.status, 409);

    const unlockResponse = await fetch(
      `${server.baseUrl}/api/v1/version/chapters/chapter-001/unlock`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "demo-series",
          novelId: "main",
        }),
      },
    );
    const unlockPayload = (await unlockResponse.json()) as {
      ok: true;
      data: { metadata: { status: string; finalizedAt: string | null } };
    };

    assert.equal(unlockResponse.status, 200);
    assert.equal(unlockPayload.data.metadata.status, "drafting");
    assert.equal(unlockPayload.data.metadata.finalizedAt, null);

    const saveAfterUnlock = await fetch(`${server.baseUrl}/api/v1/editor/chapters/chapter-001/save`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        content: "回档编辑后允许继续写。",
      }),
    });

    assert.equal(saveAfterUnlock.status, 200);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("rollback restores manuscript from snapshot", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    await fetch(`${server.baseUrl}/api/v1/editor/chapters/chapter-001/save`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        content: "第一版正文。",
      }),
    });

    await fetch(`${server.baseUrl}/api/v1/editor/chapters/chapter-001/save`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        content: "第二版正文。",
      }),
    });

    const timelineResponse = await fetch(
      `${server.baseUrl}/api/v1/version/chapters/chapter-001/timeline?projectId=demo-series&novelId=main`,
    );
    const timelinePayload = (await timelineResponse.json()) as {
      ok: true;
      data: {
        snapshots: Array<{ path: string }>;
      };
    };
    const snapshotPath = timelinePayload.data.snapshots.at(-1)?.path;
    assert.ok(snapshotPath);

    const rollbackResponse = await fetch(
      `${server.baseUrl}/api/v1/version/chapters/chapter-001/rollback`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "demo-series",
          novelId: "main",
          snapshotPath,
        }),
      },
    );
    const rollbackPayload = (await rollbackResponse.json()) as {
      ok: true;
      data: { content: string };
    };

    assert.equal(rollbackResponse.status, 200);
    assert.equal(rollbackPayload.data.content, "第一版正文。");

    const manuscript = await readManuscriptFile(
      vaultRoot,
      "projects/demo-series/novels/main/manuscripts/chapter-001.md",
    );
    assert.equal(manuscript, "第一版正文。");
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("error responses are redacted", async () => {
  const server = await startServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/v1/search?q=sk-test-1234567890`);
    const payload = (await response.json()) as {
      ok: false;
      error: { code: string; message: string; redacted?: boolean };
    };

    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.redacted, true);
    assert.equal(payload.error.message.includes("sk-test-1234567890"), false);
  } finally {
    await server.close();
  }
});

test("workflow routes expose agents, persist runs, summaries, and final manuscript output", async () => {
  const vaultRoot = await createFixtureVault();
  const credentialService = new CredentialService(new InMemoryCredentialStore());
  const { fetchImpl } = createMockModelFetch();
  await seedWorkflowFallbackModel(vaultRoot, credentialService);
  const server = await startServer({
    vaultRoot,
    credentialService,
    fetchImpl,
    providerEndpoints: {
      "openai-compatible": {
        baseUrl: "https://mock.local/v1",
        apiPath: "/chat/completions",
      },
    },
  });

  try {
    const agentsResponse = await fetch(`${server.baseUrl}/api/v1/agents`);
    const runResponse = await fetch(`${server.baseUrl}/api/v1/chapters/chapter-001/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        fallbackModelId: "workflow-default",
        wait: true,
      }),
    });

    const agentsPayload = (await agentsResponse.json()) as {
      ok: true;
      data: { active: Array<{ id: string }>; reserved: Array<{ id: string }> };
    };
    const runPayload = (await runResponse.json()) as {
      ok: true;
      data: { runId: string; run: { id: string; status: string; nodes: Array<{ agentId: string }> } };
    };

    const getRunResponse = await fetch(
      `${server.baseUrl}/api/v1/runs/${runPayload.data.runId}?projectId=demo-series&novelId=main`,
    );
    const listRunsResponse = await fetch(
      `${server.baseUrl}/api/v1/runs?projectId=demo-series&novelId=main&chapterId=chapter-001`,
    );
    const getRunPayload = (await getRunResponse.json()) as {
      ok: true;
      data: { run: { id: string; status: string; nodes: Array<{ agentId: string }> } };
    };
    const listRunsPayload = (await listRunsResponse.json()) as {
      ok: true;
      data: { runs: Array<{ id: string; status: string }> };
    };

    const manuscript = await readManuscriptFile(
      vaultRoot,
      "projects/demo-series/novels/main/manuscripts/chapter-001.md",
    );
    const summary = await readJsonFile<{ oneLine: string }>(
      vaultRoot,
      "projects/demo-series/novels/main/summaries/chapter-001.json",
    );
    const metadata = await readJsonFile<{ source?: { lastRunId?: string; lastWrittenBy?: string } }>(
      vaultRoot,
      "projects/demo-series/novels/main/metadata/chapters/chapter-001.json",
    );

    assert.equal(agentsResponse.status, 200);
    assert.equal(agentsPayload.data.active.length, 9);
    assert.equal(agentsPayload.data.reserved.length, 4);
    assert.equal(runResponse.status, 200);
    assert.equal(runPayload.data.run.status, "ok");
    assert.equal(runPayload.data.run.nodes.length, 9);
    assert.equal(getRunResponse.status, 200);
    assert.equal(getRunPayload.data.run.id, runPayload.data.runId);
    assert.equal(listRunsResponse.status, 200);
    assert.equal(listRunsPayload.data.runs.some((item) => item.id === runPayload.data.runId), true);
    assert.equal(manuscript, "AI refined chapter text.");
    assert.equal(summary.oneLine, "本章摘要：AI 完成了润色与审查。");
    assert.equal(metadata.source?.lastRunId, runPayload.data.runId);
    assert.equal(metadata.source?.lastWrittenBy, "controller-agent");
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("remote routes enforce password, local-only reset, and port fallback", async () => {
  const vaultRoot = await createFixtureVault();
  const occupiedServer = http.createServer();
  await new Promise<void>((resolve) => occupiedServer.listen(3000, "0.0.0.0", () => resolve()));
  const server = await startServer({ vaultRoot, allowTestRemoteOverride: true });

  try {
    const initialStatusResponse = await fetch(`${server.baseUrl}/api/v1/remote/status`);
    const initialStatusPayload = (await initialStatusResponse.json()) as {
      ok: true;
      data: { enabled: boolean; passwordConfigured: boolean; requestedPort: number };
    };

    assert.equal(initialStatusResponse.status, 200);
    assert.equal(initialStatusPayload.data.enabled, false);
    assert.equal(initialStatusPayload.data.passwordConfigured, false);
    assert.equal(initialStatusPayload.data.requestedPort, 3000);

    const enableResponse = await fetch(`${server.baseUrl}/api/v1/remote/enable`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: "remote-pass-123",
        port: 3000,
        autoStart: true,
      }),
    });
    const enablePayload = (await enableResponse.json()) as {
      ok: true;
      data: { enabled: boolean; passwordConfigured: boolean; requestedPort: number; port: number };
    };

    assert.equal(enableResponse.status, 200);
    assert.equal(enablePayload.data.enabled, true);
    assert.equal(enablePayload.data.passwordConfigured, true);
    assert.equal(enablePayload.data.requestedPort, 3000);
    assert.notEqual(enablePayload.data.port, 3000);
    assert.equal(server.remoteStatus().enabled, true);

    const remoteBaseUrl = `http://127.0.0.1:${enablePayload.data.port}`;

    const deniedResponse = await fetch(`${remoteBaseUrl}/api/v1/health`, {
      headers: {
        "x-shulingge-test-remote": "1",
      },
    });
    const deniedPayload = (await deniedResponse.json()) as {
      ok: false;
      error: { code: string };
    };

    assert.equal(deniedResponse.status, 401);
    assert.equal(deniedPayload.error.code, "REMOTE_AUTH_REQUIRED");

    const allowedResponse = await fetch(`${remoteBaseUrl}/api/v1/health`, {
      headers: {
        "x-shulingge-test-remote": "1",
        "x-shulingge-remote-password": "remote-pass-123",
      },
    });
    const allowedPayload = (await allowedResponse.json()) as {
      ok: true;
      data: { status: string };
    };

    assert.equal(allowedResponse.status, 200);
    assert.equal(allowedPayload.data.status, "ok");

    const localPasswordResetResponse = await fetch(`${server.baseUrl}/api/v1/remote/password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: "new-remote-pass-456",
      }),
    });
    assert.equal(localPasswordResetResponse.status, 200);

    const remotePasswordResetResponse = await fetch(`${remoteBaseUrl}/api/v1/remote/password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shulingge-test-remote": "1",
        "x-shulingge-remote-password": "new-remote-pass-456",
      },
      body: JSON.stringify({
        password: "blocked-remote-pass",
      }),
    });
    const remotePasswordResetPayload = (await remotePasswordResetResponse.json()) as {
      ok: false;
      error: { code: string };
    };

    assert.equal(remotePasswordResetResponse.status, 403);
    assert.equal(remotePasswordResetPayload.error.code, "REMOTE_PASSWORD_LOCAL_ONLY");

    const mobileResponse = await fetch(`${server.baseUrl}/m`);
    const mobileHtml = await mobileResponse.text();
    const communityTemplatesResponse = await fetch(`${server.baseUrl}/api/v1/templates/community`);
    const communityTemplatesPayload = (await communityTemplatesResponse.json()) as {
      ok: true;
      data: { templates: Array<{ id: string }> };
    };
    assert.equal(mobileResponse.status, 200);
    assert.equal(mobileResponse.headers.get("content-type")?.includes("text/html"), true);
    assert.equal(mobileHtml.includes("书灵阁"), true);
    assert.equal(mobileHtml.includes("运行 9 Agent"), true);
    assert.equal(mobileHtml.includes("一致性检查"), true);
    assert.equal(mobileHtml.includes("刷新通知"), true);
    assert.equal(mobileHtml.includes("回滚最近快照"), true);
    assert.equal(communityTemplatesResponse.status, 200);
    assert.equal(
      communityTemplatesPayload.data.templates.some((item) => item.id === "web-serial-launch"),
      true,
    );

    const disableResponse = await fetch(`${server.baseUrl}/api/v1/remote/disable`, {
      method: "POST",
    });
    const disablePayload = (await disableResponse.json()) as {
      ok: true;
      data: { enabled: boolean };
    };
    assert.equal(disableResponse.status, 200);
    assert.equal(disablePayload.data.enabled, false);
  } finally {
    await server.close();
    occupiedServer.close();
    await once(occupiedServer, "close");
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("editor save keeps manuscripts pure and externalizes annotations plus locks", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    const chapterContent = "第一段写在走廊。\n\n第二段仍然只写正文。";
    const saveResponse = await fetch(`${server.baseUrl}/api/v1/editor/chapters/chapter-001/save`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        content: chapterContent,
      }),
    });

    const annotationsResponse = await fetch(
      `${server.baseUrl}/api/v1/editor/chapters/chapter-001/annotations`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "demo-series",
          novelId: "main",
          annotations: [
            {
              id: "anno-001",
              range: { start: 0, end: 6 },
              text: "这里埋一个伏笔",
              convertibleTo: ["foreshadowing", "chapter-todo"],
            },
          ],
        }),
      },
    );

    const locksResponse = await fetch(`${server.baseUrl}/api/v1/editor/chapters/chapter-001/locks`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        locks: [
          {
            id: "lock-001",
            scope: "paragraph",
            level: "full",
            range: { start: 0, end: 6 },
          },
        ],
      }),
    });

    const chapterResponse = await fetch(
      `${server.baseUrl}/api/v1/editor/chapters/chapter-001?projectId=demo-series&novelId=main`,
    );

    const savePayload = (await saveResponse.json()) as {
      ok: true;
      data: { content: string; metadata: { annotationsRef?: string } };
    };
    const annotationsPayload = (await annotationsResponse.json()) as {
      ok: true;
      data: { annotations: Array<{ id: string }> };
    };
    const locksPayload = (await locksResponse.json()) as {
      ok: true;
      data: { locks: Array<{ id: string }> };
    };
    const chapterPayload = (await chapterResponse.json()) as {
      ok: true;
      data: {
        content: string;
        metadata: { locks: Array<{ id: string }>; annotationsRef?: string; wordCount: number };
        annotations: Array<{ id: string }>;
      };
    };

    const manuscript = await readManuscriptFile(
      vaultRoot,
      "projects/demo-series/novels/main/manuscripts/chapter-001.md",
    );
    const annotationsFile = await readJsonFile<Array<{ id: string }>>(
      vaultRoot,
      "projects/demo-series/novels/main/annotations/chapter-001.json",
    );
    const metadataFile = await readJsonFile<{ locks: Array<{ id: string }>; annotationsRef?: string }>(
      vaultRoot,
      "projects/demo-series/novels/main/metadata/chapters/chapter-001.json",
    );

    assert.equal(saveResponse.status, 200);
    assert.equal(annotationsResponse.status, 200);
    assert.equal(locksResponse.status, 200);
    assert.equal(chapterResponse.status, 200);
    assert.equal(savePayload.data.content, chapterContent);
    assert.equal(chapterPayload.data.content, chapterContent);
    assert.equal(chapterPayload.data.metadata.wordCount > 0, true);
    assert.equal(chapterPayload.data.annotations[0]?.id, "anno-001");
    assert.equal(chapterPayload.data.metadata.locks[0]?.id, "lock-001");
    assert.equal(annotationsPayload.data.annotations[0]?.id, "anno-001");
    assert.equal(locksPayload.data.locks[0]?.id, "lock-001");
    assert.equal(manuscript, chapterContent);
    assert.equal(manuscript.includes("annotationsRef"), false);
    assert.equal(manuscript.includes("---"), false);
    assert.equal(annotationsFile[0]?.id, "anno-001");
    assert.equal(metadataFile.locks[0]?.id, "lock-001");
    assert.match(
      metadataFile.annotationsRef ?? "",
      /projects\/demo-series\/novels\/main\/annotations\/chapter-001\.json$/,
    );
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("project tree routes list and create novels and chapters", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    const projectsResponse = await fetch(`${server.baseUrl}/api/v1/projects`);
    const novelsResponse = await fetch(`${server.baseUrl}/api/v1/projects/demo-series/novels`);
    const chaptersResponse = await fetch(`${server.baseUrl}/api/v1/projects/demo-series/novels/main/chapters`);
    const createChapterResponse = await fetch(`${server.baseUrl}/api/v1/projects/demo-series/novels/main/chapters`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "新章节" }),
    });
    const createNovelResponse = await fetch(`${server.baseUrl}/api/v1/projects/demo-series/novels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "番外卷" }),
    });

    const projectsPayload = (await projectsResponse.json()) as {
      ok: true;
      data: { projects: Array<{ projectId: string; title: string }> };
    };
    const novelsPayload = (await novelsResponse.json()) as {
      ok: true;
      data: { novels: Array<{ novelId: string; title: string }> };
    };
    const chaptersPayload = (await chaptersResponse.json()) as {
      ok: true;
      data: { chapters: Array<{ chapterId: string; title: string }> };
    };
    const createChapterPayload = (await createChapterResponse.json()) as {
      ok: true;
      data: { chapterId: string; title: string };
    };
    const createNovelPayload = (await createNovelResponse.json()) as {
      ok: true;
      data: { novelId: string; title: string };
    };

    const createdManuscript = await readManuscriptFile(
      vaultRoot,
      `projects/demo-series/novels/main/manuscripts/${createChapterPayload.data.chapterId}.md`,
    );
    const createdMetadata = await readJsonFile<{ title: string }>(
      vaultRoot,
      `projects/demo-series/novels/main/metadata/chapters/${createChapterPayload.data.chapterId}.json`,
    );
    const createdNovel = await readJsonFile<{ title: string; name: string }>(
      vaultRoot,
      `projects/demo-series/novels/${createNovelPayload.data.novelId}/novel.json`,
    );

    assert.equal(projectsResponse.status, 200);
    assert.equal(projectsPayload.data.projects[0]?.projectId, "demo-series");
    assert.equal(projectsPayload.data.projects[0]?.title, "演示系列");
    assert.equal(novelsResponse.status, 200);
    assert.equal(novelsPayload.data.novels[0]?.novelId, "main");
    assert.equal(novelsPayload.data.novels[0]?.title, "主线");
    assert.equal(chaptersResponse.status, 200);
    assert.equal(chaptersPayload.data.chapters[0]?.chapterId, "chapter-001");
    assert.equal(createChapterResponse.status, 200);
    assert.equal(createChapterPayload.data.chapterId, "chapter-002");
    assert.equal(createChapterPayload.data.title, "新章节");
    assert.equal(createdManuscript, "");
    assert.equal(createdMetadata.title, "新章节");
    assert.equal(createNovelResponse.status, 200);
    assert.equal(createNovelPayload.data.novelId, "novel");
    assert.equal(createNovelPayload.data.title, "番外卷");
    assert.equal(createdNovel.title, "番外卷");
    assert.equal(createdNovel.name, "番外卷");
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("project create route initializes project and default novel skeleton", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "shulingge-empty-vault-"));
  await initializeVault({ rootPath: vaultRoot });
  const server = await startServer({ vaultRoot });

  try {
    const emptyProjectsResponse = await fetch(`${server.baseUrl}/api/v1/projects`);
    const createProjectResponse = await fetch(`${server.baseUrl}/api/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "新书" }),
    });
    const createdPayload = (await createProjectResponse.json()) as {
      ok: true;
      data: { projectId: string; title: string; defaultNovelId: string };
    };
    const projectsAfterCreateResponse = await fetch(`${server.baseUrl}/api/v1/projects`);
    const chaptersResponse = await fetch(
      `${server.baseUrl}/api/v1/projects/${createdPayload.data.projectId}/novels/main/chapters`,
    );

    const emptyProjectsPayload = (await emptyProjectsResponse.json()) as {
      ok: true;
      data: { projects: Array<{ projectId: string }> };
    };
    const projectsAfterCreatePayload = (await projectsAfterCreateResponse.json()) as {
      ok: true;
      data: { projects: Array<{ projectId: string; title: string }> };
    };
    const chaptersPayload = (await chaptersResponse.json()) as {
      ok: true;
      data: { chapters: Array<{ chapterId: string }> };
    };
    const projectJson = await readJsonFile<{ title: string; defaultNovelId: string }>(
      vaultRoot,
      `projects/${createdPayload.data.projectId}/project.json`,
    );
    const novelJson = await readJsonFile<{ title: string }>(
      vaultRoot,
      `projects/${createdPayload.data.projectId}/novels/main/novel.json`,
    );

    assert.equal(emptyProjectsResponse.status, 200);
    assert.deepEqual(emptyProjectsPayload.data.projects, []);
    assert.equal(createProjectResponse.status, 200);
    assert.equal(createdPayload.data.title, "新书");
    assert.equal(createdPayload.data.defaultNovelId, "main");
    assert.equal(projectJson.title, "新书");
    assert.equal(projectJson.defaultNovelId, "main");
    assert.equal(novelJson.title, "未分卷");
    assert.equal(projectsAfterCreateResponse.status, 200);
    assert.equal(projectsAfterCreatePayload.data.projects[0]?.title, "新书");
    assert.equal(chaptersResponse.status, 200);
    assert.deepEqual(chaptersPayload.data.chapters, []);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("project create route requires selected vault", async () => {
  const server = await startServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "新书" }),
    });
    const payload = (await response.json()) as { ok: false; error: { code: string } };

    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "SERVER_VAULT_NOT_SELECTED");
  } finally {
    await server.close();
  }
});

test("editor rejects frontmatter writes to enforce SEC-14", async () => {
  const vaultRoot = await createFixtureVault();
  const server = await startServer({ vaultRoot });

  try {
    const response = await fetch(`${server.baseUrl}/api/v1/editor/chapters/chapter-001/save`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "demo-series",
        novelId: "main",
        content: "---\ntitle: metadata leak\n---\n这是违规正文。",
      }),
    });

    const payload = (await response.json()) as {
      ok: false;
      error: { code: string; message: string };
    };

    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "EDITOR_INVALID_MANUSCRIPT");
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
