import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import { CURRENT_SCHEMA_VERSION, skillMarketEntrySchema, type SkillMarketEntry } from "@shulingge/shared";
import { readJsonFile, resolveSafePath, writeJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

const MARKET_DIR = "global/skill-market";

interface SkillRatingRecord {
  rater: string;
  score: number;
  comment?: string;
  createdAt: string;
}

interface StoredMarketEntry extends SkillMarketEntry {
  ratings: SkillRatingRecord[];
}

// 读取市场原始记录；对外返回时会去掉内部评分明细，只保留聚合结果。
async function listStoredEntries(vaultRoot: string): Promise<StoredMarketEntry[]> {
  const directory = resolveSafePath(vaultRoot, MARKET_DIR);
  const entries = await readdir(directory).catch(() => [] as string[]);
  const marketEntries: StoredMarketEntry[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    marketEntries.push(await readJsonFile<StoredMarketEntry>(vaultRoot, path.posix.join(MARKET_DIR, entry)));
  }

  return marketEntries;
}

async function saveEntry(vaultRoot: string, entry: StoredMarketEntry): Promise<StoredMarketEntry> {
  await mkdir(resolveSafePath(vaultRoot, MARKET_DIR), { recursive: true });
  await writeJsonFile(vaultRoot, path.posix.join(MARKET_DIR, `${entry.id}.json`), entry);
  return entry;
}

export async function listSkillMarket(
  vaultRoot: string,
  filters?: { q?: string; category?: string; author?: string; status?: string },
): Promise<SkillMarketEntry[]> {
  const entries = await listStoredEntries(vaultRoot);
  return entries
    .filter((entry) => {
      if (filters?.q && !`${entry.name} ${entry.summary} ${entry.tags.join(" ")}`.toLowerCase().includes(filters.q.toLowerCase())) {
        return false;
      }
      if (filters?.category && !entry.categories.includes(filters.category)) {
        return false;
      }
      if (filters?.author && entry.author !== filters.author) {
        return false;
      }
      if (filters?.status && entry.status !== filters.status) {
        return false;
      }
      return true;
    })
    .sort((left, right) => right.averageRating - left.averageRating || left.name.localeCompare(right.name))
    .map(({ ratings: _ratings, ...entry }) => entry);
}

export async function publishSkillMarketEntry(
  vaultRoot: string,
  input: {
    skillId: string;
    name: string;
    author: string;
    summary: string;
    categories: string[];
    tags: string[];
    certifiedAuthor?: boolean;
  },
): Promise<SkillMarketEntry> {
  // 市场条目与已安装 Skill 解耦，允许先发布元信息，再由用户决定是否导入。
  const now = new Date().toISOString();
  const record: StoredMarketEntry = {
    id: `market-${input.skillId}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    skillId: input.skillId,
    name: input.name,
    author: input.author,
    summary: input.summary,
    categories: input.categories,
    tags: input.tags,
    averageRating: 0,
    ratingCount: 0,
    reports: [],
    certifiedAuthor: input.certifiedAuthor ?? false,
    status: "listed",
    createdAt: now,
    updatedAt: now,
    ratings: [],
  };
  skillMarketEntrySchema.parse(record);
  const saved = await saveEntry(vaultRoot, record);
  const { ratings: _ratings, ...entry } = saved;
  return entry;
}

export async function rateSkillMarketEntry(
  vaultRoot: string,
  input: { marketEntryId: string; rater: string; score: number; comment?: string },
): Promise<SkillMarketEntry> {
  const current = await readJsonFile<StoredMarketEntry>(vaultRoot, path.posix.join(MARKET_DIR, `${input.marketEntryId}.json`)).catch(() => null);
  if (!current) {
    throw createHttpError(404, "SKILL_MARKET_NOT_FOUND", `Market entry not found: ${input.marketEntryId}`);
  }
  if (input.score < 1 || input.score > 5) {
    throw createHttpError(400, "SKILL_MARKET_INVALID_SCORE", "score must be between 1 and 5");
  }

  // 同一评分者重复评分时按最后一次覆盖，避免平均分被同一人反复刷高。
  const nextRatings = [
    ...current.ratings.filter((item) => item.rater !== input.rater),
    {
      rater: input.rater,
      score: input.score,
      comment: input.comment,
      createdAt: new Date().toISOString(),
    },
  ];
  const averageRating = nextRatings.reduce((sum, item) => sum + item.score, 0) / nextRatings.length;
  const next: StoredMarketEntry = {
    ...current,
    averageRating: Number(averageRating.toFixed(2)),
    ratingCount: nextRatings.length,
    ratings: nextRatings,
    updatedAt: new Date().toISOString(),
  };
  const saved = await saveEntry(vaultRoot, next);
  const { ratings: _ratings, ...entry } = saved;
  return entry;
}

export async function reportSkillMarketEntry(
  vaultRoot: string,
  input: { marketEntryId: string; reporter: string; reason: string },
): Promise<SkillMarketEntry> {
  const current = await readJsonFile<StoredMarketEntry>(vaultRoot, path.posix.join(MARKET_DIR, `${input.marketEntryId}.json`)).catch(() => null);
  if (!current) {
    throw createHttpError(404, "SKILL_MARKET_NOT_FOUND", `Market entry not found: ${input.marketEntryId}`);
  }

  const next: StoredMarketEntry = {
    ...current,
    reports: [
      ...current.reports,
      {
        reporter: input.reporter,
        reason: input.reason,
        createdAt: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  const saved = await saveEntry(vaultRoot, next);
  const { ratings: _ratings, ...entry } = saved;
  return entry;
}

export async function moderateSkillMarketEntry(
  vaultRoot: string,
  input: { marketEntryId: string; status: "listed" | "hidden" | "removed"; certifiedAuthor?: boolean },
): Promise<SkillMarketEntry> {
  // V2.0 先实现本地审核状态机；真正的外部平台审核流后续再接。
  const current = await readJsonFile<StoredMarketEntry>(vaultRoot, path.posix.join(MARKET_DIR, `${input.marketEntryId}.json`)).catch(() => null);
  if (!current) {
    throw createHttpError(404, "SKILL_MARKET_NOT_FOUND", `Market entry not found: ${input.marketEntryId}`);
  }

  const next: StoredMarketEntry = {
    ...current,
    status: input.status,
    certifiedAuthor: input.certifiedAuthor ?? current.certifiedAuthor,
    updatedAt: new Date().toISOString(),
  };
  const saved = await saveEntry(vaultRoot, next);
  const { ratings: _ratings, ...entry } = saved;
  return entry;
}
