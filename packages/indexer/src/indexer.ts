import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  Character,
  Chapter,
  KnowledgeItem,
  ProjectSeries,
  Relation,
  RunRecord,
  Summary,
  TimelineEvent,
  WorldbookEntry,
} from "@shulingge/shared";
import { readJsonFile, readManuscriptFile, resolveSafePath } from "@shulingge/vault-core";

import { loadDatabase, persistDatabase } from "./database.js";
import type { IndexedDocument, RebuildIndexResult, SearchQuery, SearchResult } from "./types.js";

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

async function listJsonFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dirPath, entry.name));
  } catch {
    return [];
  }
}

async function listMarkdownFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.join(dirPath, entry.name));
  } catch {
    return [];
  }
}

async function readChapterTitleForManuscript(
  vaultRoot: string,
  novelRoot: string,
  chapterId: string,
): Promise<string> {
  try {
    const metadataPath = path.join(novelRoot, "metadata", "chapters", `${chapterId}.json`);
    const metadata = await readJsonFile<Pick<Chapter, "title">>(vaultRoot, relativeVaultPath(vaultRoot, metadataPath));
    return metadata.title?.trim() || chapterId;
  } catch {
    return chapterId;
  }
}

function relativeVaultPath(vaultRoot: string, absolutePath: string): string {
  return toPosixPath(path.relative(vaultRoot, absolutePath));
}

function tokenize(...values: Array<string | undefined>): string[] {
  return [...new Set(values.flatMap((value) => value?.split(/[\s,，/]+/).filter(Boolean) ?? []))];
}

interface IndexManifest {
  version: 1;
  documentCount: number;
  fingerprints: Record<string, number>;
}

function getManifestPath(vaultRoot: string): string {
  return resolveSafePath(vaultRoot, ".index/manifest.json");
}

async function readManifest(vaultRoot: string): Promise<IndexManifest | null> {
  try {
    return JSON.parse(await readFile(getManifestPath(vaultRoot), "utf8")) as IndexManifest;
  } catch {
    return null;
  }
}

async function writeManifest(vaultRoot: string, manifest: IndexManifest): Promise<void> {
  await writeFile(getManifestPath(vaultRoot), JSON.stringify(manifest, null, 2), "utf8");
}

function normalizeSemanticText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\p{Script=Han}]+/gu, " ").trim();
}

