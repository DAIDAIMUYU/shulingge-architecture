// 书灵阁 Web 前端的后端 API 客户端。
// 开发期经 Vite proxy 转发到本地后端（127.0.0.1:8787）；桌面/同源部署时直接同源请求。
// 后端响应统一为 { ok: boolean; data?: T; error?: {...} }。

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string; code?: string };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.ok === false) {
    const message = body?.error?.message ?? `请求失败（HTTP ${res.status}）`;
    throw new ApiError(message, res.status);
  }
  return body.data as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, payload?: unknown) =>
  request<T>(path, {
    method: "POST",
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
const patch = <T>(path: string, payload?: unknown) =>
  request<T>(path, {
    method: "PATCH",
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

function withQuery(path: string, query: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}

// 兼容后端返回数组或 { key: [] } 两种形态
function unwrapList<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>)[key])) {
    return (value as Record<string, T[]>)[key];
  }
  return [];
}

// ---- 数据类型（前端最小定义，宽松，按需扩展）----

export interface HealthStatus {
  status: string;
  host?: string;
  vaultSelected?: boolean;
}
export interface VaultStatus {
  selected: boolean;
  root?: string | null;
}
export interface AgentInfo {
  id: string;
  name: string;
  role?: string;
  enabled?: boolean;
  order?: number;
  kind?: string;
  description?: string;
}
export interface EditorChapter {
  chapterId: string;
  projectId?: string;
  novelId?: string;
  title?: string;
  content: string;
  wordCount?: number;
  status?: string;
  updatedAt?: string;
  annotationsCount?: number;
  locksCount?: number;
  metadata?: {
    title?: string;
    status?: string;
    wordCount?: number;
    annotationsRef?: string;
    locks?: LockRecord[];
    updatedAt?: string;
    [k: string]: unknown;
  };
  annotations?: AnnotationRecord[];
}
export interface ProjectSummary {
  projectId: string;
  title: string;
}
export interface NovelSummary {
  novelId: string;
  title: string;
}
export interface ChapterSummary {
  chapterId: string;
  title: string;
}
export interface TextRange {
  start: number;
  end: number;
}
export interface AnnotationRecord {
  id: string;
  range: TextRange;
  text: string;
  convertibleTo?: string[];
}
export interface LockRecord {
  id: string;
  scope?: string;
  level?: string;
  range: TextRange;
}
export interface RunStep {
  agentId: string;
  agentName?: string;
  status: string;
  score?: number;
  lockedViolations?: number;
  hardViolations?: number;
  softViolations?: number;
  mustRewrite?: boolean;
  rewriteScope?: string;
  rewriteInstructions?: string[];
  targetAgentId?: string;
}
export interface TokenUsage {
  in: number;
  out: number;
}
export interface RunRecord {
  id: string;
  runId?: string;
  chapterId?: string;
  workflowId?: string;
  status: string;
  createdAt?: string;
  steps?: RunStep[];
  nodes?: RunStep[];
  tokens?: TokenUsage;
  cost?: number;
  contextSources?: string[];
  startedAt?: string;
  endedAt?: string;
}

export interface Character {
  id: string;
  name: string;
  role?: string;
  faction?: string;
  status?: string;
  summary?: string;
  tags?: string[];
  links?: string[];
  voice?: {
    typicalLines?: string[];
    forbiddenLines?: string[];
    honorifics?: Record<string, string>;
    bySituation?: Record<string, string[]>;
    byEmotion?: Record<string, string[]>;
    byRelationStage?: Record<string, string[]>;
  };
  knowledgeScopeRef?: string;
  currentStateRef?: string;
  forbiddenWrites?: string[];
  arcRef?: string;
  relatedWorldbook?: string[];
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}
export interface CharacterInput {
  id: string;
  name: string;
  links?: string[];
  voice?: {
    typicalLines?: string[];
    forbiddenLines?: string[];
    honorifics?: Record<string, string>;
    bySituation?: Record<string, string[]>;
    byEmotion?: Record<string, string[]>;
    byRelationStage?: Record<string, string[]>;
  };
  knowledgeScopeRef?: string;
  currentStateRef?: string;
  forbiddenWrites?: string[];
  arcRef?: string;
  relatedWorldbook?: string[];
}
export interface Relation {
  id: string;
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  type?: string;
  label?: string;
  [k: string]: unknown;
}
export interface TimelineEvent {
  id: string;
  title: string;
  line?: string;
  order?: number;
  boundChapters?: string[];
  participants?: string[];
  stateSnapshotRef?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}
