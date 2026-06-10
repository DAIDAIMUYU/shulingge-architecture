import { readdir } from "node:fs/promises";
import path from "node:path";

import { ProviderRegistry, type ProviderEndpointConfig } from "@shulingge/provider-adapters";
import { CredentialService } from "@shulingge/security";
import {
  CURRENT_SCHEMA_VERSION,
  modelConfigSchema,
  type ModelConfig,
} from "@shulingge/shared";
import { readJsonFile, resolveSafePath, writeJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

export interface ModelRecordPublic extends Omit<ModelConfig, "keyRef"> {
  keyRef?: string;
  hasKey: boolean;
}

export interface ModelStoreOptions {
  credentialService: CredentialService;
  fetchImpl?: typeof fetch;
  endpoints?: Partial<Record<ModelConfig["provider"], ProviderEndpointConfig>>;
}

interface CreateModelInput {
  id?: string;
  provider?: ModelConfig["provider"];
  model?: string;
  keyRef?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
  longContext?: boolean;
  thinking?: ModelConfig["thinking"];
  stream?: boolean;
  jsonMode?: boolean;
  fallbackModelId?: string;
  costLimit?: number;
}

type UpdateModelInput = Omit<CreateModelInput, "id" | "provider" | "model"> & {
  provider?: ModelConfig["provider"];
  model?: string;
};

function hasId(value: CreateModelInput | UpdateModelInput): value is CreateModelInput & { id: string } {
  return "id" in value && typeof value.id === "string";
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value) && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function";
}

function getModelsDir(vaultRoot: string): string {
  return resolveSafePath(vaultRoot, "settings/models");
}

function getModelRelativePath(modelId: string): string {
  return path.posix.join("settings/models", `${modelId}.json`);
}

async function ensureUniqueModel(vaultRoot: string, modelId: string): Promise<void> {
  try {
    await readJsonFile<ModelConfig>(vaultRoot, getModelRelativePath(modelId));
    throw createHttpError(409, "MODELS_ALREADY_EXISTS", `Model config already exists: ${modelId}`);
  } catch (error) {
    if (error instanceof Error && /MODELS_ALREADY_EXISTS/.test(error.message)) {
      throw error;
    }
  }
}

function toPublicModel(model: ModelConfig, hasKey: boolean): ModelRecordPublic {
  return {
    ...model,
    keyRef: model.keyRef,
    hasKey,
  };
}

async function getHasKey(
  credentialService: CredentialService,
  keyRef?: string,
): Promise<boolean> {
  if (!keyRef) {
    return false;
  }

  return (await credentialService.getStoredCredentialStatus(keyRef)).hasKey;
}

function normalizeModelConfig(input: CreateModelInput | UpdateModelInput, current?: ModelConfig): ModelConfig {
  const now = new Date().toISOString();
  const modelConfig: ModelConfig = {
    id: (hasId(input) ? input.id : undefined) ?? current?.id ?? "",
    provider: input.provider ?? current?.provider ?? "openai-compatible",
    model: input.model ?? current?.model ?? "",
    keyRef: input.keyRef ?? current?.keyRef,
    temperature: input.temperature ?? current?.temperature,
    topP: input.topP ?? current?.topP,
    maxTokens: input.maxTokens ?? current?.maxTokens,
    contextWindow: input.contextWindow ?? current?.contextWindow,
    longContext: input.longContext ?? current?.longContext,
    thinking: input.thinking ?? current?.thinking,
    stream: input.stream ?? current?.stream,
    jsonMode: input.jsonMode ?? current?.jsonMode,
    fallbackModelId: input.fallbackModelId ?? current?.fallbackModelId,
    costLimit: input.costLimit ?? current?.costLimit,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };

  return modelConfigSchema.parse(modelConfig);
}

export async function listModels(
  vaultRoot: string,
  options: ModelStoreOptions,
): Promise<ModelRecordPublic[]> {
  const modelsDir = getModelsDir(vaultRoot);

  try {
    const entries = await readdir(modelsDir);
    const records = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map(async (entry) => {
          const model = await readJsonFile<ModelConfig>(
            vaultRoot,
            path.posix.join("settings/models", entry),
          );
          return toPublicModel(model, await getHasKey(options.credentialService, model.keyRef));
        }),
    );

    return records.sort((left, right) => left.id.localeCompare(right.id));
  } catch {
    return [];
  }
}

