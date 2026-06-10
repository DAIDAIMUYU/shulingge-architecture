import { spawn } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pluginManifestSchema, type PluginManifest } from "@shulingge/shared";
import { readJsonFile, resolveSafePath, writeJsonFile } from "@shulingge/vault-core";

import { createHttpError } from "./errors.js";

const PLUGINS_DIR = "global/plugins";

export interface PluginLifecycleResult {
  pluginId: string;
  enabled: boolean;
  invokedHook?: string;
  summary: string;
  output?: unknown;
  runner?: string;
}

export async function listPlugins(vaultRoot: string): Promise<PluginManifest[]> {
  const directory = resolveSafePath(vaultRoot, PLUGINS_DIR);
  const entries = await readdir(directory).catch(() => [] as string[]);
  const plugins: PluginManifest[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    plugins.push(await readJsonFile<PluginManifest>(vaultRoot, path.posix.join(PLUGINS_DIR, entry)));
  }

  return plugins.sort((left, right) => left.name.localeCompare(right.name));
}

export async function registerPlugin(vaultRoot: string, raw: unknown): Promise<PluginManifest> {
  const parsed = pluginManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw createHttpError(
      400,
      "PLUGIN_INVALID_MANIFEST",
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; "),
    );
  }

  await mkdir(resolveSafePath(vaultRoot, PLUGINS_DIR), { recursive: true });
  await writeJsonFile(vaultRoot, path.posix.join(PLUGINS_DIR, `${parsed.data.id}.json`), parsed.data);
  return parsed.data;
}

export async function updatePluginState(
  vaultRoot: string,
  pluginId: string,
  input: { enabled: boolean },
): Promise<PluginManifest> {
  // 启停状态独立落盘，后续插件加载器只需要读取这一份 manifest。
  const current = await readJsonFile<PluginManifest>(vaultRoot, path.posix.join(PLUGINS_DIR, `${pluginId}.json`)).catch(() => null);
  if (!current) {
    throw createHttpError(404, "PLUGIN_NOT_FOUND", `Plugin not found: ${pluginId}`);
  }

  const next = { ...current, enabled: input.enabled, updatedAt: new Date().toISOString() };
  await writeJsonFile(vaultRoot, path.posix.join(PLUGINS_DIR, `${pluginId}.json`), next);
  return next;
}

export async function invokePluginHook(
  vaultRoot: string,
  pluginId: string,
  hook: string,
): Promise<PluginLifecycleResult> {
  // V2.0 把插件 hook 放进独立子进程执行，避免在 server 主进程内直接加载任意插件代码。
  const current = await readJsonFile<PluginManifest>(vaultRoot, path.posix.join(PLUGINS_DIR, `${pluginId}.json`)).catch(() => null);
  if (!current) {
    throw createHttpError(404, "PLUGIN_NOT_FOUND", `Plugin not found: ${pluginId}`);
  }
  if (!current.enabled) {
    throw createHttpError(409, "PLUGIN_DISABLED", `Plugin is disabled: ${pluginId}`);
  }
  if (!current.hooks.includes(hook)) {
    throw createHttpError(400, "PLUGIN_HOOK_UNAVAILABLE", `Hook not declared: ${hook}`);
  }

  const entryPath = resolveSafePath(vaultRoot, current.entry);
  const runnerPath = fileURLToPath(new URL("./plugin-hook-runner.mjs", import.meta.url));
  const payload = Buffer.from(
    JSON.stringify({
      pluginId,
      hook,
      vaultRoot,
      entryPath,
      timestamp: new Date().toISOString(),
    }),
    "utf8",
  ).toString("base64");

  return await new Promise<PluginLifecycleResult>((resolve, reject) => {
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
        reject(createHttpError(500, "PLUGIN_HOOK_FAILED", stderr.trim() || `Plugin hook exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()) as PluginLifecycleResult);
      } catch (error) {
        reject(
          createHttpError(
            500,
            "PLUGIN_HOOK_FAILED",
            error instanceof Error ? error.message : "Plugin hook output parse failed",
          ),
        );
      }
    });
  });
}
