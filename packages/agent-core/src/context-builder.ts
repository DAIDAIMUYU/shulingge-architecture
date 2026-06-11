import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  createAppError,
  type Agent,
  type Character,
  type ContextSource,
  type KnowledgeItem,
  type Relation,
  type Summary,
  type TimelineEvent,
  type WorldbookEntry,
} from "@shulingge/shared";
import { readJsonFile, readManuscriptFile, resolveSafePath } from "@shulingge/vault-core";

import { getAgentById } from "./agents.js";
import type { AgentCatalog, BuildContextInput, BuiltContext } from "./types.js";

const AVG_CHARS_PER_TOKEN = 4;

interface SourceCandidate {
  path: string;
  reason: ContextSource["reason"];
  priority: number;
  content: string;
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / AVG_CHARS_PER_TOKEN));
}

function tokenizeSearchTerms(text: string): string[] {
  const asciiWords = text.toLowerCase().match(/[a-z0-9-]{2,}/g) ?? [];
  const cjkChars = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? [];
  return [...new Set([...asciiWords, ...cjkChars])];
}

function matchesTrigger(text: string, entry: WorldbookEntry): boolean {
  const haystack = text.toLowerCase();
  const values = [
    entry.id,
    entry.title,
    entry.name,
    entry.summary,
    entry.description,
    ...(entry.keywords ?? []),
    ...(entry.relatedCharacters ?? []),
    ...(entry.relatedSettings ?? []),
    ...(entry.relatedEvents ?? []),
    ...(entry.trigger?.keywords ?? []),
    ...(entry.trigger?.characters ?? []),
    ...(entry.trigger?.places ?? []),
  ];

  return values.some((value) => {
    if (!value?.trim()) {
      return false;
    }
    return haystack.includes(value.trim().toLowerCase());
  });
}

function normalizeLookupValues(values: Iterable<string | undefined>): Set<string> {
  const normalized = new Set<string>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    normalized.add(value.toLowerCase());
  }

  return normalized;
}

async function readJsonCollection<T>(vaultRoot: string, relativeDir: string): Promise<Array<{ path: string; value: T }>> {
  const dirPath = resolveSafePath(vaultRoot, relativeDir);

  try {
    const entries = await readdir(dirPath);
    const values = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map(async (entry) => ({
          path: path.posix.join(relativeDir, entry),
          value: await readJsonFile<T>(vaultRoot, path.posix.join(relativeDir, entry)),
        })),
    );
    return values;
  } catch {
    return [];
  }
}

async function readPrimaryContext(
  vaultRoot: string,
  input: BuildContextInput,
): Promise<{ manuscriptPath: string; manuscript: string; metadata?: { involvedCharacters?: string[] } }> {
  const manuscriptPath = path.posix.join(
    "projects",
    input.projectId,
    "novels",
    input.novelId,
    "manuscripts",
    `${input.chapterId}.md`,
  );
  const metadataPath = path.posix.join(
    "projects",
    input.projectId,
    "novels",
    input.novelId,
    "metadata/chapters",
    `${input.chapterId}.json`,
  );

  const manuscript = await readManuscriptFile(vaultRoot, manuscriptPath);
  const metadata = await readJsonFile<{ involvedCharacters?: string[] }>(vaultRoot, metadataPath).catch(() => undefined);

  return { manuscriptPath, manuscript, metadata };
}

function dedupeSources(sources: SourceCandidate[]): SourceCandidate[] {
  const deduped = new Map<string, SourceCandidate>();
  for (const source of sources) {
    const existing = deduped.get(source.path);
    if (!existing || (source.reason === "forced" && existing.reason !== "forced")) {
      deduped.set(source.path, source);
    }
  }
  return [...deduped.values()];
}

