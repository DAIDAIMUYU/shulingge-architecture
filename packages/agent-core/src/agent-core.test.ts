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

import { createDefaultAgentCatalog } from "./agents.js";
import { buildContext } from "./context-builder.js";

async function createFixtureVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "shulingge-agent-core-"));
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
    appliesToAgents: ["writer-agent"],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
  await writeJsonFile(root, "projects/demo-series/shared/characters/kanae.json", {
    id: "kanae",
    name: "Kanae",
    links: [],
    voice: {
      typicalLines: ["要温柔。"],
      forbiddenLines: ["暴走。"],
      honorifics: {},
    },
    forbiddenWrites: [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
  await writeJsonFile(root, "projects/demo-series/shared/relations/rel-kanae-shinobu.json", {
    id: "rel-kanae-shinobu",
    from: "kanae",
    to: "shinobu",
    type: "sisters",
    stage: "close",
    sourceChapters: ["chapter-001"],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
  await writeJsonFile(root, "projects/demo-series/shared/timeline/ev-first-meet.json", {
    id: "ev-first-meet",
    title: "First Meeting",
    line: "main",
    order: 1,
    boundChapters: ["chapter-001"],
    participants: ["kanae"],
    stateSnapshotRef: null,
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
  await writeJsonFile(root, "projects/demo-series/novels/main/summaries/chapter-000.json", {
    id: "summary-000",
    chapterId: "chapter-000",
    oneLine: "上一章摘要",
    short: "上一章短摘要",
    structured: "{}",
    stateChanges: [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  return root;
}

test("default agent catalog exposes nine active agents and keeps expert placeholders", () => {
  const catalog = createDefaultAgentCatalog();

  assert.equal(catalog.active.some((agent) => agent.id === "writer-agent"), true);
  assert.equal(catalog.active.some((agent) => agent.id === "rule-guard-agent"), true);
  assert.equal(catalog.active.some((agent) => agent.id === "voice-agent"), true);
  assert.equal(catalog.active.some((agent) => agent.id === "timeline-agent"), true);
  assert.equal(catalog.active.some((agent) => agent.id === "polish-agent"), true);
  assert.equal(catalog.active.some((agent) => agent.id === "summary-agent"), true);
  assert.equal(catalog.active.length, 9);
  assert.equal(catalog.reserved.length, 4);
  assert.equal(catalog.all.length, 13);
});

test("context builder selects manuscript, triggered worldbook, related characters, and summaries", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    const catalog = createDefaultAgentCatalog();
    const context = await buildContext(vaultRoot, catalog, {
      agentId: "writer-agent",
      chapterId: "chapter-001",
      projectId: "demo-series",
      novelId: "main",
      forceInclude: [],
      exclude: [],
      tokenBudget: 500,
    });

    assert.equal(context.agent.id, "writer-agent");
    assert.equal(context.sources.some((source) => source.path.endsWith("manuscripts/chapter-001.md")), true);
    assert.equal(context.sources.some((source) => source.path.includes("worldbook/wb-butterfly-mansion.json")), true);
    assert.equal(context.sources.some((source) => source.path.includes("characters/kanae.json")), true);
    assert.equal(context.sources.some((source) => source.path.includes("relations/rel-kanae-shinobu.json")), true);
    assert.equal(context.sources.some((source) => source.path.includes("timeline/ev-first-meet.json")), true);
    assert.equal(context.sources.some((source) => source.path.includes("states/knowledge/know-secret-wound.json")), true);
    assert.equal(context.sources.some((source) => source.path.includes("summaries/chapter-000.json")), true);
    assert.equal(context.content.includes("provider:"), false);
    assert.equal(context.totalTokens > 0, true);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("context builder respects forceInclude, exclude, and token budget truncation", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    const catalog = createDefaultAgentCatalog();
    await writeJsonFile(vaultRoot, "projects/demo-series/shared/worldbook/wb-extra.json", {
      id: "wb-extra",
      title: "额外世界书",
      sections: { fact: "额外资料" },
      trigger: {
        keywords: ["夜风"],
        characters: [],
        places: [],
        semantic: false,
      },
      relatedNovels: ["main"],
      appliesToAgents: ["writer-agent"],
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    const context = await buildContext(vaultRoot, catalog, {
      agentId: "writer-agent",
      chapterId: "chapter-001",
      projectId: "demo-series",
      novelId: "main",
      forceInclude: ["projects/demo-series/shared/worldbook/wb-extra.json"],
      exclude: ["projects/demo-series/shared/worldbook/wb-butterfly-mansion.json"],
      tokenBudget: 5,
    });

    assert.equal(context.sources.some((source) => source.path.includes("wb-extra.json")), true);
    assert.equal(context.sources.some((source) => source.path.includes("wb-butterfly-mansion.json")), false);
    assert.equal(context.truncated, true);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
