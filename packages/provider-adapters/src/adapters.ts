import type { ModelConfig, ProviderType } from "@shulingge/shared";

import { createProviderAdapterError } from "./errors.js";
import {
  parseAnthropicSseChunk,
  parseOpenAiSseChunk,
  parseUsageRecord,
  streamSseChunks,
} from "./stream.js";
import type {
  AdapterCreateOptions,
  ChatChunk,
  ChatModel,
  ChatRequest,
  ChatResponse,
  ModelSupports,
  UsageReport,
} from "./types.js";

const DEFAULT_HEADERS = {
  "content-type": "application/json",
};

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  return fetchImpl ?? fetch;
}

async function ensureOk(response: Response, provider: ProviderType): Promise<void> {
  if (response.ok) {
    return;
  }

  const text = await response.text();
  throw createProviderAdapterError(
    provider,
    "PROVIDER_REQUEST_FAILED",
    `${provider} request failed with status ${response.status}: ${text}`,
  );
}

function toUsageReport(
  modelConfig: ModelConfig,
  tokens: UsageReport["tokens"],
  streamed: boolean,
): UsageReport {
  return {
    modelConfigId: modelConfig.id,
    provider: modelConfig.provider,
    model: modelConfig.model,
    tokens,
    streamed,
  };
}

function maybeReportUsage(
  callback: AdapterCreateOptions["onUsage"],
  report: UsageReport,
): void {
  if (!callback) {
    return;
  }

  void callback(report);
}

function buildOpenAiPayload(modelConfig: ModelConfig, request: ChatRequest): Record<string, unknown> {
  return {
    model: modelConfig.model,
    messages: request.messages,
    temperature: request.temperature ?? modelConfig.temperature,
    top_p: request.topP ?? modelConfig.topP,
    max_tokens: request.maxTokens ?? modelConfig.maxTokens,
    stream: request.stream ?? modelConfig.stream ?? false,
    response_format: request.jsonMode ?? modelConfig.jsonMode ? { type: "json_object" } : undefined,
  };
}

async function parseOpenAiResponse(
  response: Response,
  provider: ProviderType,
): Promise<{ content: string; usage: ChatResponse["usage"]; finishReason?: string }> {
  await ensureOk(response, provider);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: unknown;
  };

  const choice = payload.choices?.[0];
  return {
    content: choice?.message?.content ?? "",
    usage: parseUsageRecord(payload.usage),
    finishReason: choice?.finish_reason,
  };
}

async function parseAnthropicResponse(
  response: Response,
): Promise<{ content: string; usage: ChatResponse["usage"]; finishReason?: string }> {
  await ensureOk(response, "anthropic");
  const payload = (await response.json()) as {
    content?: Array<{ text?: string }>;
    usage?: unknown;
    stop_reason?: string;
  };

  return {
    content: payload.content?.map((item) => item.text ?? "").join("") ?? "",
    usage: parseUsageRecord(payload.usage),
    finishReason: payload.stop_reason,
  };
}

async function parseOllamaResponse(
  response: Response,
): Promise<{ content: string; usage: ChatResponse["usage"]; finishReason?: string }> {
  await ensureOk(response, "ollama");
  const payload = (await response.json()) as {
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
    done_reason?: string;
  };

  return {
    content: payload.message?.content ?? "",
    usage: {
      in: payload.prompt_eval_count ?? 0,
      out: payload.eval_count ?? 0,
    },
    finishReason: payload.done_reason,
  };
}

function createSupports(provider: ProviderType): ModelSupports {
  switch (provider) {
    case "anthropic":
      return { stream: true, jsonMode: true, longContext: true, thinking: true };
    case "ollama":
      return { stream: true, jsonMode: true, longContext: false, thinking: false };
    default:
      return { stream: true, jsonMode: true, longContext: false, thinking: false };
  }
}

