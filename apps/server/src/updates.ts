import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { createVaultBackup } from "@shulingge/import-export";
import { readJsonFile, resolveSafePath, writeJsonFile } from "@shulingge/vault-core";

export type UpdateChannel = "dev" | "beta" | "stable";
export type UpdateStage =
  | "idle"
  | "available"
  | "downloading"
  | "downloaded"
  | "prepared"
  | "applied"
  | "rolled-back"
  | "failed";

export interface UpdateStatusRecord {
  currentVersion: string;
  channel: UpdateChannel;
  stage: UpdateStage;
  targetVersion?: string;
  availableVersion?: string;
  lastCheckedAt?: string;
  downloadedAt?: string;
  preparedAt?: string;
  appliedAt?: string;
  rolledBackAt?: string;
  backupPath?: string;
  downloadFile?: string;
  releaseNotes?: string;
  preservesVaultData: true;
  rollbackAvailable: boolean;
  previousVersion?: string;
  lastError?: {
    code: string;
    message: string;
    at: string;
  };
}

export interface UpdatePreparationResult extends UpdateStatusRecord {
  prepared: true;
}

export interface UpdateCheckResult extends UpdateStatusRecord {
  updateAvailable: boolean;
}

export interface UpdateDownloadResult extends UpdateStatusRecord {
  downloaded: true;
}

export interface UpdateApplyResult extends UpdateStatusRecord {
  applied: true;
}

export interface UpdateRollbackResult extends UpdateStatusRecord {
  rolledBack: true;
}

const UPDATE_STATUS_PATH = "settings/app-update.json";
const UPDATE_DOWNLOAD_DIR = "global/app-updates/downloads";
const DEFAULT_VERSION = "0.1.0";

function detectChannel(version: string): UpdateChannel {
  const value = version.toLowerCase();
  if (value.includes("-dev")) {
    return "dev";
  }
  if (value.includes("-beta")) {
    return "beta";
  }
  return "stable";
}

function parseVersion(version: string): number[] {
  const matched = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!matched) {
    throw new Error(`不合法的版本号：${version}`);
  }
  return matched.slice(1).map((item) => Number(item));
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  const leftHasPrerelease = left.includes("-");
  const rightHasPrerelease = right.includes("-");
  if (leftHasPrerelease === rightHasPrerelease) {
    return left.localeCompare(right);
  }
  return leftHasPrerelease ? -1 : 1;
}

function createDefaultStatus(currentVersion = DEFAULT_VERSION): UpdateStatusRecord {
  return {
    currentVersion,
    channel: detectChannel(currentVersion),
    stage: "idle",
    preservesVaultData: true,
    rollbackAvailable: false,
  };
}

async function readUpdateStatus(vaultRoot: string, fallbackVersion?: string): Promise<UpdateStatusRecord> {
  const fallback = createDefaultStatus(fallbackVersion);
  return await readJsonFile<UpdateStatusRecord>(vaultRoot, UPDATE_STATUS_PATH).catch(() => fallback);
}

async function saveUpdateStatus(vaultRoot: string, status: UpdateStatusRecord): Promise<UpdateStatusRecord> {
  await writeJsonFile(vaultRoot, UPDATE_STATUS_PATH, status);
  return status;
}

