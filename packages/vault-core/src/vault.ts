import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

import {
  CURRENT_SCHEMA_VERSION,
  ok,
  projectSeriesSchema,
  readPolicySchema,
  type ProjectSeries,
  type ReadPolicy,
  type Result,
} from "@shulingge/shared";

import { resolveSafePath } from "./guard.js";
import { assertPureManuscript } from "./manuscript.js";
import type {
  DeletePathOptions,
  DeletePathResult,
  InitializeVaultOptions,
  InitializeVaultResult,
  SnapshotOptions,
  SnapshotResult,
  WriteJsonOptions,
  WriteManuscriptOptions,
} from "./types.js";

const VAULT_ROOT_DIRECTORIES = [
  "global/rules",
  "global/skills",
  "global/agents",
  "global/presets",
  "global/templates",
  "projects",
  "settings",
  "backups",
  "logs",
  "trash",
  ".index",
] as const;

const PROJECT_SHARED_DIRECTORIES = [
  "canon",
  "references",
  "characters",
  "worldbook",
  "relations",
  "timeline",
  "rules",
  "skills",
  "states",
] as const;

const NOVEL_DIRECTORIES = [
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
] as const;

const execFileAsync = promisify(execFile);

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function initializeVault(
  options: InitializeVaultOptions,
): Promise<InitializeVaultResult> {
  const rootPath = path.resolve(options.rootPath);
  const createdDirectories: string[] = [];

  await mkdir(rootPath, { recursive: true });

  for (const relativeDir of VAULT_ROOT_DIRECTORIES) {
    const dirPath = path.join(rootPath, relativeDir);
    await mkdir(dirPath, { recursive: true });
    createdDirectories.push(relativeDir);
  }

  const indexPath = path.join(rootPath, ".index", "cache.sqlite");
  try {
    await stat(indexPath);
  } catch {
    await writeFile(indexPath, "");
  }

  return {
    rootPath,
    createdDirectories,
  };
}

