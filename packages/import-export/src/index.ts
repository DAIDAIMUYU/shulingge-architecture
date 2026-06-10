import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import JSZipLib from "jszip";

import { readJsonFile, readManuscriptFile, resolveSafePath, writeJsonFile, writeManuscriptFile } from "@shulingge/vault-core";

// 静态 import 让 esbuild 把 jszip 及其依赖链（pako/readable-stream/lie 等）一起打包，
// 避免 createRequire 运行时加载导致打包时遗漏传递依赖。类型仍用下方手动声明，保持稳定。
const JSZip = JSZipLib as unknown as {
  new (): {
    file(name: string, data: string | Buffer): void;
    generateAsync(options: { type: "nodebuffer"; compression?: "DEFLATE" | "STORE" }): Promise<Buffer>;
    files: Record<string, { dir: boolean; async(type: "nodebuffer"): Promise<Buffer> }>;
  };
  loadAsync(input: Buffer): Promise<{
    files: Record<string, { dir: boolean; async(type: "nodebuffer"): Promise<Buffer> }>;
  }>;
};

export type ImportMode = "keep" | "standard" | "standard+backup";
export type ExportFormat = "md" | "txt" | "docx" | "pdf" | "epub";
export type ExportScope = "chapter" | "novel" | "series";
export type ExportTemplate = "submission" | "reading" | "backup" | "web" | "epub-reader";

export interface ImportPreviewItem {
  sourcePath: string;
  targetPath?: string;
  stagedPath?: string;
  status: "ready" | "conflict" | "skipped";
  reason?: string;
}

export interface ImportPreviewResult {
  previewId: string;
  archiveCopyPath: string;
  items: ImportPreviewItem[];
  conflictCount: number;
}

export interface CommitImportResult {
  previewId: string;
  committedCount: number;
  backupPath?: string;
}

export interface ExportResult {
  format: ExportFormat;
  scope: ExportScope;
  template: ExportTemplate;
  outputPath: string;
}

export interface BackupResult {
  encrypted: boolean;
  outputPath: string;
}

export interface RestoreBackupResult {
  restoredFiles: number;
  encrypted: boolean;
}

export interface PublishPrepareResult {
  manifestPath: string;
  outputPaths: string[];
  sensitiveHits: string[];
}

export interface PublishPrepareInput {
  projectId: string;
  novelId: string;
  chapterId?: string;
  scope: "chapter" | "novel";
  platform: string;
  title: string;
  summary: string;
  tags?: string[];
  authorNote?: string;
  sensitiveWords?: string[];
}

interface PreviewManifest extends ImportPreviewResult {
  projectId: string;
  novelId: string;
  mode: ImportMode;
}

function nowStamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function previewId(): string {
  return `preview-${nowStamp()}-${randomBytes(4).toString("hex")}`;
}

function normalizeEntryPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

async function pathExists(vaultRoot: string, relativePath: string): Promise<boolean> {
  try {
    await stat(resolveSafePath(vaultRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

function detectStructuredTarget(
  entryPath: string,
  projectId: string,
  novelId: string,
): string | undefined {
  if (entryPath.startsWith("projects/") || entryPath.startsWith("global/")) {
    return entryPath;
  }

  const baseName = path.posix.basename(entryPath);
  const lower = entryPath.toLowerCase();

  if (lower.endsWith(".md")) {
    return path.posix.join("projects", projectId, "novels", novelId, "manuscripts", baseName);
  }
  if (lower.includes("worldbook/") && lower.endsWith(".json")) {
    return path.posix.join("projects", projectId, "shared", "worldbook", baseName);
  }
  if (lower.includes("characters/") && lower.endsWith(".json")) {
    return path.posix.join("projects", projectId, "shared", "characters", baseName);
  }
  if (lower.includes("relations/") && lower.endsWith(".json")) {
    return path.posix.join("projects", projectId, "shared", "relations", baseName);
  }
  if (lower.includes("timeline/") && lower.endsWith(".json")) {
    return path.posix.join("projects", projectId, "shared", "timeline", baseName);
  }
  if (lower.includes("summaries/") && lower.endsWith(".json")) {
    return path.posix.join("projects", projectId, "novels", novelId, "summaries", baseName);
  }
  if (lower.includes("metadata/chapters/") && lower.endsWith(".json")) {
    return path.posix.join("projects", projectId, "novels", novelId, "metadata", "chapters", baseName);
  }

  return undefined;
}

async function ensureParent(vaultRoot: string, relativePath: string): Promise<void> {
  await mkdir(path.dirname(resolveSafePath(vaultRoot, relativePath)), { recursive: true });
}

async function listFilesRecursively(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursively(fullPath);
      }
      return [fullPath];
    }),
  );

  return files.flat();
}

