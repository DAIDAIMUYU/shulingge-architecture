import { readdir } from "node:fs/promises";
import path from "node:path";

import type {
  Chapter,
  Character,
  KnowledgeItem,
  Relation,
  Summary,
  TimelineEvent,
  WorldbookEntry,
} from "@shulingge/shared";
import { readJsonFile, readManuscriptFile } from "@shulingge/vault-core";

export interface ConsistencyIssue {
  id: string;
  category: "character" | "relation" | "timeline" | "foreshadow" | "worldbook" | "knowledge";
  severity: "warn" | "error";
  entityId: string;
  message: string;
  chapterId?: string;
  suggestions: string[];
}

export interface ConsistencyReport {
  projectId: string;
  novelId: string;
  scannedAt: string;
  level?: "intermediate" | "advanced";
  totalIssues: number;
  issues: ConsistencyIssue[];
}

async function readCollection<T>(vaultRoot: string, relativeDir: string): Promise<T[]> {
  const absoluteDir = path.join(vaultRoot, ...relativeDir.split("/"));
  const entries = await readdir(absoluteDir).catch(() => []);
  const items = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => readJsonFile<T>(vaultRoot, path.posix.join(relativeDir, entry))),
  );
  return items;
}

async function readChapterMetas(vaultRoot: string, projectId: string, novelId: string): Promise<Chapter[]> {
  return readCollection<Chapter>(vaultRoot, path.posix.join("projects", projectId, "novels", novelId, "metadata/chapters"));
}

async function readSummaries(vaultRoot: string, projectId: string, novelId: string): Promise<Summary[]> {
  return readCollection<Summary>(vaultRoot, path.posix.join("projects", projectId, "novels", novelId, "summaries"));
}

function extractForeshadowTokens(summaries: Summary[]): string[] {
  return summaries.flatMap((summary) => {
    const matches = summary.short.match(/伏笔[:：]\s*([^\n，。,;；]+)/g) ?? [];
    return matches.map((item) => item.replace(/伏笔[:：]\s*/g, "").trim()).filter(Boolean);
  });
}

