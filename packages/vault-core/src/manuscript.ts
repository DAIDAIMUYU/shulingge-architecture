import { manuscriptMetadataForbidden } from "./errors.js";

const FRONTMATTER_PATTERN = /^---\s*\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

export function assertPureManuscript(content: string): void {
  if (FRONTMATTER_PATTERN.test(content)) {
    throw new Error(manuscriptMetadataForbidden().message, {
      cause: manuscriptMetadataForbidden(),
    });
  }
}

export function isPureManuscript(content: string): boolean {
  return !FRONTMATTER_PATTERN.test(content);
}
