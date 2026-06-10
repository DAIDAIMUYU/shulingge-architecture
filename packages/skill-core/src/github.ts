export interface GitHubSkillSource {
  originalUrl: string;
  rawUrl: string;
  sourceLabel: string;
}

function normalizeGitHubPath(value: string): string {
  return value.replace(/^\/+/, "");
}

export function resolveGitHubSkillSource(url: string): GitHubSkillSource | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  if (parsed.hostname === "raw.githubusercontent.com") {
    const parts = normalizeGitHubPath(parsed.pathname).split("/");
    if (parts.length < 4) {
      return null;
    }

    return {
      originalUrl: url,
      rawUrl: parsed.toString(),
      sourceLabel: `github:${parts[0]}/${parts[1]}`,
    };
  }

  if (parsed.hostname !== "github.com") {
    return null;
  }

  const parts = normalizeGitHubPath(parsed.pathname).split("/");
  if (parts.length < 5 || parts[2] !== "blob") {
    return null;
  }

  const [owner, repo, _blob, ref, ...rest] = parts;
  if (rest.length === 0) {
    return null;
  }

  return {
    originalUrl: url,
    rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${rest.join("/")}`,
    sourceLabel: `github:${owner}/${repo}`,
  };
}
