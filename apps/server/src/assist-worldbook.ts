import { ProviderRegistry, type ChatMessage, type ProviderEndpointConfig } from "@shulingge/provider-adapters";
import { CredentialService } from "@shulingge/security";
import type { ModelConfig } from "@shulingge/shared";
import { readJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";
import { listModels } from "./models.js";

export interface AssistWorldbookField {
  group?: string;
  key?: string;
  label?: string;
}

export interface AssistWorldbookInput {
  mode?: "original" | "fanfic";
  userPrompt?: string;
  entryName?: string;
  sourceWork?: string;
  scopeInstruction?: string;
  template?: string;
  category?: string;
  projectId?: string;
  fields?: AssistWorldbookField[];
  existingValues?: Record<string, unknown>;
}

export interface AssistWorldbookResponse {
  modelId: string;
  fields: Record<string, string>;
}

export interface AssistWorldbookOptions {
  credentialService: CredentialService;
  fetchImpl?: typeof fetch;
  endpoints?: Partial<Record<ModelConfig["provider"], ProviderEndpointConfig>>;
}

interface ResolvedAssistModel {
  modelId: string;
  registry: ProviderRegistry;
}

interface AssistBatch {
  name: string;
  fields: AssistWorldbookField[];
}

const MAX_GENERATION_ATTEMPTS = 3;
const BATCH_FIELD_THRESHOLD = 48;
const BATCH_MAX_TOKENS = 7000;

class AssistJsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistJsonParseError";
  }
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

async function resolveAssistModel(vaultRoot: string, options: AssistWorldbookOptions): Promise<ResolvedAssistModel> {
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

function cleanJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const unfenced = (fenced?.[1] ?? trimmed)
    .replace(/^\uFEFF/, "")
    .trim();

  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return unfenced.slice(start, end + 1).trim();
  }

  return unfenced;
}

function extractJsonObject(raw: string): unknown | null {
  const candidate = cleanJsonCandidate(raw);
  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

function normalizeFields(input: unknown): AssistWorldbookField[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const fields: AssistWorldbookField[] = [];
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

function createFieldBatches(fields: AssistWorldbookField[], template?: string): AssistBatch[] {
  if (template !== "detailed" && fields.length <= BATCH_FIELD_THRESHOLD) {
    return [{ name: "全部字段", fields }];
  }

  const byGroup = new Map<string, AssistWorldbookField[]>();
  for (const field of fields) {
    const group = field.group?.trim() || "未分组字段";
    byGroup.set(group, [...(byGroup.get(group) ?? []), field]);
  }

  const batches: AssistBatch[] = [];
  for (const [group, groupFields] of byGroup.entries()) {
    if (groupFields.length <= BATCH_FIELD_THRESHOLD) {
      batches.push({ name: group, fields: groupFields });
      continue;
    }

    for (let index = 0; index < groupFields.length; index += BATCH_FIELD_THRESHOLD) {
      batches.push({
        name: `${group} ${Math.floor(index / BATCH_FIELD_THRESHOLD) + 1}`,
        fields: groupFields.slice(index, index + BATCH_FIELD_THRESHOLD),
      });
    }
  }

  return batches;
}

function buildMessages(input: Required<Pick<AssistWorldbookInput, "mode" | "userPrompt">> & {
  projectId?: string;
  template?: string;
  category?: string;
  entryName?: string;
  sourceWork?: string;
  scopeInstruction?: string;
  fields: AssistWorldbookField[];
  existingValues: Record<string, string>;
  batchName: string;
  attempt: number;
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
        "你在帮用户填写小说【世界大纲】设定条目。",
        "用户会提供当前编辑器实时生成的字段清单，字段清单包含中文字段名，也可能包含用户自定义字段。",
        "你必须只根据这份字段清单生成内容，不要添加清单外字段，不要假设固定模板字段。",
        "默认不要覆盖 existingValues 中已经非空的字段；这些字段可以留空不返回。",
        "如果用户明确指定了要填写的字段、字段名或大类，只生成这些范围内的字段；如果没有指定具体范围，则为本批清单中所有空字段生成内容。",
        "用户指定范围时，你必须从本批字段清单中匹配对应字段或大类；不要生成范围外字段。",
        "输出必须是严格 JSON。不要 Markdown，不要代码块，不要解释，不要 JSON 前后的说明文字。",
        "只输出一个 JSON 对象，第一个字符必须是 {，最后一个字符必须是 }。",
        "字段值中的引号、换行和特殊字符必须符合 JSON 字符串转义规则；尽量用简洁短句，避免过长段落。",
        'JSON 结构必须是：{ "fields": { "<字段 key 或自定义 label>": "<生成内容>" } }',
        "自定义字段如果没有稳定 key，就使用它的 label 作为返回 key。",
        "字段内容使用中文，保持世界观逻辑、类型特征和设定前后一致。",
        input.mode === "fanfic"
          ? "同人模式：根据用户提供的条目名和来源作品，用你已知的公开资料填写该设定；不确定或不知道的字段留空，不要编造。"
          : "原创模式：根据用户的设定方向，为该类型的世界设定进行创作性补全，让设定可写、清晰、能被 AI 用于后续创作。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `模式：${input.mode === "fanfic" ? "同人" : "原创"}`,
        `项目：${input.projectId || "未指定"}`,
        `模板：${input.template || "未指定"}`,
        `设定类型：${input.category || "未指定"}`,
        input.mode === "fanfic" ? `条目名：${input.entryName || "未指定"}` : "",
        input.mode === "fanfic" ? `来源作品：${input.sourceWork || "未指定"}` : "",
        input.scopeInstruction ? `用户指定填充范围：${input.scopeInstruction}` : "用户未指定具体填充范围：请填充本批字段清单中的所有空字段。",
        `当前批次：${input.batchName}`,
        input.attempt > 1
          ? `这是第 ${input.attempt} 次请求。上一次输出不是可解析的 JSON。请只输出纯 JSON 对象，不要任何解释、标题、前后缀或 Markdown。`
          : "",
        "",
        "用户描述：",
        input.userPrompt,
        "",
        "本批字段清单：",
        fieldText,
        "",
        "已有非空字段值：",
        existingText,
      ].join("\n"),
    },
  ];
}

