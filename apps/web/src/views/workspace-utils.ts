import type { LockRecord } from "../api/client.js";

export interface ChapterLocator {
  projectId: string;
  novelId: string;
  chapterId: string;
}

export interface OutlineItem {
  id: string;
  label: string;
  excerpt: string;
  line: number;
}

export function parseChapterRef(ref: string): ChapterLocator {
  const [projectId = "", novelId = "", ...rest] = ref.split("/");
  return {
    projectId,
    novelId,
    chapterId: rest.join("/"),
  };
}

export function applyInlineWrap(
  content: string,
  start: number,
  end: number,
  before: string,
  after: string = before,
): { content: string; selectionStart: number; selectionEnd: number } {
  const safeStart = Math.max(0, Math.min(start, content.length));
  const safeEnd = Math.max(safeStart, Math.min(end, content.length));
  const selected = content.slice(safeStart, safeEnd);
  const nextContent = `${content.slice(0, safeStart)}${before}${selected}${after}${content.slice(safeEnd)}`;
  return {
    content: nextContent,
    selectionStart: safeStart + before.length,
    selectionEnd: safeEnd + before.length,
  };
}

export function applyLinePrefix(
  content: string,
  start: number,
  end: number,
  prefix: string,
): { content: string; selectionStart: number; selectionEnd: number } {
  const safeStart = Math.max(0, Math.min(start, content.length));
  const safeEnd = Math.max(safeStart, Math.min(end, content.length));
  const lineStart = content.lastIndexOf("\n", safeStart - 1) + 1;
  const lineEndIndex = content.indexOf("\n", safeEnd);
  const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
  const block = content.slice(lineStart, lineEnd);
  const nextBlock = block
    .split("\n")
    .map((line) => (line.trim() ? `${prefix}${line}` : line))
    .join("\n");
  const nextContent = `${content.slice(0, lineStart)}${nextBlock}${content.slice(lineEnd)}`;
  return {
    content: nextContent,
    selectionStart: lineStart,
    selectionEnd: lineStart + nextBlock.length,
  };
}

export function buildOutline(content: string): OutlineItem[] {
  const lines = content.split("\n");
  const headings: OutlineItem[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed.startsWith("#")) {
      headings.push({
        id: `heading-${index + 1}`,
        label: trimmed.replace(/^#+\s*/, "") || `标题 ${index + 1}`,
        excerpt: "Markdown 标题",
        line: index + 1,
      });
      return;
    }

    if (!headings.length && trimmed.length >= 8) {
      headings.push({
        id: `lead-${index + 1}`,
        label: `段落 ${index + 1}`,
        excerpt: trimmed.slice(0, 28),
        line: index + 1,
      });
    }
  });

  if (headings.length) {
    return headings;
  }

  const paragraphs = content
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.slice(0, 6).map((paragraph, index) => ({
    id: `paragraph-${index + 1}`,
    label: `段落 ${index + 1}`,
    excerpt: paragraph.slice(0, 28),
    line: index + 1,
  }));
}

export function createSelectionLock(start: number, end: number): LockRecord {
  const safeStart = Math.max(0, Math.min(start, end));
  const safeEnd = Math.max(safeStart, Math.max(start, end));
  return {
    id: `lock-${safeStart}-${safeEnd}`,
    scope: "paragraph",
    level: "full",
    range: {
      start: safeStart,
      end: safeEnd,
    },
  };
}