async function createRawImportBackup(
  vaultRoot: string,
  previewIdValue: string,
  archiveCopyPath: string,
): Promise<string> {
  const relativePath = path.posix.join("backups", `import-raw-${previewIdValue}.zip`);
  await ensureParent(vaultRoot, relativePath);
  await writeFile(resolveSafePath(vaultRoot, relativePath), await readFile(resolveSafePath(vaultRoot, archiveCopyPath)));
  return relativePath;
}

function sanitizeSettingsObject(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "passwordHashRef" || key === "apiKey" || key === "keyRef") {
      continue;
    }
    next[key] = sanitizeSettingsObject(child);
  }
  return next;
}

async function buildBackupZip(vaultRoot: string): Promise<Buffer> {
  const zip = new JSZip();
  const includeRoots = ["global", "projects", "settings"];

  for (const relativeRoot of includeRoots) {
    const absoluteRoot = resolveSafePath(vaultRoot, relativeRoot);
    for (const filePath of await listFilesRecursively(absoluteRoot)) {
      const relativePath = normalizeEntryPath(path.relative(vaultRoot, filePath));

      if (
        relativePath.startsWith("settings/models/") ||
        relativePath.startsWith("logs/") ||
        relativePath.startsWith(".index/") ||
        relativePath.startsWith("backups/")
      ) {
        continue;
      }

      if (relativePath.startsWith("settings/") && relativePath.endsWith(".json")) {
        const sanitized = sanitizeSettingsObject(await readJsonFile<unknown>(vaultRoot, relativePath));
        zip.file(relativePath, JSON.stringify(sanitized, null, 2));
        continue;
      }

      zip.file(relativePath, await readFile(filePath));
    }
  }

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        excludesSensitive: true,
      },
      null,
      2,
    ),
  );

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function encryptBuffer(buffer: Buffer, password: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.from(
    JSON.stringify({
      algorithm: "aes-256-gcm",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: encrypted.toString("base64"),
    }),
    "utf8",
  );
}

