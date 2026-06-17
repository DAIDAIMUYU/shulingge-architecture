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
const del = <T>(path: string) =>
  request<T>(path, {
    method: "DELETE",
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
export type AgentPermissionMode = "controller" | "writer" | "blocker" | "checker" | "advisor" | "state-updater";
export type AgentOutputFormat = "json+text" | "text";
export interface AgentPermissions {
  canWriteDraft: boolean;
  canRewriteDraft: boolean;
  canPatchParagraph: boolean;
  canBlockWorkflow: boolean;
  canRequestRewrite: boolean;
  canWriteState: boolean;
  canUpdateRules: boolean;
}
export interface AgentSpeakConfig {
  speak: boolean;
  displayName?: string;
  icon?: string;
  showReasoning: boolean;
  showStructured: boolean;
  onlyOnFailure: boolean;
}
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  type: AgentPermissionMode;
  workflowId?: string;
  order: number;
  modelConfigId: string;
  readScope: string[];
  builtInRules: string[];
  skills: string[];
  outputFormat: AgentOutputFormat;
  permissions: AgentPermissions;
  speak: AgentSpeakConfig;
  schemaVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}
export interface AgentInfo {
  id: string;
  name: string;
  role?: string;
  enabled?: boolean;
  order?: number;
  kind?: string;
  description?: string;
  type?: AgentPermissionMode;
  workflowId?: string;
  modelConfigId?: string;
  readScope?: string[];
  builtInRules?: string[];
  skills?: string[];
  outputFormat?: AgentOutputFormat;
  permissions?: AgentPermissions;
  speak?: AgentSpeakConfig;
  schemaVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}
export interface EditorChapter {
  chapterId: string;
  projectId?: string;
  novelId?: string;
  title?: string;
  content: string;
  wordCount?: number;
  status?: string;
  creationStage?: CreationStage;
  updatedAt?: string;
  annotationsCount?: number;
  locksCount?: number;
  metadata?: {
    title?: string;
    status?: string;
    creationStage?: CreationStage;
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
  coverImage?: string;
  coverDataUrl?: string;
}
export interface CreatedProject extends ProjectSummary {
  defaultNovelId: string;
}
export interface NovelSummary {
  novelId: string;
  title: string;
}
export type VolumeStatus = "draft" | "finalized";
export interface VolumeRecord {
  id: string;
  novelId: string;
  title: string;
  order: number;
  status: VolumeStatus;
  positioning?: string;
  themes?: string;
  keyPoints?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface VolumeInput {
  title: string;
  status: VolumeStatus;
  positioning?: string;
  themes?: string;
  keyPoints?: string;
  notes?: string;
}
export interface ChapterPlanRecord {
  id: string;
  projectId: string;
  novelId: string;
  volumeId?: string;
  title: string;
  order: number;
  summary: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface ChapterPlanInput {
  title: string;
  volumeId?: string | null;
  summary?: string;
}
export interface KeyEventCustomField {
  title: string;
  content: string;
}
export interface KeyEventRecord {
  id: string;
  projectId: string;
  novelId: string;
  title: string;
  order: number;
  positioning: string;
  prerequisites: string;
  flow: string;
  relationChanges: string;
  forbidden: string;
  customFields: KeyEventCustomField[];
  volumeId?: string;
  chapterPlanId?: string;
  timelineId?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface KeyEventInput {
  title: string;
  positioning?: string;
  prerequisites?: string;
  flow?: string;
  relationChanges?: string;
  forbidden?: string;
  customFields?: KeyEventCustomField[];
  volumeId?: string | null;
  chapterPlanId?: string | null;
  timelineId?: string | null;
}
export interface PlotNoteCustomField {
  title: string;
  content: string;
}
export interface PlotNoteRecord {
  id: string;
  projectId: string;
  novelId: string;
  title: string;
  category: string;
  order: number;
  content: string;
  customFields: PlotNoteCustomField[];
  createdAt?: string;
  updatedAt?: string;
}
export interface PlotNoteInput {
  title: string;
  category?: string;
  content?: string;
  customFields?: PlotNoteCustomField[];
}
export interface ChapterSummary {
  chapterId: string;
  title: string;
  status: string;
  creationStage?: CreationStage;
  wordCount: number;
}
export type CreationStage = "idle" | "planning" | "writing" | "reviewing" | "polishing" | "pending_confirm" | "finalized";
export interface SearchQuery {
  text?: string;
  projectId?: string;
  type?: string;
  limit?: number;
}
export interface SearchResult {
  id?: string;
  type: string;
  projectId: string;
  novelId?: string;
  path: string;
  title: string;
  content: string;
  tags?: string[];
  score: number;
}
export interface RebuildIndexResult {
  indexedCount: number;
  indexPath: string;
  reused?: boolean;
}
export interface DirectorChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface DirectorChatPayload {
  modelId?: string;
  projectId?: string;
  novelId?: string;
  chapterId?: string;
  messages: DirectorChatMessage[];
}
export interface DirectorTaskSuggestion {
  agentId: string;
  agentName: string;
  taskDescription: string;
  confirmText: string;
}
export interface DirectorChatResponse {
  modelId: string;
  mode?: "chat" | "task";
  reply?: string;
  task?: DirectorTaskSuggestion;
}
export interface DirectorExecutePayload {
  agentId: string;
  taskDescription: string;
  projectId?: string;
  novelId?: string;
  chapterId?: string;
  currentContent?: string;
}
export interface DirectorExecuteResponse {
  agentId: string;
  agentName: string;
  modelId: string;
  newContent: string;
}
export interface DirectorReviewPayload {
  projectId?: string;
  novelId?: string;
  chapterId?: string;
  currentContent?: string;
}
export interface DirectorReviewReport {
  agentId: string;
  agentName: string;
  status: "success" | "failed";
  modelId?: string;
  text: string;
}
export interface DirectorReviewResponse {
  reports: DirectorReviewReport[];
}
export interface DirectorConversationRecord {
  id: string;
  title: string;
  messages: unknown[];
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
}
export interface DirectorConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}
export interface AssistCharacterField {
  group: string;
  key: string;
  label: string;
}
export interface AssistCharacterPayload {
  mode: "original" | "fanfic";
  userPrompt: string;
  characterName?: string;
  sourceWork?: string;
  scopeInstruction?: string;
  template?: string;
  projectId?: string;
  fields: AssistCharacterField[];
  existingValues: Record<string, string>;
}
export interface AssistCharacterResponse {
  modelId: string;
  fields: Record<string, string>;
}
export interface ResearchCharacterPayload {
  characterName: string;
  sourceWork?: string;
  projectId?: string;
  fields?: AssistCharacterField[];
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
export interface ResearchWorldbookPayload {
  entryName: string;
  sourceWork?: string;
  projectId?: string;
  template?: string;
  category?: string;
  fields?: AssistWorldbookField[];
  source?: string;
  sourceConfig?: Record<string, unknown>;
}
export interface ResearchTimelinePayload {
  eventName: string;
  sourceWork?: string;
  projectId?: string;
  template?: string;
  line?: string;
  fields?: AssistTimelineField[];
  source?: string;
  sourceConfig?: Record<string, unknown>;
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
  customSources?: Array<{
    id: string;
    name: string;
    baseUrl: string;
  }>;
  sourceStates?: Record<string, SearchSourceState>;
  customSource?: {
    name?: string;
    baseUrl?: string;
  };
  google?: {
    cx?: string;
    apiKey?: string;
    hasKey?: boolean;
  };
  bing?: {
    apiKey?: string;
    hasKey?: boolean;
  };
}
export interface SearchSourceTestPayload {
  source: "custom" | "google" | "bing";
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
export interface CustomFontRecord {
  id: string;
  label: string;
  family: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  dataUrl: string;
}
export interface ImportFontPayload {
  label: string;
  fileName: string;
  mimeType: string;
  contentBase64: string;
}
export interface AssistWorldbookField {
  group: string;
  key: string;
  label: string;
}
export interface AssistWorldbookPayload {
  mode: "original" | "fanfic";
  userPrompt: string;
  entryName?: string;
  sourceWork?: string;
  scopeInstruction?: string;
  template?: string;
  category?: string;
  projectId?: string;
  fields: AssistWorldbookField[];
  existingValues: Record<string, string>;
}
export interface AssistWorldbookResponse {
  modelId: string;
  fields: Record<string, string>;
}
export interface AssistTimelineField {
  group: string;
  key: string;
  label: string;
}
export interface AssistTimelinePayload {
  mode: "original" | "fanfic";
  userPrompt: string;
  eventName?: string;
  sourceWork?: string;
  scopeInstruction?: string;
  template?: string;
  line?: string;
  projectId?: string;
  fields: AssistTimelineField[];
  existingValues: Record<string, string>;
}
export interface AssistTimelineResponse {
  modelId: string;
  fields: Record<string, string>;
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

export type CharacterProfileTemplate = "simple" | "detailed";
export type CharacterProfileGroup = "basic" | "appearance" | "language" | "belief" | "relations" | "background";
export interface CharacterProfileCustomField {
  label?: string;
  value?: string;
}
export type CharacterProfileSection = Record<string, string | undefined>;
export interface CharacterProfile {
  template?: CharacterProfileTemplate;
  avatarPath?: string;
  basic?: CharacterProfileSection;
  appearance?: CharacterProfileSection;
  language?: CharacterProfileSection;
  belief?: CharacterProfileSection;
  relations?: CharacterProfileSection;
  background?: CharacterProfileSection;
  custom?: Partial<Record<CharacterProfileGroup, CharacterProfileCustomField[]>>;
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
  profile?: CharacterProfile;
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
  profile?: CharacterProfile;
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
  stage?: string;
  sourceChapters?: string[];
  [k: string]: unknown;
}
export interface RelationInput {
  id: string;
  from: string;
  to: string;
  type: string;
  stage?: string;
  sourceChapters?: string[];
}
export type TimelineLine = "main" | "character" | "relation" | "world" | "canon" | "branch" | "chapter";
export type TimelineTemplate = "simple" | "detailed";
export type TimelineImportance = "core" | "important" | "minor";
export type TimelineProfileGroup = "basic" | "content" | "relations" | "writing";
export interface TimelineCustomField {
  label?: string;
  value?: string;
}
export type TimelineProfileSection = Record<string, string | undefined>;
export interface TimelineProfile {
  template?: TimelineTemplate;
  basic?: TimelineProfileSection;
  content?: TimelineProfileSection;
  relations?: TimelineProfileSection;
  writing?: TimelineProfileSection;
  custom?: Partial<Record<TimelineProfileGroup, TimelineCustomField[]>>;
}
export interface TimelineEvent {
  id: string;
  title: string;
  line?: TimelineLine;
  order?: number;
  template?: TimelineTemplate;
  importance?: TimelineImportance;
  eventDate?: string;
  summary?: string;
  description?: string;
  location?: string;
  relatedWorldbook?: string[];
  previousEvents?: string[];
  nextEvents?: string[];
  profile?: TimelineProfile;
  custom?: TimelineCustomField[];
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
  line: TimelineLine;
  order: number;
  template?: TimelineTemplate;
  importance?: TimelineImportance;
  eventDate?: string;
  summary?: string;
  description?: string;
  location?: string;
  relatedWorldbook?: string[];
  previousEvents?: string[];
  nextEvents?: string[];
  profile?: TimelineProfile;
  custom?: TimelineCustomField[];
  boundChapters?: string[];
  participants?: string[];
  stateSnapshotRef?: string | null;
}
export type WorldbookOrigin = "canon" | "original";
export type WorldbookCategory =
  | "place"
  | "organization"
  | "people"
  | "history"
  | "event"
  | "item"
  | "power-system"
  | "rule"
  | "culture"
  | "geography"
  | "politics"
  | "economy"
  | "religion"
  | "language"
  | "technology"
  | "faction-relation"
  | "other"
  | "setting";
export type WorldbookTemplate = "simple" | "detailed";
export type WorldbookImportance = "core" | "important" | "minor";
export type WorldbookProfileGroup = "basic" | "content" | "background" | "relations" | "writing";
export interface WorldbookCustomField {
  label?: string;
  value?: string;
}
export type WorldbookProfileSection = Record<string, string | undefined>;
export interface WorldbookProfile {
  template?: WorldbookTemplate;
  basic?: WorldbookProfileSection;
  content?: WorldbookProfileSection;
  background?: WorldbookProfileSection;
  relations?: WorldbookProfileSection;
  writing?: WorldbookProfileSection;
  custom?: Partial<Record<WorldbookProfileGroup, WorldbookCustomField[]>>;
}
export interface WorldbookEntry {
  id: string;
  title: string;
  origin?: WorldbookOrigin;
  category?: WorldbookCategory;
  template?: WorldbookTemplate;
  importance?: WorldbookImportance;
  name?: string;
  summary?: string;
  description?: string;
  keywords?: string[];
  relatedCharacters?: string[];
  relatedSettings?: string[];
  relatedEvents?: string[];
  relatedChapters?: string[];
  custom?: WorldbookCustomField[];
  profile?: WorldbookProfile;
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
  origin?: WorldbookOrigin;
  category?: WorldbookCategory;
  template?: WorldbookTemplate;
  importance?: WorldbookImportance;
  name?: string;
  summary?: string;
  description?: string;
  keywords?: string[];
  relatedCharacters?: string[];
  relatedSettings?: string[];
  relatedEvents?: string[];
  relatedChapters?: string[];
  custom?: WorldbookCustomField[];
  profile?: WorldbookProfile;
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
export type RuleLevel = "locked" | "hard" | "soft" | "preference";
export type RuleScope = "system" | "global" | "vault" | "project" | "novel" | "volume" | "chapter" | "task" | "agent";
export type RuleDetectBy = "hard-check" | "ai-check" | "manual" | "mixed";
export type RuleViolationAction = "block" | "rewrite" | "warn" | "record" | "pause";
export type RuleOverridePolicy = "locked" | "allow-branch-override" | "append-only" | "disable-in-branch" | "no-override";
export interface RuleRecord {
  id: string;
  title: string;
  content: string;
  level: RuleLevel;
  scope: RuleScope;
  appliesTo?: string[];
  detectBy: RuleDetectBy[];
  onViolation: RuleViolationAction;
  enabled: boolean;
  source: string;
  priority: number;
  overridePolicy: RuleOverridePolicy;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}
export interface RuleInput {
  id: string;
  title: string;
  content?: string;
  level?: RuleLevel;
  scope?: RuleScope;
  appliesTo?: string[];
  detectBy?: RuleDetectBy[];
  onViolation?: RuleViolationAction;
  enabled?: boolean;
  source?: string;
  priority?: number;
  overridePolicy?: RuleOverridePolicy;
  tags?: string[];
}
export interface RuleImportFileInput {
  fileName?: string;
  content: string;
}
export interface RuleImportInput {
  files: RuleImportFileInput[];
  level?: RuleLevel;
  scope?: RuleScope;
  appliesTo?: string[];
  detectBy?: RuleDetectBy[];
  onViolation?: RuleViolationAction;
  enabled?: boolean;
  source?: string;
  priority?: number;
  overridePolicy?: RuleOverridePolicy;
  tags?: string[];
}
export interface ModelConfig {
  id: string;
  name?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
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
  baseUrl?: string;
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
export interface AgentConfigInput {
  id?: string;
  name: string;
  description?: string;
  enabled?: boolean;
  type?: AgentPermissionMode;
  workflowId?: string;
  order?: number;
  modelConfigId?: string;
  readScope?: string[];
  builtInRules?: string[];
  skills?: string[];
  outputFormat?: AgentOutputFormat;
  permissions?: AgentPermissions;
  speak?: AgentSpeakConfig;
}
export interface AgentExportBundle {
  exportedAt: string;
  agents: AgentConfig[];
}
export interface AgentImportResult {
  imported: AgentConfig[];
  skipped: string[];
  overwritten: string[];
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
  selectVault: (rootPath: string) => post<VaultStatus>("/vault/select", { rootPath }),
  listAgents: async (): Promise<AgentInfo[]> => unwrapList<AgentInfo>(await get("/agents"), "agents"),
  exportAgents: async (): Promise<AgentExportBundle> =>
    get<AgentExportBundle>("/agents/export"),
  importAgents: async (payload: unknown, mode: "overwrite" | "skip" = "overwrite"): Promise<AgentImportResult> =>
    post<AgentImportResult>("/agents/import", { payload, mode }),
  getAgent: async (agentId: string): Promise<AgentConfig> =>
    (await get<{ agent: AgentConfig }>(`/agents/${encodeURIComponent(agentId)}`)).agent,
  createAgent: async (payload: AgentConfigInput): Promise<AgentConfig> =>
    (await post<{ agent: AgentConfig }>("/agents", payload)).agent,
  updateAgent: async (agentId: string, payload: Partial<AgentConfigInput>): Promise<AgentConfig> =>
    (await patch<{ agent: AgentConfig }>(`/agents/${encodeURIComponent(agentId)}`, payload)).agent,
  deleteAgent: async (agentId: string): Promise<{ deleted: true; agentId: string }> =>
    del<{ deleted: true; agentId: string }>(`/agents/${encodeURIComponent(agentId)}`),
  listNotifications: async (): Promise<unknown[]> =>
    unwrapList<unknown>(await get("/notifications"), "notifications"),
  search: async (query: SearchQuery): Promise<SearchResult[]> =>
    unwrapList<SearchResult>(
      await get(withQuery("/search", {
        q: query.text,
        project: query.projectId,
        type: query.type,
        limit: query.limit === undefined ? undefined : String(query.limit),
      })),
      "results",
    ),
  rebuildIndex: async (): Promise<RebuildIndexResult> =>
    post<RebuildIndexResult>("/index/rebuild", {}),
  chatWithDirector: async (payload: DirectorChatPayload): Promise<DirectorChatResponse> =>
    post<DirectorChatResponse>("/director/chat", payload),
  executeDirectorTask: async (payload: DirectorExecutePayload): Promise<DirectorExecuteResponse> =>
    post<DirectorExecuteResponse>("/director/execute", payload),
  reviewChapter: async (payload: DirectorReviewPayload): Promise<DirectorReviewResponse> =>
    post<DirectorReviewResponse>("/director/review", payload),
  listDirectorConversations: async (): Promise<DirectorConversationSummary[]> =>
    unwrapList<DirectorConversationSummary>(await get("/director/conversations"), "conversations"),
  createDirectorConversation: async (payload: { title?: string; messages?: unknown[] } = {}): Promise<DirectorConversationRecord> =>
    post<DirectorConversationRecord>("/director/conversations", payload),
  loadDirectorConversation: async (conversationId: string): Promise<DirectorConversationRecord> =>
    get<DirectorConversationRecord>(`/director/conversations/${encodeURIComponent(conversationId)}`),
  saveDirectorConversation: async (conversationId: string, messages: unknown[], title?: string): Promise<DirectorConversationRecord> =>
    request<DirectorConversationRecord>(`/director/conversations/${encodeURIComponent(conversationId)}`, {
      method: "PUT",
      body: JSON.stringify({ title, messages }),
    }),
  deleteDirectorConversation: async (conversationId: string): Promise<{ ok: true }> =>
    request<{ ok: true }>(`/director/conversations/${encodeURIComponent(conversationId)}`, {
      method: "DELETE",
    }),
  assistCharacter: async (payload: AssistCharacterPayload): Promise<AssistCharacterResponse> =>
    post<AssistCharacterResponse>("/assist/character", payload),
  listSearchSources: async (): Promise<SearchSourceInfo[]> =>
    unwrapList<SearchSourceInfo>(await get("/assist/search-sources"), "sources"),
  testSearchSource: async (payload: SearchSourceTestPayload): Promise<SearchSourceTestResult> =>
    post<SearchSourceTestResult>("/assist/search-sources/test", payload),
  getResearchSettings: async (): Promise<ResearchSettings> =>
    get<ResearchSettings>("/assist/research-settings"),
  updateResearchSettings: async (payload: ResearchSettings): Promise<ResearchSettings> =>
    request<ResearchSettings>("/assist/research-settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  listCustomFonts: async (): Promise<CustomFontRecord[]> =>
    unwrapList<CustomFontRecord>(await get("/fonts"), "fonts"),
  importCustomFont: async (payload: ImportFontPayload): Promise<CustomFontRecord> =>
    (await post<{ font: CustomFontRecord }>("/fonts/import", payload)).font,
  researchCharacter: async (payload: ResearchCharacterPayload): Promise<ResearchCharacterResponse> =>
    post<ResearchCharacterResponse>("/assist/character/research", payload),
  assistWorldbook: async (payload: AssistWorldbookPayload): Promise<AssistWorldbookResponse> =>
    post<AssistWorldbookResponse>("/assist/worldbook", payload),
  researchWorldbook: async (payload: ResearchWorldbookPayload): Promise<ResearchCharacterResponse> =>
    post<ResearchCharacterResponse>("/assist/worldbook/research", payload),
  assistTimeline: async (payload: AssistTimelinePayload): Promise<AssistTimelineResponse> =>
    post<AssistTimelineResponse>("/assist/timeline", payload),
  researchTimeline: async (payload: ResearchTimelinePayload): Promise<ResearchCharacterResponse> =>
    post<ResearchCharacterResponse>("/assist/timeline/research", payload),

  listProjects: async (): Promise<ProjectSummary[]> =>
    unwrapList<ProjectSummary>(await get("/projects"), "projects"),
  createProject: async (title: string): Promise<CreatedProject> =>
    post<CreatedProject>("/projects", { title }),
  updateProjectCover: async (
    projectId: string,
    payload: { fileName: string; mimeType?: string; contentBase64: string },
  ): Promise<ProjectSummary> =>
    request<ProjectSummary>(`/projects/${encodeURIComponent(projectId)}/cover`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  listNovels: async (projectId: string): Promise<NovelSummary[]> =>
    unwrapList<NovelSummary>(await get(`/projects/${encodeURIComponent(projectId)}/novels`), "novels"),
  listChapters: async (projectId: string, novelId: string): Promise<ChapterSummary[]> =>
    unwrapList<ChapterSummary>(
      await get(`/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters`),
      "chapters",
    ),
  createChapter: async (projectId: string, novelId: string, title: string, volumeId?: string): Promise<ChapterSummary> =>
    post<ChapterSummary>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters`,
      { title, volumeId },
    ),
  renameChapter: async (projectId: string, novelId: string, chapterId: string, title: string): Promise<ChapterSummary> =>
    patch<ChapterSummary>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}`,
      { title },
    ),
  setChapterStatus: async (projectId: string, novelId: string, chapterId: string, status: string): Promise<ChapterSummary> =>
    patch<ChapterSummary>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}`,
      { status },
    ),
  setChapterCreationStage: async (projectId: string, novelId: string, chapterId: string, creationStage: CreationStage): Promise<ChapterSummary> =>
    patch<ChapterSummary>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}`,
      { creationStage },
    ),
  deleteChapter: async (projectId: string, novelId: string, chapterId: string): Promise<{ ok: true }> =>
    request<{ ok: true }>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}`,
      { method: "DELETE" },
    ),
  moveChapter: async (
    projectId: string,
    novelId: string,
    chapterId: string,
    targetNovelId: string,
  ): Promise<{ chapterId: string; novelId: string }> =>
    post<{ chapterId: string; novelId: string }>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/move`,
      { targetNovelId },
    ),
  createNovel: async (projectId: string, title: string): Promise<NovelSummary> =>
    post<NovelSummary>(`/projects/${encodeURIComponent(projectId)}/novels`, { title }),
  renameNovel: async (projectId: string, novelId: string, title: string): Promise<NovelSummary> =>
    patch<NovelSummary>(`/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}`, { title }),
  deleteNovel: async (projectId: string, novelId: string): Promise<{ ok: true }> =>
    request<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}`, {
      method: "DELETE",
    }),
  listVolumes: async (projectId: string, novelId: string): Promise<VolumeRecord[]> =>
    unwrapList<VolumeRecord>(
      await get(`/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/volumes`),
      "volumes",
    ),
  createVolume: async (projectId: string, novelId: string, payload: VolumeInput): Promise<VolumeRecord> =>
    post<VolumeRecord>(`/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/volumes`, payload),
  updateVolume: async (projectId: string, novelId: string, volumeId: string, payload: Partial<VolumeInput>): Promise<VolumeRecord> =>
    patch<VolumeRecord>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/volumes/${encodeURIComponent(volumeId)}`,
      payload,
    ),
  deleteVolume: async (projectId: string, novelId: string, volumeId: string): Promise<{ id: string; deleted: true }> =>
    request<{ id: string; deleted: true }>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/volumes/${encodeURIComponent(volumeId)}`,
      { method: "DELETE" },
    ),
  reorderVolumes: async (projectId: string, novelId: string, orderedIds: string[]): Promise<VolumeRecord[]> =>
    unwrapList<VolumeRecord>(
      await request<{ volumes: VolumeRecord[] }>(
        `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/volumes/reorder`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        },
      ),
      "volumes",
    ),
  listChapterPlans: async (projectId: string, novelId: string): Promise<ChapterPlanRecord[]> =>
    unwrapList<ChapterPlanRecord>(
      await get(`/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapter-plans`),
      "chapterPlans",
    ),
  createChapterPlan: async (projectId: string, novelId: string, payload: ChapterPlanInput): Promise<ChapterPlanRecord> =>
    post<ChapterPlanRecord>(`/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapter-plans`, payload),
  updateChapterPlan: async (
    projectId: string,
    novelId: string,
    chapterPlanId: string,
    payload: Partial<ChapterPlanInput>,
  ): Promise<ChapterPlanRecord> =>
    patch<ChapterPlanRecord>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapter-plans/${encodeURIComponent(chapterPlanId)}`,
      payload,
    ),
  deleteChapterPlan: async (projectId: string, novelId: string, chapterPlanId: string): Promise<{ id: string; deleted: true }> =>
    request<{ id: string; deleted: true }>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapter-plans/${encodeURIComponent(chapterPlanId)}`,
      { method: "DELETE" },
    ),
  reorderChapterPlans: async (projectId: string, novelId: string, orderedIds: string[]): Promise<ChapterPlanRecord[]> =>
    unwrapList<ChapterPlanRecord>(
      await request<{ chapterPlans: ChapterPlanRecord[] }>(
        `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/chapter-plans/reorder`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        },
      ),
      "chapterPlans",
    ),
  listKeyEvents: async (projectId: string, novelId: string): Promise<KeyEventRecord[]> =>
    unwrapList<KeyEventRecord>(
      await get(`/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/key-events`),
      "keyEvents",
    ),
  createKeyEvent: async (projectId: string, novelId: string, payload: KeyEventInput): Promise<KeyEventRecord> =>
    post<KeyEventRecord>(`/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/key-events`, payload),
  updateKeyEvent: async (
    projectId: string,
    novelId: string,
    keyEventId: string,
    payload: Partial<KeyEventInput>,
  ): Promise<KeyEventRecord> =>
    patch<KeyEventRecord>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/key-events/${encodeURIComponent(keyEventId)}`,
      payload,
    ),
  deleteKeyEvent: async (projectId: string, novelId: string, keyEventId: string): Promise<{ id: string; deleted: true }> =>
    request<{ id: string; deleted: true }>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/key-events/${encodeURIComponent(keyEventId)}`,
      { method: "DELETE" },
    ),
  reorderKeyEvents: async (projectId: string, novelId: string, orderedIds: string[]): Promise<KeyEventRecord[]> =>
    unwrapList<KeyEventRecord>(
      await request<{ keyEvents: KeyEventRecord[] }>(
        `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/key-events/reorder`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        },
      ),
      "keyEvents",
    ),
  listPlotNotes: async (projectId: string, novelId: string): Promise<PlotNoteRecord[]> =>
    unwrapList<PlotNoteRecord>(
      await get(`/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/plot-notes`),
      "plotNotes",
    ),
  createPlotNote: async (projectId: string, novelId: string, payload: PlotNoteInput): Promise<PlotNoteRecord> =>
    post<PlotNoteRecord>(`/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/plot-notes`, payload),
  updatePlotNote: async (
    projectId: string,
    novelId: string,
    plotNoteId: string,
    payload: Partial<PlotNoteInput>,
  ): Promise<PlotNoteRecord> =>
    patch<PlotNoteRecord>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/plot-notes/${encodeURIComponent(plotNoteId)}`,
      payload,
    ),
  deletePlotNote: async (projectId: string, novelId: string, plotNoteId: string): Promise<{ id: string; deleted: true }> =>
    request<{ id: string; deleted: true }>(
      `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/plot-notes/${encodeURIComponent(plotNoteId)}`,
      { method: "DELETE" },
    ),
  reorderPlotNotes: async (projectId: string, novelId: string, orderedIds: string[]): Promise<PlotNoteRecord[]> =>
    unwrapList<PlotNoteRecord>(
      await request<{ plotNotes: PlotNoteRecord[] }>(
        `/projects/${encodeURIComponent(projectId)}/novels/${encodeURIComponent(novelId)}/plot-notes/reorder`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        },
      ),
      "plotNotes",
    ),

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
  deleteCharacter: async (projectId: string, characterId: string): Promise<{ id: string; deleted: true }> =>
    del<{ id: string; deleted: true }>(withQuery(`/knowledge/characters/${encodeURIComponent(characterId)}`, { projectId })),
  listRelations: async (): Promise<Relation[]> =>
    unwrapList<Relation>(await get("/knowledge/relations"), "relations"),
  listRelationsByProject: async (projectId: string): Promise<Relation[]> =>
    unwrapList<Relation>(await get(withQuery("/knowledge/relations", { projectId })), "relations"),
  createRelation: async (projectId: string, payload: RelationInput): Promise<Relation> =>
    (await post<{ relation: Relation }>("/knowledge/relations", { projectId, ...payload })).relation,
  updateRelation: async (projectId: string, relationId: string, payload: Partial<RelationInput>): Promise<Relation> =>
    (await patch<{ relation: Relation }>(`/knowledge/relations/${encodeURIComponent(relationId)}`, {
      projectId,
      ...payload,
    })).relation,
  deleteRelation: async (projectId: string, relationId: string): Promise<{ id: string; deleted: true }> =>
    del<{ id: string; deleted: true }>(withQuery(`/knowledge/relations/${encodeURIComponent(relationId)}`, { projectId })),
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
  deleteTimelineEvent: async (projectId: string, eventId: string): Promise<{ id: string; deleted: true }> =>
    del<{ id: string; deleted: true }>(withQuery(`/knowledge/timeline/${encodeURIComponent(eventId)}`, { projectId })),
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
  deleteWorldbookEntry: async (projectId: string, entryId: string): Promise<{ id: string; deleted: true }> =>
    del<{ id: string; deleted: true }>(withQuery(`/knowledge/worldbook/${encodeURIComponent(entryId)}`, { projectId })),
  listRulesByProject: async (projectId: string): Promise<RuleRecord[]> =>
    unwrapList<RuleRecord>(await get(withQuery("/knowledge/rules", { projectId })), "rules"),
  createRule: async (projectId: string, payload: RuleInput): Promise<RuleRecord> =>
    (await post<{ rule: RuleRecord }>("/knowledge/rules", { projectId, ...payload })).rule,
  importRules: async (projectId: string, payload: RuleImportInput): Promise<RuleRecord[]> =>
    unwrapList<RuleRecord>(await post("/knowledge/rules/import", { projectId, ...payload }), "rules"),
  updateRule: async (projectId: string, ruleId: string, payload: Partial<RuleInput>): Promise<RuleRecord> =>
    (await patch<{ rule: RuleRecord }>(`/knowledge/rules/${encodeURIComponent(ruleId)}`, {
      projectId,
      ...payload,
    })).rule,
  deleteRule: async (projectId: string, ruleId: string): Promise<{ id: string; deleted: true }> =>
    del<{ id: string; deleted: true }>(withQuery(`/knowledge/rules/${encodeURIComponent(ruleId)}`, { projectId })),
  knowledgeGraph: (projectId?: string, novelId?: string) =>
    get<KnowledgeGraph>(withQuery("/knowledge/graph", { projectId, novelId })),
  listModels: async (): Promise<ModelConfig[]> => unwrapList<ModelConfig>(await get("/models"), "models"),
  getModel: async (modelId: string): Promise<ModelConfig> =>
    (await get<{ model: ModelConfig }>(`/models/${encodeURIComponent(modelId)}`)).model,
  createModel: async (payload: ModelConfigInput): Promise<ModelConfig> =>
    (await post<{ model: ModelConfig }>("/models", payload)).model,
  updateModel: async (modelId: string, payload: Partial<ModelConfigInput>): Promise<ModelConfig> =>
    (await patch<{ model: ModelConfig }>(`/models/${encodeURIComponent(modelId)}`, payload)).model,
  deleteModel: async (modelId: string): Promise<{ deleted: true; modelId: string }> =>
    del<{ deleted: true; modelId: string }>(`/models/${encodeURIComponent(modelId)}`),
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
