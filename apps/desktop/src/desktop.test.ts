import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDesktopRuntime } from "./server-runtime.js";
import { buildDesktopReleasePlan } from "./release.js";
import { createDesktopWindowDescriptors, resolveDesktopWindowUrl } from "./window-html.js";

test("desktop runtime starts and gracefully shuts down the local server", async () => {
  const runtime = await createDesktopRuntime();

  try {
    const response = await fetch(`${runtime.server.baseUrl}/api/v1/health`);
    const payload = (await response.json()) as { ok: true; data: { status: string } };

    assert.equal(response.status, 200);
    assert.equal(payload.data.status, "ok");
  } finally {
    await runtime.cleanup();
  }
});

test("desktop window urls point to real local server pages instead of data-url shells", () => {
  const descriptors = createDesktopWindowDescriptors();
  const workspaceUrl = resolveDesktopWindowUrl("http://127.0.0.1:3210", descriptors[0]!);
  const runsUrl = resolveDesktopWindowUrl("http://127.0.0.1:3210", descriptors[2]!);

  assert.equal(workspaceUrl, "http://127.0.0.1:3210/");
  assert.equal(runsUrl, "http://127.0.0.1:3210/desktop/runs");
});

test("desktop window descriptors expose differentiated multi-window desktop routes", () => {
  const descriptors = createDesktopWindowDescriptors();

  assert.equal(descriptors.length, 3);
  assert.equal(descriptors.some((item) => item.id === "workspace"), true);
  assert.equal(descriptors.some((item) => item.id === "mobile-console"), true);
  assert.equal(descriptors.some((item) => item.id === "runs"), true);
  assert.equal(new Set(descriptors.map((item) => item.route)).size, descriptors.length);
  assert.equal(descriptors.every((item) => item.route.startsWith("/desktop/")), true);
});

test("release acceptance baseline keeps local-only runtime and stable packaging metadata", async () => {
  const runtime = await createDesktopRuntime();
  const plan = buildDesktopReleasePlan("2.1.1");

  try {
    const healthResponse = await fetch(`${runtime.server.baseUrl}/api/v1/health`);
    const remoteStatusResponse = await fetch(`${runtime.server.baseUrl}/api/v1/remote/status`);
    const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

    assert.equal(healthResponse.status, 200);
    assert.equal(remoteStatusResponse.status, 200);
    assert.equal(runtime.server.host, "127.0.0.1");
    assert.equal(plan.productName, "书灵阁");
    assert.equal(plan.channel, "stable");
    assert.equal(plan.targets.some((item) => item.artifactName.endsWith("-stable-x64.exe")), true);
    await access(path.join(packageRoot, "electron-builder.json"));
  } finally {
    await runtime.cleanup();
  }
});
