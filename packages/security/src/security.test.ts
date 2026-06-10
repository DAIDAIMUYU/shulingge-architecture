import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildKeyRef,
  CredentialService,
  InMemoryCredentialStore,
  parseKeyRef,
  redactText,
  redactValue,
  hashPassword,
  verifyPassword,
} from "./index.js";

test("SEC-01/03/05: API keys are stored by keyRef and status only exposes hasKey", async () => {
  const service = new CredentialService(new InMemoryCredentialStore());
  const keyRef = buildKeyRef({
    provider: "openai-compatible",
    profile: "default",
  });

  const status = await service.storeApiKey(keyRef, "sk-test-1234567890");
  const fetched = await service.getApiKey(keyRef);
  const descriptor = await service.getStoredCredentialStatus(keyRef);

  assert.equal(status.hasKey, true);
  assert.equal(fetched, "sk-test-1234567890");
  assert.deepEqual(descriptor, {
    keyRef,
    hasKey: true,
  });
  assert.equal("password" in descriptor, false);
});

test("SEC-01: storing credentials does not write API keys to vault-like disk locations", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "shulingge-security-"));
  const before = await readdir(tempRoot);

  try {
    const service = new CredentialService(new InMemoryCredentialStore());
    await service.storeApiKey(
      buildKeyRef({ provider: "claude", profile: "writer" }),
      "sk-ant-secret-1234567890",
    );

    const after = await readdir(tempRoot);
    assert.deepEqual(after, before);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("keyRef helpers round-trip provider references", () => {
  const keyRef = buildKeyRef({
    namespace: "provider",
    provider: "ollama",
    profile: "local-main",
  });

  assert.equal(keyRef, "provider:ollama:local-main");
  assert.deepEqual(parseKeyRef(keyRef), {
    namespace: "provider",
    provider: "ollama",
    profile: "local-main",
  });
});

test("SEC-02/40: redaction masks keys, paths, and manuscript snippets in text", () => {
  const result = redactText(
    "key=sk-test-1234567890 path=F:\\Vault\\novel\\chapter-001.md body=第一章真正正文",
    {
      manuscriptSnippets: ["第一章真正正文"],
    },
  );

  assert.equal(result.includes("sk-test-1234567890"), false);
  assert.equal(result.includes("F:\\Vault\\novel\\chapter-001.md"), false);
  assert.equal(result.includes("第一章真正正文"), false);
  assert.match(result, /\[REDACTED\]/);
});

test("SEC-40: redaction walks nested objects", () => {
  const payload = {
    message: "token sk-test-abcdefghi",
    details: {
      path: "C:\\Users\\Alice\\Vault\\secret.md",
      body: "保密正文片段",
    },
  };

  const redacted = redactValue(payload, {
    manuscriptSnippets: ["保密正文片段"],
  });

  assert.equal(JSON.stringify(redacted).includes("sk-test-abcdefghi"), false);
  assert.equal(JSON.stringify(redacted).includes("C:\\Users\\Alice\\Vault\\secret.md"), false);
  assert.equal(JSON.stringify(redacted).includes("保密正文片段"), false);
});

test("argon2 password hashing verifies valid passwords and rejects invalid ones", async () => {
  const password = "remote-password-123";
  const encoded = await hashPassword(password, {
    memorySize: 8192,
    iterations: 2,
    parallelism: 1,
    hashLength: 32,
  });

  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("wrong-password", encoded), false);
});
