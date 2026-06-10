import type { HardCheck } from "@shulingge/shared";

import type { BuiltInRulePreset, HardCheckInput, HardCheckResult, HardCheckViolation } from "./types.js";

function countWords(content: string): number {
  const normalized = content.trim();
  if (!normalized) {
    return 0;
  }

  const cjkPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
  const cjkCharacters = normalized.match(cjkPattern)?.length ?? 0;
  const latinWords = normalized
    .replace(cjkPattern, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean).length;

  return cjkCharacters + latinWords;
}

function tryParseJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export function runBasicHardChecks(input: HardCheckInput): HardCheckResult {
  const violations: HardCheckViolation[] = [];
  const manuscript = input.manuscript ?? "";
  const wordCount = countWords(manuscript);

  if (!manuscript.trim()) {
    violations.push({
      id: "hardcheck-manuscript-empty",
      level: "hard",
      message: "正文为空。",
    });
  }

  if (typeof input.minWords === "number" && wordCount < input.minWords) {
    violations.push({
      id: "hardcheck-min-words",
      level: "hard",
      message: `正文低于最小字数 ${input.minWords}。`,
    });
  }

  if (typeof input.maxWords === "number" && wordCount > input.maxWords) {
    violations.push({
      id: "hardcheck-max-words",
      level: "hard",
      message: `正文超过最大字数 ${input.maxWords}。`,
    });
  }

  if (typeof input.structuredOutputText === "string" && !tryParseJson(input.structuredOutputText)) {
    violations.push({
      id: "hardcheck-invalid-json",
      level: "hard",
      message: "Agent 结构化输出不是有效 JSON。",
    });
  }

  if (input.writeSucceeded === false) {
    violations.push({
      id: "hardcheck-write-failed",
      level: "hard",
      message: "文件写入失败。",
    });
  }

  if (input.skippedLockedCheck) {
    violations.push({
      id: "hardcheck-locked-skip",
      level: "locked",
      message: "锁定规则检查不可跳过。",
    });
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

export function createBuiltInRulePreset(): BuiltInRulePreset {
  const hardChecks: HardCheck[] = [
    {
      id: "builtin-hardcheck-manuscript-empty",
      type: "manuscript-empty",
      enabled: true,
      blocking: true,
      schemaVersion: 1,
    },
    {
      id: "builtin-hardcheck-invalid-json",
      type: "invalid-json",
      enabled: true,
      blocking: true,
      schemaVersion: 1,
    },
    {
      id: "builtin-hardcheck-write-failed",
      type: "write-failed",
      enabled: true,
      blocking: true,
      schemaVersion: 1,
    },
    {
      id: "builtin-hardcheck-locked-skip",
      type: "locked-skip",
      enabled: true,
      blocking: true,
      schemaVersion: 1,
    },
  ];

  return {
    rules: [],
    hardChecks,
  };
}
