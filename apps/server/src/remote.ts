import os from "node:os";
import path from "node:path";
import { stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { hashPassword, verifyPassword as verifyPasswordHash } from "@shulingge/security";
import { readJsonFile, writeJsonFile } from "@shulingge/vault-core";

import type { RemoteGatewayController, RemoteGatewayStatus } from "./types.js";

const REMOTE_SETTINGS_PATH = "settings/remote.json";
const REMOTE_AUTH_PATH = "settings/remote-auth.json";
const DEFAULT_PORT = 3000;

interface RemoteSettingsRecord {
  enabled: boolean;
  autoStart: boolean;
  requestedPort: number;
  port: number;
  address?: string;
  tailscaleAddress?: string;
  passwordHashRef?: string;
}

interface RemotePasswordRecord {
  hash: string;
}

interface RemoteGatewayControllerOptions {
  vaultRoot: string | null;
  startListener: (port: number) => Promise<AddressInfo>;
  stopListener: () => Promise<void>;
}

function detectTailscaleAddress(): string | undefined {
  let interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>;
  try {
    interfaces = os.networkInterfaces();
  } catch {
    return undefined;
  }

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") {
        continue;
      }

      if (name.toLowerCase().includes("tailscale") || entry.address.startsWith("100.")) {
        return entry.address;
      }
    }
  }

  return undefined;
}

function defaultStatus(): RemoteGatewayStatus {
  return {
    enabled: false,
    autoStart: false,
    port: DEFAULT_PORT,
    requestedPort: DEFAULT_PORT,
    address: undefined,
    tailscaleAddress: detectTailscaleAddress(),
    passwordConfigured: false,
  };
}

async function readOptionalJson<T>(vaultRoot: string, relativePath: string): Promise<T | null> {
  try {
    return await readJsonFile<T>(vaultRoot, relativePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function hasPasswordConfig(vaultRoot: string): Promise<boolean> {
  try {
    const fileStatus = await stat(path.join(vaultRoot, ...REMOTE_AUTH_PATH.split("/")));
    return fileStatus.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function readStatus(vaultRoot: string | null): Promise<RemoteGatewayStatus> {
  if (!vaultRoot) {
    return defaultStatus();
  }

  const [settings, passwordConfigured] = await Promise.all([
    readOptionalJson<RemoteSettingsRecord>(vaultRoot, REMOTE_SETTINGS_PATH),
    hasPasswordConfig(vaultRoot),
  ]);

  return {
    enabled: settings?.enabled ?? false,
    autoStart: settings?.autoStart ?? false,
    port: settings?.port ?? settings?.requestedPort ?? DEFAULT_PORT,
    requestedPort: settings?.requestedPort ?? DEFAULT_PORT,
    address: settings?.address,
    tailscaleAddress: settings?.tailscaleAddress ?? detectTailscaleAddress(),
    passwordConfigured,
  };
}

async function persistStatus(vaultRoot: string, status: RemoteGatewayStatus): Promise<void> {
  const payload: RemoteSettingsRecord = {
    enabled: status.enabled,
    autoStart: status.autoStart,
    requestedPort: status.requestedPort,
    port: status.port,
    address: status.address,
    tailscaleAddress: status.tailscaleAddress,
    passwordHashRef: REMOTE_AUTH_PATH,
  };
  await writeJsonFile(vaultRoot, REMOTE_SETTINGS_PATH, payload);
}

async function persistPassword(vaultRoot: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await writeJsonFile(vaultRoot, REMOTE_AUTH_PATH, {
    hash,
  } satisfies RemotePasswordRecord);
}

async function verifyStoredPassword(vaultRoot: string | null, password: string): Promise<boolean> {
  if (!vaultRoot || !password) {
    return false;
  }

  const record = await readOptionalJson<RemotePasswordRecord>(vaultRoot, REMOTE_AUTH_PATH);
  if (!record?.hash) {
    return false;
  }

  return verifyPasswordHash(password, record.hash);
}

export function createRemoteGatewayController(
  options: RemoteGatewayControllerOptions,
): RemoteGatewayController {
  let vaultRoot = options.vaultRoot;
  let status = defaultStatus();

  async function startFromStatus(nextStatus: RemoteGatewayStatus): Promise<RemoteGatewayStatus> {
    const address = await options.startListener(nextStatus.requestedPort);
    return {
      ...nextStatus,
      enabled: true,
      port: address.port,
      address: address.address,
      tailscaleAddress: detectTailscaleAddress(),
    };
  }

  return {
    getStatus() {
      return status;
    },
    async enable(enableOptions) {
      if (!vaultRoot) {
        throw new Error("No vault selected for remote gateway");
      }

      await persistPassword(vaultRoot, enableOptions.password);
      await options.stopListener();
      status = await startFromStatus({
        enabled: true,
        autoStart: enableOptions.autoStart ?? false,
        port: enableOptions.port ?? DEFAULT_PORT,
        requestedPort: enableOptions.port ?? DEFAULT_PORT,
        address: "0.0.0.0",
        tailscaleAddress: detectTailscaleAddress(),
        passwordConfigured: true,
      });
      await persistStatus(vaultRoot, status);
      return status;
    },
    async disable() {
      await options.stopListener();
      status = {
        ...(await readStatus(vaultRoot)),
        enabled: false,
        port: status.requestedPort,
        address: undefined,
      };
      if (vaultRoot) {
        await persistStatus(vaultRoot, status);
      }
      return status;
    },
    async updatePassword(password) {
      if (!vaultRoot) {
        throw new Error("No vault selected for remote gateway");
      }

      await persistPassword(vaultRoot, password);
      status = {
        ...status,
        passwordConfigured: true,
      };
      await persistStatus(vaultRoot, status);
      return status;
    },
    async verifyPassword(password) {
      return verifyStoredPassword(vaultRoot, password);
    },
    async reloadForVault(nextVaultRoot) {
      await options.stopListener();
      vaultRoot = nextVaultRoot;
      status = await readStatus(vaultRoot);
      if (vaultRoot && status.enabled) {
        status = await startFromStatus(status);
        await persistStatus(vaultRoot, status);
      }
    },
    async close() {
      await options.stopListener();
      status = {
        ...status,
        enabled: false,
        address: undefined,
        port: status.requestedPort,
      };
    },
  };
}
