import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App.js";
import { applyThemePreference, readWebPreferences } from "./app/preferences.js";
import { globalCss } from "./styles.js";

interface ViteHotContext {
  accept(modulePath: string, callback: (module?: { globalCss: string }) => void): void;
}

const GLOBAL_STYLE_ID = "shulingge-global-css";

function removeLegacyGlobalCss(currentStyleTag: HTMLStyleElement) {
  document.head.querySelectorAll("style").forEach((styleTag) => {
    if (styleTag === currentStyleTag || styleTag.id) {
      return;
    }
    const cssText = styleTag.textContent ?? "";
    if (cssText.includes(".app-shell") && cssText.includes(".tree-head")) {
      styleTag.remove();
    }
  });
}

function injectGlobalCss(css: string) {
  let styleTag = document.getElementById(GLOBAL_STYLE_ID) as HTMLStyleElement | null;
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = GLOBAL_STYLE_ID;
    styleTag.dataset.source = "apps/web/src/styles.ts";
    document.head.appendChild(styleTag);
  }
  if (styleTag.textContent !== css) {
    styleTag.textContent = css;
  }
  removeLegacyGlobalCss(styleTag);
}

// 浏览器 CSR 入口：注入设计系统全局样式，再挂载书灵阁 App。
injectGlobalCss(globalCss);

const hot = (import.meta as ImportMeta & { hot?: ViteHotContext }).hot;
hot?.accept("./styles.js", (nextModule) => {
  if (nextModule?.globalCss) {
    injectGlobalCss(nextModule.globalCss);
  }
});

const initialPreferences = readWebPreferences();
applyThemePreference(initialPreferences.themeMode);

const container = document.getElementById("root");
if (!container) {
  throw new Error("找不到 #root 容器，无法挂载书灵阁。");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
