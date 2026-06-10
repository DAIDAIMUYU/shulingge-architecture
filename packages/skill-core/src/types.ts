import type { SkillKind, SkillPermissions } from "@shulingge/shared";

/** 权限风险级别：用于安装页提示与高风险二次确认。 */
export type SkillRiskLevel = "safe" | "elevated" | "high";

/** 单条权限的展示描述（安装页逐条显示）。 */
export interface SkillPermissionDescriptor {
  key: keyof SkillPermissions;
  granted: boolean;
  risk: SkillRiskLevel;
  /** 中文展示标签。 */
  label: string;
  /** 是否需要二次确认（已授予的 elevated / high 权限）。 */
  requiresConfirm: boolean;
}

/** 权限汇总：供安装页展示与导入决策使用。 */
export interface SkillPermissionSummary {
  descriptors: SkillPermissionDescriptor[];
  grantedKeys: Array<keyof SkillPermissions>;
  highRiskKeys: Array<keyof SkillPermissions>;
  requiresHighRiskConfirm: boolean;
  /** SEC-27 不变量：恒为 false。 */
  readApiKey: false;
}

/** manifest 解析结果。 */
export type SkillParseResult =
  | { ok: true; skill: import("@shulingge/shared").Skill }
  | { ok: false; issues: string[] };

/** 导入决策：普通 Skill 可执行；工具 Skill 在 MVP 仅登记不执行。 */
export interface SkillImportDecision {
  importable: boolean;
  executable: boolean;
  /** true 表示仅登记、不可执行（MVP 下的工具 Skill）。 */
  registeredOnly: boolean;
  reasons: string[];
}

/** 已登记的 Skill 记录（持久化到 Vault 由 server 负责写盘）。 */
export interface SkillRegistryRecord {
  id: string;
  name: string;
  version: string;
  kind: SkillKind;
  executable: boolean;
  registeredOnly: boolean;
  /** 来源，例如 "local-import"。 */
  source: string;
  license: string;
  installedAt: string;
  permissionSummary: SkillPermissionSummary;
}

export interface SkillExecutionRequest {
  skillId: string;
  args?: Record<string, unknown>;
  dryRun?: boolean;
}

export interface SkillExecutionResult {
  skillId: string;
  executed: boolean;
  dryRun: boolean;
  sandbox: "none" | "v2-tool";
  summary: string;
  operations: string[];
  artifacts?: Array<{
    kind: "json";
    name: string;
    content: Record<string, unknown>;
  }>;
}
