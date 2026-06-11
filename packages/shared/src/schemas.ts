import { z } from "zod";

import {
  AGENT_OUTPUT_FORMAT_VALUES,
  AGENT_PERMISSION_MODE_VALUES,
  APP_LOG_LEVEL_VALUES,
  APP_UI_LANGUAGE_VALUES,
  APP_UI_MODE_VALUES,
  BRANCH_TYPE_VALUES,
  CHAPTER_STATUS_VALUES,
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
  SCOPE_VALUES,
  TIMELINE_LINE_VALUES,
  WORKFLOW_FAIL_POLICY_VALUES,
  WORLDBOOK_CATEGORY_VALUES,
  WORLDBOOK_IMPORTANCE_VALUES,
  WORLDBOOK_ORIGIN_VALUES,
  WORLDBOOK_TEMPLATE_VALUES,
  WRITE_SCOPE_VALUES,
  WRITING_FREEDOM_VALUES,
} from "./constants.js";

const stringArraySchema = z.array(z.string());

export const isoDateStringSchema = z.string().datetime({ offset: true });

export const entitySchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.number().int().nonnegative(),
  createdAt: isoDateStringSchema.optional(),
  updatedAt: isoDateStringSchema.optional(),
});

export const appErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  redacted: z.boolean().optional(),
});

export const resultSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.union([
    z.object({
      ok: z.literal(true),
      value: valueSchema,
    }),
    z.object({
      ok: z.literal(false),
      error: appErrorSchema,
    }),
  ]);

export const textRangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

export const lockSchema = z.object({
  id: z.string().min(1),
  scope: z.enum(LOCK_SCOPE_VALUES),
  level: z.enum(LOCK_LEVEL_VALUES),
  range: textRangeSchema,
});

export const annotationSchema = z.object({
  id: z.string().min(1),
  range: textRangeSchema,
  text: z.string(),
  convertibleTo: stringArraySchema,
});

export const vaultSchema = entitySchema.extend({
  name: z.string().min(1),
  rootPath: z.string().min(1),
  version: z.string().min(1),
  settingsPath: z.string().min(1),
  indexPath: z.string().min(1),
});

export const projectSeriesSchema = entitySchema.extend({
  name: z.string().min(1),
  type: z.enum(PROJECT_SERIES_TYPE_VALUES),
  defaultNovelId: z.string().min(1),
  sharedPath: z.string().min(1),
  readPolicyPath: z.string().min(1),
});

export const novelBranchSchema = entitySchema.extend({
  projectId: z.string().min(1),
  name: z.string().min(1),
  branchType: z.enum(BRANCH_TYPE_VALUES),
  manuscriptPath: z.string().min(1),
  metadataPath: z.string().min(1),
  excludedSharedFiles: stringArraySchema,
  writingFreedom: z.enum(WRITING_FREEDOM_VALUES),
  defaultWriteScope: z.enum(WRITE_SCOPE_VALUES),
});

export const volumeSchema = entitySchema.extend({
  novelId: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
});

export const chapterSourceSchema = z.object({
  lastWrittenBy: z.string().min(1).optional(),
  lastRunId: z.string().min(1).optional(),
});

export const chapterSchema = entitySchema.extend({
  novelId: z.string().min(1),
  volumeId: z.string().min(1).optional(),
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
  manuscriptPath: z.string().min(1),
  status: z.enum(CHAPTER_STATUS_VALUES),
  wordCount: z.number().int().nonnegative(),
  involvedCharacters: stringArraySchema,
  source: chapterSourceSchema.optional(),
  locks: z.array(lockSchema),
  annotationsRef: z.string().min(1).optional(),
  finalizedAt: isoDateStringSchema.nullish(),
});

export const agentPermissionsSchema = z.object({
  canWriteDraft: z.boolean(),
  canRewriteDraft: z.boolean(),
  canPatchParagraph: z.boolean(),
  canBlockWorkflow: z.boolean(),
  canRequestRewrite: z.boolean(),
  canWriteState: z.boolean(),
  canUpdateRules: z.boolean(),
});

export const agentSpeakConfigSchema = z.object({
  speak: z.boolean(),
  displayName: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
  showReasoning: z.boolean(),
  showStructured: z.boolean(),
  onlyOnFailure: z.boolean(),
});

export const agentSchema = entitySchema.extend({
  name: z.string().min(1),
  description: z.string(),
  enabled: z.boolean(),
  type: z.enum(AGENT_PERMISSION_MODE_VALUES),
  workflowId: z.string().min(1).optional(),
  order: z.number().int().nonnegative(),
  modelConfigId: z.string(),
  readScope: stringArraySchema,
  builtInRules: stringArraySchema,
  skills: stringArraySchema,
  outputFormat: z.enum(AGENT_OUTPUT_FORMAT_VALUES),
  permissions: agentPermissionsSchema,
  speak: agentSpeakConfigSchema,
});

