import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveSafePath } from "@shulingge/vault-core";

import type { ModelStoreOptions } from "./models.js";
import { listModels } from "./models.js";
import type { RemoteGatewayStatus } from "./types.js";
import { buildHealthReport } from "./doctor.js";
import { getUpdateStatus } from "./updates.js";

export interface DiagnosticsBundleResult {
  outputPath: string;
  generatedAt: string;
  includes: string[];
}

export async function exportDiagnosticsBundle(
  vaultRoot: string,
  remoteStatus: RemoteGatewayStatus,
  modelOptions: ModelStoreOptions,
): Promise<DiagnosticsBundleResult> {
  const generatedAt = new Date().toISOString();
  const models = await listModels(vaultRoot, modelOptions);
  const health = await buildHealthReport(vaultRoot, remoteStatus);
  const updateStatus = await getUpdateStatus(vaultRoot);

  const bundle = {
    generatedAt,
    vaultRoot: path.basename(vaultRoot),
    health,
    updateStatus,
    remote: {
      enabled: remoteStatus.enabled,
      autoStart: remoteStatus.autoStart,
      port: remoteStatus.port,
      requestedPort: remoteStatus.requestedPort,
      address: remoteStatus.address,
      tailscaleAddress: remoteStatus.tailscaleAddress,
      passwordConfigured: remoteStatus.passwordConfigured,
    },
    models: models.map((model) => ({
      id: model.id,
      provider: model.provider,
      model: model.model,
      hasKey: model.hasKey,
      fallbackModelId: model.fallbackModelId,
      updatedAt: model.updatedAt,
    })),
  };

  const outputPath = path.posix.join("backups", "diagnostics", `diagnostics-${generatedAt.replaceAll(":", "-")}.json`);
  await mkdir(path.dirname(resolveSafePath(vaultRoot, outputPath)), { recursive: true });
  await writeFile(resolveSafePath(vaultRoot, outputPath), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  return {
    outputPath,
    generatedAt,
    includes: ["health-report", "update-status", "remote-status", "model-status"],
  };
}
