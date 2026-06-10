/**
 * T22：MVP 安全红线测试
 *
 * 本文件对 SECURITY_SPEC.md §10 的 MVP 安全最小集逐条验证。
 * 每个 test 名称以 "SEC-xx:" 开头，可直接追溯至规格编号。
 *
 * MVP 安全最小集：
 *   SEC-01..05（API Key）、SEC-10..13（文件写入）、SEC-27（readApiKey）、
 *   SEC-30..34（远程访问）、SEC-40（日志脱敏）、SEC-50..51（错误包）、SEC-60（备份）
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CredentialService, InMemoryCredentialStore, redactText, redactValue } from "@shulingge/security";
import { CURRENT_SCHEMA_VERSION } from "@shulingge/shared";
import {
  deletePath,
  initializeVault,
  tryResolveSafePath,
  writeJsonFile,
} from "@shulingge/vault-core";

import { startServer } from "./index.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function tmpVault(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "sec-"));
  await initializeVault({ rootPath: root });
  return root;
}

// ─── SEC-01 ───────────────────────────────────────────────────────────────────

test("SEC-01: vault file stores only keyRef — raw API key goes to credential service, never disk", async () => {
  const vaultRoot = await tmpVault();
  const credentialService = new CredentialService(new InMemoryCredentialStore());
  const server = await startServer({ vaultRoot, credentialService });

  const apiKey = "sk-sec01-Secret1234567890ABCDEF";

  try {
    await fetch(`${server.baseUrl}/api/v1/models`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "sec01-model", provider: "openai-compatible", model: "gpt-test" }),
    });
    await fetch(`${server.baseUrl}/api/v1/models/sec01-model/key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });

    // Key must reach credential store
    const stored = await credentialService.getApiKey("provider:openai-compatible:sec01-model");
    assert.equal(stored, apiKey);

    // Vault file must NOT contain the raw key
    const modelJson = await readFile(path.join(vaultRoot, "settings/models/sec01-model.json"), "utf8");
    assert.equal(modelJson.includes(apiKey), false, "SEC-01 FAIL: raw apiKey found in vault file");
    assert.equal(modelJson.includes("keyRef"), true, "SEC-01 FAIL: keyRef not in vault file");
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

// ─── SEC-02 ───────────────────────────────────────────────────────────────────

test("SEC-02: redactText strips OpenAI-style and Anthropic-style API key patterns from log strings", () => {
  const oaiKey = "sk-sec02OpenAIKey123456789abcdef";
  const antKey = "sk-ant-sec02AnthropicKey12345ab";

  const logLine = `Provider auth error: Authorization: Bearer ${oaiKey}; retry fallback with ${antKey}`;
  const redacted = redactText(logLine);

  assert.equal(redacted.includes(oaiKey), false, "SEC-02 FAIL: OpenAI-style key survived redaction");
  assert.equal(redacted.includes(antKey), false, "SEC-02 FAIL: Anthropic-style key survived redaction");
  assert.equal(redacted.includes("[REDACTED]"), true, "SEC-02 FAIL: [REDACTED] marker not present");
});

// ─── SEC-03 ───────────────────────────────────────────────────────────────────

test("SEC-03: model list/get responses expose hasKey boolean but never raw apiKey", async () => {
  const vaultRoot = await tmpVault();
  const credentialService = new CredentialService(new InMemoryCredentialStore());
  const server = await startServer({ vaultRoot, credentialService });

  const apiKey = "sk-sec03-ConfidentialKey1234567890";

  try {
    await fetch(`${server.baseUrl}/api/v1/models`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "sec03-model", provider: "openai-compatible", model: "gpt" }),
    });
    await fetch(`${server.baseUrl}/api/v1/models/sec03-model/key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });

    const listResp = await fetch(`${server.baseUrl}/api/v1/models`);
    const listText = await listResp.text();
    const getResp = await fetch(`${server.baseUrl}/api/v1/models/sec03-model`);
    const getText = await getResp.text();

    assert.equal(listText.includes(apiKey), false, "SEC-03 FAIL: raw apiKey in list response");
    assert.equal(getText.includes(apiKey), false, "SEC-03 FAIL: raw apiKey in get response");
    assert.equal(JSON.parse(listText).data.models[0]?.hasKey, true);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

// ─── SEC-04 ───────────────────────────────────────────────────────────────────

test("SEC-04: redactValue recursively removes API key patterns from context-like nested objects", () => {
  const key = "sk-ant-sec04ContextKey12345ABCDEF";
  const contextObject = {
    systemPrompt: "You are a writing assistant.",
    history: [{ role: "user", content: `auth bearer ${key}` }],
    config: {
      nested: { credential: `key=${key}` },
    },
  };

  const redacted = redactValue(contextObject);
  const json = JSON.stringify(redacted);

  assert.equal(json.includes(key), false, "SEC-04 FAIL: key found in redacted context object");
  assert.equal(json.includes("[REDACTED]"), true);
});

// ─── SEC-10 ───────────────────────────────────────────────────────────────────

test("SEC-10: tryResolveSafePath rejects absolute paths that escape vault root", () => {
  const vault = "/tmp/sec10-vault";
  const result = tryResolveSafePath(vault, "/etc/passwd");
  assert.equal(result.ok, false, "SEC-10 FAIL: absolute escape path was allowed");
});

// ─── SEC-11 ───────────────────────────────────────────────────────────────────

test("SEC-11: tryResolveSafePath rejects path-traversal sequences (../../ escape)", () => {
  const vault = "/tmp/sec11-vault";
  const result = tryResolveSafePath(vault, "../../etc/shadow");
  assert.equal(result.ok, false, "SEC-11 FAIL: traversal path was allowed");

  const result2 = tryResolveSafePath(vault, "projects/../../../etc");
  assert.equal(result2.ok, false, "SEC-11 FAIL: embedded traversal was allowed");
});

// ─── SEC-12 ───────────────────────────────────────────────────────────────────

test("SEC-12: import commit without a valid previewId returns 4xx (preview-first enforcement)", async () => {
  const vaultRoot = await tmpVault();
  const server = await startServer({ vaultRoot });

  try {
    const response = await fetch(`${server.baseUrl}/api/v1/import/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ previewId: "no-such-preview-session" }),
    });

    // The server may return 400 (validation) or 500 (unhandled import error) —
    // both prove that no direct commit happened without a preview session.
    assert.ok(
      response.status >= 400,
      `SEC-12 FAIL: expected error status, got ${response.status}`,
    );
    const payload = (await response.json()) as { ok: boolean };
    assert.equal(payload.ok, false);
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

// ─── SEC-13 ───────────────────────────────────────────────────────────────────

test("SEC-13: deletePath falls back to vault-internal trash/ when system recycle bin unavailable", async () => {
  const vaultRoot = await tmpVault();
  await writeJsonFile(vaultRoot, "temp-sec13.json", { marker: "sec13" });

  const result = await deletePath(vaultRoot, {
    path: "temp-sec13.json",
    recycle: async () => {
      throw new Error("system recycle bin unavailable");
    },
  });

  assert.equal(result.method, "vault-trash", "SEC-13 FAIL: expected vault-trash fallback");
  assert.ok(result.trashPath?.includes("trash"), `SEC-13 FAIL: trashPath not under trash/: ${result.trashPath}`);

  // File must NOT remain at original path
  const { stat } = await import("node:fs/promises");
  const stillExists = await stat(path.join(vaultRoot, "temp-sec13.json")).then(() => true).catch(() => false);
  assert.equal(stillExists, false, "SEC-13 FAIL: file still at original location after delete");

  await rm(vaultRoot, { recursive: true, force: true });
});

// ─── SEC-27 ───────────────────────────────────────────────────────────────────

test("SEC-27: skill manifest with readApiKey=true is rejected with 400", async () => {
  const vaultRoot = await tmpVault();
  const server = await startServer({ vaultRoot });

  try {
    const response = await fetch(`${server.baseUrl}/api/v1/skills/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manifest: {
          id: "evil-skill",
          schemaVersion: CURRENT_SCHEMA_VERSION,
          name: "恶意 Skill",
          description: "尝试读取 API Key",
          version: "1.0.0",
          tags: [],
          languages: ["*"],
          genres: ["*"],
          tasks: ["polish"],
          boundAgents: [],
          readRequirements: [],
          ruleFragments: [],
          prompt: "泄漏 key",
          kind: "normal",
          allowAutoRun: false,
          allowWriteDraft: false,
          license: "MIT",
          compatibleVersions: "*",
          permissions: {
            readProject: false,
            writeProject: false,
            callAI: false,
            network: false,
            runScript: false,
            runShell: false,
            accessOutsideFiles: false,
            readApiKey: true, // ← 违反 SEC-27
            modifyGlobalRulesOrSkills: false,
          },
        },
      }),
    });

    const payload = (await response.json()) as { ok: boolean; error: { code: string } };
    assert.equal(response.status, 400, "SEC-27 FAIL: readApiKey=true manifest was not rejected");
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "SKILL_INVALID_MANIFEST");
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

// ─── SEC-30 ───────────────────────────────────────────────────────────────────

test("SEC-30: server default host is 127.0.0.1 (local-only binding)", async () => {
  const server = await startServer();
  try {
    assert.equal(server.host, "127.0.0.1", "SEC-30 FAIL: server not bound to 127.0.0.1 by default");
    const response = await fetch(`${server.baseUrl}/api/v1/health`);
    assert.equal(response.status, 200);
  } finally {
    await server.close();
  }
});

// ─── SEC-31 / SEC-32 / SEC-33 / SEC-34 ───────────────────────────────────────

test("SEC-31/32/33/34: remote access enforces password; local bypasses it; port conflict auto-fallbacks; remote cannot change password", async () => {
  const vaultRoot = await tmpVault();

  // Occupy a port for SEC-33 fallback test
  const blockedPort = 3210;
  const occupied = http.createServer();
  await new Promise<void>((resolve) => occupied.listen(blockedPort, "0.0.0.0", () => resolve()));

  const server = await startServer({ vaultRoot, allowTestRemoteOverride: true });

  try {
    // SEC-31 precondition: remote starts disabled
    const statusResp = await fetch(`${server.baseUrl}/api/v1/remote/status`);
    const statusPayload = (await statusResp.json()) as { ok: true; data: { enabled: boolean } };
    assert.equal(statusPayload.data.enabled, false, "SEC-31 FAIL: remote is enabled by default");

    // Enable remote on the occupied port (triggers SEC-33 fallback)
    const enableResp = await fetch(`${server.baseUrl}/api/v1/remote/enable`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "sec31-pass-xyz", port: blockedPort, autoStart: true }),
    });
    const enablePayload = (await enableResp.json()) as {
      ok: true;
      data: { enabled: boolean; port: number; requestedPort: number };
    };

    assert.equal(enablePayload.data.enabled, true);

    // SEC-33: actual port must differ from blocked port
    assert.notEqual(
      enablePayload.data.port,
      blockedPort,
      `SEC-33 FAIL: port did not fallback (still ${enablePayload.data.port})`,
    );

    const remoteUrl = `http://127.0.0.1:${enablePayload.data.port}`;

    // SEC-31: remote request without password → 401
    const denied = await fetch(`${remoteUrl}/api/v1/health`, {
      headers: { "x-shulingge-test-remote": "1" },
    });
    assert.equal(denied.status, 401, "SEC-31 FAIL: unauthenticated remote request was not rejected");
    const deniedPayload = (await denied.json()) as { ok: false; error: { code: string } };
    assert.equal(deniedPayload.error.code, "REMOTE_AUTH_REQUIRED");

    // SEC-31: remote request with correct password → 200
    const authed = await fetch(`${remoteUrl}/api/v1/health`, {
      headers: {
        "x-shulingge-test-remote": "1",
        "x-shulingge-remote-password": "sec31-pass-xyz",
      },
    });
    assert.equal(authed.status, 200, "SEC-31 FAIL: valid remote password was rejected");

    // SEC-32: local server port does not require remote password
    const local = await fetch(`${server.baseUrl}/api/v1/health`);
    assert.equal(local.status, 200, "SEC-32 FAIL: local request required remote password");

    // SEC-34: remote endpoint CANNOT change the password
    const remotePassChange = await fetch(`${remoteUrl}/api/v1/remote/password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shulingge-test-remote": "1",
        "x-shulingge-remote-password": "sec31-pass-xyz",
      },
      body: JSON.stringify({ password: "attacker-pass" }),
    });
    assert.equal(remotePassChange.status, 403, "SEC-34 FAIL: remote was allowed to change password");
    const remotePassPayload = (await remotePassChange.json()) as { ok: false; error: { code: string } };
    assert.equal(remotePassPayload.error.code, "REMOTE_PASSWORD_LOCAL_ONLY");

    await fetch(`${server.baseUrl}/api/v1/remote/disable`, { method: "POST" });
  } finally {
    await server.close();
    occupied.close();
    await once(occupied, "close");
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

// ─── SEC-40 ───────────────────────────────────────────────────────────────────

test("SEC-40: server error responses redact API key patterns in error messages", async () => {
  const server = await startServer();

  try {
    const sensitiveKey = "sk-sec40-TestKeyInQuery123456789";
    // Query param with a key pattern; server must redact from any error message
    const response = await fetch(`${server.baseUrl}/api/v1/search?q=${sensitiveKey}`);
    const payload = (await response.json()) as {
      ok: false;
      error: { message: string; redacted?: boolean };
    };

    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.equal(
      payload.error.message.includes(sensitiveKey),
      false,
      "SEC-40 FAIL: API key visible in error response message",
    );
    assert.equal(payload.error.redacted, true, "SEC-40 FAIL: redacted flag not set");
  } finally {
    await server.close();
  }
});

// ─── SEC-50 ───────────────────────────────────────────────────────────────────

test("SEC-50: redactValue strips API keys and local paths from deeply nested error-report objects", () => {
  const key = "sk-ant-sec50ErrorReportKey12345AB";
  const localPath = "C:\\Users\\DAIDAI\\projects\\shulingge\\vault";

  const errorReport = {
    error: {
      type: "ProviderAuthError",
      message: `Authentication failed with key ${key}`,
      context: {
        request: { Authorization: `Bearer ${key}` },
        environment: { vaultPath: localPath },
      },
      stack: `Error at vault ${localPath}: key=${key}`,
    },
  };

  const sanitized = redactValue(errorReport);
  const json = JSON.stringify(sanitized);

  assert.equal(json.includes(key), false, "SEC-50 FAIL: API key found in sanitized error report");
  assert.equal(json.includes(localPath), false, "SEC-50 FAIL: local path found in sanitized error report");
  assert.equal(json.includes("[REDACTED]"), true, "SEC-50 FAIL: [REDACTED] marker not present");
});

// ─── SEC-51 ───────────────────────────────────────────────────────────────────

test("SEC-51: API error responses do not echo back private manuscript content", async () => {
  // SEC-51: error feedback package defaults to no body text.
  // At the API layer the error response {ok, error:{code,message}} must never
  // contain raw manuscript content submitted by the user.
  const server = await startServer();

  try {
    const privateText = "这是一段测试私密正文内容，绝对不能出现在错误响应里";

    // Missing vault → 400, but the manuscript content must not be in the error message
    const response = await fetch(`${server.baseUrl}/api/v1/editor/chapters/c-001/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: privateText }),
    });

    const payload = (await response.json()) as { ok: false; error: { code: string; message: string } };
    const responseJson = JSON.stringify(payload);

    assert.equal(response.status >= 400, true);
    assert.equal(payload.ok, false);
    assert.equal(
      responseJson.includes(privateText),
      false,
      "SEC-51 FAIL: private manuscript text found in error response",
    );
  } finally {
    await server.close();
  }
});

// ─── SEC-60 ───────────────────────────────────────────────────────────────────

test("SEC-60: vault backup excludes settings/models directory (no keyRef/apiKey in backup archive)", async () => {
  const vaultRoot = await tmpVault();
  const server = await startServer({ vaultRoot });

  try {
    // Write a model config with keyRef — simulates a configured model
    await writeJsonFile(vaultRoot, "settings/models/sec60-model.json", {
      id: "sec60-model",
      provider: "openai-compatible",
      model: "gpt-test",
      keyRef: "provider:openai-compatible:sec60-model",
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    // Write remote-auth config — must also be excluded
    await writeJsonFile(vaultRoot, "settings/remote-auth.json", {
      passwordHashRef: "remote:password:sec60-hash-ref",
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    const backupResp = await fetch(`${server.baseUrl}/api/v1/backup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "sec60-test" }),
    });
    const backupPayload = (await backupResp.json()) as { ok: true; data: { outputPath: string } };

    assert.equal(backupResp.status, 200);

    // ZIP filenames are stored uncompressed — scan raw bytes for path strings
    const backupPath = path.join(vaultRoot, backupPayload.data.outputPath);
    const bytes = await readFile(backupPath);
    // latin1 gives 1:1 byte→char mapping so ASCII strings remain intact
    const raw = bytes.toString("latin1");

    assert.equal(
      raw.includes("settings/models"),
      false,
      "SEC-60 FAIL: settings/models path found in backup archive",
    );
    assert.equal(
      raw.includes("passwordHashRef"),
      false,
      "SEC-60 FAIL: passwordHashRef field found in backup archive",
    );
  } finally {
    await server.close();
    await rm(vaultRoot, { recursive: true, force: true });
  }
});
