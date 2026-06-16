import { useEffect, useState } from "react";
import { BookOpenText, CheckCircle2, Feather, FolderOpen, FolderPlus, ImagePlus, LibraryBig, ListChecks, ListTree, PenLine, Plus, ShieldCheck, Sparkles, Wand2 } from "lucide-react";

import { api, ApiError, type ProjectSummary } from "../api/client.js";
import { InputModal } from "../app/Modals.js";
import { ViewShell } from "./common.js";

interface ProjectsViewProps {
  onOpenProject?: (projectId: string) => void;
  forceWelcome?: boolean;
  showEmptyWelcome?: boolean;
  onWelcomeSeen?: () => void;
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

function WelcomeView({
  onCreateProject,
  onSkip,
  creating,
}: {
  onCreateProject: () => void;
  onSkip: () => void;
  creating: boolean;
}) {
  const flow = [
    { icon: FolderPlus, title: "建项目", text: "先开一本书" },
    { icon: LibraryBig, title: "填设定", text: "角色、世界观、大纲" },
    { icon: Sparkles, title: "AI 协作", text: "围绕你的设定写" },
    { icon: Wand2, title: "质检润色", text: "查矛盾、打磨文字" },
    { icon: CheckCircle2, title: "定稿", text: "沉淀成稿件" },
  ];
  const features = [
    { icon: ListTree, title: "剧情大纲", text: "规划分卷、章节、关键事件。" },
    { icon: BookOpenText, title: "设定库", text: "管理角色、世界观、时间线、关系。" },
    { icon: PenLine, title: "写作", text: "AI 协作写正文，选中即可改写润色。" },
    { icon: ShieldCheck, title: "规则/技能", text: "定制 AI 写作规范和工作流。" },
    { icon: ListChecks, title: "质检/润色", text: "帮你查矛盾、修语病、磨节奏。" },
  ];
  const strengths = [
    { icon: ShieldCheck, text: "数据在你本地 —— 不上云、不订阅、隐私自主" },
    { icon: LibraryBig, text: "AI 真读你的设定 —— 基于角色和世界观创作" },
    { icon: Feather, text: "为认真写作者打造 —— 质检门禁、设定驱动流程" },
  ];

  return (
    <section className="welcome-panel">
      <div className="welcome-hero">
        <div>
          <h2>书灵阁</h2>
          <p>设定驱动的 AI 小说创作工具 —— 用你自己的设定，让 AI 写出不跑偏的小说。</p>
        </div>
        <div className="welcome-actions">
          <button type="button" className="btn btn-primary" disabled={creating} onClick={onCreateProject}>
            <FolderPlus size={15} strokeWidth={2} />
            {creating ? "创建中..." : "创建第一个项目"}
          </button>
          <button type="button" className="btn" onClick={onSkip}>
            先随便看看
          </button>
        </div>
      </div>

      <div className="welcome-flow" aria-label="创作流程">
        {flow.map((item) => {
          const Icon = item.icon;
          return (
            <div className="welcome-flow-step" key={item.title}>
              <Icon size={18} strokeWidth={1.8} />
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </div>
          );
        })}
      </div>

      <div className="welcome-feature-grid">
        {features.map((item) => {
          const Icon = item.icon;
          return (
            <article className="welcome-feature-card" key={item.title}>
              <Icon size={18} strokeWidth={1.8} />
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="welcome-strengths">
        {strengths.map((item) => {
          const Icon = item.icon;
          return (
            <div className="welcome-strength" key={item.text}>
              <Icon size={16} strokeWidth={1.9} />
              <span>{item.text}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ProjectsView({ onOpenProject, forceWelcome = false, showEmptyWelcome = false, onWelcomeSeen }: ProjectsViewProps = {}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [coverUploadingId, setCoverUploadingId] = useState<string | null>(null);
  const [welcomeSkipped, setWelcomeSkipped] = useState(false);

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

  const openCreateProject = () => {
    setShowCreateModal(true);
    onWelcomeSeen?.();
  };

  const skipWelcome = () => {
    setWelcomeSkipped(true);
    onWelcomeSeen?.();
  };
  const showWelcome = !loading && !error && !welcomeSkipped && (forceWelcome || (projects.length === 0 && showEmptyWelcome));

  return (
    <ViewShell
      title="项目"
      subtitle="管理你的系列与小说项目，每个项目独立维护正文、规则与资料"
      actions={
        <button type="button" className="btn btn-primary" disabled={creating} onClick={openCreateProject}>
          <FolderPlus size={15} strokeWidth={2} />
          {creating ? "新建中..." : "新建项目"}
        </button>
      }
    >
      <div className={`card-grid ${showWelcome ? "project-grid-hidden" : ""}`}>
        {loading ? <div className="empty-card">项目加载中...</div> : null}
        {error ? <div className="err-card">{error}</div> : null}
        {!loading && !error && projects.length === 0 && (!forceWelcome || welcomeSkipped) ? (
          <div className="empty-card">还没有项目。</div>
        ) : null}
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
                  {coverUploadingId === project.projectId ? "保存中" : "设置封面"}
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
        <button
          type="button"
          className="project-card project-create-card"
          onClick={openCreateProject}
        >
          <span>
            <Plus size={26} strokeWidth={1.5} />
            <span>新建项目</span>
          </span>
        </button>
      </div>
      {showWelcome ? (
        <WelcomeView creating={creating} onCreateProject={openCreateProject} onSkip={skipWelcome} />
      ) : null}
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
