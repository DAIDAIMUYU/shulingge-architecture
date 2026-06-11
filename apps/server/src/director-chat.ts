import { ProviderRegistry, type ChatMessage, type ProviderEndpointConfig } from "@shulingge/provider-adapters";
import { CredentialService } from "@shulingge/security";
import type { ModelConfig } from "@shulingge/shared";
import { readJsonFile } from "@shulingge/vault-core";

import { loadEditorChapter } from "./editor.js";
import { createHttpError } from "./errors.js";
import { listModels } from "./models.js";

const DIRECTOR_SYSTEM_PROMPT = [
  "你是「总控·书灵」，一位专业、克制、可靠的小说创作顾问。",
  "你的任务是与用户讨论写作思路、结构、人物、节奏、情绪和表达，提供可执行的建议与分析。",
  "本阶段你只进行对话和建议，不调度 Agent，不修改正文，不声称已经改写、保存、派发任务或执行任何操作。",
  "如果用户要求你直接修改正文，请先以顾问身份说明思路、给出建议或示例文本，但不要声称已经替用户写入正文。",
].join("\n");

const MAX_CONTEXT_CHARS = 12_000;
const MAX_HISTORY_MESSAGES = 20;

export interface DirectorChatInput {
  modelId?: string;
  projectId?: string;
  novelId?: string;
  chapterId?: string;
  messages?: Array<{
    role?: string;
    content?: string;
  }>;
}

export interface DirectorChatOptions {
  credentialService: CredentialService;
  fetchImpl?: typeof fetch;
  endpoints?: Partial<Record<ModelConfig["provider"], ProviderEndpointConfig>>;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value) && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function";
}

function normalizeChatMessages(input: DirectorChatInput["messages"]): ChatMessage[] {
  return (input ?? [])
    .map((message) => {
      const role = message.role === "assistant" || message.role === "system" || message.role === "user"
        ? message.role
        : null;
      const content = typeof message.content === "string" ? message.content.trim() : "";
      return role && content ? { role, content } : null;
    })
    .filter((message): message is ChatMessage => Boolean(message))
    .slice(-MAX_HISTORY_MESSAGES);
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

function clipContext(content: string): string {
  if (content.length <= MAX_CONTEXT_CHARS) {
    return content;
  }

  return `${content.slice(0, MAX_CONTEXT_CHARS)}\n\n【正文过长，以上为前 ${MAX_CONTEXT_CHARS.toLocaleString("zh-CN")} 字节选】`;
}

export async function chatWithDirector(
  vaultRoot: string,
  input: DirectorChatInput,
  options: DirectorChatOptions,
): Promise<{ modelId: string; reply: string }> {
  const models = await listModels(vaultRoot, options);
  const selectedModel = input.modelId
    ? models.find((model) => model.id === input.modelId)
    : models.find((model) => model.hasKey);

  if (!selectedModel) {
    throw createHttpError(400, "DIRECTOR_MODEL_NOT_CONFIGURED", "请先在设置页配置并测试一个模型");
  }
  if (!selectedModel.hasKey) {
    throw createHttpError(400, "DIRECTOR_MODEL_KEY_MISSING", "所选模型还没有写入 API Key，请先在设置页保存并测试模型");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
  ];

  if (input.projectId && input.novelId && input.chapterId) {
    const chapter = await loadEditorChapter(vaultRoot, {
      projectId: input.projectId,
      novelId: input.novelId,
      chapterId: input.chapterId,
    }).catch(() => null);
    if (chapter) {
      messages.push({
        role: "system",
        content: [
          `【当前章节上下文】`,
          `项目：${input.projectId}`,
          `卷：${input.novelId}`,
          `章节：${chapter.metadata?.title ?? input.chapterId}`,
          "",
          clipContext(chapter.content ?? ""),
        ].join("\n"),
      });
    }
  }

  messages.push(...normalizeChatMessages(input.messages));

  const configs = await readModelConfigs(vaultRoot, models);
  const registry = new ProviderRegistry(
    {
      models: configs,
      endpoints: options.endpoints,
      fetchImpl: options.fetchImpl,
    },
    options.credentialService,
  );

  try {
    const result = await registry.chat(selectedModel.id, {
      messages,
      stream: false,
      jsonMode: false,
      maxTokens: 1200,
    });

    const response = await result;
    if (isAsyncIterable(response)) {
      throw new Error("模型返回了流式响应，当前对话接口期望完整文本响应");
    }

    return {
      modelId: selectedModel.id,
      reply: response.content.trim() || "我暂时没有生成有效回复，请换一种问法再试。",
    };
  } catch (error) {
    throw createHttpError(
      502,
      "DIRECTOR_CHAT_FAILED",
      `总控对话失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
