import { ProviderRegistry, type ChatMessage, type ProviderEndpointConfig } from "@shulingge/provider-adapters";
import { CredentialService } from "@shulingge/security";
import type { ModelConfig } from "@shulingge/shared";
import { readJsonFile, writeJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";
import { listModels } from "./models.js";

export interface ResearchCharacterField {
  group?: string;
  key?: string;
  label?: string;
}

export interface ResearchCharacterInput {
  characterName?: string;
  sourceWork?: string;
  projectId?: string;
  fields?: ResearchCharacterField[];
  source?: string;
  sourceConfig?: Record<string, unknown>;
}

export interface ResearchWorldbookInput {
  entryName?: string;
  sourceWork?: string;
  projectId?: string;
  template?: string;
  category?: string;
  fields?: ResearchCharacterField[];
  source?: string;
  sourceConfig?: Record<string, unknown>;
}

export interface ResearchTimelineInput {
  eventName?: string;
  sourceWork?: string;
  projectId?: string;
  template?: string;
  line?: string;
  fields?: ResearchCharacterField[];
  source?: string;
  sourceConfig?: Record<string, unknown>;
}

export interface ResearchCharacterResponse {
  modelId: string;
  fields: Record<string, string>;
  source: {
    title: string;
    url: string;
    sourceId?: string;
    sourceName?: string;
  };
}

export interface SearchSourceInfo {
  id: string;
  name: string;
  kind: "mediawiki" | "search-api" | "custom";
  free: boolean;
  requiresKey: boolean;
  implemented: boolean;
  configured?: boolean;
  enabled?: boolean;
  health?: SearchSourceHealth;
  networkNote: string;
}

export interface CustomResearchSource {
  id: string;
  name: string;
  baseUrl: string;
}

export type SearchSourceHealthStatus = "verified" | "untested" | "failed";

export interface SearchSourceHealth {
  status: SearchSourceHealthStatus;
  testedAt?: string;
  message?: string;
}

export interface SearchSourceState {
  enabled?: boolean;
  health?: SearchSourceHealth;
}

export interface ResearchSettings {
  defaultSource: string;
  customSources?: CustomResearchSource[];
  customSource?: {
    name?: string;
    baseUrl?: string;
  };
  sourceStates?: Record<string, SearchSourceState>;
  google?: {
    cx?: string;
    keyRef?: string;
    hasKey?: boolean;
  };
  bing?: {
    keyRef?: string;
    hasKey?: boolean;
  };
}

export interface SearchSourceTestInput {
  source?: string;
  customSource?: {
    id?: string;
    name?: string;
    baseUrl?: string;
  };
  google?: {
    cx?: string;
    apiKey?: string;
  };
  bing?: {
    apiKey?: string;
  };
}

export interface SearchSourceTestResult {
  ok: boolean;
  message: string;
  count?: number;
  sourceName?: string;
}

export interface ResearchCharacterOptions {
  credentialService: CredentialService;
  fetchImpl?: typeof fetch;
  endpoints?: Partial<Record<ModelConfig["provider"], ProviderEndpointConfig>>;
}

interface ResolvedResearchModel {
  modelId: string;
  registry: ProviderRegistry;
}

interface WikipediaSearchItem {
  title: string;
  snippet?: string;
}

interface MediaWikiSourceConfig extends SearchSourceInfo {
  kind: "mediawiki";
  baseUrl: string;
  articleBaseUrl: string;
  directTitleFallback?: boolean;
}

interface GoogleSourceConfig extends SearchSourceInfo {
  kind: "search-api";
  apiKey: string;
  cx: string;
}

interface BingSourceConfig extends SearchSourceInfo {
  kind: "search-api";
  apiKey: string;
}

interface ResearchSource {
  title: string;
  url: string;
  extract: string;
  infoboxText: string;
  searchContext: string;
  usedFullExtract: boolean;
  sourceId: string;
  sourceName: string;
}

class ResearchJsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchJsonParseError";
  }
}

const RESEARCH_SETTINGS_PATH = "settings/research.json";
const DEFAULT_RESEARCH_SOURCE = "wikipedia";
const GOOGLE_KEY_REF = "provider:research-google:default";
const BING_KEY_REF = "provider:research-bing:default";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_GENERATION_ATTEMPTS = 3;
const MAX_WIKI_CONTEXT_CHARS = 10_000;
const MAX_EXTRACT_CONTEXT_CHARS = 8_000;
const MAX_INFOBOX_CONTEXT_CHARS = 3_000;
const MIN_USEFUL_EXTRACT_CHARS = 180;
const MAX_FULL_EXTRACT_CHARS = 50_000;
const MAX_RELEVANT_EXTRACT_CHARS = 7_000;
const MAX_CANDIDATE_FETCH_COUNT = 3;
const HIGH_CONFIDENCE_SOURCE_SCORE = 600;
const SEARCH_SOURCES: SearchSourceInfo[] = [
  {
    id: "wikipedia",
    name: "维基百科",
    kind: "mediawiki",
    free: true,
    requiresKey: false,
    implemented: true,
    networkNote: "免费，需国际网络；适合真实人物、作品和通用资料。",
  },
  {
    id: "moegirl",
    name: "萌娘百科",
    kind: "mediawiki",
    free: true,
    requiresKey: false,
    implemented: true,
    networkNote: "免费，需国际网络；ACG/同人角色资料更丰富，搜索 API 可能受限，会自动按词条名直取。",
  },
  {
    id: "bing",
    name: "必应搜索",
    kind: "search-api",
    free: false,
    requiresKey: true,
    implemented: true,
    networkNote: "需配置 Bing Web Search API key；微软接口可能随账号和区域调整，填入可用 key 后启用。",
  },
  {
    id: "google",
    name: "谷歌搜索",
    kind: "search-api",
    free: false,
    requiresKey: true,
    implemented: true,
    networkNote: "需配置 Google Custom Search API key 和搜索引擎 ID(cx)；每天免费 100 次，超出可能收费。",
  },
  {
    id: "custom",
    name: "自定义源",
    kind: "mediawiki",
    free: true,
    requiresKey: false,
    implemented: true,
    networkNote: "填写 MediaWiki api.php 地址后启用，例如 https://xxx.fandom.com/api.php。",
  },
];
const MEDIAWIKI_SOURCES: Record<string, MediaWikiSourceConfig> = {
  wikipedia: {
    ...SEARCH_SOURCES[0],
    kind: "mediawiki",
    baseUrl: "https://zh.wikipedia.org/w/api.php",
    articleBaseUrl: "https://zh.wikipedia.org/wiki",
  },
  moegirl: {
    ...SEARCH_SOURCES[1],
    kind: "mediawiki",
    baseUrl: "https://zh.moegirl.org.cn/api.php",
    articleBaseUrl: "https://zh.moegirl.org.cn",
    directTitleFallback: true,
  },
};
const FALLBACK_FIELDS: ResearchCharacterField[] = [
  { group: "基础", key: "fullName", label: "角色全名" },
  { group: "基础", key: "oneLine", label: "一句话介绍" },
  { group: "基础", key: "nickname", label: "昵称/外号" },
  { group: "基础", key: "age", label: "年龄" },
  { group: "基础", key: "birthday", label: "生日" },
  { group: "基础", key: "occupation", label: "职业/身份" },
  { group: "基础", key: "appearanceImpression", label: "整体外貌印象" },
  { group: "基础", key: "personalityImpression", label: "整体性格印象" },
  { group: "外貌", key: "height", label: "身高" },
  { group: "外貌", key: "weight", label: "体重" },
  { group: "外貌", key: "hairColor", label: "发色" },
  { group: "外貌", key: "eyeColor", label: "眼睛颜色" },
  { group: "外貌", key: "currentState", label: "当前状态" },
  { group: "性格", key: "corePersonality", label: "核心性格" },
  { group: "性格", key: "speechStyle", label: "说话方式" },
  { group: "关系", key: "organization", label: "所属组织/阵营" },
  { group: "背景", key: "importantPastEvent", label: "过去的重要事件" },
  { group: "背景", key: "pastEventEffect", label: "这件事如何影响现在" },
  { group: "背景", key: "finalDirection", label: "最终会走向哪里" },
  { group: "背景", key: "sourceWork", label: "角色是否属于某个已有作品" },
  { group: "背景", key: "sourceWorldRelation", label: "和原作世界什么关系" },
  { group: "背景", key: "specialPower", label: "是否拥有该世界观特殊能力" },
  { group: "背景", key: "canonRole", label: "职责/身份/阵营" },
];
const FALLBACK_WORLDBOOK_FIELDS: ResearchCharacterField[] = [
  { group: "核心信息", key: "title", label: "名称" },
  { group: "核心信息", key: "category", label: "类型" },
  { group: "核心信息", key: "summary", label: "一句话简介" },
  { group: "核心信息", key: "description", label: "详细描述" },
  { group: "核心信息", key: "keywords", label: "关键词" },
  { group: "设定内容", key: "appearance", label: "外观/样貌" },
  { group: "设定内容", key: "function", label: "功能/作用" },
  { group: "设定内容", key: "history", label: "历史/起源" },
  { group: "设定内容", key: "currentState", label: "现状" },
  { group: "设定内容", key: "mechanism", label: "运作规则/机制" },
  { group: "设定内容", key: "traits", label: "特性/特点" },
  { group: "关联", key: "canonRelation", label: "与原作的关系" },
  { group: "写作参考", key: "canonSource", label: "原作出处" },
];
const FALLBACK_TIMELINE_FIELDS: ResearchCharacterField[] = [
  { group: "核心信息", key: "title", label: "事件标题" },
  { group: "核心信息", key: "line", label: "线类型" },
  { group: "核心信息", key: "eventDate", label: "发生时间" },
  { group: "核心信息", key: "location", label: "地点" },
  { group: "核心信息", key: "summary", label: "一句话简介" },
  { group: "核心信息", key: "description", label: "详细描述" },
  { group: "事件内容", key: "cause", label: "起因/背景" },
  { group: "事件内容", key: "development", label: "经过/发展" },
  { group: "事件内容", key: "result", label: "结果/影响" },
  { group: "事件内容", key: "turningPoint", label: "关键转折" },
  { group: "事件内容", key: "conflict", label: "涉及的冲突" },
  { group: "关联", key: "previousEvents", label: "前置事件" },
  { group: "关联", key: "nextEvents", label: "后续事件" },
  { group: "写作参考", key: "canonSource", label: "原作出处" },
];

function cleanOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function createCustomSourceId(name: string, baseUrl: string, index: number): string {
  const base = `${name || "custom"}-${baseUrl || index}`
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `custom-${index + 1}`;
}

function normalizeCustomSources(input: unknown, legacy?: ResearchSettings["customSource"]): CustomResearchSource[] {
  const seen = new Set<string>();
  const items = Array.isArray(input) ? input : [];
  const normalized: CustomResearchSource[] = [];

  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const name = cleanOptionalString(record.name);
    const baseUrl = cleanOptionalString(record.baseUrl);
    if (!name || !baseUrl) {
      continue;
    }
    const rawId = cleanOptionalString(record.id);
    let id = rawId?.replace(/^custom:/, "") || createCustomSourceId(name, baseUrl, index);
    let suffix = 2;
    while (seen.has(id)) {
      id = `${id}-${suffix}`;
      suffix += 1;
    }
    seen.add(id);
    normalized.push({ id, name, baseUrl });
  }

  const legacyName = cleanOptionalString(legacy?.name);
  const legacyBaseUrl = cleanOptionalString(legacy?.baseUrl);
  if (legacyBaseUrl && !normalized.some((source) => source.baseUrl === legacyBaseUrl)) {
    let id = createCustomSourceId(legacyName || "自定义源", legacyBaseUrl, normalized.length);
    let suffix = 2;
    while (seen.has(id)) {
      id = `${id}-${suffix}`;
      suffix += 1;
    }
    normalized.push({ id, name: legacyName || "自定义源", baseUrl: legacyBaseUrl });
  }

  return normalized;
}

function customSearchSourceId(id: string): string {
  return `custom:${id}`;
}

function parseCustomSearchSourceId(value: string): string | null {
  return value.startsWith("custom:") ? value.slice("custom:".length) : null;
}

function normalizeSourceHealth(input: unknown): SearchSourceHealth | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const status = record.status === "verified" || record.status === "failed" || record.status === "untested"
    ? record.status
    : undefined;
  if (!status) {
    return undefined;
  }
  return {
    status,
    testedAt: cleanOptionalString(record.testedAt),
    message: cleanOptionalString(record.message),
  };
}

function normalizeSourceStates(input: unknown): Record<string, SearchSourceState> | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const normalized: Record<string, SearchSourceState> = {};
  for (const [sourceId, value] of Object.entries(input as Record<string, unknown>)) {
    if (!sourceId || !value || typeof value !== "object") {
      continue;
    }
    const record = value as Record<string, unknown>;
    const state: SearchSourceState = {};
    if (typeof record.enabled === "boolean") {
      state.enabled = record.enabled;
    }
    const health = normalizeSourceHealth(record.health);
    if (health) {
      state.health = health;
    }
    if (Object.keys(state).length > 0) {
      normalized[sourceId] = state;
    }
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeResearchSettings(input: Partial<ResearchSettings>): ResearchSettings {
  const customSources = normalizeCustomSources((input as { customSources?: unknown }).customSources, input.customSource);
  const googleCx = cleanOptionalString(input.google?.cx);
  const defaultSource = typeof input.defaultSource === "string" && (
    isKnownSourceId(input.defaultSource) || customSources.some((source) => customSearchSourceId(source.id) === input.defaultSource)
  )
    ? input.defaultSource
    : input.defaultSource === "custom" && customSources[0]
      ? customSearchSourceId(customSources[0].id)
      : DEFAULT_RESEARCH_SOURCE;
  return {
    defaultSource,
    customSources: customSources.length > 0 ? customSources : undefined,
    sourceStates: normalizeSourceStates(input.sourceStates),
    google: googleCx || input.google?.keyRef ? { cx: googleCx, keyRef: input.google?.keyRef } : undefined,
    bing: input.bing?.keyRef ? { keyRef: input.bing.keyRef } : undefined,
  };
}

async function withCredentialStatus(settings: ResearchSettings, credentialService?: CredentialService): Promise<ResearchSettings> {
  const googleKeyRef = settings.google?.keyRef;
  const bingKeyRef = settings.bing?.keyRef;
  const [googleStatus, bingStatus] = await Promise.all([
    googleKeyRef && credentialService ? credentialService.getStoredCredentialStatus(googleKeyRef).catch(() => ({ hasKey: false })) : Promise.resolve({ hasKey: false }),
    bingKeyRef && credentialService ? credentialService.getStoredCredentialStatus(bingKeyRef).catch(() => ({ hasKey: false })) : Promise.resolve({ hasKey: false }),
  ]);
  return {
    ...settings,
    google: settings.google ? { ...settings.google, hasKey: Boolean(googleStatus.hasKey) } : undefined,
    bing: settings.bing ? { ...settings.bing, hasKey: Boolean(bingStatus.hasKey) } : undefined,
  };
}

function isSourceConfigured(source: SearchSourceInfo, settings: ResearchSettings): boolean {
  if (source.id === "wikipedia" || source.id === "moegirl") {
    return true;
  }
  if (parseCustomSearchSourceId(source.id)) {
    return Boolean(settings.customSources?.some((item) => customSearchSourceId(item.id) === source.id && item.baseUrl));
  }
  if (source.id === "google") {
    return Boolean(settings.google?.cx && settings.google.hasKey);
  }
  if (source.id === "bing") {
    return Boolean(settings.bing?.hasKey);
  }
  return false;
}

function getSourceState(settings: ResearchSettings, sourceId: string): SearchSourceState {
  return settings.sourceStates?.[sourceId] ?? {};
}

function isSourceEnabled(settings: ResearchSettings, sourceId: string): boolean {
  return getSourceState(settings, sourceId).enabled !== false;
}

function getSourceHealth(settings: ResearchSettings, sourceId: string): SearchSourceHealth {
  return getSourceState(settings, sourceId).health ?? { status: "untested" };
}

function decorateSearchSource(source: SearchSourceInfo, settings: ResearchSettings): SearchSourceInfo {
  return {
    ...source,
    configured: isSourceConfigured(source, settings),
    enabled: isSourceEnabled(settings, source.id),
    health: getSourceHealth(settings, source.id),
  };
}

export async function listSearchSources(vaultRoot?: string, credentialService?: CredentialService): Promise<{ sources: SearchSourceInfo[] }> {
  const settings: ResearchSettings = vaultRoot
    ? await withCredentialStatus(await getResearchSettings(vaultRoot), credentialService)
    : { defaultSource: DEFAULT_RESEARCH_SOURCE };
  const customTemplate = SEARCH_SOURCES.find((source) => source.id === "custom")!;
  const customSources = (settings.customSources ?? []).map((source) => ({
    ...customTemplate,
    id: customSearchSourceId(source.id),
    name: source.name,
  })).map((source) => decorateSearchSource(source, settings));
  return {
    sources: SEARCH_SOURCES.filter((source) => source.id !== "custom")
      .map((source) => decorateSearchSource(source, settings))
      .concat(customSources),
  };
}

function isKnownSourceId(value: unknown): value is string {
  return typeof value === "string" && SEARCH_SOURCES.some((source) => source.id === value && source.id !== "custom");
}

async function testMediaWikiConnection(input: {
  fetchImpl: typeof fetch;
  source: MediaWikiSourceConfig;
  query?: string;
}): Promise<SearchSourceTestResult> {
  const searchUrl = buildMediaWikiUrl(input.source, {
    action: "query",
    list: "search",
    srsearch: input.query || "测试",
    srlimit: "3",
  });
  const data = await fetchJsonWithTimeout<{
    query?: { search?: Array<{ title?: string }> };
  }>(input.fetchImpl, searchUrl);
  const count = data.query?.search?.length ?? 0;
  return {
    ok: true,
    sourceName: input.source.name,
    count,
    message: count > 0 ? `连接成功，找到 ${count} 条结果` : "连接成功，但测试词没有找到结果",
  };
}

async function testGoogleConnection(input: {
  fetchImpl: typeof fetch;
  apiKey: string;
  cx: string;
}): Promise<SearchSourceTestResult> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", input.apiKey);
  url.searchParams.set("cx", input.cx);
  url.searchParams.set("q", "测试");
  url.searchParams.set("num", "1");
  const data = await fetchJsonWithTimeout<{
    searchInformation?: { totalResults?: string };
    items?: Array<unknown>;
  }>(input.fetchImpl, url.toString());
  const count = data.items?.length ?? 0;
  return {
    ok: true,
    sourceName: "谷歌搜索",
    count,
    message: count > 0 ? `连接成功，找到 ${count} 条结果` : "连接成功，但测试词没有找到结果",
  };
}

