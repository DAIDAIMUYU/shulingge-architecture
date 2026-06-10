import { useEffect, useState } from "react";
import { FolderPlus, Plus } from "lucide-react";

import { api, ApiError, type ProjectSummary } from "../api/client.js";
import { ViewShell } from "./common.js";

interface ProjectsViewProps {
  onOpenProject?: (projectId: string) => void;
}

export function ProjectsView({ onOpenProject }: ProjectsViewProps = {}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await api.listProjects();
        if (alive) {
          setProjects(list);
        }
      } catch (err) {
        if (alive) {
          setProjects([]);
          setError(err instanceof ApiError ? err.message : "项目加载失败");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

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
        {loading ? <div className="empty-card">项目加载中...</div> : null}
        {error ? <div className="err-card">{error}</div> : null}
        {!loading && !error && projects.length === 0 ? <div className="empty-card">还没有项目。</div> : null}
        {projects.map((project) => (
          <button
            type="button"
            className="project-card"
            key={project.projectId}
            onClick={() => onOpenProject?.(project.projectId)}
          >
            <div className="project-cover">{project.title.slice(0, 2)}</div>
            <div className="project-meta">
              <div className="pm-title">{project.title}</div>
              <div className="pm-sub">{project.projectId}</div>
            </div>
          </button>
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
