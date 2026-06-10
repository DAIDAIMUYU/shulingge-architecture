import assert from "node:assert/strict";
import test from "node:test";

import { CURRENT_SCHEMA_VERSION, type Skill, type SkillKind } from "@shulingge/shared";

import { resolveGitHubSkillSource } from "./github.js";
import { parseSkillManifest, parseSkillManifestJson } from "./manifest.js";
import { summarizeSkillPermissions } from "./permissions.js";
import { createSkillRegistryRecord, decideSkillImport, executeRegisteredSkill, isToolSkill } from "./registry.js";
import { compareSemVer, isCompatibleWith, parseSemVer } from "./version.js";

function createSkillManifest(
  overrides: Partial<Skill> & { kind?: SkillKind } = {},
): Record<string, unknown> {
  return {
    id: overrides.id ?? "deaiify-zh",
    schemaVersion: overrides.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    name: overrides.name ?? "去 AI 味中文",
    description: overrides.description ?? "降低中文 AI 写作腔。",
    version: overrides.version ?? "1.0.0",
    tags: overrides.tags ?? ["polish", "zh"],
    languages: overrides.languages ?? ["zh"],
    genres: overrides.genres ?? ["*"],
    tasks: overrides.tasks ?? ["polish"],
    boundAgents: overrides.boundAgents ?? ["polish-agent"],
    readRequirements: overrides.readRequirements ?? ["manuscripts/current"],
    ruleFragments: overrides.ruleFragments ?? [],
    prompt: overrides.prompt ?? "请降低 AI 腔，保留原意。",
    kind: overrides.kind ?? "normal",
    allowAutoRun: overrides.allowAutoRun ?? true,
    allowWriteDraft: overrides.allowWriteDraft ?? false,
    license: overrides.license ?? "MIT",
    compatibleVersions: overrides.compatibleVersions ?? ">=0.1.0",
    permissions: overrides.permissions ?? {
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
  };
}

test("parseSkillManifest accepts a valid normal skill", () => {
  const result = parseSkillManifest(createSkillManifest());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.skill.kind, "normal");
    assert.equal(result.skill.permissions.readApiKey, false);
  }
});

test("parseSkillManifest rejects missing required fields", () => {
  const result = parseSkillManifest({ id: "broken" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issues.length > 0, true);
  }
});

test("SEC-27: parseSkillManifest rejects readApiKey=true at schema level", () => {
  const manifest = createSkillManifest();
  (manifest.permissions as Record<string, unknown>).readApiKey = true;
  const result = parseSkillManifest(manifest);
  assert.equal(result.ok, false);
});

test("parseSkillManifestJson reports invalid JSON", () => {
  const result = parseSkillManifestJson("{not json");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issues[0]?.startsWith("INVALID_JSON"), true);
  }
});

test("summarizeSkillPermissions flags high-risk and keeps readApiKey false", () => {
  const parsed = parseSkillManifest(
    createSkillManifest({
      permissions: {
        readProject: true,
        writeProject: true,
        callAI: true,
        network: true,
        runScript: false,
        runShell: true,
        accessOutsideFiles: false,
        readApiKey: false,
        modifyGlobalRulesOrSkills: false,
      },
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  const summary = summarizeSkillPermissions(parsed.skill);
  assert.equal(summary.readApiKey, false);
  assert.equal(summary.requiresHighRiskConfirm, true);
  assert.equal(summary.highRiskKeys.includes("network"), true);
  assert.equal(summary.highRiskKeys.includes("runShell"), true);
  const writeProject = summary.descriptors.find((item) => item.key === "writeProject");
  assert.equal(writeProject?.requiresConfirm, true);
});

test("decideSkillImport: normal executable, tool registered-only", () => {
  const normal = parseSkillManifest(createSkillManifest({ kind: "normal" }));
  const tool = parseSkillManifest(createSkillManifest({ id: "tool-skill", kind: "tool" }));
  assert.equal(normal.ok && tool.ok, true);
  if (!normal.ok || !tool.ok) {
    return;
  }
  assert.equal(isToolSkill(normal.skill), false);
  assert.equal(decideSkillImport(normal.skill).executable, true);

  assert.equal(isToolSkill(tool.skill), true);
  const toolDecision = decideSkillImport(tool.skill);
  assert.equal(toolDecision.executable, false);
  assert.equal(toolDecision.registeredOnly, true);
});

test("createSkillRegistryRecord captures kind, executability and permission summary", () => {
  const parsed = parseSkillManifest(createSkillManifest({ kind: "tool" }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  const record = createSkillRegistryRecord(parsed.skill, "local-import", "2026-06-08T00:00:00.000Z");
  assert.equal(record.kind, "tool");
  assert.equal(record.executable, false);
  assert.equal(record.registeredOnly, true);
  assert.equal(record.source, "local-import");
  assert.equal(record.permissionSummary.readApiKey, false);
});

test("executeRegisteredSkill supports V2 tool sandbox and dry-run", () => {
  const tool = parseSkillManifest(createSkillManifest({ id: "tool-skill", kind: "tool" }));
  const normal = parseSkillManifest(createSkillManifest({ id: "normal-skill", kind: "normal" }));
  assert.equal(tool.ok && normal.ok, true);
  if (!tool.ok || !normal.ok) {
    return;
  }

  const toolDryRun = executeRegisteredSkill(tool.skill, {
    skillId: "tool-skill",
    dryRun: true,
    args: { command: "lint" },
  });
  const normalRun = executeRegisteredSkill(normal.skill, {
    skillId: "normal-skill",
    args: { chapterId: "chapter-001" },
  });

  assert.equal(toolDryRun.sandbox, "v2-tool");
  assert.equal(toolDryRun.executed, false);
  assert.equal(toolDryRun.summary.includes("dry-run"), true);
  assert.equal(normalRun.executed, true);
  assert.equal(normalRun.sandbox, "none");
});

test("semver compare and compatibility ranges", () => {
  assert.equal(compareSemVer({ major: 1, minor: 2, patch: 0 }, { major: 1, minor: 1, patch: 9 }) > 0, true);
  assert.equal(parseSemVer("not-a-version"), null);
  assert.equal(isCompatibleWith(">=0.1.0", "0.1.0"), true);
  assert.equal(isCompatibleWith(">=0.1.0", "0.0.9"), false);
  assert.equal(isCompatibleWith("*", "9.9.9"), true);
  assert.equal(isCompatibleWith("1.0.0", "1.0.0"), true);
  assert.equal(isCompatibleWith("1.0.0", "1.0.1"), false);
});

test("resolveGitHubSkillSource supports github blob and raw urls", () => {
  const blob = resolveGitHubSkillSource(
    "https://github.com/demo/repo/blob/main/skills/polish-skill.json",
  );
  const raw = resolveGitHubSkillSource(
    "https://raw.githubusercontent.com/demo/repo/main/skills/polish-skill.json",
  );

  assert.equal(blob?.rawUrl, "https://raw.githubusercontent.com/demo/repo/main/skills/polish-skill.json");
  assert.equal(blob?.sourceLabel, "github:demo/repo");
  assert.equal(raw?.sourceLabel, "github:demo/repo");
  assert.equal(resolveGitHubSkillSource("https://example.com/skill.json"), null);
});
