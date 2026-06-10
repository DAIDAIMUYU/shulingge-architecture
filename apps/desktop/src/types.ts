import type { StartedServer } from "../../server/src/types.js";

export interface DesktopRuntime {
  server: StartedServer;
  cleanup(): Promise<void>;
}

export interface DesktopWindowDescriptor {
  id: "workspace" | "mobile-console" | "runs";
  title: string;
  route: string;
  summary: string;
}

export interface DesktopWindowOptions {
  serverBaseUrl: string;
  descriptor: DesktopWindowDescriptor;
  allWindows: DesktopWindowDescriptor[];
}