export async function initializeProject(
  vaultRoot: string,
  series: ProjectSeries,
  novel: {
    id: string;
    name: string;
    branchType: "main" | "if" | "au" | "spin-off" | "collection";
    excludedSharedFiles?: string[];
    writingFreedom?: "strict" | "light" | "medium" | "high";
    defaultWriteScope?: "paragraph" | "scene" | "chapter";
  },
): Promise<void> {
  const projectRoot = resolveSafePath(vaultRoot, path.join("projects", series.id));
  const sharedRoot = path.join(projectRoot, "shared");
  const novelRoot = path.join(projectRoot, "novels", novel.id);

  await mkdir(sharedRoot, { recursive: true });
  await mkdir(novelRoot, { recursive: true });

  for (const relativeDir of PROJECT_SHARED_DIRECTORIES) {
    await mkdir(path.join(sharedRoot, relativeDir), { recursive: true });
  }

  for (const relativeDir of NOVEL_DIRECTORIES) {
    await mkdir(path.join(novelRoot, relativeDir), { recursive: true });
  }

  const readPolicy: ReadPolicy = {
    id: `${series.id}-read-policy`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    defaults: {
      canon: "shared-first",
      characterBase: "shared-first",
      characterState: "branch-first",
      worldbook: "merge",
      timeline: "branch-first",
      hardRule: "shared-first",
      styleRule: "branch-first",
      skill: "merge",
    },
    perFile: {},
  };

  const readPolicyPath = resolveSafePath(
    vaultRoot,
    path.join("projects", series.id, "shared", "read-policy.json"),
  );

  const novelJsonPath = resolveSafePath(
    vaultRoot,
    path.join("projects", series.id, "novels", novel.id, "novel.json"),
  );

  const seriesJsonPath = resolveSafePath(vaultRoot, path.join("projects", series.id, "series.json"));

  await writeJsonFile(vaultRoot, toPosixPath(path.relative(vaultRoot, seriesJsonPath)), series);
  await writeJsonFile(vaultRoot, toPosixPath(path.relative(vaultRoot, readPolicyPath)), readPolicy);
  await writeJsonFile(vaultRoot, toPosixPath(path.relative(vaultRoot, novelJsonPath)), {
    id: novel.id,
    name: novel.name,
    projectId: series.id,
    branchType: novel.branchType,
    excludedSharedFiles: novel.excludedSharedFiles ?? [],
    writingFreedom: novel.writingFreedom ?? "medium",
    defaultWriteScope: novel.defaultWriteScope ?? "scene",
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
}

export async function readJsonFile<T>(vaultRoot: string, relativePath: string): Promise<T> {
  const targetPath = resolveSafePath(vaultRoot, relativePath);
  const content = await readFile(targetPath, "utf8");
  return JSON.parse(content) as T;
}

export async function writeJsonFile(
  vaultRoot: string,
  relativePath: string,
  value: unknown,
  options?: WriteJsonOptions,
): Promise<string> {
  const targetPath = resolveSafePath(vaultRoot, relativePath);
  await ensureParentDirectory(targetPath);
  await writeFile(targetPath, `${JSON.stringify(value, null, options?.spaces ?? 2)}\n`, "utf8");
  return targetPath;
}

export async function readManuscriptFile(vaultRoot: string, relativePath: string): Promise<string> {
  const targetPath = resolveSafePath(vaultRoot, relativePath);
  return readFile(targetPath, "utf8");
}

export async function writeManuscriptFile(
  vaultRoot: string,
  relativePath: string,
  content: string,
  options?: WriteManuscriptOptions,
): Promise<string> {
  assertPureManuscript(content);

  const targetPath = resolveSafePath(vaultRoot, relativePath);
  if (options?.createParents ?? true) {
    await ensureParentDirectory(targetPath);
  }

  await writeFile(targetPath, content, "utf8");
  return targetPath;
}

export async function createSnapshot(
  vaultRoot: string,
  options: SnapshotOptions,
): Promise<SnapshotResult> {
  const sourcePath = resolveSafePath(vaultRoot, options.sourcePath);
  const snapshotDir = resolveSafePath(vaultRoot, options.snapshotDir);
  await mkdir(snapshotDir, { recursive: true });

  const parsed = path.parse(sourcePath);
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const label = options.label ? `-${options.label}` : "";
  const snapshotName = `${parsed.name}-${stamp}${label}${parsed.ext || ".bak"}`;
  const snapshotPath = path.join(snapshotDir, snapshotName);

  await copyFile(sourcePath, snapshotPath);

  return { snapshotPath };
}

async function moveToVaultTrash(
  vaultRoot: string,
  targetPath: string,
  now: Date,
  trashDirOverride?: string,
): Promise<DeletePathResult> {
  const trashRelativeDir = trashDirOverride ?? "trash";
  const trashDir = resolveSafePath(vaultRoot, trashRelativeDir);
  await mkdir(trashDir, { recursive: true });

  const parsed = path.parse(targetPath);
  const timestamp = now.toISOString().replaceAll(":", "-");
  const destinationPath = path.join(
    trashDir,
    `${parsed.name}-${timestamp}${parsed.ext}`,
  );

  await rename(targetPath, destinationPath);

  return {
    deletedPath: targetPath,
    method: "vault-trash",
    trashPath: destinationPath,
  };
}

export async function deletePath(vaultRoot: string, options: DeletePathOptions): Promise<DeletePathResult> {
  const targetPath = resolveSafePath(vaultRoot, options.path);
  const recycle = options.recycle ?? moveToSystemRecycleBin;

  try {
    await recycle(targetPath);
    return {
      deletedPath: targetPath,
      method: "system-recycle-bin",
    };
  } catch {
    return moveToVaultTrash(vaultRoot, targetPath, options.now ?? new Date(), options.trashDir);
  }
}

export async function removePathPermanently(vaultRoot: string, relativePath: string): Promise<void> {
  const targetPath = resolveSafePath(vaultRoot, relativePath);
  await rm(targetPath, { recursive: true, force: true });
}

export function validateSeries(value: unknown): Result<ProjectSeries> {
  return ok(projectSeriesSchema.parse(value));
}

export function validateReadPolicy(value: unknown): Result<ReadPolicy> {
  return ok(readPolicySchema.parse(value));
}

async function moveToSystemRecycleBin(targetPath: string): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("System recycle bin adapter is only implemented for Windows in MVP");
  }

  const escapedPath = targetPath.replace(/'/g, "''");
  const script = `
Add-Type -AssemblyName Microsoft.VisualBasic
$target = '${escapedPath}'
if (Test-Path -LiteralPath $target -PathType Container) {
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
    $target,
    [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
    [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
  )
} else {
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
    $target,
    [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
    [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
  )
}
`;

  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ]);
}
