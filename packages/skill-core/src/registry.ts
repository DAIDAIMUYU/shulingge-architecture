import type { Skill } from "@shulingge/shared";

import { summarizeSkillPermissions } from "./permissions.js";
import type { SkillExecutionRequest, SkillExecutionResult, SkillImportDecision, SkillRegistryRecord } from "./types.js";

/** 判断是否为工具 Skill。 */
export function isToolSkill(skill: Skill): boolean {
  return skill.kind === "tool";
}

/**
 * 导入决策：
 * - 普通 Skill：可导入并可执行/启用。
 * - 工具 Skill：MVP 下仅登记，不执行，真正执行放到 V2.0 沙盒。
 * - 任何 readApiKey=true：直接拒绝，作为 SEC-27 的兜底拦截。
 */
export function decideSkillImport(skill: Skill): SkillImportDecision {
  if ((skill.permissions as { readApiKey?: unknown }).readApiKey === true) {
    return {
      importable: false,
      executable: false,
      registeredOnly: false,
      reasons: ["SEC-27：readApiKey 必须为 false，拒绝导入"],
    };
  }

  if (isToolSkill(skill)) {
    return {
      importable: true,
      executable: false,
      registeredOnly: true,
      reasons: ["工具 Skill：MVP 仅登记，不执行，执行/沙盒后置到 V2.0"],
    };
  }

  return {
    importable: true,
    executable: true,
    registeredOnly: false,
    reasons: ["普通 Skill：可导入并启用"],
  };
}

/** 构造一条 Skill 登记记录，写盘由 server 通过 vault-core 负责。 */
export function createSkillRegistryRecord(
  skill: Skill,
  source: string,
  installedAt: string = new Date().toISOString(),
): SkillRegistryRecord {
  const decision = decideSkillImport(skill);
  return {
    id: skill.id,
    name: skill.name,
    version: skill.version,
    kind: skill.kind,
    executable: decision.executable,
    registeredOnly: decision.registeredOnly,
    source,
    license: skill.license,
    installedAt,
    permissionSummary: summarizeSkillPermissions(skill),
  };
}

export function executeRegisteredSkill(skill: Skill, request: SkillExecutionRequest): SkillExecutionResult {
  // 这里先产出一份“执行计划”结果；真正的工具 Skill 子进程执行在 server 层完成。
  const decision = decideSkillImport(skill);
  const sandbox = skill.kind === "tool" ? "v2-tool" : "none";
  const dryRun = request.dryRun ?? false;

  if (!decision.importable) {
    return {
      skillId: skill.id,
      executed: false,
      dryRun,
      sandbox,
      summary: decision.reasons.join("; "),
      operations: [],
    };
  }

  if (skill.kind === "tool") {
    const operationKeys = Object.keys(request.args ?? {});
    const artifacts =
      operationKeys.length > 0
        ? [
            {
              kind: "json" as const,
              name: `${skill.id}-result.json`,
              content: {
                skillId: skill.id,
                acceptedArgs: request.args ?? {},
                dryRun,
              },
            },
          ]
        : undefined;
    return {
      skillId: skill.id,
      executed: !dryRun,
      dryRun,
      sandbox,
      summary: dryRun
        ? `Tool skill ${skill.id} sandbox dry-run ready`
        : `Tool skill ${skill.id} executed in restricted V2 sandbox`,
      operations: operationKeys.length > 0 ? operationKeys.map((key) => `arg:${key}`) : ["tool:invoke"],
      artifacts,
    };
  }

  return {
    skillId: skill.id,
    executed: !dryRun,
    dryRun,
    sandbox,
    summary: dryRun
      ? `Normal skill ${skill.id} dry-run ready`
      : `Normal skill ${skill.id} executed`,
    operations: Object.keys(request.args ?? {}).map((key) => `arg:${key}`),
  };
}
