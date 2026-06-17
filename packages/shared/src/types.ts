import type {
  AGENT_OUTPUT_FORMAT_VALUES,
  AGENT_PERMISSION_MODE_VALUES,
  APP_LOG_LEVEL_VALUES,
  APP_UI_LANGUAGE_VALUES,
  APP_UI_MODE_VALUES,
  BRANCH_TYPE_VALUES,
  CHAPTER_STATUS_VALUES,
  CREATION_STAGE_VALUES,
  CONTEXT_SOURCE_REASON_VALUES,
  LOCK_LEVEL_VALUES,
  LOCK_SCOPE_VALUES,
  MODEL_THINKING_VALUES,
  OUTLINE_LEVEL_VALUES,
  OVERRIDE_POLICY_VALUES,
  PROJECT_SERIES_TYPE_VALUES,
  PROVIDER_TYPE_VALUES,
  READ_POLICY_DEFAULT_VALUES,
  RULE_DETECT_BY_VALUES,
  RULE_LEVEL_VALUES,
  RULE_VIOLATION_ACTION_VALUES,
  RUN_NODE_STATUS_VALUES,
  RUN_STATUS_VALUES,
  SKILL_KIND_VALUES,
  SNAPSHOT_REASON_VALUES,
  TIMELINE_IMPORTANCE_VALUES,
  SCOPE_VALUES,
  TIMELINE_LINE_VALUES,
  TIMELINE_PROFILE_GROUP_VALUES,
  TIMELINE_TEMPLATE_VALUES,
  WORKFLOW_FAIL_POLICY_VALUES,
  WORLDBOOK_CATEGORY_VALUES,
  WORLDBOOK_IMPORTANCE_VALUES,
  WORLDBOOK_ORIGIN_VALUES,
  WORLDBOOK_PROFILE_GROUP_VALUES,
  WORLDBOOK_TEMPLATE_VALUES,
  WRITE_SCOPE_VALUES,
  WRITING_FREEDOM_VALUES,
} from "./constants.js";

export type Scope = (typeof SCOPE_VALUES)[number];
export type RuleLevel = (typeof RULE_LEVEL_VALUES)[number];
export type AgentPermissionMode = (typeof AGENT_PERMISSION_MODE_VALUES)[number];
export type ChapterStatus = (typeof CHAPTER_STATUS_VALUES)[number];
export type CreationStage = (typeof CREATION_STAGE_VALUES)[number];
export type WritingFreedom = (typeof WRITING_FREEDOM_VALUES)[number];
export type WriteScope = (typeof WRITE_SCOPE_VALUES)[number];
export type ProviderType = (typeof PROVIDER_TYPE_VALUES)[number];
export type OverridePolicy = (typeof OVERRIDE_POLICY_VALUES)[number];
export type ProjectSeriesType = (typeof PROJECT_SERIES_TYPE_VALUES)[number];
export type BranchType = (typeof BRANCH_TYPE_VALUES)[number];
export type AgentOutputFormat = (typeof AGENT_OUTPUT_FORMAT_VALUES)[number];
export type ModelThinking = (typeof MODEL_THINKING_VALUES)[number];
export type WorkflowFailPolicy = (typeof WORKFLOW_FAIL_POLICY_VALUES)[number];
export type RunStatus = (typeof RUN_STATUS_VALUES)[number];
export type RunNodeStatus = (typeof RUN_NODE_STATUS_VALUES)[number];
export type RuleDetectBy = (typeof RULE_DETECT_BY_VALUES)[number];
export type RuleViolationAction = (typeof RULE_VIOLATION_ACTION_VALUES)[number];
export type SkillKind = (typeof SKILL_KIND_VALUES)[number];
export type LockScope = (typeof LOCK_SCOPE_VALUES)[number];
export type LockLevel = (typeof LOCK_LEVEL_VALUES)[number];
export type SnapshotReason = (typeof SNAPSHOT_REASON_VALUES)[number];
export type OutlineLevel = (typeof OUTLINE_LEVEL_VALUES)[number];
export type ContextSourceReason = (typeof CONTEXT_SOURCE_REASON_VALUES)[number];
export type ReadPolicyDefault = (typeof READ_POLICY_DEFAULT_VALUES)[number];
export type AppUiLanguage = (typeof APP_UI_LANGUAGE_VALUES)[number];
export type AppUiMode = (typeof APP_UI_MODE_VALUES)[number];
export type AppLogLevel = (typeof APP_LOG_LEVEL_VALUES)[number];
export type TimelineLine = (typeof TIMELINE_LINE_VALUES)[number];