async function testBingConnection(input: {
  fetchImpl: typeof fetch;
  apiKey: string;
}): Promise<SearchSourceTestResult> {
  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", "测试");
  url.searchParams.set("mkt", "zh-CN");
  url.searchParams.set("count", "1");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await input.fetchImpl(url.toString(), {
      signal: controller.signal,
      headers: {
        "user-agent": "Shulingge/1.0 character-research",
        "Ocp-Apim-Subscription-Key": input.apiKey,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json() as {
      webPages?: { value?: Array<unknown> };
    };
    const count = data.webPages?.value?.length ?? 0;
    return {
      ok: true,
      sourceName: "必应搜索",
      count,
      message: count > 0 ? `连接成功，找到 ${count} 条结果` : "连接成功，但测试词没有找到结果",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw createHttpError(504, "RESEARCH_SOURCE_TIMEOUT", "访问 Bing 超时，请稍后重试");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function testSearchSource(
  vaultRoot: string,
  input: unknown,
  options: { credentialService: CredentialService; fetchImpl?: typeof fetch },
): Promise<SearchSourceTestResult> {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const source = cleanOptionalString(record.source);
  const fetchImpl = options.fetchImpl ?? fetch;
  const settings = await withCredentialStatus(await getResearchSettings(vaultRoot), options.credentialService);
  const testedAt = new Date().toISOString();
  let testedSourceId = source;

  try {
    if (source === "custom") {
      const customInput = record.customSource && typeof record.customSource === "object" ? record.customSource as Record<string, unknown> : {};
      const baseUrl = cleanOptionalString(customInput.baseUrl);
      const name = cleanOptionalString(customInput.name) || "自定义源";
      const customId = cleanOptionalString(customInput.id);
      testedSourceId = customId ? customSearchSourceId(customId) : "custom:test";
      if (!baseUrl) {
        throw createHttpError(400, "RESEARCH_SOURCE_NOT_CONFIGURED", "请先填写自定义源 api.php base url");
      }
      const result = await testMediaWikiConnection({
        fetchImpl,
        source: {
          ...SEARCH_SOURCES.find((item) => item.id === "custom")!,
          id: testedSourceId,
          name,
          kind: "mediawiki",
          baseUrl,
          articleBaseUrl: articleBaseUrlFromApi(baseUrl),
        },
      });
      await updateSearchSourceHealth(vaultRoot, testedSourceId, { status: "verified", testedAt, message: result.message });
      return result;
    }

    if (source === "google") {
      const googleInput = record.google && typeof record.google === "object" ? record.google as Record<string, unknown> : {};
      const cx = cleanOptionalString(googleInput.cx) || settings.google?.cx;
      const inputKey = cleanOptionalString(googleInput.apiKey);
      const storedKey = !inputKey && settings.google?.keyRef ? await options.credentialService.getApiKey(settings.google.keyRef) : undefined;
      const apiKey = inputKey || storedKey;
      if (!cx || !apiKey) {
        throw createHttpError(400, "RESEARCH_SOURCE_NOT_CONFIGURED", "请先填写 Google API key 和 cx");
      }
      const result = await testGoogleConnection({ fetchImpl, apiKey, cx });
      await updateSearchSourceHealth(vaultRoot, "google", { status: "verified", testedAt, message: result.message });
      return result;
    }

    if (source === "bing") {
      const bingInput = record.bing && typeof record.bing === "object" ? record.bing as Record<string, unknown> : {};
      const inputKey = cleanOptionalString(bingInput.apiKey);
      const storedKey = !inputKey && settings.bing?.keyRef ? await options.credentialService.getApiKey(settings.bing.keyRef) : undefined;
      const apiKey = inputKey || storedKey;
      if (!apiKey) {
        throw createHttpError(400, "RESEARCH_SOURCE_NOT_CONFIGURED", "请先填写 Bing API key");
      }
      const result = await testBingConnection({ fetchImpl, apiKey });
      await updateSearchSourceHealth(vaultRoot, "bing", { status: "verified", testedAt, message: result.message });
      return result;
    }

    throw createHttpError(400, "RESEARCH_SOURCE_NOT_IMPLEMENTED", "请选择要测试的搜索源");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (testedSourceId) {
      await updateSearchSourceHealth(vaultRoot, testedSourceId, { status: "failed", testedAt, message }).catch(() => undefined);
    }
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    throw createHttpError(400, "RESEARCH_SOURCE_TEST_FAILED", `测试连接失败：${message}`);
  }
}

async function updateSearchSourceHealth(vaultRoot: string, sourceId: string, health: SearchSourceHealth): Promise<void> {
  const current = await getResearchSettings(vaultRoot);
  const next = normalizeResearchSettings({
    ...current,
    sourceStates: {
      ...(current.sourceStates ?? {}),
      [sourceId]: {
        ...(current.sourceStates?.[sourceId] ?? {}),
        health,
      },
    },
  });
  await writeJsonFile(vaultRoot, RESEARCH_SETTINGS_PATH, next);
}

export async function getResearchSettings(vaultRoot: string): Promise<ResearchSettings> {
  const stored: Partial<ResearchSettings> = await readJsonFile<Partial<ResearchSettings>>(vaultRoot, RESEARCH_SETTINGS_PATH).catch(() => ({}));
  return normalizeResearchSettings(stored);
}

export async function getPublicResearchSettings(vaultRoot: string, credentialService: CredentialService): Promise<ResearchSettings> {
  return await withCredentialStatus(await getResearchSettings(vaultRoot), credentialService);
}

export async function updateResearchSettings(vaultRoot: string, input: unknown, credentialService?: CredentialService): Promise<ResearchSettings> {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const current = await getResearchSettings(vaultRoot);
  const googleInput = record.google && typeof record.google === "object" ? record.google as Record<string, unknown> : {};
  const bingInput = record.bing && typeof record.bing === "object" ? record.bing as Record<string, unknown> : {};
  const googleApiKey = cleanOptionalString(googleInput.apiKey);
  const bingApiKey = cleanOptionalString(bingInput.apiKey);
  const inputCustomSources = Object.hasOwn(record, "customSources")
    ? record.customSources
    : current.customSources;

  const next: ResearchSettings = normalizeResearchSettings({
    defaultSource: typeof record.defaultSource === "string" ? record.defaultSource : current.defaultSource,
    customSources: inputCustomSources as CustomResearchSource[] | undefined,
    sourceStates: Object.hasOwn(record, "sourceStates") ? record.sourceStates as ResearchSettings["sourceStates"] : current.sourceStates,
    google: {
      cx: cleanOptionalString(googleInput.cx),
      keyRef: current.google?.keyRef,
    },
    bing: {
      keyRef: current.bing?.keyRef,
    },
  });
  if (googleApiKey) {
    if (!credentialService) {
      throw createHttpError(500, "RESEARCH_CREDENTIAL_SERVICE_MISSING", "凭据服务不可用，无法保存 Google API key");
    }
    await credentialService.storeApiKey(GOOGLE_KEY_REF, googleApiKey);
    next.google = { ...(next.google ?? {}), keyRef: GOOGLE_KEY_REF };
  }
  if (bingApiKey) {
    if (!credentialService) {
      throw createHttpError(500, "RESEARCH_CREDENTIAL_SERVICE_MISSING", "凭据服务不可用，无法保存 Bing API key");
    }
    await credentialService.storeApiKey(BING_KEY_REF, bingApiKey);
    next.bing = { ...(next.bing ?? {}), keyRef: BING_KEY_REF };
  }
  await writeJsonFile(vaultRoot, RESEARCH_SETTINGS_PATH, next);
  return credentialService ? await withCredentialStatus(next, credentialService) : next;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value) && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function";
}

function researchLog(label: string, value?: unknown): void {
  if (value === undefined) {
    console.log(`[character-research] ${label}`);
    return;
  }

  if (typeof value === "string") {
    console.log(`[character-research] ${label}: ${value}`);
    return;
  }

  console.log(`[character-research] ${label}:`, value);
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

async function resolveResearchModel(
  vaultRoot: string,
  options: ResearchCharacterOptions,
): Promise<ResolvedResearchModel> {
  const models = await listModels(vaultRoot, options);
  const selectedModel = models.find((model) => model.hasKey);
  if (!selectedModel) {
    throw createHttpError(400, "RESEARCH_MODEL_NOT_CONFIGURED", "请先在设置页配置并测试一个可用模型");
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

function normalizeFields(input: unknown, fallback: ResearchCharacterField[] = FALLBACK_FIELDS): ResearchCharacterField[] {
  if (!Array.isArray(input)) {
    return fallback;
  }

  const fields: ResearchCharacterField[] = [];
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

  return fields.length ? fields : fallback;
}

function cleanHtmlSnippet(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function compactFieldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_：:「」『』【】《》（）()\[\]{}·.。、“”，,\/\\|-]+/g, "");
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/鬼灭/g, "鬼滅")
    .replace(/蝴蝶/g, "胡蝶")
    .replace(/\s+/g, "");
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
}

function buildCharacterNameVariants(characterName: string): string[] {
  const variants = [characterName];
  if (characterName.includes("蝴蝶")) {
    variants.push(characterName.replace(/蝴蝶/g, "胡蝶"));
  }
  if (characterName.includes("胡蝶")) {
    variants.push(characterName.replace(/胡蝶/g, "蝴蝶"));
  }
  return uniqueValues(variants);
}

function buildSearchQueries(characterName: string, sourceWork: string): string[] {
  const nameVariants = buildCharacterNameVariants(characterName);
  const normalizedWork = sourceWork.replace(/鬼灭/g, "鬼滅");
  const queries = [
    [characterName, sourceWork].filter(Boolean).join(" "),
    [nameVariants.find((name) => name !== characterName) ?? characterName, normalizedWork || sourceWork].filter(Boolean).join(" "),
    nameVariants.find((name) => name !== characterName) ?? characterName,
  ];

  return uniqueValues(queries);
}

function containsAny(value: string, needles: string[]): boolean {
  const normalized = normalizeSearchText(value);
  return needles.some((needle) => normalized.includes(normalizeSearchText(needle)));
}

function countOccurrences(value: string, needles: string[]): number {
  const normalized = normalizeSearchText(value);
  let count = 0;
  for (const needle of needles.map(normalizeSearchText).filter(Boolean)) {
    let index = normalized.indexOf(needle);
    while (index >= 0) {
      count += 1;
      index = normalized.indexOf(needle, index + needle.length);
    }
  }
  return count;
}

function cleanJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const unfenced = (fenced?.[1] ?? trimmed).replace(/^\uFEFF/, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  return start >= 0 && end > start ? unfenced.slice(start, end + 1).trim() : unfenced;
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

async function fetchJsonWithTimeout<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Shulingge/1.0 character-research",
      },
    });
    if (!response.ok) {
      if (response.status === 429) {
        throw createHttpError(429, "RESEARCH_SOURCE_RATE_LIMITED", "搜索源请求过于频繁，请稍后再试");
      }
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as T & { error?: { code?: string; info?: string } };
    if (data && typeof data === "object" && data.error) {
      throw new Error(`${data.error.code ?? "api-error"}: ${data.error.info ?? "搜索源 API 返回错误"}`);
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw createHttpError(504, "RESEARCH_SOURCE_TIMEOUT", "访问搜索源超时，请稍后重试");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(fetchImpl: typeof fetch, url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Shulingge/1.0 character-research",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw createHttpError(504, "RESEARCH_SOURCE_TIMEOUT", "访问搜索源超时，请稍后重试");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function stripWikitext(value: string): string {
  return value
    .replace(/-\{[^{}]*?zh-hans:([^;{}]+)[^{}]*\}-/g, "$1")
    .replace(/-\{[^{}]*?zh-cn:([^;{}]+)[^{}]*\}-/g, "$1")
    .replace(/-\{([^{};|]+)\}-/g, "$1")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^/>]*\/>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\|[\s\S]*?\|\}/g, "")
    .replace(/\{\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\}/g, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/={2,}\s*(.*?)\s*={2,}/g, "\n$1\n")
    .replace(/^[*#:;]+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:div|p|li|tr|td|th|span)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractBalancedDiv(html: string, startIndex: number): string {
  const firstOpen = html.lastIndexOf("<div", startIndex);
  if (firstOpen < 0) {
    return "";
  }
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = firstOpen;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html))) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(firstOpen, tagPattern.lastIndex);
      }
    } else {
      depth += 1;
    }
  }
  return html.slice(firstOpen, Math.min(html.length, firstOpen + 25_000));
}

