import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import type { CollaborationSession } from "@shulingge/shared";
import { collaborationSessionSchema, CURRENT_SCHEMA_VERSION } from "@shulingge/shared";
import { readJsonFile, resolveSafePath, writeJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

const COLLAB_DIR = "global/collaboration";

export async function listCollaborationSessions(vaultRoot: string): Promise<CollaborationSession[]> {
  const directory = resolveSafePath(vaultRoot, COLLAB_DIR);
  const entries = await readdir(directory).catch(() => [] as string[]);
  const sessions: CollaborationSession[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    sessions.push(await readJsonFile<CollaborationSession>(vaultRoot, path.posix.join(COLLAB_DIR, entry)));
  }

  return sessions.sort((left, right) => (left.createdAt ?? "").localeCompare(right.createdAt ?? ""));
}

export async function createCollaborationSession(
  vaultRoot: string,
  raw: Partial<CollaborationSession> & { projectId?: string; owner?: string },
): Promise<CollaborationSession> {
  // V2.0 先落盘协作会话元数据，真实同步通道后续可基于这层会话继续扩展。
  const now = new Date().toISOString();
  const payload: CollaborationSession = {
    id: raw.id ?? `collab-${Date.now()}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId: raw.projectId ?? "",
    novelId: raw.novelId,
    chapterId: raw.chapterId,
    owner: raw.owner ?? "",
    participants: raw.participants ?? [raw.owner ?? ""].filter(Boolean),
    mode: raw.mode ?? "comment",
    status: raw.status ?? "draft",
    createdAt: now,
    updatedAt: now,
  };
  const parsed = collaborationSessionSchema.safeParse(payload);
  if (!parsed.success) {
    throw createHttpError(
      400,
      "COLLAB_INVALID_SESSION",
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; "),
    );
  }

  await mkdir(resolveSafePath(vaultRoot, COLLAB_DIR), { recursive: true });
  await writeJsonFile(vaultRoot, path.posix.join(COLLAB_DIR, `${parsed.data.id}.json`), parsed.data);
  return parsed.data;
}

export async function updateCollaborationSession(
  vaultRoot: string,
  sessionId: string,
  raw: Partial<CollaborationSession>,
): Promise<CollaborationSession> {
  // 更新时固定会话 id 和 schemaVersion，避免客户端误改底层标识。
  const current = await readJsonFile<CollaborationSession>(vaultRoot, path.posix.join(COLLAB_DIR, `${sessionId}.json`)).catch(() => null);
  if (!current) {
    throw createHttpError(404, "COLLAB_NOT_FOUND", `Collaboration session not found: ${sessionId}`);
  }

  const next: CollaborationSession = {
    ...current,
    ...raw,
    id: current.id,
    schemaVersion: current.schemaVersion,
    updatedAt: new Date().toISOString(),
  };
  const parsed = collaborationSessionSchema.safeParse(next);
  if (!parsed.success) {
    throw createHttpError(
      400,
      "COLLAB_INVALID_SESSION",
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; "),
    );
  }

  await writeJsonFile(vaultRoot, path.posix.join(COLLAB_DIR, `${sessionId}.json`), parsed.data);
  return parsed.data;
}
