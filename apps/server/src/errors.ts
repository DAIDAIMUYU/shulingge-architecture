import { createAppError, type AppError } from "@shulingge/shared";
import { redactText } from "@shulingge/security";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly appError: AppError,
  ) {
    super(appError.message, { cause: appError });
  }
}

export function createHttpError(statusCode: number, code: string, message: string): HttpError {
  return new HttpError(statusCode, createAppError(code, message, { redacted: true }));
}

export function toErrorPayload(error: unknown): {
  statusCode: number;
  body: { ok: false; error: AppError };
} {
  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode,
      body: {
        ok: false,
        error: error.appError,
      },
    };
  }

  const message = error instanceof Error ? error.message : String(error);

  return {
    statusCode: 500,
    body: {
      ok: false,
      error: {
        code: "SERVER_INTERNAL_ERROR",
        message: redactText(message),
        redacted: true,
      },
    },
  };
}