function extractPageCategoriesFromHtml(html: string): string[] {
  const match = html.match(/"wgCategories":(\[[\s\S]*?\])/);
  if (!match) {
    return [];
  }
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function extractInfoboxFromHtml(html: string): string {
  const markerIndex = html.indexOf("moe-infobox");
  const boxHtml = markerIndex >= 0 ? extractBalancedDiv(html, markerIndex) : "";
  const fields: Array<[string, string]> = [];
  if (boxHtml) {
    const rowPattern = /<div[^>]*display:\s*flex[^>]*>\s*<div[\s\S]*?<span>([\s\S]*?)<\/span><\/div>\s*<div[^>]*padding:[^>]*>([\s\S]*?)(?=<\/div><\/div>)/gi;
    let row: RegExpExecArray | null;
    while ((row = rowPattern.exec(boxHtml))) {
      const key = htmlToText(row[1]).replace(/\s+/g, "");
      const value = htmlToText(row[2]).replace(/\n{2,}/g, "\n").trim();
      if (key && value && !/^(基本资料|相关人士|萌属性)$/i.test(key)) {
        fields.push([key, value]);
      }
    }
  }

  const categories = extractPageCategoriesFromHtml(html);
  const categoryText = categories.length ? `分类/标签=${categories.slice(0, 80).join("、")}` : "";
  const fieldText = fields
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  return [fieldText, categoryText].filter(Boolean).join("\n").slice(0, MAX_INFOBOX_CONTEXT_CHARS);
}

function buildMediaWikiUrl(source: MediaWikiSourceConfig, params: Record<string, string>): string {
  const searchParams = new URLSearchParams({
    origin: "*",
    format: "json",
    utf8: "1",
    ...params,
  });
  return `${source.baseUrl}?${searchParams.toString()}`;
}

function mediaWikiArticleUrl(source: MediaWikiSourceConfig, title: string): string {
  return `${source.articleBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function articleBaseUrlFromApi(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  if (trimmed.endsWith("/w/api.php")) {
    return `${trimmed.slice(0, -"/w/api.php".length)}/wiki`;
  }
  if (trimmed.endsWith("/api.php")) {
    return trimmed.slice(0, -"/api.php".length);
  }
  return trimmed;
}

async function fetchMediaWikiExtract(input: {
  fetchImpl: typeof fetch;
  source: MediaWikiSourceConfig;
  title: string;
  introOnly: boolean;
}): Promise<{ title: string; extract: string }> {
  const extractUrl = buildMediaWikiUrl(input.source, {
    action: "query",
    prop: "extracts",
    ...(input.introOnly ? { exintro: "1" } : { exchars: String(MAX_FULL_EXTRACT_CHARS) }),
    explaintext: "1",
    redirects: "1",
    titles: input.title,
  });
  const extractData = await fetchJsonWithTimeout<{
    query?: { pages?: Record<string, { title?: string; extract?: string; missing?: unknown }> };
  }>(input.fetchImpl, extractUrl);
  const page = Object.values(extractData.query?.pages ?? {}).find((candidate) => !candidate.missing);

  return {
    title: page?.title?.trim() || input.title,
    extract: page?.extract?.trim() ?? "",
  };
}

async function fetchMediaWikiWikitext(input: {
  fetchImpl: typeof fetch;
  source: MediaWikiSourceConfig;
  title: string;
}): Promise<{ title: string; content: string }> {
  const revisionsUrl = buildMediaWikiUrl(input.source, {
    action: "query",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    redirects: "1",
    formatversion: "2",
    titles: input.title,
  });
  const revisionsData = await fetchJsonWithTimeout<{
    query?: {
      pages?: Array<{
        title?: string;
        missing?: boolean;
        revisions?: Array<{ slots?: { main?: { content?: string } }; content?: string }>;
      }>;
    };
  }>(input.fetchImpl, revisionsUrl);
  const page = revisionsData.query?.pages?.find((candidate) => !candidate.missing);
  const revision = page?.revisions?.[0];
  return {
    title: page?.title?.trim() || input.title,
    content: revision?.slots?.main?.content ?? revision?.content ?? "",
  };
}

async function fetchMediaWikiHtmlInfobox(input: {
  fetchImpl: typeof fetch;
  source: MediaWikiSourceConfig;
  title: string;
}): Promise<string> {
  const html = await fetchTextWithTimeout(input.fetchImpl, mediaWikiArticleUrl(input.source, input.title));
  return extractInfoboxFromHtml(html);
}

async function fetchWebPageText(fetchImpl: typeof fetch, url: string): Promise<string> {
  try {
    const html = await fetchTextWithTimeout(fetchImpl, url);
    return htmlToText(html).slice(0, 2400);
  } catch (error) {
    researchLog("网页正文获取失败，继续使用搜索摘要", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

function buildSearchSourceFromItems(input: {
  source: SearchSourceInfo;
  items: Array<{ title: string; url: string; snippet: string; text?: string }>;
  query: string;
}): ResearchSource {
  const best = input.items[0];
  const extract = input.items
    .map((item, index) => [
      `${index + 1}. ${item.title}`,
      item.url,
      item.snippet,
      item.text ? `正文摘录：${item.text}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n")
    .slice(0, MAX_WIKI_CONTEXT_CHARS);
  return {
    title: best?.title || input.query,
    url: best?.url || "",
    extract,
    infoboxText: "",
    searchContext: input.items.map((item, index) => `${index + 1}. ${item.title}：${item.snippet}`).join("\n"),
    usedFullExtract: Boolean(best?.text),
    sourceId: input.source.id,
    sourceName: input.source.name,
  };
}

async function fetchGoogleSource(input: {
  fetchImpl: typeof fetch;
  source: GoogleSourceConfig;
  query: string;
}): Promise<ResearchSource> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", input.source.apiKey);
  url.searchParams.set("cx", input.source.cx);
  url.searchParams.set("q", input.query);
  url.searchParams.set("num", "5");
  const data = await fetchJsonWithTimeout<{
    items?: Array<{ title?: string; link?: string; snippet?: string }>;
  }>(input.fetchImpl, url.toString());
  const rawItems = (data.items ?? [])
    .map((item) => ({
      title: item.title?.trim() ?? "",
      url: item.link?.trim() ?? "",
      snippet: item.snippet?.trim() ?? "",
    }))
    .filter((item) => item.title && item.url);
  if (!rawItems.length) {
    throw createHttpError(404, "RESEARCH_GOOGLE_NOT_FOUND", "Google 未找到可用搜索结果");
  }
  const items = await Promise.all(rawItems.slice(0, 3).map(async (item) => ({
    ...item,
    text: await fetchWebPageText(input.fetchImpl, item.url),
  })));
  researchLog("Google 搜索结果", {
    query: input.query,
    found: rawItems.length,
    titles: rawItems.map((item) => item.title),
  });
  return buildSearchSourceFromItems({ source: input.source, items, query: input.query });
}

