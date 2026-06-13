import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import { createDefaultAgentCatalog } from "@shulingge/agent-core";
import {
  agentSchema,
  CURRENT_SCHEMA_VERSION,
  type Agent,
  type AgentOutputFormat,
  type AgentPermissionMode,
} from "@shulingge/shared";
import { readJsonFile, resolveSafePath, writeJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

type CreateAgentInput = Partial<Agent> & { id?: string; name?: string };
type UpdateAgentInput = Partial<Omit<Agent, "id" | "schemaVersion" | "createdAt">>;
type ImportAgentMode = "overwrite" | "skip";

export interface AgentImportResult {
  imported: Agent[];
  skipped: string[];
  overwritten: string[];
}

const updateAgentSchema = agentSchema.partial().omit({
  id: true,
  schemaVersion: true,
  createdAt: true,
});

const DEFAULT_PERMISSIONS: Agent["permissions"] = {
  canWriteDraft: false,
  canRewriteDraft: false,
  canPatchParagraph: false,
  canBlockWorkflow: false,
  canRequestRewrite: false,
  canWriteState: false,
  canUpdateRules: false,
};

const DEFAULT_SPEAK: Agent["speak"] = {
  speak: false,
  showReasoning: false,
  showStructured: true,
  onlyOnFailure: false,
};

function getAgentsDir(vaultRoot: string): string {
  return resolveSafePath(vaultRoot, "settings/agents");
}

function getAgentRelativePath(agentId: string): string {
  return path.posix.join("settings/agents", `${agentId}.json`);
}

function normalizeAgentId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "agent";
}