export function createOpenAiCompatibleModel(options: AdapterCreateOptions): ChatModel {
  const provider = options.modelConfig.provider;
  const fetchImpl = resolveFetch(options.fetchImpl);
  const supports = createSupports(provider);
  const streamEnabled = (request: ChatRequest) => request.stream ?? options.modelConfig.stream ?? false;

  return {
    id: options.modelConfig.id,
    provider,
    supports,
    chat(request): Promise<ChatResponse> | AsyncIterable<ChatChunk> {
      if (streamEnabled(request)) {
        return {
          async *[Symbol.asyncIterator](): AsyncIterator<ChatChunk> {
            const response = await fetchImpl(
              new URL(options.endpoint.apiPath ?? "/chat/completions", options.endpoint.baseUrl),
              {
                method: "POST",
                headers: {
                  ...DEFAULT_HEADERS,
                  Authorization: `Bearer ${options.apiKey ?? ""}`,
                },
                body: JSON.stringify(buildOpenAiPayload(options.modelConfig, request)),
              },
            );
            await ensureOk(response, provider);
            const chunks = streamSseChunks(response, parseOpenAiSseChunk);

            for await (const chunk of chunks) {
              if (chunk.type === "done" && chunk.usage) {
                maybeReportUsage(
                  options.onUsage,
                  toUsageReport(options.modelConfig, chunk.usage, true),
                );
              }
              yield chunk;
            }
          },
        };
      }

      return (async (): Promise<ChatResponse> => {
        const response = await fetchImpl(
          new URL(options.endpoint.apiPath ?? "/chat/completions", options.endpoint.baseUrl),
          {
            method: "POST",
            headers: {
              ...DEFAULT_HEADERS,
              Authorization: `Bearer ${options.apiKey ?? ""}`,
            },
            body: JSON.stringify(buildOpenAiPayload(options.modelConfig, request)),
          },
        );

        const parsed = await parseOpenAiResponse(response, provider);
        maybeReportUsage(options.onUsage, toUsageReport(options.modelConfig, parsed.usage, false));

        return {
          model: options.modelConfig.model,
          provider,
          content: parsed.content,
          usage: parsed.usage,
          finishReason: parsed.finishReason,
        } satisfies ChatResponse;
      })();
    },
  };
}

export function createAnthropicModel(options: AdapterCreateOptions): ChatModel {
  const fetchImpl = resolveFetch(options.fetchImpl);

  return {
    id: options.modelConfig.id,
    provider: "anthropic",
    supports: createSupports("anthropic"),
    chat(request): Promise<ChatResponse> | AsyncIterable<ChatChunk> {
      if (request.stream ?? options.modelConfig.stream ?? false) {
        return {
          async *[Symbol.asyncIterator](): AsyncIterator<ChatChunk> {
            const response = await fetchImpl(
              new URL(options.endpoint.apiPath ?? "/messages", options.endpoint.baseUrl),
              {
                method: "POST",
                headers: {
                  ...DEFAULT_HEADERS,
                  "x-api-key": options.apiKey ?? "",
                  "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                  model: options.modelConfig.model,
                  system: request.messages
                    .filter((message) => message.role === "system")
                    .map((message) => message.content)
                    .join("\n\n"),
                  messages: request.messages
                    .filter((message) => message.role !== "system")
                    .map((message) => ({
                      role: message.role,
                      content: message.content,
                    })),
                  temperature: request.temperature ?? options.modelConfig.temperature,
                  max_tokens: request.maxTokens ?? options.modelConfig.maxTokens ?? 1024,
                  stream: true,
                }),
              },
            );
            await ensureOk(response, "anthropic");
            const chunks = streamSseChunks(response, parseAnthropicSseChunk);
            for await (const chunk of chunks) {
              if (chunk.type === "done" && chunk.usage) {
                maybeReportUsage(
                  options.onUsage,
                  toUsageReport(options.modelConfig, chunk.usage, true),
                );
              }
              yield chunk;
            }
          },
        };
      }

      return (async (): Promise<ChatResponse> => {
        const response = await fetchImpl(
          new URL(options.endpoint.apiPath ?? "/messages", options.endpoint.baseUrl),
          {
            method: "POST",
            headers: {
              ...DEFAULT_HEADERS,
              "x-api-key": options.apiKey ?? "",
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: options.modelConfig.model,
              system: request.messages
                .filter((message) => message.role === "system")
                .map((message) => message.content)
                .join("\n\n"),
              messages: request.messages
                .filter((message) => message.role !== "system")
                .map((message) => ({
                  role: message.role,
                  content: message.content,
                })),
              temperature: request.temperature ?? options.modelConfig.temperature,
              max_tokens: request.maxTokens ?? options.modelConfig.maxTokens ?? 1024,
              stream: false,
            }),
          },
        );

        const parsed = await parseAnthropicResponse(response);
        maybeReportUsage(options.onUsage, toUsageReport(options.modelConfig, parsed.usage, false));

        return {
          model: options.modelConfig.model,
          provider: "anthropic",
          content: parsed.content,
          usage: parsed.usage,
          finishReason: parsed.finishReason,
        } satisfies ChatResponse;
      })();
    },
  };
}