export async function runConsistencyCheck(
  vaultRoot: string,
  input: { projectId: string; novelId: string },
): Promise<ConsistencyReport> {
  const [chapters, characters, relations, timeline, worldbook, knowledge, summaries] = await Promise.all([
    readChapterMetas(vaultRoot, input.projectId, input.novelId),
    readCollection<Character>(vaultRoot, path.posix.join("projects", input.projectId, "shared/characters")),
    readCollection<Relation>(vaultRoot, path.posix.join("projects", input.projectId, "shared/relations")),
    readCollection<TimelineEvent>(vaultRoot, path.posix.join("projects", input.projectId, "shared/timeline")),
    readCollection<WorldbookEntry>(vaultRoot, path.posix.join("projects", input.projectId, "shared/worldbook")),
    readCollection<KnowledgeItem>(vaultRoot, path.posix.join("projects", input.projectId, "novels", input.novelId, "states/knowledge")),
    readSummaries(vaultRoot, input.projectId, input.novelId),
  ]);

  const issues: ConsistencyIssue[] = [];
  const chapterIds = new Set(chapters.map((chapter) => chapter.id));
  const characterIds = new Set(characters.map((character) => character.id));
  const worldbookIds = new Set(worldbook.map((entry) => entry.id));
  const timelineIds = new Set(timeline.map((event) => event.id));
  const chapterOrder = new Map(chapters.map((chapter) => [chapter.id, chapter.order]));

  for (const relation of relations) {
    const missingChapters = relation.sourceChapters.filter((chapterId) => !chapterIds.has(chapterId));
    if (missingChapters.length > 0) {
      issues.push({
        id: `relation:${relation.id}:missing-chapters`,
        category: "relation",
        severity: "warn",
        entityId: relation.id,
        message: `Relation ${relation.id} references missing chapters: ${missingChapters.join(", ")}`,
        suggestions: ["补齐 sourceChapters", "或删除已失效的章节引用"],
      });
    }
  }

  for (const event of timeline) {
    const missingChapters = event.boundChapters.filter((chapterId) => !chapterIds.has(chapterId));
    if (missingChapters.length > 0) {
      issues.push({
        id: `timeline:${event.id}:missing-chapters`,
        category: "timeline",
        severity: "error",
        entityId: event.id,
        message: `Timeline event ${event.id} binds missing chapters: ${missingChapters.join(", ")}`,
        suggestions: ["修正 boundChapters", "或补建对应章节 metadata"],
      });
    }

    const chapterOrders = event.boundChapters.map((chapterId) => chapterOrder.get(chapterId)).filter((value): value is number => typeof value === "number");
    const sortedOrders = [...chapterOrders].sort((left, right) => left - right);
    if (chapterOrders.length > 1 && chapterOrders.some((value, index) => value !== sortedOrders[index])) {
      issues.push({
        id: `timeline:${event.id}:out-of-order`,
        category: "timeline",
        severity: "warn",
        entityId: event.id,
        message: `Timeline event ${event.id} spans chapters that are out of order`,
        suggestions: ["检查章节顺序", "确认该事件是否应拆分为多个时间线节点"],
      });
    }
  }

  for (const item of knowledge) {
    const unknownCharacters = [...item.knownBy, ...item.unknownBy].filter((characterId) => !characterIds.has(characterId));
    if (unknownCharacters.length > 0) {
      issues.push({
        id: `knowledge:${item.id}:unknown-character`,
        category: "knowledge",
        severity: "error",
        entityId: item.id,
        chapterId: item.sourceChapter,
        message: `Knowledge item ${item.id} references unknown characters: ${unknownCharacters.join(", ")}`,
        suggestions: ["修正 knownBy/unknownBy", "或补建角色卡"],
      });
    }
  }

  for (const entry of worldbook) {
    const missingTimelineRefs = (entry.trigger.timeline ?? []).filter((timelineId) => !timelineIds.has(timelineId));
    if (missingTimelineRefs.length > 0) {
      issues.push({
        id: `worldbook:${entry.id}:missing-timeline`,
        category: "worldbook",
        severity: "warn",
        entityId: entry.id,
        message: `Worldbook entry ${entry.id} references missing timeline ids: ${missingTimelineRefs.join(", ")}`,
        suggestions: ["修正 trigger.timeline", "或补建对应时间线事件"],
      });
    }

    const missingWorldbookLinks = (entry.relatedNovels ?? []).filter((novelId) => novelId !== input.novelId);
    if (missingWorldbookLinks.length > 0) {
      issues.push({
        id: `worldbook:${entry.id}:novel-scope`,
        category: "worldbook",
        severity: "warn",
        entityId: entry.id,
        message: `Worldbook entry ${entry.id} points to other novels only: ${missingWorldbookLinks.join(", ")}`,
        suggestions: ["确认 relatedNovels 是否包含当前 novel", "避免跨卷误触发"],
      });
    }
  }

  const foreshadows = extractForeshadowTokens(summaries);
  for (const token of foreshadows) {
    const resolved = summaries.some((summary) => summary.structured.includes(token) && !summary.short.includes(`伏笔: ${token}`));
    if (!resolved) {
      issues.push({
        id: `foreshadow:${token}`,
        category: "foreshadow",
        severity: "warn",
        entityId: token,
        message: `Foreshadow token "${token}" has not been resolved in later summaries`,
        suggestions: ["在后续章节摘要中标记已回收", "或补写 worldbook/currentState 说明"],
      });
    }
  }

  for (const chapter of chapters) {
    const manuscriptPath = path.posix.join("projects", input.projectId, "novels", input.novelId, "manuscripts", `${chapter.id}.md`);
    const manuscript = await readManuscriptFile(vaultRoot, manuscriptPath).catch(() => "");
    const mentionedCharacterIds = characters
      .filter((character) => manuscript.includes(character.name) || manuscript.includes(character.id))
      .map((character) => character.id);
    const missingMetadataCharacters = mentionedCharacterIds.filter((characterId) => !chapter.involvedCharacters.includes(characterId));

    if (missingMetadataCharacters.length > 0) {
      issues.push({
        id: `character:${chapter.id}:missing-involved`,
        category: "character",
        severity: "warn",
        entityId: chapter.id,
        chapterId: chapter.id,
        message: `Chapter ${chapter.id} mentions characters not listed in metadata.involvedCharacters: ${missingMetadataCharacters.join(", ")}`,
        suggestions: ["补齐 metadata/chapters 的 involvedCharacters", "便于后续 context builder 和一致性校验"],
      });
    }
  }

  for (const character of characters) {
    if (character.relatedWorldbook?.some((entryId) => !worldbookIds.has(entryId))) {
      issues.push({
        id: `character:${character.id}:missing-worldbook`,
        category: "character",
        severity: "warn",
        entityId: character.id,
        message: `Character ${character.id} references missing worldbook entries`,
        suggestions: ["修正 relatedWorldbook", "或补建相关世界书条目"],
      });
    }
    if (!character.voice.byEmotion || Object.keys(character.voice.byEmotion).length === 0) {
      issues.push({
        id: `character:${character.id}:voice-emotion`,
        category: "character",
        severity: "warn",
        entityId: character.id,
        message: `Character ${character.id} has no emotion-specific voice variants`,
        suggestions: ["补充 voice.byEmotion", "至少覆盖 calm/angry/grief 等常用情绪"],
      });
    }
  }

  return {
    projectId: input.projectId,
    novelId: input.novelId,
    scannedAt: new Date().toISOString(),
    level: "intermediate",
    totalIssues: issues.length,
    issues,
  };
}

export async function runAdvancedConsistencyCheck(
  vaultRoot: string,
  input: { projectId: string; novelId: string },
): Promise<ConsistencyReport> {
  const base = await runConsistencyCheck(vaultRoot, input);
  const advancedIssues = [...base.issues];

  const severeTimelineIssues = base.issues.filter((item) => item.category === "timeline" && item.severity === "error");
  if (severeTimelineIssues.length > 1) {
    advancedIssues.push({
      id: "advanced:timeline-cluster",
      category: "timeline",
      severity: "error",
      entityId: input.novelId,
      message: `Multiple severe timeline issues detected (${severeTimelineIssues.length}), suggesting structural chronology drift`,
      suggestions: ["冻结时间线后逐章回放", "优先修复高阶时间线冲突再重跑 9 Agent"],
    });
  }

  const characterIssueCount = base.issues.filter((item) => item.category === "character").length;
  if (characterIssueCount >= 2) {
    advancedIssues.push({
      id: "advanced:character-voice-gap",
      category: "character",
      severity: "warn",
      entityId: input.novelId,
      message: `Character consistency drift detected across ${characterIssueCount} findings`,
      suggestions: ["补齐角色声音库", "在高风险章节前加角色声音检查 Agent 复核"],
    });
  }

  return {
    ...base,
    level: "advanced",
    totalIssues: advancedIssues.length,
    issues: advancedIssues,
  };
}
