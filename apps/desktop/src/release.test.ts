import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDesktopReleasePlan,
  buildPublishUrl,
  detectReleaseChannel,
  resolveDesktopReleasePath,
} from "./release.js";

test("release channel detection follows the frozen V2.1 rules", () => {
  assert.equal(detectReleaseChannel("0.1.0"), "stable");
  assert.equal(detectReleaseChannel("0.1.0-beta.2"), "beta");
  assert.equal(detectReleaseChannel("0.1.0-dev.4"), "dev");
});

test("desktop release plan pins output directories and artifact naming", () => {
  const plan = buildDesktopReleasePlan("2.1.0-beta.3");

  assert.equal(plan.appId, "com.shulingge.desktop");
  assert.equal(plan.productName, "书灵阁");
  assert.equal(plan.channel, "beta");
  assert.equal(plan.outputDirectory, "dist/release");
  assert.equal(plan.updateManifestPath, "dist/release/latest.json");
  assert.equal(plan.backupStagingDirectory, "dist/release/update-backups");
  assert.deepEqual(
    plan.targets.map((item) => item.artifactName),
    ["书灵阁-Setup-2.1.0-beta.3-beta-x64.exe", "书灵阁-2.1.0-beta.3-beta-x64.exe"],
  );
});

test("publish url and nested release paths are derived from the same baseline", () => {
  assert.equal(buildPublishUrl("stable"), "https://downloads.shulingge.local/stable");
  assert.equal(resolveDesktopReleasePath("logs", "publish.json"), "dist/release/logs/publish.json");
});
