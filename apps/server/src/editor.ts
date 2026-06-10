import path from "node:path";

import type { Annotation, Chapter, Lock } from "@shulingge/shared";
import { readJsonFile, readManuscriptFile, writeJsonFile } from "@shulingge/vault-core";

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
