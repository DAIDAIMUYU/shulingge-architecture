import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Pencil, Plus, ShieldAlert, Trash2, X } from "lucide-react";

import {
  api,
  ApiError,
  type ProjectSummary,
  type RuleImportFileInput,
  type RuleDetectBy,
  type RuleInput,
  type RuleLevel,
  type RuleOverridePolicy,
  type RuleRecord,
  type RuleScope,
  type RuleViolationAction,
} from "../api/client.js";
import { ConfirmModal } from "../app/Modals.js";
import { ProjectSelector } from "./ProjectSelector.js";
import { Select } from "./Select.js";
import { ViewShell } from "./common.js";

const RULE_LEVEL_OPTIONS: Array<{ value: RuleLevel; label: string; hint: string }> = [
  { value: "locked", label: "锁定", hint: "不可轻易覆盖，适合作品红线" },
  { value: "hard", label: "硬性", hint: "违反时应阻断或返工" },
  { value: "soft", label: "软性", hint: "风格和质量建议" },
  { value: "preference", label: "偏好", hint: "个人写作偏好" },
];

const SCOPE_OPTIONS: Array<{ value: RuleScope; label: string }> = [
  { value: "system", label: "系统" },
  { value: "global", label: "全局" },
  { value: "vault", label: "资料库" },
  { value: "project", label: "项目" },
  { value: "novel", label: "小说" },
  { value: "volume", label: "卷" },
  { value: "chapter", label: "章节" },
  { value: "task", label: "任务" },
  { value: "agent", label: "智能体" },
];

const DETECT_OPTIONS: Array<{ value: RuleDetectBy; label: string }> = [
  { value: "manual", label: "人工判断" },
  { value: "ai-check", label: "AI 检查" },
  { value: "hard-check", label: "程序硬检" },
  { value: "mixed", label: "混合检查" },
];

const VIOLATION_OPTIONS: Array<{ value: RuleViolationAction; label: string }> = [
  { value: "block", label: "阻断" },
  { value: "rewrite", label: "要求重写" },
  { value: "warn", label: "警告" },
  { value: "record", label: "记录" },
  { value: "pause", label: "暂停" },
];

const OVERRIDE_OPTIONS: Array<{ value: RuleOverridePolicy; label: string }> = [
  { value: "no-override", label: "不可覆盖" },
  { value: "locked", label: "锁定" },
  { value: "append-only", label: "仅可追加" },
  { value: "allow-branch-override", label: "允许分支覆盖" },
  { value: "disable-in-branch", label: "分支可停用" },
];

type FeedbackKind = "success" | "error" | "info";
type FeedbackState = { kind: FeedbackKind; message: string };

interface RuleDraft {
  id: string;
  title: string;
  content: string;
  level: RuleLevel;
  scope: RuleScope;
  appliesTo: string;
  detectBy: RuleDetectBy[];
  onViolation: RuleViolationAction;
  enabled: boolean;
  source: string;
  priority: string;
  overridePolicy: RuleOverridePolicy;
  tags: string;
}

function slugify(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `rule-${Date.now()}`;
}

