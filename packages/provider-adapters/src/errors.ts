import { createAppError, type AppError, type ProviderType } from "@shulingge/shared";
import { redactText } from "@shulingge/security";

export class ProviderAdapterError extends Error {
  constructor(
    public readonly appError: AppError,
    public readonly provider: ProviderType,
  ) {
    super(appError.message, { cause: appError });
  }
}

export function createProviderAdapterError(
  provider: ProviderType,
  code: string,
  message: string,
): ProviderAdapterError {
  return new ProviderAdapterError(
    createAppError(code, redactText(message), { redacted: true }),
    provider,
  );
}
