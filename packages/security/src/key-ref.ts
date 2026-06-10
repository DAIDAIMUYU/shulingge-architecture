import { createAppError } from "@shulingge/shared";

import type { KeyRefParts } from "./types.js";

const KEY_REF_PREFIX = "provider";

export function buildKeyRef(parts: Omit<KeyRefParts, "namespace"> & { namespace?: string }): string {
  const namespace = parts.namespace ?? KEY_REF_PREFIX;
  return [namespace, parts.provider, parts.profile].join(":");
}

export function parseKeyRef(keyRef: string): KeyRefParts {
  const [namespace, provider, profile, ...rest] = keyRef.split(":");

  if (!namespace || !provider || !profile || rest.length > 0) {
    throw new Error(`Invalid keyRef format: ${keyRef}`, {
      cause: createAppError("SECURITY_INVALID_KEY_REF", `Invalid keyRef format: ${keyRef}`),
    });
  }

  return { namespace, provider, profile };
}

export function getCredentialDescriptor(keyRef: string): { service: string; account: string } {
  const parsed = parseKeyRef(keyRef);
  return {
    service: `shulingge:${parsed.namespace}:${parsed.provider}`,
    account: parsed.profile,
  };
}
