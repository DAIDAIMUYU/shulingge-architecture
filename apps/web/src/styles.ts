// 书灵阁设计系统：全局 CSS（设计令牌 + 组件规范 + 暗色模式）。
// 视觉方向：中式文房 / 纸墨书卷气 + 现代生产力工具的克制感。留白充足、低噪音、呼吸感。
// 所有颜色/圆角/间距/阴影一律引用 CSS 变量，禁止散落硬编码。

export const globalCss = `
:root {
  --bg-app: #F8F3EA;
  --bg-panel: #FCFAF4;
  --bg-card: #FFFDF7;
  --bg-hover: #F0E7D8;
  --bg-active: #DFEBE1;

  --primary: #244F3D;
  --primary-hover: #183C2E;
  --primary-light: #DDEAE0;
  --primary-soft: #EFF6EF;
  --primary-deep: #102F24;
  --primary-ink: #14241C;
  --accent-cinnabar: #A9362B;
  --accent-cinnabar-hover: #8F2D24;
  --accent-cinnabar-light: #F3DED8;

  --text-primary: #26241F;
  --text-secondary: #5E5A50;
  --text-muted: #938D80;
  --text-on-primary: #FFFFFF;

  --border: #E4D9C4;
  --border-strong: #C8B99E;

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
  --surface-sheen: linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.08));
  --theme-background: linear-gradient(180deg, rgba(255,253,247,0.20), rgba(248,243,234,0.30)), linear-gradient(90deg, rgba(255,253,247,0.12), rgba(255,253,247,0.06) 50%, rgba(255,253,247,0.14)), url("/backgrounds/paper-light.png");
  --theme-background-filter: saturate(1.02) brightness(1.02);
  --surface-rail-glass: rgba(252,250,244,0.76);
  --surface-panel-glass: rgba(252,250,244,0.80);
  --surface-card-glass: rgba(255,253,247,0.82);
  --surface-control-glass: rgba(255,253,247,0.78);
  --surface-toolbar-glass: rgba(252,250,244,0.82);
  --surface-paper-glass: rgba(255,253,247,0.90);
  --surface-blur: blur(12px) saturate(1.08);
  --surface-control-blur: blur(10px) saturate(1.04);
  --surface-inset-highlight: rgba(255,255,255,0.65);
  --theme-transition-duration: .34s;
  --workspace-safe-top: clamp(14px, 1.3vh, 22px);
  --motion-fast: .18s;
  --motion-normal: .26s;
  --motion-slow: .34s;
  --motion-ease: cubic-bezier(.2,.8,.2,1);
  --motion-pop: cubic-bezier(.18,.9,.22,1);
  --focus-ring: 0 0 0 2px color-mix(in srgb, var(--primary) 17%, transparent), 0 0 0 4px color-mix(in srgb, var(--accent-cinnabar) 8%, transparent);
  --mountain-ink: rgba(36,79,61,0.115);
  --mountain-wash: rgba(169,54,43,0.055);
  --shadow-card: 0 1px 2px rgba(55,43,28,0.045), 0 14px 30px rgba(55,43,28,0.060);
  --shadow-popover: 0 18px 42px rgba(55,43,28,0.17), 0 1px 0 rgba(255,255,255,0.68) inset;
  --shadow-paper: 0 1px 2px rgba(55,43,28,0.045), 0 24px 70px rgba(55,43,28,0.10), 0 0 0 1px rgba(255,255,255,0.60) inset;
}

:root[data-theme="dark"] {
  --bg-app: #101610;
  --bg-panel: #172018;
  --bg-card: #20291F;
  --bg-hover: #293428;
  --bg-active: #263A2D;
  --primary: #7EB18D;
  --primary-hover: #94C7A1;
  --primary-light: #263A2D;
  --primary-soft: #1B2A20;
  --primary-deep: #B2D8BA;
  --primary-ink: #E6E7DC;
  --accent-cinnabar: #C96456;
  --accent-cinnabar-hover: #DF7A6D;
  --accent-cinnabar-light: #35241F;
  --text-primary: #EEE9DD;
  --text-secondary: #BBB5A6;
  --text-muted: #857F72;
  --text-on-primary: #0D140E;
  --border: #303A2F;
  --border-strong: #4A5748;
  --success: #6DB590;
  --warning: #D2A53C;
  --danger: #CC7766;
  --agent-idle: #4A5043;
  --agent-running: #5BA37E;
  --agent-done: #6DB590;
  --agent-error: #CC7766;
  --surface-sheen: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0));
  --theme-background: linear-gradient(180deg, rgba(8,13,10,0.34), rgba(8,13,10,0.54)), linear-gradient(90deg, rgba(10,18,13,0.18), rgba(10,18,13,0.08) 50%, rgba(10,18,13,0.22)), url("/backgrounds/paper-dark.png");
  --theme-background-filter: saturate(0.96) brightness(0.82);
  --surface-rail-glass: rgba(15,23,17,0.78);
  --surface-panel-glass: rgba(18,27,20,0.80);
  --surface-card-glass: rgba(24,32,25,0.82);
  --surface-control-glass: rgba(26,35,27,0.78);
  --surface-toolbar-glass: rgba(18,27,20,0.84);
  --surface-paper-glass: rgba(28,36,29,0.90);
  --surface-blur: blur(12px) saturate(1.04);
  --surface-control-blur: blur(10px) saturate(1.02);
  --surface-inset-highlight: rgba(255,255,255,0.055);
  --theme-transition-duration: .34s;
  --workspace-safe-top: clamp(14px, 1.3vh, 22px);
  --motion-fast: .18s;
  --motion-normal: .26s;
  --motion-slow: .34s;
  --motion-ease: cubic-bezier(.2,.8,.2,1);
  --motion-pop: cubic-bezier(.18,.9,.22,1);
  --focus-ring: 0 0 0 2px color-mix(in srgb, var(--primary) 24%, transparent), 0 0 0 4px color-mix(in srgb, var(--accent-cinnabar) 11%, transparent);
  --mountain-ink: rgba(126,177,141,0.105);
  --mountain-wash: rgba(201,100,86,0.060);
  --shadow-card: 0 1px 2px rgba(0,0,0,0.34), 0 14px 34px rgba(0,0,0,0.28);
  --shadow-popover: 0 22px 48px rgba(0,0,0,0.52), 0 1px 0 rgba(255,255,255,0.05) inset;
  --shadow-paper: 0 1px 2px rgba(0,0,0,0.34), 0 26px 76px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.04) inset;
}

:root[data-theme="eye"] {
  --bg-app: #ECE3D1;
  --bg-panel: #F1E8D6;
  --bg-card: #F7EFDE;
  --bg-hover: #E3D7C0;
  --bg-active: #D7E1CF;
  --primary: #3E6852;
  --primary-hover: #2F5643;
  --primary-light: #D5E2D2;
  --primary-soft: #E7EFE3;
  --primary-deep: #203E31;
  --primary-ink: #26382E;
  --accent-cinnabar: #9D4A35;
  --accent-cinnabar-hover: #823B2B;
  --accent-cinnabar-light: #EAD2C7;
  --text-primary: #312D24;
  --text-secondary: #625C4D;
  --text-muted: #928776;
  --text-on-primary: #FFFDF7;
  --border: #D8C9AD;
  --border-strong: #BCA986;
  --success: #587B52;
  --warning: #A57D22;
  --danger: #9A4B42;
  --info: #607C7D;
  --agent-idle: #BDB59F;
  --agent-running: #4E765F;
  --agent-done: #587B52;
  --agent-error: #9A4B42;
  --surface-sheen: linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0.04));
  --theme-background: linear-gradient(180deg, rgba(239,231,211,0.22), rgba(225,216,194,0.34)), linear-gradient(90deg, rgba(242,235,218,0.14), rgba(242,235,218,0.05) 50%, rgba(232,224,204,0.16)), url("/backgrounds/paper-eye.png");
  --theme-background-filter: saturate(0.96) brightness(0.96);
  --surface-rail-glass: rgba(238,228,207,0.76);
  --surface-panel-glass: rgba(241,232,214,0.80);
  --surface-card-glass: rgba(248,240,224,0.82);
  --surface-control-glass: rgba(248,240,224,0.78);
  --surface-toolbar-glass: rgba(241,232,214,0.82);
  --surface-paper-glass: rgba(249,242,229,0.90);
  --surface-blur: blur(12px) saturate(1.04);
  --surface-control-blur: blur(10px) saturate(1.02);
  --surface-inset-highlight: rgba(255,255,255,0.48);
  --theme-transition-duration: .34s;
  --workspace-safe-top: clamp(14px, 1.3vh, 22px);
  --motion-fast: .18s;
  --motion-normal: .26s;
  --motion-slow: .34s;
  --motion-ease: cubic-bezier(.2,.8,.2,1);
  --motion-pop: cubic-bezier(.18,.9,.22,1);
  --focus-ring: 0 0 0 2px color-mix(in srgb, var(--primary) 18%, transparent), 0 0 0 4px color-mix(in srgb, var(--accent-cinnabar) 9%, transparent);
  --mountain-ink: rgba(62,104,82,0.12);
  --mountain-wash: rgba(157,74,53,0.05);
  --shadow-card: 0 1px 2px rgba(58,47,29,0.05), 0 14px 30px rgba(58,47,29,0.07);
  --shadow-popover: 0 18px 42px rgba(58,47,29,0.18), 0 1px 0 rgba(255,255,255,0.54) inset;
  --shadow-paper: 0 1px 2px rgba(58,47,29,0.05), 0 24px 70px rgba(58,47,29,0.12), 0 0 0 1px rgba(255,255,255,0.50) inset;
}

* { box-sizing: border-box; }
html, body, #root { width: 100%; height: 100%; margin: 0; overflow: hidden; }
#root { position: fixed; inset: 0; z-index: 1; overflow: hidden; }
body {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-app);
  background-image: none;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  transition: background-color .32s ease, color .32s ease;
}
body::before,
body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity .24s ease;
}
body::before {
  background-repeat: no-repeat;
  background-position: center center;
  background-size: cover;
}
body::after {
  background-repeat: no-repeat;
  background-position: center center;
  background-size: cover;
  background-image: var(--previous-theme-background);
  filter: var(--previous-theme-background-filter);
}
body::before {
  opacity: 1;
  background-image: var(--theme-background);
  background-blend-mode: normal, normal, normal;
  filter: var(--theme-background-filter);
}
:root[data-theme-prev="light"] {
  --previous-theme-background: linear-gradient(180deg, rgba(255,253,247,0.20), rgba(248,243,234,0.30)), linear-gradient(90deg, rgba(255,253,247,0.12), rgba(255,253,247,0.06) 50%, rgba(255,253,247,0.14)), url("/backgrounds/paper-light.png");
  --previous-theme-background-filter: saturate(1.02) brightness(1.02);
}
:root[data-theme-prev="eye"] {
  --previous-theme-background: linear-gradient(180deg, rgba(239,231,211,0.22), rgba(225,216,194,0.34)), linear-gradient(90deg, rgba(242,235,218,0.14), rgba(242,235,218,0.05) 50%, rgba(232,224,204,0.16)), url("/backgrounds/paper-eye.png");
  --previous-theme-background-filter: saturate(0.96) brightness(0.96);
}
:root[data-theme-prev="dark"] {
  --previous-theme-background: linear-gradient(180deg, rgba(8,13,10,0.34), rgba(8,13,10,0.54)), linear-gradient(90deg, rgba(10,18,13,0.18), rgba(10,18,13,0.08) 50%, rgba(10,18,13,0.22)), url("/backgrounds/paper-dark.png");
  --previous-theme-background-filter: saturate(0.96) brightness(0.82);
}
:root.theme-switching body::after {
  opacity: 1;
  animation: themeBackdropFade var(--theme-transition-duration) ease forwards;
}
h1,h2,h3,h4 { margin: 0; font-weight: 600; text-wrap: balance; }
ul { margin: 0; padding: 0; list-style: none; }
button { font-family: inherit; cursor: pointer; color: inherit; }
input, textarea { font-family: inherit; }
input[type="checkbox"],
input[type="radio"] { width: 15px; height: 15px; margin: 0; accent-color: var(--primary); color-scheme: light; }
:root[data-theme="dark"] input[type="checkbox"],
:root[data-theme="dark"] input[type="radio"] { color-scheme: dark; }

* { scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 999px; }
*::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
*::-webkit-scrollbar-track { background: transparent; }

.main > .view {
  animation: pageEnter .2s ease-out both;
}
.main > .workspace {
  animation: pageFadeIn .2s ease-out both;
}
.card-grid,
.character-card-grid,
.timeline-stream,
.worldbook-group-stack {
  animation: surfaceFadeIn .2s ease-out both;
}

/* ===== 组件 ===== */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; border: 1px solid var(--border-strong); background: var(--bg-card); background-image: var(--surface-sheen); color: var(--text-primary); box-shadow: 0 1px 0 var(--surface-inset-highlight) inset; transition: background .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
.btn:hover { background-color: var(--bg-hover); border-color: color-mix(in srgb, var(--primary) 24%, var(--border-strong)); transform: translateY(-1px); }
.btn:active { transform: translateY(0); box-shadow: inset 0 1px 2px rgba(55,43,28,0.10); }
.btn:focus-visible, .btn-icon:focus-visible, .tab-strip button:focus-visible, .segmented button:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.btn-primary { background-color: var(--primary); background-image: linear-gradient(180deg, color-mix(in srgb, var(--primary) 88%, var(--surface-inset-highlight)), var(--primary-hover)); border-color: var(--primary-hover); color: var(--text-on-primary); box-shadow: 0 1px 0 color-mix(in srgb, var(--surface-inset-highlight) 68%, transparent) inset, 0 8px 18px color-mix(in srgb, var(--primary) 22%, transparent); }
.btn-primary:hover { background-color: var(--primary-hover); background-image: linear-gradient(180deg, var(--primary-hover), color-mix(in srgb, var(--primary-hover) 84%, var(--primary-ink))); border-color: var(--primary-deep); color: var(--text-on-primary); }
.btn-primary:active { background-color: var(--primary-hover); color: var(--text-on-primary); }
.btn-danger { background: var(--danger); border-color: var(--danger); color: #fff; }
.btn-danger:hover { background: var(--danger); border-color: var(--danger); filter: brightness(.95); }
.btn-ghost { background: transparent; border-color: transparent; color: var(--text-secondary); }
.btn-ghost:hover { background: var(--bg-hover); color: var(--text-primary); }
.btn-icon { width: 32px; height: 32px; padding: 0; border: 0; background: transparent; color: var(--text-secondary); border-radius: var(--radius-sm); display: grid; place-items: center; transition: background .18s ease, color .18s ease, transform .18s ease; }
.btn-icon:hover { background: var(--bg-hover); color: var(--text-primary); }
.btn-icon:active { transform: translateY(1px); }
.btn-icon.active { background: linear-gradient(180deg, var(--primary-soft), var(--primary-light)); color: var(--primary); box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--accent-cinnabar) 26%, transparent); }
.btn-icon.danger:hover { background: rgba(169,68,66,.10); color: var(--danger); }
.btn-icon[title],
.btn-icon[aria-label],
.tree-search-clear[title],
.chat-send[title] { position: relative; }
.btn-icon[title]::after,
.btn-icon[aria-label]::after,
.tree-search-clear[title]::after,
.chat-send[title]::after {
  content: attr(title);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  z-index: 200;
  max-width: 180px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background-color: var(--surface-card-glass);
  backdrop-filter: var(--surface-control-blur);
  box-shadow: var(--shadow-popover);
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, 4px);
  transition: opacity var(--motion-fast) ease, transform var(--motion-fast) ease;
}
.btn-icon[aria-label]:not([title])::after { content: attr(aria-label); }
.btn-icon[title]:hover::after,
.btn-icon[aria-label]:hover::after,
.btn-icon[title]:focus-visible::after,
.btn-icon[aria-label]:focus-visible::after,
.tree-search-clear[title]:hover::after,
.tree-search-clear[title]:focus-visible::after,
.chat-send[title]:hover::after,
.chat-send[title]:focus-visible::after { opacity: 1; transform: translate(-50%, 0); }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.input { height: 34px; padding: 0 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-card); background-image: var(--surface-sheen); color: var(--text-primary); font-size: 13px; transition: border-color .18s ease, box-shadow .18s ease, background .18s ease; outline: none; }
.input:focus { border-color: var(--primary); box-shadow: var(--focus-ring); background-color: var(--bg-card); }
.badge { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 500; background: var(--primary-light); color: var(--primary); border: 1px solid color-mix(in srgb, var(--primary) 14%, transparent); }
.segmented { display: inline-flex; padding: 3px; background: var(--bg-hover); border: 1px solid color-mix(in srgb, var(--border-strong) 58%, transparent); border-radius: var(--radius-sm); gap: 2px; }
.segmented button { height: 26px; padding: 0 14px; border: 0; background: transparent; color: var(--text-secondary); font-size: 12px; border-radius: 5px; transition: background .16s ease, color .16s ease; }
.segmented button.on { background: var(--bg-card); color: var(--primary); box-shadow: var(--shadow-card); }
.custom-select { position: relative; width: 100%; min-width: 0; }
.custom-select-trigger { width: 100%; min-height: 34px; display: inline-flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 10px 0 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background-color: var(--surface-control-glass); background-image: none; backdrop-filter: var(--surface-control-blur); color: var(--text-primary); font-size: 13px; line-height: 1.35; text-align: left; box-shadow: 0 1px 0 var(--surface-inset-highlight) inset; transition: border-color .18s ease, background-color .18s ease, color .18s ease, box-shadow .18s ease, transform .18s ease; }
.custom-select-trigger span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.custom-select-trigger svg { flex: none; color: var(--text-muted); transition: color .16s ease, transform .16s ease; }
.custom-select-trigger:hover { border-color: var(--border-strong); background-color: var(--bg-hover); transform: translateY(-1px); }
.custom-select-trigger:focus-visible { outline: none; border-color: var(--primary); box-shadow: var(--focus-ring); }
.custom-select-trigger[aria-expanded="true"] svg { color: var(--primary); transform: rotate(180deg); }
.custom-select-trigger.placeholder { color: var(--text-muted); }
.custom-select-trigger:disabled { opacity: .55; cursor: not-allowed; transform: none; }
.custom-select-menu { position: absolute; top: calc(100% + 8px); left: 0; z-index: 80; width: max(100%, 220px); max-height: 280px; overflow: auto; padding: 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); background-color: var(--surface-card-glass); background-image: none; backdrop-filter: var(--surface-blur); box-shadow: var(--shadow-popover); animation: popoverIn var(--motion-normal) var(--motion-pop) both; transform-origin: top left; }
.custom-select-group { padding: 7px 10px 5px; color: var(--text-muted); font-size: 11px; letter-spacing: .04em; }
.custom-select-option { width: 100%; min-height: 34px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-secondary); text-align: left; cursor: pointer; transition: background .16s ease, color .16s ease, box-shadow .16s ease; }
.custom-select-option span { min-width: 0; display: grid; gap: 2px; }
.custom-select-option strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; color: inherit; }
.custom-select-option small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); font-size: 11px; line-height: 1.35; }
.custom-select-option svg { flex: none; color: var(--accent-cinnabar); }
.custom-select-option:hover,
.custom-select-option.active { background: var(--bg-hover); color: var(--text-primary); }
.custom-select-option.selected { background: linear-gradient(90deg, var(--primary-light), color-mix(in srgb, var(--bg-card) 72%, transparent)); color: var(--primary); box-shadow: inset 3px 0 0 var(--accent-cinnabar); }
.custom-select-option:disabled { opacity: .52; cursor: not-allowed; }
.muted { color: var(--text-secondary); }
.faint { color: var(--text-muted); }

/* ===== App Shell：四列 64 / 264 / 1fr / 384 ===== */
.app-shell { display: grid; grid-template-columns: 64px minmax(0,1fr); width: 100%; height: 100%; max-height: 100dvh; overflow: hidden; position: relative; }
.app-shell.app-mobile-layout { grid-template-columns: 1fr; grid-template-rows: minmax(0,1fr); }
.app-shell.app-focus-mode { grid-template-columns: 1fr; }
.app-shell.app-focus-mode .rail,
.app-shell.app-focus-mode .mobile-shell-header,
.app-shell.app-focus-mode .mobile-nav { display: none; }
.app-shell.app-focus-mode .main { padding-bottom: 0; }
.workspace { display: grid; grid-template-columns: clamp(240px, 15vw, 264px) minmax(0,1fr) clamp(340px, 22vw, 384px); width: 100%; height: 100%; min-height: 0; overflow: hidden; isolation: isolate; }
.workspace > .tree-panel,
.workspace > .editor-pane,
.workspace > .chat-pane { align-self: start; width: 100%; min-width: 0; max-width: 100%; height: calc(100% - var(--workspace-safe-top)); min-height: 0; margin-top: var(--workspace-safe-top); position: relative; }
.workspace.focus-mode { grid-template-columns: minmax(0,1fr); }
.workspace.focus-mode .tree-panel,
.workspace.focus-mode .chat-pane,
.workspace.focus-mode .workspace-mobile-header { display: none !important; }
.workspace.focus-mode .editor-scroll { padding: clamp(24px, 4vw, 56px) clamp(20px, 8vw, 120px) clamp(44px, 7vw, 90px); align-items: flex-start; }
.workspace.focus-mode .paper { max-width: min(880px, 100%); min-height: calc(100vh - 130px); box-shadow: 0 30px 90px color-mix(in srgb, var(--primary-ink) 18%, transparent), var(--shadow-paper); }
.workspace.focus-mode .paper-toolbar { opacity: .34; transition: opacity var(--motion-normal) ease, background-color .32s ease, border-color .32s ease; }
.workspace.focus-mode .paper:hover .paper-toolbar,
.workspace.focus-mode .paper:focus-within .paper-toolbar { opacity: 1; }
.workspace.focus-mode .paper-body { padding-top: clamp(58px, 7vw, 92px); padding-bottom: clamp(76px, 9vw, 112px); }
.focus-exit-button { position: fixed; top: clamp(16px, 2vw, 28px); right: clamp(16px, 2vw, 28px); z-index: 45; height: 34px; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background-color: var(--surface-card-glass); backdrop-filter: var(--surface-control-blur); color: var(--text-secondary); box-shadow: var(--shadow-card); transition: background-color var(--motion-fast) ease, color var(--motion-fast) ease, border-color var(--motion-fast) ease, transform var(--motion-fast) ease; animation: popoverIn var(--motion-normal) var(--motion-pop) both; }
.focus-exit-button:hover { background-color: var(--bg-hover); color: var(--text-primary); border-color: var(--border-strong); transform: translateY(-1px); }
.main { min-width: 0; height: 100%; overflow: hidden; display: flex; flex-direction: column; position: relative; }
.main > .view,
.main > .workspace { flex: 1; min-height: 0; }
.main > .workspace { position: relative; inset: auto; animation: none; transform: none; }
.mobile-shell-header,
.mobile-nav,
.workspace-mobile-header { display: none; }
.app-desktop-layout .mobile-shell-header,
.app-desktop-layout .mobile-nav,
.app-desktop-layout .workspace-mobile-header { display: none !important; }
.app-shell.app-desktop-layout { grid-template-columns: 64px minmax(0,1fr); grid-template-rows: minmax(0,1fr); }
.app-desktop-layout .rail { display: flex !important; }
.app-desktop-layout .workspace {
  display: grid !important;
  grid-template-columns: clamp(196px, 23vw, 228px) minmax(0,1fr) !important;
  height: 100% !important;
}
.app-desktop-layout .workspace > .tree-panel,
.app-desktop-layout .workspace > .editor-pane {
  display: flex !important;
  align-self: start;
  height: calc(100% - var(--workspace-safe-top)) !important;
  margin-top: var(--workspace-safe-top) !important;
}
.app-desktop-layout .workspace > .chat-pane {
  display: none !important;
}
.app-desktop-layout .workspace .editor-statusbar {
  display: flex !important;
}
.app-desktop-layout .paper-toolbar .sep,
.app-desktop-layout .paper-toolbar .grow {
  display: none;
}
.app-desktop-layout .paper-toolbar .btn-icon {
  width: 30px;
  height: 30px;
}
.app-desktop-layout .paper-toolbar .toolbar-action {
  width: 32px;
  min-width: 32px;
  height: 30px;
  padding: 0;
  gap: 0;
}
.app-desktop-layout .paper-toolbar .toolbar-action-label {
  display: none;
}
.app-desktop-layout .paper-toolbar .toolbar-action-polish {
  width: 34px;
  min-width: 34px;
}
.app-mobile-layout .rail { display: none !important; }
.app-mobile-layout .main {
  height: 100% !important;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding-bottom: 74px;
}
.app-mobile-layout .mobile-shell-header {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  background: var(--bg-panel);
  background-image: none;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.app-mobile-layout .mobile-shell-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.app-mobile-layout .mobile-shell-logo { width: 32px; height: 32px; border-radius: 10px; box-shadow: var(--shadow-card); flex: none; }
.app-mobile-layout .mobile-shell-title { font-family: var(--font-serif); font-size: 17px; line-height: 1.2; }
.app-mobile-layout .mobile-shell-sub { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
.app-mobile-layout .workspace {
  display: flex !important;
  flex-direction: column;
  min-height: 0 !important;
  height: 100% !important;
  flex: 1 1 0 !important;
  overflow: hidden !important;
  grid-template-columns: 1fr !important;
  padding-top: 0;
}
.app-mobile-layout .workspace-mobile-header {
  display: block !important;
  padding: 10px 14px;
  background: var(--bg-app);
  background-image: none;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.app-mobile-layout .workspace > .tree-panel,
.app-mobile-layout .workspace > .editor-pane,
.app-mobile-layout .workspace > .chat-pane {
  display: none !important;
  align-self: stretch;
  height: 100% !important;
  min-height: 0 !important;
  margin-top: 0 !important;
  flex: 1 1 0;
}
.app-mobile-layout .workspace.mobile-panel-editor > .editor-pane,
.app-mobile-layout .workspace.mobile-panel-inspector > .editor-pane,
.app-mobile-layout .workspace.mobile-panel-chapters > .tree-panel,
.app-mobile-layout .workspace.mobile-panel-chat > .chat-pane {
  display: flex !important;
  flex: 1 1 0;
  min-height: 0;
}
.app-mobile-layout .workspace.mobile-panel-editor .editor-scroll,
.app-mobile-layout .workspace.mobile-panel-inspector .editor-scroll {
  justify-items: stretch;
}
.app-mobile-layout .workspace.mobile-panel-editor .editor-workbench,
.app-mobile-layout .workspace.mobile-panel-inspector .editor-workbench {
  width: 100%;
  max-width: 100%;
}
.app-mobile-layout .workspace.mobile-panel-editor .paper {
  width: 100%;
  max-width: 100%;
}
.app-mobile-layout .workspace.mobile-panel-editor .paper-body {
  padding-left: clamp(24px, 7vw, 72px);
  padding-right: clamp(24px, 7vw, 72px);
}
.app-mobile-layout .workspace.mobile-panel-editor .chapter-title,
.app-mobile-layout .workspace.mobile-panel-editor .title-rule {
  margin-left: 0;
  margin-right: 0;
}
.app-mobile-layout .workspace.mobile-panel-editor .chapter-title,
.app-mobile-layout .workspace.mobile-panel-editor .title-rule {
  align-self: flex-start;
}
.app-mobile-layout .workspace.mobile-panel-editor .chapter-title {
  width: min(760px, 100%);
  text-align: left;
}
.app-mobile-layout .workspace.mobile-panel-editor .manuscript,
.app-mobile-layout .workspace.mobile-panel-editor .rich-editor-shell,
.app-mobile-layout .workspace.mobile-panel-editor .source-manuscript {
  max-width: min(760px, 100%);
  margin-left: 0;
  margin-right: auto;
}
.app-mobile-layout .mobile-nav {
  display: flex !important;
  gap: 7px;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  min-height: 74px;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
  overflow-x: auto;
  background: color-mix(in srgb, var(--bg-panel) 94%, transparent);
  background-image: none;
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--border);
  z-index: 40;
  flex: none;
}
.app-mobile-layout .mobile-nav-item {
  min-width: 64px;
  height: 50px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-card);
  background-image: var(--surface-sheen);
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
.app-mobile-layout .mobile-nav-item.active {
  background: linear-gradient(180deg, var(--primary-soft), var(--primary-light));
  color: var(--primary);
  border-color: var(--primary-light);
  box-shadow: inset 0 -2px 0 var(--accent-cinnabar);
}
.app-mobile-layout.app-compact-height .mobile-shell-header {
  display: none !important;
}
.app-mobile-layout.app-compact-height .workspace-mobile-header {
  position: absolute;
  top: 42px;
  right: 8px;
  z-index: 42;
  width: auto;
  padding: 0;
  border: 0;
  background: transparent;
  backdrop-filter: none;
}
.app-mobile-layout.app-compact-height .workspace-mobile-summary {
  display: none;
}
.app-mobile-layout.app-compact-height .workspace-mobile-tabs {
  margin-top: 0;
}
.app-mobile-layout.app-compact-height .workspace-mobile-tabs.segmented {
  padding: 2px;
  width: auto;
  box-shadow: var(--shadow-card);
}
.app-mobile-layout.app-compact-height .workspace-mobile-tabs button {
  height: 24px;
  min-width: 42px;
  padding: 0 8px;
  font-size: 11px;
}
.app-mobile-layout.app-compact-height .mobile-nav {
  top: 0;
  bottom: auto;
  min-height: 38px;
  padding: 4px 8px;
}
.app-mobile-layout.app-compact-height .main {
  padding-top: 38px;
  padding-bottom: 0;
}
.app-mobile-layout.app-compact-height .mobile-nav-item {
  min-width: 42px;
  height: 30px;
  padding: 0 7px;
  gap: 2px;
}
.app-mobile-layout.app-compact-height .mobile-nav-item svg {
  width: 17px;
  height: 17px;
}
.app-mobile-layout.app-compact-height .mobile-nav-item span {
  display: none;
}
.app-mobile-layout.app-compact-height .workspace.mobile-panel-editor .paper-toolbar,
.app-mobile-layout.app-compact-height .workspace.mobile-panel-inspector .paper-toolbar {
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  min-height: 34px;
  padding: 3px 7px;
  row-gap: 0;
}
.app-mobile-layout.app-compact-height .workspace.mobile-panel-editor .paper-toolbar .btn,
.app-mobile-layout.app-compact-height .workspace.mobile-panel-inspector .paper-toolbar .btn,
.app-mobile-layout.app-compact-height .workspace.mobile-panel-editor .paper-toolbar .btn-icon,
.app-mobile-layout.app-compact-height .workspace.mobile-panel-inspector .paper-toolbar .btn-icon {
  height: 26px;
}
.app-mobile-layout.app-compact-height .workspace.mobile-panel-editor .editor-scroll,
.app-mobile-layout.app-compact-height .workspace.mobile-panel-inspector .editor-scroll {
  padding-top: 6px;
  padding-bottom: 10px;
}
.app-mobile-layout.app-compact-height .workspace.mobile-panel-editor .paper {
  min-height: 0;
  border-radius: var(--radius-md);
}
.app-mobile-layout.app-compact-height .workspace.mobile-panel-editor .paper-body {
  padding: 12px 18px 22px;
}
.app-mobile-layout.app-compact-height .workspace.mobile-panel-editor .chapter-title {
  font-size: 22px;
  line-height: 1.16;
  text-align: left;
}
.app-mobile-layout.app-compact-height .workspace.mobile-panel-editor .title-rule {
  margin: 8px 0 14px;
}

@media (min-width: 1181px) {
  .app-desktop-layout .workspace {
    grid-template-columns: clamp(224px, 15vw, 248px) minmax(0,1fr) clamp(300px, 21vw, 340px) !important;
  }
  .app-desktop-layout .workspace > .chat-pane {
    display: flex !important;
  }
  .app-desktop-layout .paper-toolbar .sep {
    display: inline-block;
  }
  .app-desktop-layout .paper-toolbar .grow {
    display: block;
  }
  .app-desktop-layout .paper-toolbar .btn-icon {
    width: 32px;
    height: 32px;
  }
  .app-desktop-layout .paper-toolbar .toolbar-action {
    width: auto;
    min-width: 0;
    height: 34px;
    padding: 0 14px;
    gap: 6px;
  }
  .app-desktop-layout .paper-toolbar .toolbar-action-label {
    display: inline;
  }
  .app-desktop-layout .paper-toolbar .toolbar-action-polish {
    width: auto;
    min-width: 0;
  }
}

/* 第一列：图标导航 */
.rail { background: var(--bg-panel); background-image: none; border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 16px 0; gap: 6px; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; }
.rail::-webkit-scrollbar { width: 0; height: 0; }
.rail-logo { width: 40px; height: 40px; border-radius: 11px; overflow: hidden; margin-bottom: 18px; box-shadow: var(--shadow-card), 0 0 0 1px color-mix(in srgb, var(--accent-cinnabar) 18%, transparent); flex: none; }
.rail-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rail-item { position: relative; width: 50px; height: 54px; flex: none; border: 0; background: transparent; color: var(--text-secondary); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; transition: background .18s ease, color .18s ease, transform .18s ease; }
.rail-item .rail-label { font-size: 11px; line-height: 1; }
.rail-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.rail-item.active { background: linear-gradient(180deg, var(--primary-soft), var(--primary-light)); color: var(--primary); }
.rail-item.active::after { content: ""; position: absolute; right: 7px; top: 8px; width: 5px; height: 5px; border-radius: 50%; background: var(--accent-cinnabar); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-cinnabar) 12%, transparent); }
.rail-spacer { flex: 1; }

/* 第二列：章节树 */
.tree-panel { z-index: 3; background: var(--bg-panel); background-image: none; border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; box-shadow: 8px 0 28px color-mix(in srgb, var(--primary-ink) 5%, transparent); }
.tree-head { flex: none; min-height: 104px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 38px 20px 14px; background-color: color-mix(in srgb, var(--surface-panel-glass) 86%, var(--bg-panel)); border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent); }
.tree-head h2 { font-family: var(--font-serif); font-size: 17px; font-weight: 600; letter-spacing: .03em; line-height: 1.35; }
.tree-total-words { margin-top: 4px; font-size: 12px; line-height: 1.45; color: var(--text-muted); }
.tree-head-actions { display: flex; align-items: center; gap: 4px; }
.tree-search-box { padding: 0 12px 10px; }
.tree-search-field { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; background: var(--bg-card); background-image: var(--surface-sheen); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-muted); }
.tree-search-field:focus-within { border-color: var(--primary); box-shadow: var(--focus-ring); }
.tree-search-field input { min-width: 0; flex: 1; border: 0; outline: none; background: transparent; color: var(--text-primary); font-size: 13px; }
.tree-search-field input::placeholder { color: var(--text-muted); }
.tree-search-clear { width: 24px; height: 24px; display: grid; place-items: center; flex: none; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-muted); transition: background .16s ease, color .16s ease; }
.tree-search-clear:hover { background: var(--bg-hover); color: var(--text-primary); }
.tree-search-feedback { margin-top: 6px; padding: 0 2px; color: var(--text-muted); font-size: 12px; }
.spin-icon { animation: spin 0.9s linear infinite; }
.tree-create { position: relative; }
.tree-create-menu { position: absolute; top: calc(100% + 8px); right: 0; z-index: 20; width: 116px; padding: 6px; background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-popover); animation: popoverIn var(--motion-normal) var(--motion-pop) both; transform-origin: top right; }
.tree-create-menu button { width: 100%; height: 32px; padding: 0 10px; border: 0; background: transparent; color: var(--text-secondary); border-radius: var(--radius-sm); font-size: 13px; text-align: left; cursor: pointer; transition: background .16s ease, color .16s ease; }
.tree-create-menu button:hover { background: var(--bg-hover); color: var(--text-primary); }
.tree-context-menu { position: fixed; z-index: 100; width: 176px; padding: 6px; background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-popover); animation: popoverIn var(--motion-normal) var(--motion-pop) both; transform-origin: top left; }
.tree-context-menu button { width: 100%; height: 32px; padding: 0 10px; border: 0; background: transparent; color: var(--text-secondary); border-radius: var(--radius-sm); font-size: 13px; text-align: left; cursor: pointer; transition: background .16s ease, color .16s ease; }
.tree-context-menu button:hover { background: var(--bg-hover); color: var(--text-primary); }
.tree-context-menu button.danger { color: var(--danger); }
.tree-context-menu button.danger:hover { background: var(--bg-hover); color: var(--danger); }
.tree-context-submenu { max-height: 180px; overflow: auto; margin: 4px 0; padding: 4px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.tree-context-submenu-title { padding: 3px 10px 5px; color: var(--text-muted); font-size: 12px; }
.tree-scroll { flex: 1; min-height: 0; overflow: auto; padding: 4px 12px 20px; }
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
.tree-item.active { background: linear-gradient(90deg, color-mix(in srgb, var(--primary-light) 92%, var(--bg-card)), var(--bg-active)); color: var(--primary); font-weight: 600; }
.tree-item.active::before { content: ""; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px; border-radius: 0 3px 3px 0; background: linear-gradient(180deg, var(--accent-cinnabar), var(--primary)); }
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
.search-result-item { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); background-image: none; color: var(--text-secondary); text-align: left; transition: background .16s ease, border-color .16s ease; }
.search-result-item:hover { background: var(--bg-hover); border-color: var(--border-strong); color: var(--text-primary); }
.search-result-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.search-result-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); font-weight: 600; font-size: 13px; }
.search-result-snippet { display: block; margin-top: 6px; color: var(--text-muted); font-size: 12px; line-height: 1.6; }

/* 第三列：编辑器（纸张，周围留呼吸） */
.editor-pane { z-index: 1; background: transparent; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
.editor-scroll { flex: 1; min-width: 0; overflow: auto; display: grid; grid-template-columns: minmax(0,1fr); justify-items: center; align-items: start; padding: 44px clamp(28px, 3vw, 52px) 64px; }
.paper { width: 100%; min-width: 0; max-width: 860px; overflow: hidden; background-color: var(--bg-card); background-image: none; background-blend-mode: multiply, normal; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-paper); display: flex; flex-direction: column; align-self: flex-start; min-height: calc(100% - 0px); position: relative; }
.paper::before { content: ""; position: absolute; inset: 10px; border: 1px solid color-mix(in srgb, var(--border) 58%, transparent); border-radius: calc(var(--radius-lg) - 5px); pointer-events: none; }
.editor-workbench { width: 100%; min-width: 0; max-width: 860px; display: grid; grid-template-columns: minmax(0,1fr); gap: 28px; justify-content: center; align-items: start; }
.editor-workbench.focus-mode { grid-template-columns: minmax(0, 900px); max-width: 900px; }
.paper-toolbar { display: flex; align-items: center; gap: 2px; min-width: 0; max-width: 100%; min-height: 64px; padding: 12px 16px 10px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--surface-toolbar-glass) 90%, var(--bg-panel)); position: relative; z-index: 1; flex-wrap: wrap; row-gap: 8px; overflow: hidden; }
.paper-toolbar .sep { width: 1px; height: 20px; background: var(--border); margin: 0 8px; }
.paper-toolbar .grow { flex: 1 1 24px; min-width: 16px; }
.editor-mode-switch { margin-left: 8px; flex: none; }
.editor-mode-switch button { padding: 0 10px; white-space: nowrap; }
.toolbar-action-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toolbar-active { background: linear-gradient(180deg, var(--primary-soft), var(--primary-light)); color: var(--primary); box-shadow: inset 0 -1px 0 var(--accent-cinnabar); }
.outline-popover { position: absolute; top: 58px; right: 14px; z-index: 30; width: min(320px, calc(100% - 28px)); max-height: min(420px, calc(100% - 84px)); overflow: hidden; display: flex; flex-direction: column; background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-popover); animation: popoverIn var(--motion-normal) var(--motion-pop) both; transform-origin: top right; }
.outline-popover-head { height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 10px 0 14px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 13px; }
.outline-popover-list { overflow: auto; padding: 8px; }
.outline-popover-item { width: 100%; display: flex; flex-direction: column; gap: 3px; padding: 9px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-secondary); text-align: left; transition: background .16s ease, color .16s ease; }
.outline-popover-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.outline-item-title { color: var(--text-primary); font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.outline-item-sub { color: var(--text-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.outline-empty { padding: 18px 12px; color: var(--text-muted); font-size: 13px; line-height: 1.7; }
.quick-lookup-panel { position: fixed; right: clamp(16px, 2.5vw, 32px); bottom: clamp(16px, 2.5vw, 32px); z-index: 70; width: min(390px, calc(100vw - 32px)); max-height: min(680px, calc(100vh - 32px)); display: flex; flex-direction: column; overflow: hidden; background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-popover); animation: modalIn var(--motion-normal) var(--motion-pop) both; transform-origin: bottom right; }
.quick-lookup-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 16px 12px; border-bottom: 1px solid var(--border); }
.quick-lookup-head h2 { margin: 0; font-family: var(--font-serif); font-size: 20px; line-height: 1.3; }
.quick-lookup-head p { margin: 4px 0 0; color: var(--text-muted); font-size: 12px; }
.quick-lookup-tabs { margin: 12px 16px 0; }
.quick-lookup-tabs button { flex: 1; }
.quick-lookup-search { display: flex; align-items: center; gap: 8px; height: 36px; margin: 12px 16px; padding: 0 10px; background: var(--bg-panel); background-image: var(--surface-sheen); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-muted); }
.quick-lookup-search:focus-within { border-color: var(--primary); box-shadow: var(--focus-ring); }
.quick-lookup-search input { min-width: 0; flex: 1; border: 0; outline: none; background: transparent; color: var(--text-primary); font-size: 13px; }
.quick-lookup-error { margin: 0 16px 10px; padding: 9px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); background: var(--bg-panel); color: var(--danger); font-size: 12px; line-height: 1.6; }
.quick-lookup-body { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 12px 14px; }
.quick-lookup-empty { min-height: 160px; display: grid; place-items: center; gap: 10px; padding: 18px; color: var(--text-muted); text-align: center; font-size: 13px; line-height: 1.7; }
.quick-lookup-item { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-panel); overflow: hidden; }
.quick-lookup-item.expanded { border-color: var(--border-strong); background: var(--bg-card); background-image: none; box-shadow: var(--shadow-card); }
.quick-lookup-item-main { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 12px; border: 0; background: transparent; color: var(--text-secondary); text-align: left; cursor: pointer; }
.quick-lookup-item-main:hover { background: var(--bg-hover); }
.quick-lookup-avatar { width: 34px; height: 34px; display: grid; place-items: center; flex: none; border-radius: 50%; background: var(--primary-light); color: var(--primary); font-size: 14px; font-weight: 700; }
.quick-lookup-avatar.outline { border-radius: var(--radius-sm); }
.quick-lookup-title-block { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.quick-lookup-title-block strong { color: var(--text-primary); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quick-lookup-title-block span { color: var(--text-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quick-lookup-detail { display: grid; gap: 8px; padding: 0 12px 12px 56px; }
.quick-lookup-field { display: grid; grid-template-columns: 74px minmax(0,1fr); gap: 8px; align-items: start; }
.quick-lookup-field span { color: var(--text-muted); font-size: 12px; line-height: 1.6; }
.quick-lookup-field p { margin: 0; color: var(--text-secondary); font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.quick-lookup-field.multiline { grid-template-columns: 1fr; gap: 3px; }
.paper-body { padding: 64px clamp(42px, 7vw, 92px) 84px; flex: 1; display: flex; flex-direction: column; position: relative; z-index: 1; }
.chapter-title { font-family: var(--font-serif); font-size: 36px; font-weight: 600; letter-spacing: .06em; line-height: 1.25; color: var(--primary-ink); text-align: center; }
.chapter-title-input { width: 100%; padding: 0 0 4px; border: 0; border-bottom: 1px solid transparent; outline: none; background: transparent; color: var(--text-primary); }
.chapter-title-input:focus { border-bottom-color: var(--border-strong); }
.title-rule { width: 72px; height: 2px; background: linear-gradient(90deg, transparent, var(--accent-cinnabar) 0 16%, var(--primary) 16% 84%, transparent); margin: 20px auto 36px; border-radius: 2px; box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-cinnabar) 7%, transparent); }
.manuscript { font-family: var(--font-serif); font-size: 17.5px; line-height: 1.95; letter-spacing: .018em; color: var(--text-primary); border: 0; outline: none; resize: none; background: transparent; width: 100%; max-width: 700px; margin: 0 auto; flex: 1; min-height: 360px; }
.manuscript::placeholder { color: var(--text-muted); }
.rich-editor-shell { position: relative; flex: 1; min-height: 360px; display: flex; width: 100%; max-width: 700px; margin: 0 auto; }
.rich-editor-shell > div:not(.rich-editor-placeholder) { flex: 1; display: flex; min-width: 0; position: relative; z-index: 1; }
.rich-editor-placeholder { position: absolute; top: 0; left: 0; right: 0; z-index: 1; pointer-events: none; color: var(--text-muted); font-family: var(--font-serif); font-size: 17.5px; line-height: 1.95; letter-spacing: .018em; }
.rich-manuscript { min-height: 360px; white-space: pre-wrap; word-break: break-word; caret-color: var(--accent-cinnabar); font-size: 17.5px; line-height: 1.95; letter-spacing: .018em; }
.rich-manuscript:focus { outline: none; }
.rich-manuscript p { margin: 0 0 1.18em; }
.rich-manuscript h1,
.rich-manuscript h2,
.rich-manuscript h3 { margin: 1.25em 0 0.65em; font-family: var(--font-serif); line-height: 1.38; letter-spacing: .03em; color: var(--primary-ink); }
.rich-manuscript h1 { font-size: 1.7em; }
.rich-manuscript h2 { font-size: 1.42em; }
.rich-manuscript h3 { font-size: 1.2em; }
.rich-manuscript blockquote { margin: 0.8em 0; padding-left: 14px; border-left: 3px solid color-mix(in srgb, var(--accent-cinnabar) 54%, var(--border-strong)); color: var(--text-secondary); background: color-mix(in srgb, var(--accent-cinnabar-light) 28%, transparent); }
.rich-manuscript ul,
.rich-manuscript ol { margin: 0.7em 0 0.9em; padding-left: 1.35em; }
.rich-manuscript li { margin: 0.25em 0; }
.source-manuscript { font-family: var(--font-mono); font-size: 14.5px; line-height: 1.82; letter-spacing: 0; padding: 0; tab-size: 2; white-space: pre; overflow: auto; max-width: 740px; }
.editor-empty { flex: 1; min-height: 420px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text-muted); text-align: center; }
.editor-statusbar { display: flex; align-items: center; gap: 18px; min-width: 0; padding: 11px 28px; border-top: 1px solid var(--border); background: color-mix(in srgb, var(--bg-panel) 82%, transparent); font-size: 12px; color: var(--text-secondary); }
.editor-statusbar .grow { flex: 1 1 auto; min-width: 12px; }
.editor-statusbar > span { white-space: nowrap; flex: none; }
.save-status { display: inline-flex; align-items: center; gap: 7px; min-width: 132px; color: var(--text-secondary); font-weight: 500; }
.save-status-saved { color: var(--success); }
.save-status-saving { color: var(--primary); }
.save-status-dirty { color: var(--warning); }
.save-status-error { color: var(--danger); }
.save-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--text-muted); box-shadow: 0 0 0 3px color-mix(in srgb, var(--text-muted) 12%, transparent); flex: none; }
.save-dot.saved { background: var(--success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 14%, transparent); }
.save-dot.saving { background: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent); animation: breathe 1.1s ease-in-out infinite; }
.save-dot.dirty { background: var(--warning); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warning) 14%, transparent); }
.save-dot.error { background: var(--danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 14%, transparent); }
.writing-progress { flex: 0 1 min(280px, 34vw); min-width: 180px; display: grid; grid-template-columns: auto auto; gap: 3px 12px; align-items: center; color: var(--text-secondary); }
.writing-progress span { white-space: nowrap; }
.writing-progress span:first-child { color: var(--text-primary); font-weight: 600; }
.writing-progress i { grid-column: 1 / -1; height: 5px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--border) 70%, transparent); box-shadow: inset 0 1px 1px color-mix(in srgb, var(--primary-ink) 10%, transparent); }
.writing-progress b { display: block; height: 100%; min-width: 0; border-radius: inherit; background: linear-gradient(90deg, var(--accent-cinnabar), var(--primary)); transition: width var(--motion-slow) var(--motion-ease); }

/* Vault 内嵌引导卡 */
.vault-card { display: flex; align-items: center; gap: 12px; margin: 20px 24px 0; padding: 14px 16px; background: var(--bg-card); background-image: none; border: 1px dashed var(--border-strong); border-radius: var(--radius-md); box-shadow: var(--shadow-card); }
.vault-card .vc-icon { color: var(--primary); flex: none; }
.vault-card .vc-text { font-size: 13px; color: var(--text-primary); white-space: nowrap; }
.vault-card .input { flex: 1; }
.err-card { margin: 14px 24px 0; padding: 11px 16px; background: var(--bg-card); border: 1px solid var(--border-strong); border-left: 3px solid var(--danger); border-radius: var(--radius-sm); font-size: 13px; color: var(--danger); }

.vault-modal-backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: clamp(16px, 3vw, 28px); background: color-mix(in srgb, var(--primary-ink) 40%, transparent); backdrop-filter: blur(10px); animation: backdropIn .22s ease-out both; }
.vault-modal { width: min(520px, calc(100vw - 32px)); max-height: min(86vh, 900px); overflow: auto; background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-popover); padding: 26px 28px; animation: modalIn .24s var(--motion-pop) both; transform-origin: center; }
.vault-modal-mark { width: 44px; height: 44px; display: grid; place-items: center; color: var(--primary); background: linear-gradient(180deg, var(--primary-soft), var(--primary-light)); border: 1px solid color-mix(in srgb, var(--primary) 16%, transparent); border-radius: var(--radius-md); margin-bottom: 16px; box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--accent-cinnabar) 26%, transparent); }
.vault-modal h2 { margin: 0; font-family: var(--font-serif); font-size: 27px; line-height: 1.25; letter-spacing: .035em; color: var(--primary-ink); }
.vault-modal p { margin: 10px 0 20px; color: var(--text-secondary); }
.vault-modal .err-card { margin: 14px 0 0; }
.vault-modal-actions { display: flex; justify-content: flex-end; margin-top: 18px; }
.input-modal { display: grid; gap: 18px; }
.confirm-modal { display: grid; gap: 16px; }
.input-modal .vault-modal-actions { gap: 8px; margin-top: 0; }
.confirm-modal .vault-modal-actions { gap: 8px; margin-top: 0; }


/* ===== 第四列：总控 AI 对话窗 ===== */
.chat-pane { z-index: 4; background: var(--bg-panel); background-image: none; border-left: 1px solid var(--border-strong); display: flex; flex-direction: column; min-height: 0; overflow: hidden; box-shadow: -14px 0 34px color-mix(in srgb, var(--primary-ink) 9%, transparent); }
.chat-head { display: flex; align-items: center; gap: 12px; min-height: 86px; padding: 30px 20px 18px; border-bottom: 1px solid color-mix(in srgb, var(--border-strong) 72%, transparent); background-color: color-mix(in srgb, var(--bg-panel) 94%, transparent); }
.chat-avatar { width: 38px; height: 38px; border-radius: 11px; background: linear-gradient(135deg, var(--primary), var(--primary-hover)); color: var(--text-on-primary); display: grid; place-items: center; flex: none; box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--accent-cinnabar) 36%, transparent), 0 8px 18px color-mix(in srgb, var(--primary) 18%, transparent); }
.chat-head .ch-name { font-size: 14px; font-weight: 600; }
.chat-head .ch-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.chat-head .grow { flex: 1; }
.chat-scroll { flex: 1; overflow: auto; padding: 20px 18px; display: flex; flex-direction: column; gap: 18px; }
.msg { display: flex; gap: 10px; max-width: 100%; }
.msg-av { width: 28px; height: 28px; border-radius: 9px; flex: none; display: grid; place-items: center; font-size: 13px; }
.msg-av.ai { background: var(--primary-light); color: var(--primary); }
.msg-bubble { padding: 11px 14px; border-radius: var(--radius-md); font-size: 13.5px; line-height: 1.7; max-width: min(280px, 100%); word-break: break-word; }
.msg.ai .msg-bubble { background: var(--bg-card); background-image: none; border: 1px solid var(--border); color: var(--text-primary); border-top-left-radius: 4px; box-shadow: var(--shadow-card); }
.msg.user { flex-direction: row-reverse; }
.msg.user .msg-bubble { background: linear-gradient(180deg, var(--primary), var(--primary-hover)); color: var(--text-on-primary); border-top-right-radius: 4px; box-shadow: 0 8px 18px color-mix(in srgb, var(--primary) 16%, transparent); }
.msg.user .msg-av { background: var(--bg-hover); color: var(--text-secondary); }
.msg-task .msg-bubble { max-width: 300px; }
.task-confirm-card { border-color: color-mix(in srgb, var(--primary) 34%, var(--border)); background: color-mix(in srgb, var(--primary-light) 46%, var(--bg-card)); box-shadow: var(--shadow-card); }
.task-confirm-text { color: var(--text-primary); font-weight: 600; }
.task-confirm-meta { display: flex; justify-content: space-between; gap: 10px; margin-top: 8px; color: var(--text-muted); font-size: 12px; }
.task-confirm-actions { display: flex; gap: 8px; margin-top: 12px; }
.task-confirm-actions .btn { height: 30px; padding: 0 10px; font-size: 12px; }
.review-report-modal { width: min(760px, 100%); max-height: min(760px, calc(100vh - 48px)); overflow: auto; }
.review-report-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 14px; }
.review-report-head p { margin-bottom: 0; }
.review-running-card { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel); color: var(--text-secondary); }
.review-report-summary { margin: 12px 0; }
.review-report-list { display: grid; gap: 12px; }
.review-report-card { padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel); }
.review-report-card.failed { border-color: color-mix(in srgb, var(--danger) 36%, var(--border)); background: color-mix(in srgb, var(--danger) 6%, var(--bg-panel)); }
.review-report-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.review-report-card-head strong { display: block; color: var(--text-primary); }
.review-report-card-head span { font-size: 12px; color: var(--text-muted); }
.review-report-text { margin: 10px 0 0; white-space: pre-wrap; word-break: break-word; font: inherit; line-height: 1.75; color: var(--text-primary); }

/* 对话内的 Agent 执行卡片 */
.run-inline { background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px; margin-left: 38px; box-shadow: var(--shadow-card); }
.run-inline-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.run-inline-head .ri-title { font-size: 12.5px; font-weight: 600; color: var(--text-primary); }
.run-progress { height: 4px; border-radius: 999px; background: var(--border); overflow: hidden; margin-bottom: 14px; }
.run-progress > span { display: block; height: 100%; background: linear-gradient(90deg, var(--accent-cinnabar), var(--primary)); border-radius: 999px; transition: width .4s ease; }
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
.chat-input-box { display: flex; align-items: flex-end; gap: 8px; background: var(--bg-card); background-image: var(--surface-sheen); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px 8px 8px 14px; transition: border-color .18s ease, box-shadow .18s ease; }
.chat-input-box:focus-within { border-color: var(--primary); box-shadow: var(--focus-ring); }
.chat-input-box textarea { flex: 1; border: 0; outline: none; resize: none; background: transparent; font-size: 13.5px; line-height: 1.6; color: var(--text-primary); max-height: 120px; padding: 4px 0; }
.chat-input-box textarea::placeholder { color: var(--text-muted); }
.chat-send { width: 34px; height: 34px; border-radius: var(--radius-sm); border: 0; background: linear-gradient(180deg, var(--primary), var(--primary-hover)); color: var(--text-on-primary); display: grid; place-items: center; flex: none; transition: background .18s ease, transform .18s ease; }
.chat-send:active { transform: translateY(1px); }
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
.toast-viewport { position: fixed; right: clamp(16px, 2.5vw, 28px); top: clamp(16px, 2.5vw, 28px); z-index: 160; display: grid; gap: 10px; width: min(360px, calc(100vw - 32px)); pointer-events: none; }
.toast { min-height: 48px; display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background-color: var(--surface-card-glass); background-image: none; backdrop-filter: var(--surface-blur); box-shadow: var(--shadow-popover); color: var(--text-primary); font-size: 13px; line-height: 1.55; pointer-events: auto; animation: toastIn .24s ease both; }
.toast svg { flex: none; margin-top: 1px; }
.toast-success { border-color: color-mix(in srgb, var(--agent-done) 42%, var(--border)); }
.toast-success svg { color: var(--agent-done); }
.toast-error { border-color: color-mix(in srgb, var(--danger) 46%, var(--border)); }
.toast-error svg { color: var(--danger); }
.toast-info svg { color: var(--primary); }
.loading-state { min-height: 280px; }
.loading-card { width: min(360px, 100%); display: grid; gap: 14px; padding: 18px; border: 1px solid var(--border); border-radius: var(--radius-md); background-color: var(--surface-card-glass); backdrop-filter: var(--surface-blur); box-shadow: var(--shadow-card); color: var(--text-secondary); }
.loading-head { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--text-primary); font-weight: 600; }
.skeleton-stack { display: grid; gap: 9px; }
.skeleton-stack span { height: 12px; border-radius: 999px; background: linear-gradient(90deg, color-mix(in srgb, var(--bg-hover) 72%, transparent), color-mix(in srgb, var(--primary-light) 72%, transparent), color-mix(in srgb, var(--bg-hover) 72%, transparent)); background-size: 220% 100%; animation: skeletonShimmer 1.45s ease-in-out infinite; }
.skeleton-stack span:nth-child(2) { width: 84%; }
.skeleton-stack span:nth-child(3) { width: 62%; }
.empty-state { min-height: 280px; padding: 42px 22px; gap: 14px; }
.empty-state-mark { width: 58px; height: 58px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--border-strong) 62%, transparent); border-radius: var(--radius-lg); background: linear-gradient(180deg, var(--surface-card-glass), color-mix(in srgb, var(--primary-light) 30%, transparent)); box-shadow: var(--shadow-card); }
.empty-state.error .empty-state-mark { background: color-mix(in srgb, var(--danger) 10%, var(--surface-card-glass)); border-color: color-mix(in srgb, var(--danger) 34%, var(--border)); }
.empty-state.error .empty-icon { color: var(--danger); }
.empty-state-copy { display: grid; gap: 6px; max-width: 420px; }
.empty-state-copy strong { color: var(--text-primary); font-size: 15px; }
.empty-state-copy p { margin: 0; color: var(--text-muted); line-height: 1.75; }

/* ===== 通用页面：页头 / 列表 / 详情 / 设置 ===== */
.view { height: 100%; display: flex; flex-direction: column; background: transparent; min-width: 0; }
.view-head { display: flex; align-items: flex-end; justify-content: space-between; padding: 42px 52px 24px; }
.view-title { position: relative; display: inline-flex; align-items: center; gap: 14px; font-family: var(--font-serif); font-size: 34px; line-height: 1.16; font-weight: 600; letter-spacing: .065em; color: var(--primary-ink); }
.view-title::after { content: ""; width: 42px; height: 2px; border-radius: 2px; background: linear-gradient(90deg, var(--accent-cinnabar), var(--primary)); opacity: .82; }
.view-sub { font-size: 13px; color: var(--text-muted); margin-top: 10px; }
.view-actions { display: flex; gap: 10px; }
.view-body { flex: 1; overflow: auto; padding: 8px 52px 56px; }
.toolbar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
.toolbar-row .grow { flex: 1; }
.search { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; background: var(--bg-card); background-image: var(--surface-sheen); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-muted); min-width: 220px; }
.search:focus-within { border-color: var(--primary); box-shadow: var(--focus-ring); }
.search input { border: 0; outline: none; background: transparent; font-size: 13px; color: var(--text-primary); flex: 1; }

/* 列表卡片 */
.list-card { background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); overflow: hidden; }
.list-row { display: flex; align-items: center; gap: 18px; min-height: 62px; padding: 12px 24px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background var(--motion-fast) ease, color var(--motion-fast) ease, box-shadow var(--motion-fast) ease, transform var(--motion-fast) ease; text-align: left; width: 100%; border-left: 0; border-right: 0; border-top: 0; background: transparent; animation: listItemIn var(--motion-normal) var(--motion-ease) both; }
.list-row:last-child { border-bottom: 0; }
.list-row:hover { background: color-mix(in srgb, var(--bg-panel) 74%, var(--primary-light)); transform: translateX(1px); }
.list-row.active { background: linear-gradient(90deg, color-mix(in srgb, var(--primary-light) 82%, var(--bg-card)), var(--bg-card)); box-shadow: inset 3px 0 0 var(--accent-cinnabar); }
.list-row.head { min-height: 42px; padding: 0 22px; font-size: 12px; color: var(--text-muted); cursor: default; background: color-mix(in srgb, var(--bg-panel) 88%, var(--primary-light)); font-weight: 500; letter-spacing: .02em; }
.list-row.head:hover { background: var(--bg-panel); }
.col { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-grow { flex: 1; }
.col-name { font-weight: 500; color: var(--text-primary); }
.col-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

/* 头像 */
.avatar { width: 38px; height: 38px; border-radius: 11px; background: linear-gradient(180deg, var(--primary-soft), var(--primary-light)); color: var(--primary); display: grid; place-items: center; font-family: var(--font-serif); font-weight: 600; font-size: 15px; flex: none; overflow: hidden; box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--accent-cinnabar) 20%, transparent); }
.avatar.lg { width: 96px; height: 96px; font-size: 34px; border-radius: var(--radius-md); }
.avatar img { width: 100%; height: 100%; object-fit: cover; }

/* 详情两栏 */
.detail-grid { display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 20px; align-items: start; }
.info-card { background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); padding: 24px 26px; transition: border-color var(--motion-normal) ease, box-shadow var(--motion-normal) ease, transform var(--motion-normal) ease; }
.info-card + .info-card { margin-top: 16px; }
.info-card h3 { font-size: 14px; margin-bottom: 16px; padding-left: 11px; position: relative; }
.info-card h3::before { content: ""; position: absolute; left: 0; top: 1px; bottom: 1px; width: 3px; border-radius: 2px; background: linear-gradient(180deg, var(--accent-cinnabar), var(--primary)); }
.field { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; font-size: 13px; border-bottom: 1px solid var(--border); }
.field:last-child { border-bottom: 0; }
.field .k { color: var(--text-muted); flex: none; }
.field .v { color: var(--text-primary); text-align: right; }
.stack-align-start { text-align: left !important; }

.split-layout { display: grid; grid-template-columns: minmax(320px, 420px) minmax(0, 1fr); gap: 20px; align-items: start; }
.detail-stack { min-width: 0; display: flex; flex-direction: column; gap: 18px; }
.hero-card { display: flex; justify-content: space-between; gap: 22px; align-items: flex-start; padding: 28px 30px; background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); transition: border-color var(--motion-normal) ease, box-shadow var(--motion-normal) ease, transform var(--motion-normal) ease; }
.hero-card-main { display: flex; gap: 16px; align-items: center; min-width: 0; }
.hero-card-main h2 { font-family: var(--font-serif); font-size: 26px; line-height: 1.25; letter-spacing: .03em; margin-bottom: 4px; color: var(--primary-ink); }
.hero-card-main .tag-row { margin-top: 10px; }
.tab-strip { display: flex; gap: 8px; flex-wrap: wrap; }
.tab-strip button { height: 34px; padding: 0 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-card); color: var(--text-secondary); transition: background .16s ease, color .16s ease, border-color .16s ease; }
.tab-strip button:hover { background: var(--bg-hover); color: var(--text-primary); }
.tab-strip button.active { background: linear-gradient(180deg, var(--primary-soft), var(--primary-light)); color: var(--primary); border-color: color-mix(in srgb, var(--primary) 24%, var(--primary-light)); box-shadow: inset 0 -1px 0 var(--accent-cinnabar); }
.detail-section + .detail-section { margin-top: 18px; }
.detail-section h4 { margin: 0 0 10px; font-size: 13px; color: var(--text-secondary); }
.stack-list { display: flex; flex-direction: column; gap: 12px; }
.quote-line { padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg-panel); border: 1px solid var(--border); border-left-color: color-mix(in srgb, var(--accent-cinnabar) 36%, var(--border)); font-size: 13px; line-height: 1.7; }
.muted-line { color: var(--text-secondary); }
.mini-card { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--bg-panel); border: 1px solid var(--border); }
.mini-card-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.mini-card-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.signal-list { display: flex; flex-direction: column; gap: 12px; }
.signal-item { display: flex; gap: 10px; align-items: flex-start; color: var(--text-secondary); }
.signal-item svg { color: var(--primary); flex: none; margin-top: 2px; }

.editor-card { background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); padding: 26px 28px; margin-bottom: 24px; transition: border-color var(--motion-normal) ease, box-shadow var(--motion-normal) ease, transform var(--motion-normal) ease; }
.editor-card-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; margin-bottom: 18px; }
.editor-card-head h2 { font-family: var(--font-serif); font-size: 24px; line-height: 1.25; letter-spacing: .03em; color: var(--primary-ink); }
.form-grid { display: grid; gap: 14px; margin-bottom: 14px; }
.form-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.form-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.form-block { display: flex; flex-direction: column; gap: 8px; min-width: 0; font-size: 13px; color: var(--text-secondary); }
.textarea { min-height: 124px; padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-card); background-image: var(--surface-sheen); color: var(--text-primary); font-size: 13px; line-height: 1.65; resize: vertical; outline: none; transition: border-color .18s ease, box-shadow .18s ease; }
.textarea:focus { border-color: var(--primary); box-shadow: var(--focus-ring); }
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
.agent-model-label { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
.agent-model-explicit { color: var(--text-secondary); }
.agent-model-default { color: var(--primary); }
.agent-model-missing { color: var(--warning); }
.agent-editor-section { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
.agent-switch-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 14px; }
.agent-switch-row { min-height: 34px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel); }
.agent-tag-block { min-width: 0; }
.agent-tag-input { min-height: 38px; padding: 5px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); background-image: var(--surface-sheen); transition: border-color .18s ease, box-shadow .18s ease; }
.agent-tag-input:focus-within { border-color: var(--primary); box-shadow: var(--focus-ring); }
.agent-tag-list { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.agent-tag-list input { flex: 1 1 120px; min-width: 90px; height: 26px; border: 0; outline: none; background: transparent; color: var(--text-primary); font-size: 13px; }
.agent-tag-list input::placeholder { color: var(--text-muted); }
.agent-tag { gap: 5px; max-width: 100%; }
.agent-tag button { display: inline-grid; place-items: center; width: 16px; height: 16px; border: 0; padding: 0; border-radius: 50%; background: transparent; color: currentColor; cursor: pointer; }
.agent-tag button:hover { background: var(--bg-hover); }
.agent-empty-editor { min-height: 180px; }
.agent-modal-backdrop { align-items: center; }
.agent-modal { width: min(880px, calc(100vw - 48px)); max-height: min(86vh, 920px); display: flex; flex-direction: column; padding: 0; overflow: hidden; }
.agent-modal-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; padding: 24px 28px 18px; border-bottom: 1px solid var(--border); }
.agent-modal-head h2 { font-family: var(--font-serif); font-size: 26px; letter-spacing: .03em; color: var(--primary-ink); }
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
.tag { display: inline-flex; align-items: center; height: 23px; padding: 0 10px; border-radius: var(--radius-sm); font-size: 12px; background: var(--bg-hover); color: var(--text-secondary); border: 1px solid color-mix(in srgb, var(--border-strong) 45%, transparent); }
.tag.primary { background: var(--primary-light); color: var(--primary); border-color: color-mix(in srgb, var(--primary) 18%, transparent); }
.tag-row { display: flex; flex-wrap: wrap; gap: 7px; }

/* 卡片网格（项目库） */
.view-toggle { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); background-image: var(--surface-sheen); }
.character-project-selector { position: relative; display: inline-flex; align-items: center; gap: 8px; }
.character-project-label { color: var(--text-muted); font-size: 13px; white-space: nowrap; }
.character-project-button { height: 34px; min-width: 168px; max-width: 260px; display: inline-flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 10px 0 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); background-image: var(--surface-sheen); color: var(--text-primary); font-size: 13px; cursor: pointer; transition: border-color .18s ease, background .18s ease, color .18s ease, box-shadow .18s ease; }
.character-project-button:hover { background: var(--bg-hover); border-color: var(--border-strong); }
.character-project-button:focus-visible { outline: none; border-color: var(--primary); box-shadow: var(--focus-ring); }
.character-project-button:disabled { opacity: .55; cursor: not-allowed; }
.character-project-button span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.character-project-menu { position: absolute; top: calc(100% + 8px); right: 0; z-index: 50; width: 260px; max-height: 280px; overflow: auto; padding: 6px; background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-popover); animation: popoverIn var(--motion-normal) var(--motion-pop) both; transform-origin: top right; }
.character-project-menu button { width: 100%; min-height: 42px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 3px; padding: 7px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-secondary); text-align: left; cursor: pointer; transition: background .16s ease, color .16s ease; }
.character-project-menu button:hover { background: var(--bg-hover); color: var(--text-primary); }
.character-project-menu button.active { background: linear-gradient(90deg, var(--primary-light), var(--bg-card)); color: var(--primary); box-shadow: inset 3px 0 0 var(--accent-cinnabar); }
.character-project-menu small { max-width: 100%; color: var(--text-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.character-project-empty { padding: 10px; color: var(--text-muted); font-size: 13px; line-height: 1.6; }
.character-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 18px; }
.character-card { overflow: hidden; background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); transition: transform var(--motion-normal) ease, box-shadow var(--motion-normal) ease, border-color var(--motion-normal) ease; animation: listItemIn var(--motion-normal) var(--motion-ease) both; }
.character-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--primary) 20%, var(--border)); box-shadow: var(--shadow-popover); }
.character-card-cover { width: 100%; aspect-ratio: 3 / 4; border: 0; display: grid; place-items: center; background: radial-gradient(circle at 68% 16%, color-mix(in srgb, var(--accent-cinnabar-light) 74%, transparent), transparent 28%), linear-gradient(180deg, var(--primary-light), var(--bg-panel)); color: var(--primary); font-family: var(--font-serif); font-size: 48px; cursor: pointer; overflow: hidden; }
.character-card-cover img { width: 100%; height: 100%; object-fit: cover; }
.character-card-body { display: grid; gap: 12px; padding: 14px; }
.character-card-body h3 { margin: 0 0 5px; font-family: var(--font-serif); font-size: 20px; }
.character-card-body p { min-height: 42px; margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.character-list-card .character-compact-row { min-height: 64px; }
.character-template-modal { width: min(560px, calc(100vw - 36px)); padding: 24px 26px; }
.character-template-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.character-template-card { min-height: 150px; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 18px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-panel); background-image: none; color: var(--text-primary); text-align: left; cursor: pointer; transition: border-color .18s ease, background .18s ease, transform .18s ease, box-shadow .18s ease; }
.character-template-card:hover { border-color: var(--primary); background: var(--primary-light); transform: translateY(-1px); box-shadow: var(--shadow-card); }
.character-template-card svg { color: var(--primary); }
.character-template-card span { color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.character-template-card-wide { grid-column: 1 / -1; min-height: 128px; }
.character-modal-backdrop { align-items: center; }
.character-modal { width: min(1040px, calc(100vw - 48px)); max-height: min(88vh, 980px); display: flex; flex-direction: column; padding: 0; overflow: hidden; }
.character-modal-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; padding: 24px 28px 18px; border-bottom: 1px solid var(--border); }
.character-modal-head.compact { padding: 0 0 18px; border-bottom: 0; }
.character-modal-head h2 { margin: 0; font-family: var(--font-serif); font-size: 24px; }
.character-modal-head p { margin: 8px 0 0; color: var(--text-secondary); font-size: 13px; }
.character-modal-body { overflow: auto; padding: 20px 28px 24px; }
.character-editor-top { display: grid; grid-template-columns: 118px minmax(0, 1fr); gap: 18px; align-items: center; margin-bottom: 18px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-panel); background-image: none; }
.character-avatar-uploader { width: 104px; aspect-ratio: 3 / 4; display: grid; place-items: center; overflow: hidden; border: 1px dashed var(--border-strong); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-muted); }
.character-avatar-uploader img { width: 100%; height: 100%; object-fit: cover; }
.character-top-fields { display: grid; grid-template-columns: minmax(0, 240px) minmax(0, 1fr); gap: 14px; }
.character-simple-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.character-simple-section { margin: 0; padding: 16px; }
.character-field-stack { display: grid; gap: 14px; }
.character-subsection h4 { margin: 4px 0 10px; color: var(--text-secondary); font-size: 13px; }
.character-field-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.character-accordion { display: grid; gap: 10px; }
.character-accordion-item { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-card); background-image: none; overflow: hidden; box-shadow: var(--shadow-card); }
.character-accordion-head { width: 100%; height: 46px; display: flex; align-items: center; gap: 8px; padding: 0 14px; border: 0; background: transparent; color: var(--text-primary); font-weight: 600; text-align: left; cursor: pointer; }
.character-accordion-head:hover { background: var(--bg-hover); }
.character-accordion-body { padding: 14px; border-top: 1px solid var(--border); }
.character-custom-fields { display: grid; gap: 8px; padding-top: 10px; border-top: 1px dashed var(--border); }
.character-custom-row { display: grid; grid-template-columns: minmax(120px, 180px) minmax(0, 1fr) 32px; gap: 8px; align-items: center; }
.character-add-custom { justify-self: start; padding-left: 0; }
.character-avatar-large { aspect-ratio: 3 / 4; }
.character-assist-modal { width: min(580px, calc(100vw - 36px)); display: grid; gap: 16px; }
.character-assist-fanfic-grid { margin-bottom: 10px; }
.character-assist-mode { display: inline-flex; width: fit-content; gap: 3px; padding: 3px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel); }
.character-assist-mode button { height: 30px; padding: 0 14px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-secondary); cursor: pointer; transition: background .16s ease, color .16s ease; }
.character-assist-mode button:hover { background: var(--bg-hover); color: var(--text-primary); }
.character-assist-mode button.active { background: var(--primary-light); color: var(--primary); font-weight: 600; box-shadow: inset 0 -1px 0 var(--accent-cinnabar); }
.character-assist-prompt { min-height: 120px; }
.character-assist-note { padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--warning) 38%, var(--border)); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--warning) 10%, var(--bg-card)); color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.character-assist-success { margin: 0 0 14px; padding: 11px 14px; border: 1px solid color-mix(in srgb, var(--agent-done) 42%, var(--border)); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--agent-done) 12%, var(--bg-card)); color: var(--agent-done); font-size: 13px; }
.character-delete-action { color: var(--danger); justify-content: center; }
.character-row-actions { width: 42px; display: inline-flex; justify-content: flex-end; flex: none; }
.character-ai-create-modal { width: min(620px, calc(100vw - 36px)); display: grid; gap: 16px; }
.character-ai-chat { display: grid; gap: 12px; }
.character-ai-message { width: fit-content; max-width: 92%; padding: 10px 12px; border-radius: var(--radius-md); font-size: 13px; line-height: 1.65; }
.character-ai-message.ai { background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-secondary); }
.character-ai-extra { min-height: 88px; }
.worldbook-origin-tabs { display: inline-flex; gap: 4px; margin: 0 0 18px; padding: 3px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); background-image: var(--surface-sheen); }
.worldbook-origin-tabs button { height: 32px; padding: 0 14px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-secondary); font-size: 13px; cursor: pointer; transition: background .16s ease, color .16s ease; }
.worldbook-origin-tabs button:hover { background: var(--bg-hover); color: var(--text-primary); }
.worldbook-origin-tabs button.active { background: var(--primary-light); color: var(--primary); font-weight: 600; box-shadow: inset 0 -1px 0 var(--accent-cinnabar); }
.worldbook-group-stack { display: grid; gap: 18px; }
.worldbook-group { background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); overflow: hidden; }
.worldbook-group-head { min-height: 46px; display: flex; align-items: center; gap: 9px; padding: 0 16px; border-bottom: 1px solid var(--border); color: var(--text-secondary); background: color-mix(in srgb, var(--bg-panel) 78%, transparent); }
.worldbook-group-head h3 { margin: 0; color: var(--text-primary); font-size: 14px; }
.worldbook-group-head span { margin-left: auto; color: var(--text-muted); font-size: 12px; }
.worldbook-entry-list { display: grid; }
.worldbook-entry-row { display: flex; justify-content: space-between; gap: 16px; padding: 16px; border-bottom: 1px solid var(--border); transition: background var(--motion-fast) ease, transform var(--motion-fast) ease; animation: listItemIn var(--motion-normal) var(--motion-ease) both; }
.worldbook-entry-row:last-child { border-bottom: 0; }
.worldbook-entry-row:hover { background: var(--bg-panel); transform: translateX(1px); }
.worldbook-entry-main { display: grid; gap: 8px; min-width: 0; }
.worldbook-entry-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.worldbook-entry-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.worldbook-entry-title svg { color: var(--primary); flex: none; }
.worldbook-entry-main p { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.worldbook-description { min-height: 160px; }
.worldbook-group-desc { margin: 0; color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.worldbook-character-picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 8px; max-height: 180px; overflow: auto; padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel); background-image: none; }
.worldbook-character-picker label { min-height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid transparent; border-radius: var(--radius-sm); color: var(--text-secondary); cursor: pointer; }
.worldbook-character-picker label:hover { background: var(--bg-hover); color: var(--text-primary); }
.worldbook-character-picker label.selected { border-color: color-mix(in srgb, var(--primary) 32%, var(--border)); background: var(--primary-light); color: var(--primary); box-shadow: inset 3px 0 0 var(--accent-cinnabar); }
.worldbook-character-picker input { accent-color: var(--primary); }
.timeline-line-tabs { flex-wrap: wrap; }
.timeline-line-hint { margin: -8px 0 16px; color: var(--text-secondary); font-size: 12px; }
.timeline-stream { position: relative; display: grid; gap: 0; margin-top: 2px; }
.timeline-stream::before { content: ""; position: absolute; left: 136px; top: 4px; bottom: 4px; width: 1px; background: linear-gradient(180deg, transparent, var(--border-strong) 8%, var(--border-strong) 92%, transparent); }
.timeline-event-card { position: relative; display: grid; grid-template-columns: 116px 20px minmax(0, 1fr); gap: 10px; padding: 12px 0; animation: listItemIn var(--motion-normal) var(--motion-ease) both; }
.timeline-marker { display: flex; justify-content: flex-end; align-items: flex-start; padding-top: 14px; color: var(--text-muted); font-size: 12px; }
.timeline-marker span { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timeline-dot { position: relative; z-index: 1; width: 11px; height: 11px; margin-top: 18px; border: 2px solid var(--primary); border-radius: 999px; background: var(--accent-cinnabar); box-shadow: 0 0 0 4px var(--primary-light), 0 0 0 7px color-mix(in srgb, var(--accent-cinnabar) 8%, transparent); }
.timeline-event-body { display: grid; gap: 10px; padding: 14px 16px; background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
.timeline-event-body:hover { border-color: color-mix(in srgb, var(--primary) 22%, var(--border)); box-shadow: var(--shadow-popover); transform: translateY(-1px); }
.timeline-event-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.timeline-event-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.timeline-event-title strong { font-size: 15px; }
.timeline-event-head p { margin: 7px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.timeline-event-description { padding-top: 10px; border-top: 1px dashed var(--border); color: var(--text-secondary); font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
.timeline-custom-list { display: flex; flex-wrap: wrap; gap: 7px; }
.timeline-description { min-height: 160px; }

.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 22px; }
.project-card { background: var(--bg-card); background-image: none; border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); overflow: hidden; cursor: pointer; transition: box-shadow var(--motion-normal) ease, transform var(--motion-normal) ease, border-color var(--motion-normal) ease; animation: listItemIn var(--motion-normal) var(--motion-ease) both; }
.project-card:hover { box-shadow: var(--shadow-popover); transform: translateY(-2px); border-color: color-mix(in srgb, var(--primary) 22%, var(--border)); }
.project-cover { height: 120px; background: radial-gradient(circle at 70% 18%, color-mix(in srgb, var(--accent-cinnabar-light) 78%, transparent), transparent 30%), linear-gradient(135deg, var(--primary-light), var(--bg-active)); display: grid; place-items: center; color: var(--primary); font-family: var(--font-serif); font-size: 28px; }
.project-meta { padding: 14px 16px; }
.project-meta .pm-title { font-weight: 600; font-size: 14px; }
.project-meta .pm-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

/* 设置布局 */
.settings-layout { display: grid; grid-template-columns: 200px 1fr; gap: 34px; }
.settings-menu { display: flex; flex-direction: column; gap: 3px; position: sticky; top: 0; }
.settings-menu button { text-align: left; height: 40px; padding: 0 14px; border: 0; background: transparent; color: var(--text-secondary); border-radius: var(--radius-sm); font-size: 13px; transition: background .14s ease, color .14s ease; }
.settings-menu button:hover { background: var(--bg-hover); color: var(--text-primary); }
.settings-menu button.on { background: linear-gradient(90deg, var(--bg-active), var(--bg-card)); color: var(--primary); font-weight: 600; box-shadow: inset 3px 0 0 var(--accent-cinnabar); }
.form-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--border); }
.form-row:last-child { border-bottom: 0; }
.form-row .fr-label { font-size: 13px; }
.form-row .fr-desc { font-size: 12px; color: var(--text-muted); margin-top: 3px; }

/* 关系图占位 */
.graph-canvas { height: calc(100% - 8px); min-height: 440px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: var(--bg-panel); background-image: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--primary-light) 64%, transparent), transparent 50%); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text-muted); }
.graph-panel { min-height: 0; }
.graph-panel-head { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.relations-grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 20px; align-items: stretch; margin-bottom: 20px; }
.graph-controls { display: inline-flex; align-items: center; gap: 6px; }
.graph-legend { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 0 0 12px; color: var(--text-muted); font-size: 12px; }
.graph-legend span { display: inline-flex; align-items: center; gap: 6px; }
.graph-legend-dot { width: 9px; height: 9px; border-radius: 999px; border: 1px solid var(--border-strong); background: var(--bg-card); }
.graph-legend-dot.type-character { background: var(--primary-light); border-color: var(--primary); }
.graph-legend-dot.type-worldbook { background: rgba(91,123,154,.18); border-color: rgba(91,123,154,.65); }
.graph-legend-dot.type-timeline { background: rgba(184,134,11,.18); border-color: rgba(184,134,11,.65); }
.graph-legend-dot.type-knowledge { background: rgba(74,124,89,.18); border-color: rgba(74,124,89,.65); }
.graph-stage { min-height: 460px; border-radius: var(--radius-md); overflow: hidden; background: var(--bg-panel); background-image: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--primary) 10%, transparent), transparent 42%), radial-gradient(circle at 50% 50%, var(--bg-panel), var(--bg-app)); border: 1px solid var(--border); box-shadow: var(--shadow-card); }
.graph-stage.interactive { cursor: grab; user-select: none; }
.graph-stage.interactive:active { cursor: grabbing; }
.graph-svg { width: 100%; height: 520px; display: block; touch-action: none; }
.graph-edge { stroke: var(--border-strong); stroke-width: 2; opacity: .82; transition: opacity .16s ease, stroke .16s ease, stroke-width .16s ease; }
.graph-edge.active { stroke: var(--accent-cinnabar); stroke-width: 3; opacity: 1; }
.graph-edge.dimmed { opacity: .18; }
.graph-edge-label { fill: var(--text-muted); font-size: 11px; text-anchor: middle; pointer-events: none; }
.graph-edge-label.dimmed { opacity: .24; }
.graph-node { cursor: grab; transition: opacity .16s ease; }
.graph-node:active, .graph-node.dragging { cursor: grabbing; }
.graph-node.muted { opacity: .35; }
.graph-node-dot { fill: var(--bg-card); stroke: var(--border-strong); stroke-width: 2; transition: fill .16s ease, stroke .16s ease, stroke-width .16s ease; }
.graph-node.active .graph-node-dot, .graph-node.hovered .graph-node-dot { stroke: var(--accent-cinnabar); stroke-width: 3; filter: drop-shadow(0 5px 12px color-mix(in srgb, var(--primary) 24%, transparent)); }
.graph-node-dot.type-character { fill: var(--primary-light); }
.graph-node-dot.type-worldbook { fill: rgba(91,123,154,.12); }
.graph-node-dot.type-timeline { fill: rgba(184,134,11,.14); }
.graph-node-dot.type-knowledge { fill: rgba(74,124,89,.14); }
.graph-node-dot.type-reference { fill: rgba(156,154,144,.14); }
.graph-node-initial { fill: var(--text-primary); font-size: 13px; font-weight: 700; pointer-events: none; }
.graph-node-label { fill: var(--text-secondary); font-size: 12px; pointer-events: none; }
.graph-side-panel { min-height: 100%; }
.graph-side-panel h3 { margin-bottom: 12px; }
.graph-side-empty { min-height: 180px; display: grid; place-items: center; gap: 10px; color: var(--text-muted); text-align: center; line-height: 1.6; }
.relation-list-card { margin-top: 0; }
.relation-row-actions { width: 90px; display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; flex: none; }
.relation-empty { padding: 28px; color: var(--text-muted); font-size: 13px; text-align: center; }
.relation-editor-modal { width: min(720px, calc(100vw - 48px)); }
.relation-source { min-height: 96px; }

/* 加载 / 空态 */
.empty-icon { color: var(--text-muted); opacity: .8; }
.center-state { flex: 1; min-height: 320px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--text-muted); text-align: center; }
.spinner { width: 26px; height: 26px; border: 2.5px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@keyframes breathe { 0%,100% { opacity: 1; } 50% { opacity: .4; } }

@media (max-width: 1600px) {
  .workspace { grid-template-columns: clamp(224px, 15vw, 248px) minmax(0,1fr) clamp(300px, 21vw, 340px); }
  .editor-scroll { padding-left: clamp(22px, 2.4vw, 38px); padding-right: clamp(22px, 2.4vw, 38px); }
  .editor-workbench { grid-template-columns: minmax(0,1fr); max-width: 820px; }
  .paper { max-width: 820px; }
}

@media (max-width: 1440px) {
  .workspace { grid-template-columns: clamp(232px, 18vw, 252px) minmax(0,1fr) clamp(276px, 21vw, 312px); }
  .tree-head { padding-left: clamp(16px, 1.6vw, 20px); padding-right: clamp(16px, 1.6vw, 20px); }
  .tree-head h2 { white-space: nowrap; font-size: 15.5px; letter-spacing: .01em; }
  .tree-scroll { padding-left: clamp(10px, 1.1vw, 12px); padding-right: clamp(10px, 1.1vw, 12px); }
  .editor-scroll { padding-left: clamp(12px, 1.3vw, 20px); padding-right: clamp(12px, 1.3vw, 20px); }
  .editor-workbench { grid-template-columns: minmax(0,1fr); max-width: 760px; justify-items: stretch; }
  .paper { max-width: 100%; }
  .chat-pane { display: flex; }
}

@media (max-width: 1360px) {
  .workspace { grid-template-columns: clamp(224px, 18vw, 244px) minmax(0,1fr) clamp(240px, 20vw, 280px); }
  .tree-head { min-height: 94px; padding: 28px 16px 12px; }
  .tree-head h2 { font-size: 15px; white-space: nowrap; letter-spacing: 0; }
  .tree-total-words { font-size: 11.5px; }
  .chat-head { min-height: 76px; padding: 24px 16px 14px; }
  .chat-scroll { padding: 16px 14px; }
  .editor-scroll { padding-left: clamp(14px, 1.8vw, 24px); padding-right: clamp(14px, 1.8vw, 24px); }
  .editor-workbench { max-width: min(720px, 100%); }
  .paper { max-width: 100%; }
  .paper-body { padding-left: clamp(34px, 5.2vw, 68px); padding-right: clamp(34px, 5.2vw, 68px); }
}

@media (max-width: 1180px) {
  .workspace { grid-template-columns: clamp(176px, 19vw, 204px) minmax(0,1fr); }
  .workspace > .chat-pane { display: none; }
  .tree-head { min-height: 92px; padding: 20px 14px 10px; gap: 8px; flex-direction: column; align-items: stretch; }
  .tree-head > div:first-child { min-width: 0; }
  .tree-head h2 { font-size: 15px; line-height: 1.32; white-space: nowrap; letter-spacing: 0; }
  .tree-head-actions { justify-content: flex-end; gap: 2px; }
  .tree-scroll { padding-left: 7px; padding-right: 7px; }
  .tree-item { padding-left: 9px; padding-right: 9px; }
  .editor-scroll { padding: 22px clamp(8px, 1.3vw, 14px) 36px; justify-items: stretch; }
  .editor-workbench { max-width: 100%; width: 100%; }
  .paper { max-width: 100%; width: 100%; }
  .paper-toolbar { padding: 10px 10px 8px; gap: 3px; row-gap: 6px; }
  .paper-toolbar .sep,
  .paper-toolbar .grow { display: none; }
  .paper-toolbar .btn-icon { width: 30px; height: 30px; }
  .paper-toolbar .toolbar-action { width: 32px; min-width: 32px; height: 30px; padding: 0; gap: 0; }
  .paper-toolbar .toolbar-action-label { display: none; }
  .paper-toolbar .toolbar-action-polish { width: 34px; min-width: 34px; }
  .editor-mode-switch { margin-left: 4px; }
  .editor-mode-switch button { height: 28px; padding: 0 8px; }
  .paper-body { padding: 40px clamp(18px, 3.4vw, 38px) 56px; }
  .manuscript,
  .rich-editor-shell,
  .source-manuscript {
    max-width: min(700px, 100%);
  }
  .chapter-title { font-size: 32px; }
  .editor-statusbar { gap: 12px; padding-left: 18px; padding-right: 18px; }
  .editor-statusbar .status-metric { display: none; }
  .writing-progress { flex-basis: min(280px, 42vw); min-width: 170px; }
}

@media (max-width: 880px) {
  .workspace { grid-template-columns: clamp(168px, 24vw, 192px) minmax(0,1fr); }
  .workspace > .chat-pane { display: none; }
  .editor-scroll { padding-left: clamp(12px, 2.4vw, 22px); padding-right: clamp(12px, 2.4vw, 22px); }
  .editor-workbench { max-width: min(720px, 100%); }
  .editor-statusbar { gap: 10px; padding-left: 14px; padding-right: 14px; }
  .save-status { min-width: 0; }
  .writing-progress { min-width: 150px; }
}

@media (max-width: 1180px) and (max-height: 760px) {
  .editor-scroll { padding-top: 14px; padding-bottom: 22px; }
  .paper-body { padding-top: 28px; padding-bottom: 42px; }
  .chapter-title { font-size: 28px; line-height: 1.16; }
  .title-rule { margin-top: 12px; margin-bottom: 20px; }
  .manuscript,
  .rich-editor-shell,
  .rich-manuscript {
    min-height: 260px;
  }
}

@media (max-width: 820px) {
  .app-shell,
  .app-shell.app-desktop-layout,
  .app-shell.app-mobile-layout {
    grid-template-columns: 1fr !important;
    grid-template-rows: minmax(0,1fr) !important;
  }
  .rail,
  .app-desktop-layout .rail,
  .app-mobile-layout .rail { display: none !important; }
  .mobile-shell-header {
    display: flex !important;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 14px;
    background: var(--bg-panel);
    background-image: none;
    border-bottom: 1px solid var(--border);
  }
  .mobile-shell-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .mobile-shell-logo { width: 32px; height: 32px; border-radius: 10px; box-shadow: var(--shadow-card); flex: none; }
  .mobile-shell-title { font-family: var(--font-serif); font-size: 17px; line-height: 1.2; }
  .mobile-shell-sub { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
  .mobile-nav {
    display: flex !important;
    gap: 7px;
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    min-height: 74px;
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
    overflow-x: auto;
    background: color-mix(in srgb, var(--bg-panel) 94%, transparent);
    background-image: none;
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--border);
    z-index: 40;
  }
  .mobile-nav-item {
    min-width: 64px;
    height: 50px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg-card);
    background-image: var(--surface-sheen);
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
    background: linear-gradient(180deg, var(--primary-soft), var(--primary-light));
    color: var(--primary);
    border-color: var(--primary-light);
    box-shadow: inset 0 -2px 0 var(--accent-cinnabar);
  }
  .main { min-height: 0; padding-bottom: 74px; }
  .app-shell.app-focus-mode .main { padding-bottom: 0; }
  .app-shell.app-focus-mode .mobile-nav { display: none; }
  .main > .workspace { position: static; inset: auto; width: auto; height: 100%; transform: none; }
  .workspace,
  .app-desktop-layout .workspace,
  .app-mobile-layout .workspace {
    display: flex !important;
    flex-direction: column;
    grid-template-columns: 1fr !important;
    height: 100% !important;
    padding-top: 0;
  }
  .workspace > .tree-panel,
  .workspace > .editor-pane,
  .workspace > .chat-pane { align-self: stretch; height: auto; margin-top: 0; }
  .workspace {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .workspace-mobile-header,
  .app-desktop-layout .workspace-mobile-header,
  .app-mobile-layout .workspace-mobile-header {
    display: block !important;
    padding: 10px 14px 10px;
    background: var(--bg-app);
    background-image: none;
    border-bottom: 1px solid var(--border);
  }
  .workspace > .tree-panel,
  .workspace > .editor-pane,
  .workspace > .chat-pane,
  .app-desktop-layout .workspace > .tree-panel,
  .app-desktop-layout .workspace > .editor-pane,
  .app-desktop-layout .workspace > .chat-pane {
    display: none !important;
    flex: 1;
    min-height: 0;
    margin-top: 0 !important;
    height: auto !important;
  }
  .workspace.mobile-panel-chapters > .tree-panel,
  .workspace.mobile-panel-editor > .editor-pane,
  .workspace.mobile-panel-inspector > .editor-pane,
  .workspace.mobile-panel-chat > .chat-pane,
  .app-desktop-layout .workspace.mobile-panel-chapters > .tree-panel,
  .app-desktop-layout .workspace.mobile-panel-editor > .editor-pane,
  .app-desktop-layout .workspace.mobile-panel-inspector > .editor-pane,
  .app-desktop-layout .workspace.mobile-panel-chat > .chat-pane {
    display: flex !important;
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
  .workspace.mobile-panel-editor .editor-statusbar,
  .workspace.mobile-panel-inspector .editor-statusbar { display: none; }
  .workspace.mobile-panel-editor .editor-scroll,
  .workspace.mobile-panel-inspector .editor-scroll {
    justify-content: stretch;
    padding: 10px 12px 124px;
  }
  .workspace.mobile-panel-editor .paper {
    min-height: min(560px, calc(100dvh - 232px));
  }
  .workspace.mobile-panel-editor .paper-body {
    padding: 22px 20px 36px;
  }
  .workspace.mobile-panel-editor .chapter-title {
    font-size: 27px;
    letter-spacing: .035em;
    text-align: left;
  }
  .workspace.mobile-panel-editor .title-rule {
    margin-left: 0;
    margin-right: 0;
  }
  .workspace.mobile-panel-editor .manuscript,
  .workspace.mobile-panel-editor .rich-editor-shell {
    max-width: 100%;
  }
  .workspace.mobile-panel-editor .rich-manuscript,
  .workspace.mobile-panel-editor .manuscript,
  .workspace.mobile-panel-editor .rich-editor-placeholder {
    font-size: 16px;
    line-height: 1.9;
  }
  .workspace.mobile-panel-editor .paper-toolbar,
  .workspace.mobile-panel-inspector .paper-toolbar {
    height: auto;
    min-height: 0;
    padding: 7px 8px;
    flex-wrap: wrap;
    overflow: visible;
    row-gap: 5px;
  }
  .workspace.mobile-panel-editor .paper-toolbar > *,
  .workspace.mobile-panel-inspector .paper-toolbar > * {
    flex: none;
  }
  .workspace.mobile-panel-editor .paper-toolbar::-webkit-scrollbar,
  .workspace.mobile-panel-inspector .paper-toolbar::-webkit-scrollbar {
    height: 4px;
    display: none;
  }
  .workspace.mobile-panel-editor .paper-toolbar .btn,
  .workspace.mobile-panel-inspector .paper-toolbar .btn,
  .workspace.mobile-panel-editor .paper-toolbar .btn-icon,
  .workspace.mobile-panel-inspector .paper-toolbar .btn-icon {
    height: 30px;
  }
  .workspace.mobile-panel-editor .paper-toolbar .btn:not(.btn-primary):not(.btn-danger),
  .workspace.mobile-panel-inspector .paper-toolbar .btn:not(.btn-primary):not(.btn-danger) {
    width: auto;
    min-width: 72px;
    padding: 0 9px;
    justify-content: center;
    gap: 5px;
    overflow: visible;
    color: inherit;
  }
  .workspace.mobile-panel-editor .paper-toolbar .toolbar-action,
  .workspace.mobile-panel-inspector .paper-toolbar .toolbar-action {
    width: auto;
    min-width: 68px;
    padding: 0 8px;
    gap: 5px;
  }
  .workspace.mobile-panel-editor .paper-toolbar .toolbar-action-polish,
  .workspace.mobile-panel-inspector .paper-toolbar .toolbar-action-polish {
    min-width: 84px;
  }
  .workspace.mobile-panel-editor .paper-toolbar .toolbar-action-label,
  .workspace.mobile-panel-inspector .paper-toolbar .toolbar-action-label {
    display: inline;
  }
  .workspace.mobile-panel-editor .paper-toolbar .editor-mode-switch,
  .workspace.mobile-panel-inspector .paper-toolbar .editor-mode-switch {
    display: inline-flex;
    min-width: max-content;
  }
  .workspace.mobile-panel-editor .paper-toolbar .editor-mode-switch button,
  .workspace.mobile-panel-inspector .paper-toolbar .editor-mode-switch button {
    min-width: 60px;
    padding-left: 8px;
    padding-right: 8px;
    font-size: 12px;
  }
  .editor-statusbar {
    flex-wrap: wrap;
    gap: 8px 14px;
    padding: 10px 14px;
  }
  .editor-statusbar .grow { display: none; }
  .writing-progress {
    order: 3;
    flex: 1 1 100%;
    min-width: 0;
  }
  .workspace.mobile-panel-editor .paper-toolbar .grow,
  .workspace.mobile-panel-inspector .paper-toolbar .grow {
    display: none;
  }
  .quick-lookup-panel {
    right: 10px;
    left: 10px;
    bottom: 92px;
    width: auto;
    max-height: min(620px, calc(100vh - 120px));
  }
  .quick-lookup-detail { padding-left: 12px; }
  .view-head {
    padding: 18px 16px 14px;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .view-title { font-size: 28px; letter-spacing: .045em; }
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
  .relations-grid { grid-template-columns: 1fr; }
  .graph-stage { min-height: 360px; }
  .graph-svg { height: 360px; }
  .split-layout, .detail-grid, .form-grid-2, .form-grid-3 { grid-template-columns: 1fr; }
  .hero-card, .editor-card-head { flex-direction: column; }
  .project-inline-field { width: 100%; }
  .project-inline-field .input { width: 100%; }
  .vault-modal { width: min(100%, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 22px 20px; }
  .character-template-modal,
  .character-assist-modal,
  .character-ai-create-modal,
  .agent-modal,
  .character-modal,
  .relation-editor-modal { width: min(100%, calc(100vw - 24px)); }
  .character-template-grid { grid-template-columns: 1fr; }
  .character-template-card-wide { grid-column: auto; }
}

@media (max-width: 820px) and (max-height: 820px) {
  .mobile-shell-header { padding-top: 7px; padding-bottom: 7px; }
  .workspace-mobile-header { padding-top: 8px; padding-bottom: 8px; }
  .workspace-mobile-title { font-size: 18px; }
  .workspace-mobile-sub { margin-top: 2px; }
  .workspace-mobile-tabs { margin-top: 8px; }
  .workspace.mobile-panel-editor .editor-scroll,
  .workspace.mobile-panel-inspector .editor-scroll {
    padding-top: 8px;
    padding-bottom: 14px;
  }
  .workspace.mobile-panel-editor .paper {
    min-height: min(480px, calc(100dvh - 216px));
  }
  .workspace.mobile-panel-editor .paper-body {
    padding: 18px 18px 28px;
  }
  .workspace.mobile-panel-editor .chapter-title {
    font-size: 24px;
    line-height: 1.18;
  }
  .workspace.mobile-panel-editor .title-rule {
    margin-top: 14px;
    margin-bottom: 24px;
  }
}

@media (max-height: 700px) {
  .app-mobile-layout .mobile-shell-header {
    display: none;
  }
  .app-mobile-layout .workspace-mobile-header {
    padding: 8px 12px;
  }
  .app-mobile-layout .workspace-mobile-summary {
    display: none;
  }
  .app-mobile-layout .workspace-mobile-tabs {
    margin-top: 0;
  }
  .app-mobile-layout .mobile-nav {
    min-height: 66px;
    padding-top: 6px;
    padding-bottom: calc(6px + env(safe-area-inset-bottom));
  }
  .app-mobile-layout .mobile-nav-item {
    height: 46px;
  }
  .app-mobile-layout .workspace.mobile-panel-editor .editor-scroll,
  .app-mobile-layout .workspace.mobile-panel-inspector .editor-scroll {
    padding-top: 8px;
    padding-bottom: 118px;
  }
}

.app-mobile-layout .workspace.mobile-panel-editor > .editor-pane,
.app-mobile-layout .workspace.mobile-panel-inspector > .editor-pane {
  overflow: hidden;
}

.app-mobile-layout .workspace.mobile-panel-editor .editor-scroll,
.app-mobile-layout .workspace.mobile-panel-inspector .editor-scroll {
  overflow: auto;
  padding-bottom: 16px;
}

/* Theme surfaces: every theme uses one global image layer and translucent app surfaces. */
.rail,
.mobile-shell-header,
.mobile-nav {
  background-color: var(--surface-rail-glass);
  background-image: none;
  backdrop-filter: var(--surface-blur);
}

.tree-panel,
.chat-pane,
.workspace-mobile-header,
.paper-toolbar,
.editor-statusbar,
.chat-input {
  background-color: var(--surface-panel-glass);
  background-image: none;
  backdrop-filter: var(--surface-blur);
}

.workspace > .tree-panel,
.workspace > .chat-pane {
  background-color: color-mix(in srgb, var(--surface-panel-glass) 70%, var(--bg-panel));
}

.paper {
  background-color: var(--surface-paper-glass);
  background-image: none;
  backdrop-filter: var(--surface-blur);
}

.paper-body,
.rich-editor-shell,
.source-manuscript {
  background-image: none;
  background-blend-mode: normal;
}

.list-card,
.info-card,
.hero-card,
.editor-card,
.character-card,
.character-template-card,
.character-editor-top,
.character-accordion-item,
.worldbook-group,
.worldbook-character-picker,
.timeline-event-body,
.project-card,
.vault-card,
.vault-modal,
.quick-lookup-panel,
.outline-popover,
.custom-select-menu,
.graph-stage,
.graph-canvas,
.review-report-card,
.agent-switch-row,
.agent-tag-input,
.agent-scope-option,
.model-advanced-panel,
.stats-inline-item,
.permission-chip,
.result-card,
.inspector-feedback,
.mini-card,
.quote-line,
.run-inline,
.msg.ai .msg-bubble {
  background-color: var(--surface-card-glass);
  background-image: none;
  backdrop-filter: var(--surface-blur);
}

.input,
.textarea,
.btn,
.segmented,
.search,
.custom-select-trigger,
.tree-search-field,
.quick-lookup-search,
.chat-input-box,
.tree-create-menu,
.tree-context-menu,
.character-project-button,
.character-project-menu,
.view-toggle,
.worldbook-origin-tabs,
.tab-strip button,
.quick-lookup-item,
.quick-lookup-item.expanded,
.search-result-item {
  background-color: var(--surface-control-glass);
  background-image: none;
  backdrop-filter: var(--surface-control-blur);
}

.btn.btn-primary {
  background-color: var(--primary);
  background-image: linear-gradient(180deg, color-mix(in srgb, var(--primary) 88%, var(--surface-inset-highlight)), var(--primary-hover));
  border-color: var(--primary-hover);
  color: var(--text-on-primary);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--surface-inset-highlight) 68%, transparent) inset, 0 8px 18px color-mix(in srgb, var(--primary) 22%, transparent);
}

.btn.btn-primary:hover {
  background-color: var(--primary-hover);
  background-image: linear-gradient(180deg, var(--primary-hover), color-mix(in srgb, var(--primary-hover) 84%, var(--primary-ink)));
  border-color: var(--primary-deep);
  color: var(--text-on-primary);
}

.btn.btn-primary:active {
  background-color: var(--primary-hover);
  color: var(--text-on-primary);
}

.paper-toolbar .btn.btn-primary,
.paper-toolbar .btn.btn-primary:hover,
.paper-toolbar .btn.btn-primary:active {
  color: var(--text-on-primary);
}

.paper-toolbar,
.editor-statusbar,
.chat-input,
.mobile-shell-header,
.mobile-nav,
.workspace-mobile-header {
  background-color: var(--surface-toolbar-glass);
}

body,
body::before,
body::after,
.rail,
.tree-panel,
.chat-pane,
.mobile-shell-header,
.mobile-nav,
.workspace-mobile-header,
.paper,
.paper-toolbar,
.editor-statusbar,
.chat-input,
.list-card,
.info-card,
.hero-card,
.editor-card,
.character-card,
.character-template-card,
.character-editor-top,
.character-accordion-item,
.worldbook-group,
.worldbook-character-picker,
.timeline-event-body,
.project-card,
.vault-card,
.vault-modal,
.quick-lookup-panel,
.outline-popover,
.review-report-card,
.custom-select-menu,
.agent-switch-row,
.agent-tag-input,
.agent-scope-option,
.model-advanced-panel,
.stats-inline-item,
.permission-chip,
.result-card,
.inspector-feedback,
.mini-card,
.quote-line,
.run-inline,
.msg.ai .msg-bubble,
.graph-stage,
.graph-canvas,
.input,
.textarea,
.btn,
.segmented,
.search,
.custom-select-trigger,
.tree-search-field,
.quick-lookup-search,
.chat-input-box,
.tree-create-menu,
.tree-context-menu,
.character-project-button,
.character-project-menu,
.view-toggle,
.worldbook-origin-tabs,
.tab-strip button,
.quick-lookup-item,
.quick-lookup-item.expanded,
.search-result-item {
  transition: background-color .32s ease, border-color .32s ease, color .32s ease, box-shadow .32s ease, opacity .32s ease, filter .32s ease, transform var(--motion-normal) ease;
}

/* Prevent desktop and mobile chrome from mixing near the breakpoint under
   browser zoom or Windows display scaling. */
@media (min-width: 821px) {
  .app-desktop-layout .mobile-shell-header,
  .app-desktop-layout .mobile-nav,
  .app-desktop-layout .workspace-mobile-header {
    display: none !important;
  }
}

@media (max-width: 820px) {
  .app-mobile-layout .rail {
    display: none !important;
  }
}

@keyframes themeBackdropFade {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes surfaceFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes pageEnter {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes pageFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes listItemIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes backdropIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes modalIn {
  from { opacity: 0; transform: translate3d(0, 8px, 0) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes popoverIn {
  from { opacity: 0; transform: translateY(-4px) scale(.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes toastIn {
  from { opacity: 0; transform: translateY(-8px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes skeletonShimmer {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`;
