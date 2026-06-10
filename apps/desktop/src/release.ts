import path from "node:path";

export type ReleaseChannel = "dev" | "beta" | "stable";

export interface DesktopPackTarget {
  target: "nsis" | "portable";
  arch: "x64";
  artifactName: string;
  outputDirectory: string;
}

export interface DesktopReleasePlan {
  appId: string;
  productName: string;
  version: string;
  channel: ReleaseChannel;
  publishUrl: string;
  outputDirectory: string;
  builderConfigPath: string;
  updateManifestPath: string;
  backupStagingDirectory: string;
  targets: DesktopPackTarget[];
}

const APP_ID = "com.shulingge.desktop";
const PRODUCT_NAME = "书灵阁";
const OUTPUT_DIRECTORY = "dist/release";
const UPDATE_MANIFEST_PATH = "dist/release/latest.json";
const BACKUP_STAGING_DIRECTORY = "dist/release/update-backups";
const BUILDER_CONFIG_PATH = "electron-builder.json";

function normalizeVersion(version: string): string {
  const value = version.trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) {
    throw new Error(`非法的桌面版本号：${version}`);
  }

  return value;
}

export function detectReleaseChannel(version: string): ReleaseChannel {
  const normalized = normalizeVersion(version).toLowerCase();
  if (normalized.includes("-dev")) {
    return "dev";
  }
  if (normalized.includes("-beta")) {
    return "beta";
  }
  return "stable";
}

export function buildPublishUrl(channel: ReleaseChannel): string {
  return `https://downloads.shulingge.local/${channel}`;
}

export function buildDesktopReleasePlan(version: string): DesktopReleasePlan {
  const normalizedVersion = normalizeVersion(version);
  const channel = detectReleaseChannel(normalizedVersion);
  const publishUrl = buildPublishUrl(channel);
  const targets: DesktopPackTarget[] = [
    {
      target: "nsis",
      arch: "x64",
      artifactName: `${PRODUCT_NAME}-Setup-${normalizedVersion}-${channel}-x64.exe`,
      outputDirectory: OUTPUT_DIRECTORY,
    },
    {
      target: "portable",
      arch: "x64",
      artifactName: `${PRODUCT_NAME}-${normalizedVersion}-${channel}-x64.exe`,
      outputDirectory: OUTPUT_DIRECTORY,
    },
  ];

  return {
    appId: APP_ID,
    productName: PRODUCT_NAME,
    version: normalizedVersion,
    channel,
    publishUrl,
    outputDirectory: OUTPUT_DIRECTORY,
    builderConfigPath: BUILDER_CONFIG_PATH,
    updateManifestPath: UPDATE_MANIFEST_PATH,
    backupStagingDirectory: BACKUP_STAGING_DIRECTORY,
    targets,
  };
}

export function resolveDesktopReleasePath(...segments: string[]): string {
  return path.posix.join(OUTPUT_DIRECTORY, ...segments);
}
