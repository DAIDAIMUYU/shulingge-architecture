import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CURRENT_SCHEMA_VERSION, type ProjectSeries } from "@shulingge/shared";
import {
  initializeProject,
  initializeVault,
  removePathPermanently,
  writeJsonFile,
  writeManuscriptFile,
} from "@shulingge/vault-core";

import { getIndexedDocumentCount, rebuildIndex, searchIndex } from "./index.js";

async function createFixtureVault() {
  const root = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), "shulingge-indexer-")),
  );

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
    id: "ch-001",
    novelId: "main",
    title: "初遇",
    order: 1,
    manuscriptPath: "manuscripts/chapter-001.md",
    status: "drafting",
    wordCount: 20,
    involvedCharacters: ["kanae"],
    locks: [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

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

  await writeJsonFile(root, "projects/demo-series/shared/characters/kanae.json", {
    id: "kanae",
    name: "蝴蝶香奈惠",
    links: ["[[蝶屋]]"],
    voice: {
      typicalLines: [],
      forbiddenLines: [],
      honorifics: {},
    },
    forbiddenWrites: [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  await writeJsonFile(root, "projects/demo-series/novels/main/states/knowledge/know-secret-wound.json", {
    id: "know-secret-wound",
    content: "Kanae knows the protagonist is injured.",
    knownBy: ["kanae"],
    unknownBy: ["shinobu"],
    sourceChapter: "chapter-001",
    spreadMethod: "observed",
    canSpread: false,
    secret: true,
    affectsBehavior: true,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  return root;
}

test("rebuildIndex creates sqlite cache from vault content", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    const result = await rebuildIndex(vaultRoot);
    const count = await getIndexedDocumentCount(vaultRoot);

    assert.ok(result.indexedCount >= 4);
    assert.equal(count, result.indexedCount);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("searchIndex finds manuscripts and filtered worldbook entries", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    await rebuildIndex(vaultRoot);

    const fullTextResults = await searchIndex(vaultRoot, {
      text: "蝶屋",
      projectId: "demo-series",
    });
    const worldbookResults = await searchIndex(vaultRoot, {
      text: "蝶屋",
      type: "worldbook",
      tags: ["kanae"],
    });

    assert.ok(fullTextResults.some((item) => item.type === "manuscript"));
    assert.ok(worldbookResults.every((item) => item.type === "worldbook"));
    assert.ok(worldbookResults.some((item) => item.title === "蝶屋"));
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("searchIndex indexes novel knowledge items with type and tags", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    await rebuildIndex(vaultRoot);

    const knowledgeResults = await searchIndex(vaultRoot, {
      text: "injured",
      projectId: "demo-series",
      novelId: "main",
      type: "knowledge-item",
      tags: ["kanae", "secret"],
    });

    assert.equal(knowledgeResults.length >= 1, true);
    assert.equal(knowledgeResults[0]?.type, "knowledge-item");
    assert.equal(knowledgeResults[0]?.path.includes("states/knowledge/know-secret-wound.json"), true);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("searchIndex supports stable local semantic retrieval", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    await rebuildIndex(vaultRoot);

    const semanticResults = await searchIndex(vaultRoot, {
      text: "Kanae injury",
      projectId: "demo-series",
      novelId: "main",
      type: "knowledge-item",
      semantic: true,
      semanticProvider: "local",
    });

    assert.equal(semanticResults.length >= 1, true);
    assert.equal(semanticResults[0]?.type, "knowledge-item");
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("incremental rebuild reuses cache when vault files are unchanged", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    const first = await rebuildIndex(vaultRoot, { incremental: true });
    const second = await rebuildIndex(vaultRoot, { incremental: true });

    assert.equal(first.indexedCount >= 4, true);
    assert.equal(second.reused, true);
    assert.equal(second.indexedCount, first.indexedCount);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("index file can be deleted and rebuilt from vault truth data", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    const first = await rebuildIndex(vaultRoot);
    await removePathPermanently(vaultRoot, ".index/cache.sqlite");

    const second = await rebuildIndex(vaultRoot);
    const count = await getIndexedDocumentCount(vaultRoot);

    assert.equal(second.indexedCount, first.indexedCount);
    assert.equal(count, first.indexedCount);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