export interface TimelineEventInput {
  id: string;
  title: string;
  line: string;
  order: number;
  boundChapters?: string[];
  participants?: string[];
  stateSnapshotRef?: string | null;
}
export interface WorldbookEntry {
  id: string;
  title: string;
  category?: string;
  keywords?: string[];
  content?: string;
  sections?: {
    fact?: string;
    adaptation?: string;
    currentState?: string;
    writingHint?: string;
    forbidden?: string;
  };
  trigger?: {
    keywords?: string[];
    characters?: string[];
    places?: string[];
    timeline?: string[];
    semantic?: boolean;
  };
  relatedNovels?: string[];
  appliesToAgents?: string[];
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}
export interface WorldbookEntryInput {
  id: string;
  title: string;
  sections?: {
    fact?: string;
    adaptation?: string;
    currentState?: string;
    writingHint?: string;
    forbidden?: string;
  };
  trigger?: {
    keywords?: string[];
    characters?: string[];
    places?: string[];
    timeline?: string[];
    semantic?: boolean;
  };
  relatedNovels?: string[];
  appliesToAgents?: string[];
}
export interface ModelConfig {
  id: string;
  name?: string;
  provider?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
  longContext?: boolean;
  stream?: boolean;
  jsonMode?: boolean;
  fallbackModelId?: string;
  costLimit?: number;
  hasKey?: boolean;
  [k: string]: unknown;
}
export interface RemoteGatewayStatus {
  enabled: boolean;
  autoStart: boolean;
  port: number;
  requestedPort: number;
  address?: string;
  tailscaleAddress?: string;
  passwordConfigured: boolean;
}
export interface SkillPermissionDescriptor {
  key: string;
  granted: boolean;
  risk: "safe" | "elevated" | "high";
  label: string;
  requiresConfirm: boolean;
}
export interface SkillPermissionSummary {
  descriptors: SkillPermissionDescriptor[];
  grantedKeys: string[];
  highRiskKeys: string[];
  requiresHighRiskConfirm: boolean;
  readApiKey: false;
}
export interface SkillRegistryRecord {
  id: string;
  name: string;
  version: string;
  kind: "normal" | "tool" | string;
  executable: boolean;
  registeredOnly: boolean;
  source: string;
  license: string;
  installedAt: string;
  permissionSummary: SkillPermissionSummary;
}
export interface SkillExecutionResult {
  skillId: string;
  executed: boolean;
  dryRun: boolean;
  sandbox: "none" | "v2-tool" | string;
  summary: string;
  operations: string[];
  artifacts?: Array<{
    kind: "json" | string;
    name: string;
    content: Record<string, unknown>;
  }>;
}
export interface SkillMarketEntry {
  id: string;
  skillId: string;
  name: string;
  author: string;
  summary: string;
  categories: string[];
  tags: string[];
  averageRating: number;
  ratingCount: number;
  reports: Array<{
    reporter: string;
    reason: string;
    createdAt: string;
  }>;
  certifiedAuthor: boolean;
  status: "listed" | "hidden" | "removed" | string;
  createdAt?: string;
  updatedAt?: string;
}
export interface ModelConfigInput {
  id: string;
  provider: string;
  model: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
  longContext?: boolean;
  stream?: boolean;
  jsonMode?: boolean;
  fallbackModelId?: string;
  costLimit?: number;
}
export interface KnowledgeGraph {
  nodes?: Array<{ id: string; label?: string; type?: string; [k: string]: unknown }>;
  edges?: Array<{ id?: string; from?: string; to?: string; source?: string; target?: string; label?: string; type?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

export const api = {
  health: () => get<HealthStatus>("/health"),
  healthReport: () => get<Record<string, unknown>>("/health/report"),
  vaultStatus: () => get<VaultStatus>("/vault"),
  selectVault: (root: string) => post<VaultStatus>("/vault/select", { root }),
  listAgents: async (): Promise<AgentInfo[]> => unwrapList<AgentInfo>(await get("/agents"), "agents"),
  listNotifications: async (): Promise<unknown[]> =>
    unwrapList<unknown>(await get("/notifications"), "notifications"),

  listProjects: async (): Promise<ProjectSummary[]> =>
    unwrapList<ProjectSummary>(await get("/projects"), "projects"),
  listNovels: async (projectId: string): Promise<NovelSummary[]> =>
    unwrapList<NovelSummary>(await get(`/projects/${encodeURIComponent(projectId)}/novels`), "novels"),
  listChapters: async (projectId: string, novelId: string): Promise<ChapterSummary[]> =>
    unwrapList<ChapterSummary>(
      await get(`/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters`),
      "chapters",
    ),
  createChapter: async (projectId: string, novelId: string, title: string): Promise<ChapterSummary> =>
    post<ChapterSummary>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters`,
      { title },
    ),
  createNovel: async (projectId: string, title: string): Promise<NovelSummary> =>
    post<NovelSummary>(`/projects/${encodeURIComponent(projectId)}/novels`, { title }),

  loadChapter: (chapterId: string, projectId: string, novelId: string) =>
    get<EditorChapter>(withQuery(`/editor/chapters/${encodeURIComponent(chapterId)}`, { projectId, novelId })),
  saveChapter: (chapterId: string, content: string, projectId: string, novelId: string) =>
    post<EditorChapter>(`/editor/chapters/${encodeURIComponent(chapterId)}/save`, { projectId, novelId, content }),
  saveChapterAnnotations: async (
    chapterId: string,
    projectId: string,
    novelId: string,
    annotations: AnnotationRecord[],
  ): Promise<AnnotationRecord[]> =>
    (await request<{ annotations: AnnotationRecord[] }>(`/api/v1/editor/chapters/${encodeURIComponent(chapterId)}/annotations`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, novelId, annotations }),
    })).annotations,
  saveChapterLocks: async (
    chapterId: string,
    projectId: string,
    novelId: string,
    locks: LockRecord[],
  ): Promise<LockRecord[]> =>
    (await request<{ locks: LockRecord[] }>(`/api/v1/editor/chapters/${encodeURIComponent(chapterId)}/locks`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, novelId, locks }),
    })).locks,
  runChapter: async (chapterId: string, projectId: string, novelId: string, wait?: boolean): Promise<RunRecord> =>
    (await post<{ runId: string; run: RunRecord }>(`/chapters/${encodeURIComponent(chapterId)}/run`, {
      projectId,
      novelId,
      wait,
    })).run,
  listRuns: async (projectId: string, novelId: string, chapterId?: string): Promise<RunRecord[]> =>
    unwrapList<RunRecord>(await get(withQuery("/runs", { projectId, novelId, chapterId })), "runs"),
  getRun: async (runId: string, projectId: string, novelId: string): Promise<RunRecord> =>
    (await get<{ run: RunRecord }>(withQuery(`/runs/${encodeURIComponent(runId)}`, { projectId, novelId }))).run,

  listCharacters: async (): Promise<Character[]> =>
    unwrapList<Character>(await get("/knowledge/characters"), "characters"),
  listCharactersByProject: async (projectId: string): Promise<Character[]> =>
    unwrapList<Character>(await get(withQuery("/knowledge/characters", { projectId })), "characters"),
  getCharacter: async (projectId: string, characterId: string): Promise<Character> =>
    (await get<{ character: Character }>(
      withQuery(`/knowledge/characters/${encodeURIComponent(characterId)}`, { projectId }),
    )).character,
  createCharacter: async (projectId: string, payload: CharacterInput): Promise<Character> =>
    (await post<{ character: Character }>("/knowledge/characters", { projectId, ...payload })).character,
  updateCharacter: async (projectId: string, characterId: string, payload: Partial<CharacterInput>): Promise<Character> =>
    (await patch<{ character: Character }>(`/knowledge/characters/${encodeURIComponent(characterId)}`, {
      projectId,
      ...payload,
    })).character,
  listRelations: async (): Promise<Relation[]> =>
    unwrapList<Relation>(await get("/knowledge/relations"), "relations"),
  listRelationsByProject: async (projectId: string): Promise<Relation[]> =>
    unwrapList<Relation>(await get(withQuery("/knowledge/relations", { projectId })), "relations"),
  listTimeline: async (): Promise<TimelineEvent[]> =>
    unwrapList<TimelineEvent>(await get("/knowledge/timeline"), "events"),
  listTimelineByProject: async (projectId: string): Promise<TimelineEvent[]> =>
    unwrapList<TimelineEvent>(await get(withQuery("/knowledge/timeline", { projectId })), "events"),
  getTimelineEvent: async (projectId: string, eventId: string): Promise<TimelineEvent> =>
    (await get<{ event: TimelineEvent }>(withQuery(`/knowledge/timeline/${encodeURIComponent(eventId)}`, { projectId }))).event,
  createTimelineEvent: async (projectId: string, payload: TimelineEventInput): Promise<TimelineEvent> =>
    (await post<{ event: TimelineEvent }>("/knowledge/timeline", { projectId, ...payload })).event,
  updateTimelineEvent: async (projectId: string, eventId: string, payload: Partial<TimelineEventInput>): Promise<TimelineEvent> =>
    (await patch<{ event: TimelineEvent }>(`/knowledge/timeline/${encodeURIComponent(eventId)}`, {
      projectId,
      ...payload,
    })).event,
  listWorldbook: async (): Promise<WorldbookEntry[]> =>
    unwrapList<WorldbookEntry>(await get("/knowledge/worldbook"), "entries"),
  listWorldbookByProject: async (projectId: string): Promise<WorldbookEntry[]> =>
    unwrapList<WorldbookEntry>(await get(withQuery("/knowledge/worldbook", { projectId })), "entries"),
  getWorldbookEntry: async (projectId: string, entryId: string): Promise<WorldbookEntry> =>
    (await get<{ entry: WorldbookEntry }>(withQuery(`/knowledge/worldbook/${encodeURIComponent(entryId)}`, { projectId }))).entry,
  createWorldbookEntry: async (projectId: string, payload: WorldbookEntryInput): Promise<WorldbookEntry> =>
    (await post<{ entry: WorldbookEntry }>("/knowledge/worldbook", { projectId, ...payload })).entry,
  updateWorldbookEntry: async (projectId: string, entryId: string, payload: Partial<WorldbookEntryInput>): Promise<WorldbookEntry> =>
    (await patch<{ entry: WorldbookEntry }>(`/knowledge/worldbook/${encodeURIComponent(entryId)}`, {
      projectId,
      ...payload,
    })).entry,
  knowledgeGraph: (projectId?: string, novelId?: string) =>
    get<KnowledgeGraph>(withQuery("/knowledge/graph", { projectId, novelId })),
  listModels: async (): Promise<ModelConfig[]> => unwrapList<ModelConfig>(await get("/models"), "models"),
  getModel: async (modelId: string): Promise<ModelConfig> =>
    (await get<{ model: ModelConfig }>(`/models/${encodeURIComponent(modelId)}`)).model,
  createModel: async (payload: ModelConfigInput): Promise<ModelConfig> =>
    (await post<{ model: ModelConfig }>("/models", payload)).model,
  updateModel: async (modelId: string, payload: Partial<ModelConfigInput>): Promise<ModelConfig> =>
    (await patch<{ model: ModelConfig }>(`/models/${encodeURIComponent(modelId)}`, payload)).model,
  storeModelApiKey: async (modelId: string, apiKey: string): Promise<{ hasKey: boolean; keyRef?: string }> =>
    post<{ hasKey: boolean; keyRef?: string }>(`/models/${encodeURIComponent(modelId)}/key`, { apiKey }),
  testModelConnection: async (modelId: string): Promise<Record<string, unknown>> =>
    post<Record<string, unknown>>(`/models/${encodeURIComponent(modelId)}/test`),
  remoteStatus: () => get<RemoteGatewayStatus>("/remote/status"),
  enableRemote: (password: string, port?: number, autoStart?: boolean) =>
    post<RemoteGatewayStatus>("/remote/enable", { password, port, autoStart }),
  disableRemote: () => post<RemoteGatewayStatus>("/remote/disable", {}),
  updateRemotePassword: (password: string) =>
    post<RemoteGatewayStatus>("/remote/password", { password }),
  listSkills: async (): Promise<SkillRegistryRecord[]> =>
    unwrapList<SkillRegistryRecord>(await get("/skills"), "skills"),
  executeSkill: async (skillId: string, args?: Record<string, unknown>, dryRun?: boolean): Promise<SkillExecutionResult> =>
    (await post<{ result: SkillExecutionResult }>("/skills/execute", { skillId, args, dryRun })).result,
  listSkillMarket: async (filters?: {
    q?: string;
    category?: string;
    author?: string;
    status?: string;
  }): Promise<SkillMarketEntry[]> =>
    unwrapList<SkillMarketEntry>(
      await get(withQuery("/skills/market", {
        q: filters?.q,
        category: filters?.category,
        author: filters?.author,
        status: filters?.status,
      })),
      "market",
    ),
  publishSkillMarketEntry: async (payload: {
    skillId: string;
    name: string;
    author: string;
    summary: string;
    categories?: string[];
    tags?: string[];
    certifiedAuthor?: boolean;
  }): Promise<SkillMarketEntry> =>
    (await post<{ entry: SkillMarketEntry }>("/skills/market", payload)).entry,
  rateSkillMarketEntry: async (entryId: string, payload: {
    rater: string;
    score: number;
    comment?: string;
  }): Promise<SkillMarketEntry> =>
    (await post<{ entry: SkillMarketEntry }>(`/skills/market/${encodeURIComponent(entryId)}/rate`, payload)).entry,
  reportSkillMarketEntry: async (entryId: string, payload: {
    reporter: string;
    reason: string;
  }): Promise<SkillMarketEntry> =>
    (await post<{ entry: SkillMarketEntry }>(`/skills/market/${encodeURIComponent(entryId)}/report`, payload)).entry,
  moderateSkillMarketEntry: async (entryId: string, payload: {
    status: "listed" | "hidden" | "removed";
    certifiedAuthor?: boolean;
  }): Promise<SkillMarketEntry> =>
    (await post<{ entry: SkillMarketEntry }>(`/skills/market/${encodeURIComponent(entryId)}/moderate`, payload)).entry,
  importSkillManifest: async (manifest: unknown, source?: string): Promise<SkillRegistryRecord> =>
    (await post<{ skill: SkillRegistryRecord }>("/skills/import", { manifest, source })).skill,
  importSkillFromGitHub: async (url: string): Promise<SkillRegistryRecord> =>
    (await post<{ skill: SkillRegistryRecord }>("/skills/import/github", { url })).skill,
};
