import { skillSchema, type Skill } from "@shulingge/shared";

import type { SkillParseResult } from "./types.js";

/**
 * 校验一个 Skill manifest 对象。
 * 复用 `@shulingge/shared` 的 `skillSchema`，其中 `readApiKey: z.literal(false)`
 * 在 schema 层强制 SEC-27（带 readApiKey=true 的清单会被直接拒绝）。
 */
export function parseSkillManifest(raw: unknown): SkillParseResult {
  const parsed = skillSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }
  return { ok: true, skill: parsed.data as Skill };
}

/** 从 JSON 文本解析并校验 Skill manifest。 */
export function parseSkillManifestJson(text: string): SkillParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, issues: ["INVALID_JSON: 无法解析 JSON 文本"] };
  }
  return parseSkillManifest(raw);
}