function normalizeResultFields(raw: string, fields: AssistWorldbookField[]): Record<string, string> {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new AssistJsonParseError("AI 返回格式不是有效 JSON");
  }

  const data = parsed as Record<string, unknown>;
  const generated = data.fields;
  if (!generated || typeof generated !== "object" || Array.isArray(generated)) {
    throw new AssistJsonParseError("AI 返回内容缺少 fields 字段");
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

async function generateFieldBatch(
  registry: ProviderRegistry,
  modelId: string,
  input: Required<Pick<AssistWorldbookInput, "mode" | "userPrompt">> & {
    projectId?: string;
    template?: string;
    category?: string;
    entryName?: string;
    sourceWork?: string;
    scopeInstruction?: string;
    fields: AssistWorldbookField[];
    existingValues: Record<string, string>;
    batchName: string;
  },
): Promise<Record<string, string>> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const result = await registry.chat(modelId, {
        messages: buildMessages({ ...input, attempt }),
        stream: false,
        jsonMode: true,
        maxTokens: BATCH_MAX_TOKENS,
      });
      const response = await result;
      if (isAsyncIterable(response)) {
        throw new Error("模型返回了流式响应，世界大纲辅助填充接口期望完整 JSON 响应");
      }

      return normalizeResultFields(response.content, input.fields);
    } catch (error) {
      lastError = error;
      if (!(error instanceof AssistJsonParseError)) {
        throw error;
      }
    }
  }

  throw createHttpError(
    502,
    "ASSIST_WORLDBOOK_INVALID_JSON",
    `AI 返回格式不是有效 JSON，请重试。失败批次：${input.batchName}；原因：${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export async function assistWorldbook(
  vaultRoot: string,
  input: AssistWorldbookInput,
  options: AssistWorldbookOptions,
): Promise<AssistWorldbookResponse> {
  const mode = input.mode === "fanfic" ? "fanfic" : "original";
  const userPrompt = typeof input.userPrompt === "string" ? input.userPrompt.trim() : "";
  if (!userPrompt) {
    throw createHttpError(400, "ASSIST_WORLDBOOK_PROMPT_REQUIRED", "请先填写世界大纲设定描述");
  }

  const fields = normalizeFields(input.fields);
  if (!fields.length) {
    throw createHttpError(400, "ASSIST_WORLDBOOK_FIELDS_REQUIRED", "没有可填写的世界大纲字段");
  }

  const { modelId, registry } = await resolveAssistModel(vaultRoot, options);
  const existingValues = normalizeExistingValues(input.existingValues);
  const batches = createFieldBatches(fields, input.template);
  const mergedFields: Record<string, string> = {};

  try {
    for (const batch of batches) {
      const batchResult = await generateFieldBatch(registry, modelId, {
        mode,
        userPrompt,
        projectId: input.projectId,
        template: input.template,
        category: input.category,
        entryName: typeof input.entryName === "string" ? input.entryName.trim() : "",
        sourceWork: typeof input.sourceWork === "string" ? input.sourceWork.trim() : "",
        scopeInstruction: typeof input.scopeInstruction === "string" ? input.scopeInstruction.trim() : "",
        fields: batch.fields,
        existingValues,
        batchName: batch.name,
      });
      Object.assign(mergedFields, batchResult);
    }

    return {
      modelId,
      fields: mergedFields,
    };
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      throw error;
    }
    throw createHttpError(
      502,
      "ASSIST_WORLDBOOK_FAILED",
      `世界大纲 AI 辅助填充失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