function formatValidationError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray((error as { issues?: unknown }).issues)
  ) {
    return (error as { issues: Array<{ path?: Array<string | number>; message?: string }> }).issues
      .map((issue) => `${issue.path?.join(".") || "root"}: ${issue.message ?? "invalid value"}`)
      .join("; ");
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

async function readAgentFiles(vaultRoot: string): Promise<Agent[]> {
  try {
    const entries = await readdir(getAgentsDir(vaultRoot));
    const agents = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => readJsonFile<Agent>(vaultRoot, path.posix.join("settings/agents", entry))),
    );

    return agents.map((agent) => agentSchema.parse(agent)).sort(compareAgents);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function compareAgents(left: Agent, right: Agent): number {
  return left.order - right.order || left.id.localeCompare(right.id);
}

async function ensureUniqueAgent(vaultRoot: string, agentId: string): Promise<void> {
  const current = await readJsonFile<Agent>(vaultRoot, getAgentRelativePath(agentId)).catch(() => null);
  if (current) {
    throw createHttpError(409, "AGENTS_ALREADY_EXISTS", `Agent 已存在：${agentId}`);
  }
}

async function createUniqueAgentId(vaultRoot: string, baseValue: string): Promise<string> {
  const baseId = normalizeAgentId(baseValue);
  let candidate = baseId;
  let index = 2;

  while (await readJsonFile<Agent>(vaultRoot, getAgentRelativePath(candidate)).then(() => true).catch(() => false)) {
    candidate = `${baseId}-${index}`;
    index += 1;
  }

  return candidate;
}

async function getNextOrder(vaultRoot: string): Promise<number> {
  const agents = await readAgentFiles(vaultRoot);
  const maxOrder = agents.reduce((max, agent) => Math.max(max, agent.order), 0);
  return maxOrder + 10;
}

function normalizeAgent(input: CreateAgentInput, id: string, order: number, current?: Agent): Agent {
  const now = new Date().toISOString();
  const agent: Agent = {
    id,
    name: input.name ?? current?.name ?? "新 Agent",
    description: input.description ?? current?.description ?? "",
    enabled: input.enabled ?? current?.enabled ?? true,
    type: (input.type ?? current?.type ?? "advisor") as AgentPermissionMode,
    workflowId: input.workflowId ?? current?.workflowId,
    order: input.order ?? current?.order ?? order,
    modelConfigId: input.modelConfigId ?? current?.modelConfigId ?? "",
    readScope: input.readScope ?? current?.readScope ?? [],
    builtInRules: input.builtInRules ?? current?.builtInRules ?? [],
    skills: input.skills ?? current?.skills ?? [],
    outputFormat: (input.outputFormat ?? current?.outputFormat ?? "json+text") as AgentOutputFormat,
    permissions: {
      ...DEFAULT_PERMISSIONS,
      ...current?.permissions,
      ...input.permissions,
    },
    speak: {
      ...DEFAULT_SPEAK,
      ...current?.speak,
      ...input.speak,
    },
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };

  try {
    return agentSchema.parse(agent);
  } catch (error) {
    throw createHttpError(400, "AGENTS_INVALID_CONFIG", `Agent 配置无效：${formatValidationError(error)}`);
  }
}

async function seedDefaultAgents(vaultRoot: string): Promise<Agent[]> {
  const defaults = createDefaultAgentCatalog().active.map((agent) =>
    agentSchema.parse({
      ...agent,
      modelConfigId: "",
      schemaVersion: CURRENT_SCHEMA_VERSION,
    }),
  );

  await Promise.all(defaults.map((agent) => writeJsonFile(vaultRoot, getAgentRelativePath(agent.id), agent)));
  return defaults.sort(compareAgents);
}

export async function listAgents(vaultRoot: string): Promise<Agent[]> {
  const agents = await readAgentFiles(vaultRoot);
  if (agents.length > 0) {
    return agents;
  }

  return seedDefaultAgents(vaultRoot);
}

export async function getAgent(vaultRoot: string, agentId: string): Promise<Agent> {
  const agent = await readJsonFile<Agent>(vaultRoot, getAgentRelativePath(agentId)).catch(() => null);
  if (!agent) {
    throw createHttpError(404, "AGENTS_NOT_FOUND", `未找到 Agent：${agentId}`);
  }

  try {
    return agentSchema.parse(agent);
  } catch (error) {
    throw createHttpError(500, "AGENTS_INVALID_STORED_CONFIG", `Agent 存储数据无效：${formatValidationError(error)}`);
  }
}

export async function createAgent(vaultRoot: string, input: CreateAgentInput): Promise<Agent> {
  const name = input.name?.trim();
  const requestedId = input.id?.trim();
  if (!name) {
    throw createHttpError(400, "AGENTS_INVALID_CREATE", "Agent 名称不能为空");
  }

  const id = requestedId ? normalizeAgentId(requestedId) : await createUniqueAgentId(vaultRoot, name);
  await ensureUniqueAgent(vaultRoot, id);

  const agent = normalizeAgent({ ...input, name }, id, await getNextOrder(vaultRoot));
  await writeJsonFile(vaultRoot, getAgentRelativePath(agent.id), agent);
  return agent;
}

export async function updateAgent(vaultRoot: string, agentId: string, input: UpdateAgentInput): Promise<Agent> {
  const current = await getAgent(vaultRoot, agentId);
  try {
    updateAgentSchema.parse(input);
  } catch (error) {
    throw createHttpError(400, "AGENTS_INVALID_UPDATE", `Agent 更新内容无效：${formatValidationError(error)}`);
  }

  const agent = normalizeAgent(input, current.id, current.order, current);
  await writeJsonFile(vaultRoot, getAgentRelativePath(agent.id), agent);
  return agent;
}

export async function deleteAgent(vaultRoot: string, agentId: string): Promise<{ deleted: true; agentId: string }> {
  await getAgent(vaultRoot, agentId);
  await rm(resolveSafePath(vaultRoot, getAgentRelativePath(agentId)), { force: true });

  return {
    deleted: true,
    agentId,
  };
}

function parseImportAgentsPayload(input: unknown): Agent[] {
  const rawAgents = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { agents?: unknown }).agents)
      ? (input as { agents: unknown[] }).agents
      : null;

  if (!rawAgents) {
    throw createHttpError(400, "AGENTS_IMPORT_INVALID_PAYLOAD", "导入内容必须是智能体数组，或包含 agents 数组的 JSON 对象");
  }

  try {
    return rawAgents.map((agent) => agentSchema.parse(agent)).sort(compareAgents);
  } catch (error) {
    throw createHttpError(400, "AGENTS_IMPORT_INVALID_CONFIG", `导入的智能体配置无效：${formatValidationError(error)}`);
  }
}

export async function exportAgents(vaultRoot: string): Promise<{ exportedAt: string; agents: Agent[] }> {
  return {
    exportedAt: new Date().toISOString(),
    agents: await listAgents(vaultRoot),
  };
}

export async function importAgents(
  vaultRoot: string,
  input: unknown,
  mode: ImportAgentMode = "overwrite",
): Promise<AgentImportResult> {
  const agents = parseImportAgentsPayload(input);
  const existing = new Set((await listAgents(vaultRoot)).map((agent) => agent.id));
  const imported: Agent[] = [];
  const skipped: string[] = [];
  const overwritten: string[] = [];
  const seen = new Set<string>();

  for (const agent of agents) {
    if (seen.has(agent.id)) {
      throw createHttpError(400, "AGENTS_IMPORT_DUPLICATE_ID", `导入文件中存在重复智能体 ID：${agent.id}`);
    }
    seen.add(agent.id);

    if (existing.has(agent.id) && mode === "skip") {
      skipped.push(agent.id);
      continue;
    }

    const nextAgent = agentSchema.parse({
      ...agent,
      updatedAt: new Date().toISOString(),
    });
    await writeJsonFile(vaultRoot, getAgentRelativePath(nextAgent.id), nextAgent);
    imported.push(nextAgent);
    if (existing.has(agent.id)) {
      overwritten.push(agent.id);
    }
  }

  return {
    imported,
    skipped,
    overwritten,
  };
}