export const modelConfigSchema = entitySchema.extend({
  provider: z.enum(PROVIDER_TYPE_VALUES),
  model: z.string().min(1),
  baseUrl: z.string().url().optional(),
  keyRef: z.string().min(1).optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  contextWindow: z.number().int().positive().optional(),
  longContext: z.boolean().optional(),
  thinking: z.enum(MODEL_THINKING_VALUES).optional(),
  stream: z.boolean().optional(),
  jsonMode: z.boolean().optional(),
  fallbackModelId: z.string().min(1).optional(),
  costLimit: z.number().nonnegative().optional(),
});

export const workflowNodeSchema = z.object({
  agentId: z.string().min(1),
  order: z.number().int().nonnegative(),
  canSkip: z.boolean(),
});

export const workflowDefinitionSchema = entitySchema.extend({
  name: z.string().min(1),
  nodes: z.array(workflowNodeSchema),
  onFail: z.enum(WORKFLOW_FAIL_POLICY_VALUES),
  maxRepairRounds: z.number().int().nonnegative(),
});

export const tokenUsageSchema = z.object({
  in: z.number().int().nonnegative(),
  out: z.number().int().nonnegative(),
});

export const runNodeResultSchema = z.object({
  agentId: z.string().min(1),
  status: z.enum(RUN_NODE_STATUS_VALUES),
  score: z.number().optional(),
  lockedViolations: z.number().int().nonnegative().optional(),
  hardViolations: z.number().int().nonnegative().optional(),
  softViolations: z.number().int().nonnegative().optional(),
  mustRewrite: z.boolean().optional(),
  rewriteScope: z.enum(WRITE_SCOPE_VALUES).optional(),
  targetAgentId: z.string().min(1).optional(),
  rewriteInstructions: stringArraySchema.optional(),
});

export const runRecordSchema = entitySchema.extend({
  chapterId: z.string().min(1),
  workflowId: z.string().min(1),
  nodes: z.array(runNodeResultSchema),
  tokens: tokenUsageSchema,
  cost: z.number().nonnegative(),
  contextSources: stringArraySchema,
  startedAt: isoDateStringSchema,
  endedAt: isoDateStringSchema.optional(),
  status: z.enum(RUN_STATUS_VALUES),
});

export const ruleSchema = entitySchema.extend({
  title: z.string().min(1),
  level: z.enum(RULE_LEVEL_VALUES),
  scope: z.enum(SCOPE_VALUES),
  appliesTo: stringArraySchema.optional(),
  detectBy: z.array(z.enum(RULE_DETECT_BY_VALUES)),
  onViolation: z.enum(RULE_VIOLATION_ACTION_VALUES),
  enabled: z.boolean(),
  source: z.string().min(1),
  priority: z.number().int(),
  overridePolicy: z.enum(OVERRIDE_POLICY_VALUES),
  tags: stringArraySchema,
});

export const hardCheckSchema = entitySchema.extend({
  type: z.string().min(1),
  enabled: z.boolean(),
  params: z.record(z.unknown()).optional(),
  blocking: z.boolean(),
});

export const ruleConflictSchema = z.object({
  ruleA: z.string().min(1),
  ruleB: z.string().min(1),
  kind: z.enum(["duplicate", "near-duplicate", "conflict"]),
});

export const skillPermissionsSchema = z.object({
  readProject: z.boolean(),
  writeProject: z.boolean(),
  callAI: z.boolean(),
  network: z.boolean(),
  runScript: z.boolean(),
  runShell: z.boolean(),
  accessOutsideFiles: z.boolean(),
  readApiKey: z.literal(false),
  modifyGlobalRulesOrSkills: z.boolean(),
});

export const skillSchema = entitySchema.extend({
  name: z.string().min(1),
  description: z.string(),
  author: z.string().min(1).optional(),
  version: z.string().min(1),
  tags: stringArraySchema,
  languages: stringArraySchema,
  genres: stringArraySchema,
  tasks: stringArraySchema,
  trigger: z.record(z.unknown()).optional(),
  boundAgents: stringArraySchema,
  readRequirements: stringArraySchema,
  ruleFragments: stringArraySchema,
  prompt: z.string(),
  outputFormat: z.string().min(1).optional(),
  checkCriteria: z.string().min(1).optional(),
  kind: z.enum(SKILL_KIND_VALUES),
  allowAutoRun: z.boolean(),
  allowWriteDraft: z.boolean(),
  license: z.string().min(1),
  compatibleVersions: z.string().min(1),
  permissions: skillPermissionsSchema,
});

