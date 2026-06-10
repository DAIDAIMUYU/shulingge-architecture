/**
 * T22：黄金路径集成测试 —— 可真实写一章
 *
 * 端到端演示「书灵阁 MVP 可真实写一章」全链路：
 *   初始化 Vault → 建项目 → 模型配置（不含明文 Key）→ 写正文 → 快照 →
 *   批注外置 → 角色卡 → 世界书 → 全文检索 → 定稿锁定 → 快照回滚
 *
 * 不依赖真实 AI 调用；所有 provider 出站请求由 mock fetch 拦截。
 */
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CredentialService, InMemoryCredentialStore } from "@shulingge/security";
import { CURRENT_SCHEMA_VERSION, type ProjectSeries } from "@shulingge/shared";
import {
  initializeProject,
  initializeVault,
  readJsonFile,
  readManuscriptFile,
  writeManuscriptFile,
} from "@shulingge/vault-core";

import { startServer } from "./index.js";

// ─── fixture setup ────────────────────────────────────────────────────────────

async function createBlankVault(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "gp-vault-"));
  await initializeVault({ rootPath: root });
  return root;
}

async function createProjectVault(): Promise<{ vaultRoot: string; series: ProjectSeries }> {
  const vaultRoot = await createBlankVault();

  const series: ProjectSeries = {
    id: "sakura-series",
    name: "樱花季",
    type: "original",
    defaultNovelId: "main",
    sharedPath: "shared",
    readPolicyPath: "shared/read-policy.json",
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  await initializeProject(vaultRoot, series, {
    id: "main",
    name: "主线",
    branchType: "main",
  });

  // Seed chapter content
  await writeManuscriptFile(
    vaultRoot,
    "projects/sakura-series/novels/main/manuscripts/ch-001.md",
    "月光落在走廊的尽头，她停下脚步，握紧了手中的信封。",
  );

  return { vaultRoot, series };
}

function mockFetch(): typeof fetch {
  return async (_input, _init) =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "mock ai response" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
}

// ─── golden path ──────────────────────────────────────────────────────────────

test("可真实写一章：Vault初始化 → 模型配置 → 正文读写 → 快照 → 知识库 → 检索 → 定稿 → 回滚", async () => {
  const { vaultRoot } = await createProjectVault();
  const credentialService = new CredentialService(new InMemoryCredentialStore());
  const server = await startServer({
    vaultRoot,
    credentialService,
    fetchImpl: mockFetch(),
    providerEndpoints: {
      "openai-compatible": {
        baseUrl: "https://mock.local/v1",
        apiPath: "/chat/completions",
      },
    },
  });

  try {
    // ── Step 1: 验证 Vault 已就绪 ────────────────────────────────────────────
    const healthResp = await fetch(`${server.baseUrl}/api/v1/health`);
    const health = (await healthResp.json()) as { ok: true; data: { status: string; vaultSelected: boolean } };
    assert.equal(health.ok, true);
    assert.equal(health.data.status, "ok");
    assert.equal(health.data.vaultSelected, true, "Vault should be pre-selected by startServer option");

    // ── Step 2: 模型配置（Key 只进 CredentialService，不进 Vault）────────────
    const createModelResp = await fetch(`${server.baseUrl}/api/v1/models`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "writer-main",
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        jsonMode: false,
      }),
    });
    assert.equal(createModelResp.status, 200);

    const storeKeyResp = await fetch(`${server.baseUrl}/api/v1/models/writer-main/key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "sk-goldenpath-TestKey12345678" }),
    });
    assert.equal(storeKeyResp.status, 200);
    const keyPayload = (await storeKeyResp.json()) as { ok: true; data: { hasKey: boolean } };
    assert.equal(keyPayload.data.hasKey, true);

    // Model list must NOT contain raw apiKey
    const listModelsResp = await fetch(`${server.baseUrl}/api/v1/models`);
    const listModelsText = await listModelsResp.text();
    assert.equal(listModelsText.includes("sk-goldenpath"), false, "apiKey leaked in model list");

    // ── Step 3: 读取初始正文 ─────────────────────────────────────────────────
    const loadChapterResp = await fetch(
      `${server.baseUrl}/api/v1/editor/chapters/ch-001?projectId=sakura-series&novelId=main`,
    );
    const loadPayload = (await loadChapterResp.json()) as {
      ok: true;
      data: { content: string };
    };
    assert.equal(loadChapterResp.status, 200);
    assert.equal(
      loadPayload.data.content,
      "月光落在走廊的尽头，她停下脚步，握紧了手中的信封。",
    );

    // ── Step 4: 保存修改正文（创建版本快照）──────────────────────────────────
    const v1Content = "月光落在走廊的尽头，她停下脚步，握紧了手中的信封。\n\n风从窗缝吹进来，信纸轻轻颤动。";
    const saveResp = await fetch(`${server.baseUrl}/api/v1/editor/chapters/ch-001/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "sakura-series",
        novelId: "main",
        content: v1Content,
      }),
    });
    assert.equal(saveResp.status, 200);

    // 快照文件必须生成
    const snapshotDir = path.join(vaultRoot, "projects/sakura-series/novels/main/snapshots");
    const snapshotFiles = await readdir(snapshotDir);
    assert.ok(snapshotFiles.some((f) => f.endsWith(".md")), "snapshot .md file should be created");

    // diff 文件必须生成
    const diffDir = path.join(vaultRoot, "projects/sakura-series/novels/main/diffs");
    const diffFiles = await readdir(diffDir);
    assert.ok(diffFiles.some((f) => f.endsWith(".json")), "diff .json file should be created");

    // ── Step 5: 保存版本二（用于回滚测试）─────────────────────────────────────
    const v2Content = "第二版正文：月光依旧，她已转身离去。";
    await fetch(`${server.baseUrl}/api/v1/editor/chapters/ch-001/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "sakura-series",
        novelId: "main",
        content: v2Content,
      }),
    });

    // ── Step 6a: 从快照回滚（在定稿前执行，避免 finalize 额外快照干扰）────
    const earlyTimelineResp = await fetch(
      `${server.baseUrl}/api/v1/version/chapters/ch-001/timeline?projectId=sakura-series&novelId=main`,
    );
    const earlyTimeline = (await earlyTimelineResp.json()) as {
      ok: true;
      data: { snapshots: Array<{ path: string }> };
    };
    // After 2 saves: snapshots ordered oldest-first
    //   [0] = pre-v1 save (initial content)
    //   [1] = pre-v2 save (v1Content)  ← at(-1) when only 2 snapshots exist
    assert.ok(earlyTimeline.data.snapshots.length >= 2, "at least 2 snapshots after 2 saves");
    const rollbackSnapshotPath = earlyTimeline.data.snapshots.at(-1)?.path;
    assert.ok(rollbackSnapshotPath, "snapshot path for rollback should be available");

    const rollbackResp = await fetch(
      `${server.baseUrl}/api/v1/version/chapters/ch-001/rollback`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "sakura-series",
          novelId: "main",
          snapshotPath: rollbackSnapshotPath,
        }),
      },
    );
    const rollbackPayload = (await rollbackResp.json()) as { ok: true; data: { content: string } };
    assert.equal(rollbackResp.status, 200);
    assert.equal(rollbackPayload.data.content, v1Content, "rollback should restore v1 content");

    const restoredManuscript = await readManuscriptFile(
      vaultRoot,
      "projects/sakura-series/novels/main/manuscripts/ch-001.md",
    );
    assert.equal(restoredManuscript, v1Content, "disk must reflect rollback");

    // ── Step 6b: 批注外置存储（正文不含批注元数据）──────────────────────────
    const annotateResp = await fetch(
      `${server.baseUrl}/api/v1/editor/chapters/ch-001/annotations`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "sakura-series",
          novelId: "main",
          annotations: [{ id: "ann-001", range: { start: 0, end: 5 }, text: "开篇伏笔" }],
        }),
      },
    );
    assert.equal(annotateResp.status, 200);

    // 正文文件内不含批注 key
    const manuscript = await readManuscriptFile(
      vaultRoot,
      "projects/sakura-series/novels/main/manuscripts/ch-001.md",
    );
    assert.equal(manuscript.includes("annotationsRef"), false, "SEC-14: manuscript must be pure");
    assert.equal(manuscript.includes("---"), false, "SEC-14: no frontmatter in manuscript");

    // ── Step 7: 角色卡 ────────────────────────────────────────────────────────
    const createCharResp = await fetch(`${server.baseUrl}/api/v1/knowledge/characters`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "sakura-series",
        id: "yuki",
        name: "雪",
        links: ["[[月光走廊]]"],
        voice: {
          typicalLines: ["静静等待。"],
          forbiddenLines: [],
          honorifics: {},
        },
        knowledgeScopeRef: "states/knowledge.json",
        currentStateRef: "states/yuki.state.json",
        forbiddenWrites: [],
        relatedWorldbook: ["wb-corridor"],
      }),
    });
    assert.equal(createCharResp.status, 200);
    const charPayload = (await createCharResp.json()) as { ok: true; data: { character: { id: string } } };
    assert.equal(charPayload.data.character.id, "yuki");

    // ── Step 8: 世界书条目 ────────────────────────────────────────────────────
    const createWbResp = await fetch(`${server.baseUrl}/api/v1/knowledge/worldbook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "sakura-series",
        id: "wb-corridor",
        title: "月光走廊",
        sections: { fact: "走廊是情节转折的核心空间。" },
        trigger: {
          keywords: ["走廊", "月光"],
          characters: ["yuki"],
          places: ["走廊"],
          semantic: false,
        },
        relatedNovels: ["main"],
        appliesToAgents: ["writer-agent"],
      }),
    });
    assert.equal(createWbResp.status, 200);

    // ── Step 9: 全文索引 & 检索 ──────────────────────────────────────────────
    const rebuildResp = await fetch(`${server.baseUrl}/api/v1/index/rebuild`, { method: "POST" });
    const rebuildPayload = (await rebuildResp.json()) as { ok: true; data: { indexedCount: number } };
    assert.equal(rebuildResp.status, 200);
    assert.ok(rebuildPayload.data.indexedCount >= 2, "at least manuscript + worldbook should be indexed");

    const searchResp = await fetch(
      `${server.baseUrl}/api/v1/search?q=${encodeURIComponent("走廊")}&project=sakura-series`,
    );
    const searchPayload = (await searchResp.json()) as {
      ok: true;
      data: { results: Array<{ type: string }> };
    };
    assert.equal(searchResp.status, 200);
    assert.ok(
      searchPayload.data.results.some((r) => r.type === "worldbook" || r.type === "manuscript"),
      "search should find worldbook or manuscript hit for 走廊",
    );

    // ── Step 10: 定稿（锁定章节 + 创建 Git tag）──────────────────────────────
    const finalizeResp = await fetch(
      `${server.baseUrl}/api/v1/version/chapters/ch-001/finalize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "sakura-series", novelId: "main", actor: "author" }),
      },
    );
    const finalizePayload = (await finalizeResp.json()) as {
      ok: true;
      data: { gitTag: string; metadata: { status: string } };
    };
    assert.equal(finalizeResp.status, 200);
    assert.equal(finalizePayload.data.metadata.status, "finalized");
    assert.ok(finalizePayload.data.gitTag, "git tag should be set on finalize");

    // ── Step 11: 定稿后保存被阻断（SEC-14 / 锁定规则）───────────────────────
    const blockedResp = await fetch(`${server.baseUrl}/api/v1/editor/chapters/ch-001/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "sakura-series",
        novelId: "main",
        content: "定稿后不允许直接修改。",
      }),
    });
    assert.equal(blockedResp.status, 409, "finalized chapter must block direct save");

    // ── Step 12: 解锁 ─────────────────────────────────────────────────────────
    const unlockResp = await fetch(
      `${server.baseUrl}/api/v1/version/chapters/ch-001/unlock`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "sakura-series", novelId: "main" }),
      },
    );
    assert.equal(unlockResp.status, 200);
    const unlockPayload = (await unlockResp.json()) as {
      ok: true;
      data: { metadata: { status: string } };
    };
    assert.equal(unlockPayload.data.metadata.status, "drafting");

    // ── Step 13: 知识图谱验证（在定稿+解锁之后，确认图谱完整）───────────────
    const graphResp = await fetch(
      `${server.baseUrl}/api/v1/knowledge/graph?projectId=sakura-series&novelId=main`,
    );
    const graphPayload = (await graphResp.json()) as {
      ok: true;
      data: { nodes: Array<{ id: string }>; edges: Array<{ from: string; to: string; type: string }> };
    };
    assert.equal(graphResp.status, 200);
    assert.ok(
      graphPayload.data.nodes.some((n) => n.id === "character:yuki"),
      "character:yuki should appear in knowledge graph",
    );
    assert.ok(
      graphPayload.data.edges.some(
        (e) => e.from === "character:yuki" && e.to === "worldbook:wb-corridor",
      ),
      "yuki → wb-corridor edge should exist in knowledge graph",
    );

    // ── Step 15: 安全最终验证 — 无 API Key 暴露 ─────────────────────────────
    // Reading the saved model config from disk must not reveal the raw api key
    const savedModel = await readJsonFile<{ keyRef?: string; apiKey?: string }>(
      vaultRoot,
      "settings/models/writer-main.json",
    );
    assert.equal("apiKey" in savedModel, false, "savedModel must not contain apiKey field");
    assert.ok(savedModel.keyRef, "savedModel must have keyRef");

    // The stored credential must be accessible from the credential service
    const stored = await credentialService.getApiKey(savedModel.keyRef!);
    assert.equal(stored, "sk-goldenpath-TestKey12345678");
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
