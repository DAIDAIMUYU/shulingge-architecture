import esbuild from "esbuild";

// 将 Electron 主进程入口 main.ts 及其依赖链（含 @shulingge/server 整条 workspace 链）
// 打包为单个 ESM 文件 dist/main.mjs，供开发启动（electron .）与 electron-builder 打包共用。
// 采用 ESM 输出：代码库多处依赖 import.meta.url（createRequire / 资源路径解析），
// 在 cjs 输出下 import.meta.url 会被置空导致运行时出错，故必须用 esm。
// - electron：运行时由 Electron 提供，external。
// - sql.js / 可选原生（bufferutil、utf-8-validate）：含 wasm/原生，运行时经 createRequire 从 node_modules 解析，external。
await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/main.mjs",
  external: ["electron"], // 仅 external electron（运行时由 Electron 提供）；其余依赖全部 bundle
  // 关键修复：ESM 输出下，bundle 进来的 CJS 代码（safe-buffer / sha.js / hash-wasm / isomorphic-git 等）
  // 调用 require() 时会走 esbuild 的 __require shim，默认抛 "Dynamic require of X is not supported"。
  // 在输出文件最外层注入真正的 createRequire 后，该 shim 会检测到全局 require 并改用它，
  // 从而能正确加载 Node 内置模块（buffer/crypto/fs/stream）与 node_modules 包。
  banner: {
    js: "import { createRequire as __cjsCompatRequire } from 'node:module'; const require = __cjsCompatRequire(import.meta.url);",
  },
  logLevel: "info",
});

console.log("[desktop] main bundled -> dist/main.mjs");
