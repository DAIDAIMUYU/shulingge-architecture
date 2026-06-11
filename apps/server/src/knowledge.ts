import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  CURRENT_SCHEMA_VERSION,
  characterSchema,
  knowledgeItemSchema,
  relationSchema,
  timelineEventSchema,
  worldbookEntrySchema,
  type Character,
  type KnowledgeItem,
  type Relation,
  type TimelineEvent,
  type WorldbookEntry,
} from "@shulingge/shared";
import { readJsonFile, resolveSafePath, writeJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

type KnowledgeEntityType = "worldbook" | "characters" | "relations" | "timeline" | "knowledge-items";

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

function normalizeWorldbook(input: WorldbookInput, current?: WorldbookEntry): WorldbookEntry {
  return worldbookEntrySchema.parse({
    id: input.id ?? current?.id ?? "",
    title: input.title ?? current?.title ?? "",
    origin: input.origin ?? current?.origin ?? "original",
    category: input.category ?? current?.category ?? "setting",
    name: input.name ?? current?.name ?? input.title ?? current?.title,
    summary: input.summary ?? current?.summary,
    description: input.description ?? current?.description,
    relatedCharacters: input.relatedCharacters ?? current?.relatedCharacters ?? [],
    relatedChapters: input.relatedChapters ?? current?.relatedChapters ?? [],
    custom: input.custom ?? current?.custom ?? [],
    sections: {
      fact: input.sections?.fact ?? current?.sections.fact ?? "",
      adaptation: input.sections?.adaptation ?? current?.sections.adaptation ?? "",
      currentState: input.sections?.currentState ?? current?.sections.currentState ?? "",
      writingHint: input.sections?.writingHint ?? current?.sections.writingHint ?? "",
      forbidden: input.sections?.forbidden ?? current?.sections.forbidden ?? "",
    },
    trigger: {
      keywords: input.trigger?.keywords ?? current?.trigger.keywords ?? [],
      characters: input.trigger?.characters ?? current?.trigger.characters ?? [],
      places: input.trigger?.places ?? current?.trigger.places ?? [],
      timeline: input.trigger?.timeline ?? current?.trigger.timeline ?? [],
      semantic: input.trigger?.semantic ?? current?.trigger.semantic ?? false,
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
  return timelineEventSchema.parse({
    id: input.id ?? current?.id ?? "",
    title: input.title ?? current?.title ?? "",
    line: input.line ?? current?.line ?? "main",
    order: input.order ?? current?.order ?? 0,
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
    for (const characterId of entry.trigger.characters) {
      addEdge(edges, {
        id: `worldbook-character:${entry.id}:${characterId}`,
        from: `worldbook:${entry.id}`,
        to: `character:${characterId}`,
        type: "trigger-character",
      });
    }

    for (const timelineId of entry.trigger.timeline ?? []) {
      addEdge(edges, {
        id: `worldbook-timeline:${entry.id}:${timelineId}`,
        from: `worldbook:${entry.id}`,
        to: lookupEntityId(timelineId),
        type: "trigger-timeline",
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
