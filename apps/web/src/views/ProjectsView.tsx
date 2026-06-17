import { useEffect, useState } from "react";
import { FolderOpen, FolderPlus, ImagePlus, Plus } from "lucide-react";

import { api, ApiError, type ProjectSummary } from "../api/client.js";
import { InputModal } from "../app/Modals.js";
import { ViewShell } from "./common.js";

interface ProjectsViewProps {
  onOpenProject?: (projectId: string) => void;
}

const MAX_PROJECT_COVER_BYTES = 5 * 1024 * 1024;
const PROJECT_COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PROJECT_COVER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("封面图片读取失败"));
    reader.readAsDataURL(file);
  });
}

export function ProjectsView({ onOpenProject }: ProjectsViewProps = {}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [coverUploadingId, setCoverUploadingId] = useState<string | null>(null);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await api.listProjects());
    } catch (err) {
      setProjects([]);
      setError(err instanceof ApiError ? err.message : "项目加载失败");
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

  const updateCover = async (project: ProjectSummary, file: File | undefined) => {
    if (!file) {
      return;
    }

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!PROJECT_COVER_TYPES.has(file.type) && !PROJECT_COVER_EXTENSIONS.has(extension)) {
      setError("封面仅支持 JPG、PNG、WebP 图片");
      return;
    }
    if (file.size > MAX_PROJECT_COVER_BYTES) {
      setError("封面图片需小于 5MB");
      return;
    }

    setCoverUploadingId(project.projectId);
    setError(null);
    try {
      const contentBase64 = await readFileAsBase64(file);
      const updated = await api.updateProjectCover(project.projectId, {
        fileName: file.name,
        mimeType: file.type,
        contentBase64,
      });
      setProjects((current) => current.map((item) => item.projectId === updated.projectId ? { ...item, ...updated } : item));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "封面保存失败");
    } finally {
      setCoverUploadingId(null);
    }
  };

  const openCreateProject = () => setShowCreateModal(true);

  return (
    <ViewShell
      title="项目"
      subtitle="管理你的系列与小说项目，每个项目独立维护正文、规则与资料。"
      actions={
        <button type="button" className="btn btn-primary" disabled={creating} onClick={openCreateProject}>
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
          <article className="project-card" key={project.projectId}>
            <button type="button" className="project-open" onClick={() => onOpenProject?.(project.projectId)}>
              <div className="project-cover">
                {project.coverDataUrl ? <img src={project.coverDataUrl} alt={`${project.title} 封面`} /> : <span>{project.title.slice(0, 2)}</span>}
              </div>
            </button>
            <div className="project-meta">
              <div className="pm-title">{project.title}</div>
              <div className="project-card-actions">
                <button type="button" className="btn btn-ghost" onClick={() => onOpenProject?.(project.projectId)}>
                  <FolderOpen size={14} strokeWidth={1.8} />
                  打开项目
                </button>
                <label className={`project-cover-action ${coverUploadingId === project.projectId ? "disabled" : ""}`}>
                  <ImagePlus size={14} strokeWidth={1.8} />
                  {coverUploadingId === project.projectId ? "保存中..." : "设置封面"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={coverUploadingId === project.projectId}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      void updateCover(project, file);
                    }}
                  />
                </label>
              </div>
            </div>
          </article>
        ))}
        <button type="button" className="project-card project-create-card" onClick={openCreateProject}>
          <span>
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
