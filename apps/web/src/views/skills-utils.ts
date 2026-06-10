import type { SkillExecutionResult, SkillPermissionSummary, SkillRegistryRecord } from "../api/client.js";

export interface SkillPermissionBadge {
  key: string;
  label: string;
  tone: "safe" | "elevated" | "high";
  requiresConfirm: boolean;
}

const PERMISSION_LABELS: Record<string, string> = {
  readProject: "读取项目",
  writeProject: "写入项目",
  callAI: "调用模型",
  network: "访问网络",
  runScript: "运行脚本",
  runShell: "运行命令",
  accessOutsideFiles: "访问 Vault 外文件",
  readApiKey: "读取 API Key",
  modifyGlobalRulesOrSkills: "修改全局规则 / Skill",
};

function permissionLabel(key: string): string {
  return PERMISSION_LABELS[key] ?? key;
}

export function buildPermissionBadges(summary?: SkillPermissionSummary | null): SkillPermissionBadge[] {
  if (!summary) {
    return [];
  }

  return summary.descriptors
    .filter((descriptor) => descriptor.granted)
    .map((descriptor) => ({
      key: descriptor.key,
      label: descriptor.label || permissionLabel(descriptor.key),
      tone: descriptor.risk,
      requiresConfirm: descriptor.requiresConfirm,
    }));
}

export function parseJsonObject(input: string): { value?: Record<string, unknown>; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { value: {} };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return { error: "请输入 JSON 对象，例如 {\"command\":\"search\"}" };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: "JSON 解析失败，请检查逗号、引号和括号" };
  }
}

export function splitCsv(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function executionModeLabel(skill: SkillRegistryRecord | null): string {
  if (!skill) {
    return "未选择";
  }
  if (skill.kind === "tool") {
    return "受限沙箱执行";
  }
  return skill.executable ? "直接执行" : "仅登记";
}

export function formatExecutionOperations(result: SkillExecutionResult | null): string {
  if (!result?.operations?.length) {
    return "无";
  }
  return result.operations.join(" / ");
}
