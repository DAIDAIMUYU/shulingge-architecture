import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function resolveDesktopRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function ensureCacheDirectories(rootDirectory: string): Promise<{
  electronCache: string;
  builderCache: string;
}> {
  const cacheRoot = path.join(rootDirectory, "dist", ".cache");
  const electronCache = path.join(cacheRoot, "electron");
  const builderCache = path.join(cacheRoot, "builder");

  await mkdir(electronCache, { recursive: true });
  await mkdir(builderCache, { recursive: true });

  return { electronCache, builderCache };
}

function resolveBuilderCli(): string {
  const builderPackageJsonPath = require.resolve("electron-builder/package.json");
  const builderPackageJson = require(builderPackageJsonPath) as {
    bin?: string | Record<string, string>;
  };

  if (typeof builderPackageJson.bin === "string") {
    return path.resolve(path.dirname(builderPackageJsonPath), builderPackageJson.bin);
  }

  const cliRelativePath = builderPackageJson.bin?.["electron-builder"];
  if (!cliRelativePath) {
    throw new Error("未找到 electron-builder CLI 入口。");
  }

  return path.resolve(path.dirname(builderPackageJsonPath), cliRelativePath);
}

async function runBuilder(mode: "dir" | "dist"): Promise<void> {
  const rootDirectory = resolveDesktopRoot();
  const { electronCache, builderCache } = await ensureCacheDirectories(rootDirectory);
  const cliPath = resolveBuilderCli();
  const args = [cliPath, "--config", "electron-builder.json"];

  if (mode === "dir") {
    args.push("--dir");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: rootDirectory,
      stdio: "inherit",
      env: {
        ...process.env,
        ELECTRON_CACHE: electronCache,
        ELECTRON_BUILDER_CACHE: builderCache,
      },
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`electron-builder 退出码异常：${code ?? "unknown"}`));
    });
    child.on("error", reject);
  });
}

const mode = process.argv[2];
if (mode !== "dir" && mode !== "dist") {
  throw new Error("用法：tsx src/package-cli.ts <dir|dist>");
}

void runBuilder(mode);