function decryptBuffer(buffer: Buffer, password: string): Buffer {
  const payload = JSON.parse(buffer.toString("utf8")) as {
    algorithm: string;
    salt: string;
    iv: string;
    tag: string;
    ciphertext: string;
  };

  if (payload.algorithm !== "aes-256-gcm") {
    throw new Error(`unsupported backup encryption algorithm: ${payload.algorithm}`);
  }

  const salt = Buffer.from(payload.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const key = scryptSync(password, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function writeRestoredEntry(vaultRoot: string, relativePath: string, buffer: Buffer): Promise<void> {
  if (relativePath === "manifest.json") {
    return;
  }

  await ensureParent(vaultRoot, relativePath);

  if (relativePath.endsWith(".json")) {
    await writeJsonFile(vaultRoot, relativePath, JSON.parse(buffer.toString("utf8")));
    return;
  }

  if (relativePath.endsWith(".md")) {
    await writeManuscriptFile(vaultRoot, relativePath, buffer.toString("utf8"));
    return;
  }

  await writeFile(resolveSafePath(vaultRoot, relativePath), buffer);
}

function renderTemplateBody(title: string, body: string, template: ExportTemplate): string {
  switch (template) {
    case "submission":
      return `${title}\n\n${body}`.trim();
    case "backup":
      return `# Backup Export: ${title}\n\n${body}`.trim();
    case "web":
      return `# ${title}\n\n${body}`.trim();
    case "epub-reader":
      return `${title}\n\n${body}`.trim();
    case "reading":
    default:
      return `# ${title}\n\n${body}`.trim();
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function buildDocxBuffer(title: string, body: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`);
  const paragraphs = [title, ...body.split(/\n+/g).filter(Boolean)]
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`)
    .join("");
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs}</w:body>
</w:document>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function buildPdfBuffer(title: string, body: string): Buffer {
  const lines = [title, "", ...body.split(/\n/g)];
  const text = lines
    .map((line, index) => `BT /F1 12 Tf 72 ${760 - index * 18} Td (${line.replace(/[()\\]/g, "\\$&")}) Tj ET`)
    .join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${Buffer.byteLength(text, "utf8")} >> stream\n${text}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${offsets[index].toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

async function buildEpubBuffer(title: string, body: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
  zip.file("OEBPS/content.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${escapeXml(title)}</title></head>
  <body><h1>${escapeXml(title)}</h1>${body
      .split(/\n+/g)
      .filter(Boolean)
      .map((line) => `<p>${escapeXml(line)}</p>`)
      .join("")}</body>
</html>`);
  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(title)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function renderHtmlDocument(title: string, body: string): string {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escapeXml(title)}</title><body><h1>${escapeXml(title)}</h1>${body
    .split(/\n+/g)
    .filter(Boolean)
    .map((line) => `<p>${escapeXml(line)}</p>`)
    .join("")}</body></html>`;
}

async function collectExportBody(
  vaultRoot: string,
  input: {
    projectId: string;
    novelId: string;
    scope: ExportScope;
    format: ExportFormat;
    chapterId?: string;
    template: ExportTemplate;
  },
): Promise<{ title: string; body: string }> {
  const manuscriptsRoot = path.posix.join("projects", input.projectId, "novels", input.novelId, "manuscripts");
  const manuscriptDir = resolveSafePath(vaultRoot, manuscriptsRoot);
  const entries = (await readdir(manuscriptDir)).filter((entry) => entry.endsWith(".md")).sort();

  if (input.scope === "chapter") {
    if (!input.chapterId) {
      throw new Error("chapterId is required for chapter export");
    }
    const body = await readManuscriptFile(
      vaultRoot,
      path.posix.join(manuscriptsRoot, `${input.chapterId}.md`),
    );
    return {
      title: `${input.projectId}-${input.novelId}-${input.chapterId}`,
      body:
        input.format === "txt" && input.template === "reading"
          ? body
          : renderTemplateBody(input.chapterId, body, input.template),
    };
  }

  const contents = await Promise.all(
    entries.map(async (entry) => ({
      title: entry.replace(/\.md$/, ""),
      content: await readManuscriptFile(vaultRoot, path.posix.join(manuscriptsRoot, entry)),
    })),
  );
  const headingPrefix = input.format === "txt" ? "" : "# ";
  const body = contents
    .map((item) => `${headingPrefix}${item.title}\n\n${item.content}`.trim())
    .join("\n\n");

  return {
    title: `${input.projectId}-${input.novelId}-${input.scope}`,
    body: renderTemplateBody(`${input.projectId}/${input.novelId}`, body, input.template),
  };
}

export async function previewImport(
  vaultRoot: string,
  input: {
    archivePath: string;
    projectId: string;
    novelId: string;
    mode?: ImportMode;
  },
): Promise<ImportPreviewResult> {
  const mode = input.mode ?? "standard+backup";
  const id = previewId();
  const archiveBuffer = await readFile(input.archivePath);
  const zip = await JSZip.loadAsync(archiveBuffer);
  const previewRoot = path.posix.join("settings", "import-previews", id);
  const archiveCopyPath = path.posix.join(previewRoot, "source.zip");
  const items: ImportPreviewItem[] = [];

  await ensureParent(vaultRoot, archiveCopyPath);
  await writeFile(resolveSafePath(vaultRoot, archiveCopyPath), archiveBuffer);

  for (const [entryName, entry] of Object.entries(zip.files) as Array<
    [string, { dir: boolean; async(type: "nodebuffer"): Promise<Buffer> }]
  >) {
    if (entry.dir) {
      continue;
    }

    const normalizedEntry = normalizeEntryPath(entryName);
    const targetPath = detectStructuredTarget(normalizedEntry, input.projectId, input.novelId);
    if (!targetPath) {
      items.push({
        sourcePath: normalizedEntry,
        status: "skipped",
        reason: "UNMAPPED_ENTRY",
      });
      continue;
    }

    const stagedPath = path.posix.join(previewRoot, "staged", targetPath);
    await ensureParent(vaultRoot, stagedPath);
    await writeFile(resolveSafePath(vaultRoot, stagedPath), await entry.async("nodebuffer"));

    const conflict = await pathExists(vaultRoot, targetPath);
    items.push({
      sourcePath: normalizedEntry,
      targetPath,
      stagedPath,
      status: conflict ? "conflict" : "ready",
    });
  }

  const manifest: PreviewManifest = {
    previewId: id,
    archiveCopyPath,
    items,
    conflictCount: items.filter((item) => item.status === "conflict").length,
    projectId: input.projectId,
    novelId: input.novelId,
    mode,
  };

  await writeJsonFile(vaultRoot, path.posix.join(previewRoot, "preview.json"), manifest);

  return {
    previewId: manifest.previewId,
    archiveCopyPath: manifest.archiveCopyPath,
    items: manifest.items,
    conflictCount: manifest.conflictCount,
  };
}

export async function commitImport(
  vaultRoot: string,
  input: {
    previewId: string;
    mode?: ImportMode;
  },
): Promise<CommitImportResult> {
  const manifest = await readJsonFile<PreviewManifest>(
    vaultRoot,
    path.posix.join("settings", "import-previews", input.previewId, "preview.json"),
  );
  const mode = input.mode ?? manifest.mode;
  const readyItems = manifest.items.filter((item) => item.targetPath && item.stagedPath && item.status !== "skipped");

  const backupPath =
    mode === "standard+backup"
      ? await createRawImportBackup(vaultRoot, manifest.previewId, manifest.archiveCopyPath)
      : undefined;

  for (const item of readyItems) {
    const relativeTarget = item.targetPath as string;
    const stagedPath = item.stagedPath as string;
    const buffer = await readFile(resolveSafePath(vaultRoot, stagedPath));

    if (relativeTarget.endsWith(".md")) {
      await writeManuscriptFile(vaultRoot, relativeTarget, buffer.toString("utf8"));
      continue;
    }

    if (relativeTarget.endsWith(".json")) {
      await writeJsonFile(vaultRoot, relativeTarget, JSON.parse(buffer.toString("utf8")));
      continue;
    }

    await ensureParent(vaultRoot, relativeTarget);
    await writeFile(resolveSafePath(vaultRoot, relativeTarget), buffer);
  }

  return {
    previewId: manifest.previewId,
    committedCount: readyItems.length,
    backupPath,
  };
}

export async function exportProjectData(
  vaultRoot: string,
  input: {
    projectId: string;
    novelId: string;
    scope: ExportScope;
    format: ExportFormat;
    chapterId?: string;
    template?: ExportTemplate;
  },
): Promise<ExportResult> {
  const template = input.template ?? (input.format === "epub" ? "epub-reader" : "reading");
  const { title, body } = await collectExportBody(vaultRoot, {
    ...input,
    template,
  });

  const extensionByFormat: Record<ExportFormat, string> = {
    md: "md",
    txt: "txt",
    docx: "docx",
    pdf: "pdf",
    epub: "epub",
  };
  const outputPath = path.posix.join(
    "backups",
    "exports",
    `${input.projectId}-${input.novelId}-${input.scope}-${template}-${nowStamp()}.${extensionByFormat[input.format]}`,
  );
  await ensureParent(vaultRoot, outputPath);

  if (input.format === "md" || input.format === "txt") {
    await writeFile(resolveSafePath(vaultRoot, outputPath), body, "utf8");
  } else if (input.format === "docx") {
    await writeFile(resolveSafePath(vaultRoot, outputPath), await buildDocxBuffer(title, body));
  } else if (input.format === "pdf") {
    await writeFile(resolveSafePath(vaultRoot, outputPath), buildPdfBuffer(title, body));
  } else if (input.format === "epub") {
    await writeFile(resolveSafePath(vaultRoot, outputPath), await buildEpubBuffer(title, body));
  }

  return {
    format: input.format,
    scope: input.scope,
    template,
    outputPath,
  };
}

export async function preparePublishPackage(
  vaultRoot: string,
  input: PublishPrepareInput,
): Promise<PublishPrepareResult> {
  const { body } = await collectExportBody(vaultRoot, {
    projectId: input.projectId,
    novelId: input.novelId,
    chapterId: input.chapterId,
    scope: input.scope,
    format: "md",
    template: "web",
  });

  const sensitiveWords = input.sensitiveWords ?? ["违禁词", "血腥", "政治敏感"];
  const sensitiveHits = sensitiveWords.filter((word) => body.includes(word) || input.summary.includes(word));
  const publishRoot = path.posix.join(
    "projects",
    input.projectId,
    "novels",
    input.novelId,
    "publish",
    `${input.platform}-${nowStamp()}`,
  );
  const manifestPath = path.posix.join(publishRoot, "manifest.json");
  const markdownPath = path.posix.join(publishRoot, "content.md");
  const htmlPath = path.posix.join(publishRoot, "content.html");

  await writeJsonFile(vaultRoot, manifestPath, {
    platform: input.platform,
    title: input.title,
    summary: input.summary,
    tags: input.tags ?? [],
    authorNote: input.authorNote ?? "",
    source: {
      projectId: input.projectId,
      novelId: input.novelId,
      chapterId: input.chapterId,
      scope: input.scope,
    },
    sensitiveHits,
    preparedAt: new Date().toISOString(),
  });
  await writeFile(resolveSafePath(vaultRoot, markdownPath), `# ${input.title}\n\n${body}\n\n${input.authorNote ?? ""}`, "utf8");
  await writeFile(resolveSafePath(vaultRoot, htmlPath), renderHtmlDocument(input.title, body), "utf8");

  return {
    manifestPath,
    outputPaths: [markdownPath, htmlPath],
    sensitiveHits,
  };
}

export async function createVaultBackup(
  vaultRoot: string,
  input: {
    encrypt?: boolean;
    password?: string;
    label?: string;
  } = {},
): Promise<BackupResult> {
  const zipBuffer = await buildBackupZip(vaultRoot);
  const encrypt = input.encrypt ?? false;

  if (encrypt && !input.password) {
    throw new Error("password is required for encrypted backups");
  }

  const fileName = `${input.label ?? "vault"}-${nowStamp()}.${encrypt ? "slgbackup.enc" : "slgbackup.zip"}`;
  const outputPath = path.posix.join("backups", fileName);
  await ensureParent(vaultRoot, outputPath);
  await writeFile(
    resolveSafePath(vaultRoot, outputPath),
    encrypt ? encryptBuffer(zipBuffer, input.password ?? "") : zipBuffer,
  );

  return {
    encrypted: encrypt,
    outputPath,
  };
}

export async function restoreVaultBackup(
  vaultRoot: string,
  input: {
    backupPath: string;
    password?: string;
  },
): Promise<RestoreBackupResult> {
  const absoluteBackupPath = resolveSafePath(vaultRoot, input.backupPath);
  const backupBytes = await readFile(absoluteBackupPath);
  const encrypted = input.backupPath.endsWith(".enc");
  const zipBytes = encrypted ? decryptBuffer(backupBytes, input.password ?? "") : backupBytes;
  const zip = await JSZip.loadAsync(zipBytes);

  let restoredFiles = 0;
  for (const [entryName, entry] of Object.entries(zip.files) as Array<
    [string, { dir: boolean; async(type: "nodebuffer"): Promise<Buffer> }]
  >) {
    if (entry.dir) {
      continue;
    }

    const relativePath = normalizeEntryPath(entryName);
    await writeRestoredEntry(vaultRoot, relativePath, await entry.async("nodebuffer"));
    if (relativePath !== "manifest.json") {
      restoredFiles += 1;
    }
  }

  return {
    restoredFiles,
    encrypted,
  };
}
