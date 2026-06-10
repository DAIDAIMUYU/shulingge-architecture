import assert from "node:assert/strict";
import test from "node:test";

import { CURRENT_SCHEMA_VERSION, type Rule } from "@shulingge/shared";

import { scanRuleConflicts } from "./conflicts.js";
import { createBuiltInRulePreset, runBasicHardChecks } from "./hard-checks.js";
import { resolveEffectiveRules } from "./resolve.js";

function createRule(overrides: Partial<Rule> & Pick<Rule, "id" | "title" | "level" | "scope">): Rule {
  return {
    id: overrides.id,
    title: overrides.title,
    level: overrides.level,
    scope: overrides.scope,
    appliesTo: overrides.appliesTo ?? [],
    detectBy: overrides.detectBy ?? ["hard-check"],
    onViolation: overrides.onViolation ?? "block",
    enabled: overrides.enabled ?? true,
    source: overrides.source ?? overrides.title,
    priority: overrides.priority ?? 0,
    overridePolicy: overrides.overridePolicy ?? "allow-branch-override",
    tags: overrides.tags ?? [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

test("resolveEffectiveRules preserves locked rules and honors scope priority chain", () => {
  const rules = [
    createRule({
      id: "style-tone",
      title: "保持克制文风",
      level: "soft",
      scope: "global",
      source: "global/rules/style.json",
    }),
    createRule({
      id: "style-tone",
      title: "保持克制文风",
      level: "soft",
      scope: "chapter",
      source: "chapter/rules/style.json",
      priority: 10,
    }),
    createRule({
      id: "locked-canon",
      title: "原作设定不可改",
      level: "locked",
      scope: "global",
      source: "global/rules/canon.json",
      overridePolicy: "locked",
    }),
  ];

  const resolved = resolveEffectiveRules({
    rules,
    scopeChain: ["global", "project", "novel", "chapter"],
  });

  assert.equal(resolved.some((rule) => rule.id === "locked-canon"), true);
  assert.equal(resolved.filter((rule) => rule.id === "style-tone").length, 1);
  assert.equal(resolved.find((rule) => rule.id === "style-tone")?.scope, "chapter");
});

test("basic hard checks block locked-skip and invalid manuscript state", () => {
  const result = runBasicHardChecks({
    manuscript: "",
    minWords: 10,
    structuredOutputText: "{bad json",
    writeSucceeded: false,
    skippedLockedCheck: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.violations.some((item) => item.id === "hardcheck-locked-skip" && item.level === "locked"), true);
  assert.equal(result.violations.some((item) => item.id === "hardcheck-invalid-json"), true);
  assert.equal(result.violations.some((item) => item.id === "hardcheck-write-failed"), true);
});

test("scanRuleConflicts detects exact duplicates, near duplicates, and contradictions", () => {
  const rules = [
    createRule({
      id: "rule-a",
      title: "禁止在正文里写 frontmatter",
      level: "hard",
      scope: "global",
      source: "禁止在正文里写 frontmatter",
    }),
    createRule({
      id: "rule-b",
      title: "禁止在正文里写 frontmatter",
      level: "hard",
      scope: "project",
      source: "禁止在正文里写 frontmatter",
    }),
    createRule({
      id: "rule-c",
      title: "正文中不要混入 front matter 元数据",
      level: "hard",
      scope: "project",
      source: "正文中不要混入 front matter 元数据",
    }),
    createRule({
      id: "rule-d",
      title: "禁止主角在第一章说出真实身份",
      level: "hard",
      scope: "novel",
      source: "禁止主角在第一章说出真实身份",
    }),
    createRule({
      id: "rule-e",
      title: "允许主角在第一章说出真实身份",
      level: "hard",
      scope: "novel",
      source: "允许主角在第一章说出真实身份",
    }),
  ];

  const scan = scanRuleConflicts(rules);

  assert.equal(scan.exactDuplicates.length, 1);
  assert.equal(scan.nearDuplicates.length >= 1, true);
  assert.equal(scan.contradictions.length >= 1, true);
});

test("built-in preset exposes non-skippable hard checks", () => {
  const preset = createBuiltInRulePreset();
  assert.equal(preset.hardChecks.some((item) => item.type === "locked-skip" && item.blocking), true);
});