function splitList(value: string): string[] {
  return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function joinList(value?: string[]): string {
  return (value ?? []).join("，");
}

function extractRuleTitleFromMarkdown(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallback.replace(/\.(md|markdown|txt)$/i, "").trim() || "导入规则";
}

function summarizeMarkdown(content: string): string {
  return content.replace(/^#\s+.+$/m, "").replace(/\s+/g, " ").trim().slice(0, 96);
}

function levelLabel(value: RuleLevel): string {
  return RULE_LEVEL_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function scopeLabel(value: RuleScope): string {
  return SCOPE_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function violationLabel(value: RuleViolationAction): string {
  return VIOLATION_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function createDraft(rule?: RuleRecord): RuleDraft {
  return {
    id: rule?.id ?? "",
    title: rule?.title ?? "",
    content: rule?.content ?? "",
    level: rule?.level ?? "soft",
    scope: rule?.scope ?? "project",
    appliesTo: joinList(rule?.appliesTo),
    detectBy: rule?.detectBy?.length ? rule.detectBy : ["manual"],
    onViolation: rule?.onViolation ?? "warn",
    enabled: rule?.enabled ?? true,
    source: rule?.source ?? "user",
    priority: String(rule?.priority ?? 50),
    overridePolicy: rule?.overridePolicy ?? "no-override",
    tags: joinList(rule?.tags),
  };
}

function toPayload(draft: RuleDraft, mode: "create" | "edit"): RuleInput {
  const title = draft.title.trim();
  return {
    id: mode === "create" ? (draft.id.trim() || slugify(title)) : draft.id.trim(),
    title,
    content: draft.content,
    level: draft.level,
    scope: draft.scope,
    appliesTo: splitList(draft.appliesTo),
    detectBy: draft.detectBy,
    onViolation: draft.onViolation,
    enabled: draft.enabled,
    source: draft.source.trim() || "user",
    priority: Number(draft.priority) || 0,
    overridePolicy: draft.overridePolicy,
    tags: splitList(draft.tags),
  };
}

function RuleImportModal({
  projects,
  currentProjectId,
  saving,
  feedback,
  onImport,
  onCancel,
}: {
  projects: ProjectSummary[];
  currentProjectId: string;
  saving: boolean;
  feedback: FeedbackState | null;
  onImport: (targetProjectId: string, payload: {
    files: RuleImportFileInput[];
    level: RuleLevel;
    scope: RuleScope;
    detectBy: RuleDetectBy[];
    onViolation: RuleViolationAction;
    enabled: boolean;
    source: string;
    priority: number;
    overridePolicy: RuleOverridePolicy;
    tags: string[];
  }) => void;
  onCancel: () => void;
}) {
  const [files, setFiles] = useState<RuleImportFileInput[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [targetProjectId, setTargetProjectId] = useState(currentProjectId);
  const [scope, setScope] = useState<RuleScope>("project");
  const [level, setLevel] = useState<RuleLevel>("soft");
  const [detectBy, setDetectBy] = useState<RuleDetectBy[]>(["manual"]);
  const [onViolation, setOnViolation] = useState<RuleViolationAction>("warn");
  const [overridePolicy, setOverridePolicy] = useState<RuleOverridePolicy>("no-override");
  const [tags, setTags] = useState("导入");
  const [localFeedback, setLocalFeedback] = useState<FeedbackState | null>(null);

  const importFiles = useMemo(() => {
    const pasted = pastedText.trim()
      ? [{ fileName: "粘贴规则.md", content: pastedText }]
      : [];
    return [...files, ...pasted].filter((file) => file.content.trim());
  }, [files, pastedText]);

  const toggleDetect = (value: RuleDetectBy, checked: boolean) => {
    const next = checked ? [...detectBy, value] : detectBy.filter((item) => item !== value);
    setDetectBy(next.length ? next : ["manual"]);
  };

  async function handleFiles(nextFiles: FileList | null) {
    if (!nextFiles?.length) {
      return;
    }

    const accepted: RuleImportFileInput[] = [];
    for (const file of Array.from(nextFiles)) {
      if (!/\.(md|markdown|txt)$/i.test(file.name)) {
        setLocalFeedback({ kind: "error", message: `仅支持 .md/.txt 文件：${file.name}` });
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setLocalFeedback({ kind: "error", message: `文件超过 2MB：${file.name}` });
        return;
      }
      accepted.push({ fileName: file.name, content: await file.text() });
    }
    setFiles((current) => [...current, ...accepted]);
    setLocalFeedback({ kind: "success", message: `已读取 ${accepted.length} 个规则文件` });
  }

  function submit() {
    if (!importFiles.length) {
      setLocalFeedback({ kind: "error", message: "请先上传 .md/.txt 文件，或粘贴 markdown 文本" });
      return;
    }
    if (scope === "project" && !targetProjectId) {
      setLocalFeedback({ kind: "error", message: "请选择项目级规则绑定的项目" });
      return;
    }

    onImport(scope === "project" ? targetProjectId : currentProjectId, {
      files: importFiles,
      level,
      scope,
      detectBy,
      onViolation,
      enabled: true,
      source: "import",
      priority: 50,
      overridePolicy,
      tags: splitList(tags),
    });
  }

  return (
    <div className="vault-modal-backdrop" onMouseDown={onCancel}>
      <section className="vault-modal agent-modal rule-import-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="agent-modal-head">
          <div>
            <h2>导入规则</h2>
            <p>上传 markdown/txt 文件或粘贴规则文本，确认预览后批量创建规则。</p>
          </div>
          <button type="button" className="btn-icon" aria-label="关闭" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        <div className="agent-modal-body">
          {feedback ?? localFeedback ? (
            <div className={`model-feedback model-feedback-${(feedback ?? localFeedback)?.kind}`}>
              {(feedback ?? localFeedback)?.kind === "success" ? <CheckCircle2 size={16} /> : (feedback ?? localFeedback)?.kind === "error" ? <AlertCircle size={16} /> : null}
              <span>{(feedback ?? localFeedback)?.message}</span>
            </div>
          ) : null}

          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>上传规则文件</span>
              <input className="input" type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple onChange={(event) => void handleFiles(event.target.files)} />
            </label>
            <label className="form-block">
              <span>生效范围</span>
              <Select
                value={scope}
                options={[
                  { value: "project", label: "项目级" },
                  { value: "global", label: "全局" },
                ]}
                onChange={(nextValue) => setScope(nextValue as RuleScope)}
                ariaLabel="导入规则生效范围"
              />
            </label>
            {scope === "project" ? (
              <label className="form-block">
                <span>绑定项目</span>
                <Select
                  value={targetProjectId}
                  options={projects.map((project) => ({ value: project.projectId, label: project.title }))}
                  onChange={setTargetProjectId}
                  ariaLabel="导入规则绑定项目"
                />
              </label>
            ) : null}
            <label className="form-block">
              <span>级别</span>
              <Select
                value={level}
                options={RULE_LEVEL_OPTIONS.map((option) => ({ value: option.value, label: option.label, hint: option.hint }))}
                onChange={(nextValue) => setLevel(nextValue as RuleLevel)}
                ariaLabel="导入规则级别"
              />
            </label>
            <label className="form-block">
              <span>违规处理</span>
              <Select
                value={onViolation}
                options={VIOLATION_OPTIONS}
                onChange={(nextValue) => setOnViolation(nextValue as RuleViolationAction)}
                ariaLabel="导入规则违规处理"
              />
            </label>
            <label className="form-block">
              <span>覆盖策略</span>
              <Select
                value={overridePolicy}
                options={OVERRIDE_OPTIONS}
                onChange={(nextValue) => setOverridePolicy(nextValue as RuleOverridePolicy)}
                ariaLabel="导入规则覆盖策略"
              />
            </label>
          </div>

          <label className="form-block">
            <span>检测方式</span>
            <div className="agent-checkbox-grid">
              {DETECT_OPTIONS.map((option) => (
                <label className="switch-row" key={option.value}>
                  <input
                    type="checkbox"
                    checked={detectBy.includes(option.value)}
                    onChange={(event) => toggleDetect(option.value, event.target.checked)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </label>

          <label className="form-block">
            <span>标签</span>
            <input className="input" value={tags} onChange={(event) => setTags(event.target.value)} />
          </label>

          <label className="form-block">
            <span>粘贴 markdown 文本</span>
            <textarea className="textarea rule-import-paste" value={pastedText} onChange={(event) => setPastedText(event.target.value)} placeholder="# 规则标题&#10;&#10;规则正文..." />
          </label>

          <div className="list-card rule-import-preview">
            <div className="list-row head">
              <span className="col col-grow">导入预览</span>
              <span className="col" style={{ width: 96 }}>{scope === "global" ? "全局" : "项目级"}</span>
            </div>
            {importFiles.length === 0 ? (
              <div className="center-state" style={{ minHeight: 120 }}>上传文件或粘贴文本后，这里会显示解析出的规则名和摘要。</div>
            ) : (
              importFiles.map((file, index) => {
                const title = extractRuleTitleFromMarkdown(file.content, file.fileName ?? "");
                const summary = summarizeMarkdown(file.content);
                return (
                  <div className="list-row" key={`${file.fileName ?? "paste"}-${index}`}>
                    <span className="col col-grow">
                      <div className="col-name">{title}</div>
                      <div className="col-sub">{summary || "无正文摘要"}</div>
                    </span>
                    <span className="col" style={{ width: 96 }}>
                      <span className="tag">{levelLabel(level)}</span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="vault-modal-actions agent-modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>取消</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? "导入中..." : `确认导入 ${importFiles.length || ""}`}</button>
        </div>
      </section>
    </div>
  );
}

function RuleEditorModal({
  mode,
  draft,
  saving,
  feedback,
  onChange,
  onSave,
  onCancel,
}: {
  mode: "create" | "edit";
  draft: RuleDraft;
  saving: boolean;
  feedback: FeedbackState | null;
  onChange: (patch: Partial<RuleDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const toggleDetect = (value: RuleDetectBy, checked: boolean) => {
    const next = checked ? [...draft.detectBy, value] : draft.detectBy.filter((item) => item !== value);
    onChange({ detectBy: next.length ? next : ["manual"] });
  };

  return (
    <div className="vault-modal-backdrop" onMouseDown={onCancel}>
      <section className="vault-modal agent-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="agent-modal-head">
          <div>
            <h2>{mode === "create" ? "新建规则" : "编辑规则"}</h2>
            <p>规则会保存到当前项目，用于后续检查、质检和写作约束。</p>
          </div>
          <button type="button" className="btn-icon" aria-label="关闭" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        <div className="agent-modal-body">
          {feedback ? (
            <div className={`model-feedback model-feedback-${feedback.kind}`}>
              {feedback.kind === "success" ? <CheckCircle2 size={16} /> : feedback.kind === "error" ? <AlertCircle size={16} /> : null}
              <span>{feedback.message}</span>
            </div>
          ) : null}

          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>规则标题</span>
              <input className="input" value={draft.title} onChange={(event) => onChange({ title: event.target.value })} />
            </label>
            <label className="form-block">
              <span>规则 ID</span>
              <input className="input" value={draft.id} disabled={mode === "edit"} placeholder="留空将按标题生成" onChange={(event) => onChange({ id: event.target.value })} />
            </label>
            <label className="form-block">
              <span>级别</span>
              <Select
                value={draft.level}
                options={RULE_LEVEL_OPTIONS.map((option) => ({ value: option.value, label: option.label, hint: option.hint }))}
                onChange={(nextValue) => onChange({ level: nextValue as RuleLevel })}
                ariaLabel="规则级别"
              />
            </label>
            <label className="form-block">
              <span>适用范围</span>
              <Select
                value={draft.scope}
                options={SCOPE_OPTIONS}
                onChange={(nextValue) => onChange({ scope: nextValue as RuleScope })}
                ariaLabel="适用范围"
              />
            </label>
          </div>

          <label className="form-block">
            <span>规则正文</span>
            <textarea
              className="textarea"
              value={draft.content}
              placeholder="填写规则正文，可保留 Markdown 内容"
              onChange={(event) => onChange({ content: event.target.value })}
            />
          </label>

          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>违反后处理</span>
              <Select
                value={draft.onViolation}
                options={VIOLATION_OPTIONS}
                onChange={(nextValue) => onChange({ onViolation: nextValue as RuleViolationAction })}
                ariaLabel="违反后处理"
              />
            </label>
            <label className="form-block">
              <span>覆盖策略</span>
              <Select
                value={draft.overridePolicy}
                options={OVERRIDE_OPTIONS}
                onChange={(nextValue) => onChange({ overridePolicy: nextValue as RuleOverridePolicy })}
                ariaLabel="覆盖策略"
              />
            </label>
            <label className="form-block">
              <span>优先级</span>
              <input className="input" type="number" value={draft.priority} onChange={(event) => onChange({ priority: event.target.value })} />
            </label>
            <label className="form-block">
              <span>来源</span>
              <input className="input" value={draft.source} onChange={(event) => onChange({ source: event.target.value })} />
            </label>
          </div>

          <label className="form-block">
            <span>检测方式</span>
            <div className="agent-checkbox-grid">
              {DETECT_OPTIONS.map((option) => (
                <label className="switch-row" key={option.value}>
                  <input
                    type="checkbox"
                    checked={draft.detectBy.includes(option.value)}
                    onChange={(event) => toggleDetect(option.value, event.target.checked)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </label>

          <div className="form-grid form-grid-2">
            <label className="form-block">
              <span>适用对象</span>
              <textarea className="textarea" value={draft.appliesTo} placeholder="可填角色、章节、智能体或场景，逗号/换行分隔" onChange={(event) => onChange({ appliesTo: event.target.value })} />
            </label>
            <label className="form-block">
              <span>标签</span>
              <textarea className="textarea" value={draft.tags} placeholder="逗号或换行分隔" onChange={(event) => onChange({ tags: event.target.value })} />
            </label>
          </div>

          <label className="switch-row">
            <input type="checkbox" checked={draft.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />
            <span>启用这条规则</span>
          </label>
        </div>

        <div className="vault-modal-actions agent-modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>取消</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={onSave}>{saving ? "保存中..." : "保存"}</button>
        </div>
      </section>
    </div>
  );
}

export function RulesView() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState("");
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [levelFilter, setLevelFilter] = useState<RuleLevel | "all">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(() => createDraft());
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [modalFeedback, setModalFeedback] = useState<FeedbackState | null>(null);
  const [importFeedback, setImportFeedback] = useState<FeedbackState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<RuleRecord | null>(null);

  const selectedRule = selectedRuleId ? rules.find((rule) => rule.id === selectedRuleId) ?? null : null;
  const filteredRules = useMemo(
    () => rules
      .filter((rule) => levelFilter === "all" || rule.level === levelFilter)
      .sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title)),
    [levelFilter, rules],
  );

  async function loadProjects() {
    try {
      const list = await api.listProjects();
      setProjects(list);
      setProjectId((current) => current && list.some((project) => project.projectId === current) ? current : list[0]?.projectId ?? "");
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "项目列表加载失败" });
    }
  }

  async function loadRules(nextProjectId = projectId) {
    if (!nextProjectId) {
      setRules([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setRules(await api.listRulesByProject(nextProjectId));
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof ApiError ? error.message : "规则列表加载失败" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    void loadRules(projectId);
  }, [projectId]);

  function startCreate() {
    setSelectedRuleId(null);
    setDraft(createDraft());
    setMode("create");
    setModalFeedback(null);
  }

  function startImport() {
    setImportOpen(true);
    setImportFeedback(null);
  }

  function closeImport() {
    setImportOpen(false);
    setImportFeedback(null);
  }

  function startEdit(rule: RuleRecord) {
    setSelectedRuleId(rule.id);
    setDraft(createDraft(rule));
    setMode("edit");
    setModalFeedback(null);
  }

  function closeEditor() {
    setMode("idle");
    setSelectedRuleId(null);
    setDraft(createDraft());
    setModalFeedback(null);
  }

  async function saveRule() {
    const payload = toPayload(draft, mode === "edit" ? "edit" : "create");
    if (!projectId) {
      setModalFeedback({ kind: "error", message: "请先选择项目" });
      return;
    }
    if (!payload.title) {
      setModalFeedback({ kind: "error", message: "请填写规则标题" });
      return;
    }

    setSaving(true);
    setModalFeedback(null);
    try {
      const saved = mode === "edit" && selectedRule
        ? await api.updateRule(projectId, selectedRule.id, payload)
        : await api.createRule(projectId, payload);
      await loadRules(projectId);
      closeEditor();
      setFeedback({ kind: "success", message: mode === "create" ? `规则「${saved.title}」已创建` : `规则「${saved.title}」已保存` });
    } catch (error) {
      setModalFeedback({ kind: "error", message: error instanceof Error ? error.message : "规则保存失败" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(rule: RuleRecord) {
    if (!projectId) {
      return;
    }

    setRuleToDelete(null);
    setFeedback(null);
    try {
      await api.deleteRule(projectId, rule.id);
      await loadRules(projectId);
      if (selectedRuleId === rule.id) {
        closeEditor();
      }
      setFeedback({ kind: "success", message: `规则「${rule.title}」已删除` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "规则删除失败" });
    }
  }

  async function importRuleFiles(targetProjectId: string, payload: Parameters<typeof api.importRules>[1]) {
    if (!targetProjectId) {
      setImportFeedback({ kind: "error", message: "请先选择项目" });
      return;
    }

    setSaving(true);
    setImportFeedback(null);
    try {
      const imported = await api.importRules(targetProjectId, payload);
      if (targetProjectId !== projectId) {
        setProjectId(targetProjectId);
      }
      await loadRules(targetProjectId);
      closeImport();
      setFeedback({ kind: "success", message: `已导入 ${imported.length} 条规则` });
    } catch (error) {
      setImportFeedback({ kind: "error", message: error instanceof Error ? error.message : "规则导入失败" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ViewShell title="规则" subtitle="按项目管理写作约束、硬性红线和风格偏好">
      <div className="stack-list">
        <section className="editor-card">
          <div className="editor-card-head">
            <div>
              <h2>规则列表</h2>
              <p className="view-sub">当前项目共 {rules.length} 条规则，可按级别筛选。</p>
            </div>
            <div className="view-actions">
              <ProjectSelector projects={projects} projectId={projectId} disabled={loading} onChange={setProjectId} />
              <button type="button" className="btn" disabled>
                <ShieldAlert size={15} strokeWidth={2} />
                冲突扫描
              </button>
              <button type="button" className="btn" disabled={!projectId} onClick={startImport}>
                <FileUp size={15} strokeWidth={2} />
                导入规则
              </button>
              <button type="button" className="btn btn-primary" disabled={!projectId} onClick={startCreate}>
                <Plus size={15} strokeWidth={2} />
                新建规则
              </button>
            </div>
          </div>

          {feedback ? (
            <div className={`model-feedback model-feedback-${feedback.kind}`}>
              {feedback.kind === "success" ? <CheckCircle2 size={16} /> : feedback.kind === "error" ? <AlertCircle size={16} /> : null}
              <span>{feedback.message}</span>
            </div>
          ) : null}

          <div className="toolbar-row">
            <div className="segmented">
              <button type="button" className={levelFilter === "all" ? "on" : ""} onClick={() => setLevelFilter("all")}>全部</button>
              {RULE_LEVEL_OPTIONS.map((option) => (
                <button key={option.value} type="button" className={levelFilter === option.value ? "on" : ""} onClick={() => setLevelFilter(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="list-card">
            <div className="list-row head">
              <span className="col col-grow">规则</span>
              <span className="col" style={{ width: 96 }}>级别</span>
              <span className="col" style={{ width: 92 }}>启用</span>
              <span className="col" style={{ width: 82 }}>优先级</span>
              <span className="col" style={{ width: 86 }}>操作</span>
            </div>
            {loading ? (
              <div className="center-state" style={{ minHeight: 220 }}>
                <div className="spinner" />
                <span>正在加载规则...</span>
              </div>
            ) : !projectId ? (
              <div className="center-state" style={{ minHeight: 220 }}>暂无项目，请先去「项目」页新建一本书</div>
            ) : filteredRules.length === 0 ? (
              <div className="center-state" style={{ minHeight: 220 }}>暂无规则，点击「新建规则」创建一条。</div>
            ) : (
              filteredRules.map((rule) => (
                <div className="list-row model-list-row" key={rule.id} role="button" tabIndex={0} onClick={() => startEdit(rule)}>
                  <span className="col col-grow">
                    <div className="col-name">{rule.title}</div>
                    <div className="col-sub">
                      {scopeLabel(rule.scope)} · {violationLabel(rule.onViolation)}
                      {rule.tags.length ? ` · ${rule.tags.join("、")}` : ""}
                    </div>
                  </span>
                  <span className="col" style={{ width: 96 }}>
                    <span className={`tag ${rule.level === "locked" || rule.level === "hard" ? "primary" : ""}`}>{levelLabel(rule.level)}</span>
                  </span>
                  <span className="col" style={{ width: 92 }}>
                    <span className={`tag ${rule.enabled ? "primary" : ""}`}>{rule.enabled ? "启用" : "停用"}</span>
                  </span>
                  <span className="col" style={{ width: 82 }}>{rule.priority}</span>
                  <span className="model-row-actions" style={{ width: 86 }}>
                    <button type="button" className="btn-icon" title="编辑规则" onClick={(event) => { event.stopPropagation(); startEdit(rule); }}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" className="btn-icon danger" title="删除规则" onClick={(event) => { event.stopPropagation(); setRuleToDelete(rule); }}>
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {mode !== "idle" ? (
        <RuleEditorModal
          mode={mode}
          draft={draft}
          saving={saving}
          feedback={modalFeedback}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onSave={() => void saveRule()}
          onCancel={closeEditor}
        />
      ) : null}

      {importOpen ? (
        <RuleImportModal
          projects={projects}
          currentProjectId={projectId}
          saving={saving}
          feedback={importFeedback}
          onImport={(targetProjectId, payload) => void importRuleFiles(targetProjectId, payload)}
          onCancel={closeImport}
        />
      ) : null}

      {ruleToDelete ? (
        <ConfirmModal
          title="删除规则"
          message={`确定删除规则「${ruleToDelete.title}」吗？此操作不可恢复。`}
          confirmText="删除"
          danger
          onConfirm={() => void deleteRule(ruleToDelete)}
          onCancel={() => setRuleToDelete(null)}
        />
      ) : null}
    </ViewShell>
  );
}
