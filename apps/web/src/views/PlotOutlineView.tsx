import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Columns3,
  FilePlus2,
  List,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { api, ApiError, type NovelSummary, type ProjectSummary, type VolumeInput, type VolumeRecord, type VolumeStatus } from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { ProjectSelector } from "./ProjectSelector.js";
import { Select } from "./Select.js";
import { ViewShell } from "./common.js";

type FeedbackKind = "success" | "error" | "info";
type FeedbackState = { kind: FeedbackKind; message: string };
type PlotViewMode = "strip" | "table";

interface VolumeDraft {
  title: string;
  status: VolumeStatus;
  positioning: string;
  themes: string;
  keyPoints: string;
  notes: string;
}

interface ChapterDraft {
  title: string;
  volumeId: string;
}

const PROJECT_STORAGE_KEY = "shulingge.web.plotOutline.projectId";
const VIEW_STORAGE_KEY = "shulingge.web.plotOutline.viewMode";
const NO_VOLUME = "__none__";

const STATUS_OPTIONS: Array<{ value: VolumeStatus; label: string; hint: string }> = [
  { value: "draft", label: "草稿", hint: "还在构思和调整" },
  { value: "finalized", label: "已定案", hint: "作为后续章节规划依据" },
];

function readStoredProjectId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(PROJECT_STORAGE_KEY) ?? window.localStorage.getItem("shulingge.web.projectId") ?? "";
}

function readStoredViewMode(): PlotViewMode {
  if (typeof window === "undefined") {
    return "strip";
  }
  const value = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return value === "table" ? "table" : "strip";
}

function writeStoredProjectId(projectId: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROJECT_STORAGE_KEY, projectId);
    window.localStorage.setItem("shulingge.web.projectId", projectId);
  }
}

function writeStoredViewMode(mode: PlotViewMode): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
  }
}

function statusLabel(status: VolumeStatus | undefined): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "草稿";
}

function createDraft(volume?: VolumeRecord): VolumeDraft {
  return {
    title: volume?.title ?? "",
    status: volume?.status ?? "draft",
    positioning: volume?.positioning ?? "",
    themes: volume?.themes ?? "",
    keyPoints: volume?.keyPoints ?? "",
    notes: volume?.notes ?? "",
  };
}

function toPayload(draft: VolumeDraft): VolumeInput {
  return {
    title: draft.title.trim(),
    status: draft.status,
    positioning: draft.positioning.trim(),
    themes: draft.themes.trim(),
    keyPoints: draft.keyPoints.trim(),
    notes: draft.notes.trim(),
  };
}

function compactText(value: string | undefined, fallback = "未填写摘要"): string {
  const normalized = (value ?? "").split(/\n+/).map((line) => line.trim()).filter(Boolean).join(" / ");
  return normalized || fallback;
}

function volumeSummary(volume: VolumeRecord): string {
  return compactText(volume.positioning || volume.themes || volume.keyPoints);
}

function ChapterCreateModal({
  draft,
  volumes,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: ChapterDraft;
  volumes: VolumeRecord[];
  saving: boolean;
  onChange(patch: Partial<ChapterDraft>): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const volumeOptions = [
    { value: NO_VOLUME, label: "不归属分卷", hint: "直接在当前小说下新建章节" },
    ...volumes.map((volume) => ({ value: volume.id, label: volume.title, hint: statusLabel(volume.status) })),
  ];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="vault-modal-backdrop" onMouseDown={onCancel}>
      <form className="vault-modal input-modal plot-chapter-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <h2>新建章节</h2>
        <label className="form-block">
          <span>章节名</span>
          <input
            className="input"
            value={draft.title}
            autoFocus
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="例如 第一章 破局"
          />
        </label>
        <label className="form-block">
          <span>归属分卷</span>
          <Select
            value={draft.volumeId}
            options={volumeOptions}
            onChange={(value) => onChange({ volumeId: value })}
            ariaLabel="归属分卷"
          />
        </label>
        <div className="vault-modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "创建中..." : "创建章节"}</button>
        </div>
      </form>
    </div>
  );
}

