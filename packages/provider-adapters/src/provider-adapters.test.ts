import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import test from "node:test";

import { CredentialService, InMemoryCredentialStore } from "@shulingge/security";
import type { ModelConfig, TokenUsage } from "@shulingge/shared";

import { ProviderRegistry } from "./registry.js";

async function createMockServer() {
  const requests: Array<{ url: string; headers: http.IncomingHttpHeaders; body: string }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({
      url: request.url ?? "/",
      headers: request.headers,
      body,
    });

    if (request.url === "/openai/chat/completions") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        choices: [{ message: { content: "{\"scene\":\"ok\"}" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      }));
      return;
    }

    if (request.url === "/anthropic/messages") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        content: [{ text: "Claude says hello." }],
        usage: { input_tokens: 9, output_tokens: 5 },
        stop_reason: "end_turn",
      }));
      return;
    }

    if (request.url === "/ollama/api/chat") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        message: { content: "Local answer." },
        prompt_eval_count: 6,
        eval_count: 4,
        done_reason: "stop",
      }));
      return;
    }

    if (request.url === "/fallback/chat/completions") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        choices: [{ message: { content: "Fallback worked." }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      }));
      return;
    }

    if (request.url === "/primary/chat/completions") {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        error: {
          message: "sk-test-primary should be redacted",
        },
      }));
      return;
    }

    response.statusCode = 404;
    response.end("not found");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("mock server failed to bind");
  }

  return {
    requests,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      server.close();
      await once(server, "close");
    },
  };
}

function createModelConfig(
  overrides: Partial<ModelConfig> & Pick<ModelConfig, "id" | "provider" | "model">,
): ModelConfig {
  return {
    id: overrides.id,
    provider: overrides.provider,
    model: overrides.model,
    schemaVersion: 1,
    keyRef: overrides.keyRef,
    stream: overrides.stream,
    jsonMode: overrides.jsonMode,
    fallbackModelId: overrides.fallbackModelId,
  };
}

test("openai-compatible adapter fetches api key only at call time and returns usage without leaking key", async () => {
  const mock = await createMockServer();
  try {
    const store = new InMemoryCredentialStore();
    const credentialService = new CredentialService(store);
    await credentialService.storeApiKey("provider:openai-compatible:default", "sk-openai-123");

    const usageReports: TokenUsage[] = [];
    const registry = new ProviderRegistry({
      models: {
        writer: createModelConfig({
          id: "writer",
          provider: "openai-compatible",
          model: "gpt-compat",
          keyRef: "provider:openai-compatible:default",
          jsonMode: true,
        }),
      },
      endpoints: {
        "openai-compatible": {
          baseUrl: mock.baseUrl,
          apiPath: "/openai/chat/completions",
        },
      },
      onUsage(report) {
        usageReports.push(report.tokens);
      },
    }, credentialService);

    const response = await registry.chat("writer", {
      messages: [{ role: "user", content: "write scene" }],
      jsonMode: true,
    }) as { content: string; usage: TokenUsage };

    assert.equal(response.content, "{\"scene\":\"ok\"}");
    assert.deepEqual(response.usage, { in: 11, out: 7 });
    assert.deepEqual(usageReports[0], { in: 11, out: 7 });
    assert.equal(mock.requests[0]?.headers.authorization, "Bearer sk-openai-123");
    assert.equal(JSON.stringify(response).includes("sk-openai-123"), false);
  } finally {
    await mock.close();
  }
});

test("anthropic and ollama adapters use provider-specific transports", async () => {
  const mock = await createMockServer();
  try {
    const store = new InMemoryCredentialStore();
    const credentialService = new CredentialService(store);
    await credentialService.storeApiKey("provider:anthropic:default", "sk-claude-123");

    const registry = new ProviderRegistry({
      models: {
        claude: createModelConfig({
          id: "claude",
          provider: "anthropic",
          model: "claude-sonnet",
          keyRef: "provider:anthropic:default",
        }),
        local: createModelConfig({
          id: "local",
          provider: "ollama",
          model: "qwen2.5",
        }),
      },
      endpoints: {
        anthropic: { baseUrl: mock.baseUrl, apiPath: "/anthropic/messages" },
        ollama: { baseUrl: mock.baseUrl, apiPath: "/ollama/api/chat" },
      },
    }, credentialService);

    const claude = await registry.chat("claude", {
      messages: [{ role: "user", content: "hi" }],
    }) as { content: string };
    const ollama = await registry.chat("local", {
      messages: [{ role: "user", content: "hi" }],
    }) as { content: string };

    assert.equal(claude.content, "Claude says hello.");
    assert.equal(ollama.content, "Local answer.");
    assert.equal(mock.requests.some((request) => request.headers["x-api-key"] === "sk-claude-123"), true);
    assert.equal(mock.requests.some((request) => request.url === "/ollama/api/chat"), true);
  } finally {
    await mock.close();
  }
});

test("registry falls back to backup model and redacts provider errors", async () => {
  const mock = await createMockServer();
  try {
    const store = new InMemoryCredentialStore();
    const credentialService = new CredentialService(store);
    await credentialService.storeApiKey("provider:openai-compatible:primary", "sk-test-primary");
    await credentialService.storeApiKey("provider:deepseek:fallback", "sk-test-fallback");

    const registry = new ProviderRegistry({
      models: {
        primary: createModelConfig({
          id: "primary",
          provider: "openai-compatible",
          model: "broken",
          keyRef: "provider:openai-compatible:primary",
          fallbackModelId: "fallback",
        }),
        fallback: createModelConfig({
          id: "fallback",
          provider: "deepseek",
          model: "backup",
          keyRef: "provider:deepseek:fallback",
        }),
      },
      endpoints: {
        "openai-compatible": { baseUrl: mock.baseUrl, apiPath: "/primary/chat/completions" },
        deepseek: { baseUrl: mock.baseUrl, apiPath: "/fallback/chat/completions" },
      },
    }, credentialService);

    const response = await registry.chat("primary", {
      messages: [{ role: "user", content: "recover" }],
    }) as { content: string };

    assert.equal(response.content, "Fallback worked.");

    let missingKeyError = "";
    const missingKeyRegistry = new ProviderRegistry({
      models: {
        bad: createModelConfig({
          id: "bad",
          provider: "openai-compatible",
          model: "broken",
          keyRef: "provider:openai-compatible:missing",
        }),
      },
      endpoints: {
        "openai-compatible": { baseUrl: mock.baseUrl, apiPath: "/primary/chat/completions" },
      },
    }, credentialService);

    try {
      await missingKeyRegistry.chat("bad", {
        messages: [{ role: "user", content: "fail" }],
      });
    } catch (error) {
      missingKeyError = error instanceof Error ? error.message : String(error);
    }

    assert.match(missingKeyError, /missing api key/i);
    assert.equal(missingKeyError.includes("sk-test-primary"), false);
  } finally {
    await mock.close();
  }
});
