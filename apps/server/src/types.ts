import type { ProviderEndpointConfig } from "@shulingge/provider-adapters";
import type { CredentialService } from "@shulingge/security";
import type { SearchQuery } from "@shulingge/indexer";
import type http from "node:http";
import type { ActiveWorkflowRun } from "./workflows.js";

export interface RemoteGatewayStatus {
  enabled: boolean;
  autoStart: boolean;
  port: number;
  requestedPort: number;
  address?: string;
  tailscaleAddress?: string;
  passwordConfigured: boolean;
}

export interface RemoteGatewayController {
  getStatus(): RemoteGatewayStatus;
  enable(options: { password: string; port?: number; autoStart?: boolean }): Promise<RemoteGatewayStatus>;
  disable(): Promise<RemoteGatewayStatus>;
  updatePassword(password: string): Promise<RemoteGatewayStatus>;
  verifyPassword(password: string): Promise<boolean>;
  reloadForVault(vaultRoot: string | null): Promise<void>;
  close(): Promise<void>;
}

export interface ServerState {
  vaultRoot: string | null;
  workflowRuns: Map<string, ActiveWorkflowRun>;
}

export interface ServerContext {
  state: ServerState;
  services: {
    credentialService: CredentialService;
    fetchImpl?: typeof fetch;
    providerEndpoints?: Partial<Record<string, ProviderEndpointConfig>>;
    remote: RemoteGatewayController;
  };
}

export interface StartServerOptions {
  host?: string;
  port?: number;
  vaultRoot?: string | null;
  webDistPath?: string;
  credentialService?: CredentialService;
  fetchImpl?: typeof fetch;
  providerEndpoints?: Partial<Record<string, ProviderEndpointConfig>>;
  allowTestRemoteOverride?: boolean;
}

export interface StartedServer {
  host: string;
  port: number;
  baseUrl: string;
  remoteStatus(): RemoteGatewayStatus;
  close(): Promise<void>;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    redacted?: boolean;
  };
}

export interface RouteDefinition {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  handler: RouteHandler;
}

export interface RouteRequest {
  method: string;
  url: URL;
  raw: http.IncomingMessage;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export type RouteHandler = (request: RouteRequest, context: ServerContext) => Promise<unknown>;

export interface SearchRequestQuery extends SearchQuery {}
