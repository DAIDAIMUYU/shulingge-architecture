import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  CURRENT_SCHEMA_VERSION,
  characterSchema,
  knowledgeItemSchema,
  relationSchema,
  ruleSchema,
  timelineEventSchema,
  worldbookEntrySchema,
  type Character,
  type KnowledgeItem,
  type Relation,
  type Rule,
  type TimelineEvent,
  type WorldbookEntry,
} from "@shulingge/shared";
import { readJsonFile, resolveSafePath, writeJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

type KnowledgeEntityType = "worldbook" | "characters" | "relations" | "timeline" | "knowledge-items" | "rules";

interface ProjectLocator {
  projectId: string;
}

interface NovelLocator extends ProjectLocator {
  novelId: string;
}

interface EntityDescriptor<T extends { id: string }> {
  type: KnowledgeEntityType;
  collectionPath(locator: ProjectLocator | NovelLocator): string;
  relativePath(locator: ProjectLocator | NovelLocator, entityId: string): string;
  schema: {
    parse(input: unknown): T;
  };
}

export interface GraphNode {
  id: string;
  type: "character" | "worldbook" | "timeline" | "knowledge" | "reference";
  label: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  bidirectional?: boolean;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

type WorldbookInput = Partial<Omit<WorldbookEntry, "schemaVersion">> & Pick<WorldbookEntry, "id" | "title">;
type CharacterInput = Partial<Omit<Character, "schemaVersion">> & Pick<Character, "id" | "name">;
type RelationInput = Partial<Omit<Relation, "schemaVersion">> & Pick<Relation, "id" | "from" | "to" | "type">;
type TimelineInput = Partial<Omit<TimelineEvent, "schemaVersion">> &
  Pick<TimelineEvent, "id" | "title" | "line" | "order">;
type KnowledgeItemInput = Partial<Omit<KnowledgeItem, "schemaVersion">> &
  Pick<KnowledgeItem, "id" | "content">;
type RuleInput = Partial<Omit<Rule, "schemaVersion">> & Pick<Rule, "id" | "title">;
export interface RuleImportFileInput {
  fileName?: string;
  content: string;
}

export interface RuleImportInput {
  projectId?: string;
  files: RuleImportFileInput[];
  level?: Rule["level"];
  scope?: Rule["scope"];
  appliesTo?: string[];
  detectBy?: Rule["detectBy"];
  onViolation?: Rule["onViolation"];
  enabled?: boolean;
  source?: string;
  priority?: number;
  overridePolicy?: Rule["overridePolicy"];
  tags?: string[];
}

const worldbookDescriptor: EntityDescriptor<WorldbookEntry> = {
  type: "worldbook",
  collectionPath(locator) {
    return path.posix.join("projects", locator.projectId, "shared", "worldbook");
  },
  relativePath(locator, entityId) {
    return path.posix.join(this.collectionPath(locator), `${entityId}.json`);
  },
  schema: worldbookEntrySchema,
};

const characterDescriptor: EntityDescriptor<Character> = {
  type: "characters",
  collectionPath(locator) {
    return path.posix.join("projects", locator.projectId, "shared", "characters");
  },
  relativePath(locator, entityId) {
    return path.posix.join(this.collectionPath(locator), `${entityId}.json`);
  },
  schema: characterSchema,
};

const relationDescriptor: EntityDescriptor<Relation> = {
  type: "relations",
  collectionPath(locator) {
    return path.posix.join("projects", locator.projectId, "shared", "relations");
  },
  relativePath(locator, entityId) {
    return path.posix.join(this.collectionPath(locator), `${entityId}.json`);
  },
  schema: relationSchema,
};

const timelineDescriptor: EntityDescriptor<TimelineEvent> = {
  type: "timeline",
  collectionPath(locator) {
    return path.posix.join("projects", locator.projectId, "shared", "timeline");
  },
  relativePath(locator, entityId) {
    return path.posix.join(this.collectionPath(locator), `${entityId}.json`);
  },
  schema: timelineEventSchema,
};

const knowledgeItemDescriptor: EntityDescriptor<KnowledgeItem> = {
  type: "knowledge-items",
  collectionPath(locator) {
    if (!("novelId" in locator) || !locator.novelId) {
      throw createHttpError(
        400,
        "KNOWLEDGE_INVALID_NOVEL_LOCATOR",
        "novelId is required for knowledge items",
      );
    }

    return path.posix.join("projects", locator.projectId, "novels", locator.novelId, "states", "knowledge");
  },
  relativePath(locator, entityId) {
    return path.posix.join(this.collectionPath(locator), `${entityId}.json`);
  },
  schema: knowledgeItemSchema,
};

const ruleDescriptor: EntityDescriptor<Rule> = {
  type: "rules",
  collectionPath(locator) {
    return path.posix.join("projects", locator.projectId, "rules");
  },
  relativePath(locator, entityId) {
    return path.posix.join(this.collectionPath(locator), `${entityId}.json`);
  },
  schema: ruleSchema,
};

const globalRuleDescriptor: EntityDescriptor<Rule> = {
  type: "rules",
  collectionPath() {
    return path.posix.join("global", "rules");
  },
  relativePath(locator, entityId) {
    return path.posix.join(this.collectionPath(locator), `${entityId}.json`);
  },
  schema: ruleSchema,
};

function assertProjectLocator(locator: Partial<ProjectLocator>): asserts locator is ProjectLocator {
  if (!locator.projectId) {
    throw createHttpError(400, "KNOWLEDGE_INVALID_PROJECT_LOCATOR", "projectId is required");
  }
}

function assertNovelLocator(locator: Partial<NovelLocator>): asserts locator is NovelLocator {
  if (!locator.projectId) {
    throw createHttpError(400, "KNOWLEDGE_INVALID_PROJECT_LOCATOR", "projectId is required");
  }
  if (!locator.novelId) {
    throw createHttpError(400, "KNOWLEDGE_INVALID_NOVEL_LOCATOR", "novelId is required");
  }
}

async function readCollection<T extends { id: string }>(
  vaultRoot: string,
  locator: ProjectLocator | NovelLocator,
  descriptor: EntityDescriptor<T>,
): Promise<T[]> {
  const collectionPath = descriptor.collectionPath(locator);
  const absoluteCollectionPath = resolveSafePath(vaultRoot, collectionPath);

  try {
    const entries = await readdir(absoluteCollectionPath);
    const records = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) =>
          readJsonFile<T>(vaultRoot, path.posix.join(collectionPath, entry)).then((value) =>
            descriptor.schema.parse(value),
          ),
        ),
    );

    return records.sort((left, right) => left.id.localeCompare(right.id));
  } catch {
    return [];
  }
}

