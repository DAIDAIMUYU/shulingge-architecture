import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CURRENT_SCHEMA_VERSION,
  type ProjectSeries,
} from "@shulingge/shared";

import {
  deletePath,
  initializeProject,
  initializeVault,
  readJsonFile,
  readManuscriptFile,
  resolveSafePath,
  tryResolveSafePath,
  VAULT_ERRORS,
  writeJsonFile,
  writeManuscriptFile,
  createSnapshot,
} from "./index.js";

async function createVaultRoot(): Promise<string> {
  return await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), "shulingge-vault-core-")),
  );
}

test("SEC-10/11: resolveSafePath accepts vault paths and rejects escapes", async () => {
  const vaultRoot = await createVaultRoot();
  const safePath = resolveSafePath(vaultRoot, "projects/demo/series.json");

  assert.equal(safePath, path.join(vaultRoot, "projects", "demo", "series.json"));

  const traversal = tryResolveSafePath(vaultRoot, "../outside.txt");
  assert.equal(traversal.ok, false);
  if (!traversal.ok) {
    assert.equal(traversal.error.code, VAULT_ERRORS.PATH_TRAVERSAL_DETECTED);
  }

  const absolute = tryResolveSafePath(vaultRoot, path.resolve(vaultRoot, "..", "outside.txt"));
  assert.equal(absolute.ok, false);
  if (!absolute.ok) {
    assert.equal(absolute.error.code, VAULT_ERRORS.ABSOLUTE_PATH_NOT_ALLOWED);
  }
});

test("initializeVault creates the frozen top-level vault layout", async () => {
  const vaultRoot = await createVaultRoot();
  const result = await initializeVault({ rootPath: vaultRoot });

  assert.equal(result.rootPath, vaultRoot);
  await stat(path.join(vaultRoot, "global", "rules"));
  await stat(path.join(vaultRoot, "trash"));
  await stat(path.join(vaultRoot, ".index", "cache.sqlite"));
});

test("initializeProject creates minimal project and novel structure from schema", async () => {
  const vaultRoot = await createVaultRoot();
  await initializeVault({ rootPath: vaultRoot });

  const series: ProjectSeries = {
    id: "demo-series",
    name: "Demo Series",
    type: "original",
    defaultNovelId: "main",
    sharedPath: "shared",
    readPolicyPath: "shared/read-policy.json",
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  await initializeProject(vaultRoot, series, {
    id: "main",
    name: "Main Novel",
    branchType: "main",
  });

  await stat(path.join(vaultRoot, "projects", "demo-series", "shared", "characters"));
  await stat(path.join(vaultRoot, "projects", "demo-series", "novels", "main", "manuscripts"));

  const storedSeries = await readJsonFile<ProjectSeries>(
    vaultRoot,
    "projects/demo-series/series.json",
  );
  assert.equal(storedSeries.id, "demo-series");
});

test("SEC-14: manuscript writer rejects frontmatter metadata", async () => {
  const vaultRoot = await createVaultRoot();
  await initializeVault({ rootPath: vaultRoot });

  await assert.rejects(
    () =>
      writeManuscriptFile(
        vaultRoot,
        "projects/demo/novels/main/manuscripts/chapter-001.md",
        "---\ntitle: forbidden\n---\n正文",
      ),
    /pure body text/i,
  );
});

test("manuscript and json files can be written and read inside the vault", async () => {
  const vaultRoot = await createVaultRoot();
  await initializeVault({ rootPath: vaultRoot });

  await writeJsonFile(vaultRoot, "settings/test.json", {
    schemaVersion: 1,
    enabled: true,
  });

  await writeManuscriptFile(
    vaultRoot,
    "projects/demo/novels/main/manuscripts/chapter-001.md",
    "第一段。\n\n第二段。",
  );

  const json = await readJsonFile<{ enabled: boolean }>(vaultRoot, "settings/test.json");
  const manuscript = await readManuscriptFile(
    vaultRoot,
    "projects/demo/novels/main/manuscripts/chapter-001.md",
  );

  assert.equal(json.enabled, true);
  assert.equal(manuscript, "第一段。\n\n第二段。");
});

test("snapshot copies files into the configured snapshot directory", async () => {
  const vaultRoot = await createVaultRoot();
  await initializeVault({ rootPath: vaultRoot });

  await writeManuscriptFile(
    vaultRoot,
    "projects/demo/novels/main/manuscripts/chapter-001.md",
    "快照前正文",
  );

  const result = await createSnapshot(vaultRoot, {
    sourcePath: "projects/demo/novels/main/manuscripts/chapter-001.md",
    snapshotDir: "projects/demo/novels/main/snapshots",
    label: "pre-ai",
  });

  const copied = await readFile(result.snapshotPath, "utf8");
  assert.equal(copied, "快照前正文");
});

test("SEC-13: deletePath falls back to vault trash when system recycle bin is unavailable", async () => {
  const vaultRoot = await createVaultRoot();
  await initializeVault({ rootPath: vaultRoot });

  await writeManuscriptFile(
    vaultRoot,
    "projects/demo/novels/main/manuscripts/chapter-001.md",
    "待删除正文",
  );

  const result = await deletePath(vaultRoot, {
    path: "projects/demo/novels/main/manuscripts/chapter-001.md",
    recycle: async () => {
      throw new Error("recycle unavailable");
    },
  });

  assert.equal(result.method, "vault-trash");
  assert.ok(result.trashPath);
  if (result.trashPath) {
    const restoredContent = await readFile(result.trashPath, "utf8");
    assert.equal(restoredContent, "待删除正文");
  }
});

test("deletePath reports system recycle bin success when adapter succeeds", async () => {
  const vaultRoot = await createVaultRoot();
  await initializeVault({ rootPath: vaultRoot });

  await writeManuscriptFile(
    vaultRoot,
    "projects/demo/novels/main/manuscripts/chapter-001.md",
    "待进入系统回收站",
  );

  let recycledPath = "";
  const result = await deletePath(vaultRoot, {
    path: "projects/demo/novels/main/manuscripts/chapter-001.md",
    recycle: async (candidatePath) => {
      recycledPath = candidatePath;
    },
  });

  assert.equal(result.method, "system-recycle-bin");
  assert.equal(recycledPath, path.join(vaultRoot, "projects", "demo", "novels", "main", "manuscripts", "chapter-001.md"));

  await access(recycledPath);
});