export const pluginManifestSchema = entitySchema.extend({
  name: z.string().min(1),
  description: z.string(),
  version: z.string().min(1),
  author: z.string().min(1).optional(),
  entry: z.string().min(1),
  apiVersion: z.string().min(1),
  permissions: skillPermissionsSchema,
  hooks: stringArraySchema,
  enabled: z.boolean(),
});

export const collaborationSessionSchema = entitySchema.extend({
  projectId: z.string().min(1),
  novelId: z.string().min(1).optional(),
  chapterId: z.string().min(1).optional(),
  owner: z.string().min(1),
  participants: stringArraySchema,
  mode: z.enum(["view", "comment", "co-write"]),
  status: z.enum(["draft", "active", "closed"]),
});

export const skillMarketEntrySchema = entitySchema.extend({
  skillId: z.string().min(1),
  name: z.string().min(1),
  author: z.string().min(1),
  summary: z.string().min(1),
  categories: stringArraySchema,
  tags: stringArraySchema,
  averageRating: z.number().min(0).max(5),
  ratingCount: z.number().int().nonnegative(),
  reports: z.array(
    z.object({
      reporter: z.string().min(1),
      reason: z.string().min(1),
      createdAt: isoDateStringSchema,
    }),
  ),
  certifiedAuthor: z.boolean(),
  status: z.enum(["listed", "hidden", "removed"]),
});

export const worldbookSectionsSchema = z.object({
  fact: z.string().optional(),
  adaptation: z.string().optional(),
  currentState: z.string().optional(),
  writingHint: z.string().optional(),
  forbidden: z.string().optional(),
});

export const worldbookTriggerSchema = z.object({
  keywords: stringArraySchema,
  characters: stringArraySchema,
  places: stringArraySchema,
  timeline: stringArraySchema.optional(),
  semantic: z.boolean(),
});

export const worldbookCustomFieldSchema = z.object({
  label: z.string().optional(),
  value: z.string().optional(),
});

const worldbookProfileSectionSchema = z.record(z.string().optional()).optional();
const worldbookProfileCustomSchema = z.object({
  basic: z.array(worldbookCustomFieldSchema).optional(),
  content: z.array(worldbookCustomFieldSchema).optional(),
  background: z.array(worldbookCustomFieldSchema).optional(),
  relations: z.array(worldbookCustomFieldSchema).optional(),
  writing: z.array(worldbookCustomFieldSchema).optional(),
}).partial().optional();

export const worldbookProfileSchema = z.object({
  template: z.enum(WORLDBOOK_TEMPLATE_VALUES).optional(),
  basic: worldbookProfileSectionSchema,
  content: worldbookProfileSectionSchema,
  background: worldbookProfileSectionSchema,
  relations: worldbookProfileSectionSchema,
  writing: worldbookProfileSectionSchema,
  custom: worldbookProfileCustomSchema,
}).partial();

export const worldbookEntrySchema = entitySchema.extend({
  title: z.string().min(1),
  origin: z.enum(WORLDBOOK_ORIGIN_VALUES).optional(),
  category: z.enum(WORLDBOOK_CATEGORY_VALUES).optional(),
  template: z.enum(WORLDBOOK_TEMPLATE_VALUES).optional(),
  importance: z.enum(WORLDBOOK_IMPORTANCE_VALUES).optional(),
  name: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  keywords: stringArraySchema.optional(),
  relatedCharacters: stringArraySchema.optional(),
  relatedSettings: stringArraySchema.optional(),
  relatedEvents: stringArraySchema.optional(),
  relatedChapters: stringArraySchema.optional(),
  custom: z.array(worldbookCustomFieldSchema).optional(),
  profile: worldbookProfileSchema.optional(),
  sections: worldbookSectionsSchema.optional(),
  trigger: worldbookTriggerSchema.optional(),
  relatedNovels: stringArraySchema.optional(),
  appliesToAgents: stringArraySchema.optional(),
});

export const characterVoiceSchema = z.object({
  typicalLines: stringArraySchema,
  forbiddenLines: stringArraySchema,
  honorifics: z.record(z.string()),
  bySituation: z.record(stringArraySchema).optional(),
  byEmotion: z.record(stringArraySchema).optional(),
  byRelationStage: z.record(stringArraySchema).optional(),
});

export const characterProfileFieldSchema = z.string().optional();
export const characterProfileCustomFieldSchema = z.object({
  label: z.string().optional(),
  value: z.string().optional(),
});

const characterProfileSectionSchema = z.record(characterProfileFieldSchema).optional();
const characterProfileCustomSchema = z.object({
  basic: z.array(characterProfileCustomFieldSchema).optional(),
  appearance: z.array(characterProfileCustomFieldSchema).optional(),
  language: z.array(characterProfileCustomFieldSchema).optional(),
  belief: z.array(characterProfileCustomFieldSchema).optional(),
  relations: z.array(characterProfileCustomFieldSchema).optional(),
  background: z.array(characterProfileCustomFieldSchema).optional(),
}).partial().optional();

