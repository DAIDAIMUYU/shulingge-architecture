import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { CHAPTER_STATUS_VALUES, type Annotation, type Chapter, type ChapterPlan, type ChapterStatus, type Lock, type Volume } from "@shulingge/shared";
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

export interface ChapterSummary {
  chapterId: string;
  title: string;
  status: ChapterStatus;
  wordCount: number;
}

export type VolumeStatus = NonNullable<Volume["status"]>;

export interface VolumeInput {
  title?: unknown;
  status?: unknown;
  positioning?: unknown;
  themes?: unknown;
  keyPoints?: unknown;
  notes?: unknown;
}

export interface ChapterPlanInput {
  title?: unknown;
  volumeId?: unknown;
  summary?: unknown;
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

function getVolumesRootPath(projectId: string, novelId: string): string {
  return path.posix.join(getNovelRootPathFor(projectId, novelId), "volumes");
}

function getVolumeRelativePath(projectId: string, novelId: string, volumeId: string): string {
  return path.posix.join(getVolumesRootPath(projectId, novelId), `${volumeId}.json`);
}

function getChapterPlansRootPath(projectId: string, novelId: string): string {
  return path.posix.join(getNovelRootPathFor(projectId, novelId), "chapter-plans");
}

function getChapterPlanRelativePath(projectId: string, novelId: string, chapterPlanId: string): string {
  return path.posix.join(getChapterPlansRootPath(projectId, novelId), `${chapterPlanId}.json`);
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

function assertVolumeId(volumeId: string | undefined): asserts volumeId is string {
  if (!volumeId) {
    throw createHttpError(400, "EDITOR_INVALID_VOLUME", "volumeId is required");
  }
}

function assertChapterPlanId(chapterPlanId: string | undefined): asserts chapterPlanId is string {
  if (!chapterPlanId) {
    throw createHttpError(400, "EDITOR_INVALID_CHAPTER_PLAN", "chapterPlanId is required");
  }
}

function assertTitle(title: unknown): asserts title is string {
  if (typeof title !== "string" || !title.trim()) {
    throw createHttpError(400, "EDITOR_INVALID_TITLE", "title is required");
  }
}

const PROJECT_COVER_MAX_BYTES = 5 * 1024 * 1024;
const PROJECT_COVER_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const VOLUME_STATUS_VALUES: VolumeStatus[] = ["draft", "finalized"];

function assertChapterStatus(status: unknown): asserts status is ChapterStatus {
  if (typeof status !== "string" || !CHAPTER_STATUS_VALUES.includes(status as ChapterStatus)) {
    throw createHttpError(400, "EDITOR_INVALID_STATUS", "章节状态无效");
  }
}

function assertVolumeStatus(status: unknown): asserts status is VolumeStatus {
  if (typeof status !== "string" || !VOLUME_STATUS_VALUES.includes(status as VolumeStatus)) {
    throw createHttpError(400, "EDITOR_INVALID_VOLUME_STATUS", "分卷状态无效");
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

async function listJsonBaseNames(vaultRoot: string, relativePath: string): Promise<string[]> {
  try {
    const absolutePath = resolveSafePath(vaultRoot, relativePath);
    const entries = await readdir(absolutePath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.slice(0, -5))
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

function readStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

function mimeTypeFromImageName(fileName: string): string | undefined {
  return PROJECT_COVER_TYPES[path.extname(fileName).toLowerCase()];
}

async function readProjectCoverDataUrl(vaultRoot: string, coverImage: string | undefined): Promise<string | undefined> {
  if (!coverImage) {
    return undefined;
  }
  const mimeType = mimeTypeFromImageName(coverImage);
  if (!mimeType) {
    return undefined;
  }
  try {
    const buffer = await readFile(resolveSafePath(vaultRoot, coverImage));
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
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
      const coverImage = readStringField(metadata, "coverImage");
      return {
        projectId,
        title: readTitle(metadata, projectId),
        coverImage,
        coverDataUrl: await readProjectCoverDataUrl(vaultRoot, coverImage),
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

function readOptionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeVolumePayload(input: VolumeInput, current?: Volume): Omit<Volume, "id" | "novelId" | "order" | "schemaVersion" | "createdAt" | "updatedAt"> {
  if (!current || input.title !== undefined) {
    assertTitle(input.title);
  }
  if (input.status !== undefined) {
    assertVolumeStatus(input.status);
  }

  return {
    title: input.title !== undefined ? String(input.title).trim() : current?.title ?? "",
    status: input.status !== undefined ? input.status : current?.status ?? "draft",
    positioning: input.positioning !== undefined ? readOptionalText(input.positioning) : current?.positioning ?? "",
    themes: input.themes !== undefined ? readOptionalText(input.themes) : current?.themes ?? "",
    keyPoints: input.keyPoints !== undefined ? readOptionalText(input.keyPoints) : current?.keyPoints ?? "",
    notes: input.notes !== undefined ? readOptionalText(input.notes) : current?.notes ?? "",
  };
}

function normalizeChapterPlanPayload(input: ChapterPlanInput, current?: ChapterPlan): Pick<ChapterPlan, "title" | "summary" | "volumeId"> {
  if (!current || input.title !== undefined) {
    assertTitle(input.title);
  }
  let volumeId = current?.volumeId;
  if (input.volumeId !== undefined) {
    if (input.volumeId === null) {
      volumeId = undefined;
    } else if (typeof input.volumeId === "string") {
      volumeId = input.volumeId.trim() || undefined;
    } else {
      throw createHttpError(400, "EDITOR_INVALID_VOLUME", "volumeId is invalid");
    }
  }

  return {
    title: input.title !== undefined ? String(input.title).trim() : current?.title ?? "",
    summary: input.summary !== undefined ? readOptionalText(input.summary) : current?.summary ?? "",
    volumeId,
  };
}

async function ensureNovelExists(vaultRoot: string, projectId: string, novelId: string): Promise<void> {
  const novelPath = path.posix.join(getNovelRootPathFor(projectId, novelId), "novel.json");
  const metadata = await readOptionalJson<unknown>(vaultRoot, novelPath);
  if (!metadata) {
    throw createHttpError(404, "EDITOR_NOVEL_NOT_FOUND", "小说不存在");
  }
}

async function readVolume(vaultRoot: string, projectId: string, novelId: string, volumeId: string): Promise<Volume> {
  const volume = await readOptionalJson<Volume>(vaultRoot, getVolumeRelativePath(projectId, novelId, volumeId));
  if (!volume) {
    throw createHttpError(404, "EDITOR_VOLUME_NOT_FOUND", "分卷不存在");
  }
  return volume;
}

async function readChapterPlan(vaultRoot: string, projectId: string, novelId: string, chapterPlanId: string): Promise<ChapterPlan> {
  const chapterPlan = await readOptionalJson<ChapterPlan>(vaultRoot, getChapterPlanRelativePath(projectId, novelId, chapterPlanId));
  if (!chapterPlan) {
    throw createHttpError(404, "EDITOR_CHAPTER_PLAN_NOT_FOUND", "chapter plan not found");
  }
  return chapterPlan;
}

export async function listVolumes(vaultRoot: string, projectId: string, novelId: string): Promise<Volume[]> {
  assertProjectId(projectId);
  assertNovelId(novelId);
  await ensureNovelExists(vaultRoot, projectId, novelId);
  const volumeIds = await listJsonBaseNames(vaultRoot, getVolumesRootPath(projectId, novelId));
  const volumes = await Promise.all(volumeIds.map((volumeId) => readVolume(vaultRoot, projectId, novelId, volumeId).catch(() => null)));
  return volumes
    .filter((volume): volume is Volume => Boolean(volume))
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
}

export async function createVolume(vaultRoot: string, projectId: string, novelId: string, input: VolumeInput): Promise<Volume> {
  assertProjectId(projectId);
  assertNovelId(novelId);
  await ensureNovelExists(vaultRoot, projectId, novelId);
  const payload = normalizeVolumePayload(input);
  const existingVolumes = await listVolumes(vaultRoot, projectId, novelId);
  const existingIds = existingVolumes.map((volume) => volume.id);
  const baseId = slugifyTitle(payload.title) || "volume";
  const volumeId = existingIds.includes(baseId) ? nextNumberedId(baseId, existingIds) : baseId;
  const now = new Date().toISOString();
  const volume: Volume = {
    id: volumeId,
    novelId,
    order: existingVolumes.length,
    ...payload,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };

  await mkdir(resolveSafePath(vaultRoot, getVolumesRootPath(projectId, novelId)), { recursive: true });
  await writeJsonFile(vaultRoot, getVolumeRelativePath(projectId, novelId, volumeId), volume);
  return volume;
}

export async function updateVolume(
  vaultRoot: string,
  projectId: string,
  novelId: string,
  volumeId: string,
  input: VolumeInput,
): Promise<Volume> {
  assertProjectId(projectId);
  assertNovelId(novelId);
  assertVolumeId(volumeId);
  const current = await readVolume(vaultRoot, projectId, novelId, volumeId);
  const payload = normalizeVolumePayload(input, current);
  const next: Volume = {
    ...current,
    ...payload,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(vaultRoot, getVolumeRelativePath(projectId, novelId, volumeId), next);
  return next;
}

export async function deleteVolume(vaultRoot: string, projectId: string, novelId: string, volumeId: string): Promise<{ id: string; deleted: true }> {
  assertProjectId(projectId);
  assertNovelId(novelId);
  assertVolumeId(volumeId);
  await rm(resolveSafePath(vaultRoot, getVolumeRelativePath(projectId, novelId, volumeId)), { force: true });
  const remaining = await listVolumes(vaultRoot, projectId, novelId);
  await Promise.all(remaining.map((volume, index) => {
    const next = { ...volume, order: index, updatedAt: new Date().toISOString() };
    return writeJsonFile(vaultRoot, getVolumeRelativePath(projectId, novelId, volume.id), next);
  }));
  return { id: volumeId, deleted: true };
}

export async function reorderVolumes(vaultRoot: string, projectId: string, novelId: string, orderedIds: unknown): Promise<Volume[]> {
  assertProjectId(projectId);
  assertNovelId(novelId);
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
    throw createHttpError(400, "EDITOR_INVALID_VOLUME_ORDER", "orderedIds is required");
  }
  const volumes = await listVolumes(vaultRoot, projectId, novelId);
  const knownIds = new Set(volumes.map((volume) => volume.id));
  const requestedIds = orderedIds as string[];
  if (requestedIds.some((id) => !knownIds.has(id))) {
    throw createHttpError(400, "EDITOR_INVALID_VOLUME_ORDER", "分卷排序包含不存在的分卷");
  }
  const finalOrder = [...requestedIds, ...volumes.map((volume) => volume.id).filter((id) => !requestedIds.includes(id))];
  const byId = new Map(volumes.map((volume) => [volume.id, volume]));
  await Promise.all(finalOrder.map((id, index) => {
    const volume = byId.get(id);
    if (!volume) {
      return Promise.resolve();
    }
    return writeJsonFile(vaultRoot, getVolumeRelativePath(projectId, novelId, id), {
      ...volume,
      order: index,
      updatedAt: new Date().toISOString(),
    });
  }));
  return await listVolumes(vaultRoot, projectId, novelId);
}

export async function listChapterPlans(vaultRoot: string, projectId: string, novelId: string): Promise<ChapterPlan[]> {
  assertProjectId(projectId);
  assertNovelId(novelId);
  await ensureNovelExists(vaultRoot, projectId, novelId);
  const chapterPlanIds = await listJsonBaseNames(vaultRoot, getChapterPlansRootPath(projectId, novelId));
  const chapterPlans = await Promise.all(
    chapterPlanIds.map((chapterPlanId) => readChapterPlan(vaultRoot, projectId, novelId, chapterPlanId).catch(() => null)),
  );
  return chapterPlans
    .filter((chapterPlan): chapterPlan is ChapterPlan => Boolean(chapterPlan))
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
}

export async function createChapterPlan(vaultRoot: string, projectId: string, novelId: string, input: ChapterPlanInput): Promise<ChapterPlan> {
  assertProjectId(projectId);
  assertNovelId(novelId);
  await ensureNovelExists(vaultRoot, projectId, novelId);
  const payload = normalizeChapterPlanPayload(input);
  if (payload.volumeId) {
    await readVolume(vaultRoot, projectId, novelId, payload.volumeId);
  }
  const existingChapterPlans = await listChapterPlans(vaultRoot, projectId, novelId);
  const existingIds = existingChapterPlans.map((chapterPlan) => chapterPlan.id);
  const baseId = slugifyTitle(payload.title) || "chapter-plan";
  const chapterPlanId = existingIds.includes(baseId) ? nextNumberedId(baseId, existingIds) : baseId;
  const now = new Date().toISOString();
  const chapterPlan: ChapterPlan = {
    id: chapterPlanId,
    projectId,
    novelId,
    order: existingChapterPlans.length,
    title: payload.title,
    summary: payload.summary,
    ...(payload.volumeId ? { volumeId: payload.volumeId } : {}),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };

  await mkdir(resolveSafePath(vaultRoot, getChapterPlansRootPath(projectId, novelId)), { recursive: true });
  await writeJsonFile(vaultRoot, getChapterPlanRelativePath(projectId, novelId, chapterPlanId), chapterPlan);
  return chapterPlan;
}

export async function updateChapterPlan(
  vaultRoot: string,
  projectId: string,
  novelId: string,
  chapterPlanId: string,
  input: ChapterPlanInput,
): Promise<ChapterPlan> {
  assertProjectId(projectId);
  assertNovelId(novelId);
  assertChapterPlanId(chapterPlanId);
  const current = await readChapterPlan(vaultRoot, projectId, novelId, chapterPlanId);
  const payload = normalizeChapterPlanPayload(input, current);
  if (payload.volumeId) {
    await readVolume(vaultRoot, projectId, novelId, payload.volumeId);
  }
  const next: ChapterPlan = {
    ...current,
    title: payload.title,
    summary: payload.summary,
    updatedAt: new Date().toISOString(),
  };
  if (payload.volumeId) {
    next.volumeId = payload.volumeId;
  } else {
    delete next.volumeId;
  }
  await writeJsonFile(vaultRoot, getChapterPlanRelativePath(projectId, novelId, chapterPlanId), next);
  return next;
}

export async function deleteChapterPlan(
  vaultRoot: string,
  projectId: string,
  novelId: string,
  chapterPlanId: string,
): Promise<{ id: string; deleted: true }> {
  assertProjectId(projectId);
  assertNovelId(novelId);
  assertChapterPlanId(chapterPlanId);
  await rm(resolveSafePath(vaultRoot, getChapterPlanRelativePath(projectId, novelId, chapterPlanId)), { force: true });
  const remaining = await listChapterPlans(vaultRoot, projectId, novelId);
  await Promise.all(remaining.map((chapterPlan, index) => {
    const next = { ...chapterPlan, order: index, updatedAt: new Date().toISOString() };
    return writeJsonFile(vaultRoot, getChapterPlanRelativePath(projectId, novelId, chapterPlan.id), next);
  }));
  return { id: chapterPlanId, deleted: true };
}

export async function reorderChapterPlans(vaultRoot: string, projectId: string, novelId: string, orderedIds: unknown): Promise<ChapterPlan[]> {
  assertProjectId(projectId);
  assertNovelId(novelId);
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
    throw createHttpError(400, "EDITOR_INVALID_CHAPTER_PLAN_ORDER", "orderedIds is required");
  }
  const chapterPlans = await listChapterPlans(vaultRoot, projectId, novelId);
  const knownIds = new Set(chapterPlans.map((chapterPlan) => chapterPlan.id));
  const requestedIds = orderedIds as string[];
  if (requestedIds.some((id) => !knownIds.has(id))) {
    throw createHttpError(400, "EDITOR_INVALID_CHAPTER_PLAN_ORDER", "chapter plan order contains unknown id");
  }
  const finalOrder = [...requestedIds, ...chapterPlans.map((chapterPlan) => chapterPlan.id).filter((id) => !requestedIds.includes(id))];
  const byId = new Map(chapterPlans.map((chapterPlan) => [chapterPlan.id, chapterPlan]));
  await Promise.all(finalOrder.map((id, index) => {
    const chapterPlan = byId.get(id);
    if (!chapterPlan) {
      return Promise.resolve();
    }
    return writeJsonFile(vaultRoot, getChapterPlanRelativePath(projectId, novelId, id), {
      ...chapterPlan,
      order: index,
      updatedAt: new Date().toISOString(),
    });
  }));
  return await listChapterPlans(vaultRoot, projectId, novelId);
}

export async function updateProjectCover(vaultRoot: string, projectId: string, input: unknown): Promise<ProjectSummary> {
  assertProjectId(projectId);
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const fileName = typeof record.fileName === "string" ? record.fileName.trim() : "";
  const contentBase64 = typeof record.contentBase64 === "string" ? record.contentBase64.trim() : "";
  const extension = path.extname(fileName).toLowerCase();
  const mimeType = mimeTypeFromImageName(fileName);

  if (!mimeType || !PROJECT_COVER_TYPES[extension]) {
    throw createHttpError(400, "PROJECT_COVER_INVALID_TYPE", "仅支持 jpg、png、webp 封面图片");
  }
  if (!contentBase64) {
    throw createHttpError(400, "PROJECT_COVER_EMPTY", "封面图片内容不能为空");
  }

  const buffer = Buffer.from(contentBase64, "base64");
  if (!buffer.length || buffer.length > PROJECT_COVER_MAX_BYTES) {
    throw createHttpError(400, "PROJECT_COVER_TOO_LARGE", "封面图片需小于 5MB");
  }

  const projectRoot = getProjectRelativePath(projectId);
  const projectMetadataPath = path.posix.join(projectRoot, "project.json");
  const metadata = await readOptionalJson<Record<string, unknown>>(vaultRoot, projectMetadataPath);
  if (!metadata) {
    throw createHttpError(404, "PROJECT_NOT_FOUND", "项目不存在");
  }

  const coverFileName = `cover${extension === ".jpeg" ? ".jpg" : extension}`;
  const coverImage = path.posix.join(projectRoot, "assets", coverFileName);
  const coverPath = resolveSafePath(vaultRoot, coverImage);
  await mkdir(path.dirname(coverPath), { recursive: true });
  await writeFile(coverPath, buffer);

  const nextMetadata = {
    ...metadata,
    coverImage,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(vaultRoot, projectMetadataPath, nextMetadata);

  return {
    projectId,
    title: readTitle(nextMetadata, projectId),
    coverImage,
    coverDataUrl: await readProjectCoverDataUrl(vaultRoot, coverImage),
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
        status: metadata?.status ?? "drafting",
        wordCount: metadata?.wordCount ?? 0,
      };
    }),
  );
}

export async function createChapter(
  vaultRoot: string,
  input: { projectId: string; novelId: string; title: string; volumeId?: unknown },
): Promise<ChapterSummary> {
  assertProjectId(input.projectId);
  assertNovelId(input.novelId);
  assertTitle(input.title);
  if (input.volumeId !== undefined && (typeof input.volumeId !== "string" || !input.volumeId.trim())) {
    throw createHttpError(400, "EDITOR_INVALID_VOLUME", "volumeId is invalid");
  }
  const volumeId = typeof input.volumeId === "string" && input.volumeId.trim() ? input.volumeId.trim() : undefined;
  if (volumeId) {
    await readVolume(vaultRoot, input.projectId, input.novelId, volumeId);
  }

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
  await writeJsonFile(vaultRoot, getMetadataRelativePath(locator), {
    ...createChapterMetadata(locator, title, existingIds.length + 1),
    volumeId,
  });

  return {
    chapterId,
    title,
    status: "drafting",
    wordCount: 0,
  };
}

export async function renameChapter(
  vaultRoot: string,
  input: { projectId: string; novelId: string; chapterId: string; title?: unknown; status?: unknown },
): Promise<ChapterSummary> {
  assertLocator(input);
  if (input.title !== undefined) {
    assertTitle(input.title);
  }
  if (input.status !== undefined) {
    assertChapterStatus(input.status);
  }
  const metadata = await readChapterMetadata(vaultRoot, input);
  const title = typeof input.title === "string" ? input.title.trim() : metadata.title;
  const status = input.status !== undefined ? input.status : metadata.status;
  await writeJsonFile(vaultRoot, getMetadataRelativePath(input), {
    ...metadata,
    title,
    status,
    updatedAt: new Date().toISOString(),
  });

  return {
    chapterId: input.chapterId,
    title,
    status,
    wordCount: metadata.wordCount ?? 0,
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

export async function moveChapter(
  vaultRoot: string,
  input: { projectId: string; novelId: string; chapterId: string; targetNovelId: string },
): Promise<{ chapterId: string; novelId: string }> {
  assertLocator(input);
  assertNovelId(input.targetNovelId);

  if (input.targetNovelId === input.novelId) {
    return {
      chapterId: input.chapterId,
      novelId: input.targetNovelId,
    };
  }

  const targetNovelPath = path.posix.join(getNovelRootPathFor(input.projectId, input.targetNovelId), "novel.json");
  const targetNovel = await readOptionalJson<unknown>(vaultRoot, targetNovelPath);
  if (!targetNovel) {
    throw createHttpError(400, "EDITOR_TARGET_NOVEL_NOT_FOUND", "目标卷不存在");
  }

  const sourceLocator = {
    projectId: input.projectId,
    novelId: input.novelId,
    chapterId: input.chapterId,
  };
  const targetLocator = {
    projectId: input.projectId,
    novelId: input.targetNovelId,
    chapterId: input.chapterId,
  };
  const [content, metadata, annotations] = await Promise.all([
    readManuscriptFile(vaultRoot, getManuscriptRelativePath(sourceLocator)).catch(() => ""),
    readChapterMetadata(vaultRoot, sourceLocator),
    readChapterAnnotations(vaultRoot, sourceLocator),
  ]);

  await ensureNovelDirectories(vaultRoot, input.projectId, input.targetNovelId);
  await writeManuscriptFile(vaultRoot, getManuscriptRelativePath(targetLocator), content);
  await writeJsonFile(vaultRoot, getMetadataRelativePath(targetLocator), {
    ...metadata,
    novelId: input.targetNovelId,
    manuscriptPath: getManuscriptRelativePath(targetLocator),
    annotationsRef: getAnnotationsRelativePath(targetLocator),
    updatedAt: new Date().toISOString(),
  });
  await writeJsonFile(vaultRoot, getAnnotationsRelativePath(targetLocator), annotations);
  await deleteChapter(vaultRoot, sourceLocator);

  return {
    chapterId: input.chapterId,
    novelId: input.targetNovelId,
  };
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
