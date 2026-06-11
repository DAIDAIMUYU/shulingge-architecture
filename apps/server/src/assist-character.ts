import { ProviderRegistry, type ChatMessage, type ProviderEndpointConfig } from "@shulingge/provider-adapters";
import { CredentialService } from "@shulingge/security";
import type { ModelConfig } from "@shulingge/shared";
import { readJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";
import { listModels } from "./models.js";

export interface AssistCharacterField {
  group?: string;
  key?: string;
  label?: string;
}

export interface AssistCharacterInput {
  mode?: "original" | "fanfic";
  userPrompt?: string;
  template?: string;
  projectId?: string;
  fields?: AssistCharacterField[];
  existingValues?: Record<string, unknown>;
}

export interface AssistCharacterResponse {
  modelId: string;
  fields: Record<string, string>;
}

export interface AssistCharacterOptions {
  credentialService: CredentialService;
  fetchImpl?: typeof fetch;
  endpoints?: Partial<Record<ModelConfig["provider"], ProviderEndpointConfig>>;
}

interface ResolvedAssistModel {
  modelId: string;
  registry: ProviderRegistry;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value) && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function";
}

async function readModelConfigs(vaultRoot: string, models: Array<{ id: string }>): Promise<Record<string, ModelConfig>> {
  return Object.fromEntries(
    await Promise.all(
      models.map(async (model) => [
        model.id,
        await readJsonFile<ModelConfig>(vaultRoot, `settings/models/${model.id}.json`),
      ]),
    ),
  );
}

async function resolveAssistModel(
  vaultRoot: string,
  options: AssistCharacterOptions,
): Promise<ResolvedAssistModel> {
  const models = await listModels(vaultRoot, options);
  const selectedModel = models.find((model) => model.hasKey);
  if (!selectedModel) {
    throw createHttpError(400, "ASSIST_MODEL_NOT_CONFIGURED", "请先在设置页配置并测试一个模型");
  }

  const configs = await readModelConfigs(vaultRoot, models);
  return {
    modelId: selectedModel.id,
    registry: new ProviderRegistry(
      {
        models: configs,
        endpoints: options.endpoints,
        fetchImpl: options.fetchImpl,
      },
      options.credentialService,
    ),
  };
}

function extractJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function normalizeFields(input: unknown): AssistCharacterField[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const fields: AssistCharacterField[] = [];
  for (const field of input) {
      if (!field || typeof field !== "object") {
      continue;
      }
      const record = field as Record<string, unknown>;
      const key = typeof record.key === "string" ? record.key.trim() : "";
      const label = typeof record.label === "string" ? record.label.trim() : "";
      if (!key && !label) {
      continue;
      }
    fields.push({
        group: typeof record.group === "string" ? record.group.trim() : "",
        key,
        label,
    });
  }

  return fields;
}

function normalizeExistingValues(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""])
      .filter(([key]) => key.trim()),
  );
}

function buildMessages(input: Required<Pick<AssistCharacterInput, "mode" | "userPrompt">> & {
  projectId?: string;
  template?: string;
  fields: AssistCharacterField[];
  existingValues: Record<string, string>;
}): ChatMessage[] {
  const fieldText = input.fields
    .map((field, index) => `${index + 1}. group=${field.group || "-"}; key=${field.key || field.label}; label=${field.label || field.key}`)
    .join("\n");
  const existingText = Object.entries(input.existingValues)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n") || "无";

  return [
    {
      role: "system",
      content: [
        "你在帮用户填写小说角色档案。",
        "用户会提供当前编辑器实时生成的字段清单，字段清单包含中文字段名，也可能包含用户自定义字段。",
        "你必须只根据这份字段清单生成内容，不要添加清单外字段，不要假设固定模板字段。",
        "默认不要覆盖 existingValues 中已经非空的字段；这些字段可以留空不返回。",
        "输出必须是严格 JSON，不要 Markdown，不要代码块，不要解释。",
        'JSON 结构必须是：{ "fields": { "<字段 key 或自定义 label>": "<生成内容>" } }',
        "自定义字段如果没有稳定 key，就使用它的 label 作为返回 key。",
        "字段内容使用中文，保持人物逻辑、语气和设定前后一致。",
        input.mode === "fanfic"
          ? "同人模式：根据用户提供的角色名和来源作品，用你已知的公开角色信息填写；不确定或不知道的字段留空，不要编造。"
          : "原创模式：根据用户的设定方向进行创作性补全，让人物鲜明、可写、字段间互相支撑。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `模式：${input.mode === "fanfic" ? "同人" : "原创"}`,
        `项目：${input.projectId || "未指定"}`,
        `模板：${input.template || "未指定"}`,
        "",
        "用户描述：",
        input.userPrompt,
        "",
        "当前编辑器字段清单：",
        fieldText,
        "",
        "已有非空字段值：",
        existingText,
      ].join("\n"),
    },
  ];
}

function normalizeResultFields(raw: string, fields: AssistCharacterField[]): Record<string, string> {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    throw createHttpError(502, "ASSIST_CHARACTER_INVALID_JSON", "AI 返回格式不是有效 JSON，请重试");
  }

  const data = parsed as Record<string, unknown>;
  const generated = data.fields;
  if (!generated || typeof generated !== "object" || Array.isArray(generated)) {
    throw createHttpError(502, "ASSIST_CHARACTER_INVALID_FIELDS", "AI 返回内容缺少 fields 字段");
  }

  const allowed = new Set<string>();
  for (const field of fields) {
    if (field.key) {
      allowed.add(field.key);
    }
    if (field.label) {
      allowed.add(field.label);
    }
  }

  return Object.fromEntries(
    Object.entries(generated as Record<string, unknown>)
      .map(([key, value]) => [key.trim(), typeof value === "string" ? value.trim() : ""])
      .filter(([key, value]) => key && value && allowed.has(key)),
  );
}

export async function assistCharacter(
  vaultRoot: string,
  input: AssistCharacterInput,
  options: AssistCharacterOptions,
): Promise<AssistCharacterResponse> {
  const mode = input.mode === "fanfic" ? "fanfic" : "original";
  const userPrompt = typeof input.userPrompt === "string" ? input.userPrompt.trim() : "";
  if (!userPrompt) {
    throw createHttpError(400, "ASSIST_CHARACTER_PROMPT_REQUIRED", "请先填写角色描述");
  }

  const fields = normalizeFields(input.fields);
  if (!fields.length) {
    throw createHttpError(400, "ASSIST_CHARACTER_FIELDS_REQUIRED", "没有可填写的角色字段");
  }

  const { modelId, registry } = await resolveAssistModel(vaultRoot, options);
  const messages = buildMessages({
    mode,
    userPrompt,
    projectId: input.projectId,
    template: input.template,
    fields,
    existingValues: normalizeExistingValues(input.existingValues),
  });

  try {
    const result = await registry.chat(modelId, {
      messages,
      stream: false,
      jsonMode: true,
      maxTokens: 5000,
    });
    const response = await result;
    if (isAsyncIterable(response)) {
      throw new Error("模型返回了流式响应，角色辅助填充接口期望完整 JSON 响应");
    }

    return {
      modelId,
      fields: normalizeResultFields(response.content, fields),
    };
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      throw error;
    }
    throw createHttpError(
      502,
      "ASSIST_CHARACTER_FAILED",
      `角色 AI 辅助填充失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
