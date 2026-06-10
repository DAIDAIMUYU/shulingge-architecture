import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Skill } from "@shulingge/shared";
import {
  createSkillRegistryRecord,
  decideSkillImport,
  executeRegisteredSkill,
  parseSkillManifest,
  parseSkillManifestJson,
  resolveGitHubSkillSource,
  type SkillRegistryRecord,
} from "@shulingge/skill-core";
import { readJsonFile, resolveSafePath, writeJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

const SKILLS_DIR = "global/skills";
const SKILL_RUNS_DIR = "global/skill-runs";

interface StoredSkill {
  skill: Skill;
  source: string;
  installedAt: string;
}

function recordFromStored(stored: StoredSkill): SkillRegistryRecord {
  return createSkillRegistryRecord(stored.skill, stored.source, stored.installedAt);
}

export async function listSkills(vaultRoot: string): Promise<SkillRegistryRecord[]> {
  const directory = resolveSafePath(vaultRoot, SKILLS_DIR);
  const entries = await readdir(directory).catch(() => [] as string[]);
  const records: SkillRegistryRecord[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    const stored = await readJsonFile<StoredSkill>(vaultRoot, path.posix.join(SKILLS_DIR, entry));
    records.push(recordFromStored(stored));
  }

  return records;
}

export async function importSkill(
  vaultRoot: string,
  input: { manifest?: unknown; source?: string },
): Promise<SkillRegistryRecord> {
  const parsed = parseSkillManifest(input.manifest);
  if (!parsed.ok) {
    throw createHttpError(
      400,
      "SKILL_INVALID_MANIFEST",
      `Skill manifest 校验失败: ${parsed.issues.join("; ")}`,
    );
  }

  const decision = decideSkillImport(parsed.skill);
  if (!decision.importable) {
    throw createHttpError(400, "SKILL_NOT_IMPORTABLE", decision.reasons.join("; "));
  }

  const stored: StoredSkill = {
    skill: parsed.skill,
    source: input.source ?? "local-import",
    installedAt: new Date().toISOString(),
  };

  await mkdir(resolveSafePath(vaultRoot, SKILLS_DIR), { recursive: true });
  await writeJsonFile(vaultRoot, path.posix.join(SKILLS_DIR, `${parsed.skill.id}.json`), stored);

  return recordFromStored(stored);
}

export async function importSkillFromGitHub(
  vaultRoot: string,
  input: { url?: string; fetchImpl?: typeof fetch },
): Promise<SkillRegistryRecord> {
  const source = resolveGitHubSkillSource(input.url ?? "");
  if (!source) {
    throw createHttpError(400, "SKILL_GITHUB_URL_INVALID", "Only GitHub blob/raw skill URLs are supported");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(source.rawUrl, {
    headers: {
      accept: "application/json, text/plain;q=0.9",
      "user-agent": "shulingge-v1.1-skill-import",
    },
  });
  if (!response.ok) {
    throw createHttpError(502, "SKILL_GITHUB_FETCH_FAILED", `GitHub skill fetch failed: ${response.status}`);
  }

  const parsed = parseSkillManifestJson(await response.text());
  if (!parsed.ok) {
    throw createHttpError(
      400,
      "SKILL_INVALID_MANIFEST",
      `Skill manifest 校验失败: ${parsed.issues.join("; ")}`,
    );
  }

  return importSkill(vaultRoot, {
    manifest: parsed.skill,
    source: source.sourceLabel,
  });
}

export async function executeSkill(
  vaultRoot: string,
  input: { skillId?: string; args?: Record<string, unknown>; dryRun?: boolean },
) {
  if (!input.skillId) {
    throw createHttpError(400, "SKILL_EXECUTION_INVALID", "skillId is required");
  }

  const stored = await readJsonFile<StoredSkill>(vaultRoot, path.posix.join(SKILLS_DIR, `${input.skillId}.json`)).catch(() => null);
  if (!stored) {
    throw createHttpError(404, "SKILL_NOT_FOUND", `Skill not found: ${input.skillId}`);
  }

  const plannedResult = executeRegisteredSkill(stored.skill, {
    skillId: input.skillId,
    args: input.args,
    dryRun: input.dryRun,
  });
  const result =
    stored.skill.kind === "tool" && !plannedResult.dryRun
      ? await runToolSkillInSandboxProcess(stored.skill.id, input.args)
      : plannedResult;

  if (!result.dryRun && result.artifacts?.length) {
    await mkdir(resolveSafePath(vaultRoot, SKILL_RUNS_DIR), { recursive: true });
    for (const artifact of result.artifacts) {
      if (artifact.kind === "json") {
        await writeFile(
          resolveSafePath(vaultRoot, path.posix.join(SKILL_RUNS_DIR, artifact.name)),
          JSON.stringify(artifact.content, null, 2),
          "utf8",
        );
      }
    }
  }
  return result;
}

async function runToolSkillInSandboxProcess(skillId: string, args?: Record<string, unknown>) {
  // V2.0 工具 Skill 通过独立子进程执行，主进程只接收结果并落盘产物。
  const runnerPath = fileURLToPath(new URL("./skill-sandbox-runner.mjs", import.meta.url));
  const payload = Buffer.from(
    JSON.stringify({
      skillId,
      args: args ?? {},
    }),
    "utf8",
  ).toString("base64");

  return await new Promise<ReturnType<typeof executeRegisteredSkill>>((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, payload], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(createHttpError(500, "SKILL_EXECUTION_FAILED", stderr.trim() || `Sandbox exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (error) {
        reject(
          createHttpError(
            500,
            "SKILL_EXECUTION_FAILED",
            error instanceof Error ? error.message : "Sandbox output parse failed",
          ),
        );
      }
    });
  });
}