export interface Entity {
  id: string;
  schemaVersion: number;
  createdAt?: string;
  updatedAt?: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export interface AppError {
  code: string;
  message: string;
  redacted?: boolean;
}

export interface Vault extends Entity {
  name: string;
  rootPath: string;
  version: string;
  settingsPath: string;
  indexPath: string;
}

export interface ProjectSeries extends Entity {
  name: string;
  type: ProjectSeriesType;
  defaultNovelId: string;
  sharedPath: string;
  readPolicyPath: string;
  coverImage?: string;
}

export interface NovelBranch extends Entity {
  projectId: string;
  name: string;
  branchType: BranchType;
  manuscriptPath: string;
  metadataPath: string;
  excludedSharedFiles: string[];
  writingFreedom: WritingFreedom;
  defaultWriteScope: WriteScope;
}

export interface Volume extends Entity {
  novelId: string;
  title: string;
  order: number;
  status?: "draft" | "finalized";
  positioning?: string;
  themes?: string;
  keyPoints?: string;
  notes?: string;
}

export interface ChapterPlan extends Entity {
  projectId: string;
  novelId: string;
  volumeId?: string;
  title: string;
  order: number;
  summary: string;
}

export interface KeyEventCustomField {
  title: string;
  content: string;
}

export interface KeyEvent extends Entity {
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
}

export interface PlotNoteCustomField {
  title: string;
  content: string;
}

export interface PlotNote extends Entity {
  projectId: string;
  novelId: string;
  title: string;
  category: string;
  order: number;
  content: string;
  customFields: PlotNoteCustomField[];
}

export interface TextRange {
  start: number;
  end: number;
}

export interface Lock {
  id: string;
  scope: LockScope;
  level: LockLevel;
  range: TextRange;
}

export interface Annotation {
  id: string;
  range: TextRange;
  text: string;
  convertibleTo: string[];
}

export interface ChapterSource {
  lastWrittenBy?: string;
  lastRunId?: string;
}

export interface Chapter extends Entity {
  novelId: string;
  volumeId?: string;
  title: string;
  order: number;
  manuscriptPath: string;
  status: ChapterStatus;
  creationStage?: CreationStage;
  wordCount: number;
  involvedCharacters: string[];
  source?: ChapterSource;
  locks: Lock[];
  annotationsRef?: string;
  finalizedAt?: string | null;
}

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

export interface Agent extends Entity {
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
}

export interface ModelConfig extends Entity {
  provider: ProviderType;
  model: string;
  baseUrl?: string;
  keyRef?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
  longContext?: boolean;
  thinking?: ModelThinking;
  stream?: boolean;
  jsonMode?: boolean;
  fallbackModelId?: string;
  costLimit?: number;
}

export interface WorkflowNode {
  agentId: string;
  order: number;
  canSkip: boolean;
}

export interface WorkflowDefinition extends Entity {
  name: string;
  nodes: WorkflowNode[];
  onFail: WorkflowFailPolicy;
  maxRepairRounds: number;
}

export interface TokenUsage {
  in: number;
  out: number;
}

export interface RunNodeResult {
  agentId: string;
  status: RunNodeStatus;
  score?: number;
  lockedViolations?: number;
  hardViolations?: number;
  softViolations?: number;
  mustRewrite?: boolean;
  rewriteScope?: WriteScope;
  targetAgentId?: string;
  rewriteInstructions?: string[];
}

export interface RunRecord extends Entity {
  chapterId: string;
  workflowId: string;
  nodes: RunNodeResult[];
  tokens: TokenUsage;
  cost: number;
  contextSources: string[];
  startedAt: string;
  endedAt?: string;
  status: RunStatus;
}

export interface Rule extends Entity {
  title: string;
  content?: string;
  level: RuleLevel;
  scope: Scope;
  appliesTo?: string[];
  detectBy: RuleDetectBy[];
  onViolation: RuleViolationAction;
  enabled: boolean;
  source: string;
  priority: number;
  overridePolicy: OverridePolicy;
  tags: string[];
}

export interface HardCheck extends Entity {
  type: string;
  enabled: boolean;
  params?: Record<string, unknown>;
  blocking: boolean;
}

export interface RuleConflict {
  ruleA: string;
  ruleB: string;
  kind: "duplicate" | "near-duplicate" | "conflict";
}

export interface SkillPermissions {
  readProject: boolean;
  writeProject: boolean;
  callAI: boolean;
  network: boolean;
  runScript: boolean;
  runShell: boolean;
  accessOutsideFiles: boolean;
  readApiKey: false;
  modifyGlobalRulesOrSkills: boolean;
}

export interface Skill extends Entity {
  name: string;
  description: string;
  author?: string;
  version: string;
  tags: string[];
  languages: string[];
  genres: string[];
  tasks: string[];
  trigger?: Record<string, unknown>;
  boundAgents: string[];
  readRequirements: string[];
  ruleFragments: string[];
  prompt: string;
  outputFormat?: string;
  checkCriteria?: string;
  kind: SkillKind;
  allowAutoRun: boolean;
  allowWriteDraft: boolean;
  license: string;
  compatibleVersions: string;
  permissions: SkillPermissions;
}

export interface PluginManifest extends Entity {
  name: string;
  description: string;
  version: string;
  author?: string;
  entry: string;
  apiVersion: string;
  permissions: SkillPermissions;
  hooks: string[];
  enabled: boolean;
}

export interface CollaborationSession extends Entity {
  projectId: string;
  novelId?: string;
  chapterId?: string;
  owner: string;
  participants: string[];
  mode: "view" | "comment" | "co-write";
  status: "draft" | "active" | "closed";
}

export interface SkillMarketEntry extends Entity {
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
  status: "listed" | "hidden" | "removed";
}

export interface WorldbookSections {
  fact?: string;
  adaptation?: string;
  currentState?: string;
  writingHint?: string;
  forbidden?: string;
}

export interface WorldbookTrigger {
  keywords: string[];
  characters: string[];
  places: string[];
  timeline?: string[];
  semantic: boolean;
}

export type WorldbookOrigin = (typeof WORLDBOOK_ORIGIN_VALUES)[number];
export type WorldbookCategory = (typeof WORLDBOOK_CATEGORY_VALUES)[number];
export type WorldbookImportance = (typeof WORLDBOOK_IMPORTANCE_VALUES)[number];
export type WorldbookTemplate = (typeof WORLDBOOK_TEMPLATE_VALUES)[number];
export type WorldbookProfileGroup = (typeof WORLDBOOK_PROFILE_GROUP_VALUES)[number];

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

export interface WorldbookEntry extends Entity {
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
  sections?: WorldbookSections;
  trigger?: WorldbookTrigger;
  relatedNovels?: string[];
  appliesToAgents?: string[];
}

export interface CharacterVoice {
  typicalLines: string[];
  forbiddenLines: string[];
  honorifics: Record<string, string>;
  bySituation?: Record<string, string[]>;
  byEmotion?: Record<string, string[]>;
  byRelationStage?: Record<string, string[]>;
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

export interface Character extends Entity {
  name: string;
  links: string[];
  voice: CharacterVoice;
  profile?: CharacterProfile;
  knowledgeScopeRef?: string;
  currentStateRef?: string;
  forbiddenWrites: string[];
  arcRef?: string;
  relatedWorldbook?: string[];
}

export interface Relation extends Entity {
  from: string;
  to: string;
  type: string;
  stage?: string;
  sourceChapters: string[];
}

export interface TimelineCustomField {
  label?: string;
  value?: string;
}

export type TimelineTemplate = (typeof TIMELINE_TEMPLATE_VALUES)[number];
export type TimelineImportance = (typeof TIMELINE_IMPORTANCE_VALUES)[number];
export type TimelineProfileGroup = (typeof TIMELINE_PROFILE_GROUP_VALUES)[number];
export type TimelineProfileSection = Record<string, string | undefined>;

export interface TimelineProfile {
  template?: TimelineTemplate;
  basic?: TimelineProfileSection;
  content?: TimelineProfileSection;
  relations?: TimelineProfileSection;
  writing?: TimelineProfileSection;
  custom?: Partial<Record<TimelineProfileGroup, TimelineCustomField[]>>;
}

export interface TimelineEvent extends Entity {
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
  boundChapters: string[];
  participants: string[];
  stateSnapshotRef?: string | null;
}

export interface KnowledgeItem extends Entity {
  content: string;
  knownBy: string[];
  unknownBy: string[];
  sourceChapter?: string;
  spreadMethod?: string;
  happenedAt?: string;
  canSpread: boolean;
  secret: boolean;
  affectsBehavior: boolean;
}

export interface Snapshot extends Entity {
  chapterId: string;
  reason: SnapshotReason;
  gitRef?: string;
  path: string;
}

export interface DiffRecord extends Entity {
  chapterId: string;
  runId?: string;
  beforeRef: string;
  afterRef: string;
  patch: string;
}

export interface Summary extends Entity {
  chapterId: string;
  oneLine: string;
  short: string;
  structured: string;
  stateChanges: string[];
}

export interface OutlineNode extends Entity {
  novelId: string;
  level: OutlineLevel;
  title: string;
  body: string;
  autoEditable: boolean;
}

export interface ContextRequest {
  agentId: string;
  chapterId: string;
  forceInclude: string[];
  exclude: string[];
  presetId?: string;
  tokenBudget?: number;
}

export interface ContextSource {
  path: string;
  reason: ContextSourceReason;
  tokens: number;
}

export interface ContextResult {
  sources: ContextSource[];
  totalTokens: number;
  truncated: boolean;
}

export interface ReadPolicyFileRule {
  policy: OverridePolicy;
}

export interface ReadPolicy extends Entity {
  defaults: Record<string, ReadPolicyDefault>;
  perFile: Record<string, ReadPolicyFileRule>;
}

export interface RemoteConfigPublic {
  enabled: boolean;
  autoStart: boolean;
  port: number;
  address?: string;
  passwordHashRef: string;
}

export interface VaultSettings extends Entity {
  language: AppUiLanguage;
  themeId: string;
  uiMode: AppUiMode;
  logLevel: AppLogLevel;
  remote: RemoteConfigPublic;
}