export async function buildContext(
  vaultRoot: string,
  catalog: AgentCatalog,
  input: BuildContextInput,
): Promise<BuiltContext> {
  const agent = getAgentById(catalog, input.agentId);
  if (!agent) {
    throw createAppError("AGENT_NOT_FOUND", `Unknown agent: ${input.agentId}`, { redacted: true });
  }

  const tokenBudget = input.tokenBudget ?? 1200;
  const { manuscriptPath, manuscript, metadata } = await readPrimaryContext(vaultRoot, input);
  const searchTerms = tokenizeSearchTerms(manuscript);
  const matchedWorldbookIds = new Set<string>();
  const matchedCharacterIds = new Set<string>();

  const candidates: SourceCandidate[] = [
    {
      path: manuscriptPath,
      reason: "auto",
      priority: 100,
      content: manuscript,
    },
  ];

  const worldbookEntries = await readJsonCollection<WorldbookEntry>(
    vaultRoot,
    path.posix.join("projects", input.projectId, "shared/worldbook"),
  );
  for (const entry of worldbookEntries) {
    if (matchesTrigger(manuscript, entry.value)) {
      matchedWorldbookIds.add(entry.value.id);
      candidates.push({
        path: entry.path,
        reason: "auto",
        priority: 80,
        content: JSON.stringify(entry.value),
      });
    }
  }

  const characterEntries = await readJsonCollection<Character>(
    vaultRoot,
    path.posix.join("projects", input.projectId, "shared/characters"),
  );
  const involvedCharacters = normalizeLookupValues(metadata?.involvedCharacters ?? []);
  for (const term of searchTerms) {
    involvedCharacters.add(term);
  }
  for (const entry of characterEntries) {
    const lookupValues = normalizeLookupValues([entry.value.id, entry.value.name]);
    const isRelevant = [...lookupValues].some((value) => involvedCharacters.has(value));

    if (isRelevant) {
      matchedCharacterIds.add(entry.value.id);
      candidates.push({
        path: entry.path,
        reason: "auto",
        priority: 70,
        content: JSON.stringify(entry.value),
      });
    }
  }

  const relationEntries = await readJsonCollection<Relation>(
    vaultRoot,
    path.posix.join("projects", input.projectId, "shared/relations"),
  );
  for (const entry of relationEntries) {
    if (matchedCharacterIds.has(entry.value.from) || matchedCharacterIds.has(entry.value.to)) {
      candidates.push({
        path: entry.path,
        reason: "auto",
        priority: 65,
        content: JSON.stringify(entry.value),
      });
    }
  }

  const timelineEntries = await readJsonCollection<TimelineEvent>(
    vaultRoot,
    path.posix.join("projects", input.projectId, "shared/timeline"),
  );
  for (const entry of timelineEntries) {
    const matchesChapter = entry.value.boundChapters.includes(input.chapterId);
    const matchesParticipant = entry.value.participants.some((participant) =>
      matchedCharacterIds.has(participant),
    );

    if (matchesChapter || matchesParticipant) {
      candidates.push({
        path: entry.path,
        reason: "auto",
        priority: 60,
        content: JSON.stringify(entry.value),
      });
    }
  }

  const knowledgeItemEntries = await readJsonCollection<KnowledgeItem>(
    vaultRoot,
    path.posix.join("projects", input.projectId, "novels", input.novelId, "states", "knowledge"),
  );
  for (const entry of knowledgeItemEntries) {
    const matchesChapter = entry.value.sourceChapter === input.chapterId;
    const matchesCharacter = entry.value.knownBy.some((characterId) =>
      matchedCharacterIds.has(characterId),
    );

    if (matchesChapter || matchesCharacter) {
      candidates.push({
        path: entry.path,
        reason: "auto",
        priority: 58,
        content: JSON.stringify(entry.value),
      });
    }
  }

  const summaryEntries = await readJsonCollection<Summary>(
    vaultRoot,
    path.posix.join("projects", input.projectId, "novels", input.novelId, "summaries"),
  );
  for (const entry of summaryEntries.filter((item) => item.value.chapterId !== input.chapterId)) {
    candidates.push({
      path: entry.path,
      reason: "auto",
      priority: 50,
      content: JSON.stringify(entry.value),
    });
  }

  for (const forcedPath of input.forceInclude) {
    try {
      const normalizedPath = forcedPath.replace(/\\/g, "/");
      const content = normalizedPath.endsWith(".md")
        ? await readManuscriptFile(vaultRoot, normalizedPath)
        : JSON.stringify(await readJsonFile<unknown>(vaultRoot, normalizedPath));
      candidates.push({
        path: normalizedPath,
        reason: "forced",
        priority: 95,
        content,
      });
    } catch {
      // Ignore missing forced paths in MVP; surfaced later in workflow diagnostics.
    }
  }

  const filtered = dedupeSources(candidates)
    .filter((candidate) => !input.exclude.includes(candidate.path))
    .sort((left, right) => {
      if (left.reason === "forced" && right.reason !== "forced") {
        return -1;
      }
      if (left.reason !== "forced" && right.reason === "forced") {
        return 1;
      }
      return right.priority - left.priority;
    });

  const selected: Array<ContextSource & { content: string }> = [];
  let totalTokens = 0;
  let truncated = false;

  for (const candidate of filtered) {
    const tokens = estimateTokens(candidate.content);
    const isForced = candidate.reason === "forced";
    if (!isForced && totalTokens + tokens > tokenBudget && selected.length > 0) {
      truncated = true;
      continue;
    }

    if (isForced && totalTokens + tokens > tokenBudget) {
      truncated = true;
    }

    totalTokens += tokens;
    selected.push({
      path: candidate.path,
      reason: candidate.reason,
      tokens,
      content: candidate.content,
    });
  }

  const content = selected
    .map((source) => `# Source: ${source.path}\n${source.content}`)
    .join("\n\n");

  return {
    agent,
    sources: selected.map(({ content: _content, ...source }) => source),
    sourceContents: selected,
    totalTokens,
    truncated,
    content,
  };
}
