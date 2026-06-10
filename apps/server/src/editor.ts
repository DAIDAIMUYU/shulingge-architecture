import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import type { Annotation, Chapter, Lock } from "@shulingge/shared";
import { readJsonFile, readManuscriptFile, resolveSafePath, writeJsonFile, writeManuscriptFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";
import { saveVersionedChapter } from "./versioning.js";

export interface EditorChapterRecord {
  chapterId: string;
  projectId: string;
  novelId: string;
  content: string;
  metadata: Chapter;
  annotations: Annotation[];
}

interface EditorChapterLocator {
  projectId: string;
  novelId: string;
  chapterId: string;
}

export interface ProjectSummary {
  projectId: string;
  title: string;
}

export interface CreatedProject extends ProjectSummary {
  defaultNovelId: string;
}

export interface NovelSummary {
  novelId: string;
  title: string;
}

export interface ChapterSummary {
  chapterId: string;
  title: string;
}

interface SaveChapterInput extends EditorChapterLocator {
  content: string;
}

interface SaveAnnotationsInput extends EditorChapterLocator {
  annotations: Annotation[];
}

interface SaveLocksInput extends EditorChapterLocator {
  locks: Lock[];
}

interface ChapterMetadataPatch {
  locks?: Lock[];
  annotationsRef?: string;
}

function getNovelRootPath(locator: EditorChapterLocator): string {
  return path.posix.join("projects", locator.projectId, "novels", locator.novelId);
}

function getNovelRootPathFor(projectId: string, novelId: string): string {
  return path.posix.join("projects", projectId, "novels", novelId);
}

function getProjectRelativePath(projectId: string): string {
  return path.posix.join("projects", projectId);
}

function assertProjectId(projectId: string | undefined): asserts projectId is string {
  if (!projectId) {
    throw createHttpError(400, "EDITOR_INVALID_PROJECT", "projectId is required");
  }
}

function assertNovelId(novelId: string | undefined): asserts novelId is string {
  if (!novelId) {
    throw createHttpError(400, "EDITOR_INVALID_NOVEL", "novelId is required");
  }
}

function assertTitle(title: unknown): asserts title is string {
  if (typeof title !== "string" || !title.trim()) {
    throw createHttpError(400, "EDITOR_INVALID_TITLE", "title is required");
  }
}

function isMissingDirectoryError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT");
}

async function listDirectoryNames(vaultRoot: string, relativePath: string): Promise<string[]> {
  try {
    const absolutePath = resolveSafePath(vaultRoot, relativePath);
    const entries = await readdir(absolutePath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (!isMissingDirectoryError(error)) {
      throw error;
    }
    return [];
  }
}

async function listMarkdownBaseNames(vaultRoot: string, relativePath: string): Promise<string[]> {
  try {
    const absolutePath = resolveSafePath(vaultRoot, relativePath);
    const entries = await readdir(absolutePath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name.slice(0, -3))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (!isMissingDirectoryError(error)) {
      throw error;
    }
    return [];
  }
}

async function readOptionalJson<T>(vaultRoot: string, relativePath: string): Promise<T | null> {
  try {
    return await readJsonFile<T>(vaultRoot, relativePath);
  } catch {
    return null;
  }
}

function readTitle(value: unknown, fallback: string): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const title = record.title ?? record.name;
    if (typeof title === "string" && title.trim()) {
      return title;
    }
  }
  return fallback;
}

function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "novel";
}

