export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

/** 解析形如 `1.2.3` 的语义化版本（忽略预发布/构建后缀）。 */
export function parseSemVer(value: string): SemVer | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
  if (!match) {
    return null;
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** 比较两个版本：a<b 返回负数，a==b 返回 0，a>b 返回正数。 */
export function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  return a.patch - b.patch;
}

/**
 * 判断 Skill 的 compatibleVersions 是否兼容当前应用版本。
 * MVP 支持：`*`（全兼容）、`x.y.z`（精确）、`>=x.y.z`（最低版本）。
 */
export function isCompatibleWith(compatibleVersions: string, appVersion: string): boolean {
  const range = compatibleVersions.trim();
  const app = parseSemVer(appVersion);
  if (!app) {
    return false;
  }
  if (range === "*" || range === "") {
    return true;
  }
  if (range.startsWith(">=")) {
    const min = parseSemVer(range.slice(2));
    return min ? compareSemVer(app, min) >= 0 : false;
  }
  const exact = parseSemVer(range);
  return exact ? compareSemVer(app, exact) === 0 : false;
}
