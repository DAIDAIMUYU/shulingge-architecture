import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CURRENT_SCHEMA_VERSION, type Rule } from "@shulingge/shared";
import { initializeVault, readJsonFile } from "@shulingge/vault-core";

import { startServer } from "./index.js";

function skillManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "deaiify-zh",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: "去 AI 味中文",
    description: "降低中文 AI 写作腔。",
    version: "1.0.0",
    tags: ["polish"],
    languages: ["zh"],
    genres: ["*"],
    tasks: ["polish"],
    boundAgents: ["polish-agent"],
    readRequirements: [],
    ruleFragments: [],
    prompt: "降低 AI 腔，保留原意。",
    kind: "normal",
    allowAutoRun: true,
    allowWriteDraft: false,
    license: "MIT",
    compatibleVersions: ">=0.1.0",
    permissions: {
      readProject: true,
      writeProject: false,
      callAI: true,
      network: false,
      runScript: false,
      runShell: false,
      accessOutsideFiles: false,
      readApiKey: false,
      modifyGlobalRulesOrSkills: false,
    },
    ...overrides,
  };
}

async function createVault(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "shulingge-skills-"));
  await initializeVault({ rootPath: root });
  return root;
}

test("skill import registers a normal skill with permission summary (SEC-27)", async () => {
  const vaultRoot = await createVault();
  const server = await startServer({ vaultRoot });

  try {
    const response = await fetch(`${server.baseUrl}/api/v1/skills/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manifest: skillManifest() }),
    });
    const payload = (await response.json()) as {
      ok: true;
      data: {
        skill: {
          id: string;
          kind: string;
          executable: boolean;
          registeredOnly: boolean;
          permissionSummary: {
            readApiKey: boolean;
            grantedKeys: string[];
            requiresHighRiskConfirm: boolean;
          };
        };
      };
    };

    assert.equal(response.status, 200);
    assert.equal(payload.data.skill.kind, "normal");
    assert.equal(payload.data.skill.executable, true);
    assert.equal(payload.data.skill.registeredOnly, false);
    assert.equal(payload.data.skill.permissionSummary.readApiKey, false);
    assert.equal(payload.data.skill.permissionSummary.grantedKeys.includes("callAI"), true);
    assert.equal(payload.data.skill.permissionSummary.requiresHighRiskConfirm, false);

    const stored = await readJsonFile<{ skill: { id: string }; source: string }>(
      vaultRoot,
      "global/skills/deaiify-zh.json",
    );
    assert.equal(stored.skill.id, "deaiify-zh");
    assert.equal(stored.source, "local-import");
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("tool skill is registered-only and not executable at MVP", async () => {
  const vaultRoot = await createVault();
  const server = await startServer({ vaultRoot });

  try {
    const response = await fetch(`${server.baseUrl}/api/v1/skills/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manifest: skillManifest({
          id: "tool-fetch",
          kind: "tool",
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
        }),
      }),
    });
    const payload = (await response.json()) as {
      ok: true;
      data: {
        skill: {
          kind: string;
          executable: boolean;
          registeredOnly: boolean;
          permissionSummary: { requiresHighRiskConfirm: boolean; highRiskKeys: string[] };
        };
      };
    };

    assert.equal(response.status, 200);
    assert.equal(payload.data.skill.kind, "tool");
    assert.equal(payload.data.skill.executable, false);
    assert.equal(payload.data.skill.registeredOnly, true);
    assert.equal(payload.data.skill.permissionSummary.requiresHighRiskConfirm, true);
    assert.equal(payload.data.skill.permissionSummary.highRiskKeys.includes("network"), true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("V2 tool skill can execute through restricted sandbox route", async () => {
  const vaultRoot = await createVault();
  const server = await startServer({ vaultRoot });

  try {
    await fetch(`${server.baseUrl}/api/v1/skills/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manifest: skillManifest({
          id: "tool-fetch",
          kind: "tool",
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
        }),
      }),
    });

    const response = await fetch(`${server.baseUrl}/api/v1/skills/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        skillId: "tool-fetch",
        dryRun: false,
        args: { command: "search" },
      }),
    });
    const payload = (await response.json()) as {
      ok: true;
      data: {
        result: {
          skillId: string;
          executed: boolean;
          sandbox: string;
          summary: string;
          operations: string[];
          artifacts?: Array<{ name: string }>;
        };
      };
    };

    assert.equal(response.status, 200);
    assert.equal(payload.data.result.skillId, "tool-fetch");
    assert.equal(payload.data.result.executed, true);
    assert.equal(payload.data.result.sandbox, "v2-tool");
    assert.equal(payload.data.result.operations.includes("arg:command"), true);
    assert.equal(payload.data.result.artifacts?.[0]?.name, "tool-fetch-result.json");
    assert.equal(payload.data.result.summary.includes("isolated V2 sandbox subprocess"), true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("skill market routes support publish, rate, report, and moderate for V2", async () => {
  const vaultRoot = await createVault();
  const server = await startServer({ vaultRoot });

  try {
    const publishResponse = await fetch(`${server.baseUrl}/api/v1/skills/market`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        skillId: "tool-fetch",
        name: "工具抓取器",
        author: "alice",
        summary: "受限工具 Skill。",
        categories: ["tool"],
        tags: ["fetch", "sandbox"],
        certifiedAuthor: true,
      }),
    });
    const rateResponse = await fetch(`${server.baseUrl}/api/v1/skills/market/market-tool-fetch/rate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rater: "bob",
        score: 5,
        comment: "works well",
      }),
    });
    const reportResponse = await fetch(`${server.baseUrl}/api/v1/skills/market/market-tool-fetch/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reporter: "carol",
        reason: "needs moderation",
      }),
    });
    const moderateResponse = await fetch(`${server.baseUrl}/api/v1/skills/market/market-tool-fetch/moderate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "hidden",
        certifiedAuthor: true,
      }),
    });
    const listResponse = await fetch(`${server.baseUrl}/api/v1/skills/market?author=alice`);

    const publishPayload = (await publishResponse.json()) as {
      ok: true;
      data: { entry: { id: string; certifiedAuthor: boolean } };
    };
    const ratePayload = (await rateResponse.json()) as {
      ok: true;
      data: { entry: { averageRating: number; ratingCount: number } };
    };
    const reportPayload = (await reportResponse.json()) as {
      ok: true;
      data: { entry: { reports: Array<{ reporter: string }> } };
    };
    const moderatePayload = (await moderateResponse.json()) as {
      ok: true;
      data: { entry: { status: string } };
    };
    const listPayload = (await listResponse.json()) as {
      ok: true;
      data: { market: Array<{ id: string }> };
    };

    assert.equal(publishResponse.status, 200);
    assert.equal(publishPayload.data.entry.id, "market-tool-fetch");
    assert.equal(publishPayload.data.entry.certifiedAuthor, true);
    assert.equal(rateResponse.status, 200);
    assert.equal(ratePayload.data.entry.averageRating, 5);
    assert.equal(ratePayload.data.entry.ratingCount, 1);
    assert.equal(reportResponse.status, 200);
    assert.equal(reportPayload.data.entry.reports[0]?.reporter, "carol");
    assert.equal(moderateResponse.status, 200);
    assert.equal(moderatePayload.data.entry.status, "hidden");
    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.data.market.some((item) => item.id === "market-tool-fetch"), true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("plugin lifecycle and collaboration update routes work for V2", async () => {
  const vaultRoot = await createVault();
  const server = await startServer({ vaultRoot });

  try {
    const pluginRuntimeDir = path.join(vaultRoot, "global", "plugins-runtime");
    await mkdir(pluginRuntimeDir, { recursive: true });
    await writeFile(
      path.join(pluginRuntimeDir, "plugin-market.mjs"),
      `export const hooks = {
  "server.start": async (context) => ({
    acknowledged: context.hook,
    pluginId: context.pluginId,
  }),
};`,
      "utf8",
    );

    const pluginResponse = await fetch(`${server.baseUrl}/api/v1/plugins`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "plugin-market",
        schemaVersion: CURRENT_SCHEMA_VERSION,
        name: "Plugin Market",
        description: "Extends server hooks.",
        version: "2.0.0",
        entry: "global/plugins-runtime/plugin-market.mjs",
        apiVersion: "2.0",
        permissions: {
          readProject: true,
          writeProject: false,
          callAI: false,
          network: false,
          runScript: false,
          runShell: false,
          accessOutsideFiles: false,
          readApiKey: false,
          modifyGlobalRulesOrSkills: false,
        },
        hooks: ["server.start"],
        enabled: true,
      }),
    });
    const pluginEnableResponse = await fetch(`${server.baseUrl}/api/v1/plugins/plugin-market`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: false,
      }),
    });
    const pluginInvokeBlockedResponse = await fetch(`${server.baseUrl}/api/v1/plugins/plugin-market/hooks/server.start`, {
      method: "POST",
    });
    await fetch(`${server.baseUrl}/api/v1/plugins/plugin-market`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
      }),
    });
    const pluginInvokeResponse = await fetch(`${server.baseUrl}/api/v1/plugins/plugin-market/hooks/server.start`, {
      method: "POST",
    });
    const listPluginsResponse = await fetch(`${server.baseUrl}/api/v1/plugins`);
    const collabResponse = await fetch(`${server.baseUrl}/api/v1/collaboration/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "collab-001",
        projectId: "demo-series",
        novelId: "main",
        chapterId: "chapter-001",
        owner: "alice",
        participants: ["alice", "bob"],
        mode: "comment",
      }),
    });
    const collabUpdateResponse = await fetch(`${server.baseUrl}/api/v1/collaboration/sessions/collab-001`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "collab-001",
        participants: ["alice", "bob", "carol"],
        status: "active",
        mode: "co-write",
      }),
    });
    const listCollabResponse = await fetch(`${server.baseUrl}/api/v1/collaboration/sessions`);

    const pluginPayload = (await pluginResponse.json()) as {
      ok: true;
      data: { plugin: { id: string; entry: string } };
    };
    const pluginEnablePayload = (await pluginEnableResponse.json()) as {
      ok: true;
      data: { plugin: { enabled: boolean } };
    };
    const pluginInvokeBlockedPayload = (await pluginInvokeBlockedResponse.json()) as {
      ok: false;
      error: { code: string };
    };
    const pluginInvokePayload = (await pluginInvokeResponse.json()) as {
      ok: true;
      data: { result: { invokedHook: string; summary: string; output: { acknowledged: string }; runner: string } };
    };
    const listPluginsPayload = (await listPluginsResponse.json()) as {
      ok: true;
      data: { plugins: Array<{ id: string }> };
    };
    const collabPayload = (await collabResponse.json()) as {
      ok: true;
      data: { session: { owner: string; mode: string; status: string } };
    };
    const collabUpdatePayload = (await collabUpdateResponse.json()) as {
      ok: true;
      data: { session: { mode: string; status: string; participants: string[] } };
    };
    const listCollabPayload = (await listCollabResponse.json()) as {
      ok: true;
      data: { sessions: Array<{ owner: string }> };
    };

    assert.equal(pluginResponse.status, 200);
    assert.equal(pluginPayload.data.plugin.id, "plugin-market");
    assert.equal(pluginPayload.data.plugin.entry, "global/plugins-runtime/plugin-market.mjs");
    assert.equal(pluginEnableResponse.status, 200);
    assert.equal(pluginEnablePayload.data.plugin.enabled, false);
    assert.equal(pluginInvokeBlockedResponse.status, 409);
    assert.equal(pluginInvokeBlockedPayload.error.code, "PLUGIN_DISABLED");
    assert.equal(pluginInvokeResponse.status, 200);
    assert.equal(pluginInvokePayload.data.result.invokedHook, "server.start");
    assert.equal(pluginInvokePayload.data.result.summary.includes("plugin-market"), true);
    assert.equal(pluginInvokePayload.data.result.output.acknowledged, "server.start");
    assert.equal(pluginInvokePayload.data.result.runner, "plugin-hook-runner");
    assert.equal(listPluginsResponse.status, 200);
    assert.equal(listPluginsPayload.data.plugins.some((item) => item.id === "plugin-market"), true);
    assert.equal(collabResponse.status, 200);
    assert.equal(collabPayload.data.session.owner, "alice");
    assert.equal(collabPayload.data.session.mode, "comment");
    assert.equal(collabPayload.data.session.status, "draft");
    assert.equal(collabUpdateResponse.status, 200);
    assert.equal(collabUpdatePayload.data.session.mode, "co-write");
    assert.equal(collabUpdatePayload.data.session.status, "active");
    assert.equal(collabUpdatePayload.data.session.participants.includes("carol"), true);
    assert.equal(listCollabResponse.status, 200);
    assert.equal(listCollabPayload.data.sessions.some((item) => item.owner === "alice"), true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("SEC-27: importing a skill with readApiKey=true is rejected", async () => {
  const vaultRoot = await createVault();
  const server = await startServer({ vaultRoot });

  try {
    const response = await fetch(`${server.baseUrl}/api/v1/skills/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manifest: skillManifest({
          id: "evil",
          permissions: {
            readProject: true,
            writeProject: false,
            callAI: true,
            network: false,
            runScript: false,
            runShell: false,
            accessOutsideFiles: false,
            readApiKey: true,
            modifyGlobalRulesOrSkills: false,
          },
        }),
      }),
    });
    const payload = (await response.json()) as { ok: false; error: { code: string } };

    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "SKILL_INVALID_MANIFEST");
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("skills list returns imported skills", async () => {
  const vaultRoot = await createVault();
  const server = await startServer({ vaultRoot });

  try {
    await fetch(`${server.baseUrl}/api/v1/skills/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manifest: skillManifest() }),
    });

    const response = await fetch(`${server.baseUrl}/api/v1/skills`);
    const payload = (await response.json()) as {
      ok: true;
      data: { skills: Array<{ id: string; kind: string }> };
    };

    assert.equal(response.status, 200);
    assert.equal(payload.data.skills.some((item) => item.id === "deaiify-zh"), true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("github skill import fetches a manifest from github raw/blob urls", async () => {
  const vaultRoot = await createVault();
  const requests: string[] = [];
  const server = await startServer({
    vaultRoot,
    fetchImpl: async (input) => {
      requests.push(typeof input === "string" ? input : input.toString());
      return new Response(JSON.stringify(skillManifest({ id: "github-polish" })), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  try {
    const response = await fetch(`${server.baseUrl}/api/v1/skills/import/github`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://github.com/demo/repo/blob/main/skills/github-polish.json",
      }),
    });
    const payload = (await response.json()) as {
      ok: true;
      data: { skill: { id: string; source: string } };
    };

    assert.equal(response.status, 200);
    assert.equal(payload.data.skill.id, "github-polish");
    assert.equal(payload.data.skill.source, "github:demo/repo");
    assert.equal(
      requests[0],
      "https://raw.githubusercontent.com/demo/repo/main/skills/github-polish.json",
    );
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("rule conflict scan returns duplicate, near-duplicate, and contradiction groups", async () => {
  const server = await startServer();

  try {
    const rules: Rule[] = [
      {
        id: "rule-a",
        title: "禁止在正文里写 frontmatter",
        level: "hard",
        scope: "global",
        appliesTo: [],
        detectBy: ["hard-check"],
        onViolation: "block",
        enabled: true,
        source: "禁止在正文里写 frontmatter",
        priority: 0,
        overridePolicy: "allow-branch-override",
        tags: [],
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
      {
        id: "rule-b",
        title: "禁止在正文里写 frontmatter",
        level: "hard",
        scope: "project",
        appliesTo: [],
        detectBy: ["hard-check"],
        onViolation: "block",
        enabled: true,
        source: "禁止在正文里写 frontmatter",
        priority: 0,
        overridePolicy: "allow-branch-override",
        tags: [],
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
      {
        id: "rule-c",
        title: "正文中不要混入 front matter 元数据",
        level: "hard",
        scope: "project",
        appliesTo: [],
        detectBy: ["hard-check"],
        onViolation: "block",
        enabled: true,
        source: "正文中不要混入 front matter 元数据",
        priority: 0,
        overridePolicy: "allow-branch-override",
        tags: [],
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
      {
        id: "rule-d",
        title: "禁止主角在第一章说出真实身份",
        level: "hard",
        scope: "novel",
        appliesTo: [],
        detectBy: ["hard-check"],
        onViolation: "block",
        enabled: true,
        source: "禁止主角在第一章说出真实身份",
        priority: 0,
        overridePolicy: "allow-branch-override",
        tags: [],
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
      {
        id: "rule-e",
        title: "允许主角在第一章说出真实身份",
        level: "hard",
        scope: "novel",
        appliesTo: [],
        detectBy: ["hard-check"],
        onViolation: "block",
        enabled: true,
        source: "允许主角在第一章说出真实身份",
        priority: 0,
        overridePolicy: "allow-branch-override",
        tags: [],
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
    ];

    const response = await fetch(`${server.baseUrl}/api/v1/rules/conflicts/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rules }),
    });
    const payload = (await response.json()) as {
      ok: true;
      data: {
        exactDuplicates: Array<{ kind: string }>;
        nearDuplicates: Array<{ kind: string }>;
        contradictions: Array<{ kind: string }>;
      };
    };

    assert.equal(response.status, 200);
    assert.equal(payload.data.exactDuplicates.length, 1);
    assert.equal(payload.data.nearDuplicates.length >= 1, true);
    assert.equal(payload.data.contradictions.length >= 1, true);
  } finally {
    await server.close();
  }
});
