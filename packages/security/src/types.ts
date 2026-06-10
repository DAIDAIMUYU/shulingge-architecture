export interface CredentialRecord {
  service: string;
  account: string;
  password: string;
}

export interface CredentialStore {
  get(record: Omit<CredentialRecord, "password">): Promise<string | null>;
  set(record: CredentialRecord): Promise<void>;
  delete(record: Omit<CredentialRecord, "password">): Promise<boolean>;
}

export interface StoredCredentialStatus {
  keyRef: string;
  hasKey: boolean;
}

export interface KeyRefParts {
  namespace: string;
  provider: string;
  profile: string;
}

export interface RedactionOptions {
  secrets?: string[];
  paths?: string[];
  manuscriptSnippets?: string[];
}

export interface PasswordHashOptions {
  memorySize?: number;
  iterations?: number;
  parallelism?: number;
  hashLength?: number;
}

export interface PasswordHashRecord {
  algorithm: "argon2id";
  version: 1;
  salt: string;
  hash: string;
  memorySize: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
}
