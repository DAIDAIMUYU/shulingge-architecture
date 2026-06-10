import type { Skill, SkillPermissions } from "@shulingge/shared";

import type {
  SkillPermissionDescriptor,
  SkillPermissionSummary,
  SkillRiskLevel,
} from "./types.js";

interface PermissionMeta {
  risk: SkillRiskLevel;
  label: string;
}

/** 权限元信息：风险级别 + 中文展示标签（对应 SECURITY_SPEC §4 / SKILL_SYSTEM_SPEC §4）。 */
const PERMISSION_META: Record<keyof SkillPermissions, PermissionMeta> = {
  readProject: { risk: "safe", label: "读取当前项目" },
  writeProject: { risk: "elevated", label: "修改当前项目（自动快照）" },
  callAI: { risk: "safe", label: "调用 AI" },
  network: { risk: "high", label: "访问网络" },
  runScript: { risk: "high", label: "执行本地脚本" },
  runShell: { risk: "high", label: "执行命令行" },
  accessOutsideFiles: { risk: "high", label: "访问项目外文件" },
  readApiKey: { risk: "high", label: "读取 API Key（禁止）" },
  modifyGlobalRulesOrSkills: { risk: "high", label: "修改全局规则 / Skill" },
};

const PERMISSION_KEYS = Object.keys(PERMISSION_META) as Array<keyof SkillPermissions>;

/** 汇总一个 Skill 的权限，用于安装页逐条展示与高风险二次确认。 */
export function summarizeSkillPermissions(skill: Skill): SkillPermissionSummary {
  const permissions = skill.permissions;
  const descriptors: SkillPermissionDescriptor[] = PERMISSION_KEYS.map((key) => {
    const meta = PERMISSION_META[key];
    // SEC-27：readApiKey 恒视为未授予。
    const granted = key === "readApiKey" ? false : Boolean(permissions[key]);
    const requiresConfirm = granted && (meta.risk === "elevated" || meta.risk === "high");
    return { key, granted, risk: meta.risk, label: meta.label, requiresConfirm };
  });

  const grantedKeys = descriptors.filter((item) => item.granted).map((item) => item.key);
  const highRiskKeys = descriptors
    .filter((item) => item.granted && item.risk === "high")
    .map((item) => item.key);

  return {
    descriptors,
    grantedKeys,
    highRiskKeys,
    requiresHighRiskConfirm: highRiskKeys.length > 0,
    readApiKey: false,
  };
}
