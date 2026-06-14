import { ProviderRegistry, type ChatMessage, type ProviderEndpointConfig } from "@shulingge/provider-adapters";
import { CredentialService } from "@shulingge/security";
import type { ModelConfig } from "@shulingge/shared";
import { readJsonFile } from "@shulingge/vault-core";

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
}

export interface ResearchCharacterResponse {
  modelId: string;
  fields: Record<string, string>;
  source: {
    title: string;
    url: string;
  };
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

interface WikipediaSource {
  title: string;
  url: string;
  extract: string;
  searchContext: string;
  usedFullExtract: boolean;
}

class ResearchJsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchJsonParseError";
  }
}

const WIKIPEDIA_API = "https://zh.wikipedia.org/w/api.php";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_GENERATION_ATTEMPTS = 3;
const MAX_WIKI_CONTEXT_CHARS = 10_000;
const MIN_USEFUL_EXTRACT_CHARS = 180;
const FALLBACK_FIELDS: ResearchCharacterField[] = [
  { group: "基础", key: "fullName", label: "角色全名" },
  { group: "基础", key: "oneLine", label: "一句话介绍" },
  { group: "基础", key: "occupation", label: "职业/身份" },
  { group: "基础", key: "appearanceImpression", label: "整体外貌印象" },
  { group: "基础", key: "personalityImpression", label: "整体性格印象" },
  { group: "性格", key: "corePersonality", label: "核心性格" },
  { group: "性格", key: "speechStyle", label: "说话方式" },
  { group: "关系", key: "organization", label: "所属组织/阵营" },
  { group: "背景", key: "importantPastEvent", label: "过去的重要事件" },
  { group: "背景", key: "pastEventEffect", label: "这件事如何影响现在" },
  { group: "背景", key: "sourceWork", label: "角色是否属于某个已有作品" },
  { group: "背景", key: "sourceWorldRelation", label: "和原作世界什么关系" },
  { group: "背景", key: "specialPower", label: "是否拥有该世界观特殊能力" },
  { group: "背景", key: "canonRole", label: "职责/身份/阵营" },
];

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
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw createHttpError(504, "WIKIPEDIA_TIMEOUT", "访问维基百科超时，请稍后重试");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildWikipediaUrl(params: Record<string, string>): string {
  const searchParams = new URLSearchParams({
    origin: "*",
    format: "json",
    utf8: "1",
    ...params,
  });
  return `${WIKIPEDIA_API}?${searchParams.toString()}`;
}

