import path from "node:path";

import { err, ok, type AppError, type Result } from "@shulingge/shared";

import {
  absolutePathNotAllowed,
  emptyRelativePath,
  pathTraversalDetected,
  vaultRootMustBeAbsolute,
} from "./errors.js";

function normalizeForComparison(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

export function resolveSafePath(vaultRoot: string, relativePath: string): string {
  const validated = tryResolveSafePath(vaultRoot, relativePath);

  if (!validated.ok) {
    throw new Error(validated.error.message, { cause: validated.error });
  }

  return validated.value;
}

export function tryResolveSafePath(vaultRoot: string, relativePath: string): Result<string> {
  if (!path.isAbsolute(vaultRoot)) {
    return err(vaultRootMustBeAbsolute(vaultRoot));
  }

  const trimmed = relativePath.trim();
  if (!trimmed) {
    return err(emptyRelativePath());
  }

  if (path.isAbsolute(trimmed)) {
    return err(absolutePathNotAllowed(trimmed));
  }

  const rootResolved = path.resolve(vaultRoot);
  const resolved = path.resolve(rootResolved, trimmed);
  const rootComparable = normalizeForComparison(rootResolved);
  const resolvedComparable = normalizeForComparison(resolved);

  if (
    resolvedComparable !== rootComparable &&
    !resolvedComparable.startsWith(`${rootComparable}${path.sep}`)
  ) {
    return err(pathTraversalDetected(trimmed));
  }

  return ok(resolved);
}

export function isPathGuardError(error: unknown): error is AppError {
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}