function createLocalEmbedding(value: string, dimensions = 48): number[] {
  const normalized = normalizeSemanticText(value).replace(/\s+/g, "");
  const vector = new Array<number>(dimensions).fill(0);
  if (!normalized) {
    return vector;
  }

  for (let index = 0; index < normalized.length; index += 1) {
    const gram = normalized.slice(index, index + 2) || normalized[index] || "";
    let hash = 0;
    for (const char of gram) {
      hash = (hash * 33 + char.charCodeAt(0)) % 2147483647;
    }
    vector[hash % dimensions] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map((item) => item / norm);
}

function cosineSimilarity(left: number[], right: number[]): number {
  return left.reduce((sum, item, index) => sum + item * (right[index] ?? 0), 0);
}

async function collectFingerprints(vaultRoot: string): Promise<Record<string, number>> {
  const documents = await collectDocuments(vaultRoot);
  const fingerprints: Record<string, number> = {};
  for (const document of documents) {
    try {
      const fileStats = await stat(resolveSafePath(vaultRoot, document.path));
      fingerprints[document.path] = fileStats.mtimeMs;
    } catch {
      fingerprints[document.path] = 0;
    }
  }
  return fingerprints;
}

export async function rebuildIndex(
  vaultRoot: string,
  options: { incremental?: boolean } = {},
): Promise<RebuildIndexResult> {
  if (options.incremental) {
    const [manifest, nextFingerprints] = await Promise.all([
      readManifest(vaultRoot),
      collectFingerprints(vaultRoot),
    ]);

    if (
      manifest &&
      Object.keys(manifest.fingerprints).length === Object.keys(nextFingerprints).length &&
      Object.entries(nextFingerprints).every(([filePath, mtime]) => manifest.fingerprints[filePath] === mtime)
    ) {
      return {
        indexedCount: manifest.documentCount,
        indexPath: resolveSafePath(vaultRoot, ".index/cache.sqlite"),
        reused: true,
      };
    }
  }
  const { database, indexPath } = await loadDatabase(vaultRoot);
  const documents = await collectDocuments(vaultRoot);

  database.run("DELETE FROM documents");

  for (const document of documents) {
    database.run(
      `
        INSERT INTO documents (
          id, type, project_id, novel_id, path, title, content, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        document.id,
        document.type,
        document.projectId,
        document.novelId ?? null,
        document.path,
        document.title,
        document.content,
        JSON.stringify(document.tags),
      ],
    );
  }

  await persistDatabase(database, indexPath);
  database.close();
  await writeManifest(vaultRoot, {
    version: 1,
    documentCount: documents.length,
    fingerprints: await collectFingerprints(vaultRoot),
  });

  return {
    indexedCount: documents.length,
    indexPath,
  };
}

export async function searchIndex(vaultRoot: string, query: SearchQuery): Promise<SearchResult[]> {
  const { database } = await loadDatabase(vaultRoot);
  const sql = `
    SELECT id, type, project_id, novel_id, path, title, content, tags
    FROM documents
    ORDER BY title COLLATE NOCASE ASC
  `;

  const results = database.exec(sql);
  database.close();

  const rows = results[0]?.values ?? [];
  const requestedTypes = Array.isArray(query.type) ? query.type : query.type ? [query.type] : [];
  const searchText = query.text?.trim().toLowerCase();
  const semanticEmbedding = query.semantic && searchText ? createLocalEmbedding(searchText) : null;

  const mapped = rows
    .map((row: unknown[]) => {
    const [id, type, projectId, novelId, documentPath, title, content, tags] = row as [
      string,
      SearchResult["type"],
      string,
      string | null,
      string,
      string,
      string,
      string,
    ];

    const parsedTags = JSON.parse(tags) as string[];
    const score = calculateScore({ title, content, tags: parsedTags }, query);
    const semanticScore = semanticEmbedding
      ? cosineSimilarity(
          semanticEmbedding,
          createLocalEmbedding(`${title} ${content.slice(0, 400)} ${parsedTags.join(" ")}`),
        )
      : 0;

    return {
      id,
      type,
      projectId,
      novelId: novelId ?? undefined,
      path: documentPath,
      title,
      content,
      tags: parsedTags,
      score: score + semanticScore * 5,
    } satisfies SearchResult;
  })
    .filter((item: SearchResult) => {
      if (query.projectId && item.projectId !== query.projectId) {
        return false;
      }

      if (query.novelId && item.novelId !== query.novelId) {
        return false;
      }

      if (requestedTypes.length > 0 && !requestedTypes.includes(item.type)) {
        return false;
      }

      if (
        searchText &&
        !query.semantic &&
        !item.title.toLowerCase().includes(searchText) &&
        !item.content.toLowerCase().includes(searchText)
      ) {
        return false;
      }

      if (query.semantic && semanticEmbedding && item.score <= 0.15) {
        return false;
      }

      if (query.tags && query.tags.length > 0 && !query.tags.every((tag) => item.tags.includes(tag))) {
        return false;
      }

      return true;
    });

  return mapped
    .sort((left: SearchResult, right: SearchResult) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, query.limit ?? 20);
}

export async function getIndexedDocumentCount(vaultRoot: string): Promise<number> {
  const { database } = await loadDatabase(vaultRoot);
  const results = database.exec("SELECT COUNT(*) as count FROM documents");
  database.close();
  return Number(results[0]?.values[0]?.[0] ?? 0);
}

async function collectDocuments(vaultRoot: string): Promise<IndexedDocument[]> {
  const projectsRoot = resolveSafePath(vaultRoot, "projects");
  const projectEntries = await readdir(projectsRoot, { withFileTypes: true }).catch(() => []);
  const documents: IndexedDocument[] = [];

  for (const entry of projectEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectId = entry.name;
    const projectRoot = path.join(projectsRoot, projectId);
    const seriesPath = path.join(projectRoot, "series.json");
    const series = await readJsonFile<ProjectSeries>(vaultRoot, relativeVaultPath(vaultRoot, seriesPath));

    documents.push({
      id: `${projectId}:series`,
      type: "chapter-metadata",
      projectId,
      path: relativeVaultPath(vaultRoot, seriesPath),
      title: series.name,
      content: JSON.stringify(series),
      tags: tokenize(series.type, series.defaultNovelId),
    });

    documents.push(...(await collectSharedDocuments(vaultRoot, projectId, projectRoot)));
    documents.push(...(await collectNovelDocuments(vaultRoot, projectId, projectRoot)));
  }

  return documents;
}

async function collectSharedDocuments(
  vaultRoot: string,
  projectId: string,
  projectRoot: string,
): Promise<IndexedDocument[]> {
  const sharedRoot = path.join(projectRoot, "shared");
  const documents: IndexedDocument[] = [];

  for (const filePath of await listJsonFiles(path.join(sharedRoot, "characters"))) {
    const item = await readJsonFile<Character>(vaultRoot, relativeVaultPath(vaultRoot, filePath));
    documents.push({
      id: `character:${projectId}:${item.id}`,
      type: "character",
      projectId,
      path: relativeVaultPath(vaultRoot, filePath),
      title: item.name,
      content: JSON.stringify(item),
      tags: tokenize("character", ...item.links, ...item.forbiddenWrites),
    });
  }

  for (const filePath of await listJsonFiles(path.join(sharedRoot, "worldbook"))) {
    const item = await readJsonFile<WorldbookEntry>(vaultRoot, relativeVaultPath(vaultRoot, filePath));
    documents.push({
      id: `worldbook:${projectId}:${item.id}`,
      type: "worldbook",
      projectId,
      path: relativeVaultPath(vaultRoot, filePath),
      title: item.title,
      content: JSON.stringify(item),
      tags: tokenize("worldbook", ...item.trigger.keywords, ...item.trigger.characters, ...item.trigger.places),
    });
  }

  for (const filePath of await listJsonFiles(path.join(sharedRoot, "relations"))) {
    const item = await readJsonFile<Relation>(vaultRoot, relativeVaultPath(vaultRoot, filePath));
    documents.push({
      id: `relation:${projectId}:${item.id}`,
      type: "relation",
      projectId,
      path: relativeVaultPath(vaultRoot, filePath),
      title: `${item.from}-${item.to}`,
      content: JSON.stringify(item),
      tags: tokenize("relation", item.from, item.to, item.type, item.stage),
    });
  }

  for (const filePath of await listJsonFiles(path.join(sharedRoot, "timeline"))) {
    const item = await readJsonFile<TimelineEvent>(vaultRoot, relativeVaultPath(vaultRoot, filePath));
    documents.push({
      id: `timeline:${projectId}:${item.id}`,
      type: "timeline",
      projectId,
      path: relativeVaultPath(vaultRoot, filePath),
      title: item.title,
      content: JSON.stringify(item),
      tags: tokenize("timeline", item.line, ...item.participants),
    });
  }

  return documents;
}

async function collectNovelDocuments(
  vaultRoot: string,
  projectId: string,
  projectRoot: string,
): Promise<IndexedDocument[]> {
  const novelsRoot = path.join(projectRoot, "novels");
  const novelEntries = await readdir(novelsRoot, { withFileTypes: true }).catch(() => []);
  const documents: IndexedDocument[] = [];

  for (const novelEntry of novelEntries) {
    if (!novelEntry.isDirectory()) {
      continue;
    }

    const novelId = novelEntry.name;
    const novelRoot = path.join(novelsRoot, novelId);

    for (const filePath of await listMarkdownFiles(path.join(novelRoot, "manuscripts"))) {
      const content = await readManuscriptFile(vaultRoot, relativeVaultPath(vaultRoot, filePath));
      const chapterId = path.basename(filePath, ".md");
      const title = await readChapterTitleForManuscript(vaultRoot, novelRoot, chapterId);
      documents.push({
        id: `manuscript:${projectId}:${novelId}:${chapterId}`,
        type: "manuscript",
        projectId,
        novelId,
        path: relativeVaultPath(vaultRoot, filePath),
        title,
        content,
        tags: tokenize("manuscript", novelId, chapterId, title),
      });
    }

    for (const filePath of await listJsonFiles(path.join(novelRoot, "metadata", "chapters"))) {
      const item = await readJsonFile<Chapter>(vaultRoot, relativeVaultPath(vaultRoot, filePath));
      documents.push({
        id: `chapter-metadata:${projectId}:${novelId}:${item.id}`,
        type: "chapter-metadata",
        projectId,
        novelId,
        path: relativeVaultPath(vaultRoot, filePath),
        title: item.title,
        content: JSON.stringify(item),
        tags: tokenize("chapter", item.status, ...item.involvedCharacters),
      });
    }

    for (const filePath of await listJsonFiles(path.join(novelRoot, "summaries"))) {
      const item = await readJsonFile<Summary>(vaultRoot, relativeVaultPath(vaultRoot, filePath));
      documents.push({
        id: `summary:${projectId}:${novelId}:${item.id}`,
        type: "summary",
        projectId,
        novelId,
        path: relativeVaultPath(vaultRoot, filePath),
        title: item.oneLine,
        content: JSON.stringify(item),
        tags: tokenize("summary", ...item.stateChanges),
      });
    }

    for (const filePath of await listJsonFiles(path.join(novelRoot, "states", "knowledge"))) {
      const item = await readJsonFile<KnowledgeItem>(vaultRoot, relativeVaultPath(vaultRoot, filePath));
      documents.push({
        id: `knowledge-item:${projectId}:${novelId}:${item.id}`,
        type: "knowledge-item",
        projectId,
        novelId,
        path: relativeVaultPath(vaultRoot, filePath),
        title: item.id,
        content: JSON.stringify(item),
        tags: tokenize(
          "knowledge-item",
          item.sourceChapter,
          item.spreadMethod,
          ...item.knownBy,
          ...item.unknownBy,
          item.secret ? "secret" : "public",
          item.affectsBehavior ? "affects-behavior" : undefined,
        ),
      });
    }

    for (const filePath of await listJsonFiles(path.join(novelRoot, "runs"))) {
      const item = await readJsonFile<RunRecord>(vaultRoot, relativeVaultPath(vaultRoot, filePath));
      documents.push({
        id: `run:${projectId}:${novelId}:${item.id}`,
        type: "run",
        projectId,
        novelId,
        path: relativeVaultPath(vaultRoot, filePath),
        title: item.id,
        content: JSON.stringify(item),
        tags: tokenize("run", item.status, item.workflowId),
      });
    }
  }

  return documents;
}

function calculateScore(
  document: Pick<IndexedDocument, "title" | "content" | "tags">,
  query: SearchQuery,
): number {
  let score = 0;
  const search = query.text?.trim().toLowerCase();

  if (search) {
    if (document.title.toLowerCase().includes(search)) {
      score += 3;
    }
    if (document.content.toLowerCase().includes(search)) {
      score += 2;
    }
  }

  if (query.tags && query.tags.length > 0) {
    for (const tag of query.tags) {
      if (document.tags.includes(tag)) {
        score += 1;
      }
    }
  }

  return score;
}