export function PlotOutlineView() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [novels, setNovels] = useState<NovelSummary[]>([]);
  const [projectId, setProjectId] = useState(readStoredProjectId);
  const [novelId, setNovelId] = useState("");
  const [volumes, setVolumes] = useState<VolumeRecord[]>([]);
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VolumeDraft>(() => createDraft());
  const [chapterDraft, setChapterDraft] = useState<ChapterDraft>({ title: "新章节", volumeId: NO_VOLUME });
  const [viewMode, setViewMode] = useState<PlotViewMode>(readStoredViewMode);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingChapter, setCreatingChapter] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VolumeRecord | null>(null);
  const newMenuRef = useRef<HTMLDivElement | null>(null);

  const selectedVolume = useMemo(
    () => volumes.find((volume) => volume.id === selectedVolumeId) ?? null,
    [selectedVolumeId, volumes],
  );
  const sortedVolumes = useMemo(
    () => [...volumes].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title)),
    [volumes],
  );

  useEffect(() => {
    if (!newMenuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target as Node)) {
        setNewMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNewMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [newMenuOpen]);

  async function loadProjects() {
    setLoading(true);
    setFeedback(null);
    try {
      const list = await api.listProjects();
      setProjects(list);
      const resolvedProjectId = list.some((project) => project.projectId === projectId)
        ? projectId
        : list[0]?.projectId ?? "";
      if (resolvedProjectId !== projectId) {
        setProjectId(resolvedProjectId);
        if (resolvedProjectId) {
          writeStoredProjectId(resolvedProjectId);
        }
      }
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "项目列表加载失败" });
    } finally {
      setLoading(false);
    }
  }

  async function loadNovels(nextProjectId = projectId) {
    if (!nextProjectId) {
      setNovels([]);
      setNovelId("");
      setVolumes([]);
      return;
    }
    try {
      const list = await api.listNovels(nextProjectId);
      setNovels(list);
      setNovelId((current) => current && list.some((novel) => novel.novelId === current) ? current : list[0]?.novelId ?? "");
    } catch (error) {
      setNovels([]);
      setNovelId("");
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "小说列表加载失败" });
    }
  }

  async function loadVolumes(nextProjectId = projectId, nextNovelId = novelId) {
    if (!nextProjectId || !nextNovelId) {
      setVolumes([]);
      setSelectedVolumeId(null);
      setDraft(createDraft());
      return;
    }
    setLoading(true);
    try {
      const list = await api.listVolumes(nextProjectId, nextNovelId);
      setVolumes(list);
      setSelectedVolumeId((current) => current && list.some((volume) => volume.id === current) ? current : list[0]?.id ?? null);
    } catch (error) {
      setVolumes([]);
      setSelectedVolumeId(null);
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "分卷大纲加载失败" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    void loadNovels(projectId);
  }, [projectId]);

  useEffect(() => {
    void loadVolumes(projectId, novelId);
  }, [projectId, novelId]);

  useEffect(() => {
    setDraft(createDraft(selectedVolume ?? undefined));
  }, [selectedVolume?.id]);

  function changeViewMode(mode: PlotViewMode) {
    setViewMode(mode);
    writeStoredViewMode(mode);
  }

  function startCreateVolume() {
    setNewMenuOpen(false);
    setSelectedVolumeId(null);
    setDraft(createDraft());
    setFeedback(null);
  }

  function startCreateChapter() {
    setNewMenuOpen(false);
    setChapterDraft({ title: "新章节", volumeId: selectedVolumeId ?? NO_VOLUME });
    setChapterModalOpen(true);
    setFeedback(null);
  }

  async function saveVolume() {
    if (!projectId || !novelId) {
      setFeedback({ kind: "error", message: "请先选择项目和小说" });
      return;
    }
    const payload = toPayload(draft);
    if (!payload.title) {
      setFeedback({ kind: "error", message: "请填写卷名" });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const saved = selectedVolume
        ? await api.updateVolume(projectId, novelId, selectedVolume.id, payload)
        : await api.createVolume(projectId, novelId, payload);
      const list = await api.listVolumes(projectId, novelId);
      setVolumes(list);
      setSelectedVolumeId(saved.id);
      setFeedback({ kind: "success", message: selectedVolume ? "分卷大纲已保存" : "分卷大纲已创建" });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "分卷保存失败" });
    } finally {
      setSaving(false);
    }
  }

  async function createChapter() {
    if (!projectId || !novelId) {
      setFeedback({ kind: "error", message: "请先选择项目和小说" });
      return;
    }
    const title = chapterDraft.title.trim();
    if (!title) {
      setFeedback({ kind: "error", message: "请填写章节名" });
      return;
    }

    setCreatingChapter(true);
    try {
      const volumeId = chapterDraft.volumeId === NO_VOLUME ? undefined : chapterDraft.volumeId;
      const chapter = await api.createChapter(projectId, novelId, title, volumeId);
      setChapterModalOpen(false);
      setFeedback({ kind: "success", message: `章节「${chapter.title}」已创建` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "章节创建失败" });
    } finally {
      setCreatingChapter(false);
    }
  }

  async function deleteVolume(volume: VolumeRecord) {
    if (!projectId || !novelId) {
      return;
    }
    setDeleteTarget(null);
    try {
      await api.deleteVolume(projectId, novelId, volume.id);
      const list = await api.listVolumes(projectId, novelId);
      setVolumes(list);
      setSelectedVolumeId(list[0]?.id ?? null);
      setFeedback({ kind: "success", message: `分卷「${volume.title}」已删除` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "分卷删除失败" });
    }
  }

  async function moveVolume(volume: VolumeRecord, direction: -1 | 1) {
    if (!projectId || !novelId) {
      return;
    }
    const index = sortedVolumes.findIndex((item) => item.id === volume.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sortedVolumes.length) {
      return;
    }
    const next = [...sortedVolumes];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    try {
      const updated = await api.reorderVolumes(projectId, novelId, next.map((item) => item.id));
      setVolumes(updated);
      setSelectedVolumeId(volume.id);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "分卷排序失败" });
    }
  }

  function renderVolumeActions(volume: VolumeRecord, index: number) {
    return (
      <div className="plot-volume-actions">
        <button type="button" className="btn-icon" title="上移" disabled={index === 0} onClick={(event) => {
          event.stopPropagation();
          void moveVolume(volume, -1);
        }}>
          <ArrowUp size={15} />
        </button>
        <button type="button" className="btn-icon" title="下移" disabled={index === sortedVolumes.length - 1} onClick={(event) => {
          event.stopPropagation();
          void moveVolume(volume, 1);
        }}>
          <ArrowDown size={15} />
        </button>
        <button type="button" className="btn-icon" title="编辑" onClick={(event) => {
          event.stopPropagation();
          setSelectedVolumeId(volume.id);
        }}>
          <Pencil size={15} />
        </button>
        <button type="button" className="btn-icon danger" title="删除" onClick={(event) => {
          event.stopPropagation();
          setDeleteTarget(volume);
        }}>
          <Trash2 size={15} />
        </button>
      </div>
    );
  }

  return (
    <ViewShell title="剧情大纲" subtitle="先搭好分卷大纲：明确每卷定位、主题和重点；也可以不分卷，直接新建章节开始写">
      <div className="plot-layout">
        <section className="editor-card plot-index-card">
          <div className="editor-card-head">
            <div>
              <h2>分卷大纲索引</h2>
              <p className="view-sub">当前小说共 {volumes.length} 卷。默认横条视图便于一眼扫过卷名、状态和摘要。</p>
            </div>
            <div className="plot-head-actions">
              <div className="view-toggle" aria-label="分卷视图切换">
                <button type="button" className={viewMode === "strip" ? "on" : ""} title="横条视图" onClick={() => changeViewMode("strip")}>
                  <List size={15} />
                </button>
                <button type="button" className={viewMode === "table" ? "on" : ""} title="表格视图" onClick={() => changeViewMode("table")}>
                  <Columns3 size={15} />
                </button>
              </div>
              <div className="plot-create-wrap" ref={newMenuRef}>
                <button type="button" className="btn btn-primary" disabled={!projectId || !novelId} onClick={() => setNewMenuOpen((value) => !value)}>
                  <Plus size={15} strokeWidth={2} />
                  新建
                  <ChevronDown size={14} strokeWidth={1.8} />
                </button>
                {newMenuOpen ? (
                  <div className="plot-create-menu" role="menu">
                    <button type="button" role="menuitem" onClick={startCreateVolume}>
                      <Plus size={14} />
                      新建分卷
                    </button>
                    <button type="button" role="menuitem" onClick={startCreateChapter}>
                      <FilePlus2 size={14} />
                      新建章节
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="plot-select-row">
            <ProjectSelector projects={projects} projectId={projectId} disabled={loading} onChange={(nextProjectId) => {
              setProjectId(nextProjectId);
              setNovelId("");
              setVolumes([]);
              setSelectedVolumeId(null);
              setDraft(createDraft());
              writeStoredProjectId(nextProjectId);
            }} />
            <label className="plot-novel-select">
              <span>当前小说</span>
              <Select
                value={novelId}
                options={novels.map((novel) => ({ value: novel.novelId, label: novel.title }))}
                onChange={setNovelId}
                ariaLabel="当前小说"
                disabled={loading || novels.length === 0}
              />
            </label>
          </div>

          {feedback ? (
            <div className={`model-feedback model-feedback-${feedback.kind}`}>
              {feedback.kind === "success" ? <CheckCircle2 size={16} /> : feedback.kind === "error" ? <AlertCircle size={16} /> : null}
              <span>{feedback.message}</span>
            </div>
          ) : null}

          {loading ? (
            <div className="center-state" style={{ minHeight: 180 }}>
              <div className="spinner" />
              <span>正在加载分卷大纲...</span>
            </div>
          ) : sortedVolumes.length ? (
            viewMode === "strip" ? (
              <div className="plot-volume-list plot-volume-list-strip">
                {sortedVolumes.map((volume, index) => (
                  <article
                    className={`plot-volume-strip ${volume.id === selectedVolumeId ? "active" : ""}`}
                    key={volume.id}
                    onClick={() => setSelectedVolumeId(volume.id)}
                  >
                    <button type="button" className="plot-strip-main">
                      <span className="plot-volume-order">{String(index + 1).padStart(2, "0")}</span>
                      <span className="plot-strip-text">
                        <span className="plot-volume-title">{volume.title}</span>
                        <span className="plot-volume-summary">{volumeSummary(volume)}</span>
                      </span>
                      <span className={`status-pill status-pill-${volume.status ?? "draft"}`}>{statusLabel(volume.status)}</span>
                    </button>
                    {renderVolumeActions(volume, index)}
                  </article>
                ))}
              </div>
            ) : (
              <div className="plot-volume-table">
                <div className="plot-volume-table-head">
                  <span>卷名</span>
                  <span>状态</span>
                  <span>定位 / 主题摘要</span>
                  <span>操作</span>
                </div>
                {sortedVolumes.map((volume, index) => (
                  <article
                    className={`plot-volume-table-row ${volume.id === selectedVolumeId ? "active" : ""}`}
                    key={volume.id}
                    onClick={() => setSelectedVolumeId(volume.id)}
                  >
                    <button type="button" className="plot-table-title">
                      <span className="plot-volume-order">{String(index + 1).padStart(2, "0")}</span>
                      <span>{volume.title}</span>
                    </button>
                    <span className={`status-pill status-pill-${volume.status ?? "draft"}`}>{statusLabel(volume.status)}</span>
                    <span className="plot-table-summary">{volumeSummary(volume)}</span>
                    {renderVolumeActions(volume, index)}
                  </article>
                ))}
              </div>
            )
          ) : (
            <div className="empty-card">还没有分卷。可以新建分卷做卷级规划，也可以直接新建章节开始写。</div>
          )}
        </section>

        <section className="editor-card plot-editor-card">
          <div className="editor-card-head">
            <div>
              <h2>{selectedVolume ? "编辑分卷" : "新建分卷"}</h2>
              <p className="view-sub">本步只规划卷级结构；章节规划和关键事件会在后续页签接入。</p>
            </div>
            <button type="button" className="btn btn-primary" disabled={saving || !projectId || !novelId} onClick={() => void saveVolume()}>
              <Save size={15} strokeWidth={2} />
              {saving ? "保存中..." : "保存分卷"}
            </button>
          </div>

          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>卷名</span>
              <input className="input" value={draft.title} placeholder="例如 第一卷_香奈惠命运改写篇" onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="form-block">
              <span>状态</span>
              <Select
                value={draft.status}
                options={STATUS_OPTIONS}
                onChange={(value) => setDraft((current) => ({ ...current, status: value as VolumeStatus }))}
                ariaLabel="分卷状态"
              />
            </label>
          </div>

          <label className="form-block">
            <span>卷定位</span>
            <textarea className="textarea plot-textarea" value={draft.positioning} placeholder="这一卷的核心是什么，承担什么剧情功能" onChange={(event) => setDraft((current) => ({ ...current, positioning: event.target.value }))} />
          </label>
          <label className="form-block">
            <span>核心主题</span>
            <textarea className="textarea plot-textarea" value={draft.themes} placeholder="可逐条写下主题、人物命题、情绪关键词" onChange={(event) => setDraft((current) => ({ ...current, themes: event.target.value }))} />
          </label>
          <label className="form-block">
            <span>本卷重点</span>
            <textarea className="textarea plot-textarea-lg" value={draft.keyPoints} placeholder="写本卷必须推进的主线、人物变化、冲突和伏笔" onChange={(event) => setDraft((current) => ({ ...current, keyPoints: event.target.value }))} />
          </label>
          <label className="form-block">
            <span>备注 / 补充</span>
            <textarea className="textarea plot-textarea" value={draft.notes} placeholder="可选：临时想法、风险点、待确认设定" onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
          </label>
        </section>
      </div>

      {chapterModalOpen ? (
        <ChapterCreateModal
          draft={chapterDraft}
          volumes={sortedVolumes}
          saving={creatingChapter}
          onChange={(patch) => setChapterDraft((current) => ({ ...current, ...patch }))}
          onCancel={() => {
            if (!creatingChapter) {
              setChapterModalOpen(false);
            }
          }}
          onSubmit={() => void createChapter()}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="删除分卷"
          message={`确定删除分卷「${deleteTarget.title}」吗？此操作不可恢复。`}
          confirmText="删除"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void deleteVolume(deleteTarget)}
        />
      ) : null}
    </ViewShell>
  );
}
