import { ProviderRegistry, type ChatMessage, type ProviderEndpointConfig } from "@shulingge/provider-adapters";
import { CredentialService } from "@shulingge/security";
import type { ModelConfig } from "@shulingge/shared";
import { readJsonFile } from "@shulingge/vault-core";

import { listAgents } from "./agents.js";
import { loadEditorChapter } from "./editor.js";
import { createHttpError } from "./errors.js";
import { listModels } from "./models.js";

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

export interface DirectorTaskSuggestion {
  agentId: string;
  agentName: string;
  taskDescription: string;
  confirmText: string;
}

export type DirectorChatResponse =
  | {
      modelId: string;
      mode: "chat";
      reply: string;
    }
  | {
      modelId: string;
      mode: "task";
      task: DirectorTaskSuggestion;
    };

export interface DirectorChatOptions {
  credentialService: CredentialService;
  fetchImpl?: typeof fetch;
  endpoints?: Partial<Record<ModelConfig["provider"], ProviderEndpointConfig>>;
}

interface AgentRosterItem {
  id: string;
  name: string;
  description: string;
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

  return `${content.slice(0, MAX_CONTEXT_CHARS)}\n\n【正文过长，以上为前 ${MAX_CONTEXT_CHARS.toLocaleString("zh-CN")} 字截取。】`;
}

function buildSystemPrompt(roster: AgentRosterItem[]): string {
  const rosterText = roster.length > 0
    ? roster.map((agent) => `- ${agent.id}｜${agent.name}：${agent.description || "无职责描述"}`).join("\n")
    : "当前没有启用的 Agent。";

  return [
    "你是「总控·书灵」，一位专业、克制、可靠的小说创作顾问。",
    "你会与用户讨论写作思路、结构、人物、节奏、情绪和表达，也可以识别用户是否在下达明确的写作执行指令。",
    "",
    "本阶段你只能进行意图判断、对话和请求确认。即使判断为任务，也不要声称已经修改正文、已经派发任务或已经执行任何操作。",
    "",
    "可调度 Agent 清单如下。若要返回任务，agentId 必须严格来自这个清单：",
    rosterText,
    "",
    "你必须只输出严格 JSON，不要输出 Markdown，不要包裹代码块，不要添加 JSON 之外的文字。",
    "输出结构只能二选一：",
    '{ "mode": "chat", "reply": "<给用户的对话回复>" }',
    '{ "mode": "task", "agentId": "<清单中的Agent id>", "agentName": "<该Agent名字>", "taskDescription": "<要让该Agent做什么，简明中文>", "confirmText": "<向用户确认的话>" }',
    "",
    "判断原则：",
    "1. 用户在询问意见、讨论思路、闲聊、请你分析优缺点或给建议时，一律 mode=chat。",
    "2. 只有用户明确要求改写、润色、续写、扩写、删改、替换、调整正文等可执行写作动作时，才 mode=task。",
    "3. 拿不准时倾向 mode=chat，先追问或给建议，不要误判成执行。",
    "4. 如果没有合适 Agent，返回 mode=chat，并说明暂时没有合适的可用 Agent。",
    "5. task 模式的 confirmText 要明确说明准备让哪个 Agent 做什么，并询问用户是否确认执行。",
  ].join("\n");
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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDirectorOutput(
  modelId: string,
  raw: string,
  roster: AgentRosterItem[],
): DirectorChatResponse {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    return {
      modelId,
      mode: "chat",
      reply: raw.trim() || "我暂时没有生成有效回复，请换一种问法再试。",
    };
  }

  const data = parsed as Record<string, unknown>;
  if (data.mode === "task") {
    const agentId = asString(data.agentId);
    const agent = roster.find((item) => item.id === agentId);
    if (!agent) {
      return {
        modelId,
        mode: "chat",
        reply: "我理解这是一个可执行的写作请求，但当前没有匹配的可用 Agent。请先在 Agent 管理页启用或配置合适的 Agent。",
      };
    }

    const taskDescription = asString(data.taskDescription);
    const agentName = asString(data.agentName) || agent.name;
    const confirmText = asString(data.confirmText)
      || `我准备让【${agentName}】执行「${taskDescription || "这个写作任务"}」，确认执行吗？`;

    return {
      modelId,
      mode: "task",
      task: {
        agentId: agent.id,
        agentName,
        taskDescription: taskDescription || "执行用户刚才提出的写作任务",
        confirmText,
      },
    };
  }

  return {
    modelId,
    mode: "chat",
    reply: asString(data.reply) || raw.trim() || "我暂时没有生成有效回复，请换一种问法再试。",
  };
}

export async function chatWithDirector(
  vaultRoot: string,
  input: DirectorChatInput,
  options: DirectorChatOptions,
): Promise<DirectorChatResponse> {
  const models = await listModels(vaultRoot, options);
  const availableModels = models.filter((model) => model.hasKey);
  const selectedModel = (input.modelId
    ? availableModels.find((model) => model.id === input.modelId)
    : undefined) ?? availableModels[0];

  if (!selectedModel) {
    throw createHttpError(400, "DIRECTOR_MODEL_NOT_CONFIGURED", "请先在设置页配置并测试一个模型");
  }

  const enabledAgents = (await listAgents(vaultRoot)).filter((agent) => agent.enabled);
  const roster = enabledAgents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
  }));

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(roster) },
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
          "【当前章节上下文】",
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
      jsonMode: true,
      maxTokens: 1200,
    });

    const response = await result;
    if (isAsyncIterable(response)) {
      throw new Error("模型返回了流式响应，当前总控对话接口期望完整文本响应");
    }

    return normalizeDirectorOutput(selectedModel.id, response.content, roster);
  } catch (error) {
    throw createHttpError(
      502,
      "DIRECTOR_CHAT_FAILED",
      `总控对话失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
