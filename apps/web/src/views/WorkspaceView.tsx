import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import {
  AlertCircle,
  ArrowUp,
  Bold,
  Bookmark,
  Bot,
  ChevronDown,
  ChevronRight,
  Check,
  FilePenLine,
  Heading2,
  Italic,
  Lightbulb,
  List,
  Lock,
  Maximize2,
  Minimize2,
  PenLine,
  Quote,
  Redo2,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import {
  api,
  ApiError,
  type AgentInfo,
  type AnnotationRecord,
  type Character,
  type DirectorChatMessage,
  type DirectorReviewReport,
  type DirectorTaskSuggestion,
  type EditorChapter,
  type LockRecord,
  type RunRecord,
  type SearchResult,
  type WorldbookEntry,
} from "../api/client.js";
import { readWebPreferences } from "../app/preferences.js";
import { ConfirmModal, InputModal } from "../app/Modals.js";
import { CHAPTER_STATUS_VALUES, type ChapterStatus } from "@shulingge/shared";
import {
  buildOutline,
  createSelectionLock,
  parseChapterRef,
} from "./workspace-utils.js";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type InspectorTab = "outline" | "annotations" | "locks" | "run";
type MobilePanel = "chapters" | "editor" | "inspector" | "chat";
type QuickLookupTab = "characters" | "worldbook";
type EditorMode = "rich" | "source";
type ChatMessage =
  | { id: number; kind: "text"; role: "ai" | "user"; text: string }
  | { id: number; kind: "confirm"; task: DirectorTaskSuggestion; status: "pending" | "confirmed" | "cancelled" }
  | { id: number; kind: "ai-result"; agentName: string; text: string; undone?: boolean }
  | { id: number; kind: "run" };
type TreeContextMenu =
  | { kind: "chapter"; x: number; y: number; chapter: ChapterNode; novelId: string }
  | { kind: "novel"; x: number; y: number; novel: NovelNode };
type PromptRequest = {
  title: string;
  placeholder?: string;
  defaultValue: string;
  confirmText?: string;
  onConfirm(value: string): void | Promise<void>;
};
type ConfirmRequest = {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm(): void | Promise<void>;
};
type StoredChatMessage = ChatMessage extends infer Message ? Message extends { id: number } ? Omit<Message, "id"> : never : never;
type MarkdownStorageEditor = Editor & {
  storage: Editor["storage"] & {
    markdown: {
      getMarkdown(): string;
    };
  };
};

interface ChapterNode {
  id: string;
  chapterId: string;
  title: string;
  status: ChapterStatus;
  wordCount: number;
}

interface NovelNode {
  novelId: string;
  title: string;
  chapters: ChapterNode[];
}

interface ProjectTree {
  projectId: string;
  title: string;
  novels: NovelNode[];
}

const AGENT_FALLBACK: AgentInfo[] = [
  { id: "writer", name: "正文写作智能体", order: 1 },
  { id: "rule-guard", name: "规则守卫智能体", order: 2 },
  { id: "voice", name: "角色声音智能体", order: 3 },
  { id: "relation", name: "关系情感智能体", order: 4 },
  { id: "timeline", name: "时间线智能体", order: 5 },
  { id: "worldbook", name: "世界大纲校对智能体", order: 6 },
  { id: "polish", name: "润色去 AI 味智能体", order: 7 },
  { id: "summary", name: "摘要状态智能体", order: 8 },
  { id: "director", name: "总控智能体", order: 9 },
];

const TOOLS = [
  { kind: "undo" as const, Icon: Undo2, label: "撤销" },
  { kind: "redo" as const, Icon: Redo2, label: "重做" },
  { sep: true as const },
  { kind: "bold" as const, Icon: Bold, label: "加粗" },
  { kind: "italic" as const, Icon: Italic, label: "斜体" },
  { kind: "heading" as const, Icon: Heading2, label: "二级标题" },
  { kind: "quote" as const, Icon: Quote, label: "引用" },
  { kind: "list" as const, Icon: List, label: "列表" },
  { sep: true as const },
  { kind: "outline" as const, Icon: Lightbulb, label: "大纲面板" },
  { kind: "annotations" as const, Icon: FilePenLine, label: "批注面板" },
  { kind: "locks" as const, Icon: Lock, label: "锁定面板" },
  { kind: "run" as const, Icon: Bot, label: "运行详情" },
];

const CHAPTER_STATUS_LABELS: Record<ChapterStatus, string> = {
  "not-started": "未开始",
  planning: "规划中",
  drafting: "写作中",
  checking: "校对中",
  repairing: "修订中",
  "await-human": "待确认",
  finalized: "已完成",
  archived: "归档",
};

const CHAPTER_STATUS_DOT_CLASS: Record<ChapterStatus, string> = {
  "not-started": "status-not-started",
  planning: "status-planning",
  drafting: "status-drafting",
  checking: "status-checking",
  repairing: "status-repairing",
  "await-human": "status-await-human",
  finalized: "status-finalized",
  archived: "status-archived",
};

const SEARCH_TYPE_LABELS: Record<string, string> = {
  manuscript: "正文",
  "chapter-metadata": "章节",
  character: "角色",
  worldbook: "世界大纲",
  relation: "关系",
  timeline: "时间线",
  "knowledge-item": "知识",
  summary: "摘要",
  run: "运行",
};

const SEARCH_TYPE_VIEW: Record<string, string> = {
  character: "characters",
  worldbook: "worldbook",
  relation: "relations",
  timeline: "timeline",
};

const DIRECTOR_WELCOME_MESSAGE: StoredChatMessage = {
  kind: "text",
  role: "ai",
  text: "你好，我是总控·书灵。你可以和我聊这一章的思路、节奏、人物动机或具体写法。我会结合当前章节内容给建议，但本阶段不会修改正文或调度智能体。",
};

function formatWordCount(value: number): string {
  return `${Math.max(0, value).toLocaleString("zh-CN")} 字`;
}

function normalizeChapterStatus(status: string): ChapterStatus {
  return CHAPTER_STATUS_VALUES.includes(status as ChapterStatus) ? (status as ChapterStatus) : "drafting";
}

function summarizeSearchContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 86 ? `${normalized.slice(0, 86)}...` : normalized;
}

function chapterIdFromSearchResult(result: SearchResult): string | null {
  const filename = result.path.split(/[\\/]/).pop();
  const fileChapterId = filename?.replace(/\.(md|json)$/i, "");
  if (fileChapterId) {
    return fileChapterId;
  }

  const idPart = result.id?.split(":").pop();
  return idPart || null;
}

function createAnnotationFromSelection(start: number, end: number): AnnotationRecord {
  const safeStart = Math.max(0, Math.min(start, end));
  const safeEnd = Math.max(safeStart, Math.max(start, end));
  return {
    id: `anno-${safeStart}-${safeEnd}-${Date.now()}`,
    range: { start: safeStart, end: safeEnd },
    text: "",
    convertibleTo: [],
  };
}

function isStoredChatMessage(value: unknown): value is StoredChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<StoredChatMessage>;
  if (item.kind === "text") {
    return (item.role === "ai" || item.role === "user") && typeof item.text === "string";
  }
  if (item.kind === "confirm") {
    return Boolean(item.task) && (item.status === "pending" || item.status === "confirmed" || item.status === "cancelled");
  }
  if (item.kind === "ai-result") {
    return typeof item.agentName === "string" && typeof item.text === "string";
  }
  return item.kind === "run";
}

function hydrateChatMessages(messages: unknown[], nextId: () => number): ChatMessage[] {
  const valid = messages.filter(isStoredChatMessage);
  const source = valid.length ? valid : [DIRECTOR_WELCOME_MESSAGE];
  return source.map((message) => ({ ...message, id: nextId() } as ChatMessage));
}

function serializeChatMessages(messages: ChatMessage[]): StoredChatMessage[] {
  return messages.map(({ id: _id, ...message }) => message);
}

function getEditorMarkdown(editor: Editor): string {
  return (editor as MarkdownStorageEditor).storage.markdown.getMarkdown();
}

function firstText(...values: Array<string | undefined | null>): string {
  return values.map((value) => value?.trim()).find(Boolean) ?? "";
}

function compactText(value: string | undefined | null, fallback = "未填写"): string {
  return value?.trim() || fallback;
}

function joinValues(values: string[] | undefined, fallback = "未填写"): string {
  return values?.length ? values.join("、") : fallback;
}

function characterOneLine(character: Character): string {
  return firstText(
    character.profile?.basic?.oneLine,
    character.summary,
    character.profile?.basic?.occupation,
    character.role,
  );
}

function characterSearchText(character: Character): string {
  return [
    character.name,
    character.summary,
    character.role,
    character.faction,
    character.status,
    character.profile?.basic?.fullName,
    character.profile?.basic?.nickname,
    character.profile?.basic?.oneLine,
    character.profile?.basic?.occupation,
    character.profile?.appearance?.firstImpression,
    character.profile?.language?.speakingStyle,
    character.profile?.belief?.currentGoal,
  ].filter(Boolean).join(" ");
}

function worldbookTitle(entry: WorldbookEntry): string {
  return firstText(entry.name, entry.title, entry.profile?.basic?.name, entry.id);
}

function worldbookSummary(entry: WorldbookEntry): string {
  return firstText(entry.summary, entry.profile?.basic?.summary, entry.description, entry.content);
}

function worldbookSearchText(entry: WorldbookEntry): string {
  return [
    entry.title,
    entry.name,
    entry.summary,
    entry.description,
    entry.content,
    ...(entry.keywords ?? []),
    entry.profile?.basic?.alias,
    entry.profile?.content?.traits,
    entry.profile?.writing?.writingNotes,
  ].filter(Boolean).join(" ");
}

const QUICK_WORLDBOOK_CATEGORY_LABELS: Record<string, string> = {
  place: "地点/场所",
  organization: "组织/势力",
  people: "人物群体/种族",
  history: "事件/历史",
  event: "事件",
  item: "物品/道具",
  "power-system": "功法/能力体系",
  rule: "规则/法则",
  culture: "文化/习俗",
  geography: "地理/环境",
  politics: "政治/权力",
  economy: "经济/资源",
  religion: "宗教/信仰",
  language: "语言/文字",
  technology: "科技/技术水平",
  "faction-relation": "势力关系",
  setting: "设定",
  other: "其他",
};

const QUICK_IMPORTANCE_LABELS: Record<string, string> = {
  core: "核心",
  important: "重要",
  minor: "次要",
};

interface WorkspaceViewProps {
  currentProjectId?: string | null;
  vaultPath?: string | null;
  onNavigate?: (viewId: string) => void;
}

