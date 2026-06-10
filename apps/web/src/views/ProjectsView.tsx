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
  const [creating, setCreating] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listProjects();
      setProjects(list);
    } catch (err) {
      setProjects([]);
      setError(err instanceof ApiError ? err.message : "项目加载失败");
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    const title = window.prompt("请输入项目名称")?.trim();
    if (!title) {
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const created = await api.createProject(title);
      await loadProjects();
      onOpenProject?.(created.projectId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "新建项目失败");
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  return (
    <ViewShell
      title="项目"
      subtitle="管理你的系列与小说项目，每个项目独立维护正文、规则与资料"
      actions={
        <button type="button" className="btn btn-primary" disabled={creating} onClick={() => void createProject()}>
          <FolderPlus size={15} strokeWidth={2} />
          {creating ? "新建中..." : "新建项目"}
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
          onClick={() => void createProject()}
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
