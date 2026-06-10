import { randomBytes, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";

import type { PasswordHashOptions, PasswordHashRecord } from "./types.js";

const require = createRequire(import.meta.url);
const { argon2id } = require("hash-wasm") as typeof import("hash-wasm");

const DEFAULT_HASH_OPTIONS = {
  memorySize: 19456,
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
} satisfies Required<PasswordHashOptions>;

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

function fromBase64(value: string): Uint8Array {
  return Buffer.from(value, "base64");
}

function mergeHashOptions(options?: PasswordHashOptions): Required<PasswordHashOptions> {
  return {
    ...DEFAULT_HASH_OPTIONS,
    ...options,
  };
}

export async function hashPassword(
  password: string,
  options?: PasswordHashOptions,
): Promise<string> {
  const resolved = mergeHashOptions(options);
  const salt = randomBytes(16);
  const hash = await argon2id({
    password,
    salt,
    parallelism: resolved.parallelism,
    iterations: resolved.iterations,
    memorySize: resolved.memorySize,
    hashLength: resolved.hashLength,
    outputType: "binary",
  });

  const record: PasswordHashRecord = {
    algorithm: "argon2id",
    version: 1,
    salt: toBase64(salt),
    hash: toBase64(new Uint8Array(hash)),
    memorySize: resolved.memorySize,
    iterations: resolved.iterations,
    parallelism: resolved.parallelism,
    hashLength: resolved.hashLength,
  };

  return JSON.stringify(record);
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parsed = JSON.parse(encodedHash) as PasswordHashRecord;
  if (parsed.algorithm !== "argon2id" || parsed.version !== 1) {
    return false;
  }

  const recomputed = await argon2id({
    password,
    salt: fromBase64(parsed.salt),
    parallelism: parsed.parallelism,
    iterations: parsed.iterations,
    memorySize: parsed.memorySize,
    hashLength: parsed.hashLength,
    outputType: "binary",
  });

  const recomputedBuffer = Buffer.from(recomputed);
  const storedBuffer = Buffer.from(parsed.hash, "base64");

  if (recomputedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(recomputedBuffer, storedBuffer);
}
