import { FolderPlus, Plus } from "lucide-react";

import { ViewShell } from "./common.js";

// 项目库：项目列表 API 后续补齐；先展示当前 demo 项目与新建入口。
const DEMO_PROJECTS = [
  { id: "demo-series", title: "鬼灭同人系列", sub: "18 章 · 234,567 字" },
];

export function ProjectsView() {
  return (
    <ViewShell
      title="项目"
      subtitle="管理你的系列与小说项目，每个项目独立维护正文、规则与资料"
      actions={
        <button type="button" className="btn btn-primary">
          <FolderPlus size={15} strokeWidth={2} />
          新建项目
        </button>
      }
    >
      <div className="card-grid">
        {DEMO_PROJECTS.map((p) => (
          <div className="project-card" key={p.id}>
            <div className="project-cover">{p.title.slice(0, 2)}</div>
            <div className="project-meta">
              <div className="pm-title">{p.title}</div>
              <div className="pm-sub">{p.sub}</div>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="project-card"
          style={{ display: "grid", placeItems: "center", minHeight: 196, color: "var(--text-muted)" }}
        >
          <span style={{ display: "grid", placeItems: "center", gap: 8 }}>
            <Plus size={26} strokeWidth={1.5} />
            <span>新建项目</span>
          </span>
        </button>
      </div>
    </ViewShell>
  );
}
