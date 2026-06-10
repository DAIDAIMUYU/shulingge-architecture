import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import { CURRENT_SCHEMA_VERSION } from "@shulingge/shared";
import { readJsonFile, resolveSafePath, writeJsonFile } from "@shulingge/vault-core";

const THEME_MARKET_DIR = "global/theme-community";

export interface ThemeCommunityEntry {
  id: string;
  name: string;
  author: string;
  description: string;
  tokensCssPath: string;
  schemaVersion: number;
  createdAt: string;
}

export async function listThemeCommunity(vaultRoot: string): Promise<ThemeCommunityEntry[]> {
  const directory = resolveSafePath(vaultRoot, THEME_MARKET_DIR);
  const entries = await readdir(directory).catch(() => [] as string[]);
  const themes: ThemeCommunityEntry[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    themes.push(await readJsonFile<ThemeCommunityEntry>(vaultRoot, path.posix.join(THEME_MARKET_DIR, entry)));
  }

  return themes.sort((left, right) => left.name.localeCompare(right.name));
}

export async function publishThemeCommunityEntry(
  vaultRoot: string,
  input: Pick<ThemeCommunityEntry, "id" | "name" | "author" | "description" | "tokensCssPath">,
): Promise<ThemeCommunityEntry> {
  const record: ThemeCommunityEntry = {
    ...input,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
  };
  await mkdir(resolveSafePath(vaultRoot, THEME_MARKET_DIR), { recursive: true });
  await writeJsonFile(vaultRoot, path.posix.join(THEME_MARKET_DIR, `${record.id}.json`), record);
  return record;
}