function wikiArticleUrl(title: string): string {
  return `https://zh.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

async function fetchWikipediaExtract(input: {
  fetchImpl: typeof fetch;
  title: string;
  introOnly: boolean;
}): Promise<{ title: string; extract: string }> {
  const extractUrl = buildWikipediaUrl({
    action: "query",
    prop: "extracts",
    ...(input.introOnly ? { exintro: "1" } : { exchars: "6500" }),
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

function scoreSearchItem(item: WikipediaSearchItem, characterName: string, sourceWork: string): number {
  const title = item.title.toLowerCase();
  const snippet = cleanHtmlSnippet(item.snippet ?? "").toLowerCase();
  const name = characterName.toLowerCase();
  const work = sourceWork.toLowerCase();
  let score = 0;
  if (title === name) score += 100;
  if (title.includes(name)) score += 70;
  if (snippet.includes(name)) score += 35;
  if (work && title.includes(work)) score += 24;
  if (work && snippet.includes(work)) score += 18;
  if (/角色列表|登場人物|人物列表/.test(title)) score += 10;
  return score;
}

async function fetchWikipediaSource(input: {
  fetchImpl: typeof fetch;
  characterName: string;
  sourceWork: string;
}): Promise<WikipediaSource> {
  const query = [input.characterName, input.sourceWork].filter(Boolean).join(" ");
  const searchUrl = buildWikipediaUrl({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "8",
  });

  let searchItems: WikipediaSearchItem[];
  try {
    const searchData = await fetchJsonWithTimeout<{
      query?: { search?: Array<{ title?: string; snippet?: string }> };
    }>(input.fetchImpl, searchUrl);
    searchItems = (searchData.query?.search ?? [])
      .map((item) => ({
        title: typeof item.title === "string" ? item.title.trim() : "",
        snippet: typeof item.snippet === "string" ? item.snippet : "",
      }))
      .filter((item) => item.title);
    researchLog("维基百科搜索结果", {
      query,
      found: searchItems.length,
      titles: searchItems.map((item) => item.title),
    });
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    throw createHttpError(
      502,
      "WIKIPEDIA_SEARCH_FAILED",
      `访问维基百科失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!searchItems.length) {
    researchLog("维基百科搜索结果为空", { query });
    throw createHttpError(404, "WIKIPEDIA_CHARACTER_NOT_FOUND", "未在维基百科找到该角色");
  }

  const rankedItems = [...searchItems].sort(
    (left, right) =>
      scoreSearchItem(right, input.characterName, input.sourceWork) -
      scoreSearchItem(left, input.characterName, input.sourceWork),
  );

  for (const item of rankedItems.slice(0, 5)) {
    let { title, extract } = await fetchWikipediaExtract({
      fetchImpl: input.fetchImpl,
      title: item.title,
      introOnly: true,
    });
    let usedFullExtract = false;
    researchLog("词条导语 extract", {
      title,
      length: extract.length,
      preview: extract.slice(0, 200),
    });
    if (extract.length < MIN_USEFUL_EXTRACT_CHARS) {
      const fullExtract = await fetchWikipediaExtract({
        fetchImpl: input.fetchImpl,
        title: item.title,
        introOnly: false,
      });
      title = fullExtract.title;
      extract = fullExtract.extract;
      usedFullExtract = true;
      researchLog("导语过短，改取词条更多内容", {
        title,
        length: extract.length,
        preview: extract.slice(0, 200),
      });
    }
    const snippets = rankedItems
      .map((candidate, index) => `${index + 1}. ${candidate.title}：${cleanHtmlSnippet(candidate.snippet ?? "")}`)
      .join("\n");
    if (extract || snippets) {
      researchLog("最终采用维基百科资料", {
        title,
        extractLength: extract.length,
        extractPreview: extract.slice(0, 200),
        usedFullExtract,
      });
      return {
        title,
        url: wikiArticleUrl(title),
        extract,
        searchContext: snippets,
        usedFullExtract,
      };
    }
  }

  throw createHttpError(404, "WIKIPEDIA_CHARACTER_NOT_FOUND", "未在维基百科找到该角色");
}

function buildMessages(input: {
  characterName: string;
  sourceWork: string;
  projectId?: string;
  fields: ResearchCharacterField[];
  source: WikipediaSource;
  attempt: number;
}): ChatMessage[] {
  const fieldText = input.fields
    .map((field, index) => `${index + 1}. group=${field.group || "-"}; key=${field.key || field.label}; label=${field.label || field.key}`)
    .join("\n");
  const wikiText = [
    `词条标题：${input.source.title}`,
    `词条链接：${input.source.url}`,
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
        "你在帮助用户把维基百科资料整理成小说写作工具里的角色档案字段。",
        "你必须只根据用户提供的维基百科资料和搜索摘要整理，不要凭空补写资料中没有的信息。",
        "资料不确定、没有明确提到、或无法从资料推出的字段请留空，不要编造。",
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
        "维基百科资料：",
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

async function generateFieldsFromSource(input: {
  registry: ProviderRegistry;
  modelId: string;
  characterName: string;
  sourceWork: string;
  projectId?: string;
  fields: ResearchCharacterField[];
  source: WikipediaSource;
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
      return normalizeResultFields(response.content, input.fields);
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
  const source = await fetchWikipediaSource({ fetchImpl, characterName, sourceWork });
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
