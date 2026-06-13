import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App.js";
import { applyPaperTexturePreference, readWebPreferences } from "./app/preferences.js";
import { globalCss } from "./styles.js";

// 浏览器 CSR 入口：注入设计系统全局样式，再挂载书灵阁 App。
const styleTag = document.createElement("style");
styleTag.textContent = globalCss;
document.head.appendChild(styleTag);
applyPaperTexturePreference(readWebPreferences().paperTextureEnabled);

const container = document.getElementById("root");
if (!container) {
  throw new Error("找不到 #root 容器，无法挂载书灵阁。");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
