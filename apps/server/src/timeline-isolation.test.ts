import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initializeProject, initializeVault } from "@shulingge/vault-core";
import { CURRENT_SCHEMA_VERSION, type ProjectSeries } from "@shulingge/shared";

import { startServer } from "./index.js";

async function createVault(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "shulingge-timeline-"));
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
  await initializeProject(root, series, { id: "main", name: "主线", branchType: "main" });
  return root;
}

async function saveChapter(baseUrl: string, chapterId: string, content: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/v1/editor/chapters/${chapterId}/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "demo-series", novelId: "main", content }),
  });
  assert.equal(response.status, 200, `save ${chapterId} should succeed`);
}

// 回归测试（A3）：同一 novel 下不同章节的快照共享 snapshots/ 目录，
// listChapterTimeline 必须按 chapterId 隔离，不得混入其它章节的快照/diff。
test("listChapterTimeline isolates snapshots and diffs by chapterId within a shared novel", async () => {
  const vaultRoot = await createVault();
  const server = await startServer({ vaultRoot });

  try {
    await saveChapter(server.baseUrl, "chapter-a", "A version one.");
    await saveChapter(server.baseUrl, "chapter-a", "A version two.");
    await saveChapter(server.baseUrl, "chapter-b", "B version one.");
    await saveChapter(server.baseUrl, "chapter-b", "B version two.");

    const response = await fetch(
      `${server.baseUrl}/api/v1/version/chapters/chapter-a/timeline?projectId=demo-series&novelId=main`,
    );
    const payload = (await response.json()) as {
      ok: true;
      data: {
        snapshots: Array<{ id: string; chapterId: string; path: string }>;
        diffs: Array<{ id: string; chapterId: string }>;
      };
    };

    assert.equal(response.status, 200);
    const { snapshots, diffs } = payload.data;

    assert.ok(snapshots.length >= 1, "chapter-a should expose at least one snapshot");
    assert.ok(
      snapshots.every((snapshot) => snapshot.chapterId === "chapter-a"),
      "every returned snapshot must belong to chapter-a",
    );
    assert.ok(
      snapshots.every((snapshot) => snapshot.id.startsWith("chapter-a-")),
      "snapshot ids must carry the chapter-a prefix (no chapter-b leakage)",
    );
    assert.ok(
      snapshots.every((snapshot) => snapshot.path.includes("/chapter-a-")),
      "snapshot paths must point at chapter-a files",
    );
    assert.ok(
      diffs.every((diff) => diff.chapterId === "chapter-a"),
      "every returned diff must belong to chapter-a",
    );
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
