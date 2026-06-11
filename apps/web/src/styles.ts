// 书灵阁设计系统：全局 CSS（设计令牌 + 组件规范 + 暗色模式）。
// 视觉方向：中式文房 / 纸墨书卷气 + 现代生产力工具的克制感。留白充足、低噪音、呼吸感。
// 所有颜色/圆角/间距/阴影一律引用 CSS 变量，禁止散落硬编码。

export const globalCss = `
:root {
  --bg-app: #F5F3EE;
  --bg-panel: #FBFAF7;
  --bg-card: #FFFFFF;
  --bg-hover: #EFEDE6;
  --bg-active: #E4EFE9;

  --primary: #2D6A4F;
  --primary-hover: #245741;
  --primary-light: #E4EFE9;

  --text-primary: #2B2B28;
  --text-secondary: #6B6A63;
  --text-muted: #9C9A90;
  --text-on-primary: #FFFFFF;

  --border: #E6E3DA;
  --border-strong: #D4D0C4;

  --success: #4A7C59;
  --warning: #B8860B;
  --danger: #A94442;
  --info: #5B7B9A;

  --agent-idle: #C9C6BB;
  --agent-running: #2D6A4F;
  --agent-done: #4A7C59;
  --agent-error: #A94442;

  --font-serif: "Noto Serif SC", "Source Han Serif SC", "宋体", serif;
  --font-sans: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: "JetBrains Mono", "Consolas", monospace;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --shadow-card: 0 1px 3px rgba(43,43,40,0.06);
  --shadow-popover: 0 4px 16px rgba(43,43,40,0.10);
  --shadow-paper: 0 1px 2px rgba(43,43,40,0.04), 0 8px 32px rgba(43,43,40,0.06);
}

:root[data-theme="dark"] {
  --bg-app: #1A1D1A;
  --bg-panel: #20241F;
  --bg-card: #272C25;
  --bg-hover: #2E332B;
  --bg-active: #2B3A30;
  --primary: #5BA37E;
  --primary-hover: #6DB590;
  --primary-light: #2B3A30;
  --text-primary: #E9E7DF;
  --text-secondary: #ABA99E;
  --text-muted: #76756B;
  --text-on-primary: #11150F;
  --border: #343A31;
  --border-strong: #454C40;
  --success: #6DB590;
  --warning: #D2A53C;
  --danger: #CC7766;
  --agent-idle: #4A5043;
  --agent-running: #5BA37E;
  --agent-done: #6DB590;
  --agent-error: #CC7766;
  --shadow-card: 0 1px 3px rgba(0,0,0,0.30);
  --shadow-popover: 0 4px 16px rgba(0,0,0,0.40);
  --shadow-paper: 0 1px 2px rgba(0,0,0,0.30), 0 8px 32px rgba(0,0,0,0.35);
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  background: var(--bg-app);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
h1,h2,h3,h4 { margin: 0; font-weight: 600; }
ul { margin: 0; padding: 0; list-style: none; }
button { font-family: inherit; cursor: pointer; color: inherit; }
input, textarea { font-family: inherit; }

* { scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 999px; }
*::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
*::-webkit-scrollbar-track { background: transparent; }

/* ===== 组件 ===== */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; border: 1px solid var(--border-strong); background: var(--bg-card); color: var(--text-primary); transition: background .16s ease, border-color .16s ease, color .16s ease; white-space: nowrap; }
.btn:hover { background: var(--bg-hover); }
.btn-primary { background: var(--primary); border-color: var(--primary); color: var(--text-on-primary); }
.btn-primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
.btn-danger { background: var(--danger); border-color: var(--danger); color: #fff; }
.btn-danger:hover { background: var(--danger); border-color: var(--danger); filter: brightness(.95); }
.btn-ghost { background: transparent; border-color: transparent; color: var(--text-secondary); }
.btn-ghost:hover { background: var(--bg-hover); color: var(--text-primary); }
.btn-icon { width: 32px; height: 32px; padding: 0; border: 0; background: transparent; color: var(--text-secondary); border-radius: var(--radius-sm); display: grid; place-items: center; transition: background .16s ease, color .16s ease; }
.btn-icon:hover { background: var(--bg-hover); color: var(--text-primary); }
.btn-icon.active { background: var(--primary-light); color: var(--primary); }
.btn-icon.danger:hover { background: rgba(169,68,66,.10); color: var(--danger); }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.input { height: 34px; padding: 0 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); font-size: 13px; transition: border-color .16s ease, box-shadow .16s ease; outline: none; }
.input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); }
.badge { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 500; background: var(--primary-light); color: var(--primary); }
.segmented { display: inline-flex; padding: 3px; background: var(--bg-hover); border-radius: var(--radius-sm); gap: 2px; }
.segmented button { height: 26px; padding: 0 14px; border: 0; background: transparent; color: var(--text-secondary); font-size: 12px; border-radius: 5px; transition: background .16s ease, color .16s ease; }
.segmented button.on { background: var(--bg-card); color: var(--text-primary); box-shadow: var(--shadow-card); }
.muted { color: var(--text-secondary); }
.faint { color: var(--text-muted); }

/* ===== App Shell：四列 64 / 264 / 1fr / 384 ===== */
.app-shell { display: grid; grid-template-columns: 64px 1fr; height: 100%; }
.workspace { display: grid; grid-template-columns: 264px minmax(0,1fr) clamp(320px, 26vw, 380px); height: 100%; min-height: 0; }
.workspace.focus-mode { grid-template-columns: minmax(0,1fr); }
.workspace.focus-mode .tree-panel,
.workspace.focus-mode .chat-pane { display: none; }
.main { min-width: 0; height: 100%; overflow: hidden; display: flex; flex-direction: column; }
.main > .view,
.main > .workspace { flex: 1; min-height: 0; }
.mobile-shell-header,
.mobile-nav,
.workspace-mobile-header { display: none; }

/* 第一列：图标导航 */
.rail { background: var(--bg-panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 16px 0; gap: 6px; }
.rail-logo { width: 40px; height: 40px; border-radius: 11px; overflow: hidden; margin-bottom: 18px; box-shadow: var(--shadow-card); }
.rail-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rail-item { width: 50px; height: 54px; border: 0; background: transparent; color: var(--text-secondary); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; transition: background .16s ease, color .16s ease; }
.rail-item .rail-label { font-size: 11px; line-height: 1; }
.rail-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.rail-item.active { background: var(--primary-light); color: var(--primary); }
.rail-spacer { flex: 1; }

/* 第二列：章节树 */
.tree-panel { background: var(--bg-panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
.tree-head { display: flex; align-items: center; justify-content: space-between; padding: 22px 20px 14px; }
.tree-head h2 { font-size: 15px; font-weight: 600; }
.tree-total-words { margin-top: 4px; font-size: 12px; color: var(--text-muted); }
.tree-head-actions { display: flex; align-items: center; gap: 4px; }
.tree-search-box { padding: 0 12px 10px; }
.tree-search-field { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-muted); }
.tree-search-field:focus-within { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); }
.tree-search-field input { min-width: 0; flex: 1; border: 0; outline: none; background: transparent; color: var(--text-primary); font-size: 13px; }
.tree-search-field input::placeholder { color: var(--text-muted); }
.tree-search-clear { width: 24px; height: 24px; display: grid; place-items: center; flex: none; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-muted); transition: background .16s ease, color .16s ease; }
.tree-search-clear:hover { background: var(--bg-hover); color: var(--text-primary); }
.tree-search-feedback { margin-top: 6px; padding: 0 2px; color: var(--text-muted); font-size: 12px; }
.spin-icon { animation: spin 0.9s linear infinite; }
.tree-create { position: relative; }
.tree-create-menu { position: absolute; top: calc(100% + 8px); right: 0; z-index: 20; width: 116px; padding: 6px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-popover); }
.tree-create-menu button { width: 100%; height: 32px; padding: 0 10px; border: 0; background: transparent; color: var(--text-secondary); border-radius: var(--radius-sm); font-size: 13px; text-align: left; cursor: pointer; transition: background .16s ease, color .16s ease; }
.tree-create-menu button:hover { background: var(--bg-hover); color: var(--text-primary); }
.tree-context-menu { position: fixed; z-index: 100; width: 176px; padding: 6px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-popover); }
.tree-context-menu button { width: 100%; height: 32px; padding: 0 10px; border: 0; background: transparent; color: var(--text-secondary); border-radius: var(--radius-sm); font-size: 13px; text-align: left; cursor: pointer; transition: background .16s ease, color .16s ease; }
.tree-context-menu button:hover { background: var(--bg-hover); color: var(--text-primary); }
.tree-context-menu button.danger { color: var(--danger); }
.tree-context-menu button.danger:hover { background: var(--bg-hover); color: var(--danger); }
.tree-context-submenu { max-height: 180px; overflow: auto; margin: 4px 0; padding: 4px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.tree-context-submenu-title { padding: 3px 10px 5px; color: var(--text-muted); font-size: 12px; }
.tree-scroll { overflow: auto; padding: 4px 12px 20px; }
.tree-loose-drop { min-height: 12px; border-radius: var(--radius-sm); transition: background .16s ease, box-shadow .16s ease; }
.tree-loose-drop.drag-over { background: var(--primary-light); box-shadow: inset 0 0 0 1px var(--primary); }
.tree-group-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; font-size: 12px; font-weight: 500; color: var(--text-muted); padding: 16px 12px 8px; letter-spacing: .03em; border-radius: var(--radius-sm); transition: background .16s ease, color .16s ease; }
.tree-group-label:hover { background: var(--bg-hover); color: var(--text-secondary); }
.tree-group-label.active { background: var(--bg-active); color: var(--primary); }
.tree-group-label.drag-over { background: var(--primary-light); color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary); }
.tree-group-toggle { min-width: 0; flex: 1; display: flex; align-items: center; gap: 6px; border: 0; background: transparent; color: inherit; font: inherit; letter-spacing: inherit; padding: 0; text-align: left; cursor: pointer; }
.tree-group-toggle span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-item { display: flex; align-items: center; gap: 10px; width: 100%; height: 40px; padding: 0 12px; margin-bottom: 3px; border: 0; background: transparent; color: var(--text-secondary); font-size: 13.5px; border-radius: var(--radius-sm); cursor: pointer; text-align: left; transition: background .16s ease, color .16s ease; position: relative; }
.tree-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.tree-item.active { background: var(--bg-active); color: var(--primary); font-weight: 600; }
.tree-item.active::before { content: ""; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px; border-radius: 0 3px 3px 0; background: var(--primary); }
.tree-item .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--agent-idle); flex: none; }
.tree-item.active .dot { background: var(--primary); }
.tree-item .dot.status-not-started { background: var(--agent-idle); }
.tree-item .dot.status-planning { background: var(--info); }
.tree-item .dot.status-drafting { background: var(--agent-running); }
.tree-item .dot.status-checking { background: var(--warning); }
.tree-item .dot.status-repairing { background: var(--danger); }
.tree-item .dot.status-await-human { background: var(--warning); }
.tree-item .dot.status-finalized { background: var(--agent-done); }
.tree-item .dot.status-archived { background: var(--text-muted); }
.tree-item .t-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-word-count { margin-left: auto; flex: none; color: var(--text-muted); font-size: 12px; font-weight: 400; letter-spacing: 0; }
.search-results { display: flex; flex-direction: column; gap: 8px; }
.search-result-item { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); color: var(--text-secondary); text-align: left; transition: background .16s ease, border-color .16s ease; }
.search-result-item:hover { background: var(--bg-hover); border-color: var(--border-strong); color: var(--text-primary); }
.search-result-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.search-result-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); font-weight: 600; font-size: 13px; }
.search-result-snippet { display: block; margin-top: 6px; color: var(--text-muted); font-size: 12px; line-height: 1.6; }

/* 第三列：编辑器（纸张，周围留呼吸） */
.editor-pane { background: var(--bg-app); display: flex; flex-direction: column; min-width: 0; }
.editor-scroll { flex: 1; overflow: auto; display: flex; justify-content: center; padding: 32px 36px 48px; }
.paper { width: 100%; max-width: 820px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-paper); display: flex; flex-direction: column; align-self: flex-start; min-height: calc(100% - 0px); position: relative; }
.editor-workbench { width: 100%; max-width: 860px; display: grid; grid-template-columns: minmax(0,1fr); gap: 20px; justify-content: center; align-items: start; }
.editor-workbench.focus-mode { grid-template-columns: minmax(0, 860px); max-width: 860px; }
.paper-toolbar { display: flex; align-items: center; gap: 2px; height: 52px; padding: 0 16px; border-bottom: 1px solid var(--border); }
.paper-toolbar .sep { width: 1px; height: 20px; background: var(--border); margin: 0 8px; }
.paper-toolbar .grow { flex: 1; }
.toolbar-active { background: var(--primary-light); color: var(--primary); }
.outline-popover { position: absolute; top: 58px; right: 14px; z-index: 30; width: min(320px, calc(100% - 28px)); max-height: min(420px, calc(100% - 84px)); overflow: hidden; display: flex; flex-direction: column; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-popover); }
.outline-popover-head { height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 10px 0 14px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 13px; }
.outline-popover-list { overflow: auto; padding: 8px; }
.outline-popover-item { width: 100%; display: flex; flex-direction: column; gap: 3px; padding: 9px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-secondary); text-align: left; transition: background .16s ease, color .16s ease; }
.outline-popover-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.outline-item-title { color: var(--text-primary); font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.outline-item-sub { color: var(--text-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.outline-empty { padding: 18px 12px; color: var(--text-muted); font-size: 13px; line-height: 1.7; }
.paper-body { padding: 48px 56px 64px; flex: 1; display: flex; flex-direction: column; }
.chapter-title { font-family: var(--font-serif); font-size: 28px; font-weight: 600; letter-spacing: .01em; line-height: 1.4; }
.chapter-title-input { width: 100%; padding: 0 0 4px; border: 0; border-bottom: 1px solid transparent; outline: none; background: transparent; color: var(--text-primary); }
.chapter-title-input:focus { border-bottom-color: var(--border-strong); }
.title-rule { width: 40px; height: 2px; background: var(--primary); margin: 18px 0 28px; border-radius: 2px; }
.manuscript { font-family: var(--font-serif); font-size: 16px; line-height: 1.95; letter-spacing: .02em; color: var(--text-primary); border: 0; outline: none; resize: none; background: transparent; width: 100%; flex: 1; min-height: 320px; }
.manuscript::placeholder { color: var(--text-muted); }
.editor-empty { flex: 1; min-height: 420px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text-muted); text-align: center; }
.editor-statusbar { display: flex; align-items: center; gap: 20px; padding: 11px 28px; border-top: 1px solid var(--border); background: var(--bg-panel); font-size: 12px; color: var(--text-secondary); }
.editor-statusbar .grow { flex: 1; }

/* Vault 内嵌引导卡 */
.vault-card { display: flex; align-items: center; gap: 12px; margin: 20px 24px 0; padding: 14px 16px; background: var(--bg-card); border: 1px dashed var(--border-strong); border-radius: var(--radius-md); }
.vault-card .vc-icon { color: var(--primary); flex: none; }
.vault-card .vc-text { font-size: 13px; color: var(--text-primary); white-space: nowrap; }
.vault-card .input { flex: 1; }
.err-card { margin: 14px 24px 0; padding: 11px 16px; background: var(--bg-card); border: 1px solid var(--border-strong); border-left: 3px solid var(--danger); border-radius: var(--radius-sm); font-size: 13px; color: var(--danger); }

.vault-modal-backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 24px; background: rgba(43,43,40,0.34); backdrop-filter: blur(10px); }
.vault-modal { width: min(520px, 100%); background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-popover); padding: 30px 32px; }
.vault-modal-mark { width: 44px; height: 44px; display: grid; place-items: center; color: var(--primary); background: var(--primary-light); border-radius: var(--radius-md); margin-bottom: 16px; }
.vault-modal h2 { margin: 0; font-family: var(--font-serif); font-size: 25px; line-height: 1.3; }
.vault-modal p { margin: 10px 0 20px; color: var(--text-secondary); }
.vault-modal .err-card { margin: 14px 0 0; }
.vault-modal-actions { display: flex; justify-content: flex-end; margin-top: 18px; }
.input-modal { display: grid; gap: 18px; }
.confirm-modal { display: grid; gap: 16px; }
.input-modal .vault-modal-actions { gap: 8px; margin-top: 0; }
.confirm-modal .vault-modal-actions { gap: 8px; margin-top: 0; }

.save-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); display: inline-block; margin-right: 7px; vertical-align: middle; }
.save-dot.dirty, .save-dot.saving { background: var(--warning); }
.save-dot.saving { animation: breathe 1.6s ease-in-out infinite; }
.save-dot.error { background: var(--danger); }

/* ===== 第四列：总控 AI 对话窗 ===== */
.chat-pane { background: var(--bg-panel); border-left: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
.chat-head { display: flex; align-items: center; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--border); }
.chat-avatar { width: 38px; height: 38px; border-radius: 11px; background: linear-gradient(135deg, var(--primary), var(--primary-hover)); color: var(--text-on-primary); display: grid; place-items: center; flex: none; }
.chat-head .ch-name { font-size: 14px; font-weight: 600; }
.chat-head .ch-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.chat-head .grow { flex: 1; }
.chat-scroll { flex: 1; overflow: auto; padding: 20px 18px; display: flex; flex-direction: column; gap: 18px; }
.msg { display: flex; gap: 10px; max-width: 100%; }
.msg-av { width: 28px; height: 28px; border-radius: 9px; flex: none; display: grid; place-items: center; font-size: 13px; }
.msg-av.ai { background: var(--primary-light); color: var(--primary); }
.msg-bubble { padding: 11px 14px; border-radius: var(--radius-md); font-size: 13.5px; line-height: 1.7; max-width: 280px; word-break: break-word; }
.msg.ai .msg-bubble { background: var(--bg-card); border: 1px solid var(--border); color: var(--text-primary); border-top-left-radius: 4px; }
.msg.user { flex-direction: row-reverse; }
.msg.user .msg-bubble { background: var(--primary); color: var(--text-on-primary); border-top-right-radius: 4px; }
.msg.user .msg-av { background: var(--bg-hover); color: var(--text-secondary); }

/* 对话内的 Agent 执行卡片 */
.run-inline { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px; margin-left: 38px; box-shadow: var(--shadow-card); }
.run-inline-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.run-inline-head .ri-title { font-size: 12.5px; font-weight: 600; color: var(--text-primary); }
.run-progress { height: 4px; border-radius: 999px; background: var(--border); overflow: hidden; margin-bottom: 14px; }
.run-progress > span { display: block; height: 100%; background: var(--primary); border-radius: 999px; transition: width .4s ease; }
.flow { display: flex; flex-direction: column; }
.flow-row { display: flex; align-items: center; gap: 11px; height: 34px; position: relative; }
.flow-row .f-name { flex: 1; font-size: 12.5px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flow-row.running .f-name { color: var(--primary); font-weight: 600; }
.flow-row.watched .f-name { color: var(--text-primary); font-weight: 600; }
.flow-row .f-order { font-size: 11px; color: var(--text-muted); }
.ring { width: 18px; height: 18px; border-radius: 50%; flex: none; display: grid; place-items: center; border: 2px solid var(--agent-idle); background: transparent; color: #fff; }
.ring.done { border-color: var(--agent-done); background: var(--agent-done); }
.ring.running { border-color: var(--agent-running); animation: breathe 1.6s ease-in-out infinite; }
.ring.error { border-color: var(--agent-error); background: var(--agent-error); }
.flow-row:not(:last-child) .ring::after { content: ""; position: absolute; top: 20px; left: 8px; width: 2px; height: 14px; background: var(--border); }
.flow-row.done .ring::after { background: var(--agent-done); }

/* 对话输入区 */
.chat-input { border-top: 1px solid var(--border); padding: 14px 16px; }
.chat-input-box { display: flex; align-items: flex-end; gap: 8px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px 8px 8px 14px; transition: border-color .16s ease, box-shadow .16s ease; }
.chat-input-box:focus-within { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); }
.chat-input-box textarea { flex: 1; border: 0; outline: none; resize: none; background: transparent; font-size: 13.5px; line-height: 1.6; color: var(--text-primary); max-height: 120px; padding: 4px 0; }
.chat-input-box textarea::placeholder { color: var(--text-muted); }
.chat-send { width: 34px; height: 34px; border-radius: var(--radius-sm); border: 0; background: var(--primary); color: var(--text-on-primary); display: grid; place-items: center; flex: none; transition: background .16s ease; }
.chat-send:hover { background: var(--primary-hover); }
.chat-send:disabled { opacity: .4; cursor: not-allowed; }
.chat-hint { font-size: 11px; color: var(--text-muted); margin-top: 8px; text-align: center; }

.workspace-mobile-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.workspace-mobile-title { font-family: var(--font-serif); font-size: 20px; line-height: 1.4; }
.workspace-mobile-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.workspace-mobile-tabs { margin-top: 12px; width: 100%; }
.workspace-mobile-tabs button { flex: 1; }

/* 占位 / 空态 */
.empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text-muted); text-align: center; padding: 48px; }
.placeholder-view { padding: 64px; }
.placeholder-view h2 { font-family: var(--font-serif); font-size: 24px; color: var(--text-primary); margin-bottom: 10px; }

/* ===== 通用页面：页头 / 列表 / 详情 / 设置 ===== */
.view { height: 100%; display: flex; flex-direction: column; background: var(--bg-app); min-width: 0; }
.view-head { display: flex; align-items: flex-end; justify-content: space-between; padding: 30px 40px 20px; }
.view-title { font-family: var(--font-serif); font-size: 25px; font-weight: 600; }
.view-sub { font-size: 13px; color: var(--text-muted); margin-top: 7px; }
.view-actions { display: flex; gap: 10px; }
.view-body { flex: 1; overflow: auto; padding: 4px 40px 40px; }
.toolbar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.toolbar-row .grow { flex: 1; }
.search { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-muted); min-width: 220px; }
.search input { border: 0; outline: none; background: transparent; font-size: 13px; color: var(--text-primary); flex: 1; }

/* 列表卡片 */
.list-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); overflow: hidden; }
.list-row { display: flex; align-items: center; gap: 16px; min-height: 58px; padding: 10px 22px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background .14s ease; text-align: left; width: 100%; border-left: 0; border-right: 0; border-top: 0; background: transparent; }
.list-row:last-child { border-bottom: 0; }
.list-row:hover { background: var(--bg-panel); }
.list-row.active { background: var(--primary-light); }
.list-row.head { min-height: 42px; padding: 0 22px; font-size: 12px; color: var(--text-muted); cursor: default; background: var(--bg-panel); font-weight: 500; }
.list-row.head:hover { background: var(--bg-panel); }
.col { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-grow { flex: 1; }
.col-name { font-weight: 500; color: var(--text-primary); }
.col-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

/* 头像 */
.avatar { width: 38px; height: 38px; border-radius: 11px; background: var(--primary-light); color: var(--primary); display: grid; place-items: center; font-family: var(--font-serif); font-weight: 600; font-size: 15px; flex: none; overflow: hidden; }
.avatar.lg { width: 96px; height: 96px; font-size: 34px; border-radius: var(--radius-md); }
.avatar img { width: 100%; height: 100%; object-fit: cover; }

/* 详情两栏 */
.detail-grid { display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 20px; align-items: start; }
.info-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); padding: 20px 22px; }
.info-card + .info-card { margin-top: 16px; }
.info-card h3 { font-size: 14px; margin-bottom: 16px; padding-left: 11px; position: relative; }
.info-card h3::before { content: ""; position: absolute; left: 0; top: 1px; bottom: 1px; width: 3px; border-radius: 2px; background: var(--primary); }
.field { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; font-size: 13px; border-bottom: 1px solid var(--border); }
.field:last-child { border-bottom: 0; }
.field .k { color: var(--text-muted); flex: none; }
.field .v { color: var(--text-primary); text-align: right; }
.stack-align-start { text-align: left !important; }

.split-layout { display: grid; grid-template-columns: minmax(320px, 420px) minmax(0, 1fr); gap: 20px; align-items: start; }
.detail-stack { min-width: 0; display: flex; flex-direction: column; gap: 18px; }
.hero-card { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; padding: 22px 24px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); }
.hero-card-main { display: flex; gap: 16px; align-items: center; min-width: 0; }
.hero-card-main h2 { font-family: var(--font-serif); font-size: 24px; margin-bottom: 4px; }
.hero-card-main .tag-row { margin-top: 10px; }
.tab-strip { display: flex; gap: 8px; flex-wrap: wrap; }
.tab-strip button { height: 34px; padding: 0 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-card); color: var(--text-secondary); transition: background .16s ease, color .16s ease, border-color .16s ease; }
.tab-strip button:hover { background: var(--bg-hover); color: var(--text-primary); }
.tab-strip button.active { background: var(--primary-light); color: var(--primary); border-color: var(--primary-light); }
.detail-section + .detail-section { margin-top: 18px; }
.detail-section h4 { margin: 0 0 10px; font-size: 13px; color: var(--text-secondary); }
.stack-list { display: flex; flex-direction: column; gap: 10px; }
.quote-line { padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg-panel); border: 1px solid var(--border); font-size: 13px; line-height: 1.7; }
.muted-line { color: var(--text-secondary); }
.mini-card { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--bg-panel); border: 1px solid var(--border); }
.mini-card-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.mini-card-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.signal-list { display: flex; flex-direction: column; gap: 12px; }
.signal-item { display: flex; gap: 10px; align-items: flex-start; color: var(--text-secondary); }
.signal-item svg { color: var(--primary); flex: none; margin-top: 2px; }

.editor-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); padding: 22px 24px; margin-bottom: 20px; }
.editor-card-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; margin-bottom: 18px; }
.editor-card-head h2 { font-family: var(--font-serif); font-size: 22px; }
.form-grid { display: grid; gap: 14px; margin-bottom: 14px; }
.form-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.form-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.form-block { display: flex; flex-direction: column; gap: 8px; min-width: 0; font-size: 13px; color: var(--text-secondary); }
.textarea { min-height: 124px; padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); font-size: 13px; line-height: 1.65; resize: vertical; outline: none; transition: border-color .16s ease, box-shadow .16s ease; }
.textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); }
.project-inline-field { display: inline-flex; align-items: center; gap: 8px; }
.project-inline-field .input { width: 164px; }
.switch-row { display: inline-flex; align-items: center; gap: 10px; color: var(--text-secondary); font-size: 13px; }
.switch-row input { accent-color: var(--primary); }
.model-actions-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.model-editor-section { display: grid; gap: 14px; }
.model-editor-section-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.model-key-row { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; }
.model-key-input { flex: 1 1 320px; min-width: 220px; }
.model-feedback { margin-top: 16px; display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); font-size: 13px; font-weight: 500; }
.model-feedback-info { background: var(--bg-panel); color: var(--text-secondary); }
.model-feedback-success { background: color-mix(in srgb, var(--agent-done) 14%, var(--bg-card)); border-color: color-mix(in srgb, var(--agent-done) 42%, var(--border)); color: var(--agent-done); }
.model-feedback-error { background: color-mix(in srgb, var(--danger) 12%, var(--bg-card)); border-color: color-mix(in srgb, var(--danger) 42%, var(--border)); color: var(--danger); }
.model-list-row { cursor: pointer; }
.model-row-actions { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; opacity: .62; transition: opacity .16s ease; }
.model-list-row:hover .model-row-actions, .model-list-row:focus-within .model-row-actions { opacity: 1; }
.agent-list-card { overflow-x: auto; }
.agent-row-actions { width: 78px; justify-content: flex-end; flex: none; }
.agent-model-cell { color: var(--text-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-editor-section { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
.agent-switch-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 14px; }
.agent-switch-row { min-height: 34px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel); }
.agent-tag-block { min-width: 0; }
.agent-tag-input { min-height: 38px; padding: 5px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); transition: border-color .16s ease, box-shadow .16s ease; }
.agent-tag-input:focus-within { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); }
.agent-tag-list { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.agent-tag-list input { flex: 1 1 120px; min-width: 90px; height: 26px; border: 0; outline: none; background: transparent; color: var(--text-primary); font-size: 13px; }
.agent-tag-list input::placeholder { color: var(--text-muted); }
.agent-tag { gap: 5px; max-width: 100%; }
.agent-tag button { display: inline-grid; place-items: center; width: 16px; height: 16px; border: 0; padding: 0; border-radius: 50%; background: transparent; color: currentColor; cursor: pointer; }
.agent-tag button:hover { background: var(--bg-hover); }
.agent-empty-editor { min-height: 180px; }
.agent-modal-backdrop { align-items: center; }
.agent-modal { width: min(880px, 100%); max-height: min(86vh, 920px); display: flex; flex-direction: column; padding: 0; overflow: hidden; }
.agent-modal-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; padding: 24px 28px 18px; border-bottom: 1px solid var(--border); }
.agent-modal-head h2 { font-size: 24px; }
.agent-modal-head p { margin: 8px 0 0; font-size: 13px; }
.agent-modal-body { overflow: auto; padding: 20px 28px 24px; }
.agent-modal-actions { flex: none; padding: 16px 28px 22px; border-top: 1px solid var(--border); }
.agent-description { min-height: 108px; }
.agent-field-hint { display: block; font-size: 12px; line-height: 1.45; color: var(--text-muted); font-weight: 400; }
.agent-switch-label { display: block; color: var(--text-primary); font-weight: 500; }
.agent-section-note { margin: -4px 0 2px; font-size: 12px; color: var(--text-muted); line-height: 1.6; }
.agent-advanced { margin-top: 18px; border-top: 1px solid var(--border); padding-top: 12px; }
.agent-advanced-panel { max-height: none; }
.agent-scope-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.agent-scope-option { display: flex; align-items: flex-start; gap: 10px; min-height: 58px; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel); font-size: 13px; }
.agent-scope-option input { margin-top: 2px; accent-color: var(--primary); }
.model-advanced { margin-top: 16px; border-top: 1px solid var(--border); padding-top: 12px; }
.model-advanced-toggle { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: var(--text-secondary); font-size: 13px; cursor: pointer; padding: 4px 0; }
.model-advanced-toggle:hover { color: var(--text-primary); }
.model-advanced-panel { margin-top: 12px; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel); }
.skill-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.stats-inline { display: flex; flex-direction: column; gap: 12px; min-width: 220px; }
.stats-inline-item { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--bg-panel); border: 1px solid var(--border); }
.stats-inline-k { font-size: 12px; color: var(--text-muted); }
.stats-inline-v { font-size: 13px; color: var(--text-primary); margin-top: 4px; }
.permission-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.permission-chip { display: inline-flex; align-items: center; min-height: 28px; padding: 0 10px; border-radius: var(--radius-sm); font-size: 12px; border: 1px solid var(--border); background: var(--bg-panel); color: var(--text-secondary); }
.permission-chip.safe { background: var(--primary-light); border-color: var(--primary-light); color: var(--primary); }
.permission-chip.elevated { background: rgba(184,134,11,.12); border-color: rgba(184,134,11,.24); color: var(--warning); }
.permission-chip.high { background: rgba(169,68,66,.10); border-color: rgba(169,68,66,.24); color: var(--danger); }
.result-card { padding: 14px 16px; border-radius: var(--radius-sm); background: var(--bg-panel); border: 1px solid var(--border); margin-top: 16px; }
.code-surface { font-family: var(--font-mono); font-size: 12px; }
.editor-card.compact { padding: 18px 20px; margin-bottom: 0; }
.inspector-pane { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.inspector-feedback { margin-top: 16px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-secondary); font-size: 12px; }

/* 标签 */
.tag { display: inline-flex; align-items: center; height: 23px; padding: 0 10px; border-radius: var(--radius-sm); font-size: 12px; background: var(--bg-hover); color: var(--text-secondary); }
.tag.primary { background: var(--primary-light); color: var(--primary); }
.tag-row { display: flex; flex-wrap: wrap; gap: 7px; }

/* 卡片网格（项目库） */
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; }
.project-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); overflow: hidden; cursor: pointer; transition: box-shadow .16s ease, transform .16s ease; }
.project-card:hover { box-shadow: var(--shadow-popover); transform: translateY(-2px); }
.project-cover { height: 120px; background: linear-gradient(135deg, var(--primary-light), var(--bg-active)); display: grid; place-items: center; color: var(--primary); font-family: var(--font-serif); font-size: 28px; }
.project-meta { padding: 14px 16px; }
.project-meta .pm-title { font-weight: 600; font-size: 14px; }
.project-meta .pm-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

/* 设置布局 */
.settings-layout { display: grid; grid-template-columns: 200px 1fr; gap: 28px; }
.settings-menu { display: flex; flex-direction: column; gap: 3px; position: sticky; top: 0; }
.settings-menu button { text-align: left; height: 40px; padding: 0 14px; border: 0; background: transparent; color: var(--text-secondary); border-radius: var(--radius-sm); font-size: 13px; transition: background .14s ease, color .14s ease; }
.settings-menu button:hover { background: var(--bg-hover); color: var(--text-primary); }
.settings-menu button.on { background: var(--bg-active); color: var(--primary); font-weight: 600; }
.form-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--border); }
.form-row:last-child { border-bottom: 0; }
.form-row .fr-label { font-size: 13px; }
.form-row .fr-desc { font-size: 12px; color: var(--text-muted); margin-top: 3px; }

/* 关系图占位 */
.graph-canvas { height: calc(100% - 8px); min-height: 440px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: radial-gradient(circle at 50% 40%, var(--bg-panel), var(--bg-app)); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-muted); }
.graph-panel { min-height: 0; }
.graph-panel-head { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.graph-stage { min-height: 460px; border-radius: var(--radius-md); overflow: hidden; background: radial-gradient(circle at 50% 40%, rgba(45,106,79,.08), transparent 42%), radial-gradient(circle at 50% 50%, var(--bg-panel), var(--bg-app)); border: 1px solid var(--border); }
.graph-svg { width: 100%; height: 460px; display: block; }
.graph-edge { stroke: var(--border-strong); stroke-width: 2; opacity: .82; transition: opacity .16s ease, stroke .16s ease, stroke-width .16s ease; }
.graph-edge.active { stroke: var(--primary); stroke-width: 3; opacity: 1; }
.graph-edge.dimmed { opacity: .18; }
.graph-edge-label { fill: var(--text-muted); font-size: 11px; text-anchor: middle; pointer-events: none; }
.graph-edge-label.dimmed { opacity: .24; }
.graph-node { cursor: pointer; transition: opacity .16s ease, transform .16s ease; }
.graph-node.muted { opacity: .35; }
.graph-node-dot { fill: var(--bg-card); stroke: var(--border-strong); stroke-width: 2; transition: fill .16s ease, stroke .16s ease, stroke-width .16s ease; }
.graph-node.active .graph-node-dot { stroke: var(--primary); stroke-width: 3; }
.graph-node-dot.type-character { fill: var(--primary-light); }
.graph-node-dot.type-worldbook { fill: rgba(91,123,154,.12); }
.graph-node-dot.type-timeline { fill: rgba(184,134,11,.14); }
.graph-node-dot.type-knowledge { fill: rgba(74,124,89,.14); }
.graph-node-dot.type-reference { fill: rgba(156,154,144,.14); }
.graph-node-initial { fill: var(--text-primary); font-size: 13px; font-weight: 700; pointer-events: none; }
.graph-node-label { fill: var(--text-secondary); font-size: 12px; pointer-events: none; }

/* 加载 / 空态 */
.empty-icon { color: var(--text-muted); opacity: .8; }
.center-state { flex: 1; min-height: 320px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--text-muted); text-align: center; }
.spinner { width: 26px; height: 26px; border: 2.5px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@keyframes breathe { 0%,100% { opacity: 1; } 50% { opacity: .4; } }

@media (max-width: 1600px) {
  .workspace { grid-template-columns: 264px minmax(0,1fr) clamp(320px, 26vw, 380px); }
  .editor-workbench { grid-template-columns: minmax(0,1fr); max-width: 860px; }
}

@media (max-width: 1280px) {
  .workspace { grid-template-columns: 264px minmax(0,1fr); }
  .editor-workbench { grid-template-columns: minmax(0,1fr); max-width: 860px; }
  .chat-pane { display: none; }
}
@media (max-width: 1024px) {
  .app-shell { grid-template-columns: 1fr; }
  .rail { display: none; }
  .mobile-shell-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
  }
  .mobile-shell-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .mobile-shell-logo { width: 36px; height: 36px; border-radius: 10px; box-shadow: var(--shadow-card); flex: none; }
  .mobile-shell-title { font-family: var(--font-serif); font-size: 18px; line-height: 1.2; }
  .mobile-shell-sub { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
  .mobile-nav {
    display: flex;
    gap: 8px;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
    overflow-x: auto;
    background: rgba(251,250,247,0.94);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--border);
    z-index: 40;
  }
  .mobile-nav-item {
    min-width: 68px;
    height: 56px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--bg-card);
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex: none;
    font-size: 11px;
    transition: background .16s ease, color .16s ease, border-color .16s ease;
  }
  .mobile-nav-item.active {
    background: var(--primary-light);
    color: var(--primary);
    border-color: var(--primary-light);
  }
  .main { padding-bottom: 88px; }
  .workspace { grid-template-columns: 1fr; }
  .workspace {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .workspace-mobile-header {
    display: block;
    padding: 14px 16px 12px;
    background: var(--bg-app);
    border-bottom: 1px solid var(--border);
  }
  .workspace > .tree-panel,
  .workspace > .editor-pane,
  .workspace > .chat-pane {
    display: none;
    flex: 1;
    min-height: 0;
  }
  .workspace.mobile-panel-chapters > .tree-panel,
  .workspace.mobile-panel-editor > .editor-pane,
  .workspace.mobile-panel-inspector > .editor-pane,
  .workspace.mobile-panel-chat > .chat-pane {
    display: flex;
  }
  .workspace.mobile-panel-chapters > .tree-panel { border-right: 0; }
  .workspace.mobile-panel-chat > .chat-pane { border-left: 0; }
  .workspace.mobile-panel-editor .editor-workbench,
  .workspace.mobile-panel-inspector .editor-workbench {
    grid-template-columns: 1fr;
    max-width: 100%;
  }
  .workspace.mobile-panel-editor .inspector-pane { display: none; }
  .workspace.mobile-panel-inspector .paper { display: none; }
  .workspace.mobile-panel-inspector .editor-statusbar { display: none; }
  .workspace.mobile-panel-editor .editor-scroll,
  .workspace.mobile-panel-inspector .editor-scroll {
    justify-content: stretch;
    padding: 16px 14px 32px;
  }
  .workspace.mobile-panel-editor .paper-body {
    padding: 24px 20px 40px;
  }
  .workspace.mobile-panel-editor .paper-toolbar,
  .workspace.mobile-panel-inspector .paper-toolbar {
    height: auto;
    padding: 10px 12px;
    flex-wrap: wrap;
    row-gap: 8px;
  }
  .workspace.mobile-panel-editor .paper-toolbar .grow,
  .workspace.mobile-panel-inspector .paper-toolbar .grow {
    display: none;
  }
  .view-head {
    padding: 18px 16px 14px;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .view-actions { width: 100%; flex-wrap: wrap; }
  .view-body { padding: 4px 16px 24px; }
  .toolbar-row { flex-wrap: wrap; }
  .search { min-width: 0; flex: 1 1 100%; }
  .settings-layout { grid-template-columns: 1fr; gap: 16px; }
  .settings-menu {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .settings-menu button { white-space: nowrap; flex: none; }
  .card-grid { grid-template-columns: 1fr; }
  .split-layout > .list-card { overflow-x: auto; }
  .split-layout > .list-card .list-row { min-width: 640px; }
  .graph-stage { min-height: 360px; }
  .graph-svg { height: 360px; }
  .split-layout, .detail-grid, .form-grid-2, .form-grid-3 { grid-template-columns: 1fr; }
  .hero-card, .editor-card-head { flex-direction: column; }
  .project-inline-field { width: 100%; }
  .project-inline-field .input { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`;
