import type { AppError, Result } from "./types.js";

export function createAppError(
  code: string,
  message: string,
  options?: { redacted?: boolean },
): AppError {
  return {
    code,
    message,
    redacted: options?.redacted,
  };
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(error: AppError): Result<T> {
  return { ok: false, error };
}

export function isOk<T>(result: Result<T>): result is Extract<Result<T>, { ok: true }> {
  return result.ok;
}

export function isErr<T>(result: Result<T>): result is Extract<Result<T>, { ok: false }> {
  return !result.ok;
}
