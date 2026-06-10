import assert from "node:assert/strict";
import test from "node:test";

import {
  chapterSchema,
  characterSchema,
  collaborationSessionSchema,
  contextResultSchema,
  err,
  isErr,
  isOk,
  modelConfigSchema,
  ok,
  pluginManifestSchema,
  skillMarketEntrySchema,
  skillPermissionsSchema,
  vaultSchema,
} from "./index.js";

test("ok/err helpers return discriminated results", () => {
  const success = ok({ value: 1 });
  const failure = err({ code: "E_TEST", message: "failed" });

  assert.equal(isOk(success), true);
  assert.equal(isErr(success), false);
  assert.equal(isErr(failure), true);
  if (isErr(failure)) {
    assert.equal(failure.error.code, "E_TEST");
  }
});

test("core schemas accept representative data", () => {
  const vault = vaultSchema.parse({
    id: "vault-1",
    schemaVersion: 1,
    name: "Main Vault",
    rootPath: "D:/ShulingVault",
    version: "1.0.0",
    settingsPath: "settings/settings.json",
    indexPath: ".index/cache.sqlite",
    createdAt: "2026-06-08T00:00:00Z",
  });

  const chapter = chapterSchema.parse({
    id: "ch-001",
    schemaVersion: 1,
    novelId: "main-long",
    title: "初遇",
    order: 1,
    manuscriptPath: "manuscripts/chapter-001.md",
    status: "drafting",
    wordCount: 1200,
    involvedCharacters: ["kanae"],
    source: {
      lastWrittenBy: "writer-agent",
      lastRunId: "run-123",
    },
    locks: [],
    annotationsRef: "annotations/ch-001.json",
    finalizedAt: null,
  });

  const modelConfig = modelConfigSchema.parse({
    id: "model-1",
    schemaVersion: 1,
    provider: "openai-compatible",
    model: "gpt-4.1-mini",
    keyRef: "provider:openai:default",
    stream: true,
    jsonMode: true,
  });

  const contextResult = contextResultSchema.parse({
    sources: [
      {
        path: "outline/ch-001.md",
        reason: "auto",
        tokens: 120,
      },
    ],
    totalTokens: 120,
    truncated: false,
  });

  const permissions = skillPermissionsSchema.parse({
    readProject: true,
    writeProject: false,
    callAI: false,
    network: false,
    runScript: false,
    runShell: false,
    accessOutsideFiles: false,
    readApiKey: false,
    modifyGlobalRulesOrSkills: false,
  });

  const character = characterSchema.parse({
    id: "kanae",
    schemaVersion: 1,
    name: "Kanae",
    links: [],
    voice: {
      typicalLines: ["Stay calm."],
      forbiddenLines: ["Cruel laughter."],
      honorifics: {
        shinobu: "Shinobu",
      },
      bySituation: {
        battle: ["Hold the line."],
      },
      byEmotion: {
        gentle: ["Take a breath."],
      },
      byRelationStage: {
        close: ["I know what you mean."],
      },
    },
    forbiddenWrites: [],
  });

  assert.equal(vault.name, "Main Vault");
  assert.equal(chapter.status, "drafting");
  assert.equal(modelConfig.keyRef, "provider:openai:default");
  assert.equal(contextResult.sources[0]?.reason, "auto");
  assert.equal(permissions.readApiKey, false);
  assert.equal(character.voice.byEmotion?.gentle?.[0], "Take a breath.");
});

test("skill permissions reject API key access", () => {
  const parsed = skillPermissionsSchema.safeParse({
    readProject: true,
    writeProject: false,
    callAI: false,
    network: false,
    runScript: false,
    runShell: false,
    accessOutsideFiles: false,
    readApiKey: true,
    modifyGlobalRulesOrSkills: false,
  });

  assert.equal(parsed.success, false);
});

test("plugin and collaboration schemas accept representative data", () => {
  const plugin = pluginManifestSchema.safeParse({
    id: "plugin-market",
    schemaVersion: 1,
    name: "Plugin Market",
    description: "Extends server hooks.",
    version: "2.0.0",
    entry: "plugins/market/index.js",
    apiVersion: "2.0",
    permissions: {
      readProject: true,
      writeProject: false,
      callAI: false,
      network: true,
      runScript: false,
      runShell: false,
      accessOutsideFiles: false,
      readApiKey: false,
      modifyGlobalRulesOrSkills: false,
    },
    hooks: ["server.start", "workflow.done"],
    enabled: true,
  });
  const session = collaborationSessionSchema.safeParse({
    id: "collab-001",
    schemaVersion: 1,
    projectId: "demo-series",
    novelId: "main",
    chapterId: "chapter-001",
    owner: "alice",
    participants: ["alice", "bob"],
    mode: "comment",
    status: "draft",
  });

  assert.equal(plugin.success, true);
  assert.equal(session.success, true);
});

test("skill market schema accepts representative data", () => {
  const parsed = skillMarketEntrySchema.safeParse({
    id: "market-entry-1",
    schemaVersion: 1,
    skillId: "tool-fetch",
    name: "工具抓取器",
    author: "alice",
    summary: "受限工具 Skill。",
    categories: ["tool"],
    tags: ["fetch", "sandbox"],
    averageRating: 4.5,
    ratingCount: 2,
    reports: [
      {
        reporter: "bob",
        reason: "needs review",
        createdAt: "2026-06-09T00:00:00Z",
      },
    ],
    certifiedAuthor: true,
    status: "listed",
  });

  assert.equal(parsed.success, true);
});
