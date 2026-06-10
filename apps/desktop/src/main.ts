import type { NativeImage, Tray } from "electron";

import { createDesktopRuntime } from "./server-runtime.js";
import { createDesktopWindowDescriptors, resolveDesktopWindowUrl } from "./window-html.js";

// require 由打包时 esbuild 经 banner 注入的 createRequire 提供（见 build-main.mjs）。
// 不在源码里建 createRequire——那样会被 esbuild 作用域重命名，无法供其 __require shim 使用。
declare const require: NodeRequire;
const electron = require("electron") as typeof import("electron");
const {
  app,
  BrowserWindow,
  Menu,
  Tray: ElectronTray,
  nativeImage,
  powerMonitor,
  powerSaveBlocker,
} = electron;

let tray: Tray | null = null;
let blockerId = -1;
let runtime: Awaited<ReturnType<typeof createDesktopRuntime>> | null = null;
type BrowserWindowInstance = InstanceType<typeof BrowserWindow>;
let windows: BrowserWindowInstance[] = [];

const hasInstanceLock = app.requestSingleInstanceLock();

if (!hasInstanceLock) {
  app.quit();
}

if (hasInstanceLock) {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0] ?? windows[0];
    if (!window || window.isDestroyed()) {
      return;
    }

    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  });
}

function createWindow(title: string, pageUrl: string): BrowserWindowInstance {
  const window = new BrowserWindow({
    width: 1680,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    title,
    backgroundColor: "#F7F5EF",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  void window.loadURL(pageUrl);
  windows.push(window);
  window.on("closed", () => {
    windows = windows.filter((item) => item !== window);
  });
  return window;
}

async function createMainWindow(): Promise<void> {
  runtime = await createDesktopRuntime();
  const descriptors = createDesktopWindowDescriptors().filter((descriptor) => descriptor.id === "workspace");

  for (const descriptor of descriptors) {
    const pageUrl = resolveDesktopWindowUrl(runtime.server.baseUrl, descriptor);
    createWindow(`书灵阁 · ${descriptor.title}`, pageUrl);
  }
}

function ensureTray(): void {
  const icon: NativeImage = nativeImage.createEmpty();
  tray = new ElectronTray(icon);
  tray.setToolTip("书灵阁");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示窗口",
        click: () => {
          const window = BrowserWindow.getAllWindows()[0] ?? windows[0];
          window?.show();
          window?.focus();
        },
      },
      {
        label: "退出",
        click: () => {
          void app.quit();
        },
      },
    ]),
  );
}

function enablePowerGuard(): void {
  if (!powerSaveBlocker.isStarted(blockerId)) {
    blockerId = powerSaveBlocker.start("prevent-app-suspension");
  }

  powerMonitor.on("suspend", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window && !window.isDestroyed()) {
      window.webContents.send("desktop:power-warning", {
        message: "System suspend detected. Save state before sleep.",
      });
    }
  });
}

async function cleanup(): Promise<void> {
  if (powerSaveBlocker.isStarted(blockerId)) {
    powerSaveBlocker.stop(blockerId);
  }

  tray?.destroy();
  tray = null;

  if (runtime) {
    await runtime.cleanup();
    runtime = null;
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    void app.quit();
  }
});

app.on("before-quit", () => {
  void cleanup();
});

if (hasInstanceLock) {
  app.whenReady().then(async () => {
    ensureTray();
    enablePowerGuard();
    await createMainWindow();
  });
}
