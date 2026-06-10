import process from "node:process";
import { pathToFileURL } from "node:url";

function decodePayload(raw) {
  if (!raw) {
    throw new Error("Missing plugin payload");
  }

  // 主进程通过 base64 传入 JSON 载荷，避免参数中的引号和换行破坏命令行。
  return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
}

function pickHookHandler(pluginModule, hookId) {
  // 优先读取显式 hooks 映射；若插件只导出 default，则把 default 视为单入口 hook。
  if (pluginModule?.hooks && typeof pluginModule.hooks === "object" && typeof pluginModule.hooks[hookId] === "function") {
    return pluginModule.hooks[hookId];
  }

  if (typeof pluginModule?.default === "function") {
    return pluginModule.default;
  }

  return null;
}

async function main() {
  const payload = decodePayload(process.argv[2]);
  // 在独立子进程中动态导入插件入口文件，主进程只负责调度与回收结果。
  const pluginModule = await import(pathToFileURL(payload.entryPath).href);
  const handler = pickHookHandler(pluginModule, payload.hook);

  if (!handler) {
    throw new Error(`Plugin hook handler not found: ${payload.hook}`);
  }

  const output = await handler({
    hook: payload.hook,
    pluginId: payload.pluginId,
    vaultRoot: payload.vaultRoot,
    timestamp: payload.timestamp,
  });

  process.stdout.write(
    `${JSON.stringify({
      pluginId: payload.pluginId,
      enabled: true,
      invokedHook: payload.hook,
      summary: `Plugin ${payload.pluginId} handled hook ${payload.hook}`,
      output: output ?? null,
      runner: "plugin-hook-runner",
    })}\n`,
  );
}

await main();
