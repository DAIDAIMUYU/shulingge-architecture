import type { RedactionOptions } from "./types.js";

const REDACTION_MASK = "[REDACTED]";
const WINDOWS_PATH_PATTERN = /[A-Za-z]:\\[^\s"'<>|]+/g;
const UNIX_PATH_PATTERN = /(?:^|[\s(])\/(?:[^/\s"'<>|]+\/)*[^/\s"'<>|]+/g;
const OPENAI_STYLE_KEY_PATTERN = /\b(?:sk|sess)-[A-Za-z0-9_-]{8,}\b/g;
const ANTHROPIC_STYLE_KEY_PATTERN = /\bsk-ant-[A-Za-z0-9_-]{8,}\b/g;

function uniqueValues(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).filter(Boolean))].sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactText(input: string, options?: RedactionOptions): string {
  let output = input;

  for (const secret of uniqueValues(options?.secrets)) {
    output = output.replace(new RegExp(escapeRegExp(secret), "g"), REDACTION_MASK);
  }

  for (const snippet of uniqueValues(options?.manuscriptSnippets)) {
    output = output.replace(new RegExp(escapeRegExp(snippet), "g"), REDACTION_MASK);
  }

  for (const pathValue of uniqueValues(options?.paths)) {
    output = output.replace(new RegExp(escapeRegExp(pathValue), "g"), REDACTION_MASK);
  }

  output = output.replace(OPENAI_STYLE_KEY_PATTERN, REDACTION_MASK);
  output = output.replace(ANTHROPIC_STYLE_KEY_PATTERN, REDACTION_MASK);
  output = output.replace(WINDOWS_PATH_PATTERN, REDACTION_MASK);
  output = output.replace(UNIX_PATH_PATTERN, (match) => {
    const prefix = match.startsWith(" ") || match.startsWith("(") ? match[0] : "";
    const raw = prefix ? match.slice(1) : match;
    if (raw.length < 2) {
      return match;
    }
    return `${prefix}${REDACTION_MASK}`;
  });

  return output;
}

export function redactValue<T>(input: T, options?: RedactionOptions): T {
  if (typeof input === "string") {
    return redactText(input, options) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactValue(item, options)) as T;
  }

  if (input && typeof input === "object") {
    const entries = Object.entries(input as Record<string, unknown>).map(([key, value]) => [
      key,
      redactValue(value, options),
    ]);
    return Object.fromEntries(entries) as T;
  }

  return input;
}
