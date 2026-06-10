import type { CredentialStore, StoredCredentialStatus } from "./types.js";
import { getCredentialDescriptor } from "./key-ref.js";

export class CredentialService {
  constructor(private readonly store: CredentialStore) {}

  async storeApiKey(keyRef: string, apiKey: string): Promise<StoredCredentialStatus> {
    const descriptor = getCredentialDescriptor(keyRef);
    await this.store.set({
      ...descriptor,
      password: apiKey,
    });

    return {
      keyRef,
      hasKey: true,
    };
  }

  async getApiKey(keyRef: string): Promise<string | null> {
    const descriptor = getCredentialDescriptor(keyRef);
    return this.store.get(descriptor);
  }

  async deleteApiKey(keyRef: string): Promise<boolean> {
    const descriptor = getCredentialDescriptor(keyRef);
    return this.store.delete(descriptor);
  }

  async getStoredCredentialStatus(keyRef: string): Promise<StoredCredentialStatus> {
    const hasKey = (await this.getApiKey(keyRef)) !== null;
    return {
      keyRef,
      hasKey,
    };
  }
}
