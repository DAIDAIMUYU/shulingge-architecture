import { useEffect, useState } from "react";
import { FolderPlus, Plus } from "lucide-react";

import { api, ApiError, type ProjectSummary } from "../api/client.js";
import { InputModal } from "../app/Modals.js";
import { EmptyState, LoadingState, showToast, ViewShell } from "./common.js";

interface ProjectsViewProps {
  onOpenProject?: (projectId: string) => void;
}

export function ProjectsView({ onOpenProject }: ProjectsViewProps = {}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listProjects();
      setProjects(list);
    } catch (err) {
      setProjects([]);
      setError(err instanceof ApiError ? err.message : "项目加载失败");
      showToast(err instanceof ApiError ? err.message : "项目加载失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (title: string) => {
    setShowCreateModal(false);
    setCreating(true);
    setError(null);
    try {
      const created = await api.createProject(title);
      await loadProjects();
      showToast(`项目「${created.title}」已创建`, "success");
      onOpenProject?.(created.projectId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "新建项目失败");
      showToast(err instanceof ApiError ? err.message : "新建项目失败", "error");
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
        <button type="button" className="btn btn-primary" disabled={creating} onClick={() => setShowCreateModal(true)}>
          <FolderPlus size={15} strokeWidth={2} />
          {creating ? "新建中..." : "新建项目"}
        </button>
      }
    >
      <div className="card-grid">
        {loading ? <LoadingState text="正在加载项目…" /> : null}
        {error ? <EmptyState icon={FolderPlus} tone="error" title="项目加载失败" description={error} actionLabel="重试" onAction={() => void loadProjects()} /> : null}
        {!loading && !error && projects.length === 0 ? (
          <EmptyState icon={FolderPlus} title="还没有项目" description="先创建一本书，角色、世界大纲、时间线和规则都会归到项目里。" actionLabel="新建第一个项目" onAction={() => setShowCreateModal(true)} />
        ) : null}
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
          onClick={() => setShowCreateModal(true)}
          style={{ display: "grid", placeItems: "center", minHeight: 196, color: "var(--text-muted)" }}
        >
          <span style={{ display: "grid", placeItems: "center", gap: 8 }}>
            <Plus size={26} strokeWidth={1.5} />
            <span>新建项目</span>
          </span>
        </button>
      </div>
      {showCreateModal ? (
        <InputModal
          title="新建项目"
          placeholder="请输入项目名称"
          defaultValue="新项目"
          onConfirm={(title) => void createProject(title)}
          onCancel={() => setShowCreateModal(false)}
        />
      ) : null}
    </ViewShell>
  );
}
