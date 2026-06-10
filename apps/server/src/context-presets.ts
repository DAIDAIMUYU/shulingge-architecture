import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import { buildContext, createDefaultAgentCatalog } from "@shulingge/agent-core";
import { CURRENT_SCHEMA_VERSION } from "@shulingge/shared";
import { readJsonFile, writeJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

export interface ContextPresetRecord {
  id: string;
  name: string;
  description?: string;
  agentId?: string;
  tokenBudget?: number;
  forceInclude: string[];
  exclude: string[];
  pinnedSources?: string[];
  systemPrompt?: string;
  schemaVersion: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContextPresetDiff {
  leftPresetId?: string;
  rightPresetId?: string;
  tokenBudgetChanged: boolean;
  systemPromptChanged: boolean;
  addedForceInclude: string[];
  removedForceInclude: string[];
  addedExclude: string[];
  removedExclude: string[];
  addedPinnedSources: string[];
  removedPinnedSources: string[];
  addedSources: string[];
  removedSources: string[];
}

function getPresetDir(): string {
  return path.posix.join("settings", "context-presets");
}

function getPresetPath(presetId: string): string {
  return path.posix.join(getPresetDir(), `${presetId}.json`);
}

function normalizePreset(input: Partial<ContextPresetRecord> & { id: string; name: string }, current?: ContextPresetRecord): ContextPresetRecord {
  const now = new Date().toISOString();
  return {
    id: input.id,
    name: input.name,
    description: input.description ?? current?.description,
    agentId: input.agentId ?? current?.agentId,
    tokenBudget: input.tokenBudget ?? current?.tokenBudget,
    forceInclude: input.forceInclude ?? current?.forceInclude ?? [],
    exclude: input.exclude ?? current?.exclude ?? [],
    pinnedSources: input.pinnedSources ?? current?.pinnedSources ?? [],
    systemPrompt: input.systemPrompt ?? current?.systemPrompt,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
}

export async function listContextPresets(vaultRoot: string): Promise<ContextPresetRecord[]> {
  const absoluteDir = path.join(vaultRoot, ...getPresetDir().split("/"));
  const entries = await readdir(absoluteDir).catch(() => []);
  const presets = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => readJsonFile<ContextPresetRecord>(vaultRoot, path.posix.join(getPresetDir(), entry))),
  );

  return presets.sort((left, right) => left.name.localeCompare(right.name));
}

export async function getContextPreset(vaultRoot: string, presetId: string): Promise<ContextPresetRecord> {
  try {
    return await readJsonFile<ContextPresetRecord>(vaultRoot, getPresetPath(presetId));
  } catch {
    throw createHttpError(404, "CONTEXT_PRESET_NOT_FOUND", `Context preset not found: ${presetId}`);
  }
}

export async function saveContextPreset(
  vaultRoot: string,
  input: Partial<ContextPresetRecord> & { id: string; name: string },
): Promise<ContextPresetRecord> {
  const current = await readJsonFile<ContextPresetRecord>(vaultRoot, getPresetPath(input.id)).catch(() => undefined);
  const next = normalizePreset(input, current);
  await writeJsonFile(vaultRoot, getPresetPath(next.id), next);
  return next;
}

export async function deleteContextPreset(vaultRoot: string, presetId: string): Promise<{ deleted: true; presetId: string }> {
  try {
    await rm(path.join(vaultRoot, ...getPresetPath(presetId).split("/")));
  } catch {
    throw createHttpError(404, "CONTEXT_PRESET_NOT_FOUND", `Context preset not found: ${presetId}`);
  }

  return {
    deleted: true,
    presetId,
  };
}

export async function buildContextPresetDiff(
  vaultRoot: string,
  input: {
    leftPresetId?: string;
    rightPresetId?: string;
    agentId: string;
    projectId: string;
    novelId: string;
    chapterId: string;
  },
): Promise<ContextPresetDiff> {
  const left = input.leftPresetId ? await getContextPreset(vaultRoot, input.leftPresetId) : undefined;
  const right = input.rightPresetId ? await getContextPreset(vaultRoot, input.rightPresetId) : undefined;
  const catalog = createDefaultAgentCatalog();

  const leftContext = await buildContext(vaultRoot, catalog, {
    agentId: left?.agentId ?? input.agentId,
    projectId: input.projectId,
    novelId: input.novelId,
    chapterId: input.chapterId,
    forceInclude: left?.forceInclude ?? [],
    exclude: left?.exclude ?? [],
    tokenBudget: left?.tokenBudget,
    presetId: left?.id,
  });
  const rightContext = await buildContext(vaultRoot, catalog, {
    agentId: right?.agentId ?? input.agentId,
    projectId: input.projectId,
    novelId: input.novelId,
    chapterId: input.chapterId,
    forceInclude: right?.forceInclude ?? [],
    exclude: right?.exclude ?? [],
    tokenBudget: right?.tokenBudget,
    presetId: right?.id,
  });

  const leftSourceSet = new Set(leftContext.sources.map((source) => source.path));
  const rightSourceSet = new Set(rightContext.sources.map((source) => source.path));

  return {
    leftPresetId: left?.id,
    rightPresetId: right?.id,
    tokenBudgetChanged: (left?.tokenBudget ?? 1200) !== (right?.tokenBudget ?? 1200),
    systemPromptChanged: (left?.systemPrompt ?? "") !== (right?.systemPrompt ?? ""),
    addedForceInclude: (right?.forceInclude ?? []).filter((value) => !(left?.forceInclude ?? []).includes(value)),
    removedForceInclude: (left?.forceInclude ?? []).filter((value) => !(right?.forceInclude ?? []).includes(value)),
    addedExclude: (right?.exclude ?? []).filter((value) => !(left?.exclude ?? []).includes(value)),
    removedExclude: (left?.exclude ?? []).filter((value) => !(right?.exclude ?? []).includes(value)),
    addedPinnedSources: (right?.pinnedSources ?? []).filter((value) => !(left?.pinnedSources ?? []).includes(value)),
    removedPinnedSources: (left?.pinnedSources ?? []).filter((value) => !(right?.pinnedSources ?? []).includes(value)),
    addedSources: [...rightSourceSet].filter((value) => !leftSourceSet.has(value)),
    removedSources: [...leftSourceSet].filter((value) => !rightSourceSet.has(value)),
  };
}
