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

function assertLocator(locator: DirectorConversationLocator): asserts locator is Required<DirectorConversationLocator> {
  if (!locator.projectId || !locator.novelId || !locator.chapterId) {
    throw createHttpError(400, "DIRECTOR_CONVERSATION_INVALID_LOCATOR", "projectId、novelId 和 chapterId 不能为空");
  }
}

function getConversationRelativePath(locator: Required<DirectorConversationLocator>): string {
  return path.posix.join(
    "projects",
    locator.projectId,
    "novels",
    locator.novelId,
    "conversations",
    `${locator.chapterId}.json`,
  );
}

export async function loadDirectorConversation(
  vaultRoot: string,
  locator: DirectorConversationLocator,
): Promise<DirectorConversationRecord> {
  assertLocator(locator);
  const relativePath = getConversationRelativePath(locator);
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
  await writeJsonFile(vaultRoot, getConversationRelativePath(locator), record);
  return record;
}