async function fetchBingSource(input: {
  fetchImpl: typeof fetch;
  source: BingSourceConfig;
  query: string;
}): Promise<ResearchSource> {
  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", input.query);
  url.searchParams.set("mkt", "zh-CN");
  url.searchParams.set("count", "5");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await input.fetchImpl(url.toString(), {
      signal: controller.signal,
      headers: {
        "user-agent": "Shulingge/1.0 character-research",
        "Ocp-Apim-Subscription-Key": input.source.apiKey,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json() as {
      webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string }> };
    };
    const rawItems = (data.webPages?.value ?? [])
      .map((item) => ({
        title: item.name?.trim() ?? "",
        url: item.url?.trim() ?? "",
        snippet: item.snippet?.trim() ?? "",
      }))
      .filter((item) => item.title && item.url);
    if (!rawItems.length) {
      throw createHttpError(404, "RESEARCH_BING_NOT_FOUND", "Bing 未找到可用搜索结果");
    }
    const items = await Promise.all(rawItems.slice(0, 3).map(async (item) => ({
      ...item,
      text: await fetchWebPageText(input.fetchImpl, item.url),
    })));
    researchLog("Bing 搜索结果", {
      query: input.query,
      found: rawItems.length,
      titles: rawItems.map((item) => item.title),
    });
    return buildSearchSourceFromItems({ source: input.source, items, query: input.query });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw createHttpError(504, "RESEARCH_SOURCE_TIMEOUT", "访问 Bing 超时，请稍后重试");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

type FetchableResearchSource =
  | { id: string; info: SearchSourceInfo; type: "mediawiki"; source: MediaWikiSourceConfig }
  | { id: string; info: SearchSourceInfo; type: "google"; source: GoogleSourceConfig }
  | { id: string; info: SearchSourceInfo; type: "bing"; source: BingSourceConfig };

async function resolveFetchableSource(input: {
  sourceId: string;
  settings: ResearchSettings;
  credentialService: CredentialService;
}): Promise<FetchableResearchSource> {
  const customSourceId = parseCustomSearchSourceId(input.sourceId);
  if (MEDIAWIKI_SOURCES[input.sourceId]) {
    const info = decorateSearchSource(MEDIAWIKI_SOURCES[input.sourceId], input.settings);
    return { id: input.sourceId, info, type: "mediawiki", source: MEDIAWIKI_SOURCES[input.sourceId] };
  }
  if (customSourceId) {
    const customSource = input.settings.customSources?.find((source) => source.id === customSourceId);
    const customInfo = SEARCH_SOURCES.find((item) => item.id === "custom")!;
    const info = decorateSearchSource({
      ...customInfo,
      id: input.sourceId,
      name: customSource?.name?.trim() || customInfo.name,
    }, input.settings);
    const baseUrl = customSource?.baseUrl?.trim();
    if (!baseUrl) {
      throw createHttpError(400, "RESEARCH_SOURCE_NOT_CONFIGURED", "自定义源未配置，请先在设置页填写 MediaWiki api.php base url");
    }
    return {
      id: input.sourceId,
      info,
      type: "mediawiki",
      source: {
        ...customInfo,
        id: input.sourceId,
        name: customSource?.name?.trim() || customInfo.name,
        kind: "mediawiki",
        baseUrl,
        articleBaseUrl: articleBaseUrlFromApi(baseUrl),
      },
    };
  }
  if (input.sourceId === "google") {
    if (!input.settings.google?.cx || !input.settings.google.keyRef || !input.settings.google.hasKey) {
      throw createHttpError(400, "RESEARCH_SOURCE_NOT_CONFIGURED", "Google 搜索未配置，请先在设置页填写 API key 和 cx");
    }
    const apiKey = await input.credentialService.getApiKey(input.settings.google.keyRef);
    if (!apiKey) {
      throw createHttpError(400, "RESEARCH_SOURCE_NOT_CONFIGURED", "Google API key 不可用，请在设置页重新保存");
    }
    const googleInfo = SEARCH_SOURCES.find((item) => item.id === "google")!;
    return {
      id: input.sourceId,
      info: decorateSearchSource(googleInfo, input.settings),
      type: "google",
      source: { ...googleInfo, kind: "search-api", apiKey, cx: input.settings.google.cx },
    };
  }
  if (input.sourceId === "bing") {
    if (!input.settings.bing?.keyRef || !input.settings.bing.hasKey) {
      throw createHttpError(400, "RESEARCH_SOURCE_NOT_CONFIGURED", "Bing 搜索未配置，请先在设置页填写 API key");
    }
    const apiKey = await input.credentialService.getApiKey(input.settings.bing.keyRef);
    if (!apiKey) {
      throw createHttpError(400, "RESEARCH_SOURCE_NOT_CONFIGURED", "Bing API key 不可用，请在设置页重新保存");
    }
    const bingInfo = SEARCH_SOURCES.find((item) => item.id === "bing")!;
    return {
      id: input.sourceId,
      info: decorateSearchSource(bingInfo, input.settings),
      type: "bing",
      source: { ...bingInfo, kind: "search-api", apiKey },
    };
  }
  const sourceInfo = SEARCH_SOURCES.find((source) => source.id === input.sourceId);
  throw createHttpError(400, "RESEARCH_SOURCE_NOT_IMPLEMENTED", `${sourceInfo?.name ?? input.sourceId} 暂未启用`);
}

function buildResearchSourceAttemptIds(requestedSourceId: string, settings: ResearchSettings): string[] {
  const customIds = (settings.customSources ?? []).map((source) => customSearchSourceId(source.id));
  const ordered = [requestedSourceId, "wikipedia", "moegirl", ...customIds, "google", "bing"]
    .filter((sourceId, index, array) => sourceId && array.indexOf(sourceId) === index);
  return ordered.filter((sourceId) => {
    if (!isSourceEnabled(settings, sourceId)) {
      return false;
    }
    const customSourceId = parseCustomSearchSourceId(sourceId);
    if (sourceId === "wikipedia" || sourceId === "moegirl") {
      return true;
    }
    if (customSourceId) {
      return Boolean(settings.customSources?.some((source) => source.id === customSourceId && source.baseUrl.trim()));
    }
    if (sourceId === "google") {
      return Boolean(settings.google?.cx && settings.google.hasKey);
    }
    if (sourceId === "bing") {
      return Boolean(settings.bing?.hasKey);
    }
    return false;
  });
}

function isResearchNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { statusCode?: unknown; code?: unknown; appError?: { code?: unknown }; error?: { code?: unknown } };
  const code = typeof record.code === "string"
    ? record.code
    : typeof record.appError?.code === "string"
      ? record.appError.code
      : typeof record.error?.code === "string"
        ? record.error.code
        : "";
  return record.statusCode === 404 && code.includes("NOT_FOUND");
}

async function fetchResearchSourceWithFallback(input: {
  fetchImpl: typeof fetch;
  settings: ResearchSettings;
  credentialService: CredentialService;
  requestedSourceId: string;
  subjectName: string;
  sourceWork: string;
  query: string;
}): Promise<ResearchSource> {
  const attemptIds = buildResearchSourceAttemptIds(input.requestedSourceId, input.settings);
  let lastNotFound: unknown;

  researchLog("搜索源尝试顺序", {
    requestedSourceId: input.requestedSourceId,
    attemptIds,
  });

  for (const sourceId of attemptIds) {
    const resolved = await resolveFetchableSource({
      sourceId,
      settings: input.settings,
      credentialService: input.credentialService,
    });
    if (!resolved.info.implemented || !resolved.info.configured) {
      researchLog("跳过不可用搜索源", { sourceId, name: resolved.info.name, configured: resolved.info.configured });
      continue;
    }

    try {
      researchLog("尝试搜索源", { sourceId, name: resolved.info.name });
      const source = resolved.type === "mediawiki"
        ? await fetchMediaWikiSource({
          fetchImpl: input.fetchImpl,
          source: resolved.source,
          characterName: input.subjectName,
          sourceWork: input.sourceWork,
        })
        : resolved.type === "google"
          ? await fetchGoogleSource({ fetchImpl: input.fetchImpl, source: resolved.source, query: input.query })
          : await fetchBingSource({ fetchImpl: input.fetchImpl, source: resolved.source, query: input.query });
      researchLog("搜索源命中", { sourceId, name: resolved.info.name, title: source.title });
      return source;
    } catch (error) {
      if (!isResearchNotFoundError(error)) {
        throw error;
      }
      lastNotFound = error;
      researchLog("搜索源无结果，尝试下一个", { sourceId, name: resolved.info.name });
    }
  }

  if (lastNotFound) {
    throw createHttpError(404, "RESEARCH_ALL_SOURCES_NOT_FOUND", "所有已启用的源都没找到该条目");
  }
  throw createHttpError(400, "RESEARCH_SOURCE_NOT_CONFIGURED", "没有可用的联网查资料搜索源，请在设置页启用并配置搜索源");
}

function scoreSearchItem(item: WikipediaSearchItem, characterName: string, sourceWork: string): number {
  const title = normalizeSearchText(item.title);
  const rawSnippet = cleanHtmlSnippet(item.snippet ?? "");
  const snippet = normalizeSearchText(rawSnippet);
  const nameVariants = buildCharacterNameVariants(characterName);
  const normalizedNames = nameVariants.map(normalizeSearchText);
  const work = normalizeSearchText(sourceWork);
  let score = 0;
  if (normalizedNames.some((name) => title === name)) score += 130;
  if (normalizedNames.some((name) => title.includes(name))) score += 80;
  if (normalizedNames.some((name) => name.includes(title) && title.length >= 3)) score += 35;
  if (normalizedNames.some((name) => snippet.includes(name))) score += 65;
  if (work && title.includes(work)) score += 18;
  if (work && snippet.includes(work)) score += title.includes(work) ? 24 : 10;
  if (normalizedNames.some((name) => snippet.includes(name)) && !normalizedNames.some((name) => title.includes(name)) && !title.includes(work)) {
    score -= 35;
  }
  if (/角色列表|登場人物|人物列表/.test(item.title)) score -= 18;
  if (/章节列表|章節列表|漫畫章節|柱訓練篇|遊郭篇|立志篇|無限列車|劇場版|火之神血風譚/.test(item.title)) score -= 35;
  if (/消歧義/.test(rawSnippet) || /可以指/.test(rawSnippet)) score -= 170;
  return score;
}

function extractRelevantCharacterText(input: {
  title: string;
  extract: string;
  searchContext: string;
  characterName: string;
  sourceWork: string;
}): { text: string; score: number; matches: number; usedWindow: boolean } {
  const nameVariants = buildCharacterNameVariants(input.characterName);
  const sourceVariants = uniqueValues([input.sourceWork, input.sourceWork.replace(/鬼灭/g, "鬼滅")]).filter(Boolean);
  const extract = input.extract.trim();
  const normalizedExtract = normalizeSearchText(extract);
  const matchIndexes = nameVariants
    .flatMap((variant) => {
      const normalizedVariant = normalizeSearchText(variant);
      const indexes: number[] = [];
      let normalizedIndex = normalizedExtract.indexOf(normalizedVariant);
      while (normalizedIndex >= 0) {
        const rawIndex = extract.indexOf(variant, Math.max(0, normalizedIndex - variant.length));
        indexes.push(rawIndex >= 0 ? rawIndex : normalizedIndex);
        normalizedIndex = normalizedExtract.indexOf(normalizedVariant, normalizedIndex + normalizedVariant.length);
      }
      return indexes;
    })
    .filter((index) => index >= 0)
    .sort((left, right) => left - right);

  const titleScore = scoreSearchItem({ title: input.title, snippet: input.searchContext }, input.characterName, input.sourceWork);
  const contentMatches = countOccurrences(extract, nameVariants);
  let score = titleScore + contentMatches * 90;
  if (containsAny(extract, sourceVariants)) score += 35;
  if (/角色列表|登場人物|人物列表/.test(input.title) && contentMatches > 0) score += 80;
  if (/消歧義|可以指/.test(extract.slice(0, 400)) && extract.length < 1200) score -= 120;

  if (!matchIndexes.length) {
    return {
      text: extract.slice(0, MAX_RELEVANT_EXTRACT_CHARS),
      score,
      matches: 0,
      usedWindow: false,
    };
  }

  const windows: Array<[number, number]> = [];
  for (const index of matchIndexes.slice(0, 6)) {
    windows.push([Math.max(0, index - 900), Math.min(extract.length, index + 2600)]);
  }

  const merged: Array<[number, number]> = [];
  for (const [start, end] of windows) {
    const last = merged.at(-1);
    if (last && start <= last[1] + 250) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  const text = merged
    .map(([start, end], index) => {
      const prefix = index === 0 ? "" : "\n\n---\n\n";
      return `${prefix}${extract.slice(start, end).trim()}`;
    })
    .join("")
    .slice(0, MAX_RELEVANT_EXTRACT_CHARS);

  return {
    text,
    score,
    matches: matchIndexes.length,
    usedWindow: true,
  };
}

function extractRelevantWikitext(input: {
  title: string;
  content: string;
  characterName: string;
  sourceWork: string;
}): { text: string; score: number; matches: number } {
  const nameVariants = buildCharacterNameVariants(input.characterName);
  const rawContent = input.content;
  const indexes = nameVariants
    .flatMap((variant) => {
      const result: number[] = [];
      let index = rawContent.indexOf(variant);
      while (index >= 0) {
        result.push(index);
        index = rawContent.indexOf(variant, index + variant.length);
      }
      return result;
    })
    .sort((left, right) => left - right);

  if (!indexes.length) {
    return { text: "", score: 0, matches: 0 };
  }

  const windows: Array<{ start: number; end: number; text: string; score: number }> = [];
  for (const index of indexes.slice(0, 8)) {
    const previousParagraph = rawContent.lastIndexOf("\n\n", index);
    const previousTemplate = rawContent.lastIndexOf("\n {{", index);
    const previousPlainTemplate = rawContent.lastIndexOf("\n{{", index);
    const previousSection = rawContent.lastIndexOf("\n==", index);
    const previousBoundary = Math.max(previousParagraph, previousTemplate, previousPlainTemplate, previousSection);
    const nextParagraph = rawContent.indexOf("\n\n", index + 600);
    const nextTemplate = rawContent.indexOf("\n {{", index + 600);
    const nextPlainTemplate = rawContent.indexOf("\n{{", index + 600);
    const nextSection = rawContent.indexOf("\n==", index + 1);
    const nearestEnd = [nextParagraph, nextTemplate, nextPlainTemplate, nextSection]
      .filter((candidate) => candidate > index)
      .sort((left, right) => left - right)[0] ?? -1;
    const boundedStart = previousBoundary >= 0 && index - previousBoundary <= 1200 ? previousBoundary : index - 320;
    const start = Math.max(0, boundedStart);
    const end = nearestEnd >= 0 && nearestEnd - index < 3200 ? nearestEnd : Math.min(rawContent.length, index + 2400);
    const rawWindow = rawContent.slice(start, end);
    const text = stripWikitext(rawWindow);
    const firstNameIndex = Math.min(
      ...nameVariants
        .map((variant) => text.indexOf(variant))
        .filter((candidate) => candidate >= 0),
    );
    const nameOffsetScore = Number.isFinite(firstNameIndex) ? Math.max(0, 160 - firstNameIndex) : 0;
    const selfProfileScore =
      (/蟲柱|虫柱/.test(text) ? 260 : 0) +
      (/18歲|18岁/.test(text) ? 120 : 0) +
      (/蟲之呼吸|虫之呼吸/.test(text) ? 180 : 0) +
      (/藤花|紫藤|劇毒|剧毒|日輪刀|日轮刀/.test(text) ? 160 : 0) +
      (/胡蝶屋|蝴蝶屋/.test(text) ? 80 : 0);
    const relationPenalty =
      (/繼子|继子|已故姐姐|姐姐|鎹鴉|鎹鸦|護理人員|护理人员/.test(text) ? 260 : 0) +
      (/花柱|花之呼吸|香奈乎|香奈惠|叶枝|葉枝/.test(text) && !/蟲柱|虫柱|蟲之呼吸|虫之呼吸/.test(text) ? 220 : 0);
    const templateNameBonus = containsAny(rawWindow.slice(0, 600), nameVariants) ? 120 : 0;
    windows.push({
      start,
      end,
      text,
      score:
        countOccurrences(text, nameVariants) * 70 +
        nameOffsetScore +
        selfProfileScore +
        templateNameBonus +
        Math.min(text.length, 1500) / 30 -
        relationPenalty,
    });
  }

  const selectedWindows: Array<{ start: number; end: number; text: string; score: number }> = [];
  for (const window of windows
    .filter((window) => window.text.length >= 40)
    .sort((left, right) => right.score - left.score)) {
    const overlapsSelected = selectedWindows.some(
      (selected) => window.start < selected.end && selected.start < window.end,
    );
    if (!overlapsSelected) {
      selectedWindows.push(window);
    }
    if (selectedWindows.length >= 1) {
      break;
    }
  }
  selectedWindows.sort((left, right) => left.start - right.start);
  const text = selectedWindows
    .map((window, index) => `${index === 0 ? "" : "\n\n---\n\n"}${window.text}`)
    .join("")
    .slice(0, MAX_RELEVANT_EXTRACT_CHARS);
  const sourceBonus = containsAny(text, [input.sourceWork, input.sourceWork.replace(/鬼灭/g, "鬼滅")]) ? 40 : 0;

  return {
    text,
    score: indexes.length * 140 + sourceBonus + (text.length >= MIN_USEFUL_EXTRACT_CHARS ? 80 : 0),
    matches: indexes.length,
  };
}

async function fetchMediaWikiSource(input: {
  fetchImpl: typeof fetch;
  source: MediaWikiSourceConfig;
  characterName: string;
  sourceWork: string;
}): Promise<ResearchSource> {
  const queries = buildSearchQueries(input.characterName, input.sourceWork);
  const searchItemsByTitle = new Map<string, WikipediaSearchItem>();
  try {
    for (const query of queries) {
      try {
        const searchUrl = buildMediaWikiUrl(input.source, {
          action: "query",
          list: "search",
          srsearch: query,
          srlimit: "8",
        });
        const searchData = await fetchJsonWithTimeout<{
          query?: { search?: Array<{ title?: string; snippet?: string }> };
        }>(input.fetchImpl, searchUrl);
        const queryItems = (searchData.query?.search ?? [])
          .map((item) => ({
            title: typeof item.title === "string" ? item.title.trim() : "",
            snippet: typeof item.snippet === "string" ? item.snippet : "",
          }))
          .filter((item) => item.title);
        for (const item of queryItems) {
          const current = searchItemsByTitle.get(item.title);
          searchItemsByTitle.set(item.title, {
            title: item.title,
            snippet: [current?.snippet, item.snippet].filter(Boolean).join(" "),
          });
        }
        researchLog(`${input.source.name}搜索结果`, {
          query,
          found: queryItems.length,
          titles: queryItems.map((item) => item.title),
        });
      } catch (error) {
        researchLog(`${input.source.name}单次搜索失败，尝试使用已有候选继续`, {
          query,
          existingCandidates: searchItemsByTitle.size,
          error: error instanceof Error ? error.message : String(error),
        });
        if (!searchItemsByTitle.size) {
          throw error;
        }
      }
    }
    const searchItems = [...searchItemsByTitle.values()];
    researchLog(`${input.source.name}搜索结果`, {
      query: queries.join(" | "),
      found: searchItems.length,
      titles: searchItems.map((item) => item.title),
    });
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    if (input.source.directTitleFallback) {
      researchLog(`${input.source.name}搜索失败，改用标题直取`, {
        error: error instanceof Error ? error.message : String(error),
        titles: buildCharacterNameVariants(input.characterName),
      });
      for (const title of buildCharacterNameVariants(input.characterName)) {
        searchItemsByTitle.set(title, { title, snippet: `${input.source.name}标题直取：${title}` });
      }
    } else {
      throw createHttpError(
        502,
        "RESEARCH_SOURCE_SEARCH_FAILED",
        `访问${input.source.name}失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const searchItems = [...searchItemsByTitle.values()];
  if (!searchItems.length) {
    researchLog(`${input.source.name}搜索结果为空`, { queries });
    if (input.source.directTitleFallback) {
      for (const title of buildCharacterNameVariants(input.characterName)) {
        searchItemsByTitle.set(title, { title, snippet: `${input.source.name}标题直取：${title}` });
      }
    } else {
      throw createHttpError(404, "RESEARCH_CHARACTER_NOT_FOUND", `未在${input.source.name}找到该角色`);
    }
  }

  const rankedItems = [...searchItemsByTitle.values()].sort(
    (left, right) =>
      scoreSearchItem(right, input.characterName, input.sourceWork) -
      scoreSearchItem(left, input.characterName, input.sourceWork),
  );
  researchLog("词条候选初步打分", rankedItems.map((item) => ({
    title: item.title,
    score: scoreSearchItem(item, input.characterName, input.sourceWork),
    snippet: cleanHtmlSnippet(item.snippet ?? "").slice(0, 160),
  })));

  const candidates: Array<{
    title: string;
    url: string;
    extract: string;
    infoboxText: string;
    searchContext: string;
    usedFullExtract: boolean;
    score: number;
    matches: number;
    usedWindow: boolean;
  }> = [];
  const snippets = rankedItems
    .map((candidate, index) => `${index + 1}. ${candidate.title}：${cleanHtmlSnippet(candidate.snippet ?? "")}`)
    .join("\n");

  for (const item of rankedItems.slice(0, MAX_CANDIDATE_FETCH_COUNT)) {
    const introResult = await fetchMediaWikiExtract({
      fetchImpl: input.fetchImpl,
      source: input.source,
      title: item.title,
      introOnly: true,
    });
    const introTitle = introResult.title;
    const introExtract = introResult.extract;
    researchLog("词条导语 extract", {
      title: introTitle,
      length: introExtract.length,
      preview: introExtract.slice(0, 200),
    });

    let fullTitle = introTitle;
    let fullText = introExtract;
    let infoboxText = "";
    let wikitextRelevant = { text: "", score: 0, matches: 0 };
    try {
      infoboxText = await fetchMediaWikiHtmlInfobox({
        fetchImpl: input.fetchImpl,
        source: input.source,
        title: item.title,
      });
      researchLog("词条信息框资料", {
        title: item.title,
        source: input.source.id,
        length: infoboxText.length,
        preview: infoboxText.slice(0, 500),
      });
    } catch (error) {
      researchLog("词条信息框获取失败，继续使用正文", {
        title: item.title,
        source: input.source.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const shouldFetchWikitext =
      containsAny([item.title, item.snippet ?? ""].join("\n"), buildCharacterNameVariants(input.characterName)) ||
      /角色列表|登場人物|人物列表|胡蝶/.test(item.title);
    if (shouldFetchWikitext) {
      try {
        const wikitext = await fetchMediaWikiWikitext({
          fetchImpl: input.fetchImpl,
          source: input.source,
          title: item.title,
        });
        fullTitle = wikitext.title || fullTitle;
        wikitextRelevant = extractRelevantWikitext({
          title: fullTitle,
          content: wikitext.content,
          characterName: input.characterName,
          sourceWork: input.sourceWork,
        });
        researchLog("词条 wikitext 相关片段", {
          title: fullTitle,
          sourceLength: wikitext.content.length,
          matches: wikitextRelevant.matches,
          selectedLength: wikitextRelevant.text.length,
          selectedPreview: wikitextRelevant.text.slice(0, 260),
        });
        if (wikitextRelevant.text) {
          fullText = wikitextRelevant.text;
        }
      } catch (error) {
        researchLog("词条 wikitext 获取失败，降级使用 extracts", {
          title: item.title,
          source: input.source.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!wikitextRelevant.text || introExtract.length < MIN_USEFUL_EXTRACT_CHARS) {
      const fullExtract = await fetchMediaWikiExtract({
        fetchImpl: input.fetchImpl,
        source: input.source,
        title: item.title,
        introOnly: false,
      });
      const fullExtractRelevant = extractRelevantCharacterText({
        title: fullTitle,
        extract: fullExtract.extract,
        searchContext: [item.snippet, snippets].filter(Boolean).join("\n"),
        characterName: input.characterName,
        sourceWork: input.sourceWork,
      });
      fullTitle = fullExtract.title || fullTitle;
      if (!wikitextRelevant.text || fullExtractRelevant.text.length > fullText.length) {
        fullText = fullExtractRelevant.text || fullExtract.extract || fullText;
      }
      researchLog("词条完整正文 extract", {
        title: fullTitle,
        length: fullExtract.extract.length,
        selectedLength: fullText.length,
        preview: fullExtract.extract.slice(0, 200),
      });
    }

    const relevant = extractRelevantCharacterText({
      title: fullTitle,
      extract: fullText,
      searchContext: [item.snippet, snippets].filter(Boolean).join("\n"),
      characterName: input.characterName,
      sourceWork: input.sourceWork,
    });
    const usedFullExtract = true;
    const candidateExtract = relevant.text || introExtract;
    const finalScore =
      relevant.score +
      wikitextRelevant.score +
      (candidateExtract.length >= MIN_USEFUL_EXTRACT_CHARS ? 20 : -30) -
      (/消歧義|可以指/.test(candidateExtract.slice(0, 300)) && candidateExtract.length < 600 ? 180 : 0);
    candidates.push({
      title: fullTitle || introTitle,
      url: mediaWikiArticleUrl(input.source, fullTitle || introTitle),
      extract: candidateExtract,
      infoboxText,
      searchContext: snippets,
      usedFullExtract,
      score: finalScore,
      matches: Math.max(relevant.matches, wikitextRelevant.matches),
      usedWindow: relevant.usedWindow || Boolean(wikitextRelevant.text),
    });
    researchLog("词条候选正文相关性", {
      title: fullTitle || introTitle,
      score: finalScore,
      matches: Math.max(relevant.matches, wikitextRelevant.matches),
      usedWindow: relevant.usedWindow || Boolean(wikitextRelevant.text),
      selectedExtractLength: candidateExtract.length,
      selectedExtractPreview: candidateExtract.slice(0, 220),
    });
    if (finalScore >= HIGH_CONFIDENCE_SOURCE_SCORE && candidateExtract.length >= MIN_USEFUL_EXTRACT_CHARS) {
      researchLog("命中高置信词条，停止继续请求候选", {
        title: fullTitle || introTitle,
        score: finalScore,
        matches: Math.max(relevant.matches, wikitextRelevant.matches),
      });
      break;
    }
  }

  const best = candidates.sort((left, right) => right.score - left.score)[0];
  if (best?.extract || best?.searchContext) {
    researchLog(`最终采用${input.source.name}资料`, {
      title: best.title,
      score: best.score,
      matches: best.matches,
      infoboxLength: best.infoboxText.length,
      infoboxPreview: best.infoboxText.slice(0, 260),
      extractLength: best.extract.length,
      extractPreview: best.extract.slice(0, 260),
      usedFullExtract: best.usedFullExtract,
      usedWindow: best.usedWindow,
    });
    return {
      title: best.title,
      url: best.url,
      extract: best.extract,
      infoboxText: best.infoboxText,
      searchContext: best.searchContext,
      usedFullExtract: best.usedFullExtract,
      sourceId: input.source.id,
      sourceName: input.source.name,
    }
  }

  throw createHttpError(404, "RESEARCH_CHARACTER_NOT_FOUND", `未在${input.source.name}找到该角色`);
}

function buildMessages(input: {
  subjectType: "character" | "worldbook" | "timeline";
  subjectName: string;
  sourceWork: string;
  projectId?: string;
  template?: string;
  category?: string;
  line?: string;
  fields: ResearchCharacterField[];
  source: ResearchSource;
  attempt: number;
}): ChatMessage[] {
  const fieldText = input.fields
    .map((field, index) => `${index + 1}. group=${field.group || "-"}; key=${field.key || field.label}; label=${field.label || field.key}`)
    .join("\n");
  const wikiText = [
    `词条标题：${input.source.title}`,
    `词条链接：${input.source.url}`,
    "",
    "信息框资料：",
    input.source.infoboxText || "（未抓到信息框结构化资料）",
    "",
    "词条摘要：",
    input.source.extract || "（该词条没有可用导语摘要，请参考搜索摘要）",
    "",
    "搜索结果摘要：",
    input.source.searchContext,
  ].join("\n").slice(0, MAX_WIKI_CONTEXT_CHARS);
  const subjectLabel = input.subjectType === "character" ? "角色" : input.subjectType === "worldbook" ? "世界大纲设定条目" : "时间线事件";
  const systemIntro =
    input.subjectType === "character"
      ? "你在帮助用户把联网百科资料整理成小说写作工具里的角色档案字段。"
      : input.subjectType === "worldbook"
        ? "你在帮助用户把联网百科资料整理成小说写作工具里的【世界大纲】字段。"
        : "你在帮助用户把联网百科资料整理成小说写作工具里的【时间线事件】字段。";
  const domainRules =
    input.subjectType === "character"
      ? [
          "信息框资料里的明确属性优先填入对应字段，例如发色、瞳色/眼睛颜色、身高、体重、年龄、生日、声优、萌点/标签、所属团体等。",
          "正文后段明确提到的经历、最终走向、死亡/幸存/结局等，请整理到背景、重要事件或最终走向相关字段。",
        ]
      : input.subjectType === "worldbook"
        ? [
            "优先整理条目的类型、简介、详细描述、外观/构成、功能/作用、历史/起源、现状、机制、特点、与原作的关系和原作出处。",
            "如果资料来自信息框或分类标签，请把明确的所属、类型、状态、组织、地点、能力体系、关键词等整理到对应字段。",
          ]
        : [
            "优先整理事件标题、发生时间、地点、一句话简介、详细描述、起因、经过、结果、关键转折、冲突、前置/后续事件和原作出处。",
            "如果资料只覆盖大段剧情，请只摘取与查询事件直接相关的信息，不要把整部作品剧情泛泛塞入字段。",
          ];

  return [
    {
      role: "system",
      content: [
        systemIntro,
        "你必须只根据用户提供的联网百科资料和搜索摘要整理，不要凭空补写资料中没有的信息。",
        "资料不确定、没有明确提到、或无法从资料推出的字段请留空，不要编造。",
        ...domainRules,
        "只生成字段清单中存在的字段，不要新增字段。",
        "输出必须是严格 JSON，不要 Markdown，不要代码块，不要解释。",
        'JSON 结构必须是：{ "fields": { "<字段 key 或 label>": "<整理后的内容>" } }',
        "字段内容使用简体中文，保持简洁、可直接放进当前编辑器。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `项目：${input.projectId || "未指定"}`,
        `要查询的${subjectLabel}：${input.subjectName}`,
        input.sourceWork ? `来源作品：${input.sourceWork}` : "来源作品：未指定",
        input.template ? `模板：${input.template}` : "",
        input.category ? `设定类型：${input.category}` : "",
        input.line ? `线类型：${input.line}` : "",
        input.attempt > 1 ? `这是第 ${input.attempt} 次请求。上一次输出不是可解析 JSON，请只输出纯 JSON。` : "",
        "",
        "可填写字段清单：",
        fieldText,
        "",
        `${input.source.sourceName}资料：`,
        wikiText,
      ].join("\n"),
    },
  ];
}

function normalizeResultFields(raw: string, fields: ResearchCharacterField[]): Record<string, string> {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new ResearchJsonParseError("AI 返回格式不是有效 JSON");
  }

  const generated = (parsed as Record<string, unknown>).fields;
  if (!generated || typeof generated !== "object" || Array.isArray(generated)) {
    throw new ResearchJsonParseError("AI 返回内容缺少 fields 字段");
  }

  const allowed = new Set<string>();
  const normalizedAllowed = new Map<string, string>();
  for (const field of fields) {
    if (field.key) {
      allowed.add(field.key);
      normalizedAllowed.set(compactFieldKey(field.key), field.key);
    }
    if (field.label) {
      allowed.add(field.label);
      normalizedAllowed.set(compactFieldKey(field.label), field.key || field.label);
    }
  }

  const rawFields = Object.entries(generated as Record<string, unknown>)
    .map(([key, value]) => [key.trim(), typeof value === "string" ? value.trim() : ""] as const)
    .filter(([key, value]) => key && value);
  researchLog(
    "normalizeResultFields 过滤前字段",
    rawFields.map(([key, value]) => ({ key, length: value.length, preview: value.slice(0, 80) })),
  );

  const kept: Record<string, string> = {};
  const unmatched: Record<string, string> = {};
  for (const [key, value] of rawFields) {
    const directKey = allowed.has(key) ? key : undefined;
    const looseKey = normalizedAllowed.get(compactFieldKey(key));
    const outputKey = directKey ?? looseKey;
    if (outputKey) {
      kept[outputKey] = value;
    } else {
      unmatched[key] = value;
      kept[key] = value;
    }
  }

  if (Object.keys(unmatched).length) {
    const summaryTarget = ["oneLine", "sourceWorldRelation", "importantPastEvent"].find((key) =>
      fields.some((field) => field.key === key || field.label === key),
    );
    if (summaryTarget && !kept[summaryTarget]) {
      kept[summaryTarget] = Object.entries(unmatched)
        .map(([key, value]) => `${key}：${value}`)
        .join("\n")
        .slice(0, 1600);
    }
  }

  researchLog("normalizeResultFields 未匹配字段", Object.keys(unmatched));
  researchLog("normalizeResultFields 过滤后保留字段", Object.keys(kept));
  return kept;
}

function parseInfoboxKeyValues(infoboxText: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of infoboxText.split(/\n+/)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key && value && !values[key]) {
      values[key] = value;
    }
  }
  return values;
}

function findInfoboxValue(infoboxValues: Record<string, string>, aliases: string[]): string {
  const normalizedAliases = aliases.map(compactFieldKey).filter(Boolean);
  for (const [key, value] of Object.entries(infoboxValues)) {
    const normalizedKey = compactFieldKey(key);
    if (normalizedAliases.some((alias) => normalizedKey === alias || normalizedKey.includes(alias) || alias.includes(normalizedKey))) {
      return value;
    }
  }
  return "";
}

function outputFieldKey(fields: ResearchCharacterField[], key: string, label: string): string {
  const normalizedKey = compactFieldKey(key);
  const normalizedLabel = compactFieldKey(label);
  const match = fields.find((field) =>
    compactFieldKey(field.key || "") === normalizedKey ||
    compactFieldKey(field.label || "") === normalizedLabel ||
    compactFieldKey(field.label || "") === normalizedKey,
  );
  return match?.key || match?.label || "";
}

function fillFieldsFromInfobox(
  generatedFields: Record<string, string>,
  fields: ResearchCharacterField[],
  infoboxText: string,
): Record<string, string> {
  if (!infoboxText.trim()) {
    return generatedFields;
  }

  const infoboxValues = parseInfoboxKeyValues(infoboxText);
  const mapping: Array<{ key: string; label: string; aliases: string[] }> = [
    { key: "nickname", label: "昵称/外号", aliases: ["别号", "昵称", "外号"] },
    { key: "age", label: "年龄", aliases: ["年龄", "年齡"] },
    { key: "birthday", label: "生日", aliases: ["生日", "出生日期"] },
    { key: "height", label: "身高", aliases: ["身高"] },
    { key: "weight", label: "体重", aliases: ["体重", "體重"] },
    { key: "hairColor", label: "发色", aliases: ["发色", "髮色", "头发颜色"] },
    { key: "eyeColor", label: "眼睛颜色", aliases: ["瞳色", "眼睛颜色", "眼色"] },
    { key: "currentState", label: "当前状态", aliases: ["个人状态", "当前状态", "状态"] },
    { key: "organization", label: "所属组织/阵营", aliases: ["所属团体", "所属组织", "所属"] },
    { key: "specialPower", label: "是否拥有该世界观特殊能力", aliases: ["全集中呼吸法", "能力", "呼吸法"] },
  ];

  const filled: Record<string, string> = { ...generatedFields };
  const added: Record<string, string> = {};
  for (const item of mapping) {
    const targetKey = outputFieldKey(fields, item.key, item.label);
    if (!targetKey || filled[targetKey]) {
      continue;
    }
    const value = findInfoboxValue(infoboxValues, item.aliases);
    if (value) {
      filled[targetKey] = value;
      added[targetKey] = value;
    }
  }

  const finalDirectionKey = outputFieldKey(fields, "finalDirection", "最终会走向哪里");
  if (finalDirectionKey && !filled[finalDirectionKey]) {
    const status = findInfoboxValue(infoboxValues, ["个人状态", "当前状态", "状态"]);
    if (status) {
      filled[finalDirectionKey] = status;
      added[finalDirectionKey] = status;
    }
  }

  researchLog("信息框确定性补全字段", Object.keys(added).length ? added : []);
  return filled;
}

async function generateFieldsFromSource(input: {
  registry: ProviderRegistry;
  modelId: string;
  subjectType: "character" | "worldbook" | "timeline";
  subjectName: string;
  sourceWork: string;
  projectId?: string;
  template?: string;
  category?: string;
  line?: string;
  fields: ResearchCharacterField[];
  source: ResearchSource;
}): Promise<Record<string, string>> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const messages = buildMessages({ ...input, attempt });
      const promptText = messages.map((message) => `[${message.role}]\n${message.content}`).join("\n\n");
      researchLog("喂给模型的 prompt 长度", {
        attempt,
        chars: promptText.length,
        sourceTitle: input.source.title,
        sourceExtractLength: input.source.extract.length,
        usedFullExtract: input.source.usedFullExtract,
      });
      researchLog("喂给模型的完整 prompt", promptText);
      const result = await input.registry.chat(input.modelId, {
        messages,
        stream: false,
        jsonMode: true,
        maxTokens: 2600,
      });
      const response = await result;
      if (isAsyncIterable(response)) {
        throw new Error("模型返回了流式响应，角色联网查资料接口期望完整 JSON 响应");
      }
      researchLog("模型返回原始 content", response.content);
      return fillFieldsFromInfobox(
        normalizeResultFields(response.content, input.fields),
        input.fields,
        input.source.infoboxText,
      );
    } catch (error) {
      lastError = error;
      if (!(error instanceof ResearchJsonParseError)) {
        throw error;
      }
    }
  }

  throw createHttpError(
    502,
    "RESEARCH_CHARACTER_INVALID_JSON",
    `AI 返回格式不是有效 JSON，请重试。原因：${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export async function researchCharacter(
  vaultRoot: string,
  input: ResearchCharacterInput,
  options: ResearchCharacterOptions,
): Promise<ResearchCharacterResponse> {
  const characterName = typeof input.characterName === "string" ? input.characterName.trim() : "";
  const sourceWork = typeof input.sourceWork === "string" ? input.sourceWork.trim() : "";
  if (!characterName) {
    throw createHttpError(400, "RESEARCH_CHARACTER_NAME_REQUIRED", "请先填写要查询的角色名");
  }

  return await researchStructuredEntry(
    vaultRoot,
    {
      subjectType: "character",
      subjectName: characterName,
      sourceWork,
      projectId: input.projectId,
      fields: input.fields,
      source: input.source,
      fallbackFields: FALLBACK_FIELDS,
      failureCode: "RESEARCH_CHARACTER_FAILED",
      failurePrefix: "角色联网查资料失败",
    },
    options,
  );
}

export async function researchWorldbook(
  vaultRoot: string,
  input: ResearchWorldbookInput,
  options: ResearchCharacterOptions,
): Promise<ResearchCharacterResponse> {
  const entryName = typeof input.entryName === "string" ? input.entryName.trim() : "";
  const sourceWork = typeof input.sourceWork === "string" ? input.sourceWork.trim() : "";
  if (!entryName) {
    throw createHttpError(400, "RESEARCH_WORLDBOOK_NAME_REQUIRED", "请先填写要查询的设定条目名");
  }

  return await researchStructuredEntry(
    vaultRoot,
    {
      subjectType: "worldbook",
      subjectName: entryName,
      sourceWork,
      projectId: input.projectId,
      template: typeof input.template === "string" ? input.template.trim() : "",
      category: typeof input.category === "string" ? input.category.trim() : "",
      fields: input.fields,
      source: input.source,
      fallbackFields: FALLBACK_WORLDBOOK_FIELDS,
      failureCode: "RESEARCH_WORLDBOOK_FAILED",
      failurePrefix: "世界大纲联网查资料失败",
    },
    options,
  );
}

export async function researchTimeline(
  vaultRoot: string,
  input: ResearchTimelineInput,
  options: ResearchCharacterOptions,
): Promise<ResearchCharacterResponse> {
  const eventName = typeof input.eventName === "string" ? input.eventName.trim() : "";
  const sourceWork = typeof input.sourceWork === "string" ? input.sourceWork.trim() : "";
  if (!eventName) {
    throw createHttpError(400, "RESEARCH_TIMELINE_NAME_REQUIRED", "请先填写要查询的事件名");
  }

  return await researchStructuredEntry(
    vaultRoot,
    {
      subjectType: "timeline",
      subjectName: eventName,
      sourceWork,
      projectId: input.projectId,
      template: typeof input.template === "string" ? input.template.trim() : "",
      line: typeof input.line === "string" ? input.line.trim() : "",
      fields: input.fields,
      source: input.source,
      fallbackFields: FALLBACK_TIMELINE_FIELDS,
      failureCode: "RESEARCH_TIMELINE_FAILED",
      failurePrefix: "时间线联网查资料失败",
    },
    options,
  );
}

async function researchStructuredEntry(
  vaultRoot: string,
  input: {
    subjectType: "character" | "worldbook" | "timeline";
    subjectName: string;
    sourceWork: string;
    projectId?: string;
    template?: string;
    category?: string;
    line?: string;
    fields?: ResearchCharacterField[];
    source?: string;
    fallbackFields: ResearchCharacterField[];
    failureCode: string;
    failurePrefix: string;
  },
  options: ResearchCharacterOptions,
): Promise<ResearchCharacterResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const fields = normalizeFields(input.fields, input.fallbackFields);
  const settings = await withCredentialStatus(await getResearchSettings(vaultRoot), options.credentialService);
  const requestedSourceId = typeof input.source === "string" && input.source.trim() ? input.source.trim() : settings.defaultSource;
  if (!isSourceEnabled(settings, requestedSourceId)) {
    throw createHttpError(400, "RESEARCH_SOURCE_DISABLED", "所选搜索源已停用，请在设置页启用后再使用");
  }

  const query = [input.subjectName, input.sourceWork].filter(Boolean).join(" ");
  await resolveFetchableSource({
    sourceId: requestedSourceId,
    settings,
    credentialService: options.credentialService,
  });
  const source = await fetchResearchSourceWithFallback({
    fetchImpl,
    settings,
    credentialService: options.credentialService,
    requestedSourceId,
    subjectName: input.subjectName,
    sourceWork: input.sourceWork,
    query,
  });
  const { modelId, registry } = await resolveResearchModel(vaultRoot, options);

  try {
    const generatedFields = await generateFieldsFromSource({
      registry,
      modelId,
      subjectType: input.subjectType,
      subjectName: input.subjectName,
      sourceWork: input.sourceWork,
      projectId: input.projectId,
      template: input.template,
      category: input.category,
      line: input.line,
      fields,
      source,
    });

    return {
      modelId,
      fields: generatedFields,
      source: {
        title: source.title,
        url: source.url,
        sourceId: source.sourceId,
        sourceName: source.sourceName,
      },
    };
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    throw createHttpError(
      502,
      input.failureCode,
      `${input.failurePrefix}：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
