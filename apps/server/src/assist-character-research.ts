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
  networkNote: string;
}

export interface ResearchSettings {
  defaultSource: string;
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
    implemented: false,
    networkNote: "需配置 Bing Search API key，本轮仅占位。",
  },
  {
    id: "google",
    name: "谷歌搜索",
    kind: "search-api",
    free: false,
    requiresKey: true,
    implemented: false,
    networkNote: "需配置 Google Custom Search API key，本轮仅占位。",
  },
  {
    id: "custom",
    name: "自定义源",
    kind: "custom",
    free: true,
    requiresKey: false,
    implemented: false,
    networkNote: "可预留自定义搜索/百科 API 配置，本轮仅占位。",
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

export function listSearchSources(): { sources: SearchSourceInfo[] } {
  return {
    sources: SEARCH_SOURCES.map((source) => ({ ...source })),
  };
}

function isKnownSourceId(value: unknown): value is string {
  return typeof value === "string" && SEARCH_SOURCES.some((source) => source.id === value);
}

export async function getResearchSettings(vaultRoot: string): Promise<ResearchSettings> {
  const stored: Partial<ResearchSettings> = await readJsonFile<Partial<ResearchSettings>>(vaultRoot, RESEARCH_SETTINGS_PATH).catch(() => ({}));
  return {
    defaultSource: isKnownSourceId(stored.defaultSource) ? stored.defaultSource : DEFAULT_RESEARCH_SOURCE,
  };
}

export async function updateResearchSettings(vaultRoot: string, input: unknown): Promise<ResearchSettings> {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const defaultSource = isKnownSourceId(record.defaultSource) ? record.defaultSource : DEFAULT_RESEARCH_SOURCE;
  const next: ResearchSettings = { defaultSource };
  await writeJsonFile(vaultRoot, RESEARCH_SETTINGS_PATH, next);
  return next;
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

function normalizeFields(input: unknown): ResearchCharacterField[] {
  if (!Array.isArray(input)) {
    return FALLBACK_FIELDS;
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

  return fields.length ? fields : FALLBACK_FIELDS;
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
  return `${source.articleBaseUrl}/${encodeURIComponent(title.replace(/ /g, "_"))}`;
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
  characterName: string;
  sourceWork: string;
  projectId?: string;
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

  return [
    {
      role: "system",
      content: [
        "你在帮助用户把联网百科资料整理成小说写作工具里的角色档案字段。",
        "你必须只根据用户提供的联网百科资料和搜索摘要整理，不要凭空补写资料中没有的信息。",
        "资料不确定、没有明确提到、或无法从资料推出的字段请留空，不要编造。",
        "信息框资料里的明确属性优先填入对应字段，例如发色、瞳色/眼睛颜色、身高、体重、年龄、生日、声优、萌点/标签、所属团体等。",
        "正文后段明确提到的经历、最终走向、死亡/幸存/结局等，请整理到背景、重要事件或最终走向相关字段。",
        "只生成字段清单中存在的字段，不要新增字段。",
        "输出必须是严格 JSON，不要 Markdown，不要代码块，不要解释。",
        'JSON 结构必须是：{ "fields": { "<字段 key 或 label>": "<整理后的内容>" } }',
        "字段内容使用简体中文，保持简洁、可直接放进角色档案。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `项目：${input.projectId || "未指定"}`,
        `要查询的角色：${input.characterName}`,
        input.sourceWork ? `来源作品：${input.sourceWork}` : "来源作品：未指定",
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
  characterName: string;
  sourceWork: string;
  projectId?: string;
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

  const fetchImpl = options.fetchImpl ?? fetch;
  const fields = normalizeFields(input.fields);
  const settings = await getResearchSettings(vaultRoot);
  const requestedSourceId = typeof input.source === "string" && input.source.trim() ? input.source.trim() : settings.defaultSource;
  const sourceConfig = MEDIAWIKI_SOURCES[requestedSourceId];
  if (!sourceConfig) {
    const sourceInfo = SEARCH_SOURCES.find((source) => source.id === requestedSourceId);
    if (sourceInfo?.requiresKey) {
      throw createHttpError(400, "RESEARCH_SOURCE_REQUIRES_KEY", `${sourceInfo.name} 需要配置 API key，本轮暂未启用`);
    }
    throw createHttpError(400, "RESEARCH_SOURCE_NOT_IMPLEMENTED", `${sourceInfo?.name ?? requestedSourceId} 暂未启用`);
  }
  const source = await fetchMediaWikiSource({ fetchImpl, source: sourceConfig, characterName, sourceWork });
  const { modelId, registry } = await resolveResearchModel(vaultRoot, options);

  try {
    const generatedFields = await generateFieldsFromSource({
      registry,
      modelId,
      characterName,
      sourceWork,
      projectId: input.projectId,
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
      "RESEARCH_CHARACTER_FAILED",
      `角色联网查资料失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
