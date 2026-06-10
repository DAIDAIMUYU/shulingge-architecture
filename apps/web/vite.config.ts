import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 书灵阁 Web 前端开发/构建配置。
// 仅负责把现有 React 写作工作台骨架在浏览器渲染；数据接入 server API 属后续工程。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      // 开发期把 API/移动页请求转发到本地后端（pnpm --filter @shulingge/server start）
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/m": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
