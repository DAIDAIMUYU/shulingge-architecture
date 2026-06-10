import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CURRENT_SCHEMA_VERSION, type ProjectSeries } from "@shulingge/shared";
import {
  initializeProject,
  initializeVault,
  readJsonFile,
  readManuscriptFile,
  resolveSafePath,
  writeJsonFile,
  writeManuscriptFile,
} from "@shulingge/vault-core";

import {
  commitImport,
  createVaultBackup,
  exportProjectData,
  preparePublishPackage,
  previewImport,
  restoreVaultBackup,
} from "./index.js";

const require = createRequire(import.meta.url);
const JSZip = require("jszip") as {
  new (): {
    file(name: string, data: string | Buffer): void;
    generateAsync(options: { type: "nodebuffer" }): Promise<Buffer>;
  };
  loadAsync(input: Buffer): Promise<{
    files: Record<string, { async(type: "text"): Promise<string> }>;
    file(name: string): { async(type: "text"): Promise<string> } | null;
  }>;
};

async function createFixtureVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "shulingge-import-export-"));
  await initializeVault({ rootPath: root });

  const series: ProjectSeries = {
    id: "demo-series",
    name: "Demo",
    type: "original",
    defaultNovelId: "main",
    sharedPath: "shared",
    readPolicyPath: "shared/read-policy.json",
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  await initializeProject(root, series, {
    id: "main",
    name: "Main",
    branchType: "main",
  });

  await writeManuscriptFile(
    root,
    "projects/demo-series/novels/main/manuscripts/chapter-001.md",
    "Original chapter body.",
  );
  await writeJsonFile(root, "settings/app.json", {
    id: "settings",
    remote: {
      enabled: false,
      passwordHashRef: "secret-hash-ref",
    },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
  await writeJsonFile(root, "settings/models/writer-main.json", {
    id: "writer-main",
    provider: "openai-compatible",
    model: "gpt-test",
    keyRef: "provider:openai-compatible:writer-main",
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  return root;
}

async function createImportArchive(): Promise<string> {
  const zip = new JSZip();
  zip.file("manuscripts/chapter-002.md", "Imported chapter body.");
  zip.file(
    "characters/kanae.json",
    JSON.stringify({
      id: "kanae",
      name: "Kanae",
      links: [],
      voice: { typicalLines: [], forbiddenLines: [], honorifics: {} },
      forbiddenWrites: [],
      schemaVersion: CURRENT_SCHEMA_VERSION,
    }),
  );

  const archivePath = path.join(os.tmpdir(), `shulingge-import-${Date.now()}.zip`);
  await writeFile(archivePath, await zip.generateAsync({ type: "nodebuffer" }));
  return archivePath;
}

test("import preview extracts into preview area before commit and then writes mapped files", async () => {
  const vaultRoot = await createFixtureVault();
  const archivePath = await createImportArchive();

  try {
    const preview = await previewImport(vaultRoot, {
      archivePath,
      projectId: "demo-series",
      novelId: "main",
    });

    assert.equal(preview.items.some((item) => item.stagedPath?.includes("settings/import-previews/")), true);
    assert.equal(preview.items.some((item) => item.targetPath?.includes("manuscripts/chapter-002.md")), true);

    const commit = await commitImport(vaultRoot, {
      previewId: preview.previewId,
    });

    const manuscript = await readManuscriptFile(
      vaultRoot,
      "projects/demo-series/novels/main/manuscripts/chapter-002.md",
    );
    const character = await readJsonFile<{ id: string }>(
      vaultRoot,
      "projects/demo-series/shared/characters/kanae.json",
    );

    assert.equal(commit.committedCount, 2);
    assert.equal(Boolean(commit.backupPath), true);
    assert.equal(manuscript, "Imported chapter body.");
    assert.equal(character.id, "kanae");
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
    await rm(archivePath, { force: true });
  }
});

test("export writes md/txt files under vault backups", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    const result = await exportProjectData(vaultRoot, {
      projectId: "demo-series",
      novelId: "main",
      scope: "chapter",
      format: "txt",
      chapterId: "chapter-001",
    });

    const content = await readFile(resolveSafePath(vaultRoot, result.outputPath), "utf8");

    assert.equal(result.outputPath.includes("backups/exports/"), true);
    assert.equal(content, "Original chapter body.");
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("export writes docx, pdf, and epub artifacts with the selected template", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    const docxResult = await exportProjectData(vaultRoot, {
      projectId: "demo-series",
      novelId: "main",
      scope: "novel",
      format: "docx",
      template: "submission",
    });
    const pdfResult = await exportProjectData(vaultRoot, {
      projectId: "demo-series",
      novelId: "main",
      scope: "chapter",
      format: "pdf",
      chapterId: "chapter-001",
      template: "reading",
    });
    const epubResult = await exportProjectData(vaultRoot, {
      projectId: "demo-series",
      novelId: "main",
      scope: "novel",
      format: "epub",
    });

    const docxBytes = await readFile(resolveSafePath(vaultRoot, docxResult.outputPath));
    const pdfBytes = await readFile(resolveSafePath(vaultRoot, pdfResult.outputPath));
    const epubBytes = await readFile(resolveSafePath(vaultRoot, epubResult.outputPath));

    const docxZip = await JSZip.loadAsync(docxBytes);
    const epubZip = await JSZip.loadAsync(epubBytes);

    assert.equal(docxResult.template, "submission");
    assert.equal(docxResult.outputPath.endsWith(".docx"), true);
    assert.equal(docxZip.file("word/document.xml") !== null, true);
    assert.equal(pdfResult.outputPath.endsWith(".pdf"), true);
    assert.equal(pdfBytes.toString("utf8", 0, 8).startsWith("%PDF-1.4"), true);
    assert.equal(epubResult.template, "epub-reader");
    assert.equal(epubResult.outputPath.endsWith(".epub"), true);
    assert.equal(await epubZip.file("mimetype")?.async("text"), "application/epub+zip");
    assert.equal(epubZip.file("OEBPS/content.xhtml") !== null, true);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("publish prepare writes separated publish artifacts and reports sensitive hits", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    await writeManuscriptFile(
      vaultRoot,
      "projects/demo-series/novels/main/manuscripts/chapter-002.md",
      "这一章包含血腥描写，需要发布前检查。",
    );

    const result = await preparePublishPackage(vaultRoot, {
      projectId: "demo-series",
      novelId: "main",
      chapterId: "chapter-002",
      scope: "chapter",
      platform: "qidian",
      title: "第二章 发布版",
      summary: "含有血腥内容的测试简介",
      tags: ["测试", "发布"],
      authorNote: "作者的话。",
      sensitiveWords: ["血腥", "违禁词"],
    });

    const manifest = await readJsonFile<{
      platform: string;
      title: string;
      summary: string;
      tags: string[];
      authorNote: string;
      sensitiveHits: string[];
    }>(vaultRoot, result.manifestPath);
    const markdown = await readFile(resolveSafePath(vaultRoot, result.outputPaths[0] ?? ""), "utf8");
    const html = await readFile(resolveSafePath(vaultRoot, result.outputPaths[1] ?? ""), "utf8");

    assert.equal(result.manifestPath.includes("/publish/qidian-"), true);
    assert.deepEqual(result.sensitiveHits, ["血腥"]);
    assert.equal(manifest.platform, "qidian");
    assert.equal(manifest.title, "第二章 发布版");
    assert.deepEqual(manifest.tags, ["测试", "发布"]);
    assert.deepEqual(manifest.sensitiveHits, ["血腥"]);
    assert.equal(markdown.includes("作者的话。"), true);
    assert.equal(html.includes("<h1>第二章 发布版</h1>"), true);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("backup excludes models and remote password data, and encrypted backup requires password", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    const plain = await createVaultBackup(vaultRoot);
    const zip = await JSZip.loadAsync(await readFile(resolveSafePath(vaultRoot, plain.outputPath)));
    const names = Object.keys(zip.files);
    const settingsJson = JSON.parse(await zip.file("settings/app.json")!.async("text")) as {
      remote?: { passwordHashRef?: string };
    };

    assert.equal(names.some((name) => name.startsWith("settings/models/")), false);
    assert.equal("passwordHashRef" in (settingsJson.remote ?? {}), false);

    await assert.rejects(() =>
      createVaultBackup(vaultRoot, {
        encrypt: true,
      }),
    );

    const encrypted = await createVaultBackup(vaultRoot, {
      encrypt: true,
      password: "backup-pass",
      label: "secure",
    });
    const encryptedPayload = await readFile(resolveSafePath(vaultRoot, encrypted.outputPath), "utf8");

    assert.equal(encrypted.encrypted, true);
    assert.equal(encrypted.outputPath.endsWith(".enc"), true);
    assert.equal(encryptedPayload.includes("ciphertext"), true);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("backup restore recovers sanitized files from plain and encrypted archives", async () => {
  const vaultRoot = await createFixtureVault();

  try {
    const plain = await createVaultBackup(vaultRoot, {
      label: "restore-plain",
    });

    await writeManuscriptFile(
      vaultRoot,
      "projects/demo-series/novels/main/manuscripts/chapter-001.md",
      "Mutated after plain backup.",
    );

    const plainRestore = await restoreVaultBackup(vaultRoot, {
      backupPath: plain.outputPath,
    });
    const restoredPlain = await readManuscriptFile(
      vaultRoot,
      "projects/demo-series/novels/main/manuscripts/chapter-001.md",
    );

    assert.equal(plainRestore.encrypted, false);
    assert.equal(plainRestore.restoredFiles > 0, true);
    assert.equal(restoredPlain, "Original chapter body.");

    const encrypted = await createVaultBackup(vaultRoot, {
      encrypt: true,
      password: "restore-pass",
      label: "restore-encrypted",
    });

    await writeManuscriptFile(
      vaultRoot,
      "projects/demo-series/novels/main/manuscripts/chapter-001.md",
      "Mutated after encrypted backup.",
    );

    const encryptedRestore = await restoreVaultBackup(vaultRoot, {
      backupPath: encrypted.outputPath,
      password: "restore-pass",
    });
    const restoredEncrypted = await readManuscriptFile(
      vaultRoot,
      "projects/demo-series/novels/main/manuscripts/chapter-001.md",
    );
    const restoredSettings = await readJsonFile<{ remote?: { passwordHashRef?: string } }>(
      vaultRoot,
      "settings/app.json",
    );

    assert.equal(encryptedRestore.encrypted, true);
    assert.equal(restoredEncrypted, "Original chapter body.");
    assert.equal("passwordHashRef" in (restoredSettings.remote ?? {}), false);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
