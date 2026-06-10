import http from "node:http";
import { once } from "node:events";
import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { AddressInfo } from "node:net";

import { CredentialService, createSystemCredentialStore } from "@shulingge/security";

import { createRouter, parseJsonBody, toRouteRequest } from "./router.js";
import { toErrorPayload } from "./errors.js";
import { createRemoteGatewayController } from "./remote.js";
import { routeDefinitions } from "./routes.js";
import type { ApiSuccess, StartedServer, StartServerOptions, ServerContext } from "./types.js";

const require = createRequire(import.meta.url);
const { WebSocketServer } = require("ws") as {
  WebSocketServer: new (options: { noServer: boolean }) => {
    on(event: "connection", handler: (socket: { send(data: string): void }, request: http.IncomingMessage) => void): void;
    handleUpgrade(
      request: http.IncomingMessage,
      socket: import("node:stream").Duplex,
      head: Buffer,
      callback: (client: { send(data: string): void }) => void,
    ): void;
    emit(event: "connection", client: { send(data: string): void }, request: http.IncomingMessage): void;
    close(): void;
  };
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 0;
const FRONTEND_ROUTES = new Set([
  "/",
  "/projects",
  "/characters",
  "/relations",
  "/timeline",
  "/worldbook",
  "/agents",
  "/rules",
  "/settings",
]);

function toHttpHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

function writeJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function writeHtml(response: http.ServerResponse, statusCode: number, html: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
}

function contentTypeForPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function resolveWebAssetPath(webDistPath: string, requestPath: string): string | null {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const relativePath = normalizedPath.replace(/^\/+/, "");
  const candidate = path.resolve(webDistPath, relativePath);
  const relative = path.relative(webDistPath, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return candidate;
}

async function tryServeWebAsset(
  requestPath: string,
  response: http.ServerResponse,
  webDistPath: string | undefined,
): Promise<boolean> {
  if (!webDistPath) {
    return false;
  }

  const directAssetPath = resolveWebAssetPath(webDistPath, requestPath);
  if (directAssetPath && existsSync(directAssetPath)) {
    response.statusCode = 200;
    response.setHeader("content-type", contentTypeForPath(directAssetPath));
    createReadStream(directAssetPath).pipe(response);
    return true;
  }

  if (!FRONTEND_ROUTES.has(requestPath)) {
    return false;
  }

  const indexPath = path.resolve(webDistPath, "index.html");
  if (!existsSync(indexPath)) {
    return false;
  }

  response.statusCode = 200;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(await readFile(indexPath, "utf8"));
  return true;
}

function renderDesktopNavigation(currentPath: string): string {
  const items = [
    { href: "/desktop/workspace", label: "主工作台" },
    { href: "/desktop/mobile", label: "移动预览" },
    { href: "/desktop/runs", label: "运行记录" },
  ];

  return items
    .map((item) => {
      const current = item.href === currentPath ? ' aria-current="page" class="current"' : "";
      return `<a href="${item.href}"${current}>${item.label}</a>`;
    })
    .join("");
}

function renderDesktopWorkspaceHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>书灵阁 Desktop Workspace</title>
    <style>
      :root { --bg:#f4efe7; --card:#fffdf9; --line:rgba(64,48,34,.12); --text:#2d241b; --muted:#75695c; --accent:#8f5d31; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:"Segoe UI","PingFang SC",sans-serif; color:var(--text); background:linear-gradient(180deg,#f8f3eb 0%,var(--bg) 100%); }
      main { max-width:1440px; margin:0 auto; padding:18px; display:grid; gap:14px; }
      .hero,.card { background:var(--card); border:1px solid var(--line); border-radius:20px; box-shadow:0 12px 28px rgba(72,53,35,.08); }
      .hero { padding:18px 20px; }
      .hero h1,.card h2 { margin:0 0 8px; }
      .muted,label { color:var(--muted); }
      nav { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
      nav a { text-decoration:none; color:var(--text); border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:#fff; }
      nav a.current { background:linear-gradient(135deg,var(--accent) 0%,#bc7f50 100%); color:#fff; border-color:transparent; }
      .field-grid,.button-row,.grid { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); }
      .workspace-grid { display:grid; gap:14px; grid-template-columns:1.35fr 1fr; }
      input,textarea,button { width:100%; border-radius:12px; border:1px solid var(--line); font:inherit; }
      input,textarea { padding:11px 12px; background:#fff; color:var(--text); }
      textarea { min-height:260px; resize:vertical; }
      button { padding:12px 14px; background:linear-gradient(135deg,var(--accent) 0%,#bc7f50 100%); color:#fff; font-weight:600; }
      button.secondary { background:#fff; color:var(--text); }
      pre,.list { margin:0; padding:12px; border-radius:14px; background:rgba(80,58,37,.05); border:1px solid rgba(80,58,37,.08); white-space:pre-wrap; word-break:break-word; overflow:auto; }
      .card { padding:16px; }
      .run-item { padding:10px 0; border-bottom:1px solid rgba(80,58,37,.08); }
      .run-item:last-child { border-bottom:0; }
      @media (max-width: 1080px) { .workspace-grid { grid-template-columns:1fr; } }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>书灵阁桌面工作台</h1>
        <p class="muted">桌面主窗口已直接接入本地 server 的真实页面，可在此完成正文编辑、9 Agent 运行、时间线查看与一致性检查。</p>
        <nav>${renderDesktopNavigation("/desktop/workspace")}</nav>
      </section>
      <section class="card">
        <div class="field-grid">
          <label>Project<input id="projectId" value="demo-series"></label>
          <label>Novel<input id="novelId" value="main"></label>
          <label>Chapter<input id="chapterId" value="chapter-001"></label>
          <label>Fallback Model<input id="fallbackModelId" placeholder="workflow-default"></label>
        </div>
        <div class="button-row" style="margin-top:12px">
          <button id="refreshHealth">刷新健康报告</button>
          <button id="refreshNotifications" class="secondary">刷新通知</button>
          <button id="loadChapter" class="secondary">读取章节</button>
          <button id="saveChapter" class="secondary">保存正文</button>
          <button id="runWorkflow">运行 9 Agent</button>
          <button id="loadRuns" class="secondary">刷新 Runs</button>
          <button id="loadTimeline" class="secondary">查看时间线</button>
          <button id="checkConsistency" class="secondary">一致性检查</button>
        </div>
      </section>
      <section class="workspace-grid">
        <article class="card">
          <h2>章节正文</h2>
          <textarea id="chapterContent" placeholder="先读取章节，再进行桌面写作。"></textarea>
        </article>
        <article class="card">
          <h2>运行结果</h2>
          <pre id="runPanel">等待运行...</pre>
        </article>
      </section>
      <section class="grid">
        <article class="card"><h2>首次启动</h2><pre id="bootstrapPanel">等待加载...</pre></article>
        <article class="card"><h2>健康报告</h2><pre id="healthPanel">等待加载...</pre></article>
        <article class="card"><h2>最近 Runs</h2><div id="runsPanel" class="list">暂无数据</div></article>
        <article class="card"><h2>时间线</h2><pre id="timelinePanel">等待加载...</pre></article>
        <article class="card"><h2>一致性检查</h2><pre id="consistencyPanel">等待检查...</pre></article>
        <article class="card"><h2>通知</h2><div id="notificationsPanel" class="list">等待加载...</div></article>
      </section>
    </main>
    <script>
      const state = {
        get projectId() { return document.getElementById("projectId").value.trim(); },
        get novelId() { return document.getElementById("novelId").value.trim(); },
        get chapterId() { return document.getElementById("chapterId").value.trim(); },
        get fallbackModelId() { return document.getElementById("fallbackModelId").value.trim(); },
      };
      const healthPanel = document.getElementById("healthPanel");
      const bootstrapPanel = document.getElementById("bootstrapPanel");
      const notificationsPanel = document.getElementById("notificationsPanel");
      const runsPanel = document.getElementById("runsPanel");
      const chapterContent = document.getElementById("chapterContent");
      const runPanel = document.getElementById("runPanel");
      const timelinePanel = document.getElementById("timelinePanel");
      const consistencyPanel = document.getElementById("consistencyPanel");

      async function request(url, init) {
        const response = await fetch(url, init);
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "request failed");
        return payload.data;
      }

      async function refreshBootstrap() {
        const data = await request("/api/v1/bootstrap/status");
        bootstrapPanel.textContent = JSON.stringify(data, null, 2);
      }

      async function refreshHealth() {
        const data = await request("/api/v1/health/report");
        healthPanel.textContent = JSON.stringify(data, null, 2);
      }

      async function refreshNotifications() {
        const data = await request('/api/v1/notifications?projectId=' + encodeURIComponent(state.projectId) + '&novelId=' + encodeURIComponent(state.novelId) + '&chapterId=' + encodeURIComponent(state.chapterId));
        notificationsPanel.textContent = (data.notifications || []).map((item) => '[' + item.level + '][' + item.source + '] ' + item.title + ': ' + item.message).join('\\n') || '暂无通知';
      }

      async function loadChapter() {
        const data = await request('/api/v1/editor/chapters/' + encodeURIComponent(state.chapterId) + '?projectId=' + encodeURIComponent(state.projectId) + '&novelId=' + encodeURIComponent(state.novelId));
        chapterContent.value = data.content;
      }

      async function saveChapter() {
        const data = await request('/api/v1/editor/chapters/' + encodeURIComponent(state.chapterId) + '/save', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({ projectId: state.projectId, novelId: state.novelId, content: chapterContent.value }),
        });
        runPanel.textContent = JSON.stringify({ saved: true, wordCount: data.metadata.wordCount }, null, 2);
        await loadTimeline();
        await refreshNotifications();
      }

      async function loadRuns() {
        const data = await request('/api/v1/runs?projectId=' + encodeURIComponent(state.projectId) + '&novelId=' + encodeURIComponent(state.novelId) + '&chapterId=' + encodeURIComponent(state.chapterId));
        if (!data.runs.length) { runsPanel.textContent = '暂无运行记录'; return; }
        runsPanel.innerHTML = data.runs.map((run) => '<div class="run-item"><strong>' + run.id + '</strong><br>status: ' + run.status + ' | nodes: ' + run.nodes.length + ' | started: ' + run.startedAt + '</div>').join('');
      }

      async function runWorkflow() {
        runPanel.textContent = '运行中...';
        const data = await request('/api/v1/chapters/' + encodeURIComponent(state.chapterId) + '/run', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({ projectId: state.projectId, novelId: state.novelId, fallbackModelId: state.fallbackModelId || undefined, wait: true }),
        });
        runPanel.textContent = JSON.stringify(data.run, null, 2);
        await loadChapter();
        await loadRuns();
        await loadTimeline();
        await refreshNotifications();
      }

      async function loadTimeline() {
        const data = await request('/api/v1/version/chapters/' + encodeURIComponent(state.chapterId) + '/timeline?projectId=' + encodeURIComponent(state.projectId) + '&novelId=' + encodeURIComponent(state.novelId));
        timelinePanel.textContent = JSON.stringify(data, null, 2);
      }

      async function checkConsistency() {
        const data = await request('/api/v1/consistency/check', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({ projectId: state.projectId, novelId: state.novelId }),
        });
        consistencyPanel.textContent = JSON.stringify(data, null, 2);
      }

      document.getElementById('refreshHealth').addEventListener('click', () => refreshHealth().catch((error) => { healthPanel.textContent = String(error.message || error); }));
      document.getElementById('refreshNotifications').addEventListener('click', () => refreshNotifications().catch((error) => { notificationsPanel.textContent = String(error.message || error); }));
      document.getElementById('loadChapter').addEventListener('click', () => loadChapter().catch((error) => { chapterContent.value = String(error.message || error); }));
      document.getElementById('saveChapter').addEventListener('click', () => saveChapter().catch((error) => { runPanel.textContent = String(error.message || error); }));
      document.getElementById('runWorkflow').addEventListener('click', () => runWorkflow().catch((error) => { runPanel.textContent = String(error.message || error); }));
      document.getElementById('loadRuns').addEventListener('click', () => loadRuns().catch((error) => { runsPanel.textContent = String(error.message || error); }));
      document.getElementById('loadTimeline').addEventListener('click', () => loadTimeline().catch((error) => { timelinePanel.textContent = String(error.message || error); }));
      document.getElementById('checkConsistency').addEventListener('click', () => checkConsistency().catch((error) => { consistencyPanel.textContent = String(error.message || error); }));

      refreshBootstrap().catch(() => undefined);
      refreshHealth().catch(() => undefined);
      refreshNotifications().catch(() => undefined);
      loadRuns().catch(() => undefined);
      loadTimeline().catch(() => undefined);
    </script>
  </body>
</html>`;
}

function renderDesktopMobileHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>书灵阁 Desktop Mobile Preview</title>
    <style>
      :root { --bg:#eef2f1; --card:#ffffff; --line:rgba(38,54,56,.14); --text:#243437; --muted:#687679; --accent:#41786f; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:"Segoe UI","PingFang SC",sans-serif; color:var(--text); background:linear-gradient(180deg,#f7faf9 0%,var(--bg) 100%); }
      main { max-width:1280px; margin:0 auto; padding:18px; display:grid; gap:14px; }
      .hero,.frame { background:var(--card); border:1px solid var(--line); border-radius:20px; box-shadow:0 12px 28px rgba(49,70,73,.08); }
      .hero { padding:18px 20px; }
      .hero h1 { margin:0 0 8px; }
      .muted { color:var(--muted); }
      nav { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
      nav a { text-decoration:none; color:var(--text); border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:#fff; }
      nav a.current { background:linear-gradient(135deg,var(--accent) 0%,#5a9b8f 100%); color:#fff; border-color:transparent; }
      .frame { padding:16px; }
      iframe { width:100%; min-height:860px; border:1px solid rgba(38,54,56,.12); border-radius:16px; background:#fff; }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>移动控制台桌面预览</h1>
        <p class="muted">当前窗口保留桌面统一导航，同时直接嵌入 /m 的真实移动控制台页面，方便对照调试。</p>
        <nav>${renderDesktopNavigation("/desktop/mobile")}</nav>
      </section>
      <section class="frame">
        <iframe title="书灵阁移动控制台" src="/m"></iframe>
      </section>
    </main>
  </body>
</html>`;
}

function renderDesktopRunsHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>书灵阁 Desktop Runs</title>
    <style>
      :root { --bg:#f3f1ec; --card:#fffefb; --line:rgba(60,47,32,.12); --text:#2d261d; --muted:#74695d; --accent:#8b6233; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:"Segoe UI","PingFang SC",sans-serif; color:var(--text); background:linear-gradient(180deg,#f9f6f0 0%,var(--bg) 100%); }
      main { max-width:1320px; margin:0 auto; padding:18px; display:grid; gap:14px; }
      .hero,.card { background:var(--card); border:1px solid var(--line); border-radius:20px; box-shadow:0 12px 28px rgba(72,53,35,.08); }
      .hero { padding:18px 20px; }
      .hero h1,.card h2 { margin:0 0 8px; }
      .muted,label { color:var(--muted); }
      nav { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
      nav a { text-decoration:none; color:var(--text); border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:#fff; }
      nav a.current { background:linear-gradient(135deg,var(--accent) 0%,#bc7f50 100%); color:#fff; border-color:transparent; }
      .card { padding:16px; }
      .field-grid,.button-row,.grid { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); }
      input,button { width:100%; border-radius:12px; border:1px solid var(--line); font:inherit; }
      input { padding:11px 12px; background:#fff; color:var(--text); }
      button { padding:12px 14px; background:linear-gradient(135deg,var(--accent) 0%,#bc7f50 100%); color:#fff; font-weight:600; }
      button.secondary { background:#fff; color:var(--text); }
      pre,.list { margin:0; padding:12px; border-radius:14px; background:rgba(80,58,37,.05); border:1px solid rgba(80,58,37,.08); white-space:pre-wrap; word-break:break-word; overflow:auto; }
      .run-item { padding:10px 0; border-bottom:1px solid rgba(80,58,37,.08); }
      .run-item:last-child { border-bottom:0; }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>运行记录与更新状态</h1>
        <p class="muted">集中查看最近运行、通知、健康报告与应用更新状态，作为桌面交付前的运行面板。</p>
        <nav>${renderDesktopNavigation("/desktop/runs")}</nav>
      </section>
      <section class="card">
        <div class="field-grid">
          <label>Project<input id="projectId" value="demo-series"></label>
          <label>Novel<input id="novelId" value="main"></label>
          <label>Chapter<input id="chapterId" value="chapter-001"></label>
        </div>
        <div class="button-row" style="margin-top:12px">
          <button id="loadRuns">刷新 Runs</button>
          <button id="loadNotifications" class="secondary">刷新通知</button>
          <button id="loadHealth" class="secondary">刷新健康</button>
          <button id="loadUpdateStatus" class="secondary">刷新更新状态</button>
          <button id="exportDiagnostics" class="secondary">导出诊断包</button>
        </div>
      </section>
      <section class="grid">
        <article class="card"><h2>最近 Runs</h2><div id="runsPanel" class="list">暂无数据</div></article>
        <article class="card"><h2>通知</h2><div id="notificationsPanel" class="list">等待加载...</div></article>
        <article class="card"><h2>健康报告</h2><pre id="healthPanel">等待加载...</pre></article>
        <article class="card"><h2>更新状态</h2><pre id="updatePanel">等待加载...</pre></article>
      </section>
    </main>
    <script>
      const state = {
        get projectId() { return document.getElementById("projectId").value.trim(); },
        get novelId() { return document.getElementById("novelId").value.trim(); },
        get chapterId() { return document.getElementById("chapterId").value.trim(); },
      };
      const runsPanel = document.getElementById("runsPanel");
      const notificationsPanel = document.getElementById("notificationsPanel");
      const healthPanel = document.getElementById("healthPanel");
      const updatePanel = document.getElementById("updatePanel");

      async function request(url, init) {
        const response = await fetch(url, init);
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "request failed");
        return payload.data;
      }

      async function loadRuns() {
        const data = await request('/api/v1/runs?projectId=' + encodeURIComponent(state.projectId) + '&novelId=' + encodeURIComponent(state.novelId) + '&chapterId=' + encodeURIComponent(state.chapterId));
        if (!data.runs.length) { runsPanel.textContent = '暂无运行记录'; return; }
        runsPanel.innerHTML = data.runs.map((run) => '<div class="run-item"><strong>' + run.id + '</strong><br>status: ' + run.status + ' | nodes: ' + run.nodes.length + ' | started: ' + run.startedAt + '</div>').join('');
      }

      async function loadNotifications() {
        const data = await request('/api/v1/notifications?projectId=' + encodeURIComponent(state.projectId) + '&novelId=' + encodeURIComponent(state.novelId) + '&chapterId=' + encodeURIComponent(state.chapterId));
        notificationsPanel.textContent = (data.notifications || []).map((item) => '[' + item.level + '][' + item.source + '] ' + item.title + ': ' + item.message).join('\\n') || '暂无通知';
      }

      async function loadHealth() {
        const data = await request('/api/v1/health/report');
        healthPanel.textContent = JSON.stringify(data, null, 2);
      }

      async function loadUpdateStatus() {
        const data = await request('/api/v1/app/update/status');
        updatePanel.textContent = JSON.stringify(data, null, 2);
      }

      async function exportDiagnostics() {
        const data = await request('/api/v1/diagnostics/export', { method: 'POST' });
        updatePanel.textContent = JSON.stringify({ diagnostics: data }, null, 2);
      }

      document.getElementById('loadRuns').addEventListener('click', () => loadRuns().catch((error) => { runsPanel.textContent = String(error.message || error); }));
      document.getElementById('loadNotifications').addEventListener('click', () => loadNotifications().catch((error) => { notificationsPanel.textContent = String(error.message || error); }));
      document.getElementById('loadHealth').addEventListener('click', () => loadHealth().catch((error) => { healthPanel.textContent = String(error.message || error); }));
      document.getElementById('loadUpdateStatus').addEventListener('click', () => loadUpdateStatus().catch((error) => { updatePanel.textContent = String(error.message || error); }));
      document.getElementById('exportDiagnostics').addEventListener('click', () => exportDiagnostics().catch((error) => { updatePanel.textContent = String(error.message || error); }));

      loadRuns().catch(() => undefined);
      loadNotifications().catch(() => undefined);
      loadHealth().catch(() => undefined);
      loadUpdateStatus().catch(() => undefined);
    </script>
  </body>
</html>`;
}

function renderMobileConsoleHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>书灵阁 Mobile</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5efe5;
        --card: rgba(255,255,255,0.86);
        --line: rgba(54, 43, 31, 0.14);
        --text: #2c241c;
        --muted: #74685b;
        --accent: #9d5f2d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "PingFang SC", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top right, rgba(157,95,45,0.18), transparent 35%),
          linear-gradient(180deg, #f7f2ea 0%, var(--bg) 100%);
      }
      main {
        max-width: 880px;
        margin: 0 auto;
        padding: 16px;
        display: grid;
        gap: 14px;
      }
      .hero, .card {
        border: 1px solid var(--line);
        background: var(--card);
        border-radius: 20px;
        box-shadow: 0 12px 30px rgba(70, 50, 32, 0.08);
      }
      .hero { padding: 18px; }
      .hero h1 { margin: 0 0 6px; font-size: 28px; }
      .hero p, .muted, label { color: var(--muted); }
      .grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .card { padding: 16px; }
      .field-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      }
      input, textarea, button {
        width: 100%;
        border-radius: 12px;
        border: 1px solid var(--line);
        font: inherit;
      }
      input, textarea {
        padding: 11px 12px;
        background: rgba(255,255,255,0.9);
        color: var(--text);
      }
      textarea {
        min-height: 140px;
        resize: vertical;
      }
      button {
        padding: 12px 14px;
        background: linear-gradient(135deg, var(--accent) 0%, #bb7d4d 100%);
        color: white;
        font-weight: 600;
      }
      button.secondary {
        background: white;
        color: var(--text);
      }
      .button-row {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      }
      pre, .list {
        margin: 0;
        padding: 12px;
        border-radius: 14px;
        background: rgba(80, 58, 37, 0.05);
        border: 1px solid rgba(80, 58, 37, 0.08);
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .run-item {
        padding: 10px 0;
        border-bottom: 1px solid rgba(80, 58, 37, 0.08);
      }
      .run-item:last-child { border-bottom: 0; }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>涔︾伒闃?Mobile</h1>
        <p>杩滅▼鎺у埗鍙颁笌杞婚噺鍐欎綔鍏ュ彛銆傛敮鎸佽鍙栫珷鑺傘€佸彂璧?9 Agent 娴佺▼銆佹煡鐪嬫渶杩戣繍琛岃褰曘€?/p>
      </section>
      <section class="card">
        <div class="field-grid">
          <label>Project<input id="projectId" value="demo-series"></label>
          <label>Novel<input id="novelId" value="main"></label>
          <label>Chapter<input id="chapterId" value="chapter-001"></label>
          <label>Fallback Model<input id="fallbackModelId" placeholder="workflow-default"></label>
        </div>
        <div class="button-row" style="margin-top:12px">
          <button id="refreshHealth">鍒锋柊鐘舵€?/button>
          <button id="loadChapter" class="secondary">璇诲彇绔犺妭</button>
          <button id="runWorkflow">杩愯 9 Agent</button>
          <button id="loadRuns" class="secondary">鍒锋柊 Runs</button>
        </div>
      </section>
      <section class="grid">
        <article class="card">
          <h2>鏈嶅姟鐘舵€?/h2>
          <pre id="healthPanel">绛夊緟鍔犺浇...</pre>
        </article>
        <article class="card">
          <h2>鏈€杩?Runs</h2>
          <div id="runsPanel" class="list">鏆傛棤鏁版嵁</div>
        </article>
      </section>
      <section class="grid">
        <article class="card">
          <h2>绔犺妭姝ｆ枃</h2>
          <textarea id="chapterContent" placeholder="鍏堣鍙栫珷鑺傦紝鎴栫洿鎺ョ矘璐存湰鍦拌交閲忎慨鏀瑰悗鐨勬鏂囥€?></textarea>
        </article>
        <article class="card">
          <h2>杩愯缁撴灉</h2>
          <pre id="runPanel">绛夊緟杩愯...</pre>
        </article>
      </section>
    </main>
    <script>
      const state = {
        get projectId() { return document.getElementById("projectId").value.trim(); },
        get novelId() { return document.getElementById("novelId").value.trim(); },
        get chapterId() { return document.getElementById("chapterId").value.trim(); },
        get fallbackModelId() { return document.getElementById("fallbackModelId").value.trim(); },
      };
      const healthPanel = document.getElementById("healthPanel");
      const runPanel = document.getElementById("runPanel");
      const runsPanel = document.getElementById("runsPanel");
      const chapterContent = document.getElementById("chapterContent");

      async function request(url, init) {
        const response = await fetch(url, init);
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload?.error?.message || "request failed");
        }
        return payload.data;
      }

      async function refreshHealth() {
        const data = await request("/api/v1/health");
        healthPanel.textContent = JSON.stringify(data, null, 2);
      }

      async function loadChapter() {
        const data = await request('/api/v1/editor/chapters/' + encodeURIComponent(state.chapterId) + '?projectId=' + encodeURIComponent(state.projectId) + '&novelId=' + encodeURIComponent(state.novelId));
        chapterContent.value = data.content;
      }

      async function loadRuns() {
        const data = await request('/api/v1/runs?projectId=' + encodeURIComponent(state.projectId) + '&novelId=' + encodeURIComponent(state.novelId) + '&chapterId=' + encodeURIComponent(state.chapterId));
        if (!data.runs.length) {
          runsPanel.textContent = "鏆傛棤杩愯璁板綍";
          return;
        }
        runsPanel.innerHTML = data.runs.map((run) =>
          '<div class="run-item"><strong>' + run.id + '</strong><br>status: ' + run.status + ' | nodes: ' + run.nodes.length + ' | started: ' + run.startedAt + '</div>'
        ).join("");
      }

      async function runWorkflow() {
        runPanel.textContent = "杩愯涓?..";
        const data = await request('/api/v1/chapters/' + encodeURIComponent(state.chapterId) + '/run', {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId: state.projectId,
            novelId: state.novelId,
            fallbackModelId: state.fallbackModelId || undefined,
            wait: true,
          }),
        });
        runPanel.textContent = JSON.stringify(data.run, null, 2);
        await loadChapter();
        await loadRuns();
      }

      document.getElementById("refreshHealth").addEventListener("click", () => refreshHealth().catch((error) => {
        healthPanel.textContent = String(error.message || error);
      }));
      document.getElementById("loadChapter").addEventListener("click", () => loadChapter().catch((error) => {
        chapterContent.value = String(error.message || error);
      }));
      document.getElementById("runWorkflow").addEventListener("click", () => runWorkflow().catch((error) => {
        runPanel.textContent = String(error.message || error);
      }));
      document.getElementById("loadRuns").addEventListener("click", () => loadRuns().catch((error) => {
        runsPanel.textContent = String(error.message || error);
      }));

      refreshHealth().catch(() => undefined);
      loadRuns().catch(() => undefined);
    </script>
  </body>
</html>`;
}

function renderMobileConsoleHtmlV15(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>涔︾伒闃?Mobile</title>
    <style>
      :root { --bg:#f5efe5; --card:rgba(255,255,255,.92); --line:rgba(54,43,31,.14); --text:#2c241c; --muted:#74685b; --accent:#9d5f2d; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:"Segoe UI","PingFang SC",sans-serif; color:var(--text); background:radial-gradient(circle at top right, rgba(157,95,45,.18), transparent 35%), linear-gradient(180deg,#f7f2ea 0%, var(--bg) 100%); }
      main { max-width:960px; margin:0 auto; padding:16px; display:grid; gap:14px; }
      .hero,.card { border:1px solid var(--line); background:var(--card); border-radius:20px; box-shadow:0 12px 30px rgba(70,50,32,.08); padding:16px; }
      .hero h1,.card h2 { margin:0 0 8px; }
      .muted,label { color:var(--muted); }
      .grid,.field-grid,.button-row { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }
      input,textarea,button { width:100%; border-radius:12px; border:1px solid var(--line); font:inherit; }
      input,textarea { padding:11px 12px; background:rgba(255,255,255,.9); color:var(--text); }
      textarea { min-height:160px; resize:vertical; }
      button { padding:12px 14px; background:linear-gradient(135deg,var(--accent) 0%,#bb7d4d 100%); color:white; font-weight:600; }
      button.secondary { background:white; color:var(--text); }
      pre,.list { margin:0; padding:12px; border-radius:14px; background:rgba(80,58,37,.05); border:1px solid rgba(80,58,37,.08); overflow:auto; white-space:pre-wrap; word-break:break-word; }
      .run-item { padding:10px 0; border-bottom:1px solid rgba(80,58,37,.08); }
      .run-item:last-child { border-bottom:0; }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>书灵阁 Mobile</h1>
        <p class="muted">V1.5 远程控制台：轻量编辑、9 Agent 运行、版本时间线、一致性检查、健康报告与备份提醒。</p>
      </section>
      <section class="card">
        <div class="field-grid">
          <label>Project<input id="projectId" value="demo-series"></label>
          <label>Novel<input id="novelId" value="main"></label>
          <label>Chapter<input id="chapterId" value="chapter-001"></label>
          <label>Fallback Model<input id="fallbackModelId" placeholder="workflow-default"></label>
        </div>
        <div class="button-row" style="margin-top:12px">
          <button id="refreshHealth">刷新健康报告</button>
          <button id="refreshNotifications" class="secondary">刷新通知</button>
          <button id="loadChapter" class="secondary">读取章节</button>
          <button id="saveChapter" class="secondary">保存轻编辑</button>
          <button id="runWorkflow">运行 9 Agent</button>
          <button id="loadRuns" class="secondary">刷新 Runs</button>
          <button id="loadTimeline" class="secondary">查看时间线</button>
          <button id="rollbackLatest" class="secondary">回滚最近快照</button>
          <button id="checkConsistency" class="secondary">一致性检查</button>
        </div>
      </section>
      <section class="grid">
        <article class="card"><h2>健康报告</h2><pre id="healthPanel">等待加载...</pre></article>
        <article class="card"><h2>提醒</h2><div id="remindersPanel" class="list">等待加载...</div></article>
        <article class="card"><h2>通知</h2><div id="notificationsPanel" class="list">等待加载...</div></article>
        <article class="card"><h2>最近 Runs</h2><div id="runsPanel" class="list">暂无数据</div></article>
      </section>
      <section class="grid">
        <article class="card"><h2>章节正文</h2><textarea id="chapterContent" placeholder="先读取章节，再进行轻量编辑。"></textarea></article>
        <article class="card"><h2>运行结果</h2><pre id="runPanel">等待运行...</pre></article>
        <article class="card"><h2>版本时间线</h2><pre id="timelinePanel">等待加载...</pre></article>
        <article class="card"><h2>一致性检查</h2><pre id="consistencyPanel">等待检查...</pre></article>
      </section>
    </main>
    <script>
      const state = {
        get projectId() { return document.getElementById("projectId").value.trim(); },
        get novelId() { return document.getElementById("novelId").value.trim(); },
        get chapterId() { return document.getElementById("chapterId").value.trim(); },
        get fallbackModelId() { return document.getElementById("fallbackModelId").value.trim(); },
      };
      const healthPanel = document.getElementById("healthPanel");
      const remindersPanel = document.getElementById("remindersPanel");
      const notificationsPanel = document.getElementById("notificationsPanel");
      const runsPanel = document.getElementById("runsPanel");
      const chapterContent = document.getElementById("chapterContent");
      const runPanel = document.getElementById("runPanel");
      const timelinePanel = document.getElementById("timelinePanel");
      const consistencyPanel = document.getElementById("consistencyPanel");

      async function request(url, init) {
        const response = await fetch(url, init);
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "request failed");
        return payload.data;
      }

      async function refreshHealth() {
        const data = await request("/api/v1/health/report");
        healthPanel.textContent = JSON.stringify(data, null, 2);
        remindersPanel.textContent = (data.reminders || []).map((item) => '[' + item.level + '] ' + item.title + ': ' + item.message).join('\\n') || '暂无提醒';
      }

      async function refreshNotifications() {
        const data = await request('/api/v1/notifications?projectId=' + encodeURIComponent(state.projectId) + '&novelId=' + encodeURIComponent(state.novelId) + '&chapterId=' + encodeURIComponent(state.chapterId));
        notificationsPanel.textContent = (data.notifications || []).map((item) => '[' + item.level + '][' + item.source + '] ' + item.title + ': ' + item.message).join('\\n') || '暂无通知';
      }

      async function loadChapter() {
        const data = await request('/api/v1/editor/chapters/' + encodeURIComponent(state.chapterId) + '?projectId=' + encodeURIComponent(state.projectId) + '&novelId=' + encodeURIComponent(state.novelId));
        chapterContent.value = data.content;
      }

      async function saveChapter() {
        const data = await request('/api/v1/editor/chapters/' + encodeURIComponent(state.chapterId) + '/save', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({ projectId: state.projectId, novelId: state.novelId, content: chapterContent.value }),
        });
        runPanel.textContent = JSON.stringify({ saved: true, wordCount: data.metadata.wordCount }, null, 2);
        await loadTimeline();
        await refreshNotifications();
      }

      async function loadRuns() {
        const data = await request('/api/v1/runs?projectId=' + encodeURIComponent(state.projectId) + '&novelId=' + encodeURIComponent(state.novelId) + '&chapterId=' + encodeURIComponent(state.chapterId));
        if (!data.runs.length) { runsPanel.textContent = '暂无运行记录'; return; }
        runsPanel.innerHTML = data.runs.map((run) => '<div class="run-item"><strong>' + run.id + '</strong><br>status: ' + run.status + ' | nodes: ' + run.nodes.length + ' | started: ' + run.startedAt + '</div>').join('');
      }

      async function runWorkflow() {
        runPanel.textContent = '运行中...';
        const data = await request('/api/v1/chapters/' + encodeURIComponent(state.chapterId) + '/run', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({ projectId: state.projectId, novelId: state.novelId, fallbackModelId: state.fallbackModelId || undefined, wait: true }),
        });
        runPanel.textContent = JSON.stringify(data.run, null, 2);
        await loadChapter();
        await loadRuns();
        await loadTimeline();
        await refreshNotifications();
      }

      async function loadTimeline() {
        const data = await request('/api/v1/version/chapters/' + encodeURIComponent(state.chapterId) + '/timeline?projectId=' + encodeURIComponent(state.projectId) + '&novelId=' + encodeURIComponent(state.novelId));
        timelinePanel.textContent = JSON.stringify(data, null, 2);
        return data;
      }

      async function rollbackLatest() {
        const timeline = await loadTimeline();
        const latest = timeline.snapshots && timeline.snapshots.length ? timeline.snapshots[timeline.snapshots.length - 1] : null;
        if (!latest || !latest.path) {
          throw new Error('no snapshot available');
        }
        const data = await request('/api/v1/version/chapters/' + encodeURIComponent(state.chapterId) + '/rollback', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({ projectId: state.projectId, novelId: state.novelId, snapshotPath: latest.path }),
        });
        chapterContent.value = data.content;
        runPanel.textContent = JSON.stringify({ rolledBackFrom: latest.path, metadata: data.metadata }, null, 2);
        await loadTimeline();
        await refreshNotifications();
      }

      async function checkConsistency() {
        const data = await request('/api/v1/consistency/check', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body: JSON.stringify({ projectId: state.projectId, novelId: state.novelId }),
        });
        consistencyPanel.textContent = JSON.stringify(data, null, 2);
        await refreshNotifications();
      }

      document.getElementById('refreshHealth').addEventListener('click', () => refreshHealth().catch((error) => { healthPanel.textContent = String(error.message || error); }));
      document.getElementById('refreshNotifications').addEventListener('click', () => refreshNotifications().catch((error) => { notificationsPanel.textContent = String(error.message || error); }));
      document.getElementById('loadChapter').addEventListener('click', () => loadChapter().catch((error) => { chapterContent.value = String(error.message || error); }));
      document.getElementById('saveChapter').addEventListener('click', () => saveChapter().catch((error) => { runPanel.textContent = String(error.message || error); }));
      document.getElementById('runWorkflow').addEventListener('click', () => runWorkflow().catch((error) => { runPanel.textContent = String(error.message || error); }));
      document.getElementById('loadRuns').addEventListener('click', () => loadRuns().catch((error) => { runsPanel.textContent = String(error.message || error); }));
      document.getElementById('loadTimeline').addEventListener('click', () => loadTimeline().catch((error) => { timelinePanel.textContent = String(error.message || error); }));
      document.getElementById('rollbackLatest').addEventListener('click', () => rollbackLatest().catch((error) => { runPanel.textContent = String(error.message || error); }));
      document.getElementById('checkConsistency').addEventListener('click', () => checkConsistency().catch((error) => { consistencyPanel.textContent = String(error.message || error); }));

      refreshHealth().catch(() => undefined);
      refreshNotifications().catch(() => undefined);
      loadRuns().catch(() => undefined);
      loadTimeline().catch(() => undefined);
    </script>
  </body>
</html>`;
}

function isLoopbackAddress(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

function isLocalRequest(request: http.IncomingMessage, allowTestRemoteOverride: boolean): boolean {
  if (allowTestRemoteOverride && request.headers["x-shulingge-test-remote"] === "1") {
    return false;
  }

  return isLoopbackAddress(request.socket.remoteAddress);
}

export async function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
  let remoteServer: http.Server | null = null;
  const context: ServerContext = {
    state: {
      vaultRoot: options.vaultRoot ?? null,
      workflowRuns: new Map(),
    },
    services: {
      credentialService: options.credentialService ?? new CredentialService(createSystemCredentialStore()),
      fetchImpl: options.fetchImpl,
      providerEndpoints: options.providerEndpoints,
      remote: createRemoteGatewayController({
        vaultRoot: options.vaultRoot ?? null,
        async startListener(requestedPort) {
          if (remoteServer) {
            return remoteServer.address() as AddressInfo;
          }

          remoteServer = http.createServer((incoming, outgoing) => {
            void handleRequest(incoming, outgoing, "remote");
          });

          const listeningAddress = await new Promise<AddressInfo>((resolve, reject) => {
            const attempt = (port: number) => {
              const onError = (error: NodeJS.ErrnoException) => {
                remoteServer?.off("error", onError);
                if (error.code === "EADDRINUSE") {
                  attempt(port + 1);
                  return;
                }

                reject(error);
              };

              remoteServer?.once("error", onError);
              remoteServer?.listen({ host: "0.0.0.0", port }, async () => {
                remoteServer?.off("error", onError);
                const address = remoteServer?.address();
                if (!address || typeof address === "string") {
                  reject(new Error("Remote server failed to bind to a TCP address"));
                  return;
                }

                resolve(address);
              });
            };

            attempt(requestedPort);
          });

          return listeningAddress;
        },
        async stopListener() {
          if (!remoteServer) {
            return;
          }

          const closingServer = remoteServer;
          remoteServer = null;
          closingServer.close();
          await once(closingServer, "close");
        },
      }),
    },
  };
  const router = createRouter(routeDefinitions);

  const handleRequest = async (
    incoming: http.IncomingMessage,
    outgoing: http.ServerResponse,
    mode: "local" | "remote",
  ) => {
    try {
      const requestUrl = new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "127.0.0.1"}`);

      if (requestUrl.pathname === "/m") {
        writeHtml(outgoing, 200, renderMobileConsoleHtmlV15());
        return;
      }
      if (requestUrl.pathname === "/desktop/workspace") {
        writeHtml(outgoing, 200, renderDesktopWorkspaceHtml());
        return;
      }
      if (requestUrl.pathname === "/desktop/mobile") {
        writeHtml(outgoing, 200, renderDesktopMobileHtml());
        return;
      }
      if (requestUrl.pathname === "/desktop/runs") {
        writeHtml(outgoing, 200, renderDesktopRunsHtml());
        return;
      }

      if (await tryServeWebAsset(requestUrl.pathname, outgoing, options.webDistPath)) {
        return;
      }

      const localRequest = isLocalRequest(incoming, options.allowTestRemoteOverride ?? false);
      if (mode === "remote" && !localRequest) {
        if (requestUrl.pathname === "/api/v1/remote/password") {
          throw new Error("REMOTE_PASSWORD_LOCAL_ONLY");
        }

        const password = incoming.headers["x-shulingge-remote-password"];
        const passwordValue = Array.isArray(password) ? password[0] : password;
        const verified = await context.services.remote.verifyPassword(passwordValue ?? "");
        if (!verified) {
          outgoing.statusCode = 401;
          outgoing.setHeader("content-type", "application/json; charset=utf-8");
          outgoing.end(
            JSON.stringify({
              ok: false,
              error: {
                code: "REMOTE_AUTH_REQUIRED",
                message: "Remote password is required",
              },
            }),
          );
          return;
        }
      }

      const body = await parseJsonBody(incoming);
      const { route, params } = await router.match(incoming.method ?? "GET", requestUrl.pathname);
      const routeRequest = toRouteRequest(incoming, incoming.method ?? "GET", requestUrl, params, body);
      const data = await route.handler(routeRequest, context);

      writeJson(outgoing, 200, {
        ok: true,
        data,
      } satisfies ApiSuccess<unknown>);
    } catch (error) {
      if (error instanceof Error && error.message === "REMOTE_PASSWORD_LOCAL_ONLY") {
        writeJson(outgoing, 403, {
          ok: false,
          error: {
            code: "REMOTE_PASSWORD_LOCAL_ONLY",
            message: "Remote password can only be changed from a local request",
          },
        });
        return;
      }

      const payload = toErrorPayload(error);
      writeJson(outgoing, payload.statusCode, payload.body);
    }
  };

  const server = http.createServer(async (incoming, outgoing) => {
    await handleRequest(incoming, outgoing, "local");
  });

  const wsServer = new WebSocketServer({ noServer: true });
  wsServer.on("connection", (socket) => {
    socket.send(
      JSON.stringify({
        event: "remote.status",
        data: {
          enabled: false,
          address: null,
        },
      }),
    );
  });

  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws") {
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(request, socket, head, (client) => {
      wsServer.emit("connection", client, request);
    });
  });

  server.listen({
    host: options.host ?? DEFAULT_HOST,
    port: options.port ?? DEFAULT_PORT,
  });

  await once(server, "listening");
  await context.services.remote.reloadForVault(context.state.vaultRoot);

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server failed to bind to a TCP address");
  }

  return {
    host: address.address,
    port: address.port,
    baseUrl: `http://${toHttpHost(address.address)}:${address.port}`,
    remoteStatus() {
      return context.services.remote.getStatus();
    },
    async close() {
      await context.services.remote.close();
      wsServer.close();
      server.close();
      await once(server, "close");
    },
  };
}
