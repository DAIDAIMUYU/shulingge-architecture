declare module "electron" {
  import type http from "node:http";
  import type { Duplex } from "node:stream";

  export interface NativeImage {}

  export interface Tray {
    setToolTip(text: string): void;
    setContextMenu(menu: unknown): void;
    destroy(): void;
  }

  export interface BrowserWindowInstance {
    show(): void;
    focus(): void;
    isDestroyed(): boolean;
    loadURL(url: string): Promise<void>;
    webContents: {
      send(channel: string, payload: unknown): void;
    };
  }

  export const app: {
    on(event: string, listener: () => void): void;
    whenReady(): Promise<void>;
    quit(): Promise<void> | void;
  };

  export const BrowserWindow: {
    new (options: Record<string, unknown>): BrowserWindowInstance;
    getAllWindows(): BrowserWindowInstance[];
  };

  export const Menu: {
    buildFromTemplate(template: Array<Record<string, unknown>>): unknown;
  };

  export const Tray: {
    new (icon: NativeImage): Tray;
  };

  export const nativeImage: {
    createEmpty(): NativeImage;
  };

  export const powerMonitor: {
    on(event: string, listener: () => void): void;
  };

  export const powerSaveBlocker: {
    start(type: string): number;
    stop(id: number): void;
    isStarted(id: number): boolean;
  };

  export class WebSocketServer {
    constructor(options: { noServer: boolean });
    on(event: "connection", handler: (socket: { send(data: string): void }, request: http.IncomingMessage) => void): void;
    handleUpgrade(
      request: http.IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (client: { send(data: string): void }) => void,
    ): void;
    emit(event: "connection", client: { send(data: string): void }, request: http.IncomingMessage): void;
    close(): void;
  }
}
