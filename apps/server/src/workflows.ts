import { readdir } from "node:fs/promises";
import path from "node:path";

import { createDefaultAgentCatalog, createMvpAgentHandlers, createMvpWorkflowRun } from "@shulingge/agent-core";
import { ProviderRegistry, type ProviderEndpointConfig } from "@shulingge/provider-adapters";
import { CredentialService } from "@shulingge/security";
import {
  CURRENT_SCHEMA_VERSION,
  type Chapter,
  type ModelConfig,
  type RunNodeResult,
  type RunRecord,
  type Summary,
} from "@shulingge/shared";
import { readJsonFile, readManuscriptFile, writeJsonFile, writeManuscriptFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

export interface WorkflowServiceOptions {
  credentialService: CredentialService;
  fetchImpl?: typeof fetch;
  endpoints?: Partial<Record<string, ProviderEndpointConfig>>;
}

export interface ActiveWorkflowRun {
  cancel(): void;
  projectId: string;
  novelId: string;
  chapterId: string;
}

interface WorkflowLocator {
  projectId: string;
  novelId: string;
}

interface ChapterWorkflowLocator extends WorkflowLocator {
  chapterId: string;
}

interface StartWorkflowInput extends ChapterWorkflowLocator {
  workflowId?: string;
  fallbackModelId?: string;
  maxRepairRounds?: number;
  maxJsonRetries?: number;
}

function getNovelRoot(locator: WorkflowLocator): string {
  return path.posix.join("projects", locator.projectId, "novels", locator.novelId);
}

function getRunRelativePath(locator: WorkflowLocator, runId: string): string {
  return path.posix.join(getNovelRoot(locator), "runs", `${runId}.json`);
}

function getChapterMetadataPath(locator: ChapterWorkflowLocator): string {
  return path.posix.join(getNovelRoot(locator), "metadata", "chapters", `${locator.chapterId}.json`);
}

function getManuscriptPath(locator: ChapterWorkflowLocator): string {
  return path.posix.join(getNovelRoot(locator), "manuscripts", `${locator.chapterId}.md`);
}

function getSummaryPath(locator: ChapterWorkflowLocator): string {
  return path.posix.join(getNovelRoot(locator), "summaries", `${locator.chapterId}.json`);
}

function createPendingNodes(): RunNodeResult[] {
  return createDefaultAgentCatalog().active.map((agent) => ({
    agentId: agent.id,
    status: "skipped",
  }));
}

function createPendingRun(input: {
  runId: string;
  chapterId: string;
  workflowId?: string;
}): RunRecord {
  const now = new Date().toISOString();
  return {
    id: input.runId,
    chapterId: input.chapterId,
    workflowId: input.workflowId ?? "mvp-default-workflow",
    nodes: createPendingNodes(),
    tokens: { in: 0, out: 0 },
    cost: 0,
    contextSources: [],
    startedAt: now,
    endedAt: undefined,
    status: "running",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

async function listModelConfigs(vaultRoot: string): Promise<Record<string, ModelConfig>> {
  const modelsDir = path.join(vaultRoot, "settings", "models");
  const entries = await readdir(modelsDir).catch(() => []);
  const configs = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        const config = await readJsonFile<ModelConfig>(vaultRoot, path.posix.join("settings/models", entry));
        return [config.id, config] as const;
      }),
  );
  return Object.fromEntries(configs);
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value) && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function";
}

async function createModelRunner(
  vaultRoot: string,
  options: WorkflowServiceOptions,
  fallbackModelId?: string,
) {
  const configs = await listModelConfigs(vaultRoot);
  const configuredIds = Object.keys(configs);

  if (configuredIds.length === 0) {
    throw createHttpError(400, "WORKFLOW_MODEL_REQUIRED", "At least one model config is required before running agents");
  }

  const resolvedFallbackModelId =
    (fallbackModelId && configs[fallbackModelId] ? fallbackModelId : undefined) ?? configuredIds[0];
  const registry = new ProviderRegistry(
    {
      models: configs,
      endpoints: options.endpoints,
      fetchImpl: options.fetchImpl,
    },
    options.credentialService,
  );

  return {
    async chat(
      requestedModelId: string,
      request: {
        messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
        stream?: boolean;
        jsonMode?: boolean;
        maxTokens?: number;
        temperature?: number;
      },
    ) {
      const actualModelId = configs[requestedModelId] ? requestedModelId : resolvedFallbackModelId;
      const response = await registry.chat(actualModelId, {
        messages: request.messages,
        stream: false,
        jsonMode: request.jsonMode,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      });

      if (isAsyncIterable(response)) {
        throw createHttpError(500, "WORKFLOW_STREAM_UNEXPECTED", "Workflow runner expected non-stream responses");
      }

      return response;
    },
  };
}

async function updateChapterMetadataSource(
  vaultRoot: string,
  locator: ChapterWorkflowLocator,
  run: RunRecord,
): Promise<void> {
  const metadataPath = getChapterMetadataPath(locator);
  const manuscriptPath = getManuscriptPath(locator);
  const now = new Date().toISOString();
  const content = await readManuscriptFile(vaultRoot, manuscriptPath);
  const existing = await readJsonFile<Chapter>(vaultRoot, metadataPath).catch((): Chapter => ({
    id: locator.chapterId,
    novelId: locator.novelId,
    title: locator.chapterId,
    order: 0,
    manuscriptPath,
    status: "drafting" as const,
    wordCount: content.length,
    involvedCharacters: [],
    locks: [],
    finalizedAt: null,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  }));

  await writeJsonFile(vaultRoot, metadataPath, {
    ...existing,
    manuscriptPath,
    wordCount: content.trim().length,
    source: {
      ...(existing.source ?? {}),
      lastWrittenBy: "controller-agent",
      lastRunId: run.id,
    },
    updatedAt: now,
  } satisfies Chapter);
}

