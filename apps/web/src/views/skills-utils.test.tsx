import assert from "node:assert/strict";
import test from "node:test";

import { buildPermissionBadges, executionModeLabel, formatExecutionOperations, parseJsonObject, splitCsv } from "./skills-utils.js";

test("buildPermissionBadges keeps only granted permissions with risk tones", () => {
  const badges = buildPermissionBadges({
    descriptors: [
      { key: "readProject", granted: true, risk: "safe", label: "读取项目", requiresConfirm: false },
      { key: "network", granted: true, risk: "high", label: "访问网络", requiresConfirm: true },
      { key: "runShell", granted: false, risk: "high", label: "运行命令", requiresConfirm: false },
    ],
    grantedKeys: ["readProject", "network"],
    highRiskKeys: ["network"],
    requiresHighRiskConfirm: true,
    readApiKey: false,
  });

  assert.deepEqual(badges, [
    { key: "readProject", label: "读取项目", tone: "safe", requiresConfirm: false },
    { key: "network", label: "访问网络", tone: "high", requiresConfirm: true },
  ]);
});

test("parseJsonObject accepts blank and object JSON, rejects invalid payloads", () => {
  assert.deepEqual(parseJsonObject(""), { value: {} });
  assert.deepEqual(parseJsonObject('{ "command": "search" }'), { value: { command: "search" } });
  assert.match(parseJsonObject("[1,2,3]").error ?? "", /JSON 对象/);
  assert.match(parseJsonObject("{").error ?? "", /JSON 解析失败/);
});

test("splitCsv and execution helpers normalize common UI inputs", () => {
  assert.deepEqual(splitCsv("tool, fetch, sandbox"), ["tool", "fetch", "sandbox"]);
  assert.equal(
    executionModeLabel({
      id: "tool-fetch",
      name: "工具抓取",
      version: "1.0.0",
      kind: "tool",
      executable: false,
      registeredOnly: true,
      source: "local-import",
      license: "MIT",
      installedAt: "2026-06-10T00:00:00.000Z",
      permissionSummary: {
        descriptors: [],
        grantedKeys: [],
        highRiskKeys: [],
        requiresHighRiskConfirm: false,
        readApiKey: false,
      },
    }),
    "受限沙箱执行",
  );
  assert.equal(
    formatExecutionOperations({
      skillId: "tool-fetch",
      executed: true,
      dryRun: false,
      sandbox: "v2-tool",
      summary: "ok",
      operations: ["arg:command", "arg:mode"],
    }),
    "arg:command / arg:mode",
  );
});
