import { readdir } from "node:fs/promises";
import path from "node:path";

import { initializeProject, initializeVault, readJsonFile, writeJsonFile } from "@shulingge/vault-core";
import { CURRENT_SCHEMA_VERSION, type ProjectSeries } from "@shulingge/shared";

import { listModels, type ModelStoreOptions } from "./models.js";

const BOOTSTRAP_STATE_PATH = "settings/bootstrap.json";

export interface BootstrapStatus {
  completed: boolean;
  hasVault: boolean;
  hasAnyProject: boolean;
  hasAnyModel: boolean;
  hasRemotePassword: boolean;
  preferredTheme: string;
  preferredLanguage: string;
  checklist: Array<{
    id: "vault" | "project" | "model" | "remote";
    done: boolean;
    label: string;
  }>;
}

interface BootstrapState {
  completed: boolean;
  preferredTheme: string;
  preferredLanguage: string;
  completedAt?: string;
}

export interface CompleteBootstrapInput {
  rootPath?: string;
  createDemoProject?: boolean;
  preferredTheme?: string;
  preferredLanguage?: string;
}

async function readBootstrapState(vaultRoot: string): Promise<BootstrapState | null> {
  try {
    return await readJsonFile<BootstrapState>(vaultRoot, BOOTSTRAP_STATE_PATH);
  } catch {
    return null;
  }
}

async function detectAnyProject(vaultRoot: string): Promise<boolean> {
  const projectsRoot = path.join(vaultRoot, "projects");
  const entries = await readdir(projectsRoot, { withFileTypes: true }).catch(() => []);
  return entries.some((entry) => entry.isDirectory());
}

export async function getBootstrapStatus(
  vaultRoot: string | null,
  modelOptions?: ModelStoreOptions,
): Promise<BootstrapStatus> {
  if (!vaultRoot) {
    return {
      completed: false,
      hasVault: false,
      hasAnyProject: false,
      hasAnyModel: false,
      hasRemotePassword: false,
      preferredTheme: "ink-warm",
      preferredLanguage: "zh-CN",
      checklist: [
        { id: "vault", done: false, label: "选择或创建 Vault" },
        { id: "project", done: false, label: "初始化首个项目" },
        { id: "model", done: false, label: "配置至少一个模型" },
        { id: "remote", done: false, label: "确认远程访问默认关闭或已设置密码" },
      ],
    };
  }

  const state = await readBootstrapState(vaultRoot);
  const hasAnyProject = await detectAnyProject(vaultRoot);
  const hasAnyModel = modelOptions ? (await listModels(vaultRoot, modelOptions)).length > 0 : false;
  const hasRemotePassword = false;

  return {
    completed: Boolean(state?.completed && hasAnyProject && hasAnyModel),
    hasVault: true,
    hasAnyProject,
    hasAnyModel,
    hasRemotePassword,
    preferredTheme: state?.preferredTheme ?? "ink-warm",
    preferredLanguage: state?.preferredLanguage ?? "zh-CN",
    checklist: [
      { id: "vault", done: true, label: "选择或创建 Vault" },
      { id: "project", done: hasAnyProject, label: "初始化首个项目" },
      { id: "model", done: hasAnyModel, label: "配置至少一个模型" },
      { id: "remote", done: true, label: "确认远程访问默认关闭或已设置密码" },
    ],
  };
}

export async function completeBootstrap(
  input: CompleteBootstrapInput,
  modelOptions?: ModelStoreOptions,
): Promise<{ vaultRoot: string; status: BootstrapStatus }> {
  const rootPath = input.rootPath ? path.resolve(input.rootPath) : null;
  if (!rootPath) {
    throw new Error("rootPath is required");
  }

  await initializeVault({ rootPath });

  if (input.createDemoProject ?? true) {
    const series: ProjectSeries = {
      id: "demo-series",
      name: "演示系列",
      type: "original",
      defaultNovelId: "main",
      sharedPath: "shared",
      readPolicyPath: "shared/read-policy.json",
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };

    try {
      await initializeProject(rootPath, series, {
        id: "main",
        name: "主线",
        branchType: "main",
      });
    } catch {
      // 项目已存在时允许幂等完成首次启动。
    }
  }

  await writeJsonFile(rootPath, BOOTSTRAP_STATE_PATH, {
    completed: true,
    preferredTheme: input.preferredTheme ?? "ink-warm",
    preferredLanguage: input.preferredLanguage ?? "zh-CN",
    completedAt: new Date().toISOString(),
  } satisfies BootstrapState);

  return {
    vaultRoot: rootPath,
    status: await getBootstrapStatus(rootPath, modelOptions),
  };
}