async function writeDownloadedArtifact(
  vaultRoot: string,
  input: { version: string; artifactName: string; channel: UpdateChannel; downloadUrl?: string },
): Promise<string> {
  const relativePath = path.posix.join(UPDATE_DOWNLOAD_DIR, `${input.version}.json`);
  const absolutePath = resolveSafePath(vaultRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });

  await writeFile(
    absolutePath,
    `${JSON.stringify(
      {
        version: input.version,
        artifactName: input.artifactName,
        channel: input.channel,
        downloadUrl: input.downloadUrl ?? null,
        downloadedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return relativePath;
}

function createFailedStatus(current: UpdateStatusRecord, code: string, message: string): UpdateStatusRecord {
  return {
    ...current,
    stage: "failed",
    lastError: {
      code,
      message,
      at: new Date().toISOString(),
    },
  };
}

export async function getUpdateStatus(
  vaultRoot: string,
  input?: { currentVersion?: string },
): Promise<UpdateStatusRecord> {
  return await readUpdateStatus(vaultRoot, input?.currentVersion);
}

export async function checkForAppUpdate(
  vaultRoot: string,
  input: { currentVersion?: string; targetVersion: string; releaseNotes?: string },
): Promise<UpdateCheckResult> {
  const current = await readUpdateStatus(vaultRoot, input.currentVersion);
  const now = new Date().toISOString();
  const updateAvailable = compareVersions(input.targetVersion, current.currentVersion) > 0;

  const next: UpdateStatusRecord = {
    ...current,
    channel: detectChannel(input.targetVersion),
    stage: updateAvailable ? "available" : "idle",
    availableVersion: updateAvailable ? input.targetVersion : undefined,
    targetVersion: updateAvailable ? input.targetVersion : undefined,
    releaseNotes: input.releaseNotes,
    lastCheckedAt: now,
    preservesVaultData: true,
  };

  await saveUpdateStatus(vaultRoot, next);
  return {
    ...next,
    updateAvailable,
  };
}

export async function downloadAppUpdate(
  vaultRoot: string,
  input: { targetVersion: string; artifactName: string; downloadUrl?: string; currentVersion?: string },
): Promise<UpdateDownloadResult> {
  const current = await readUpdateStatus(vaultRoot, input.currentVersion);
  const channel = detectChannel(input.targetVersion);
  const downloadFile = await writeDownloadedArtifact(vaultRoot, {
    version: input.targetVersion,
    artifactName: input.artifactName,
    channel,
    downloadUrl: input.downloadUrl,
  });

  const next: UpdateStatusRecord = {
    ...current,
    channel,
    stage: "downloaded",
    targetVersion: input.targetVersion,
    availableVersion: input.targetVersion,
    downloadFile,
    downloadedAt: new Date().toISOString(),
    preservesVaultData: true,
    lastError: undefined,
  };

  await saveUpdateStatus(vaultRoot, next);
  return {
    ...next,
    downloaded: true,
  };
}

export async function prepareAutomaticUpdate(
  vaultRoot: string,
  input: { targetVersion: string; currentVersion?: string },
): Promise<UpdatePreparationResult> {
  const current = await readUpdateStatus(vaultRoot, input.currentVersion);
  const backup = await createVaultBackup(vaultRoot, {
    encrypt: false,
    label: `pre-update-${input.targetVersion}`,
  });

  const next: UpdateStatusRecord = {
    ...current,
    channel: detectChannel(input.targetVersion),
    stage: "prepared",
    targetVersion: input.targetVersion,
    availableVersion: input.targetVersion,
    backupPath: path.basename(backup.outputPath),
    preparedAt: new Date().toISOString(),
    preservesVaultData: true,
    rollbackAvailable: true,
    previousVersion: current.currentVersion,
    lastError: undefined,
  };

  await saveUpdateStatus(vaultRoot, next);
  return {
    ...next,
    prepared: true,
  };
}

export async function applyDownloadedUpdate(
  vaultRoot: string,
  input: { targetVersion: string; currentVersion?: string },
): Promise<UpdateApplyResult> {
  const current = await readUpdateStatus(vaultRoot, input.currentVersion);
  if (!current.downloadFile) {
    const failed = createFailedStatus(current, "APP_UPDATE_NOT_DOWNLOADED", "更新包尚未下载");
    await saveUpdateStatus(vaultRoot, failed);
    throw new Error("更新包尚未下载");
  }
  if (!current.backupPath) {
    const failed = createFailedStatus(current, "APP_UPDATE_NOT_PREPARED", "更新前备份尚未完成");
    await saveUpdateStatus(vaultRoot, failed);
    throw new Error("更新前备份尚未完成");
  }

  const next: UpdateStatusRecord = {
    ...current,
    currentVersion: input.targetVersion,
    channel: detectChannel(input.targetVersion),
    stage: "applied",
    targetVersion: input.targetVersion,
    availableVersion: undefined,
    appliedAt: new Date().toISOString(),
    preservesVaultData: true,
    rollbackAvailable: true,
    lastError: undefined,
  };

  await saveUpdateStatus(vaultRoot, next);
  return {
    ...next,
    applied: true,
  };
}

export async function rollbackAppliedUpdate(
  vaultRoot: string,
  input?: { currentVersion?: string },
): Promise<UpdateRollbackResult> {
  const current = await readUpdateStatus(vaultRoot, input?.currentVersion);
  if (!current.rollbackAvailable || !current.previousVersion) {
    const failed = createFailedStatus(current, "APP_UPDATE_NO_ROLLBACK", "当前没有可回退的更新");
    await saveUpdateStatus(vaultRoot, failed);
    throw new Error("当前没有可回退的更新");
  }

  const previousVersion = current.previousVersion;
  const next: UpdateStatusRecord = {
    ...current,
    currentVersion: previousVersion,
    channel: detectChannel(previousVersion),
    stage: "rolled-back",
    availableVersion: undefined,
    targetVersion: undefined,
    rolledBackAt: new Date().toISOString(),
    rollbackAvailable: false,
    previousVersion: undefined,
    preservesVaultData: true,
    lastError: undefined,
  };

  await saveUpdateStatus(vaultRoot, next);
  return {
    ...next,
    rolledBack: true,
  };
}
