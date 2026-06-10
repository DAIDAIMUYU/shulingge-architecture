import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import git from "isomorphic-git";

import {
  CURRENT_SCHEMA_VERSION,
  type Chapter,
  type DiffRecord,
  type Lock,
  type Snapshot,
  type SnapshotReason,
  type TextRange,
} from "@shulingge/shared";
import {
  readJsonFile,
  readManuscriptFile,
  writeJsonFile,
  writeManuscriptFile,
} from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

interface ChapterLocator {
  projectId: string;
  novelId: string;
  chapterId: string;
}

interface SaveVersionedChapterInput extends ChapterLocator {
  content: string;
}

interface RollbackChapterInput extends ChapterLocator {
  snapshotPath: string;
  range?: TextRange;
}

interface FinalizeChapterInput extends ChapterLocator {
  actor?: string;
}

interface UnlockChapterInput extends ChapterLocator {
  actor?: string;
}

interface VersioningSaveResult {
  content: string;
  snapshot?: Snapshot;
  diff?: DiffRecord;
}

interface RollbackResult extends VersioningSaveResult {
  metadata: Chapter;
}

interface FinalizeResult {
  snapshot: Snapshot;
  metadata: Chapter;
  gitTag: string;
}

function getNovelRoot(locator: ChapterLocator): string {
  return path.posix.join("projects", locator.projectId, "novels", locator.novelId);
}

function getManuscriptRelativePath(locator: ChapterLocator): string {
  return path.posix.join(getNovelRoot(locator), "manuscripts", `${locator.chapterId}.md`);
}

function getMetadataRelativePath(locator: ChapterLocator): string {
  return path.posix.join(getNovelRoot(locator), "metadata/chapters", `${locator.chapterId}.json`);
}

function getSnapshotsDir(locator: ChapterLocator): string {
  return path.posix.join(getNovelRoot(locator), "snapshots");
}

function getDiffsDir(locator: ChapterLocator): string {
  return path.posix.join(getNovelRoot(locator), "diffs");
}

function getNovelFileSystemPath(vaultRoot: string, locator: ChapterLocator): string {
  return path.join(vaultRoot, "projects", locator.projectId, "novels", locator.novelId);
}