export const characterProfileSchema = z.object({
  template: z.enum(["simple", "detailed"]).optional(),
  avatarPath: z.string().optional(),
  basic: characterProfileSectionSchema,
  appearance: characterProfileSectionSchema,
  language: characterProfileSectionSchema,
  belief: characterProfileSectionSchema,
  relations: characterProfileSectionSchema,
  background: characterProfileSectionSchema,
  custom: characterProfileCustomSchema,
}).partial();

export const characterSchema = entitySchema.extend({
  name: z.string().min(1),
  links: stringArraySchema,
  voice: characterVoiceSchema,
  profile: characterProfileSchema.optional(),
  knowledgeScopeRef: z.string().min(1).optional(),
  currentStateRef: z.string().min(1).optional(),
  forbiddenWrites: stringArraySchema,
  arcRef: z.string().min(1).optional(),
  relatedWorldbook: stringArraySchema.optional(),
});

export const relationSchema = entitySchema.extend({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.string().min(1),
  stage: z.string().min(1).optional(),
  sourceChapters: stringArraySchema,
});

export const timelineCustomFieldSchema = z.object({
  label: z.string().optional(),
  value: z.string().optional(),
});

export const timelineEventSchema = entitySchema.extend({
  title: z.string().min(1),
  line: z.enum(TIMELINE_LINE_VALUES),
  order: z.number().int().nonnegative(),
  eventDate: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  custom: z.array(timelineCustomFieldSchema).optional(),
  boundChapters: stringArraySchema,
  participants: stringArraySchema,
  stateSnapshotRef: z.string().min(1).nullable().optional(),
});

export const knowledgeItemSchema = entitySchema.extend({
  content: z.string(),
  knownBy: stringArraySchema,
  unknownBy: stringArraySchema,
  sourceChapter: z.string().min(1).optional(),
  spreadMethod: z.string().min(1).optional(),
  happenedAt: isoDateStringSchema.optional(),
  canSpread: z.boolean(),
  secret: z.boolean(),
  affectsBehavior: z.boolean(),
});

export const snapshotSchema = entitySchema.extend({
  chapterId: z.string().min(1),
  reason: z.enum(SNAPSHOT_REASON_VALUES),
  gitRef: z.string().min(1).optional(),
  path: z.string().min(1),
});

export const diffRecordSchema = entitySchema.extend({
  chapterId: z.string().min(1),
  runId: z.string().min(1).optional(),
  beforeRef: z.string().min(1),
  afterRef: z.string().min(1),
  patch: z.string(),
});

export const summarySchema = entitySchema.extend({
  chapterId: z.string().min(1),
  oneLine: z.string(),
  short: z.string(),
  structured: z.string(),
  stateChanges: stringArraySchema,
});

export const outlineNodeSchema = entitySchema.extend({
  novelId: z.string().min(1),
  level: z.enum(OUTLINE_LEVEL_VALUES),
  title: z.string().min(1),
  body: z.string(),
  autoEditable: z.boolean(),
});

export const contextRequestSchema = z.object({
  agentId: z.string().min(1),
  chapterId: z.string().min(1),
  forceInclude: stringArraySchema,
  exclude: stringArraySchema,
  presetId: z.string().min(1).optional(),
  tokenBudget: z.number().int().positive().optional(),
});

export const contextSourceSchema = z.object({
  path: z.string().min(1),
  reason: z.enum(CONTEXT_SOURCE_REASON_VALUES),
  tokens: z.number().int().nonnegative(),
});

export const contextResultSchema = z.object({
  sources: z.array(contextSourceSchema),
  totalTokens: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export const readPolicyFileRuleSchema = z.object({
  policy: z.enum(OVERRIDE_POLICY_VALUES),
});

export const readPolicySchema = entitySchema.extend({
  defaults: z.record(z.enum(READ_POLICY_DEFAULT_VALUES)),
  perFile: z.record(readPolicyFileRuleSchema),
});

export const remoteConfigPublicSchema = z.object({
  enabled: z.boolean(),
  autoStart: z.boolean(),
  port: z.number().int().nonnegative(),
  address: z.string().min(1).optional(),
  passwordHashRef: z.string().min(1),
});

export const vaultSettingsSchema = entitySchema.extend({
  language: z.enum(APP_UI_LANGUAGE_VALUES),
  themeId: z.string().min(1),
  uiMode: z.enum(APP_UI_MODE_VALUES),
  logLevel: z.enum(APP_LOG_LEVEL_VALUES),
  remote: remoteConfigPublicSchema,
});