export function WorkspaceView({ currentProjectId, vaultPath, onNavigate }: WorkspaceViewProps = {}) {
  const preferences = useMemo(() => readWebPreferences(), []);
  const watchedAgentIds = useMemo(() => new Set(preferences.watchedAgentIds), [preferences]);
  const [agents, setAgents] = useState<AgentInfo[]>(AGENT_FALLBACK);
  const [activeId, setActiveId] = useState("");
  const [projectTree, setProjectTree] = useState<ProjectTree | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [expandedNovels, setExpandedNovels] = useState<Record<string, boolean>>({});
  const [selectedNovelId, setSelectedNovelId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [treeContextMenu, setTreeContextMenu] = useState<TreeContextMenu | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [indexRefreshing, setIndexRefreshing] = useState(false);
  const [indexFeedback, setIndexFeedback] = useState<string | null>(null);
  const [outlinePopoverOpen, setOutlinePopoverOpen] = useState(false);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [draggedChapter, setDraggedChapter] = useState<{ novelId: string; chapter: ChapterNode } | null>(null);
  const [dragTargetNovelId, setDragTargetNovelId] = useState<string | null>(null);
  const [chapterTitleDraft, setChapterTitleDraft] = useState("");
  const [chapter, setChapter] = useState<EditorChapter | null>(null);
  const [draft, setDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [run, setRun] = useState<RunRecord | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [executingTaskId, setExecutingTaskId] = useState<number | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [polishStartedAt, setPolishStartedAt] = useState<number | null>(null);
  const [polishElapsedSeconds, setPolishElapsedSeconds] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [reviewStartedAt, setReviewStartedAt] = useState<number | null>(null);
  const [reviewElapsedSeconds, setReviewElapsedSeconds] = useState(0);
  const [reviewReports, setReviewReports] = useState<DirectorReviewReport[] | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>(preferences.defaultInspectorTab);
  const [showInspector] = useState(false);
  const [focusMode, setFocusMode] = useState(preferences.startInFocusMode);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("editor");
  const [editorMode, setEditorMode] = useState<EditorMode>("rich");
  const [messages, setMessages] = useState<ChatMessage[]>(() => hydrateChatMessages([], () => 0));
  const [conversationLoadedKey, setConversationLoadedKey] = useState("");
  const [conversationSaveError, setConversationSaveError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [quickLookupOpen, setQuickLookupOpen] = useState(false);
  const [quickLookupTab, setQuickLookupTab] = useState<QuickLookupTab>("characters");
  const [quickLookupQuery, setQuickLookupQuery] = useState("");
  const [quickLookupCharacters, setQuickLookupCharacters] = useState<Character[]>([]);
  const [quickLookupWorldbook, setQuickLookupWorldbook] = useState<WorldbookEntry[]>([]);
  const [quickLookupLoading, setQuickLookupLoading] = useState(false);
  const [quickLookupError, setQuickLookupError] = useState<string | null>(null);
  const [expandedQuickLookupId, setExpandedQuickLookupId] = useState<string | null>(null);
  const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 });
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([]);
  const [locks, setLocks] = useState<LockRecord[]>([]);
  const [inspectorFeedback, setInspectorFeedback] = useState<string | null>(null);
  const [annotationsSaving, setAnnotationsSaving] = useState(false);
  const [locksSaving, setLocksSaving] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(1);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const treeContextMenuRef = useRef<HTMLDivElement | null>(null);
  const outlinePopoverRef = useRef<HTMLDivElement | null>(null);
  const outlineButtonRef = useRef<HTMLButtonElement | null>(null);
  const conversationSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorSyncingFromDraft = useRef(false);
  const nextId = () => idRef.current++;

  const locator = useMemo(() => parseChapterRef(activeId), [activeId]);
  const activeTitle =
    projectTree?.novels.flatMap((novel) => novel.chapters).find((chapterItem) => chapterItem.id === activeId)?.title ??
    locator.chapterId;
  const outline = useMemo(() => buildOutline(draft), [draft]);
  const metadataWordCount = chapter?.metadata?.wordCount ?? draft.replace(/\s/g, "").length;
  const metadataAnnotationsCount = annotations.length;
  const metadataLocksCount = locks.length;
  const selectedRun = useMemo(
    () => recentRuns.find((item) => item.id === selectedRunId) ?? (run?.id === selectedRunId ? run : null),
    [recentRuns, run, selectedRunId],
  );
  const vaultSelected = Boolean(vaultPath);
  const looseNovel = projectTree?.novels.find((novel) => novel.novelId === "main") ?? null;
  const userNovels = projectTree?.novels.filter((novel) => novel.novelId !== "main") ?? [];
  const allChapters = projectTree?.novels.flatMap((novel) => novel.chapters) ?? [];
  const hasAnyChapter = allChapters.length > 0;
  const hasValidActiveChapter = Boolean(activeId && chapter && allChapters.some((chapterItem) => chapterItem.id === activeId));
  const totalWordCount = allChapters.reduce((sum, chapterItem) => sum + chapterItem.wordCount, 0);
  const lookupProjectId = locator.projectId || projectTree?.projectId || currentProjectId || "";
  const quickLookupQueryText = quickLookupQuery.trim().toLowerCase();
  const filteredQuickLookupCharacters = useMemo(
    () => quickLookupCharacters.filter((item) =>
      !quickLookupQueryText || characterSearchText(item).toLowerCase().includes(quickLookupQueryText),
    ),
    [quickLookupCharacters, quickLookupQueryText],
  );
  const filteredQuickLookupWorldbook = useMemo(
    () => quickLookupWorldbook.filter((item) =>
      !quickLookupQueryText || worldbookSearchText(item).toLowerCase().includes(quickLookupQueryText),
    ),
    [quickLookupWorldbook, quickLookupQueryText],
  );
  const reviewAgents = useMemo(
    () => agents
      .filter((agent) => agent.enabled !== false && (agent.type === "checker" || agent.type === "blocker"))
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id)),
    [agents],
  );
  const polishAgent = useMemo(
    () => agents.find((agent) => agent.id === "polish-agent")
      ?? agents.find((agent) => agent.id === "polish")
      ?? agents.find((agent) => agent.enabled !== false && agent.type === "advisor" && agent.name.includes("润色"))
      ?? null,
    [agents],
  );

  const openPrompt = (request: PromptRequest) => {
    setPromptRequest(request);
  };

  const closePrompt = () => {
    setPromptRequest(null);
  };

  const openConfirm = (request: ConfirmRequest) => {
    setConfirmRequest(request);
  };

  const closeConfirm = () => {
    setConfirmRequest(null);
  };

  const loadQuickLookup = useCallback(async (projectId: string) => {
    if (!projectId) {
      setQuickLookupCharacters([]);
      setQuickLookupWorldbook([]);
      setQuickLookupError("暂无项目，请先选择或创建项目。");
      return;
    }

    setQuickLookupLoading(true);
    setQuickLookupError(null);
    try {
      const [characters, worldbook] = await Promise.all([
        api.listCharactersByProject(projectId),
        api.listWorldbookByProject(projectId),
      ]);
      setQuickLookupCharacters(characters);
      setQuickLookupWorldbook(worldbook);
    } catch (err) {
      setQuickLookupError(err instanceof ApiError ? err.message : "速查资料加载失败");
    } finally {
      setQuickLookupLoading(false);
    }
  }, []);

  const openQuickLookup = () => {
    setQuickLookupOpen(true);
    setExpandedQuickLookupId(null);
  };

  const loadProjectTree = useCallback(async (preferredProjectId?: string | null): Promise<ProjectTree | null> => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      const projects = await api.listProjects();
      const selectedProject =
        projects.find((project) => project.projectId === preferredProjectId) ??
        projects[0] ??
        null;
      if (!selectedProject) {
        setProjectTree(null);
        setActiveId("");
        setSelectedNovelId(null);
        return null;
      }

      const novels = await api.listNovels(selectedProject.projectId);
      const nextTree: ProjectTree = {
        projectId: selectedProject.projectId,
        title: selectedProject.title,
        novels: await Promise.all(
          novels.map(async (novel) => {
            const chapters = await api.listChapters(selectedProject.projectId, novel.novelId);
            return {
              novelId: novel.novelId,
              title: novel.title,
              chapters: chapters.map((chapterItem) => ({
                id: `${selectedProject.projectId}/${novel.novelId}/${chapterItem.chapterId}`,
                chapterId: chapterItem.chapterId,
                title: chapterItem.title,
                status: normalizeChapterStatus(chapterItem.status),
                wordCount: chapterItem.wordCount ?? 0,
              })),
            };
          }),
        ),
      };
      setProjectTree(nextTree);
      setExpandedNovels((current) => ({
        ...Object.fromEntries(nextTree.novels.map((novel) => [novel.novelId, true])),
        ...current,
      }));
      setActiveId((current) =>
        nextTree.novels.some((novel) => novel.chapters.some((chapterItem) => chapterItem.id === current))
          ? current
          : nextTree.novels.flatMap((novel) => novel.chapters)[0]?.id ?? "",
      );
      setSelectedNovelId((current) =>
        current && nextTree.novels.some((novel) => novel.novelId === current && novel.novelId !== "main")
          ? current
          : null,
      );
      return nextTree;
    } catch (err) {
      setProjectTree(null);
      setTreeError(err instanceof ApiError ? err.message : "章节树加载失败");
      return null;
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const list = await api.listAgents();
        if (list.length) {
          setAgents(list);
        }
      } catch {
        /* use fallback */
      }
    })();
  }, []);

  useEffect(() => {
    if (quickLookupOpen) {
      void loadQuickLookup(lookupProjectId);
    }
  }, [loadQuickLookup, lookupProjectId, quickLookupOpen]);

  useEffect(() => {
    if (!vaultSelected) {
      return;
    }
    void loadProjectTree(currentProjectId);
  }, [currentProjectId, loadProjectTree, vaultSelected]);

  useEffect(() => {
    if (!createMenuOpen) {
      return;
    }

    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (createMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setCreateMenuOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, [createMenuOpen]);

  useEffect(() => {
    if (!treeContextMenu) {
      return;
    }

    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (treeContextMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setTreeContextMenu(null);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setTreeContextMenu(null);
      }
    };

    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [treeContextMenu]);

  useEffect(() => {
    if (!outlinePopoverOpen) {
      return;
    }

    const closeOnOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (outlinePopoverRef.current?.contains(target) || outlineButtonRef.current?.contains(target)) {
        return;
      }
      setOutlinePopoverOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOutlinePopoverOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [outlinePopoverOpen]);

  useEffect(() => {
    const query = searchText.trim();
    if (!query) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    if (!vaultSelected) {
      setSearchResults([]);
      setSearchError("请先选择资料库");
      setSearchLoading(false);
      return;
    }

    let alive = true;
    setSearchLoading(true);
    setSearchError(null);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const results = await api.search({
            text: query,
            projectId: currentProjectId ?? projectTree?.projectId,
            limit: 30,
          });
          if (!alive) {
            return;
          }
          setSearchResults(results);
        } catch (err) {
          if (!alive) {
            return;
          }
          setSearchResults([]);
          setSearchError(err instanceof ApiError ? err.message : "搜索失败");
        } finally {
          if (alive) {
            setSearchLoading(false);
          }
        }
      })();
    }, 300);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [currentProjectId, projectTree?.projectId, searchText, vaultSelected]);

  useEffect(() => {
    if (!vaultSelected || !activeId) {
      return;
    }
    let alive = true;

    void (async () => {
      try {
        const loaded = await api.loadChapter(locator.chapterId, locator.projectId, locator.novelId);
        if (!alive) {
          return;
        }
        setChapter(loaded);
        setDraft(loaded.content ?? "");
        setAnnotations(loaded.annotations ?? []);
        setLocks(loaded.metadata?.locks ?? []);
        setSaveState("idle");
        setHistory([]);
        setFuture([]);
        setInspectorFeedback(null);
        setError(null);
      } catch (err) {
        if (!alive) {
          return;
        }
        setChapter(null);
        setDraft("");
        setAnnotations([]);
        setLocks([]);
        if (err instanceof ApiError && err.status !== 404) {
          setError(err.message);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [activeId, locator, vaultSelected]);

  useEffect(() => {
    setChapterTitleDraft(activeTitle);
  }, [activeTitle]);

  useEffect(() => {
    if (!vaultSelected || !activeId || !locator.projectId || !locator.novelId || !locator.chapterId) {
      setConversationLoadedKey("");
      setMessages(hydrateChatMessages([], nextId));
      return;
    }

    let alive = true;
    const conversationKey = `${locator.projectId}/${locator.novelId}/${locator.chapterId}`;
    setConversationLoadedKey("");
    setConversationSaveError(null);

    void (async () => {
      try {
        const record = await api.loadDirectorConversation(locator.projectId, locator.novelId, locator.chapterId);
        if (!alive) {
          return;
        }
        setMessages(hydrateChatMessages(record.messages, nextId));
      } catch {
        if (!alive) {
          return;
        }
        setMessages(hydrateChatMessages([], nextId));
      } finally {
        if (alive) {
          setConversationLoadedKey(conversationKey);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [activeId, locator, vaultSelected]);

  useEffect(() => {
    if (!conversationLoadedKey || !vaultSelected || !locator.projectId || !locator.novelId || !locator.chapterId) {
      return;
    }
    const currentKey = `${locator.projectId}/${locator.novelId}/${locator.chapterId}`;
    if (conversationLoadedKey !== currentKey) {
      return;
    }
    if (conversationSaveTimer.current) {
      clearTimeout(conversationSaveTimer.current);
    }

    const snapshot = serializeChatMessages(messages);
    conversationSaveTimer.current = setTimeout(async () => {
      try {
        await api.saveDirectorConversation(locator.projectId, locator.novelId, locator.chapterId, snapshot);
        setConversationSaveError(null);
      } catch (err) {
        setConversationSaveError(err instanceof ApiError ? err.message : "对话历史保存失败");
      }
    }, 500);

    return () => {
      if (conversationSaveTimer.current) {
        clearTimeout(conversationSaveTimer.current);
      }
    };
  }, [conversationLoadedKey, locator, messages, vaultSelected]);

  useEffect(() => {
    if (!vaultSelected || !activeId) {
      return;
    }
    let alive = true;

    void (async () => {
      setRunsLoading(true);
      try {
        const list = await api.listRuns(locator.projectId, locator.novelId, locator.chapterId);
        if (!alive) {
          return;
        }
        setRecentRuns(list);
        setSelectedRunId((current) => current && list.some((item) => item.id === current) ? current : list[0]?.id ?? null);
      } catch {
        if (!alive) {
          return;
        }
        setRecentRuns([]);
      } finally {
        if (alive) {
          setRunsLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [activeId, locator, vaultSelected]);

  useEffect(() => {
    if (!run) {
      return;
    }
    setRecentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)].slice(0, 8));
    setSelectedRunId(run.id);
  }, [run]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, run]);

  useEffect(() => {
    if (!reviewing || reviewStartedAt === null) {
      setReviewElapsedSeconds(0);
      return;
    }

    setReviewElapsedSeconds(Math.max(0, Math.floor((Date.now() - reviewStartedAt) / 1000)));
    const timer = window.setInterval(() => {
      setReviewElapsedSeconds(Math.max(0, Math.floor((Date.now() - reviewStartedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [reviewing, reviewStartedAt]);

  useEffect(() => {
    if (!polishing || polishStartedAt === null) {
      setPolishElapsedSeconds(0);
      return;
    }

    setPolishElapsedSeconds(Math.max(0, Math.floor((Date.now() - polishStartedAt) / 1000)));
    const timer = window.setInterval(() => {
      setPolishElapsedSeconds(Math.max(0, Math.floor((Date.now() - polishStartedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [polishing, polishStartedAt]);

  const jumpToOutlineItem = (line: number) => {
    if (!hasValidActiveChapter) {
      return;
    }

    const targetLine = Math.max(1, line);
    if (editorMode === "source") {
      const node = sourceTextareaRef.current;
      if (!node) {
        return;
      }
      const lines = draft.split("\n");
      const offset = lines.slice(0, targetLine - 1).reduce((sum, item) => sum + item.length + 1, 0);
      const safeOffset = Math.min(offset, draft.length);
      node.focus();
      node.setSelectionRange(safeOffset, safeOffset);
      setSelectionRange({ start: safeOffset, end: safeOffset });
      const lineHeight = Number.parseFloat(window.getComputedStyle(node).lineHeight) || 24;
      node.scrollTop = Math.max(0, (targetLine - 1) * lineHeight - node.clientHeight * 0.25);
      setOutlinePopoverOpen(false);
      return;
    }

    if (!editor) {
      return;
    }

    const markdownLine = draft.split("\n")[targetLine - 1]?.replace(/^#+\s*/, "").trim() ?? "";
    const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n", "\n");
    const textOffset = markdownLine ? docText.indexOf(markdownLine) : -1;
    const safePos = Math.max(1, Math.min(editor.state.doc.content.size, textOffset > -1 ? textOffset + 1 : 1));
    editor.chain().focus().setTextSelection(safePos).run();
    setOutlinePopoverOpen(false);
  };

  const scheduleSave = useCallback(
    (content: string) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      setSaveState("dirty");
      saveTimer.current = setTimeout(async () => {
        setSaveState("saving");
        try {
          const saved = await api.saveChapter(locator.chapterId, content, locator.projectId, locator.novelId);
          setChapter(saved);
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      }, preferences.autosaveDelayMs);
    },
    [locator, preferences.autosaveDelayMs],
  );

  const onEdit = (text: string) => {
    setDraft(text);
    if (vaultSelected) {
      scheduleSave(text);
    }
  };

  const syncSourceSelection = () => {
    const node = sourceTextareaRef.current;
    if (!node) {
      return;
    }
    setSelectionRange({
      start: node.selectionStart ?? 0,
      end: node.selectionEnd ?? 0,
    });
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: "-",
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: draft,
    editable: hasValidActiveChapter,
    editorProps: {
      attributes: {
        class: "manuscript rich-manuscript",
        "aria-label": "正文",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      if (editorSyncingFromDraft.current) {
        return;
      }
      const markdown = getEditorMarkdown(activeEditor);
      onEdit(markdown);
      const { from, to } = activeEditor.state.selection;
      setSelectionRange({ start: from, end: to });
    },
    onSelectionUpdate: ({ editor: activeEditor }) => {
      const { from, to } = activeEditor.state.selection;
      setSelectionRange({ start: from, end: to });
    },
  }, [hasValidActiveChapter, vaultSelected, locator.chapterId, locator.novelId, locator.projectId]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const currentMarkdown = getEditorMarkdown(editor);
    if (currentMarkdown === draft) {
      return;
    }
    editorSyncingFromDraft.current = true;
    editor.commands.setContent(draft, { emitUpdate: false });
    editorSyncingFromDraft.current = false;
  }, [draft, editor]);

  useEffect(() => {
    editor?.setEditable(hasValidActiveChapter);
  }, [editor, hasValidActiveChapter]);

  const switchEditorMode = (mode: EditorMode) => {
    if (mode === editorMode) {
      return;
    }

    if (mode === "source" && editor) {
      const markdown = getEditorMarkdown(editor);
      if (markdown !== draft) {
        onEdit(markdown);
      }
    }

    setEditorMode(mode);
    requestAnimationFrame(() => {
      if (mode === "source") {
        sourceTextareaRef.current?.focus();
      } else {
        editor?.commands.focus();
      }
    });
  };

  const pushHistory = (current: string) => {
    setHistory((items) => [...items.slice(-39), current]);
    setFuture([]);
  };

  const runEditorCommand = (command: (activeEditor: Editor) => boolean) => {
    if (!editor || !hasValidActiveChapter || editorMode !== "rich") {
      return;
    }
    const before = getEditorMarkdown(editor);
    pushHistory(draft);
    const changed = command(editor);
    const after = getEditorMarkdown(editor);
    if (!changed || after === before) {
      setHistory((items) => items.slice(0, -1));
      setFuture([]);
    }
  };

  const createChapterInNovel = async (targetNovelIdOverride?: string) => {
    if (!projectTree) {
      setCreateMenuOpen(false);
      setTreeContextMenu(null);
      setTreeError("还没有项目，请先去「项目」页新建一本书");
      return;
    }
    const targetNovelId = targetNovelIdOverride ?? selectedNovelId ?? "main";
    const targetNovel = projectTree.novels.find((novel) => novel.novelId === targetNovelId);
    if (!targetNovel) {
      setCreateMenuOpen(false);
      setTreeContextMenu(null);
      setTreeError("当前项目还没有散章区，请先新建项目");
      return;
    }

    setCreateMenuOpen(false);
    setTreeContextMenu(null);
    openPrompt({
      title: "新建章节",
      defaultValue: "新章节",
      placeholder: "请输入章节标题",
      onConfirm: async (title) => {
        closePrompt();
        try {
          setTreeError(null);
          const created = await api.createChapter(projectTree.projectId, targetNovel.novelId, title);
          await loadProjectTree(projectTree.projectId);
          setActiveId(`${projectTree.projectId}/${targetNovel.novelId}/${created.chapterId}`);
          setMobilePanel("editor");
        } catch (err) {
          setTreeError(err instanceof ApiError ? err.message : "新建章节失败");
        }
      },
    });
  };

  const createChapterInCurrentNovel = async () => {
    await createChapterInNovel();
  };

  const createNovel = async () => {
    if (!projectTree) {
      setCreateMenuOpen(false);
      setTreeContextMenu(null);
      setTreeError("还没有项目，请先去「项目」页新建一本书");
      return;
    }

    setCreateMenuOpen(false);
    setTreeContextMenu(null);
    openPrompt({
      title: "新建卷",
      defaultValue: `第${userNovels.length + 1}卷`,
      placeholder: "请输入卷名称",
      onConfirm: async (title) => {
        closePrompt();
        try {
          setTreeError(null);
          const created = await api.createNovel(projectTree.projectId, title);
          await loadProjectTree(projectTree.projectId);
          setExpandedNovels((current) => ({ ...current, [created.novelId]: true }));
          setSelectedNovelId(created.novelId);
        } catch (err) {
          setTreeError(err instanceof ApiError ? err.message : "新建卷失败");
        }
      },
    });
  };

  const renameChapter = async (novelId: string, chapterItem: ChapterNode) => {
    if (!projectTree) {
      return;
    }
    setTreeContextMenu(null);
    openPrompt({
      title: "重命名",
      defaultValue: chapterItem.title,
      placeholder: "请输入章节标题",
      onConfirm: async (title) => {
        closePrompt();
        try {
          setTreeError(null);
          await api.renameChapter(projectTree.projectId, novelId, chapterItem.chapterId, title);
          await loadProjectTree(projectTree.projectId);
          if (activeId === chapterItem.id) {
            setChapter((current) =>
              current ? { ...current, metadata: { ...current.metadata, title } } : current,
            );
            setChapterTitleDraft(title);
          }
        } catch (err) {
          setTreeError(err instanceof ApiError ? err.message : "重命名章节失败");
        }
      },
    });
  };

  const deleteChapter = async (novelId: string, chapterItem: ChapterNode) => {
    if (!projectTree) {
      return;
    }
    setTreeContextMenu(null);
    openConfirm({
      title: "删除章节",
      message: `确定删除章节「${chapterItem.title}」吗？此操作不可恢复`,
      confirmText: "删除",
      danger: true,
      onConfirm: async () => {
        closeConfirm();
        try {
          setTreeError(null);
          const deletedActiveChapter = activeId === chapterItem.id;
          await api.deleteChapter(projectTree.projectId, novelId, chapterItem.chapterId);
          await loadProjectTree(projectTree.projectId);
          if (deletedActiveChapter) {
            setActiveId("");
            setSelectedNovelId(null);
            setChapter(null);
            setDraft("");
            setHistory([]);
            setFuture([]);
            setAnnotations([]);
            setLocks([]);
            setSaveState("idle");
          }
        } catch (err) {
          setTreeError(err instanceof ApiError ? err.message : "删除章节失败");
        }
      },
    });
  };

  const moveChapter = async (novelId: string, chapterItem: ChapterNode, targetNovelId: string) => {
    if (!projectTree) {
      return;
    }
    setTreeContextMenu(null);

    try {
      setTreeError(null);
      const movedActiveChapter = activeId === chapterItem.id;
      const result = await api.moveChapter(projectTree.projectId, novelId, chapterItem.chapterId, targetNovelId);
      await loadProjectTree(projectTree.projectId);
      if (targetNovelId !== "main") {
        setExpandedNovels((current) => ({ ...current, [targetNovelId]: true }));
      }
      if (movedActiveChapter) {
        setSelectedNovelId(null);
        setActiveId(`${projectTree.projectId}/${result.novelId}/${result.chapterId}`);
      }
    } catch (err) {
      setTreeError(err instanceof ApiError ? err.message : "移动章节失败");
    }
  };

  const setChapterStatus = async (novelId: string, chapterItem: ChapterNode, status: ChapterStatus) => {
    if (!projectTree) {
      return;
    }
    setTreeContextMenu(null);

    try {
      setTreeError(null);
      await api.setChapterStatus(projectTree.projectId, novelId, chapterItem.chapterId, status);
      await loadProjectTree(projectTree.projectId);
      if (activeId === chapterItem.id) {
        setChapter((current) =>
          current ? { ...current, metadata: { ...current.metadata, status } } : current,
        );
      }
    } catch (err) {
      setTreeError(err instanceof ApiError ? err.message : "设置章节状态失败");
    }
  };

  const startChapterDrag = (event: ReactDragEvent<HTMLButtonElement>, novelId: string, chapterItem: ChapterNode) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", chapterItem.id);
    setDraggedChapter({ novelId, chapter: chapterItem });
    setTreeContextMenu(null);
  };

  const clearChapterDrag = () => {
    setDraggedChapter(null);
    setDragTargetNovelId(null);
  };

  const canDropChapterOnNovel = (targetNovelId: string) =>
    Boolean(draggedChapter && draggedChapter.novelId !== targetNovelId);

  const dragChapterOverNovel = (event: ReactDragEvent<HTMLElement>, targetNovelId: string) => {
    if (!canDropChapterOnNovel(targetNovelId)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragTargetNovelId(targetNovelId);
  };

  const leaveChapterDropTarget = (event: ReactDragEvent<HTMLElement>, targetNovelId: string) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setDragTargetNovelId((current) => (current === targetNovelId ? null : current));
  };

  const dropChapterOnNovel = async (event: ReactDragEvent<HTMLElement>, targetNovelId: string) => {
    event.preventDefault();
    const dropped = draggedChapter;
    clearChapterDrag();
    if (!dropped || dropped.novelId === targetNovelId) {
      return;
    }
    await moveChapter(dropped.novelId, dropped.chapter, targetNovelId);
  };

  const rebuildSearchIndex = async () => {
    if (!vaultSelected || indexRefreshing) {
      return;
    }

    try {
      setIndexRefreshing(true);
      setSearchError(null);
      setIndexFeedback(null);
      const result = await api.rebuildIndex();
      setIndexFeedback(`索引已更新：${result.indexedCount} 条`);
      if (searchText.trim()) {
        const results = await api.search({
          text: searchText.trim(),
          projectId: currentProjectId ?? projectTree?.projectId,
          limit: 30,
        });
        setSearchResults(results);
      }
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : "重建索引失败");
    } finally {
      setIndexRefreshing(false);
    }
  };

  const openSearchResult = (result: SearchResult) => {
    if (result.type === "manuscript" || result.type === "chapter-metadata") {
      const chapterId = chapterIdFromSearchResult(result);
      if (!chapterId || !result.novelId) {
        setSearchError("无法定位该章节");
        return;
      }

      setSelectedNovelId(null);
      setActiveId(`${result.projectId}/${result.novelId}/${chapterId}`);
      setMobilePanel("editor");
      return;
    }

    const targetView = SEARCH_TYPE_VIEW[result.type];
    if (targetView) {
      onNavigate?.(targetView);
    }
  };

  const clearSearch = () => {
    setSearchText("");
    setSearchResults([]);
    setSearchError(null);
    setIndexFeedback(null);
  };

  const saveChapterTitle = async () => {
    if (!projectTree || !hasValidActiveChapter) {
      return;
    }
    const nextTitle = chapterTitleDraft.trim() || activeTitle || "新章节";
    if (nextTitle === activeTitle) {
      setChapterTitleDraft(activeTitle);
      return;
    }

    try {
      setTreeError(null);
      await api.renameChapter(locator.projectId, locator.novelId, locator.chapterId, nextTitle);
      setChapter((current) =>
        current ? { ...current, metadata: { ...current.metadata, title: nextTitle } } : current,
      );
      setProjectTree((current) =>
        current
          ? {
              ...current,
              novels: current.novels.map((novel) => ({
                ...novel,
                chapters: novel.chapters.map((chapterItem) =>
                  chapterItem.id === activeId ? { ...chapterItem, title: nextTitle } : chapterItem,
                ),
              })),
            }
          : current,
      );
      setChapterTitleDraft(nextTitle);
    } catch (err) {
      setTreeError(err instanceof ApiError ? err.message : "重命名章节失败");
      setChapterTitleDraft(activeTitle);
    }
  };

  const renameNovel = async (novel: NovelNode) => {
    if (!projectTree) {
      return;
    }
    setTreeContextMenu(null);
    openPrompt({
      title: "重命名",
      defaultValue: novel.title,
      placeholder: "请输入卷名称",
      onConfirm: async (title) => {
        closePrompt();
        try {
          setTreeError(null);
          await api.renameNovel(projectTree.projectId, novel.novelId, title);
          await loadProjectTree(projectTree.projectId);
        } catch (err) {
          setTreeError(err instanceof ApiError ? err.message : "重命名卷失败");
        }
      },
    });
  };

  const deleteNovel = async (novel: NovelNode) => {
    if (!projectTree) {
      return;
    }
    setTreeContextMenu(null);
    openConfirm({
      title: "删除卷",
      message: `确定删除卷「${novel.title}」及其下所有章节吗？此操作不可恢复`,
      confirmText: "删除卷",
      danger: true,
      onConfirm: async () => {
        closeConfirm();
        try {
          setTreeError(null);
          const deletedActiveChapter = novel.chapters.some((chapterItem) => chapterItem.id === activeId);
          await api.deleteNovel(projectTree.projectId, novel.novelId);
          await loadProjectTree(projectTree.projectId);
          if (selectedNovelId === novel.novelId) {
            setSelectedNovelId(null);
          }
          if (deletedActiveChapter) {
            setActiveId("");
            setChapter(null);
            setDraft("");
            setHistory([]);
            setFuture([]);
            setAnnotations([]);
            setLocks([]);
            setSaveState("idle");
          }
        } catch (err) {
          setTreeError(err instanceof ApiError ? err.message : "删除卷失败");
        }
      },
    });
  };

  const pushText = (role: "ai" | "user", text: string) =>
    setMessages((items) => [...items, { id: nextId(), kind: "text", role, text }]);

  const executeAgentTask = async (input: {
    agentId: string;
    agentName: string;
    taskDescription: string;
    loadingText: string;
    onBeforeExecute?: () => void;
    onFinally?: () => void;
    onSuccess?: () => void;
    onFailure?: (message: string) => void;
  }) => {
    if (!locator.projectId || !locator.novelId || !locator.chapterId || !chapter) {
      pushText("ai", "请先打开一个章节，再执行 AI 修改。");
      return;
    }
    if (!draft.trim()) {
      pushText("ai", "当前章节没有可改写的正文，请先写入内容。");
      return;
    }

    const loadingMessageId = nextId();
    input.onBeforeExecute?.();
    setMessages((items) => [
      ...items,
      { id: loadingMessageId, kind: "text", role: "ai", text: input.loadingText },
    ]);

    try {
      const result = await api.executeDirectorTask({
        agentId: input.agentId,
        taskDescription: input.taskDescription,
        projectId: locator.projectId,
        novelId: locator.novelId,
        chapterId: locator.chapterId,
        currentContent: draft,
      });
      const newContent = result.newContent.trim();
      if (!newContent) {
        throw new Error("智能体没有返回有效正文");
      }

      pushHistory(draft);
      setDraft(newContent);
      setChapter((current) => current ? { ...current, content: newContent } : current);
      if (vaultSelected) {
        scheduleSave(newContent);
      }

      setMessages((items) =>
        items.map((message) => {
          if (message.id === loadingMessageId && message.kind === "text") {
            return {
              id: loadingMessageId,
              kind: "ai-result" as const,
              agentName: result.agentName,
              text: `✓【${result.agentName}】已完成修改，正文已更新。不满意可点下方「撤销本次 AI 修改」或用编辑器撤销。`,
            };
          }
          return message;
        }),
      );
      input.onSuccess?.();
    } catch (err) {
      const messageText = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "智能体执行失败，请稍后再试";
      setMessages((items) =>
        items.map((message) =>
          message.id === loadingMessageId && message.kind === "text"
            ? {
                ...message,
                text: messageText,
              }
            : message,
        ),
      );
      input.onFailure?.(messageText);
    } finally {
      input.onFinally?.();
    }
  };

  const confirmDirectorTask = async (messageId: number, task: DirectorTaskSuggestion) => {
    if (executingTaskId !== null || polishing) {
      return;
    }
    await executeAgentTask({
      agentId: task.agentId,
      agentName: task.agentName,
      taskDescription: task.taskDescription,
      loadingText: `【${task.agentName}】正在处理…`,
      onBeforeExecute: () => setExecutingTaskId(messageId),
      onFinally: () => setExecutingTaskId(null),
      onSuccess: () => {
        setMessages((items) =>
          items.map((message) =>
            message.id === messageId && message.kind === "confirm"
              ? { ...message, status: "confirmed" as const }
              : message,
          ),
        );
      },
    });
  };

  const cancelDirectorTask = (messageId: number) => {
    setMessages((items) => [
      ...items.map((message) =>
        message.id === messageId && message.kind === "confirm"
          ? { ...message, status: "cancelled" as const }
          : message,
      ),
      { id: nextId(), kind: "text", role: "ai", text: "已取消。" },
    ]);
  };

  const undoAiResult = (messageId: number) => {
    undo();
    setMessages((items) => [
      ...items.map((message) =>
        message.id === messageId && message.kind === "ai-result"
          ? { ...message, undone: true }
          : message,
      ),
      { id: nextId(), kind: "text", role: "ai", text: "已撤销本次修改。" },
    ]);
  };

  const runChapterReview = async () => {
    closeConfirm();
    if (!locator.projectId || !locator.novelId || !locator.chapterId || !chapter) {
      setReviewError("请先打开一个章节，再进行质检。");
      setReviewReports(null);
      return;
    }
    if (!draft.trim()) {
      setReviewError("请先打开有正文的章节。");
      setReviewReports(null);
      return;
    }

    setReviewing(true);
    setReviewStartedAt(Date.now());
    setReviewError(null);
    setReviewReports(null);
    try {
      const result = await api.reviewChapter({
        projectId: locator.projectId,
        novelId: locator.novelId,
        chapterId: locator.chapterId,
        currentContent: draft,
      });
      setReviewReports(result.reports);
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : "一键质检失败，请稍后再试");
    } finally {
      setReviewing(false);
      setReviewStartedAt(null);
    }
  };

  const openReviewConfirm = () => {
    if (!hasValidActiveChapter) {
      setReviewError("请先打开一个章节，再进行质检。");
      setReviewReports(null);
      return;
    }
    if (!draft.trim()) {
      setReviewError("请先打开有正文的章节。");
      setReviewReports(null);
      return;
    }
    if (reviewAgents.length === 0) {
      setReviewError("当前没有启用的检查类智能体，请先在智能体管理页启用 checker 或 blocker 类型智能体。");
      setReviewReports(null);
      return;
    }

    openConfirm({
      title: "一键质检",
      message: `将依次运行：${reviewAgents.map((agent) => agent.name).join("、")}，对当前章节进行检查。确认开始？`,
      confirmText: "开始质检",
      onConfirm: () => {
        void runChapterReview();
      },
    });
  };

  const runPolish = async () => {
    closeConfirm();
    if (polishing || executingTaskId !== null) {
      return;
    }
    if (!polishAgent) {
      pushText("ai", "未找到润色智能体，请在智能体管理页确认。");
      return;
    }

    await executeAgentTask({
      agentId: polishAgent.id,
      agentName: polishAgent.name,
      taskDescription: "通读全文，润色改进表达、消除重复与 AI 腔，保持原意和剧情不变。",
      loadingText: `【${polishAgent.name}】正在润色…`,
      onBeforeExecute: () => {
        setPolishing(true);
        setPolishElapsedSeconds(0);
        setPolishStartedAt(Date.now());
      },
      onFinally: () => {
        setPolishing(false);
        setPolishStartedAt(null);
      },
    });
  };

  const openPolishConfirm = () => {
    if (!hasValidActiveChapter) {
      pushText("ai", "请先打开一个章节，再进行润色。");
      return;
    }
    if (!draft.trim()) {
      pushText("ai", "当前章节没有可润色的正文，请先写入内容。");
      return;
    }
    if (!polishAgent) {
      pushText("ai", "未找到润色智能体，请在智能体管理页确认。");
      return;
    }

    openConfirm({
      title: "一键润色",
      message: `将调用「${polishAgent.name}」对当前章节正文进行润色，改动后可撤销。确认？`,
      confirmText: "开始润色",
      onConfirm: () => {
        void runPolish();
      },
    });
  };

  const onSend = async () => {
    const text = chatInput.trim();
    if (!text || chatSending) {
      return;
    }
    setChatInput("");
    const userMessage: ChatMessage = { id: nextId(), kind: "text", role: "user", text };
    const historyMessages: DirectorChatMessage[] = [...messages, userMessage]
      .filter((message): message is Extract<ChatMessage, { kind: "text" }> => message.kind === "text" && message.id !== 0)
      .map((message) => ({
        role: message.role === "ai" ? "assistant" : "user",
        content: message.text,
      }));
    setMessages((items) => [...items, userMessage]);

    const thinkingMessageId = nextId();
    setMessages((items) => [
      ...items,
      { id: thinkingMessageId, kind: "text", role: "ai", text: "总控思考中…" },
    ]);
    setChatSending(true);
    setError(null);
    try {
      const reply = await api.chatWithDirector({
        messages: historyMessages,
        projectId: locator.projectId || undefined,
        novelId: locator.novelId || undefined,
        chapterId: locator.chapterId || undefined,
      });
      setMessages((items) =>
        items.map((message) =>
          message.id === thinkingMessageId && message.kind === "text"
            ? reply.mode === "task" && reply.task
              ? { id: thinkingMessageId, kind: "confirm", task: reply.task, status: "pending" }
              : { ...message, text: reply.reply ?? "我暂时没有生成有效回复，请换一种问法再试。" }
            : message,
        ),
      );
    } catch (err) {
      setMessages((items) =>
        items.map((message) =>
          message.id === thinkingMessageId && message.kind === "text"
            ? { ...message, text: err instanceof ApiError ? err.message : "总控对话失败，请稍后再试" }
            : message,
        ),
      );
    } finally {
      setChatSending(false);
    }
  };

  const onChatKey = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const modPressed = event.ctrlKey || event.metaKey;
    const shouldSend =
      preferences.sendShortcut === "enter"
        ? event.key === "Enter" && !event.shiftKey
        : event.key === "Enter" && modPressed;

    if (shouldSend) {
      event.preventDefault();
      void onSend();
    }
  };

  const undo = () => {
    setHistory((items) => {
      const previous = items.at(-1);
      if (!previous) {
        return items;
      }
      setFuture((queued) => [draft, ...queued].slice(0, 40));
      setDraft(previous);
      if (vaultSelected) {
        scheduleSave(previous);
      }
      return items.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((items) => {
      const [next, ...rest] = items;
      if (!next) {
        return items;
      }
      setHistory((queued) => [...queued.slice(-39), draft]);
      setDraft(next);
      if (vaultSelected) {
        scheduleSave(next);
      }
      return rest;
    });
  };

  const saveCurrentAnnotations = async () => {
    try {
      setAnnotationsSaving(true);
      setInspectorFeedback(null);
      const saved = await api.saveChapterAnnotations(locator.chapterId, locator.projectId, locator.novelId, annotations);
      setAnnotations(saved);
      setInspectorFeedback("批注已保存");
    } catch (err) {
      setInspectorFeedback(err instanceof ApiError ? err.message : "批注保存失败");
    } finally {
      setAnnotationsSaving(false);
    }
  };

  const saveCurrentLocks = async () => {
    try {
      setLocksSaving(true);
      setInspectorFeedback(null);
      const saved = await api.saveChapterLocks(locator.chapterId, locator.projectId, locator.novelId, locks);
      setLocks(saved);
      setInspectorFeedback("锁定已保存");
    } catch (err) {
      setInspectorFeedback(err instanceof ApiError ? err.message : "锁定保存失败");
    } finally {
      setLocksSaving(false);
    }
  };

  const stepStatus = (agentId: string): string =>
    run?.nodes?.find((node) => node.agentId === agentId)?.status ??
    run?.steps?.find((step) => step.agentId === agentId)?.status ??
    "pending";

  const toggleFocusMode = () => {
    setFocusMode((current) => {
      const next = !current;
      if (next) {
        setMobilePanel("editor");
      }
      return next;
    });
  };

  return (
    <>
    <div className={`workspace mobile-panel-${mobilePanel}${focusMode ? " focus-mode" : ""}`}>
      <div className="workspace-mobile-header">
        <div className="workspace-mobile-summary">
          <div>
            <div className="workspace-mobile-title">{activeTitle}</div>
            <div className="workspace-mobile-sub">
              字数 {metadataWordCount} · 批注 {metadataAnnotationsCount} · 锁定 {metadataLocksCount}
            </div>
          </div>
          <button type="button" className="btn" onClick={toggleFocusMode}>
            {focusMode ? <Minimize2 size={15} strokeWidth={2} /> : <Maximize2 size={15} strokeWidth={2} />}
            {focusMode ? "退出专注" : "专注"}
          </button>
        </div>
        {!focusMode ? (
          <div className="workspace-mobile-tabs segmented" role="tablist" aria-label="移动工作台切换">
            <button type="button" className={mobilePanel === "chapters" ? "on" : ""} onClick={() => setMobilePanel("chapters")}>
              章节
            </button>
            <button type="button" className={mobilePanel === "editor" ? "on" : ""} onClick={() => setMobilePanel("editor")}>
              写作
            </button>
            <button type="button" className={mobilePanel === "inspector" ? "on" : ""} onClick={() => setMobilePanel("inspector")}>
              侧栏
            </button>
            <button type="button" className={mobilePanel === "chat" ? "on" : ""} onClick={() => setMobilePanel("chat")}>
              总控
            </button>
          </div>
        ) : null}
      </div>
      <aside className="tree-panel">
        <div className="tree-head">
          <div>
            <h2>章节与资料</h2>
            <div className="tree-total-words">{formatWordCount(totalWordCount)}</div>
          </div>
          <div className="tree-head-actions">
            <button
              type="button"
              className={`btn-icon ${searchOpen ? "active" : ""}`}
              title="搜索"
              disabled={!vaultSelected}
              onClick={() => setSearchOpen((open) => !open)}
            >
              <Search size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="btn-icon"
              title={indexRefreshing ? "索引更新中" : "重建索引"}
              disabled={!vaultSelected || indexRefreshing}
              onClick={() => void rebuildSearchIndex()}
            >
              <RefreshCw size={16} strokeWidth={2} className={indexRefreshing ? "spin-icon" : ""} />
            </button>
            <div className="tree-create" ref={createMenuRef}>
              <button
                type="button"
                className="btn-icon"
                title="新建"
                aria-haspopup="menu"
                aria-expanded={createMenuOpen}
                onClick={() => setCreateMenuOpen((open) => !open)}
              >
                +
              </button>
              {createMenuOpen ? (
                <div className="tree-create-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void createNovel()}>
                    新建卷
                  </button>
                  <button type="button" role="menuitem" onClick={() => void createChapterInCurrentNovel()}>
                    新建章节
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {searchOpen ? (
          <div className="tree-search-box">
            <div className="tree-search-field">
              <Search size={14} strokeWidth={2} />
              <input
                value={searchText}
                placeholder={vaultSelected ? "搜索正文、角色、世界大纲..." : "请先选择资料库"}
                disabled={!vaultSelected}
                onChange={(event) => setSearchText(event.target.value)}
              />
              {searchText ? (
                <button type="button" className="tree-search-clear" title="清除搜索" onClick={clearSearch}>
                  <X size={14} strokeWidth={2} />
                </button>
              ) : null}
            </div>
            {indexFeedback ? <div className="tree-search-feedback">{indexFeedback}</div> : null}
          </div>
        ) : null}
        <div className="tree-scroll" onClick={() => setSelectedNovelId(null)}>
          {searchText.trim() ? (
            <div className="search-results">
              {searchLoading ? <div className="faint">搜索中…</div> : null}
              {searchError ? <div className="err-card">{searchError}</div> : null}
              {!searchLoading && !searchError && searchResults.length === 0 ? (
                <div className="faint">没有找到匹配的内容</div>
              ) : null}
              {searchResults.map((result) => (
                <button
                  key={`${result.type}-${result.path}-${result.title}`}
                  type="button"
                  className="search-result-item"
                  onClick={(event) => {
                    event.stopPropagation();
                    openSearchResult(result);
                  }}
                >
                  <span className="search-result-head">
                    <span className="search-result-title">{result.title || result.path}</span>
                    <span className="tag">{SEARCH_TYPE_LABELS[result.type] ?? result.type}</span>
                  </span>
                  <span className="search-result-snippet">{summarizeSearchContent(result.content)}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              {treeLoading ? <div className="faint">章节加载中…</div> : null}
              {treeError ? <div className="err-card">{treeError}</div> : null}
              {!treeLoading && !treeError && !projectTree ? <div className="faint">还没有项目，去「项目」页新建一本书</div> : null}
              {!treeLoading && !treeError && projectTree && projectTree.novels.length === 0 ? (
                <div className="faint">该项目还没有卷</div>
              ) : null}
              {!treeLoading && !treeError && projectTree && projectTree.novels.length > 0 && projectTree.novels.every((novel) => novel.chapters.length === 0) ? (
                <div className="faint">该项目还没有章节，点 + 新建</div>
              ) : null}
              <div
                className={`tree-loose-drop ${dragTargetNovelId === "main" ? "drag-over" : ""}`}
                onDragOver={(event) => dragChapterOverNovel(event, "main")}
                onDragLeave={(event) => leaveChapterDropTarget(event, "main")}
                onDrop={(event) => void dropChapterOnNovel(event, "main")}
              >
                {looseNovel?.chapters.map((chapterItem) => (
                  <button
                    key={chapterItem.id}
                    type="button"
                    draggable
                    className={`tree-item ${selectedNovelId === null && activeId === chapterItem.id ? "active" : ""}`}
                    onDragStart={(event) => startChapterDrag(event, "main", chapterItem)}
                    onDragEnd={clearChapterDrag}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedNovelId(null);
                      setActiveId(chapterItem.id);
                      setMobilePanel("editor");
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedNovelId(null);
                      setTreeContextMenu({
                        kind: "chapter",
                        x: event.clientX,
                        y: event.clientY,
                        chapter: chapterItem,
                        novelId: "main",
                      });
                    }}
                  >
                    <span className={`dot ${CHAPTER_STATUS_DOT_CLASS[chapterItem.status]}`} />
                    <span className="t-title">{chapterItem.title}</span>
                    <span className="tree-word-count">{formatWordCount(chapterItem.wordCount)}</span>
                  </button>
                ))}
              </div>
              {userNovels.map((novel) => (
                <div key={novel.novelId}>
                  <div
                    className={`tree-group-label ${selectedNovelId === novel.novelId ? "active" : ""} ${dragTargetNovelId === novel.novelId ? "drag-over" : ""}`}
                    onDragOver={(event) => dragChapterOverNovel(event, novel.novelId)}
                    onDragLeave={(event) => leaveChapterDropTarget(event, novel.novelId)}
                    onDrop={(event) => void dropChapterOnNovel(event, novel.novelId)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedNovelId(novel.novelId);
                      setExpandedNovels((current) => ({ ...current, [novel.novelId]: !current[novel.novelId] }));
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedNovelId(novel.novelId);
                      setTreeContextMenu({
                        kind: "novel",
                        x: event.clientX,
                        y: event.clientY,
                        novel,
                      });
                    }}
                  >
                    <button
                      type="button"
                      className="tree-group-toggle"
                    >
                      {expandedNovels[novel.novelId] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span>{novel.title}</span>
                    </button>
                    <span className="tree-word-count">{formatWordCount(novel.chapters.reduce((sum, chapterItem) => sum + chapterItem.wordCount, 0))}</span>
                  </div>
                  {expandedNovels[novel.novelId]
                    ? novel.chapters.map((chapterItem) => (
                        <button
                          key={chapterItem.id}
                          type="button"
                          draggable
                          className={`tree-item ${selectedNovelId === null && activeId === chapterItem.id ? "active" : ""}`}
                          onDragStart={(event) => startChapterDrag(event, novel.novelId, chapterItem)}
                          onDragEnd={clearChapterDrag}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedNovelId(null);
                            setActiveId(chapterItem.id);
                            setMobilePanel("editor");
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setSelectedNovelId(null);
                            setTreeContextMenu({
                              kind: "chapter",
                              x: event.clientX,
                              y: event.clientY,
                              chapter: chapterItem,
                              novelId: novel.novelId,
                            });
                          }}
                        >
                          <span className={`dot ${CHAPTER_STATUS_DOT_CLASS[chapterItem.status]}`} />
                          <span className="t-title">{chapterItem.title}</span>
                          <span className="tree-word-count">{formatWordCount(chapterItem.wordCount)}</span>
                        </button>
                      ))
                    : null}
                </div>
              ))}
            </>
          )}
        </div>
        {treeContextMenu ? (
          <div
            ref={treeContextMenuRef}
            className="tree-context-menu"
            style={{ left: treeContextMenu.x, top: treeContextMenu.y }}
            role="menu"
          >
            {treeContextMenu.kind === "chapter" ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void renameChapter(treeContextMenu.novelId, treeContextMenu.chapter)}
                >
                  重命名
                </button>
                <div className="tree-context-submenu" role="group" aria-label="移动章节目标">
                  <div className="tree-context-submenu-title">移动到...</div>
                  {[
                    ...(treeContextMenu.novelId === "main" ? [] : [{ novelId: "main", title: "散章区" }]),
                    ...userNovels
                      .filter((novel) => novel.novelId !== treeContextMenu.novelId)
                      .map((novel) => ({ novelId: novel.novelId, title: novel.title })),
                  ].map((target) => (
                    <button
                      key={target.novelId}
                      type="button"
                      role="menuitem"
                      onClick={() => void moveChapter(treeContextMenu.novelId, treeContextMenu.chapter, target.novelId)}
                    >
                      {target.title}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => void deleteChapter(treeContextMenu.novelId, treeContextMenu.chapter)}
                >
                  删除
                </button>
                <div className="tree-context-submenu" role="group" aria-label="设置章节状态">
                  <div className="tree-context-submenu-title">设置状态</div>
                  {CHAPTER_STATUS_VALUES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      role="menuitem"
                      onClick={() => void setChapterStatus(treeContextMenu.novelId, treeContextMenu.chapter, status)}
                    >
                      {CHAPTER_STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <button type="button" role="menuitem" onClick={() => void renameNovel(treeContextMenu.novel)}>
                  重命名
                </button>
                <button type="button" role="menuitem" onClick={() => void createChapterInNovel(treeContextMenu.novel.novelId)}>
                  新建章节
                </button>
                <button type="button" role="menuitem" className="danger" onClick={() => void deleteNovel(treeContextMenu.novel)}>
                  删除卷
                </button>
              </>
            )}
          </div>
        ) : null}
      </aside>

      <section className="editor-pane">
        <div className="editor-scroll">
          <div className={`editor-workbench${focusMode ? " focus-mode" : ""}`}>
            <div className="paper">
              <div className="paper-toolbar">
                {TOOLS.map((tool, index) =>
                  "sep" in tool ? (
                    <span className="sep" key={index} />
                  ) : (
                    <button
                      type="button"
                      className={`btn-icon ${
                        (tool.kind === "outline" && outlinePopoverOpen) ||
                        (tool.kind === "annotations" && inspectorTab === "annotations") ||
                        (tool.kind === "locks" && inspectorTab === "locks") ||
                        (editorMode === "rich" && tool.kind === "bold" && editor?.isActive("bold")) ||
                        (editorMode === "rich" && tool.kind === "italic" && editor?.isActive("italic")) ||
                        (editorMode === "rich" && tool.kind === "heading" && editor?.isActive("heading", { level: 2 })) ||
                        (editorMode === "rich" && tool.kind === "quote" && editor?.isActive("blockquote")) ||
                        (editorMode === "rich" && tool.kind === "list" && editor?.isActive("bulletList"))
                          ? "toolbar-active"
                          : ""
                      }`}
                      ref={tool.kind === "outline" ? outlineButtonRef : undefined}
                      key={tool.kind}
                      title={tool.label}
                      disabled={
                        (!hasValidActiveChapter && tool.kind !== "undo" && tool.kind !== "redo") ||
                        (editorMode === "source" && ["bold", "italic", "heading", "quote", "list"].includes(tool.kind))
                      }
                      onClick={() => {
                        if (tool.kind === "undo") {
                          undo();
                          return;
                        }
                        if (tool.kind === "redo") {
                          redo();
                          return;
                        }
                        if (tool.kind === "bold") {
                          runEditorCommand((activeEditor) => activeEditor.chain().focus().toggleBold().run());
                          return;
                        }
                        if (tool.kind === "italic") {
                          runEditorCommand((activeEditor) => activeEditor.chain().focus().toggleItalic().run());
                          return;
                        }
                        if (tool.kind === "heading") {
                          runEditorCommand((activeEditor) => activeEditor.chain().focus().toggleHeading({ level: 2 }).run());
                          return;
                        }
                        if (tool.kind === "quote") {
                          runEditorCommand((activeEditor) => activeEditor.chain().focus().toggleBlockquote().run());
                          return;
                        }
                        if (tool.kind === "list") {
                          runEditorCommand((activeEditor) => activeEditor.chain().focus().toggleBulletList().run());
                          return;
                        }
                        if (tool.kind === "outline") {
                          setOutlinePopoverOpen((open) => !open);
                          return;
                        }
                        if (tool.kind === "annotations" || tool.kind === "locks") {
                          setInspectorTab(tool.kind);
                          setMobilePanel("inspector");
                        }
                        if (tool.kind === "run") {
                          setInspectorTab(tool.kind);
                          setMobilePanel("inspector");
                        }
                      }}
                    >
                      <tool.Icon size={17} strokeWidth={1.75} />
                    </button>
                  ),
                )}
                <div className="editor-mode-switch segmented" role="tablist" aria-label="编辑模式">
                  <button
                    type="button"
                    className={editorMode === "rich" ? "on" : ""}
                    onClick={() => switchEditorMode("rich")}
                  >
                    普通模式
                  </button>
                  <button
                    type="button"
                    className={editorMode === "source" ? "on" : ""}
                    onClick={() => switchEditorMode("source")}
                  >
                    代码模式
                  </button>
                </div>
                <span className="grow" />
                <button
                  type="button"
                  className={`btn ${quickLookupOpen ? "toolbar-active" : ""}`}
                  onClick={openQuickLookup}
                  disabled={!lookupProjectId}
                >
                  <Search size={15} strokeWidth={2} />
                  速查
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={openReviewConfirm}
                  disabled={reviewing || !hasValidActiveChapter}
                >
                  <Check size={15} strokeWidth={2} />
                  {reviewing ? `质检中 ${reviewElapsedSeconds}s` : "一键质检"}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={openPolishConfirm}
                  disabled={polishing || executingTaskId !== null || !hasValidActiveChapter}
                >
                  <Sparkles size={15} strokeWidth={2} />
                  {polishing ? `润色中 ${polishElapsedSeconds}s` : "一键润色"}
                </button>
                <button type="button" className="btn" onClick={toggleFocusMode}>
                  {focusMode ? <Minimize2 size={15} strokeWidth={2} /> : <Maximize2 size={15} strokeWidth={2} />}
                  {focusMode ? "退出专注" : "专注模式"}
                </button>
              </div>
              {outlinePopoverOpen ? (
                <div className="outline-popover" ref={outlinePopoverRef}>
                  <div className="outline-popover-head">
                    <span>大纲</span>
                    <button type="button" className="btn-icon" title="关闭" onClick={() => setOutlinePopoverOpen(false)}>
                      ×
                    </button>
                  </div>
                  <div className="outline-popover-list">
                    {outline.length === 0 ? (
                      <div className="outline-empty">正文还没有可提取的标题。在正文中用 # 开头创建标题即可</div>
                    ) : (
                      outline.map((item) => (
                        <button
                          type="button"
                          className="outline-popover-item"
                          key={item.id}
                          onClick={() => jumpToOutlineItem(item.line)}
                        >
                          <span className="outline-item-title">{item.label}</span>
                          <span className="outline-item-sub">第 {item.line} 行 · {item.excerpt}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
              {error && <div className="err-card">{error}</div>}

              <div className="paper-body">
                {hasValidActiveChapter ? (
                  <>
                    <input
                      className="chapter-title chapter-title-input"
                      value={chapterTitleDraft}
                      aria-label="章节标题"
                      onChange={(event) => setChapterTitleDraft(event.target.value)}
                      onBlur={() => void saveChapterTitle()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <div className="title-rule" />
                    {editorMode === "rich" ? (
                      <div className="rich-editor-shell">
                        {editor && !draft.trim() ? (
                          <div className="rich-editor-placeholder">
                            {vaultSelected ? "在此续写正文……" : "选择资料库后即可读写正文。"}
                          </div>
                        ) : null}
                        <EditorContent editor={editor} />
                      </div>
                    ) : (
                      <textarea
                        ref={sourceTextareaRef}
                        className="manuscript source-manuscript"
                        value={draft}
                        spellCheck={false}
                        placeholder={vaultSelected ? "在此编辑 Markdown 源码……" : "选择资料库后即可读写正文。"}
                        onChange={(event) => onEdit(event.target.value)}
                        onSelect={syncSourceSelection}
                        onKeyUp={syncSourceSelection}
                        onMouseUp={syncSourceSelection}
                      />
                    )}
                  </>
                ) : (
                  <div className="editor-empty">
                    <div className="empty-icon">
                      <FilePenLine size={30} strokeWidth={1.6} />
                    </div>
                    <div>{projectTree ? "还没有章节，点左上角 + 新建章节" : "还没有项目，去「项目」页新建一本书"}</div>
                  </div>
                )}
              </div>
            </div>

            {showInspector && !focusMode ? (
              <aside className="inspector-pane">
                <section className="info-card">
                  <h3>工作台深化</h3>
                  <div className="stack-list">
                    <div className="field">
                      <span className="k">当前章节</span>
                      <span className="v stack-align-start">{locator.chapterId}</span>
                    </div>
                    <div className="field">
                      <span className="k">选区范围</span>
                      <span className="v">{selectionRange.start} - {selectionRange.end}</span>
                    </div>
                    <div className="field">
                      <span className="k">专注模式</span>
                      <span className="v">{focusMode ? "已开启" : "关闭"}</span>
                    </div>
                  </div>
                </section>

                <section className="info-card">
                  <div className="tab-strip">
                    <button
                      type="button"
                      className={inspectorTab === "outline" ? "active" : ""}
                      onClick={() => setInspectorTab("outline")}
                    >
                      大纲
                    </button>
                    <button
                      type="button"
                      className={inspectorTab === "annotations" ? "active" : ""}
                      onClick={() => setInspectorTab("annotations")}
                    >
                      批注
                    </button>
                    <button
                      type="button"
                      className={inspectorTab === "locks" ? "active" : ""}
                      onClick={() => setInspectorTab("locks")}
                    >
                      锁定
                    </button>
                    <button
                      type="button"
                      className={inspectorTab === "run" ? "active" : ""}
                      onClick={() => setInspectorTab("run")}
                    >
                      运行
                    </button>
                  </div>

                  {inspectorFeedback ? <div className="inspector-feedback">{inspectorFeedback}</div> : null}

                  {inspectorTab === "outline" ? (
                    <div className="stack-list" style={{ marginTop: 16 }}>
                      {outline.length === 0 ? (
                        <div className="faint">正文还没有可提取的大纲结构。</div>
                      ) : (
                        outline.map((item) => (
                          <div key={item.id} className="mini-card">
                            <div className="mini-card-title">{item.label}</div>
                            <div className="mini-card-sub">第 {item.line} 行 · {item.excerpt}</div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}

                  {inspectorTab === "annotations" ? (
                    <div className="stack-list" style={{ marginTop: 16 }}>
                      <div className="skill-actions" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setAnnotations((items) => [...items, createAnnotationFromSelection(selectionRange.start, selectionRange.end)]);
                            setInspectorFeedback("已从当前选区新建批注草稿");
                          }}
                        >
                          <FilePenLine size={15} strokeWidth={2} />
                          取当前选区
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={annotationsSaving}
                          onClick={() => void saveCurrentAnnotations()}
                        >
                          {annotationsSaving ? "保存中" : "保存批注"}
                        </button>
                      </div>

                      {annotations.length === 0 ? (
                        <div className="faint">还没有批注。</div>
                      ) : (
                        annotations.map((annotation) => (
                          <div key={annotation.id} className="mini-card">
                            <div className="mini-card-title">{annotation.id}</div>
                            <div className="mini-card-sub">范围 {annotation.range.start} - {annotation.range.end}</div>
                            <label className="form-block" style={{ marginTop: 10 }}>
                              <span>批注文本</span>
                              <textarea
                                className="textarea"
                                value={annotation.text}
                                onChange={(event) =>
                                  setAnnotations((items) =>
                                    items.map((item) => item.id === annotation.id ? { ...item, text: event.target.value } : item),
                                  )
                                }
                              />
                            </label>
                            <label className="form-block" style={{ marginTop: 10 }}>
                              <span>可转标签（逗号分隔）</span>
                              <input
                                className="input"
                                value={(annotation.convertibleTo ?? []).join(", ")}
                                onChange={(event) =>
                                  setAnnotations((items) =>
                                    items.map((item) => item.id === annotation.id ? {
                                      ...item,
                                      convertibleTo: event.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                                    } : item),
                                  )
                                }
                              />
                            </label>
                            <div className="skill-actions">
                              <button
                                type="button"
                                className="btn"
                                onClick={() => setAnnotations((items) => items.filter((item) => item.id !== annotation.id))}
                              >
                                <Trash2 size={15} strokeWidth={2} />
                                删除
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}

                  {inspectorTab === "locks" ? (
                    <div className="stack-list" style={{ marginTop: 16 }}>
                      <div className="skill-actions" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setLocks((items) => [...items, createSelectionLock(selectionRange.start, selectionRange.end)]);
                            setInspectorFeedback("已从当前选区新建锁定草稿");
                          }}
                        >
                          <Lock size={15} strokeWidth={2} />
                          取当前选区
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={locksSaving}
                          onClick={() => void saveCurrentLocks()}
                        >
                          {locksSaving ? "保存中" : "保存锁定"}
                        </button>
                      </div>

                      {locks.length === 0 ? (
                        <div className="faint">还没有锁定。</div>
                      ) : (
                        locks.map((lockItem) => (
                          <div key={lockItem.id} className="mini-card">
                            <div className="mini-card-title">{lockItem.id}</div>
                            <div className="form-grid form-grid-2" style={{ marginTop: 10 }}>
                              <label className="form-block">
                                <span>起点</span>
                                <input
                                  className="input"
                                  value={String(lockItem.range.start)}
                                  onChange={(event) =>
                                    setLocks((items) =>
                                      items.map((item) => item.id === lockItem.id ? {
                                        ...item,
                                        range: {
                                          ...item.range,
                                          start: Number(event.target.value) || 0,
                                        },
                                      } : item),
                                    )
                                  }
                                />
                              </label>
                              <label className="form-block">
                                <span>终点</span>
                                <input
                                  className="input"
                                  value={String(lockItem.range.end)}
                                  onChange={(event) =>
                                    setLocks((items) =>
                                      items.map((item) => item.id === lockItem.id ? {
                                        ...item,
                                        range: {
                                          ...item.range,
                                          end: Number(event.target.value) || 0,
                                        },
                                      } : item),
                                    )
                                  }
                                />
                              </label>
                            </div>
                            <div className="form-grid form-grid-2">
                              <label className="form-block">
                                <span>范围类型</span>
                                <input
                                  className="input"
                                  value={lockItem.scope ?? "paragraph"}
                                  onChange={(event) =>
                                    setLocks((items) =>
                                      items.map((item) => item.id === lockItem.id ? { ...item, scope: event.target.value } : item),
                                    )
                                  }
                                />
                              </label>
                              <label className="form-block">
                                <span>锁定级别</span>
                                <input
                                  className="input"
                                  value={lockItem.level ?? "full"}
                                  onChange={(event) =>
                                    setLocks((items) =>
                                      items.map((item) => item.id === lockItem.id ? { ...item, level: event.target.value } : item),
                                    )
                                  }
                                />
                              </label>
                            </div>
                            <div className="skill-actions">
                              <button
                                type="button"
                                className="btn"
                                onClick={() => setLocks((items) => items.filter((item) => item.id !== lockItem.id))}
                              >
                                <Trash2 size={15} strokeWidth={2} />
                                删除
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}

                  {inspectorTab === "run" ? (
                    <div className="stack-list" style={{ marginTop: 16 }}>
                      {runsLoading ? (
                        <div className="faint">运行记录加载中…</div>
                      ) : null}

                      {recentRuns.length === 0 && !runsLoading ? (
                        <div className="faint">当前章节还没有运行记录。</div>
                      ) : null}

                      {recentRuns.length > 0 ? (
                        <div className="list-card">
                          <div className="list-row head">
                            <span className="col col-grow">运行</span>
                            <span className="col" style={{ width: 86 }}>状态</span>
                          </div>
                          {recentRuns.map((item) => (
                            <button
                              type="button"
                              key={item.id}
                              className={`list-row ${selectedRun?.id === item.id ? "active" : ""}`}
                              onClick={() => setSelectedRunId(item.id)}
                            >
                              <span className="col col-grow">
                                <div className="col-name">{item.id}</div>
                                <div className="col-sub">{item.startedAt ?? item.createdAt ?? "未记录时间"}</div>
                              </span>
                              <span className="col" style={{ width: 86 }}>
                                <span className={`tag ${item.status === "done" || item.status === "succeeded" ? "primary" : ""}`}>
                                  {item.status}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {selectedRun ? (
                        <div className="stack-list">
                          <section className="mini-card">
                            <div className="mini-card-title">运行摘要</div>
                            <div className="field">
                              <span className="k">工作流</span>
                              <span className="v">{selectedRun.workflowId ?? "默认"}</span>
                            </div>
                            <div className="field">
                              <span className="k">Token</span>
                              <span className="v">{selectedRun.tokens ? `${selectedRun.tokens.in} / ${selectedRun.tokens.out}` : "未记录"}</span>
                            </div>
                            <div className="field">
                              <span className="k">成本</span>
                              <span className="v">{selectedRun.cost === undefined ? "未记录" : selectedRun.cost}</span>
                            </div>
                            <div className="field">
                              <span className="k">上下文源</span>
                              <span className="v">{selectedRun.contextSources?.length ?? 0}</span>
                            </div>
                          </section>

                          <section className="mini-card">
                            <div className="mini-card-title">智能体节点</div>
                            <div className="stack-list" style={{ marginTop: 10 }}>
                              {(selectedRun.nodes ?? selectedRun.steps ?? []).map((node) => (
                                <div key={`${selectedRun.id}-${node.agentId}`} className="quote-line">
                                  <div className="mini-card-title">{node.agentName ?? node.agentId}</div>
                                  <div className="mini-card-sub">
                                    状态 {node.status}
                                    {node.mustRewrite ? " · 触发重写" : ""}
                                    {node.hardViolations ? ` · 硬违规 ${node.hardViolations}` : ""}
                                    {node.softViolations ? ` · 软违规 ${node.softViolations}` : ""}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </aside>
            ) : null}
          </div>
        </div>

        <div className="editor-statusbar">
          <span>
            <span className={`save-dot ${saveState}`} />
            {saveState === "saving"
              ? "保存中…"
              : saveState === "dirty"
                ? "未保存"
                : saveState === "error"
                  ? "保存失败"
                  : saveState === "saved"
                    ? "已保存"
                    : "就绪"}
          </span>
          <span className="grow" />
          <span>字数 {metadataWordCount}</span>
          <span>批注 {metadataAnnotationsCount}</span>
          <span>锁定 {metadataLocksCount}</span>
        </div>
      </section>

      <aside className="chat-pane">
        <div className="chat-head">
          <div className="chat-avatar">
            <Bot size={20} strokeWidth={1.75} />
          </div>
          <div>
            <div className="ch-name">总控 · 书灵</div>
            <div className="ch-sub">对话式创作顾问</div>
          </div>
        </div>

        <div className="chat-scroll">
          {messages.map((message) =>
            message.kind === "run" ? (
              <RunInline key={message.id} agents={agents} run={run} stepStatus={stepStatus} watchedAgentIds={watchedAgentIds} />
            ) : message.kind === "ai-result" ? (
              <div className="msg ai msg-task" key={message.id}>
                <span className="msg-av ai">
                  <Bot size={15} strokeWidth={1.75} />
                </span>
                <div className="msg-bubble task-confirm-card">
                  <div className="task-confirm-text">{message.text}</div>
                  <div className="task-confirm-meta">
                    <span>{message.agentName}</span>
                    <span>{message.undone ? "已撤销" : "已完成"}</span>
                  </div>
                  {!message.undone ? (
                    <div className="task-confirm-actions">
                      <button className="btn btn-ghost" type="button" onClick={() => undoAiResult(message.id)}>
                        <Undo2 size={14} strokeWidth={1.8} />
                        撤销本次 AI 修改
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : message.kind === "confirm" ? (
              <div className="msg ai msg-task" key={message.id}>
                <span className="msg-av ai">
                  <Bot size={15} strokeWidth={1.75} />
                </span>
                <div className="msg-bubble task-confirm-card">
                  <div className="task-confirm-text">{message.task.confirmText}</div>
                  <div className="task-confirm-meta">
                    <span>{message.task.agentName}</span>
                    <span>
                      {message.status === "pending"
                        ? "待确认"
                        : message.status === "confirmed"
                          ? "已确认"
                          : "已取消"}
                    </span>
                  </div>
                  {message.status === "pending" ? (
                    <div className="task-confirm-actions">
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => confirmDirectorTask(message.id, message.task)}
                        disabled={executingTaskId !== null}
                      >
                        <Check size={14} strokeWidth={1.8} />
                        {executingTaskId === message.id ? "执行中…" : "确认执行"}
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => cancelDirectorTask(message.id)}
                        disabled={executingTaskId !== null}
                      >
                        <X size={14} strokeWidth={1.8} />
                        取消
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className={`msg ${message.role}`} key={message.id}>
                <span className={`msg-av ${message.role === "ai" ? "ai" : ""}`}>
                  {message.role === "ai" ? <Bot size={15} strokeWidth={1.75} /> : <PenLine size={14} strokeWidth={1.75} />}
                </span>
                <div className="msg-bubble">{message.text}</div>
              </div>
            ),
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input">
          {conversationSaveError ? <div className="chat-hint error">对话历史保存失败：{conversationSaveError}</div> : null}
          <div className="chat-input-box">
            <textarea
              rows={1}
              value={chatInput}
              placeholder="和总控聊聊这一章的思路、问题或写法……"
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={onChatKey}
              disabled={chatSending}
            />
            <button
              type="button"
              className="chat-send"
              disabled={chatSending || !chatInput.trim()}
              onClick={() => void onSend()}
              title="发送"
            >
              <ArrowUp size={18} strokeWidth={2} />
            </button>
          </div>
          <div className="chat-hint">
            {preferences.sendShortcut === "enter"
              ? `Enter 发送 · Shift+Enter 换行 · 自动保存 ${preferences.autosaveDelayMs}ms`
              : `Ctrl/Cmd+Enter 发送 · Enter 换行 · 自动保存 ${preferences.autosaveDelayMs}ms`}
          </div>
        </div>
      </aside>
    </div>
    {promptRequest ? (
      <InputModal
        {...promptRequest}
        onCancel={closePrompt}
      />
    ) : null}
    {confirmRequest ? (
      <ConfirmModal
        {...confirmRequest}
        onCancel={closeConfirm}
      />
    ) : null}
    {reviewing || reviewReports || reviewError ? (
      <ReviewReportModal
        reviewing={reviewing}
        elapsedSeconds={reviewElapsedSeconds}
        reports={reviewReports}
        error={reviewError}
        onClose={() => {
          if (!reviewing) {
            setReviewReports(null);
            setReviewError(null);
          }
        }}
      />
    ) : null}
    {quickLookupOpen ? (
      <QuickLookupPanel
        tab={quickLookupTab}
        query={quickLookupQuery}
        loading={quickLookupLoading}
        error={quickLookupError}
        projectId={lookupProjectId}
        characters={filteredQuickLookupCharacters}
        worldbook={filteredQuickLookupWorldbook}
        expandedId={expandedQuickLookupId}
        totalCharacters={quickLookupCharacters.length}
        totalWorldbook={quickLookupWorldbook.length}
        onTabChange={(tab) => {
          setQuickLookupTab(tab);
          setExpandedQuickLookupId(null);
        }}
        onQueryChange={setQuickLookupQuery}
        onToggleExpand={(id) => setExpandedQuickLookupId((current) => current === id ? null : id)}
        onRefresh={() => void loadQuickLookup(lookupProjectId)}
        onClose={() => setQuickLookupOpen(false)}
      />
    ) : null}
    </>
  );
}

function ReviewReportModal({
  reviewing,
  elapsedSeconds,
  reports,
  error,
  onClose,
}: {
  reviewing: boolean;
  elapsedSeconds: number;
  reports: DirectorReviewReport[] | null;
  error: string | null;
  onClose(): void;
}) {
  const successCount = reports?.filter((report) => report.status === "success").length ?? 0;
  const failedCount = reports?.filter((report) => report.status === "failed").length ?? 0;

  return (
    <div className="vault-modal-backdrop" onMouseDown={reviewing ? undefined : onClose}>
      <div className="vault-modal review-report-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="review-report-head">
          <div>
            <h2>章节质检报告</h2>
            <p>本报告只用于检查问题，不会修改正文。</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} disabled={reviewing} aria-label="关闭">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {reviewing ? (
          <div className="review-running-card">
            <RefreshCw size={17} strokeWidth={2} className="spin-icon" />
            <span>检查类智能体正在串行质检…（已用 {elapsedSeconds} 秒）</span>
          </div>
        ) : null}

        {error ? <div className="err-card">{error}</div> : null}

        {reports ? (
          <>
            <div className="tag-row review-report-summary">
              <span className="tag primary">完成 {successCount}</span>
              {failedCount > 0 ? <span className="tag">失败 {failedCount}</span> : null}
              <span className="tag">只查不改</span>
            </div>
            <div className="review-report-list">
              {reports.map((report) => (
                <section className={`review-report-card ${report.status}`} key={report.agentId}>
                  <div className="review-report-card-head">
                    <div>
                      <strong>{report.agentName}</strong>
                      <span>{report.agentId}</span>
                    </div>
                    <span className={report.status === "success" ? "tag primary" : "tag"}>
                      {report.status === "success" ? "已完成" : "检查失败"}
                    </span>
                  </div>
                  {report.modelId ? <div className="mini-card-sub">模型：{report.modelId}</div> : null}
                  <pre className="review-report-text">{report.text || "未发现问题"}</pre>
                </section>
              ))}
            </div>
          </>
        ) : null}

        <div className="vault-modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose} disabled={reviewing}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickLookupPanel({
  tab,
  query,
  loading,
  error,
  projectId,
  characters,
  worldbook,
  expandedId,
  totalCharacters,
  totalWorldbook,
  onTabChange,
  onQueryChange,
  onToggleExpand,
  onRefresh,
  onClose,
}: {
  tab: QuickLookupTab;
  query: string;
  loading: boolean;
  error: string | null;
  projectId: string;
  characters: Character[];
  worldbook: WorldbookEntry[];
  expandedId: string | null;
  totalCharacters: number;
  totalWorldbook: number;
  onTabChange(tab: QuickLookupTab): void;
  onQueryChange(value: string): void;
  onToggleExpand(id: string): void;
  onRefresh(): void;
  onClose(): void;
}) {
  const activeCount = tab === "characters" ? characters.length : worldbook.length;

  return (
    <aside className="quick-lookup-panel" aria-label="写作速查">
      <div className="quick-lookup-head">
        <div>
          <h2>写作速查</h2>
          <p>{projectId ? `当前项目：${projectId}` : "暂无项目"}</p>
        </div>
        <button type="button" className="btn-icon" aria-label="关闭速查" onClick={onClose}>
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="quick-lookup-tabs segmented" role="tablist" aria-label="速查类型">
        <button type="button" className={tab === "characters" ? "on" : ""} onClick={() => onTabChange("characters")}>
          角色 {totalCharacters}
        </button>
        <button type="button" className={tab === "worldbook" ? "on" : ""} onClick={() => onTabChange("worldbook")}>
          世界大纲 {totalWorldbook}
        </button>
      </div>

      <div className="quick-lookup-search">
        <Search size={15} strokeWidth={1.8} />
        <input
          value={query}
          placeholder={tab === "characters" ? "搜索角色、身份、简介" : "搜索设定、关键词、描述"}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {query ? (
          <button type="button" className="tree-search-clear" aria-label="清空搜索" onClick={() => onQueryChange("")}>
            <X size={13} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      {error ? <div className="quick-lookup-error">{error}</div> : null}

      <div className="quick-lookup-body">
        {loading ? (
          <div className="quick-lookup-empty">
            <RefreshCw size={16} strokeWidth={2} className="spin-icon" />
            <span>正在加载速查资料...</span>
          </div>
        ) : activeCount === 0 ? (
          <div className="quick-lookup-empty">
            {projectId ? "没有匹配的资料。" : "暂无项目，请先创建项目。"}
            <button type="button" className="btn btn-ghost" onClick={onRefresh} disabled={!projectId}>
              重新加载
            </button>
          </div>
        ) : tab === "characters" ? (
          characters.map((character) => (
            <QuickCharacterCard
              key={character.id}
              character={character}
              expanded={expandedId === `character:${character.id}`}
              onToggle={() => onToggleExpand(`character:${character.id}`)}
            />
          ))
        ) : (
          worldbook.map((entry) => (
            <QuickWorldbookCard
              key={entry.id}
              entry={entry}
              expanded={expandedId === `worldbook:${entry.id}`}
              onToggle={() => onToggleExpand(`worldbook:${entry.id}`)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function QuickCharacterCard({
  character,
  expanded,
  onToggle,
}: {
  character: Character;
  expanded: boolean;
  onToggle(): void;
}) {
  const basic = character.profile?.basic ?? {};
  const appearance = character.profile?.appearance ?? {};
  const language = character.profile?.language ?? {};
  const belief = character.profile?.belief ?? {};
  const custom = Object.values(character.profile?.custom ?? {}).flat().filter((item) => item?.label || item?.value);

  return (
    <article className={`quick-lookup-item${expanded ? " expanded" : ""}`}>
      <button type="button" className="quick-lookup-item-main" onClick={onToggle}>
        <span className="quick-lookup-avatar">{character.name.slice(0, 1) || "角"}</span>
        <span className="quick-lookup-title-block">
          <strong>{character.name || "未命名角色"}</strong>
          <span>{characterOneLine(character) || "暂无一句话介绍"}</span>
        </span>
        {expanded ? <ChevronDown size={15} strokeWidth={2} /> : <ChevronRight size={15} strokeWidth={2} />}
      </button>

      {expanded ? (
        <div className="quick-lookup-detail">
          <QuickField label="身份" value={firstText(basic.occupation, character.role)} />
          <QuickField label="年龄/性别" value={[basic.age, basic.genderPronouns].filter(Boolean).join(" / ")} />
          <QuickField label="外貌印象" value={firstText(appearance.firstImpression, appearance.appearanceImpression)} />
          <QuickField label="说话方式" value={firstText(language.speakingStyle, language.catchphrases)} />
          <QuickField label="当前目标" value={firstText(belief.currentGoal, belief.coreMotivation)} />
          <QuickField label="标签" value={joinValues(character.tags)} />
          {custom.slice(0, 4).map((item, index) => (
            <QuickField key={`${character.id}-custom-${index}`} label={item.label || "自定义"} value={item.value} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function QuickWorldbookCard({
  entry,
  expanded,
  onToggle,
}: {
  entry: WorldbookEntry;
  expanded: boolean;
  onToggle(): void;
}) {
  const basic = entry.profile?.basic ?? {};
  const content = entry.profile?.content ?? {};
  const writing = entry.profile?.writing ?? {};
  const custom = Object.values(entry.profile?.custom ?? {}).flat().filter((item) => item?.label || item?.value);

  return (
    <article className={`quick-lookup-item${expanded ? " expanded" : ""}`}>
      <button type="button" className="quick-lookup-item-main" onClick={onToggle}>
        <span className="quick-lookup-avatar outline">纲</span>
        <span className="quick-lookup-title-block">
          <strong>{worldbookTitle(entry) || "未命名设定"}</strong>
          <span>{worldbookSummary(entry) || "暂无简介"}</span>
        </span>
        {expanded ? <ChevronDown size={15} strokeWidth={2} /> : <ChevronRight size={15} strokeWidth={2} />}
      </button>

      {expanded ? (
        <div className="quick-lookup-detail">
          <QuickField label="类型" value={entry.category ? QUICK_WORLDBOOK_CATEGORY_LABELS[entry.category] ?? entry.category : ""} />
          <QuickField label="重要程度" value={entry.importance ? QUICK_IMPORTANCE_LABELS[entry.importance] ?? entry.importance : ""} />
          <QuickField label="关键词" value={joinValues(entry.keywords)} />
          <QuickField label="详细描述" value={firstText(entry.description, entry.profile?.basic?.description)} multiline />
          <QuickField label="特性/机制" value={firstText(content.traits, content.mechanism, content.function)} multiline />
          <QuickField label="写作注意" value={firstText(writing.writingNotes, writing.mood)} multiline />
          <QuickField label="相关角色" value={joinValues(entry.relatedCharacters)} />
          {custom.slice(0, 4).map((item, index) => (
            <QuickField key={`${entry.id}-custom-${index}`} label={item.label || "自定义"} value={item.value} multiline />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function QuickField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value?: string;
  multiline?: boolean;
}) {
  return (
    <div className={`quick-lookup-field${multiline ? " multiline" : ""}`}>
      <span>{label}</span>
      <p>{compactText(value)}</p>
    </div>
  );
}

function RunInline({
  agents,
  run,
  stepStatus,
  watchedAgentIds,
}: {
  agents: AgentInfo[];
  run: RunRecord | null;
  stepStatus: (id: string) => string;
  watchedAgentIds: Set<string>;
}) {
  const statuses = run?.nodes ?? run?.steps ?? [];
  const done = statuses.filter((step) => step.status === "done" || step.status === "succeeded").length;
  const pct = agents.length ? Math.round((done / agents.length) * 100) : 0;

  return (
    <div className="run-inline">
      <div className="run-inline-head">
        <span className="ri-title">9 位智能体协作</span>
        <span className="badge">{done}/{agents.length}</span>
      </div>
      <div className="run-progress">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="flow">
        {agents.map((agent, index) => {
          const status = stepStatus(agent.id);
          const watched = watchedAgentIds.has(agent.id);
          const ringClass = status === "done" || status === "succeeded"
            ? "done"
            : status === "running"
              ? "running"
              : status === "failed"
                ? "error"
                : "";
          return (
            <div className={`flow-row ${ringClass}${watched ? " watched" : ""}`} key={agent.id}>
              <span className={`ring ${ringClass}`}>
                {(status === "done" || status === "succeeded") && <Check size={11} strokeWidth={3} />}
                {status === "failed" && <AlertCircle size={11} strokeWidth={2.5} />}
              </span>
              <span className="f-name">{agent.name}</span>
              <span className="f-order">{agent.order ?? index + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