async function persistSummary(
  vaultRoot: string,
  locator: ChapterWorkflowLocator,
  run: RunRecord,
  summaryText: string | undefined,
): Promise<void> {
  const now = new Date().toISOString();
  const summary: Summary = {
    id: locator.chapterId,
    chapterId: locator.chapterId,
    oneLine: summaryText?.trim() || `${locator.chapterId} run ${run.status}`,
    short: summaryText?.trim() || "",
    structured: JSON.stringify({
      runId: run.id,
      workflowId: run.workflowId,
      reviewTrail: run.nodes
        .filter((node) => node.agentId !== "writer-agent" && node.agentId !== "controller-agent")
        .map((node) => ({
          agentId: node.agentId,
          status: node.status,
          score: node.score,
          hardViolations: node.hardViolations ?? 0,
          softViolations: node.softViolations ?? 0,
        })),
    }),
    stateChanges: run.nodes
      .filter((node) => (node.hardViolations ?? 0) > 0 || (node.softViolations ?? 0) > 0)
      .map((node) => `${node.agentId}:${node.status}`),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  };

  await writeJsonFile(vaultRoot, getSummaryPath(locator), summary);
}

async function finalizeRunArtifacts(
  vaultRoot: string,
  locator: ChapterWorkflowLocator,
  run: RunRecord,
  finalText: string,
  summaryText?: string,
): Promise<void> {
  if (run.status !== "ok") {
    return;
  }

  await writeManuscriptFile(vaultRoot, getManuscriptPath(locator), finalText);
  await persistSummary(vaultRoot, locator, run, summaryText);
  await updateChapterMetadataSource(vaultRoot, locator, run);
}

export async function listWorkflowRuns(
  vaultRoot: string,
  input: WorkflowLocator & { chapterId?: string; limit?: number },
): Promise<RunRecord[]> {
  const runsDir = path.join(vaultRoot, "projects", input.projectId, "novels", input.novelId, "runs");
  const entries = await readdir(runsDir).catch(() => []);
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => readJsonFile<RunRecord>(vaultRoot, path.posix.join(getNovelRoot(input), "runs", entry))),
  );

  return runs
    .filter((run) => (input.chapterId ? run.chapterId === input.chapterId : true))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, input.limit ?? 20);
}

export async function getWorkflowRun(
  vaultRoot: string,
  input: WorkflowLocator & { runId: string },
): Promise<RunRecord> {
  try {
    return await readJsonFile<RunRecord>(vaultRoot, getRunRelativePath(input, input.runId));
  } catch {
    throw createHttpError(404, "WORKFLOW_RUN_NOT_FOUND", `Run not found: ${input.runId}`);
  }
}

export async function startWorkflowRun(
  vaultRoot: string,
  activeRuns: Map<string, ActiveWorkflowRun>,
  options: WorkflowServiceOptions,
  input: StartWorkflowInput,
): Promise<RunRecord> {
  const initialContent = await readManuscriptFile(vaultRoot, getManuscriptPath(input));
  const modelRunner = await createModelRunner(vaultRoot, options, input.fallbackModelId);
  const handlers = createMvpAgentHandlers({
    vaultRoot,
    projectId: input.projectId,
    novelId: input.novelId,
    chapterId: input.chapterId,
    modelRunner,
  });
  const handle = createMvpWorkflowRun(handlers, {
    workflowId: input.workflowId,
    chapterId: input.chapterId,
    initialContent,
    maxRepairRounds: input.maxRepairRounds,
    maxJsonRetries: input.maxJsonRetries,
  });

  const pendingRun = createPendingRun({
    runId: handle.runId,
    chapterId: input.chapterId,
    workflowId: input.workflowId,
  });
  await writeJsonFile(vaultRoot, getRunRelativePath(input, handle.runId), pendingRun);

  activeRuns.set(handle.runId, {
    cancel: () => handle.cancel(),
    projectId: input.projectId,
    novelId: input.novelId,
    chapterId: input.chapterId,
  });

  void handle.result
    .then(async (outcome) => {
      const completedRun: RunRecord = {
        ...outcome.run,
        createdAt: pendingRun.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await finalizeRunArtifacts(vaultRoot, input, completedRun, outcome.state.chapterContent, outcome.state.summary);
      await writeJsonFile(vaultRoot, getRunRelativePath(input, handle.runId), completedRun);
    })
    .catch(async (error) => {
      const failedRun: RunRecord = {
        ...pendingRun,
        endedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "failed",
        nodes: pendingRun.nodes,
        contextSources: [],
      };
      await writeJsonFile(vaultRoot, getRunRelativePath(input, handle.runId), failedRun).catch(() => undefined);
      void error;
    })
    .finally(() => {
      activeRuns.delete(handle.runId);
    });

  return pendingRun;
}

export async function waitForWorkflowRun(
  vaultRoot: string,
  input: WorkflowLocator & { runId: string },
  timeoutMs = 20_000,
): Promise<RunRecord> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const run = await getWorkflowRun(vaultRoot, input);
    if (run.status !== "running") {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return getWorkflowRun(vaultRoot, input);
}

export async function cancelWorkflowRun(
  activeRuns: Map<string, ActiveWorkflowRun>,
  runId: string,
): Promise<{ runId: string; cancelled: boolean }> {
  const activeRun = activeRuns.get(runId);
  if (!activeRun) {
    throw createHttpError(404, "WORKFLOW_RUN_NOT_ACTIVE", `Run is not active: ${runId}`);
  }

  activeRun.cancel();
  return {
    runId,
    cancelled: true,
  };
}
