import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startServer } from "../../server/src/index.js";
import type { StartServerOptions } from "../../server/src/types.js";

import type { DesktopRuntime } from "./types.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(currentDirectory, "..");
const workspaceRoot = path.resolve(desktopRoot, "..", "..", "..");
const resourcesPath = typeof process.resourcesPath === "string" ? process.resourcesPath : "";
const packagedWebDistPath = resourcesPath ? path.join(resourcesPath, "web-dist") : "";
const defaultWebDistPath = existsSync(packagedWebDistPath)
  ? packagedWebDistPath
  : path.join(workspaceRoot, "apps", "web", "dist");

export async function createDesktopRuntime(
  options: StartServerOptions = {},
): Promise<DesktopRuntime> {
  const server = await startServer({
    ...options,
    webDistPath: options.webDistPath ?? defaultWebDistPath,
  });

  return {
    server,
    async cleanup() {
      await server.close();
    },
  };
}
