import { useEffect, useState, type ReactNode } from "react";
import {
  Bot,
  Clock,
  Globe,
  Library,
  Network,
  PenLine,
  Scale,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { AgentsView } from "../views/AgentsView.js";
import { CharactersView } from "../views/CharactersView.js";
import { ProjectsView } from "../views/ProjectsView.js";
import { RelationsView } from "../views/RelationsView.js";
import { RulesView } from "../views/RulesView.js";
import { SettingsView } from "../views/SettingsView.js";
import { SkillsView } from "../views/SkillsView.js";
import { TimelineView } from "../views/TimelineView.js";
import { WorkspaceView } from "../views/WorkspaceView.js";
import { WorldbookView } from "../views/WorldbookView.js";
import { ToastViewport } from "../views/common.js";
import { api } from "../api/client.js";
import { VaultPickerModal } from "./VaultPickerModal.js";

interface NavItem {
  id: string;
  icon: LucideIcon;
  label: string;
}

const PRIMARY_NAV: NavItem[] = [
  { id: "workspace", icon: PenLine, label: "写作" },
  { id: "projects", icon: Library, label: "项目" },
  { id: "characters", icon: Users, label: "角色" },
  { id: "relations", icon: Network, label: "关系" },
  { id: "timeline", icon: Clock, label: "时间线" },
  { id: "worldbook", icon: Globe, label: "世界大纲" },
  { id: "agents", icon: Bot, label: "智能体" },
  { id: "skills", icon: Sparkles, label: "技能" },
  { id: "rules", icon: Scale, label: "规则" },
];

const SETTINGS_NAV: NavItem = { id: "settings", icon: Settings, label: "设置" };
const NAV = [...PRIMARY_NAV, SETTINGS_NAV];
const COMPACT_LAYOUT_WIDTH = 1366;
const COMPACT_LAYOUT_HEIGHT = 720;

function getCompactLayout() {
  if (typeof window === "undefined") {
    return false;
  }
  const cssViewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const windowWidth = window.outerWidth || window.innerWidth;
  return cssViewportWidth <= COMPACT_LAYOUT_WIDTH || windowWidth <= COMPACT_LAYOUT_WIDTH;
}

function getCompactHeight() {
  if (typeof window === "undefined") {
    return false;
  }
  const cssViewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const windowHeight = window.outerHeight || window.innerHeight;
  return Math.min(cssViewportHeight, windowHeight) <= COMPACT_LAYOUT_HEIGHT;
}

interface AppViewProps {
  currentProjectId: string | null;
  vaultPath: string | null;
  onSelectProject: (projectId: string) => void;
  onNavigate: (viewId: string) => void;
  onWorkspaceFocusModeChange: (active: boolean) => void;
  onSetVault: (path: string) => Promise<void>;
  onClearVault: () => void;
}

const VIEWS: Record<string, (props: AppViewProps) => ReactNode> = {
  workspace: ({ currentProjectId, vaultPath, onNavigate, onWorkspaceFocusModeChange }) => (
    <WorkspaceView currentProjectId={currentProjectId} vaultPath={vaultPath} onNavigate={onNavigate} onFocusModeChange={onWorkspaceFocusModeChange} />
  ),
  projects: ({ onSelectProject }) => <ProjectsView onOpenProject={onSelectProject} />,
  characters: () => <CharactersView />,
  relations: () => <RelationsView />,
  timeline: () => <TimelineView />,
  worldbook: () => <WorldbookView />,
  agents: () => <AgentsView />,
  skills: () => <SkillsView />,
  rules: () => <RulesView />,
  settings: ({ vaultPath, onSetVault, onClearVault }) => (
    <SettingsView vaultPath={vaultPath} onSetVault={onSetVault} onClearVault={onClearVault} />
  ),
};

export function App() {
  const [view, setView] = useState("workspace");
  const [workspaceFocusMode, setWorkspaceFocusMode] = useState(false);
  const [mobileLayout, setMobileLayout] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return getCompactLayout();
  });
  const [compactHeight, setCompactHeight] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return getCompactHeight();
  });
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage.getItem("shulingge.web.projectId");
  });
  const [vaultPath, setVaultPath] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage.getItem("shulingge.web.vaultPath");
  });
  const Current = VIEWS[view] ?? VIEWS.workspace;
  useEffect(() => {
    const updateLayoutMode = () => {
      setMobileLayout(getCompactLayout());
      setCompactHeight(getCompactHeight());
    };
    updateLayoutMode();
    window.addEventListener("resize", updateLayoutMode);
    window.visualViewport?.addEventListener("resize", updateLayoutMode);
    return () => {
      window.removeEventListener("resize", updateLayoutMode);
      window.visualViewport?.removeEventListener("resize", updateLayoutMode);
    };
  }, []);

  const onSelectProject = (projectId: string) => {
    setCurrentProjectId(projectId);
    window.localStorage.setItem("shulingge.web.projectId", projectId);
    setView("workspace");
  };
  const onSetVault = async (path: string) => {
    const nextPath = path.trim();
    if (!nextPath) {
      throw new Error("请输入资料库目录绝对路径");
    }
    await api.selectVault(nextPath);
    window.localStorage.setItem("shulingge.web.vaultPath", nextPath);
    setVaultPath(nextPath);
  };
  const onClearVault = () => {
    window.localStorage.removeItem("shulingge.web.vaultPath");
    setVaultPath(null);
  };
  const currentLabel = NAV.find((item) => item.id === view)?.label ?? "写作";
  const shellClassName = `app-shell ${mobileLayout ? "app-mobile-layout" : "app-desktop-layout"}${compactHeight ? " app-compact-height" : ""}${
    view === "workspace" && workspaceFocusMode ? " app-focus-mode" : ""
  }`;

  return (
    <div className={shellClassName}>
      <nav className="rail">
        <div className="rail-logo">
          <img src="/app-icon.png" alt="书灵阁" />
        </div>
        {PRIMARY_NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              type="button"
              className={`rail-item ${view === n.id ? "active" : ""}`}
              onClick={() => setView(n.id)}
              title={n.label}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden />
              <span className="rail-label">{n.label}</span>
            </button>
          );
        })}
        <div className="rail-spacer" />
        <button
          type="button"
          className={`rail-item ${view === "settings" ? "active" : ""}`}
          onClick={() => setView("settings")}
          title="设置"
        >
          <Settings size={20} strokeWidth={1.75} aria-hidden />
          <span className="rail-label">设置</span>
        </button>
      </nav>

      <div className="main">
        <header className="mobile-shell-header">
          <div className="mobile-shell-brand">
            <img className="mobile-shell-logo" src="/app-icon.png" alt="书灵阁" />
            <div>
              <div className="mobile-shell-title">{currentLabel}</div>
              <div className="mobile-shell-sub">书灵阁 · 本地优先工作台</div>
            </div>
          </div>
        </header>
        {Current({
          currentProjectId,
          vaultPath,
          onSelectProject,
          onNavigate: setView,
          onWorkspaceFocusModeChange: setWorkspaceFocusMode,
          onSetVault,
          onClearVault,
        })}
      </div>

      <nav className="mobile-nav" aria-label="移动导航">
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              type="button"
              className={`mobile-nav-item ${view === n.id ? "active" : ""}`}
              onClick={() => setView(n.id)}
              title={n.label}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden />
              <span>{n.label}</span>
            </button>
          );
        })}
      </nav>
      {!vaultPath ? <VaultPickerModal onSelectVault={onSetVault} /> : null}
      <ToastViewport />
    </div>
  );
}
