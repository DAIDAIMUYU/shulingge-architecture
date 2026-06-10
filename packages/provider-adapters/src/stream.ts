import type { TokenUsage } from "@shulingge/shared";

import type { ChatChunk } from "./types.js";

function parseUsage(value: unknown): TokenUsage | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const inputTokens = Number(record.prompt_tokens ?? record.input_tokens ?? 0);
  const outputTokens = Number(record.completion_tokens ?? record.output_tokens ?? 0);

  return {
    in: Number.isFinite(inputTokens) ? inputTokens : 0,
    out: Number.isFinite(outputTokens) ? outputTokens : 0,
  };
}

export async function* streamSseChunks(
  response: Response,
  parseLine: (payload: Record<string, unknown>) => ChatChunk | null,
): AsyncIterable<ChatChunk> {
  if (!response.body) {
    return;
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
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      for (const line of event.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }

        const payloadText = trimmed.slice(5).trim();
        if (!payloadText || payloadText === "[DONE]") {
          yield { type: "done" };
          continue;
        }

        const payload = JSON.parse(payloadText) as Record<string, unknown>;
        const chunk = parseLine(payload);
        if (chunk) {
          yield chunk;
        }
      }
    }
  }
}

export function parseOpenAiSseChunk(payload: Record<string, unknown>): ChatChunk | null {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const choice = choices[0] as Record<string, unknown> | undefined;
  const deltaRecord = choice?.delta as Record<string, unknown> | undefined;
  const delta = typeof deltaRecord?.content === "string" ? deltaRecord.content : "";
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined;

  if (!delta && !finishReason) {
    return null;
  }

  return {
    type: finishReason ? "done" : "delta",
    delta: delta || undefined,
    finishReason,
    usage: parseUsage(payload.usage),
  };
}

export function parseAnthropicSseChunk(payload: Record<string, unknown>): ChatChunk | null {
  const type = payload.type;
  if (type === "content_block_delta") {
    const deltaRecord = payload.delta as Record<string, unknown> | undefined;
    const text = typeof deltaRecord?.text === "string" ? deltaRecord.text : "";
    return text ? { type: "delta", delta: text } : null;
  }

  if (type === "message_delta") {
    return {
      type: "done",
      usage: parseUsage(payload.usage),
      finishReason:
        typeof payload.stop_reason === "string"
          ? payload.stop_reason
          : undefined,
    };
  }

  return null;
}

export function parseUsageRecord(value: unknown): TokenUsage {
  return parseUsage(value) ?? { in: 0, out: 0 };
}
