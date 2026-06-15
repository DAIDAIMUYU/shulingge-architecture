import path from "node:path";

import { readJsonFile, writeJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

export interface DirectorConversationLocator {
  projectId?: string;
  novelId?: string;
  chapterId?: string;
}

export interface DirectorConversationRecord {
  projectId: string;
  novelId: string;
  chapterId: string;
  messages: unknown[];
  updatedAt: string;
}

export interface GlobalDirectorConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface GlobalDirectorConversationRecord extends GlobalDirectorConversationSummary {
  messages: unknown[];
}

const GLOBAL_CONVERSATIONS_DIR = "conversations";

function assertLocator(locator: DirectorConversationLocator): asserts locator is Required<DirectorConversationLocator> {
  if (!locator.projectId || !locator.novelId || !locator.chapterId) {
    throw createHttpError(400, "DIRECTOR_CONVERSATION_INVALID_LOCATOR", "projectId, novelId 和 chapterId 不能为空");
  }
}

function getLegacyConversationRelativePath(locator: Required<DirectorConversationLocator>): string {
  return path.posix.join(
    "projects",
    locator.projectId,
    "novels",
    locator.novelId,
    "conversations",
    `${locator.chapterId}.json`,
  );
}

function getGlobalConversationRelativePath(id: string): string {
  return path.posix.join(GLOBAL_CONVERSATIONS_DIR, `${id}.json`);
}

function createConversationId(): string {
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isValidConversationId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function assertConversationId(id: string): void {
  if (!id || !isValidConversationId(id)) {
    throw createHttpError(400, "DIRECTOR_CONVERSATION_INVALID_ID", "无效的对话 id");
  }
}

function getMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const item = message as { role?: unknown; text?: unknown };
  return item.role === "user" && typeof item.text === "string" ? item.text.trim() : "";
}

function inferTitle(messages: unknown[], fallback: string): string {
  const firstUserText = messages.map(getMessageText).find(Boolean);
  if (!firstUserText) {
    return fallback;
  }
  const compact = firstUserText.replace(/\s+/g, " ").trim();
  return compact.length > 28 ? `${compact.slice(0, 28)}...` : compact;
}

function normalizeGlobalRecord(input: Partial<GlobalDirectorConversationRecord> | null, id: string): GlobalDirectorConversationRecord {
  const now = new Date().toISOString();
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  const title = typeof input?.title === "string" && input.title.trim()
    ? input.title.trim()
    : inferTitle(messages, "新对话");
  const createdAt = typeof input?.createdAt === "string" && input.createdAt ? input.createdAt : now;
  const updatedAt = typeof input?.updatedAt === "string" && input.updatedAt ? input.updatedAt : createdAt;
  return {
    id,
    title,
    messages,
    createdAt,
    updatedAt,
    messageCount: messages.length,
  };
}

async function readGlobalRecord(vaultRoot: string, id: string): Promise<GlobalDirectorConversationRecord | null> {
  assertConversationId(id);
  const record = await readJsonFile<Partial<GlobalDirectorConversationRecord>>(vaultRoot, getGlobalConversationRelativePath(id)).catch(() => null);
  return record ? normalizeGlobalRecord(record, id) : null;
}

export async function listGlobalDirectorConversations(vaultRoot: string): Promise<{ conversations: GlobalDirectorConversationSummary[] }> {
  const fs = await import("node:fs/promises");
  const absoluteDir = path.join(vaultRoot, GLOBAL_CONVERSATIONS_DIR);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  const conversations: GlobalDirectorConversationSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const id = entry.name.slice(0, -".json".length);
    if (!isValidConversationId(id)) {
      continue;
    }
    const record = await readGlobalRecord(vaultRoot, id).catch(() => null);
    if (record) {
      conversations.push({
        id: record.id,
        title: record.title,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        messageCount: record.messageCount,
      });
    }
  }
  conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { conversations };
}

export async function createGlobalDirectorConversation(
  vaultRoot: string,
  input: { title?: string; messages?: unknown[] } = {},
): Promise<GlobalDirectorConversationRecord> {
  const id = createConversationId();
  const now = new Date().toISOString();
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const record: GlobalDirectorConversationRecord = {
    id,
    title: input.title?.trim() || inferTitle(messages, "新对话"),
    messages,
    createdAt: now,
    updatedAt: now,
    messageCount: messages.length,
  };
  await writeJsonFile(vaultRoot, getGlobalConversationRelativePath(id), record);
  return record;
}

export async function loadGlobalDirectorConversation(vaultRoot: string, id: string): Promise<GlobalDirectorConversationRecord> {
  const record = await readGlobalRecord(vaultRoot, id);
  if (!record) {
    throw createHttpError(404, "DIRECTOR_CONVERSATION_NOT_FOUND", "未找到该对话");
  }
  return record;
}

export async function saveGlobalDirectorConversation(
  vaultRoot: string,
  id: string,
  input: { title?: string; messages?: unknown[] },
): Promise<GlobalDirectorConversationRecord> {
  assertConversationId(id);
  if (!Array.isArray(input.messages)) {
    throw createHttpError(400, "DIRECTOR_CONVERSATION_INVALID_MESSAGES", "messages 必须是数组");
  }
  const current = await readGlobalRecord(vaultRoot, id);
  const updatedAt = new Date().toISOString();
  const messages = input.messages;
  const title = input.title?.trim() || inferTitle(messages, current?.title || "新对话");
  const record: GlobalDirectorConversationRecord = {
    id,
    title,
    messages,
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt,
    messageCount: messages.length,
  };
  await writeJsonFile(vaultRoot, getGlobalConversationRelativePath(id), record);
  return record;
}

export async function deleteGlobalDirectorConversation(vaultRoot: string, id: string): Promise<{ ok: true }> {
  assertConversationId(id);
  const fs = await import("node:fs/promises");
  await fs.rm(path.join(vaultRoot, getGlobalConversationRelativePath(id)), { force: true });
  return { ok: true };
}

export async function loadDirectorConversation(
  vaultRoot: string,
  locator: DirectorConversationLocator,
): Promise<DirectorConversationRecord> {
  assertLocator(locator);
  const relativePath = getLegacyConversationRelativePath(locator);
  const record = await readJsonFile<DirectorConversationRecord>(vaultRoot, relativePath).catch(() => null);

  return {
    projectId: locator.projectId,
    novelId: locator.novelId,
    chapterId: locator.chapterId,
    messages: Array.isArray(record?.messages) ? record.messages : [],
    updatedAt: record?.updatedAt ?? "",
  };
}

export async function saveDirectorConversation(
  vaultRoot: string,
  locator: DirectorConversationLocator,
  messages: unknown,
): Promise<DirectorConversationRecord> {
  assertLocator(locator);
  if (!Array.isArray(messages)) {
    throw createHttpError(400, "DIRECTOR_CONVERSATION_INVALID_MESSAGES", "messages 必须是数组");
  }

  const record: DirectorConversationRecord = {
    projectId: locator.projectId,
    novelId: locator.novelId,
    chapterId: locator.chapterId,
    messages,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(vaultRoot, getLegacyConversationRelativePath(locator), record);
  return record;
}