export async function getModel(
  vaultRoot: string,
  modelId: string,
  options: ModelStoreOptions,
): Promise<ModelRecordPublic> {
  try {
    const model = await readJsonFile<ModelConfig>(vaultRoot, getModelRelativePath(modelId));
    return toPublicModel(model, await getHasKey(options.credentialService, model.keyRef));
  } catch {
    throw createHttpError(404, "MODELS_NOT_FOUND", `Model config not found: ${modelId}`);
  }
}

export async function createModel(
  vaultRoot: string,
  input: CreateModelInput,
  options: ModelStoreOptions,
): Promise<ModelRecordPublic> {
  if (!input.id || !input.provider || !input.model) {
    throw createHttpError(400, "MODELS_INVALID_CREATE", "id, provider, and model are required");
  }

  await ensureUniqueModel(vaultRoot, input.id);
  const modelConfig = normalizeModelConfig(input);
  await writeJsonFile(vaultRoot, getModelRelativePath(modelConfig.id), modelConfig);
  return toPublicModel(modelConfig, await getHasKey(options.credentialService, modelConfig.keyRef));
}

export async function updateModel(
  vaultRoot: string,
  modelId: string,
  input: UpdateModelInput,
  options: ModelStoreOptions,
): Promise<ModelRecordPublic> {
  const current = await readJsonFile<ModelConfig>(vaultRoot, getModelRelativePath(modelId)).catch(() => null);
  if (!current) {
    throw createHttpError(404, "MODELS_NOT_FOUND", `Model config not found: ${modelId}`);
  }

  const next = normalizeModelConfig({ ...input, id: modelId }, current);
  await writeJsonFile(vaultRoot, getModelRelativePath(modelId), next);
  return toPublicModel(next, await getHasKey(options.credentialService, next.keyRef));
}

export async function storeModelApiKey(
  vaultRoot: string,
  modelId: string,
  apiKey: string,
  options: ModelStoreOptions,
): Promise<{ id: string; hasKey: boolean; keyRef: string }> {
  const current = await readJsonFile<ModelConfig>(vaultRoot, getModelRelativePath(modelId)).catch(() => null);
  if (!current) {
    throw createHttpError(404, "MODELS_NOT_FOUND", `Model config not found: ${modelId}`);
  }
  if (!apiKey) {
    throw createHttpError(400, "MODELS_INVALID_API_KEY", "apiKey is required");
  }

  const keyRef = current.keyRef ?? `provider:${current.provider}:${modelId}`;
  await options.credentialService.storeApiKey(keyRef, apiKey);

  if (current.keyRef !== keyRef) {
    const next = normalizeModelConfig({ keyRef }, current);
    await writeJsonFile(vaultRoot, getModelRelativePath(modelId), next);
  }

  return {
    id: modelId,
    hasKey: true,
    keyRef,
  };
}

export async function testModelConnection(
  vaultRoot: string,
  modelId: string,
  options: ModelStoreOptions,
): Promise<{
  ok: true;
  modelId: string;
  provider: ModelConfig["provider"];
  model: string;
  contentPreview: string;
}> {
  const models = await listModels(vaultRoot, options);
  const model = models.find((item) => item.id === modelId);
  if (!model) {
    throw createHttpError(404, "MODELS_NOT_FOUND", `Model config not found: ${modelId}`);
  }

  const configs = Object.fromEntries(
    (await Promise.all(
      models.map(async (item) => [
        item.id,
        await readJsonFile<ModelConfig>(vaultRoot, getModelRelativePath(item.id)),
      ]),
    )),
  );

  const registry = new ProviderRegistry(
    {
      models: configs,
      endpoints: options.endpoints,
      fetchImpl: options.fetchImpl,
    },
    options.credentialService,
  );

  const result = await registry.chat(modelId, {
    messages: [
      { role: "system", content: "Reply with a short connectivity confirmation." },
      { role: "user", content: "ping" },
    ],
    stream: false,
    jsonMode: false,
    maxTokens: 64,
  });

  const response = await result;
  if (isAsyncIterable(response)) {
    throw createHttpError(500, "MODELS_TEST_STREAM_UNEXPECTED", "Expected non-stream model test response");
  }
  const contentPreview = response.content.slice(0, 120);

  return {
    ok: true,
    modelId: model.id,
    provider: model.provider,
    model: model.model,
    contentPreview,
  };
}
