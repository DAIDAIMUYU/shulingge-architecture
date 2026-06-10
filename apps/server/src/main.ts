import { startServer } from "./index.js";

/**
 * 本地后端可执行入口（开发/手动验收用）。
 *
 * 环境变量（均可选）：
 * - HOST：监听地址，默认 127.0.0.1（仅本机）。
 * - PORT：监听端口，默认 8787。
 * - SHULINGGE_VAULT：启动时选用的 Vault 根目录绝对路径；不设则不选库，
 *   可启动后调用 POST /api/v1/vault/select 或 /api/v1/bootstrap/complete。
 */
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "8787");
const vaultRoot = process.env.SHULINGGE_VAULT ? process.env.SHULINGGE_VAULT : null;

const server = await startServer({ host, port, vaultRoot });
console.log(`[shulingge] server listening on ${server.baseUrl}`);
if (vaultRoot) {
  console.log(`[shulingge] vault: ${vaultRoot}`);
} else {
  console.log(
    "[shulingge] no vault selected — set SHULINGGE_VAULT, or POST /api/v1/vault/select | /api/v1/bootstrap/complete",
  );
}

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;
  console.log(`\n[shulingge] received ${signal}, closing server...`);
  try {
    await server.close();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