function nextNumberedId(prefix: string, existingIds: string[]): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const max = existingIds.reduce((current, id) => {
    const match = id.match(pattern);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

async function ensureNovelDirectories(vaultRoot: string, projectId: string, novelId: string): Promise<void> {
  const novelRoot = getNovelRootPathFor(projectId, novelId);
  const directories = [
    "manuscripts",
    "metadata/chapters",
    "summaries",
    "outline",
    "states",
    "runs",
    "snapshots",
    "diffs",
    "annotations",
    "publish",
  ];

  await Promise.all(
    directories.map((directory) => mkdir(resolveSafePath(vaultRoot, path.posix.join(novelRoot, directory)), { recursive: true })),
  );
}

function getManuscriptRelativePath(locator: EditorChapterLocator): string {
  return path.posix.join(getNovelRootPath(locator), "manuscripts", `${locator.chapterId}.md`);
}

function getMetadataRelativePath(locator: EditorChapterLocator): string {
  return path.posix.join(getNovelRootPath(locator), "metadata/chapters", `${locator.chapterId}.json`);
}

function getAnnotationsRelativePath(locator: EditorChapterLocator): string {
  return path.posix.join(getNovelRootPath(locator), "annotations", `${locator.chapterId}.json`);
}

function countWords(content: string): number {
  const normalized = content.trim();
  if (!normalized) {
    return 0;
  }

  const cjkPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
  const cjkCharacters = normalized.match(cjkPattern)?.length ?? 0;
  const latinWords = normalized
    .replace(cjkPattern, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean).length;

  return cjkCharacters + latinWords;
}

function createDefaultMetadata(locator: EditorChapterLocator, manuscriptPath: string): Chapter {
  const now = new Date().toISOString();
  return {
    id: locator.chapterId,
    novelId: locator.novelId,
    title: locator.chapterId,
    order: 0,
    manuscriptPath,
    status: "drafting",
    wordCount: 0,
    involvedCharacters: [],
    locks: [],
    annotationsRef: undefined,
    finalizedAt: null,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function createChapterMetadata(locator: EditorChapterLocator, title: string, order: number): Chapter {
  const now = new Date().toISOString();
  const manuscriptPath = getManuscriptRelativePath(locator);
  return {
    id: locator.chapterId,
    novelId: locator.novelId,
    title,
    order,
    manuscriptPath,
    status: "drafting",
    wordCount: 0,
    involvedCharacters: [],
    locks: [],
    annotationsRef: getAnnotationsRelativePath(locator),
    finalizedAt: null,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

async function readChapterMetadata(
  vaultRoot: string,
  locator: EditorChapterLocator,
): Promise<Chapter> {
  const manuscriptPath = getManuscriptRelativePath(locator);
  const metadataPath = getMetadataRelativePath(locator);

  try {
    return await readJsonFile<Chapter>(vaultRoot, metadataPath);
  } catch {
    return createDefaultMetadata(locator, manuscriptPath);
  }
}

async function readChapterAnnotations(
  vaultRoot: string,
  locator: EditorChapterLocator,
): Promise<Annotation[]> {
  const annotationsPath = getAnnotationsRelativePath(locator);

  try {
    return await readJsonFile<Annotation[]>(vaultRoot, annotationsPath);
  } catch {
    return [];
  }
}

async function writeChapterMetadata(
  vaultRoot: string,
  locator: EditorChapterLocator,
  content: string,
  patch: ChapterMetadataPatch = {},
): Promise<Chapter> {
  const metadataPath = getMetadataRelativePath(locator);
  const existing = await readChapterMetadata(vaultRoot, locator);
  const next: Chapter = {
    ...existing,
    novelId: locator.novelId,
    manuscriptPath: getManuscriptRelativePath(locator),
    wordCount: countWords(content),
    locks: patch.locks ?? existing.locks,
    annotationsRef: patch.annotationsRef ?? existing.annotationsRef,
    updatedAt: new Date().toISOString(),
  };

  await writeJsonFile(vaultRoot, metadataPath, next);
  return next;
}

function assertLocator(locator: Partial<EditorChapterLocator>): asserts locator is EditorChapterLocator {
  if (!locator.projectId || !locator.novelId || !locator.chapterId) {
    throw createHttpError(
      400,
      "EDITOR_INVALID_CHAPTER_LOCATOR",
      "projectId, novelId, and chapterId are required",
    );
  }
}

export async function loadEditorChapter(
  vaultRoot: string,
  locator: EditorChapterLocator,
): Promise<EditorChapterRecord> {
  const manuscriptPath = getManuscriptRelativePath(locator);
  const [content, metadata, annotations] = await Promise.all([
    readManuscriptFile(vaultRoot, manuscriptPath),
    readChapterMetadata(vaultRoot, locator),
    readChapterAnnotations(vaultRoot, locator),
  ]);

  return {
    chapterId: locator.chapterId,
    projectId: locator.projectId,
    novelId: locator.novelId,
    content,
    metadata,
    annotations,
  };
}

export async function listProjects(vaultRoot: string): Promise<ProjectSummary[]> {
  const projectIds = await listDirectoryNames(vaultRoot, "projects");
  return await Promise.all(
    projectIds.map(async (projectId) => {
      const metadata =
        (await readOptionalJson<unknown>(vaultRoot, path.posix.join("projects", projectId, "project.json"))) ??
        (await readOptionalJson<unknown>(vaultRoot, path.posix.join("projects", projectId, "series.json")));
      return {
        projectId,
        title: readTitle(metadata, projectId),
      };
    }),
  );
}

export async function createProject(vaultRoot: string, input: { title: string }): Promise<CreatedProject> {
  assertTitle(input.title);

  const title = input.title.trim();
  const existingIds = await listDirectoryNames(vaultRoot, "projects");
  const baseId = slugifyTitle(title) || "project";
  let projectId = baseId;
  if (existingIds.includes(projectId)) {
    projectId = nextNumberedId(baseId, existingIds);
  }
  const defaultNovelId = "main";

  const projectRoot = getProjectRelativePath(projectId);
  await mkdir(resolveSafePath(vaultRoot, projectRoot), { recursive: true });
  await ensureNovelDirectories(vaultRoot, projectId, defaultNovelId);
  await writeJsonFile(vaultRoot, path.posix.join(projectRoot, "project.json"), {
    id: projectId,
    projectId,
    title,
    defaultNovelId,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await writeJsonFile(vaultRoot, path.posix.join(projectRoot, "series.json"), {
    id: projectId,
    name: title,
    title,
    type: "original",
    defaultNovelId,
    sharedPath: "shared",
    readPolicyPath: "shared/read-policy.json",
    schemaVersion: 1,
  });
  await writeJsonFile(vaultRoot, path.posix.join(getNovelRootPathFor(projectId, defaultNovelId), "novel.json"), {
    id: defaultNovelId,
    name: "未分卷",
    title: "未分卷",
    projectId,
    branchType: "main",
    excludedSharedFiles: [],
    writingFreedom: "medium",
    defaultWriteScope: "scene",
    schemaVersion: 1,
  });

  return {
    projectId,
    title,
    defaultNovelId,
  };
}

export async function listNovels(vaultRoot: string, projectId: string): Promise<NovelSummary[]> {
  assertProjectId(projectId);
  const novelIds = await listDirectoryNames(vaultRoot, path.posix.join(getProjectRelativePath(projectId), "novels"));
  return await Promise.all(
    novelIds.map(async (novelId) => {
      const metadata = await readOptionalJson<unknown>(
        vaultRoot,
        path.posix.join(getNovelRootPathFor(projectId, novelId), "novel.json"),
      );
      return {
        novelId,
        title: readTitle(metadata, novelId),
      };
    }),
  );
}

export async function listChapters(vaultRoot: string, projectId: string, novelId: string): Promise<ChapterSummary[]> {
  assertProjectId(projectId);
  assertNovelId(novelId);
  const manuscriptRoot = path.posix.join(getNovelRootPathFor(projectId, novelId), "manuscripts");
  const chapterIds = await listMarkdownBaseNames(vaultRoot, manuscriptRoot);
  return await Promise.all(
    chapterIds.map(async (chapterId) => {
      const metadata = await readOptionalJson<Chapter>(
        vaultRoot,
        path.posix.join(getNovelRootPathFor(projectId, novelId), "metadata/chapters", `${chapterId}.json`),
      );
      return {
        chapterId,
        title: readTitle(metadata, chapterId),
      };
    }),
  );
}

export async function createChapter(
  vaultRoot: string,
  input: { projectId: string; novelId: string; title: string },
): Promise<ChapterSummary> {
  assertProjectId(input.projectId);
  assertNovelId(input.novelId);
  assertTitle(input.title);

  await ensureNovelDirectories(vaultRoot, input.projectId, input.novelId);
  const existingIds = await listMarkdownBaseNames(
    vaultRoot,
    path.posix.join(getNovelRootPathFor(input.projectId, input.novelId), "manuscripts"),
  );
  const chapterId = nextNumberedId("chapter", existingIds);
  const locator = {
    projectId: input.projectId,
    novelId: input.novelId,
    chapterId,
  };
  const title = input.title.trim();

  await writeManuscriptFile(vaultRoot, getManuscriptRelativePath(locator), "");
  await writeJsonFile(vaultRoot, getMetadataRelativePath(locator), createChapterMetadata(locator, title, existingIds.length + 1));

  return {
    chapterId,
    title,
  };
}

export async function renameChapter(
  vaultRoot: string,
  input: { projectId: string; novelId: string; chapterId: string; title: string },
): Promise<ChapterSummary> {
  assertLocator(input);
  assertTitle(input.title);

  const title = input.title.trim();
  const metadata = await readChapterMetadata(vaultRoot, input);
  await writeJsonFile(vaultRoot, getMetadataRelativePath(input), {
    ...metadata,
    title,
    updatedAt: new Date().toISOString(),
  });

  return {
    chapterId: input.chapterId,
    title,
  };
}

export async function deleteChapter(
  vaultRoot: string,
  input: { projectId: string; novelId: string; chapterId: string },
): Promise<{ ok: true }> {
  assertLocator(input);

  await Promise.all(
    [
      getManuscriptRelativePath(input),
      getMetadataRelativePath(input),
      getAnnotationsRelativePath(input),
    ].map((relativePath) => rm(resolveSafePath(vaultRoot, relativePath), { force: true })),
  );

  return { ok: true };
}

export async function createNovel(
  vaultRoot: string,
  input: { projectId: string; title: string },
): Promise<NovelSummary> {
  assertProjectId(input.projectId);
  assertTitle(input.title);

  const existingIds = await listDirectoryNames(vaultRoot, path.posix.join(getProjectRelativePath(input.projectId), "novels"));
  const baseId = slugifyTitle(input.title);
  let novelId = baseId;
  if (existingIds.includes(novelId)) {
    novelId = nextNumberedId(baseId, existingIds);
  }
  const title = input.title.trim();

  await ensureNovelDirectories(vaultRoot, input.projectId, novelId);
  await writeJsonFile(vaultRoot, path.posix.join(getNovelRootPathFor(input.projectId, novelId), "novel.json"), {
    id: novelId,
    name: title,
    title,
    projectId: input.projectId,
    branchType: "main",
    excludedSharedFiles: [],
    writingFreedom: "medium",
    defaultWriteScope: "scene",
    schemaVersion: 1,
  });

  return {
    novelId,
    title,
  };
}

export async function renameNovel(
  vaultRoot: string,
  input: { projectId: string; novelId: string; title: string },
): Promise<NovelSummary> {
  assertProjectId(input.projectId);
  assertNovelId(input.novelId);
  assertTitle(input.title);

  const title = input.title.trim();
  const novelPath = path.posix.join(getNovelRootPathFor(input.projectId, input.novelId), "novel.json");
  const metadata = await readOptionalJson<Record<string, unknown>>(vaultRoot, novelPath);
  await writeJsonFile(vaultRoot, novelPath, {
    ...(metadata ?? {}),
    id: input.novelId,
    novelId: input.novelId,
    projectId: input.projectId,
    title,
    name: title,
    updatedAt: new Date().toISOString(),
  });

  return {
    novelId: input.novelId,
    title,
  };
}

export async function deleteNovel(
  vaultRoot: string,
  input: { projectId: string; novelId: string },
): Promise<{ ok: true }> {
  assertProjectId(input.projectId);
  assertNovelId(input.novelId);
  if (input.novelId === "main") {
    throw createHttpError(400, "EDITOR_DEFAULT_NOVEL_DELETE_FORBIDDEN", "散章区不可删除");
  }

  await rm(resolveSafePath(vaultRoot, getNovelRootPathFor(input.projectId, input.novelId)), {
    recursive: true,
    force: true,
  });

  return { ok: true };
}

export async function saveEditorChapter(
  vaultRoot: string,
  input: SaveChapterInput,
): Promise<EditorChapterRecord> {
  assertLocator(input);
  if (typeof input.content !== "string") {
    throw createHttpError(400, "EDITOR_INVALID_CONTENT", "content must be a string");
  }

  try {
    await saveVersionedChapter(vaultRoot, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid manuscript content";
    if (typeof message === "string" && message.includes("Unlock it before editing again")) {
      throw createHttpError(409, "EDITOR_CHAPTER_FINALIZED", message);
    }
    throw createHttpError(400, "EDITOR_INVALID_MANUSCRIPT", message);
  }

  const annotationsPath = getAnnotationsRelativePath(input);
  const metadata = await writeChapterMetadata(vaultRoot, input, input.content, {
    annotationsRef: annotationsPath,
  });
  const annotations = await readChapterAnnotations(vaultRoot, input);

  return {
    chapterId: input.chapterId,
    projectId: input.projectId,
    novelId: input.novelId,
    content: input.content,
    metadata,
    annotations,
  };
}

export async function saveEditorAnnotations(
  vaultRoot: string,
  input: SaveAnnotationsInput,
): Promise<Annotation[]> {
  assertLocator(input);
  if (!Array.isArray(input.annotations)) {
    throw createHttpError(400, "EDITOR_INVALID_ANNOTATIONS", "annotations must be an array");
  }

  const annotationsPath = getAnnotationsRelativePath(input);
  await writeJsonFile(vaultRoot, annotationsPath, input.annotations);
  await writeChapterMetadata(vaultRoot, input, await readManuscriptFile(vaultRoot, getManuscriptRelativePath(input)), {
    annotationsRef: annotationsPath,
  });

  return input.annotations;
}

export async function saveEditorLocks(vaultRoot: string, input: SaveLocksInput): Promise<Lock[]> {
  assertLocator(input);
  if (!Array.isArray(input.locks)) {
    throw createHttpError(400, "EDITOR_INVALID_LOCKS", "locks must be an array");
  }

  const content = await readManuscriptFile(vaultRoot, getManuscriptRelativePath(input));
  await writeChapterMetadata(vaultRoot, input, content, {
    locks: input.locks,
    annotationsRef: getAnnotationsRelativePath(input),
  });

  return input.locks;
}
