import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { readJsonFile, resolveSafePath, writeJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

export interface CustomFontRecord {
  id: string;
  label: string;
  family: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface CustomFontWithData extends CustomFontRecord {
  dataUrl: string;
}

const FONT_SETTINGS_PATH = "settings/fonts/fonts.json";
const FONT_FILE_DIR = "settings/fonts/files";
const MAX_FONT_BYTES = 8 * 1024 * 1024;
const FONT_EXTENSIONS: Record<string, string> = {
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFontName(value: string): string {
  return value
    .replace(/[^\p{L}\p{N}\s._-]+/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function createFontId(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return `${base || "font"}-${Date.now().toString(36)}`;
}

function fontMimeFromFileName(fileName: string): string | undefined {
  return FONT_EXTENSIONS[path.extname(fileName).toLowerCase()];
}

async function readFontRecords(vaultRoot: string): Promise<CustomFontRecord[]> {
  const stored = await readJsonFile<{ fonts?: CustomFontRecord[] }>(vaultRoot, FONT_SETTINGS_PATH).catch(() => ({ fonts: [] }));
  return Array.isArray(stored.fonts) ? stored.fonts : [];
}

async function writeFontRecords(vaultRoot: string, fonts: CustomFontRecord[]): Promise<void> {
  await writeJsonFile(vaultRoot, FONT_SETTINGS_PATH, { fonts });
}

async function withDataUrl(vaultRoot: string, record: CustomFontRecord): Promise<CustomFontWithData> {
  const buffer = await readFile(resolveSafePath(vaultRoot, path.posix.join(FONT_FILE_DIR, record.fileName)));
  return {
    ...record,
    dataUrl: `data:${record.mimeType};base64,${buffer.toString("base64")}`,
  };
}

export async function listCustomFonts(vaultRoot: string): Promise<{ fonts: CustomFontWithData[] }> {
  const fonts = await readFontRecords(vaultRoot);
  const loaded = await Promise.all(fonts.map((font) => withDataUrl(vaultRoot, font).catch(() => null)));
  return {
    fonts: loaded.filter((font): font is CustomFontWithData => Boolean(font)),
  };
}

export async function importCustomFont(vaultRoot: string, input: unknown): Promise<{ font: CustomFontWithData }> {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const originalName = cleanString(record.fileName);
  const label = normalizeFontName(cleanString(record.label) || path.basename(originalName, path.extname(originalName)));
  const contentBase64 = cleanString(record.contentBase64);
  const mimeType = fontMimeFromFileName(originalName) || cleanString(record.mimeType);
  const extension = path.extname(originalName).toLowerCase();

  if (!label) {
    throw createHttpError(400, "FONT_IMPORT_INVALID_NAME", "请填写字体名称");
  }
  if (!FONT_EXTENSIONS[extension] || !mimeType || !Object.values(FONT_EXTENSIONS).includes(mimeType)) {
    throw createHttpError(400, "FONT_IMPORT_INVALID_TYPE", "仅支持 .ttf、.otf、.woff、.woff2 字体文件");
  }
  if (!contentBase64) {
    throw createHttpError(400, "FONT_IMPORT_EMPTY", "字体文件内容不能为空");
  }

  const buffer = Buffer.from(contentBase64, "base64");
  if (!buffer.length || buffer.length > MAX_FONT_BYTES) {
    throw createHttpError(400, "FONT_IMPORT_TOO_LARGE", "字体文件需小于 8MB");
  }

  const id = createFontId(label);
  const fileName = `${id}${extension}`;
  const filePath = resolveSafePath(vaultRoot, path.posix.join(FONT_FILE_DIR, fileName));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);

  const font: CustomFontRecord = {
    id,
    label,
    family: `ShulinggeCustomFont-${id}`,
    fileName,
    mimeType,
    size: buffer.length,
    createdAt: new Date().toISOString(),
  };
  const fonts = await readFontRecords(vaultRoot);
  await writeFontRecords(vaultRoot, [...fonts, font]);
  return { font: await withDataUrl(vaultRoot, font) };
}
