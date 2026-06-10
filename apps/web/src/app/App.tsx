import { useState, type ComponentType } from "react";
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
  { id: "worldbook", icon: Globe, label: "世界书" },
  { id: "agents", icon: Bot, label: "Agent" },
  { id: "skills", icon: Sparkles, label: "Skill" },
  { id: "rules", icon: Scale, label: "规则" },
];

const SETTINGS_NAV: NavItem = { id: "settings", icon: Settings, label: "设置" };
const NAV = [...PRIMARY_NAV, SETTINGS_NAV];

const VIEWS: Record<string, ComponentType> = {
  workspace: WorkspaceView,
  projects: ProjectsView,
  characters: CharactersView,
  relations: RelationsView,
  timeline: TimelineView,
  worldbook: WorldbookView,
  agents: AgentsView,
  skills: SkillsView,
  rules: RulesView,
  settings: SettingsView,
};

export function App() {
  const [view, setView] = useState("workspace");
  const Current = VIEWS[view] ?? WorkspaceView;
  const currentLabel = NAV.find((item) => item.id === view)?.label ?? "写作";

  return (
    <div className="app-shell">
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
        <Current />
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
    </div>
  );
}
