import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json" with { type: "json" };

import { buildDesktopReleasePlan } from "./release.js";

async function main(): Promise<void> {
  const plan = buildDesktopReleasePlan(packageJson.version);
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputDirectory = path.join(rootDirectory, "dist", "release");

  // 生成可追踪的发布计划，供更新闭环和验收流程复用。
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "release-plan.json"),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(plan, null, 2));
}

void main();