function createStamp(): string {
  return new Date().toISOString().replaceAll(":", "-");
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

function ensureLocator(locator: Partial<ChapterLocator>): asserts locator is ChapterLocator {
  if (!locator.projectId || !locator.novelId || !locator.chapterId) {
    throw createHttpError(
      400,
      "VERSION_INVALID_CHAPTER_LOCATOR",
      "projectId, novelId, and chapterId are required",
    );
  }
}

function createDefaultChapter(locator: ChapterLocator): Chapter {
  const now = new Date().toISOString();
  return {
    id: locator.chapterId,
    novelId: locator.novelId,
    title: locator.chapterId,
    order: 0,
    manuscriptPath: getManuscriptRelativePath(locator),
    status: "drafting",
    wordCount: 0,
    involvedCharacters: [],
    locks: [],
    finalizedAt: null,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

async function readChapterMetadata(vaultRoot: string, locator: ChapterLocator): Promise<Chapter> {
  try {
    return await readJsonFile<Chapter>(vaultRoot, getMetadataRelativePath(locator));
  } catch {
    return createDefaultChapter(locator);
  }
}

async function writeChapterMetadata(vaultRoot: string, metadata: Chapter): Promise<Chapter> {
  await writeJsonFile(vaultRoot, getMetadataRelativePath({
    projectId: metadata.manuscriptPath.split("/")[1] ?? "",
    novelId: metadata.novelId,
    chapterId: metadata.id,
  }), metadata);
  return metadata;
}

function buildFinalizedLock(chapterId: string, content: string): Lock {
  return {
    id: `finalized-lock-${chapterId}`,
    scope: "chapter",
    level: "full-lock",
    range: {
      start: 0,
      end: content.length,
    },
  };
}

function removeFinalizedLock(locks: Lock[], chapterId: string): Lock[] {
  return locks.filter((lock) => lock.id !== `finalized-lock-${chapterId}`);
}

function renderDiffPatch(beforeContent: string, afterContent: string): string {
  const beforeLines = beforeContent.split(/\r?\n/);
  const afterLines = afterContent.split(/\r?\n/);
  const maxLength = Math.max(beforeLines.length, afterLines.length);
  const patchLines = ["--- before", "+++ after"];

  for (let index = 0; index < maxLength; index += 1) {
    const beforeLine = beforeLines[index];
    const afterLine = afterLines[index];

    if (beforeLine === afterLine) {
      if (beforeLine !== undefined) {
        patchLines.push(` ${beforeLine}`);
      }
      continue;
    }

    if (beforeLine !== undefined) {
      patchLines.push(`-${beforeLine}`);
    }

    if (afterLine !== undefined) {
      patchLines.push(`+${afterLine}`);
    }
  }

  return `${patchLines.join("\n")}\n`;
}

async function createSnapshotRecord(
  vaultRoot: string,
  locator: ChapterLocator,
  content: string,
  reason: SnapshotReason,
): Promise<Snapshot> {
  const snapshotsDir = getSnapshotsDir(locator);
  const stamp = createStamp();
  const relativePath = path.posix.join(snapshotsDir, `${locator.chapterId}-${stamp}-${reason}.md`);

  await writeManuscriptFile(vaultRoot, relativePath, content);

  return {
    id: `${locator.chapterId}-${stamp}-${reason}`,
    chapterId: locator.chapterId,
    reason,
    path: relativePath,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function createDiffRecord(
  vaultRoot: string,
  locator: ChapterLocator,
  beforeContent: string,
  afterContent: string,
  beforeRef: string,
  afterRef: string,
): Promise<DiffRecord> {
  const stamp = createStamp();
  const diffPath = path.posix.join(getDiffsDir(locator), `${locator.chapterId}-${stamp}.json`);
  const record: DiffRecord = {
    id: `${locator.chapterId}-${stamp}`,
    chapterId: locator.chapterId,
    beforeRef,
    afterRef,
    patch: renderDiffPatch(beforeContent, afterContent),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeJsonFile(vaultRoot, diffPath, record);
  return record;
}

async function ensureNovelGitRepo(vaultRoot: string, locator: ChapterLocator): Promise<string> {
  const dir = getNovelFileSystemPath(vaultRoot, locator);
  await mkdir(dir, { recursive: true });
  await git.init({ fs, dir, defaultBranch: "main" });
  return dir;
}

async function getHeadCommitOid(dir: string): Promise<string | null> {
  try {
    return await git.resolveRef({ fs, dir, ref: "HEAD" });
  } catch {
    return null;
  }
}

async function commitNovelState(
  vaultRoot: string,
  locator: ChapterLocator,
  message: string,
): Promise<string> {
  const dir = await ensureNovelGitRepo(vaultRoot, locator);
  await git.add({ fs, dir, filepath: "." });

  const statuses = await git.statusMatrix({ fs, dir });
  const hasChanges = statuses.some(([, head, workdir, stage]) => head !== workdir || workdir !== stage);

  const headOid = await getHeadCommitOid(dir);
  if (!hasChanges && headOid) {
    return headOid;
  }

  const oid = await git.commit({
    fs,
    dir,
    author: {
      name: "Shulingge MVP",
      email: "local@shulingge.app",
    },
    message,
  });

  return oid;
}

function applyRangeRollback(currentContent: string, snapshotContent: string, range: TextRange): string {
  return `${currentContent.slice(0, range.start)}${snapshotContent.slice(range.start, range.end)}${currentContent.slice(range.end)}`;
}

export async function saveVersionedChapter(
  vaultRoot: string,
  input: SaveVersionedChapterInput,
): Promise<VersioningSaveResult> {
  ensureLocator(input);

  const metadata = await readChapterMetadata(vaultRoot, input);
  if (metadata.status === "finalized") {
    throw createHttpError(
      409,
      "VERSION_CHAPTER_FINALIZED",
      "Chapter is finalized. Unlock it before editing again.",
    );
  }

  const manuscriptPath = getManuscriptRelativePath(input);
  let previousContent = "";
  try {
    previousContent = await readManuscriptFile(vaultRoot, manuscriptPath);
  } catch {
    previousContent = "";
  }

  await writeManuscriptFile(vaultRoot, manuscriptPath, input.content);

  const nextMetadata: Chapter = {
    ...metadata,
    novelId: input.novelId,
    manuscriptPath,
    wordCount: countWords(input.content),
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(vaultRoot, getMetadataRelativePath(input), nextMetadata);

  if (previousContent === input.content) {
    return { content: input.content };
  }

  const snapshot = await createSnapshotRecord(vaultRoot, input, previousContent, "auto");
  const diff = await createDiffRecord(
    vaultRoot,
    input,
    previousContent,
    input.content,
    snapshot.path,
    manuscriptPath,
  );

  return {
    content: input.content,
    snapshot,
    diff,
  };
}

export async function rollbackChapterFromSnapshot(
  vaultRoot: string,
  input: RollbackChapterInput,
): Promise<RollbackResult> {
  ensureLocator(input);

  const currentContent = await readManuscriptFile(vaultRoot, getManuscriptRelativePath(input));
  const snapshotContent = await readManuscriptFile(vaultRoot, input.snapshotPath);
  const restoredContent = input.range
    ? applyRangeRollback(currentContent, snapshotContent, input.range)
    : snapshotContent;

  const snapshot = await createSnapshotRecord(vaultRoot, input, currentContent, "manual");
  await writeManuscriptFile(vaultRoot, getManuscriptRelativePath(input), restoredContent);

  const metadata = await readChapterMetadata(vaultRoot, input);
  const nextMetadata: Chapter = {
    ...metadata,
    status: metadata.status === "finalized" ? "drafting" : metadata.status,
    finalizedAt: metadata.status === "finalized" ? null : metadata.finalizedAt,
    locks: metadata.status === "finalized" ? removeFinalizedLock(metadata.locks, input.chapterId) : metadata.locks,
    wordCount: countWords(restoredContent),
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(vaultRoot, getMetadataRelativePath(input), nextMetadata);

  const diff = await createDiffRecord(
    vaultRoot,
    input,
    currentContent,
    restoredContent,
    getManuscriptRelativePath(input),
    input.snapshotPath,
  );

  return {
    content: restoredContent,
    snapshot,
    diff,
    metadata: nextMetadata,
  };
}

export async function finalizeChapter(
  vaultRoot: string,
  input: FinalizeChapterInput,
): Promise<FinalizeResult> {
  ensureLocator(input);

  const content = await readManuscriptFile(vaultRoot, getManuscriptRelativePath(input));
  const snapshot = await createSnapshotRecord(vaultRoot, input, content, "finalize");
  const commitOid = await commitNovelState(
    vaultRoot,
    input,
    `Finalize ${input.chapterId}${input.actor ? ` by ${input.actor}` : ""}`,
  );
  const dir = getNovelFileSystemPath(vaultRoot, input);
  const gitTag = `chapter/${input.chapterId}/finalized/${Date.now()}`;
  await git.annotatedTag({
    fs,
    dir,
    ref: gitTag,
    object: commitOid,
    tagger: {
      name: "Shulingge MVP",
      email: "local@shulingge.app",
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: 0,
    },
    message: `Finalize ${input.chapterId}`,
  });

  const metadata = await readChapterMetadata(vaultRoot, input);
  const finalizedLock = buildFinalizedLock(input.chapterId, content);
  const nextMetadata: Chapter = {
    ...metadata,
    status: "finalized",
    finalizedAt: new Date().toISOString(),
    locks: [...removeFinalizedLock(metadata.locks, input.chapterId), finalizedLock],
    wordCount: countWords(content),
    updatedAt: new Date().toISOString(),
  };

  await writeJsonFile(vaultRoot, getMetadataRelativePath(input), nextMetadata);

  return {
    snapshot,
    metadata: nextMetadata,
    gitTag,
  };
}

export async function unlockFinalizedChapter(
  vaultRoot: string,
  input: UnlockChapterInput,
): Promise<Chapter> {
  ensureLocator(input);

  const metadata = await readChapterMetadata(vaultRoot, input);
  if (metadata.status !== "finalized") {
    return metadata;
  }

  const nextMetadata: Chapter = {
    ...metadata,
    status: "drafting",
    finalizedAt: null,
    locks: removeFinalizedLock(metadata.locks, input.chapterId),
    updatedAt: new Date().toISOString(),
  };

  await writeJsonFile(vaultRoot, getMetadataRelativePath(input), nextMetadata);
  return nextMetadata;
}

export async function listChapterTimeline(
  vaultRoot: string,
  locator: ChapterLocator,
): Promise<{ snapshots: Snapshot[]; diffs: DiffRecord[] }> {
  ensureLocator(locator);
  const snapshotsDir = path.join(vaultRoot, ...getSnapshotsDir(locator).split("/"));
  const diffsDir = path.join(vaultRoot, ...getDiffsDir(locator).split("/"));

  async function readRecords<T>(dirPath: string): Promise<T[]> {
    try {
      const entries = await fs.promises.readdir(dirPath);
      const records = await Promise.all(entries.map(async (entry) => {
        if (!entry.endsWith(".json")) {
          return null;
        }

        const relativePath = path.posix.join(
          path.relative(vaultRoot, dirPath).split(path.sep).join("/"),
          entry,
        );
        return readJsonFile<T>(vaultRoot, relativePath);
      }));
      return records.filter(Boolean) as T[];
    } catch {
      return [];
    }
  }

  const allDiffs = await readRecords<DiffRecord>(diffsDir);
  const diffs = allDiffs.filter((record) => record.chapterId === locator.chapterId);
  const snapshots: Snapshot[] = [];
  try {
    const entries = await fs.promises.readdir(snapshotsDir);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) {
        continue;
      }
      if (!entry.startsWith(`${locator.chapterId}-`)) {
        continue;
      }
      snapshots.push({
        id: entry.replace(/\.md$/, ""),
        chapterId: locator.chapterId,
        reason: entry.includes("-finalize") ? "finalize" : entry.includes("-manual") ? "manual" : "auto",
        path: path.posix.join(getSnapshotsDir(locator), entry),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  } catch {
    return { snapshots: [], diffs };
  }

  snapshots.sort((left, right) => left.path.localeCompare(right.path));
  diffs.sort((left, right) => (left.createdAt ?? "").localeCompare(right.createdAt ?? ""));

  return { snapshots, diffs };
}