export function createOllamaModel(options: AdapterCreateOptions): ChatModel {
  const fetchImpl = resolveFetch(options.fetchImpl);

  return {
    id: options.modelConfig.id,
    provider: "ollama",
    supports: createSupports("ollama"),
    chat(request): Promise<ChatResponse> | AsyncIterable<ChatChunk> {
      if (request.stream ?? options.modelConfig.stream ?? false) {
        return {
          async *[Symbol.asyncIterator](): AsyncIterator<ChatChunk> {
            const response = await fetchImpl(
              new URL(options.endpoint.apiPath ?? "/api/chat", options.endpoint.baseUrl),
              {
                method: "POST",
                headers: DEFAULT_HEADERS,
                body: JSON.stringify({
                  model: options.modelConfig.model,
                  messages: request.messages,
                  stream: true,
                  format: request.jsonMode ?? options.modelConfig.jsonMode ? "json" : undefined,
                  options: {
                    temperature: request.temperature ?? options.modelConfig.temperature,
                    top_p: request.topP ?? options.modelConfig.topP,
                    num_predict: request.maxTokens ?? options.modelConfig.maxTokens,
                  },
                }),
              },
            );
            await ensureOk(response, "ollama");
            if (!response.body) {
              throw createProviderAdapterError("ollama", "PROVIDER_STREAM_MISSING", "Missing ollama stream body");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                if (!line.trim()) {
                  continue;
                }
                const payload = JSON.parse(line) as {
                  message?: { content?: string };
                  done?: boolean;
                  prompt_eval_count?: number;
                  eval_count?: number;
                  done_reason?: string;
                };
                if (payload.message?.content) {
                  yield { type: "delta", delta: payload.message.content };
                }
                if (payload.done) {
                  const usage = {
                    in: payload.prompt_eval_count ?? 0,
                    out: payload.eval_count ?? 0,
                  };
                  maybeReportUsage(options.onUsage, toUsageReport(options.modelConfig, usage, true));
                  yield {
                    type: "done",
                    usage,
                    finishReason: payload.done_reason,
                  };
                }
              }
            }
          },
        };
      }

      return (async (): Promise<ChatResponse> => {
        const response = await fetchImpl(
          new URL(options.endpoint.apiPath ?? "/api/chat", options.endpoint.baseUrl),
          {
            method: "POST",
            headers: DEFAULT_HEADERS,
            body: JSON.stringify({
              model: options.modelConfig.model,
              messages: request.messages,
              stream: false,
              format: request.jsonMode ?? options.modelConfig.jsonMode ? "json" : undefined,
              options: {
                temperature: request.temperature ?? options.modelConfig.temperature,
                top_p: request.topP ?? options.modelConfig.topP,
                num_predict: request.maxTokens ?? options.modelConfig.maxTokens,
              },
            }),
          },
        );

        const parsed = await parseOllamaResponse(response);
        maybeReportUsage(options.onUsage, toUsageReport(options.modelConfig, parsed.usage, false));

        return {
          model: options.modelConfig.model,
          provider: "ollama",
          content: parsed.content,
          usage: parsed.usage,
          finishReason: parsed.finishReason,
        } satisfies ChatResponse;
      })();
    },
  };
}