async function readEntity<T extends { id: string }>(
  vaultRoot: string,
  locator: ProjectLocator | NovelLocator,
  descriptor: EntityDescriptor<T>,
  entityId: string,
): Promise<T> {
  try {
    const record = await readJsonFile<T>(vaultRoot, descriptor.relativePath(locator, entityId));
    return descriptor.schema.parse(record);
  } catch {
    throw createHttpError(404, "KNOWLEDGE_NOT_FOUND", `Knowledge entry not found: ${entityId}`);
  }
}

async function ensureUniqueEntity<T extends { id: string }>(
  vaultRoot: string,
  locator: ProjectLocator | NovelLocator,
  descriptor: EntityDescriptor<T>,
  entityId: string,
): Promise<void> {
  try {
    await readEntity(vaultRoot, locator, descriptor, entityId);
    throw createHttpError(
      409,
      "KNOWLEDGE_ALREADY_EXISTS",
      `Knowledge entry already exists: ${descriptor.type}/${entityId}`,
    );
  } catch (error) {
    if (error instanceof Error && /KNOWLEDGE_ALREADY_EXISTS/.test(error.message)) {
      throw error;
    }
  }
}

function createTimestampFields<T extends { createdAt?: string; updatedAt?: string }>(current?: T) {
  const now = new Date().toISOString();
  return {
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
}

function slugify(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `rule-${Date.now()}`;
}

function normalizeWorldbook(input: WorldbookInput, current?: WorldbookEntry): WorldbookEntry {
  const title = input.title ?? current?.title ?? "";
  const name = input.name ?? current?.name ?? title;
  const profile = input.profile ?? current?.profile;
  return worldbookEntrySchema.parse({
    id: input.id ?? current?.id ?? "",
    title,
    origin: input.origin ?? current?.origin ?? "original",
    category: input.category ?? current?.category ?? "other",
    template: input.template ?? current?.template ?? profile?.template ?? "simple",
    importance: input.importance ?? current?.importance,
    name,
    summary: input.summary ?? current?.summary,
    description: input.description ?? current?.description,
    keywords: input.keywords ?? current?.keywords ?? input.trigger?.keywords ?? current?.trigger?.keywords ?? [],
    relatedCharacters: input.relatedCharacters ?? current?.relatedCharacters ?? [],
    relatedSettings: input.relatedSettings ?? current?.relatedSettings ?? [],
    relatedEvents: input.relatedEvents ?? current?.relatedEvents ?? [],
    relatedChapters: input.relatedChapters ?? current?.relatedChapters ?? [],
    custom: input.custom ?? current?.custom ?? [],
    profile,
    sections: {
      fact: input.sections?.fact ?? current?.sections?.fact ?? input.description ?? current?.description ?? "",
      adaptation: input.sections?.adaptation ?? current?.sections?.adaptation ?? "",
      currentState: input.sections?.currentState ?? current?.sections?.currentState ?? "",
      writingHint: input.sections?.writingHint ?? current?.sections?.writingHint ?? input.profile?.writing?.writingNotes ?? current?.profile?.writing?.writingNotes ?? "",
      forbidden: input.sections?.forbidden ?? current?.sections?.forbidden ?? "",
    },
    trigger: {
      keywords: input.trigger?.keywords ?? current?.trigger?.keywords ?? input.keywords ?? current?.keywords ?? [],
      characters: input.trigger?.characters ?? current?.trigger?.characters ?? input.relatedCharacters ?? current?.relatedCharacters ?? [],
      places: input.trigger?.places ?? current?.trigger?.places ?? [],
      timeline: input.trigger?.timeline ?? current?.trigger?.timeline ?? input.relatedEvents ?? current?.relatedEvents ?? [],
      semantic: input.trigger?.semantic ?? current?.trigger?.semantic ?? false,
    },
    relatedNovels: input.relatedNovels ?? current?.relatedNovels ?? [],
    appliesToAgents: input.appliesToAgents ?? current?.appliesToAgents ?? [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...createTimestampFields(current),
  });
}

function normalizeCharacter(input: CharacterInput, current?: Character): Character {
  return characterSchema.parse({
    id: input.id ?? current?.id ?? "",
    name: input.name ?? current?.name ?? "",
    links: input.links ?? current?.links ?? [],
    voice: {
      typicalLines: input.voice?.typicalLines ?? current?.voice.typicalLines ?? [],
      forbiddenLines: input.voice?.forbiddenLines ?? current?.voice.forbiddenLines ?? [],
      honorifics: input.voice?.honorifics ?? current?.voice.honorifics ?? {},
      bySituation: input.voice?.bySituation ?? current?.voice.bySituation ?? {},
      byEmotion: input.voice?.byEmotion ?? current?.voice.byEmotion ?? {},
      byRelationStage: input.voice?.byRelationStage ?? current?.voice.byRelationStage ?? {},
    },
    profile: input.profile ?? current?.profile,
    knowledgeScopeRef: input.knowledgeScopeRef ?? current?.knowledgeScopeRef,
    currentStateRef: input.currentStateRef ?? current?.currentStateRef,
    forbiddenWrites: input.forbiddenWrites ?? current?.forbiddenWrites ?? [],
    arcRef: input.arcRef ?? current?.arcRef,
    relatedWorldbook: input.relatedWorldbook ?? current?.relatedWorldbook ?? [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...createTimestampFields(current),
  });
}

function normalizeRelation(input: RelationInput, current?: Relation): Relation {
  return relationSchema.parse({
    id: input.id ?? current?.id ?? "",
    from: input.from ?? current?.from ?? "",
    to: input.to ?? current?.to ?? "",
    type: input.type ?? current?.type ?? "",
    stage: input.stage ?? current?.stage,
    sourceChapters: input.sourceChapters ?? current?.sourceChapters ?? [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...createTimestampFields(current),
  });
}

function normalizeTimeline(input: TimelineInput, current?: TimelineEvent): TimelineEvent {
  const profile = input.profile ?? current?.profile;
  return timelineEventSchema.parse({
    id: input.id ?? current?.id ?? "",
    title: input.title ?? current?.title ?? "",
    line: input.line ?? current?.line ?? "main",
    order: input.order ?? current?.order ?? 0,
    template: input.template ?? current?.template ?? profile?.template ?? "simple",
    importance: input.importance ?? current?.importance,
    eventDate: input.eventDate ?? current?.eventDate,
    summary: input.summary ?? current?.summary,
    description: input.description ?? current?.description,
    location: input.location ?? current?.location,
    relatedWorldbook: input.relatedWorldbook ?? current?.relatedWorldbook ?? [],
    previousEvents: input.previousEvents ?? current?.previousEvents ?? [],
    nextEvents: input.nextEvents ?? current?.nextEvents ?? [],
    profile,
    custom: input.custom ?? current?.custom ?? [],
    boundChapters: input.boundChapters ?? current?.boundChapters ?? [],
    participants: input.participants ?? current?.participants ?? [],
    stateSnapshotRef: input.stateSnapshotRef ?? current?.stateSnapshotRef ?? null,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...createTimestampFields(current),
  });
}

function normalizeKnowledgeItem(input: KnowledgeItemInput, current?: KnowledgeItem): KnowledgeItem {
  return knowledgeItemSchema.parse({
    id: input.id ?? current?.id ?? "",
    content: input.content ?? current?.content ?? "",
    knownBy: input.knownBy ?? current?.knownBy ?? [],
    unknownBy: input.unknownBy ?? current?.unknownBy ?? [],
    sourceChapter: input.sourceChapter ?? current?.sourceChapter,
    spreadMethod: input.spreadMethod ?? current?.spreadMethod,
    happenedAt: input.happenedAt ?? current?.happenedAt,
    canSpread: input.canSpread ?? current?.canSpread ?? false,
    secret: input.secret ?? current?.secret ?? false,
    affectsBehavior: input.affectsBehavior ?? current?.affectsBehavior ?? false,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...createTimestampFields(current),
  });
}

function normalizeRule(input: RuleInput, current?: Rule): Rule {
  return ruleSchema.parse({
    id: input.id ?? current?.id ?? "",
    title: input.title ?? current?.title ?? "",
    content: input.content ?? current?.content ?? "",
    level: input.level ?? current?.level ?? "soft",
    scope: input.scope ?? current?.scope ?? "project",
    appliesTo: input.appliesTo ?? current?.appliesTo ?? [],
    detectBy: input.detectBy ?? current?.detectBy ?? ["manual"],
    onViolation: input.onViolation ?? current?.onViolation ?? "warn",
    enabled: input.enabled ?? current?.enabled ?? true,
    source: input.source ?? current?.source ?? "user",
    priority: input.priority ?? current?.priority ?? 50,
    overridePolicy: input.overridePolicy ?? current?.overridePolicy ?? "no-override",
    tags: input.tags ?? current?.tags ?? [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...createTimestampFields(current),
  });
}

async function saveEntity<T extends { id: string }>(
  vaultRoot: string,
  locator: ProjectLocator | NovelLocator,
  descriptor: EntityDescriptor<T>,
  record: T,
): Promise<T> {
  await writeJsonFile(vaultRoot, descriptor.relativePath(locator, record.id), record);
  return record;
}

function extractWikiLinks(value: string): string[] {
  const matches = value.match(/\[\[([^\]]+)\]\]/g) ?? [];
  return matches
    .map((match) => match.slice(2, -2).trim())
    .filter(Boolean);
}

function upsertNode(nodes: Map<string, GraphNode>, node: GraphNode): void {
  if (!nodes.has(node.id)) {
    nodes.set(node.id, node);
  }
}

function addEdge(edges: Map<string, GraphEdge>, edge: GraphEdge): void {
  if (!edges.has(edge.id)) {
    edges.set(edge.id, edge);
  }
}

export async function listWorldbookEntries(vaultRoot: string, locator: ProjectLocator): Promise<WorldbookEntry[]> {
  assertProjectLocator(locator);
  return readCollection(vaultRoot, locator, worldbookDescriptor);
}

export async function createWorldbookEntry(vaultRoot: string, locator: ProjectLocator, input: WorldbookInput) {
  assertProjectLocator(locator);
  await ensureUniqueEntity(vaultRoot, locator, worldbookDescriptor, input.id);
  return saveEntity(vaultRoot, locator, worldbookDescriptor, normalizeWorldbook(input));
}

export async function getWorldbookEntry(vaultRoot: string, locator: ProjectLocator, entryId: string) {
  assertProjectLocator(locator);
  return readEntity(vaultRoot, locator, worldbookDescriptor, entryId);
}

export async function updateWorldbookEntry(
  vaultRoot: string,
  locator: ProjectLocator,
  entryId: string,
  input: Partial<WorldbookInput>,
) {
  assertProjectLocator(locator);
  const current = await readEntity(vaultRoot, locator, worldbookDescriptor, entryId);
  return saveEntity(vaultRoot, locator, worldbookDescriptor, normalizeWorldbook({ ...input, id: entryId, title: input.title ?? current.title }, current));
}

export async function deleteWorldbookEntry(vaultRoot: string, locator: ProjectLocator, entryId: string) {
  assertProjectLocator(locator);
  await readEntity(vaultRoot, locator, worldbookDescriptor, entryId);
  await rm(resolveSafePath(vaultRoot, worldbookDescriptor.relativePath(locator, entryId)), { force: true });
  return { id: entryId, deleted: true };
}

export async function listCharacters(vaultRoot: string, locator: ProjectLocator): Promise<Character[]> {
  assertProjectLocator(locator);
  return readCollection(vaultRoot, locator, characterDescriptor);
}

export async function createCharacter(vaultRoot: string, locator: ProjectLocator, input: CharacterInput) {
  assertProjectLocator(locator);
  await ensureUniqueEntity(vaultRoot, locator, characterDescriptor, input.id);
  return saveEntity(vaultRoot, locator, characterDescriptor, normalizeCharacter(input));
}

export async function getCharacter(vaultRoot: string, locator: ProjectLocator, characterId: string) {
  assertProjectLocator(locator);
  return readEntity(vaultRoot, locator, characterDescriptor, characterId);
}

export async function updateCharacter(
  vaultRoot: string,
  locator: ProjectLocator,
  characterId: string,
  input: Partial<CharacterInput>,
) {
  assertProjectLocator(locator);
  const current = await readEntity(vaultRoot, locator, characterDescriptor, characterId);
  return saveEntity(vaultRoot, locator, characterDescriptor, normalizeCharacter({ ...input, id: characterId, name: input.name ?? current.name }, current));
}

export async function deleteCharacter(vaultRoot: string, locator: ProjectLocator, characterId: string) {
  assertProjectLocator(locator);
  await readEntity(vaultRoot, locator, characterDescriptor, characterId);
  await rm(resolveSafePath(vaultRoot, characterDescriptor.relativePath(locator, characterId)), { force: true });
  return { id: characterId, deleted: true };
}

export async function listRelations(vaultRoot: string, locator: ProjectLocator): Promise<Relation[]> {
  assertProjectLocator(locator);
  return readCollection(vaultRoot, locator, relationDescriptor);
}

export async function createRelation(vaultRoot: string, locator: ProjectLocator, input: RelationInput) {
  assertProjectLocator(locator);
  await ensureUniqueEntity(vaultRoot, locator, relationDescriptor, input.id);
  return saveEntity(vaultRoot, locator, relationDescriptor, normalizeRelation(input));
}

export async function getRelation(vaultRoot: string, locator: ProjectLocator, relationId: string) {
  assertProjectLocator(locator);
  return readEntity(vaultRoot, locator, relationDescriptor, relationId);
}

export async function updateRelation(
  vaultRoot: string,
  locator: ProjectLocator,
  relationId: string,
  input: Partial<RelationInput>,
) {
  assertProjectLocator(locator);
  const current = await readEntity(vaultRoot, locator, relationDescriptor, relationId);
  return saveEntity(vaultRoot, locator, relationDescriptor, normalizeRelation({ ...input, id: relationId, from: input.from ?? current.from, to: input.to ?? current.to, type: input.type ?? current.type }, current));
}

export async function deleteRelation(vaultRoot: string, locator: ProjectLocator, relationId: string) {
  assertProjectLocator(locator);
  await readEntity(vaultRoot, locator, relationDescriptor, relationId);
  await rm(resolveSafePath(vaultRoot, relationDescriptor.relativePath(locator, relationId)), { force: true });
  return { id: relationId, deleted: true };
}

export async function listTimelineEvents(vaultRoot: string, locator: ProjectLocator): Promise<TimelineEvent[]> {
  assertProjectLocator(locator);
  return readCollection(vaultRoot, locator, timelineDescriptor);
}

export async function createTimelineEvent(vaultRoot: string, locator: ProjectLocator, input: TimelineInput) {
  assertProjectLocator(locator);
  await ensureUniqueEntity(vaultRoot, locator, timelineDescriptor, input.id);
  return saveEntity(vaultRoot, locator, timelineDescriptor, normalizeTimeline(input));
}

export async function getTimelineEvent(vaultRoot: string, locator: ProjectLocator, eventId: string) {
  assertProjectLocator(locator);
  return readEntity(vaultRoot, locator, timelineDescriptor, eventId);
}

export async function updateTimelineEvent(
  vaultRoot: string,
  locator: ProjectLocator,
  eventId: string,
  input: Partial<TimelineInput>,
) {
  assertProjectLocator(locator);
  const current = await readEntity(vaultRoot, locator, timelineDescriptor, eventId);
  return saveEntity(vaultRoot, locator, timelineDescriptor, normalizeTimeline({ ...input, id: eventId, title: input.title ?? current.title, line: input.line ?? current.line, order: input.order ?? current.order }, current));
}

export async function deleteTimelineEvent(vaultRoot: string, locator: ProjectLocator, eventId: string) {
  assertProjectLocator(locator);
  await readEntity(vaultRoot, locator, timelineDescriptor, eventId);
  await rm(resolveSafePath(vaultRoot, timelineDescriptor.relativePath(locator, eventId)), { force: true });
  return { id: eventId, deleted: true };
}

export async function listKnowledgeItems(vaultRoot: string, locator: NovelLocator): Promise<KnowledgeItem[]> {
  assertNovelLocator(locator);
  return readCollection(vaultRoot, locator, knowledgeItemDescriptor);
}

export async function createKnowledgeItem(vaultRoot: string, locator: NovelLocator, input: KnowledgeItemInput) {
  assertNovelLocator(locator);
  await ensureUniqueEntity(vaultRoot, locator, knowledgeItemDescriptor, input.id);
  return saveEntity(vaultRoot, locator, knowledgeItemDescriptor, normalizeKnowledgeItem(input));
}

export async function getKnowledgeItem(vaultRoot: string, locator: NovelLocator, itemId: string) {
  assertNovelLocator(locator);
  return readEntity(vaultRoot, locator, knowledgeItemDescriptor, itemId);
}

export async function updateKnowledgeItem(
  vaultRoot: string,
  locator: NovelLocator,
  itemId: string,
  input: Partial<KnowledgeItemInput>,
) {
  assertNovelLocator(locator);
  const current = await readEntity(vaultRoot, locator, knowledgeItemDescriptor, itemId);
  return saveEntity(vaultRoot, locator, knowledgeItemDescriptor, normalizeKnowledgeItem({ ...input, id: itemId, content: input.content ?? current.content }, current));
}

export async function deleteKnowledgeItem(vaultRoot: string, locator: NovelLocator, itemId: string) {
  assertNovelLocator(locator);
  await readEntity(vaultRoot, locator, knowledgeItemDescriptor, itemId);
  await rm(resolveSafePath(vaultRoot, knowledgeItemDescriptor.relativePath(locator, itemId)), { force: true });
  return { id: itemId, deleted: true };
}

function isGlobalRuleScope(scope?: Rule["scope"]): boolean {
  return scope === "global" || scope === "system" || scope === "vault";
}

function ruleDescriptorForScope(scope?: Rule["scope"]): EntityDescriptor<Rule> {
  return isGlobalRuleScope(scope) ? globalRuleDescriptor : ruleDescriptor;
}

async function readRuleFromAnyScope(vaultRoot: string, locator: ProjectLocator, ruleId: string): Promise<{ rule: Rule; descriptor: EntityDescriptor<Rule> }> {
  assertProjectLocator(locator);

  try {
    return { rule: await readEntity(vaultRoot, locator, ruleDescriptor, ruleId), descriptor: ruleDescriptor };
  } catch {
    return { rule: await readEntity(vaultRoot, locator, globalRuleDescriptor, ruleId), descriptor: globalRuleDescriptor };
  }
}

async function createUniqueRuleId(
  vaultRoot: string,
  locator: ProjectLocator,
  descriptor: EntityDescriptor<Rule>,
  baseId: string,
): Promise<string> {
  let id = baseId;
  let suffix = 2;

  while (true) {
    try {
      await readEntity(vaultRoot, locator, descriptor, id);
      id = `${baseId}-${suffix}`;
      suffix += 1;
    } catch {
      return id;
    }
  }
}

function extractRuleTitleFromMarkdown(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallback.replace(/\.(md|markdown|txt)$/i, "").trim() || "导入规则";
}

export async function listRules(vaultRoot: string, locator: ProjectLocator): Promise<Rule[]> {
  assertProjectLocator(locator);
  const [globalRules, projectRules] = await Promise.all([
    readCollection(vaultRoot, locator, globalRuleDescriptor),
    readCollection(vaultRoot, locator, ruleDescriptor),
  ]);
  return [...globalRules, ...projectRules].sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title));
}

export async function createRule(vaultRoot: string, locator: ProjectLocator, input: RuleInput) {
  const descriptor = ruleDescriptorForScope(input.scope);
  if (!isGlobalRuleScope(input.scope)) {
    assertProjectLocator(locator);
  }
  await ensureUniqueEntity(vaultRoot, locator, descriptor, input.id);
  return saveEntity(vaultRoot, locator, descriptor, normalizeRule(input));
}

export async function importRules(vaultRoot: string, locator: ProjectLocator, input: RuleImportInput): Promise<Rule[]> {
  const scope = input.scope ?? "project";
  const descriptor = ruleDescriptorForScope(scope);
  if (!isGlobalRuleScope(scope)) {
    assertProjectLocator(locator);
  }

  const files = input.files.filter((file) => file.content.trim());
  const imported: Rule[] = [];

  for (const [index, file] of files.entries()) {
    const title = extractRuleTitleFromMarkdown(file.content, file.fileName ?? "");
    const baseId = slugify(`${file.fileName?.replace(/\.(md|markdown|txt)$/i, "") || title || "rule"}-${index + 1}`);
    const id = await createUniqueRuleId(vaultRoot, locator, descriptor, baseId);
    const rule = await saveEntity(
      vaultRoot,
      locator,
      descriptor,
      normalizeRule({
        id,
        title,
        content: file.content,
        level: input.level ?? "soft",
        scope,
        appliesTo: input.appliesTo ?? [],
        detectBy: input.detectBy?.length ? input.detectBy : ["manual"],
        onViolation: input.onViolation ?? "warn",
        enabled: input.enabled ?? true,
        source: input.source ?? "import",
        priority: input.priority ?? 50,
        overridePolicy: input.overridePolicy ?? "no-override",
        tags: input.tags ?? [],
      }),
    );
    imported.push(rule);
  }

  return imported;
}

export async function getRule(vaultRoot: string, locator: ProjectLocator, ruleId: string) {
  return (await readRuleFromAnyScope(vaultRoot, locator, ruleId)).rule;
}

export async function updateRule(
  vaultRoot: string,
  locator: ProjectLocator,
  ruleId: string,
  input: Partial<RuleInput>,
) {
  const { rule: current, descriptor } = await readRuleFromAnyScope(vaultRoot, locator, ruleId);
  const nextDescriptor = input.scope && input.scope !== current.scope ? ruleDescriptorForScope(input.scope) : descriptor;
  const next = normalizeRule({ ...input, id: ruleId, title: input.title ?? current.title }, current);

  if (nextDescriptor !== descriptor) {
    await ensureUniqueEntity(vaultRoot, locator, nextDescriptor, next.id);
    await rm(resolveSafePath(vaultRoot, descriptor.relativePath(locator, ruleId)), { force: true });
  }

  return saveEntity(vaultRoot, locator, nextDescriptor, next);
}

export async function deleteRule(vaultRoot: string, locator: ProjectLocator, ruleId: string) {
  const { descriptor } = await readRuleFromAnyScope(vaultRoot, locator, ruleId);
  await rm(resolveSafePath(vaultRoot, descriptor.relativePath(locator, ruleId)), { force: true });
  return { id: ruleId, deleted: true };
}

export async function buildKnowledgeGraph(vaultRoot: string, locator: NovelLocator): Promise<KnowledgeGraph> {
  assertNovelLocator(locator);

  const [characters, worldbookEntries, relations, timelineEvents, knowledgeItems] = await Promise.all([
    listCharacters(vaultRoot, locator),
    listWorldbookEntries(vaultRoot, locator),
    listRelations(vaultRoot, locator),
    listTimelineEvents(vaultRoot, locator),
    listKnowledgeItems(vaultRoot, locator),
  ]);

  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const referenceByLabel = new Map<string, string>();

  for (const character of characters) {
    upsertNode(nodes, {
      id: `character:${character.id}`,
      type: "character",
      label: character.name,
    });
  }

  for (const entry of worldbookEntries) {
    upsertNode(nodes, {
      id: `worldbook:${entry.id}`,
      type: "worldbook",
      label: entry.title,
    });
  }

  for (const event of timelineEvents) {
    upsertNode(nodes, {
      id: `timeline:${event.id}`,
      type: "timeline",
      label: event.title,
    });
  }

  for (const item of knowledgeItems) {
    upsertNode(nodes, {
      id: `knowledge:${item.id}`,
      type: "knowledge",
      label: item.content.slice(0, 40),
    });
  }

  const lookupEntityId = (label: string): string => {
    const normalized = label.trim();
    for (const character of characters) {
      if ([character.id, character.name].includes(normalized)) {
        return `character:${character.id}`;
      }
    }
    for (const entry of worldbookEntries) {
      if ([entry.id, entry.title].includes(normalized)) {
        return `worldbook:${entry.id}`;
      }
    }
    for (const event of timelineEvents) {
      if ([event.id, event.title].includes(normalized)) {
        return `timeline:${event.id}`;
      }
    }

    const existing = referenceByLabel.get(normalized);
    if (existing) {
      return existing;
    }

    const referenceId = `reference:${normalized}`;
    referenceByLabel.set(normalized, referenceId);
    upsertNode(nodes, {
      id: referenceId,
      type: "reference",
      label: normalized,
    });
    return referenceId;
  };

  for (const relation of relations) {
    addEdge(edges, {
      id: `relation:${relation.id}`,
      from: `character:${relation.from}`,
      to: `character:${relation.to}`,
      type: relation.type,
      bidirectional: true,
    });
  }

  for (const character of characters) {
    for (const link of character.links.flatMap(extractWikiLinks)) {
      addEdge(edges, {
        id: `link:${character.id}:${link}`,
        from: `character:${character.id}`,
        to: lookupEntityId(link),
        type: "wikilink",
      });
    }

    for (const relatedId of character.relatedWorldbook ?? []) {
      addEdge(edges, {
        id: `character-worldbook:${character.id}:${relatedId}`,
        from: `character:${character.id}`,
        to: `worldbook:${relatedId}`,
        type: "related-worldbook",
      });
    }
  }

  for (const entry of worldbookEntries) {
    for (const characterId of entry.relatedCharacters ?? entry.trigger?.characters ?? []) {
      addEdge(edges, {
        id: `worldbook-character:${entry.id}:${characterId}`,
        from: `worldbook:${entry.id}`,
        to: `character:${characterId}`,
        type: "related-character",
      });
    }

    for (const timelineId of entry.relatedEvents ?? entry.trigger?.timeline ?? []) {
      addEdge(edges, {
        id: `worldbook-timeline:${entry.id}:${timelineId}`,
        from: `worldbook:${entry.id}`,
        to: lookupEntityId(timelineId),
        type: "related-event",
      });
    }
  }

  for (const event of timelineEvents) {
    for (const participantId of event.participants) {
      addEdge(edges, {
        id: `timeline-participant:${event.id}:${participantId}`,
        from: `timeline:${event.id}`,
        to: `character:${participantId}`,
        type: "participant",
      });
    }
  }

  for (const item of knowledgeItems) {
    for (const characterId of item.knownBy) {
      addEdge(edges, {
        id: `knowledge-known:${item.id}:${characterId}`,
        from: `knowledge:${item.id}`,
        to: `character:${characterId}`,
        type: "known-by",
      });
    }

    for (const characterId of item.unknownBy) {
      addEdge(edges, {
        id: `knowledge-unknown:${item.id}:${characterId}`,
        from: `knowledge:${item.id}`,
        to: `character:${characterId}`,
        type: "unknown-by",
      });
    }
  }

  return {
    nodes: Array.from(nodes.values()).sort((left, right) => left.id.localeCompare(right.id)),
    edges: Array.from(edges.values()).sort((left, right) => left.id.localeCompare(right.id)),
  };
}
