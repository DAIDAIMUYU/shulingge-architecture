import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { RemoteGatewayStatus } from "./types.js";

export interface HealthReminder {
  id: string;
  level: "info" | "warn";
  title: string;
  message: string;
}

export interface HealthCheckItem {
  id: string;
  status: "ok" | "warn";
  label: string;
  detail: string;
}

export interface HealthReport {
  vaultRoot: string;
  generatedAt: string;
  projectCount: number;
  novelCount: number;
  chapterCount: number;
  runCount: number;
  backupCount: number;
  latestBackupAt?: string;
  remote: RemoteGatewayStatus;
  reminders: HealthReminder[];
  checks: HealthCheckItem[];
  summary: {
    vaultReady: boolean;
    backupReady: boolean;
    remoteSafe: boolean;
    projectReady: boolean;
  };
}

async function countFiles(dirPath: string, extension: string): Promise<number> {
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(extension)).length;
}

export async function buildHealthReport(
  vaultRoot: string,
  remote: RemoteGatewayStatus,
): Promise<HealthReport> {
  const projectsRoot = path.join(vaultRoot, "projects");
  const projectEntries = await readdir(projectsRoot, { withFileTypes: true }).catch(() => []);
  let novelCount = 0;
  let chapterCount = 0;
  let runCount = 0;

  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) {
      continue;
    }

    const novelsRoot = path.join(projectsRoot, projectEntry.name, "novels");
    const novelEntries = await readdir(novelsRoot, { withFileTypes: true }).catch(() => []);
    for (const novelEntry of novelEntries) {
      if (!novelEntry.isDirectory()) {
        continue;
      }
      novelCount += 1;
      const novelRoot = path.join(novelsRoot, novelEntry.name);
      chapterCount += await countFiles(path.join(novelRoot, "metadata", "chapters"), ".json");
      runCount += await countFiles(path.join(novelRoot, "runs"), ".json");
    }
  }

  const backupsRoot = path.join(vaultRoot, "backups");
  const backupEntries = await readdir(backupsRoot, { withFileTypes: true }).catch(() => []);
  const backupFiles = backupEntries.filter((entry) => entry.isFile());
  const backupStats = await Promise.all(
    backupFiles.map(async (entry) => ({
      name: entry.name,
      stats: await stat(path.join(backupsRoot, entry.name)),
    })),
  );
  const latestBackup = backupStats.sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs)[0];

  const reminders: HealthReminder[] = [];
  const checks: HealthCheckItem[] = [];
  const hasProjects = projectEntries.some((entry) => entry.isDirectory());
  const backupAgeMs = latestBackup ? Date.now() - latestBackup.stats.mtimeMs : Number.POSITIVE_INFINITY;
  const backupFresh = Boolean(latestBackup && backupAgeMs <= 7 * 24 * 60 * 60 * 1000);

  if (!latestBackup) {
    reminders.push({
      id: "backup-missing",
      level: "warn",
      title: "缺少备份",
      message: "尚未发现任何 Vault 备份，建议先执行一次加密备份。",
    });
  } else if (!backupFresh) {
    reminders.push({
      id: "backup-stale",
      level: "warn",
      title: "备份过期",
      message: "最近一次备份已超过 7 天，建议重新生成备份。",
    });
  } else {
    reminders.push({
      id: "backup-fresh",
      level: "info",
      title: "备份状态正常",
      message: "最近备份在 7 天内。",
    });
  }

  if (remote.enabled) {
    reminders.push({
      id: "remote-enabled",
      level: "info",
      title: "远程访问已开启",
      message: `远程访问正在监听 ${remote.address ?? "0.0.0.0"}:${remote.port}。`,
    });
  }

  checks.push({
    id: "vault-root",
    status: "ok",
    label: "Vault 已选择",
    detail: path.basename(vaultRoot),
  });
  checks.push({
    id: "projects",
    status: hasProjects ? "ok" : "warn",
    label: "项目初始化",
    detail: hasProjects ? `已检测到 ${projectEntries.filter((entry) => entry.isDirectory()).length} 个项目` : "尚未发现项目目录",
  });
  checks.push({
    id: "backups",
    status: backupFresh ? "ok" : "warn",
    label: "备份状态",
    detail: latestBackup ? `最近备份：${latestBackup.name}` : "尚未创建任何备份",
  });
  checks.push({
    id: "remote",
    status: remote.enabled && !remote.passwordConfigured ? "warn" : "ok",
    label: "远程访问",
    detail: remote.enabled
      ? `已开启，端口 ${remote.port}，密码${remote.passwordConfigured ? "已配置" : "未配置"}`
      : "默认关闭",
  });

  return {
    vaultRoot,
    generatedAt: new Date().toISOString(),
    projectCount: projectEntries.filter((entry) => entry.isDirectory()).length,
    novelCount,
    chapterCount,
    runCount,
    backupCount: backupFiles.length,
    latestBackupAt: latestBackup?.stats.mtime.toISOString(),
    remote,
    reminders,
    checks,
    summary: {
      vaultReady: true,
      backupReady: backupFresh,
      remoteSafe: !remote.enabled || remote.passwordConfigured,
      projectReady: hasProjects,
    },
  };
}
