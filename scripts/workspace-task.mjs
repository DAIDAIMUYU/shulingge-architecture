import { readFile } from "node:fs/promises";
import path from "node:path";

const [, , task, workspaceDir] = process.argv;

if (!task || !workspaceDir) {
  console.error("Usage: node scripts/workspace-task.mjs <task> <workspace-dir>");
  process.exit(1);
}

const packageJsonPath = path.join(workspaceDir, "package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

console.log(`[${task}] ${packageJson.name}`);
