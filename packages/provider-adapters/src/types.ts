import type { ModelConfig, ProviderType, TokenUsage } from "@shulingge/shared";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  stream?: boolean;
  jsonMode?: boolean;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface ChatChunk {
  type: "delta" | "done";
  delta?: string;
  usage?: TokenUsage;
  finishReason?: string;
}

export interface ChatResponse {
  model: string;
  provider: ProviderType;
  content: string;
  usage: TokenUsage;
  finishReason?: string;
}

export interface ModelSupports {
  stream: boolean;
  jsonMode: boolean;
  longContext: boolean;
  thinking: boolean;
}

export interface UsageReport {
  modelConfigId: string;
  provider: ProviderType;
  model: string;
  tokens: TokenUsage;
  streamed: boolean;
}

export interface ChatModel {
  id: string;
  provider: ProviderType;
  supports: ModelSupports;
  chat(request: ChatRequest): Promise<ChatResponse> | AsyncIterable<ChatChunk>;
}

export interface ProviderEndpointConfig {
  baseUrl: string;
  apiPath?: string;
}

export interface AdapterCreateOptions {
  modelConfig: ModelConfig;
  apiKey?: string | null;
  endpoint: ProviderEndpointConfig;
  onUsage?: (report: UsageReport) => void | Promise<void>;
  fetchImpl?: typeof fetch;
}

export interface ProviderRegistryOptions {
  models: Record<string, ModelConfig>;
  endpoints?: Partial<Record<ProviderType, ProviderEndpointConfig>>;
  fetchImpl?: typeof fetch;
  onUsage?: (report: UsageReport) => void | Promise<void>;
}

export interface ResolvedModelHandle {
  model: ChatModel;
  config: ModelConfig;
}
