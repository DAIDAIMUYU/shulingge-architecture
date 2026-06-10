import { CredentialService, createSystemCredentialStore } from "@shulingge/security";
import type { ModelConfig } from "@shulingge/shared";

import { createAnthropicModel, createOllamaModel, createOpenAiCompatibleModel } from "./adapters.js";
import { createProviderAdapterError } from "./errors.js";
import type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ProviderEndpointConfig,
  ProviderRegistryOptions,
  ResolvedModelHandle,
} from "./types.js";

const DEFAULT_ENDPOINTS: Partial<Record<ModelConfig["provider"], ProviderEndpointConfig>> = {
  openai: { baseUrl: "https://api.openai.com/v1", apiPath: "/chat/completions" },
  "openai-compatible": { baseUrl: "https://api.openai.com/v1", apiPath: "/chat/completions" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", apiPath: "/messages" },
  ollama: { baseUrl: "http://127.0.0.1:11434", apiPath: "/api/chat" },
  deepseek: { baseUrl: "https://api.deepseek.com", apiPath: "/chat/completions" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", apiPath: "/chat/completions" },
  siliconflow: { baseUrl: "https://api.siliconflow.cn/v1", apiPath: "/chat/completions" },
  volcengine: { baseUrl: "https://ark.cn-beijing.volces.com/api/v3", apiPath: "/chat/completions" },
  "aliyun-bailian": { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiPath: "/chat/completions" },
};

function isAsyncIterable(value: unknown): value is AsyncIterable<ChatChunk> {
  return Boolean(value) && typeof (value as AsyncIterable<ChatChunk>)[Symbol.asyncIterator] === "function";
}

export class ProviderRegistry {
  private readonly credentialService: CredentialService;

  constructor(
    private readonly options: ProviderRegistryOptions,
    credentialService?: CredentialService,
  ) {
    this.credentialService = credentialService ?? new CredentialService(createSystemCredentialStore());
  }

  async resolveModel(modelConfigId: string): Promise<ResolvedModelHandle> {
    const config = this.options.models[modelConfigId];
    if (!config) {
      throw createProviderAdapterError(
        "openai-compatible",
        "PROVIDER_MODEL_NOT_FOUND",
        `Unknown model config: ${modelConfigId}`,
      );
    }

    const endpoint = this.options.endpoints?.[config.provider] ?? DEFAULT_ENDPOINTS[config.provider];
    if (!endpoint) {
      throw createProviderAdapterError(
        config.provider,
        "PROVIDER_ENDPOINT_MISSING",
        `No endpoint configured for provider ${config.provider}`,
      );
    }

    const apiKey = config.keyRef ? await this.credentialService.getApiKey(config.keyRef) : null;
    if (config.provider !== "ollama" && config.keyRef && !apiKey) {
      throw createProviderAdapterError(
        config.provider,
        "PROVIDER_API_KEY_MISSING",
        `Missing API key for ${config.id}`,
      );
    }

    const common = {
      modelConfig: config,
      apiKey,
      endpoint,
      fetchImpl: this.options.fetchImpl,
      onUsage: this.options.onUsage,
    };

    switch (config.provider) {
      case "anthropic":
        return { config, model: createAnthropicModel(common) };
      case "ollama":
        return { config, model: createOllamaModel(common) };
      case "openai":
      case "openai-compatible":
      case "deepseek":
      case "openrouter":
      case "siliconflow":
      case "volcengine":
      case "aliyun-bailian":
        return { config, model: createOpenAiCompatibleModel(common) };
      default:
        throw createProviderAdapterError(
          config.provider,
          "PROVIDER_UNSUPPORTED_IN_MVP",
          `Provider ${config.provider} is not supported in MVP`,
        );
    }
  }

  async chat(modelConfigId: string, request: ChatRequest): Promise<ChatResponse | AsyncIterable<ChatChunk>> {
    const primary = await this.resolveModel(modelConfigId);

    try {
      const result = primary.model.chat(request);
      if (isAsyncIterable(result)) {
        return result;
      }
      return await result;
    } catch (error) {
      if (!primary.config.fallbackModelId) {
        throw error;
      }

      const fallback = await this.resolveModel(primary.config.fallbackModelId);
      const result = fallback.model.chat(request);
      if (isAsyncIterable(result)) {
        return result;
      }
      return await result;
    }
  }
}
