import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Globe, Play, RefreshCw, ShieldAlert, Sparkles, Store, Upload } from "lucide-react";

import {
  api,
  ApiError,
  type SkillExecutionResult,
  type SkillMarketEntry,
  type SkillRegistryRecord,
} from "../api/client.js";
import { CenterState, ViewShell } from "./common.js";
import { buildPermissionBadges, executionModeLabel, formatExecutionOperations, parseJsonObject, splitCsv } from "./skills-utils.js";

const MARKET_STATUS_OPTIONS = ["listed", "hidden", "removed"] as const;

const SKILL_KIND_LABELS: Record<string, string> = {
  normal: "普通",
  tool: "工具",
};

const MARKET_STATUS_LABELS: Record<string, string> = {
  listed: "已上架",
  hidden: "已隐藏",
  removed: "已移除",
};

function formatDate(value?: string): string {
  if (!value) {
    return "未记录";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", { hour12: false });
}

function ratingLabel(entry: SkillMarketEntry | null): string {
  if (!entry) {
    return "未选择";
  }
  if (!entry.ratingCount) {
    return "暂无评分";
  }
  return `${entry.averageRating.toFixed(1)} / 5（${entry.ratingCount} 次）`;
}

export function SkillsView() {
  const [bootLoading, setBootLoading] = useState(true);
  const [vaultMissing, setVaultMissing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [skills, setSkills] = useState<SkillRegistryRecord[]>([]);
  const [market, setMarket] = useState<SkillMarketEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [marketLoading, setMarketLoading] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);

  const [installedSearch, setInstalledSearch] = useState("");
  const [marketQuery, setMarketQuery] = useState("");
  const [marketCategory, setMarketCategory] = useState("");
  const [marketAuthor, setMarketAuthor] = useState("");
  const [marketStatus, setMarketStatus] = useState("");
  const deferredInstalledSearch = useDeferredValue(installedSearch);
  const deferredMarketQuery = useDeferredValue(marketQuery);

  const [manifestSource, setManifestSource] = useState("local-import");
  const [manifestInput, setManifestInput] = useState("{\n  \"id\": \"\",\n  \"schemaVersion\": 1,\n  \"name\": \"\",\n  \"description\": \"\",\n  \"version\": \"1.0.0\",\n  \"tags\": [],\n  \"languages\": [\"zh\"],\n  \"genres\": [\"*\"],\n  \"tasks\": [\"polish\"],\n  \"boundAgents\": [],\n  \"readRequirements\": [],\n  \"ruleFragments\": [],\n  \"prompt\": \"\",\n  \"kind\": \"normal\",\n  \"allowAutoRun\": false,\n  \"allowWriteDraft\": false,\n  \"license\": \"MIT\",\n  \"compatibleVersions\": \">=0.1.0\",\n  \"permissions\": {\n    \"readProject\": true,\n    \"writeProject\": false,\n    \"callAI\": false,\n    \"network\": false,\n    \"runScript\": false,\n    \"runShell\": false,\n    \"accessOutsideFiles\": false,\n    \"readApiKey\": false,\n    \"modifyGlobalRulesOrSkills\": false\n  }\n}");
  const [githubUrl, setGitHubUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const [runArgs, setRunArgs] = useState("{\n  \"command\": \"search\"\n}");
  const [dryRun, setDryRun] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<SkillExecutionResult | null>(null);
  const [executionFeedback, setExecutionFeedback] = useState<string | null>(null);

  const [publishName, setPublishName] = useState("");
  const [publishAuthor, setPublishAuthor] = useState("");
  const [publishSummary, setPublishSummary] = useState("");
  const [publishCategories, setPublishCategories] = useState("");
  const [publishTags, setPublishTags] = useState("");
  const [publishCertified, setPublishCertified] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<string | null>(null);

  const [ratingUser, setRatingUser] = useState("");
  const [ratingScore, setRatingScore] = useState("5");
  const [ratingComment, setRatingComment] = useState("");
  const [reporter, setReporter] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [moderationStatus, setModerationStatus] = useState<(typeof MARKET_STATUS_OPTIONS)[number]>("listed");
  const [moderationCertified, setModerationCertified] = useState(false);
  const [marketActionLoading, setMarketActionLoading] = useState(false);
  const [marketFeedback, setMarketFeedback] = useState<string | null>(null);

  const filteredSkills = useMemo(() => {
    const query = deferredInstalledSearch.trim().toLowerCase();
    if (!query) {
      return skills;
    }

    return skills.filter((skill) =>
      `${skill.id} ${skill.name} ${skill.kind} ${skill.source}`.toLowerCase().includes(query),
    );
  }, [deferredInstalledSearch, skills]);

  const selectedSkill = useMemo(
    () => filteredSkills.find((skill) => skill.id === selectedSkillId) ?? skills.find((skill) => skill.id === selectedSkillId) ?? null,
    [filteredSkills, selectedSkillId, skills],
  );
  const selectedMarket = useMemo(
    () => market.find((entry) => entry.id === selectedMarketId) ?? null,
    [market, selectedMarketId],
  );
  const permissionBadges = useMemo(
    () => buildPermissionBadges(selectedSkill?.permissionSummary),
    [selectedSkill],
  );

  async function loadSkills() {
    setSkillsLoading(true);
    try {
      const list = await api.listSkills();
      setSkills(list);
      setSelectedSkillId((current) => (current && list.some((item) => item.id === current) ? current : list[0]?.id ?? null));
    } catch (error) {
      setPageError(error instanceof ApiError ? error.message : "技能列表加载失败");
    } finally {
      setSkillsLoading(false);
    }
  }

  async function loadMarket() {
    setMarketLoading(true);
    try {
      const list = await api.listSkillMarket({
        q: deferredMarketQuery.trim() || undefined,
        category: marketCategory.trim() || undefined,
        author: marketAuthor.trim() || undefined,
        status: marketStatus.trim() || undefined,
      });
      setMarket(list);
      setSelectedMarketId((current) => (current && list.some((item) => item.id === current) ? current : list[0]?.id ?? null));
    } catch (error) {
      setPageError(error instanceof ApiError ? error.message : "技能市场加载失败");
    } finally {
      setMarketLoading(false);
    }
  }

  async function refreshAll() {
    setPageError(null);
    await Promise.all([loadSkills(), loadMarket()]);
  }

  useEffect(() => {
    let alive = true;

    void (async () => {
      setBootLoading(true);
      setPageError(null);
      try {
        const health = await api.health();
        if (!alive) {
          return;
        }
        if (!health.vaultSelected) {
          setVaultMissing(true);
          setBootLoading(false);
          return;
        }

        setVaultMissing(false);
        setBootLoading(false);
        await Promise.all([loadSkills(), loadMarket()]);
      } catch (error) {
        if (!alive) {
          return;
        }
        setPageError(error instanceof ApiError ? error.message : "技能页面初始化失败");
        setBootLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (bootLoading || vaultMissing) {
      return;
    }
    void loadMarket();
  }, [bootLoading, deferredMarketQuery, marketCategory, marketAuthor, marketStatus, vaultMissing]);

  useEffect(() => {
    if (!selectedSkill) {
      setPublishName("");
      return;
    }

    setPublishName(selectedSkill.name);
    setPublishFeedback(null);
  }, [selectedSkill]);

  useEffect(() => {
    if (!selectedMarket) {
      return;
    }

    if (selectedMarket.status === "listed" || selectedMarket.status === "hidden" || selectedMarket.status === "removed") {
      setModerationStatus(selectedMarket.status);
    } else {
      setModerationStatus("listed");
    }
    setModerationCertified(Boolean(selectedMarket.certifiedAuthor));
    setMarketFeedback(null);
  }, [selectedMarket]);

  const stateView = bootLoading || vaultMissing || pageError ? (
    <CenterState loading={bootLoading} error={pageError} vaultMissing={vaultMissing} />
  ) : null;

  return (
    <ViewShell
      title="技能"
      subtitle="导入、执行、本地市场与风险权限审阅"
      actions={(
        <button type="button" className="btn" onClick={() => void refreshAll()} disabled={skillsLoading || marketLoading}>
          <RefreshCw size={15} strokeWidth={2} />
          刷新
        </button>
      )}
    >
      {stateView ?? (
        <div className="stack-list">
          <div className="toolbar-row">
            <div className="search">
              <Sparkles size={15} />
              <input
                value={installedSearch}
                onChange={(event) => setInstalledSearch(event.target.value)}
                placeholder="搜索已安装技能、来源或类型"
              />
            </div>
            <span className="grow" />
            <span className="faint">已安装 {filteredSkills.length} / {skills.length}</span>
          </div>

          <div className="split-layout">
            <section className="list-card">
              <div className="list-row head">
                <span className="col col-grow">技能</span>
                <span className="col" style={{ width: 110 }}>类型</span>
                <span className="col" style={{ width: 100 }}>模式</span>
              </div>
              {skillsLoading ? (
                <div className="center-state" style={{ minHeight: 240 }}>
                  <div className="spinner" />
                  <span>正在加载技能</span>
                </div>
              ) : filteredSkills.length === 0 ? (
                <div className="center-state" style={{ minHeight: 240 }}>
                  <Store size={32} className="empty-icon" />
                  <div>还没有已安装技能</div>
                </div>
              ) : (
                filteredSkills.map((skill) => (
                  <button
                    type="button"
                    key={skill.id}
                    className={`list-row ${selectedSkill?.id === skill.id ? "active" : ""}`}
                    onClick={() => setSelectedSkillId(skill.id)}
                  >
                    <span className="col col-grow">
                      <div className="col-name">{skill.name}</div>
                      <div className="col-sub">{skill.id} · {skill.source}</div>
                    </span>
                    <span className="col" style={{ width: 110 }}>
                      <span className={`tag ${skill.kind === "tool" ? "" : "primary"}`}>{SKILL_KIND_LABELS[skill.kind] ?? skill.kind}</span>
                    </span>
                    <span className="col" style={{ width: 100 }}>
                      <span className="tag">{executionModeLabel(skill)}</span>
                    </span>
                  </button>
                ))
              )}
            </section>

            <div className="detail-stack">
              <section className="hero-card">
                {selectedSkill ? (
                  <>
                    <div className="hero-card-main">
                      <div className="avatar lg">{selectedSkill.name.slice(0, 1)}</div>
                      <div>
                        <h2>{selectedSkill.name}</h2>
                        <div className="view-sub">{selectedSkill.id}</div>
                        <div className="tag-row">
                          <span className={`tag ${selectedSkill.kind === "normal" ? "primary" : ""}`}>{SKILL_KIND_LABELS[selectedSkill.kind] ?? selectedSkill.kind}</span>
                          <span className="tag">{executionModeLabel(selectedSkill)}</span>
                          <span className="tag">{selectedSkill.license}</span>
                        </div>
                      </div>
                    </div>
                    <div className="stats-inline">
                      <div className="stats-inline-item">
                        <div className="stats-inline-k">版本</div>
                        <div className="stats-inline-v">{selectedSkill.version}</div>
                      </div>
                      <div className="stats-inline-item">
                        <div className="stats-inline-k">安装时间</div>
                        <div className="stats-inline-v">{formatDate(selectedSkill.installedAt)}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="center-state" style={{ minHeight: 160 }}>
                    <Sparkles size={32} className="empty-icon" />
                    <div>选择左侧技能查看权限、执行与发布能力</div>
                  </div>
                )}
              </section>

              <section className="info-card">
                <h3>权限审阅</h3>
                {selectedSkill ? (
                  <div className="stack-list">
                    <div className="permission-grid">
                      {permissionBadges.length === 0 ? (
                        <span className="faint">当前技能没有授予额外权限</span>
                      ) : (
                        permissionBadges.map((badge) => (
                          <span key={badge.key} className={`permission-chip ${badge.tone}`}>
                            {badge.label}
                            {badge.requiresConfirm ? " · 二次确认" : ""}
                          </span>
                        ))
                      )}
                    </div>
                    <div className="field">
                      <span className="k">高风险确认</span>
                      <span className="v">{selectedSkill.permissionSummary.requiresHighRiskConfirm ? "需要" : "不需要"}</span>
                    </div>
                    <div className="field">
                      <span className="k">API 密钥读取</span>
                      <span className="v">已强制禁止</span>
                    </div>
                  </div>
                ) : (
                  <div className="faint">尚未选择技能</div>
                )}
              </section>

              <section className="editor-card">
                <div className="editor-card-head">
                  <div>
                    <h2>执行与验沙箱</h2>
                    <p className="view-sub">普通技能直接走执行路由；工具技能通过 V2 限制沙箱子进程执行。</p>
                  </div>
                  <div className="segmented">
                    <button type="button" className={dryRun ? "on" : ""} onClick={() => setDryRun(true)}>试运行</button>
                    <button type="button" className={!dryRun ? "on" : ""} onClick={() => setDryRun(false)}>真实执行</button>
                  </div>
                </div>

                {executionFeedback ? <div className="err-card">{executionFeedback}</div> : null}

                <div className="form-grid">
                  <label className="form-block">
                    <span>执行参数 JSON</span>
                    <textarea
                      className="textarea"
                      value={runArgs}
                      onChange={(event) => setRunArgs(event.target.value)}
                      placeholder='{"command":"search"}'
                    />
                  </label>
                </div>

                <div className="skill-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={executing || !selectedSkill}
                    onClick={() => {
                      if (!selectedSkill) {
                        return;
                      }
                      const parsed = parseJsonObject(runArgs);
                      if (parsed.error) {
                        setExecutionFeedback(parsed.error);
                        return;
                      }

                      void (async () => {
                        setExecuting(true);
                        setExecutionFeedback(null);
                        try {
                          const result = await api.executeSkill(selectedSkill.id, parsed.value, dryRun);
                          setExecutionResult(result);
                          setExecutionFeedback(`执行完成：${result.summary}`);
                        } catch (error) {
                          setExecutionFeedback(error instanceof ApiError ? error.message : "技能执行失败");
                        } finally {
                          setExecuting(false);
                        }
                      })();
                    }}
                  >
                    <Play size={15} strokeWidth={2} />
                    {executing ? "执行中" : dryRun ? "执行试运行" : "执行技能"}
                  </button>
                </div>

                {executionResult ? (
                  <div className="result-card">
                    <div className="field">
                      <span className="k">摘要</span>
                      <span className="v stack-align-start">{executionResult.summary}</span>
                    </div>
                    <div className="field">
                      <span className="k">沙箱</span>
                      <span className="v">{executionResult.sandbox}</span>
                    </div>
                    <div className="field">
                      <span className="k">操作</span>
                      <span className="v stack-align-start">{formatExecutionOperations(executionResult)}</span>
                    </div>
                    <div className="field">
                      <span className="k">产物</span>
                      <span className="v stack-align-start">
                        {executionResult.artifacts?.map((artifact) => artifact.name).join(" / ") || "无"}
                      </span>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="editor-card">
                <div className="editor-card-head">
                  <div>
                    <h2>发布到本地市场</h2>
                    <p className="view-sub">从当前已安装技能生成市场条目，供评分、举报和本地审核流转使用。</p>
                  </div>
                </div>

                {publishFeedback ? <div className="err-card">{publishFeedback}</div> : null}

                <div className="form-grid form-grid-2">
                  <label className="form-block">
                    <span>技能名称</span>
                    <input className="input" value={publishName} onChange={(event) => setPublishName(event.target.value)} />
                  </label>
                  <label className="form-block">
                    <span>作者</span>
                    <input className="input" value={publishAuthor} onChange={(event) => setPublishAuthor(event.target.value)} />
                  </label>
                </div>
                <div className="form-grid form-grid-2">
                  <label className="form-block">
                    <span>分类（逗号分隔）</span>
                    <input className="input" value={publishCategories} onChange={(event) => setPublishCategories(event.target.value)} placeholder="tool, polish" />
                  </label>
                  <label className="form-block">
                    <span>标签（逗号分隔）</span>
                    <input className="input" value={publishTags} onChange={(event) => setPublishTags(event.target.value)} placeholder="sandbox, fetch" />
                  </label>
                </div>
                <div className="form-grid">
                  <label className="form-block">
                    <span>摘要</span>
                    <textarea className="textarea" value={publishSummary} onChange={(event) => setPublishSummary(event.target.value)} />
                  </label>
                </div>
                <label className="switch-row">
                  <input type="checkbox" checked={publishCertified} onChange={(event) => setPublishCertified(event.target.checked)} />
                  <span>标记为认证作者</span>
                </label>
                <div className="skill-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={publishLoading || !selectedSkill}
                    onClick={() => {
                      if (!selectedSkill) {
                        return;
                      }

                      void (async () => {
                        setPublishLoading(true);
                        setPublishFeedback(null);
                        try {
                          const entry = await api.publishSkillMarketEntry({
                            skillId: selectedSkill.id,
                            name: publishName.trim() || selectedSkill.name,
                            author: publishAuthor.trim(),
                            summary: publishSummary.trim(),
                            categories: splitCsv(publishCategories),
                            tags: splitCsv(publishTags),
                            certifiedAuthor: publishCertified,
                          });
                          await loadMarket();
                          setSelectedMarketId(entry.id);
                          setPublishFeedback(`已发布市场条目：${entry.id}`);
                        } catch (error) {
                          setPublishFeedback(error instanceof ApiError ? error.message : "发布市场条目失败");
                        } finally {
                          setPublishLoading(false);
                        }
                      })();
                    }}
                  >
                    <Upload size={15} strokeWidth={2} />
                    {publishLoading ? "发布中" : "发布到市场"}
                  </button>
                </div>
              </section>
            </div>
          </div>

          <div className="detail-grid">
            <div className="stack-list">
              <section className="editor-card">
                <div className="editor-card-head">
                  <div>
                    <h2>GitHub 导入</h2>
                    <p className="view-sub">支持 GitHub 的 `blob/raw` 技能清单 URL，服务端会自动转为 raw 地址并校验安全约束。</p>
                  </div>
                </div>

                {importFeedback ? <div className="err-card">{importFeedback}</div> : null}

                <div className="form-grid">
                  <label className="form-block">
                    <span>GitHub URL</span>
                    <input
                      className="input"
                      value={githubUrl}
                      onChange={(event) => setGitHubUrl(event.target.value)}
                      placeholder="https://github.com/demo/repo/blob/main/skills/polish.json"
                    />
                  </label>
                </div>
                <div className="skill-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={importLoading || !githubUrl.trim()}
                    onClick={() => {
                      void (async () => {
                        setImportLoading(true);
                        setImportFeedback(null);
                        try {
                          const skill = await api.importSkillFromGitHub(githubUrl.trim());
                          await loadSkills();
                          setSelectedSkillId(skill.id);
                          setImportFeedback(`已从 GitHub 导入：${skill.id}`);
                        } catch (error) {
                          setImportFeedback(error instanceof ApiError ? error.message : "GitHub 导入失败");
                        } finally {
                          setImportLoading(false);
                        }
                      })();
                    }}
                  >
                    <Globe size={15} strokeWidth={2} />
                    {importLoading ? "导入中" : "从 GitHub 导入"}
                  </button>
                </div>
              </section>

              <section className="editor-card">
                <div className="editor-card-head">
                  <div>
                    <h2>清单导入</h2>
                    <p className="view-sub">本地粘贴 JSON 清单。服务端会再次做 SEC-27 和权限决策校验。</p>
                  </div>
                </div>

                <div className="form-grid form-grid-2">
                  <label className="form-block">
                    <span>来源标记</span>
                    <input className="input" value={manifestSource} onChange={(event) => setManifestSource(event.target.value)} />
                  </label>
                </div>
                <div className="form-grid">
                  <label className="form-block">
                    <span>清单 JSON</span>
                    <textarea className="textarea code-surface" value={manifestInput} onChange={(event) => setManifestInput(event.target.value)} />
                  </label>
                </div>
                <div className="skill-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={importLoading}
                    onClick={() => {
                      const parsed = parseJsonObject(manifestInput);
                      if (parsed.error) {
                        setImportFeedback(parsed.error);
                        return;
                      }

                      void (async () => {
                        setImportLoading(true);
                        setImportFeedback(null);
                        try {
                          const skill = await api.importSkillManifest(parsed.value, manifestSource.trim() || undefined);
                          await loadSkills();
                          setSelectedSkillId(skill.id);
                          setImportFeedback(`已导入 manifest：${skill.id}`);
                        } catch (error) {
                          setImportFeedback(error instanceof ApiError ? error.message : "清单导入失败");
                        } finally {
                          setImportLoading(false);
                        }
                      })();
                    }}
                  >
                    <Download size={15} strokeWidth={2} />
                    {importLoading ? "导入中" : "导入清单"}
                  </button>
                </div>
              </section>
            </div>

            <section className="info-card">
              <h3>安全红线</h3>
              <div className="signal-list">
                <div className="signal-item">
                  <ShieldAlert size={16} />
                  <div>
                    <div className="mini-card-title">永不读取 API 密钥</div>
                    <div className="mini-card-sub">`readApiKey=true` 的 manifest 会被服务端直接拒绝。</div>
                  </div>
                </div>
                <div className="signal-item">
                  <CheckCircle2 size={16} />
                  <div>
                    <div className="mini-card-title">工具技能走隔离子进程</div>
                    <div className="mini-card-sub">真实执行时会落到受限 V2 沙箱，而不是直接进前端或主进程。</div>
                  </div>
                </div>
                <div className="signal-item">
                  <Store size={16} />
                  <div>
                    <div className="mini-card-title">市场仅存元信息</div>
                    <div className="mini-card-sub">市场条目用于浏览、评分、举报和审核，不会绕过本地导入校验链路。</div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="editor-card">
            <div className="editor-card-head">
              <div>
                <h2>技能市场</h2>
                <p className="view-sub">浏览本地市场条目，执行评分、举报和审核动作。</p>
              </div>
            </div>

            <div className="toolbar-row">
              <div className="search">
                <Store size={15} />
                <input
                  value={marketQuery}
                  onChange={(event) => setMarketQuery(event.target.value)}
                  placeholder="搜索名称、摘要或标签"
                />
              </div>
              <label className="project-inline-field">
                <span className="faint">分类</span>
                <input className="input" value={marketCategory} onChange={(event) => setMarketCategory(event.target.value)} placeholder="tool" />
              </label>
              <label className="project-inline-field">
                <span className="faint">作者</span>
                <input className="input" value={marketAuthor} onChange={(event) => setMarketAuthor(event.target.value)} placeholder="alice" />
              </label>
              <label className="project-inline-field">
                <span className="faint">状态</span>
                <input className="input" value={marketStatus} onChange={(event) => setMarketStatus(event.target.value)} placeholder="listed" />
              </label>
              <span className="grow" />
              <span className="faint">市场条目 {market.length}</span>
            </div>

            <div className="detail-grid">
              <section className="list-card">
                <div className="list-row head">
                  <span className="col col-grow">条目</span>
                  <span className="col" style={{ width: 90 }}>评分</span>
                  <span className="col" style={{ width: 90 }}>状态</span>
                </div>
                {marketLoading ? (
                  <div className="center-state" style={{ minHeight: 240 }}>
                    <div className="spinner" />
                    <span>加载市场中</span>
                  </div>
                ) : market.length === 0 ? (
                  <div className="center-state" style={{ minHeight: 240 }}>
                    <Store size={32} className="empty-icon" />
                    <div>还没有市场条目</div>
                  </div>
                ) : (
                  market.map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      className={`list-row ${selectedMarket?.id === entry.id ? "active" : ""}`}
                      onClick={() => setSelectedMarketId(entry.id)}
                    >
                      <span className="col col-grow">
                        <div className="col-name">{entry.name}</div>
                        <div className="col-sub">{entry.skillId} · {entry.author}</div>
                      </span>
                      <span className="col" style={{ width: 90 }}>{entry.ratingCount ? entry.averageRating.toFixed(1) : "—"}</span>
                      <span className="col" style={{ width: 90 }}>
                        <span className={`tag ${entry.status === "listed" ? "primary" : ""}`}>{MARKET_STATUS_LABELS[entry.status] ?? entry.status}</span>
                      </span>
                    </button>
                  ))
                )}
              </section>

              <div className="stack-list">
                <section className="info-card">
                  <h3>条目详情</h3>
                  {selectedMarket ? (
                    <div className="stack-list">
                      <div className="field">
                        <span className="k">技能</span>
                        <span className="v stack-align-start">{selectedMarket.skillId}</span>
                      </div>
                      <div className="field">
                        <span className="k">评分</span>
                        <span className="v">{ratingLabel(selectedMarket)}</span>
                      </div>
                      <div className="field">
                        <span className="k">状态</span>
                        <span className="v">{MARKET_STATUS_LABELS[selectedMarket.status] ?? selectedMarket.status}</span>
                      </div>
                      <div className="field">
                        <span className="k">举报数</span>
                        <span className="v">{selectedMarket.reports.length}</span>
                      </div>
                      <div className="field">
                        <span className="k">认证作者</span>
                        <span className="v">{selectedMarket.certifiedAuthor ? "是" : "否"}</span>
                      </div>
                      <div className="mini-card">
                        <div className="mini-card-title">摘要</div>
                        <div className="mini-card-sub">{selectedMarket.summary}</div>
                      </div>
                      <div className="tag-row">
                        {selectedMarket.categories.map((category) => (
                          <span key={category} className="tag primary">{category}</span>
                        ))}
                        {selectedMarket.tags.map((tag) => (
                          <span key={tag} className="tag">{tag}</span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="faint">选择一个市场条目查看详情</div>
                  )}
                </section>

                {marketFeedback ? <div className="err-card">{marketFeedback}</div> : null}

                <section className="editor-card compact">
                  <div className="editor-card-head">
                    <div>
                      <h2>评分</h2>
                    </div>
                  </div>
                  <div className="form-grid form-grid-2">
                    <label className="form-block">
                      <span>评分人</span>
                      <input className="input" value={ratingUser} onChange={(event) => setRatingUser(event.target.value)} />
                    </label>
                    <label className="form-block">
                      <span>分数（1-5）</span>
                      <input className="input" value={ratingScore} onChange={(event) => setRatingScore(event.target.value)} />
                    </label>
                  </div>
                  <label className="form-block">
                    <span>评论</span>
                    <textarea className="textarea" value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} />
                  </label>
                  <div className="skill-actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={marketActionLoading || !selectedMarket}
                      onClick={() => {
                        if (!selectedMarket) {
                          return;
                        }

                        void (async () => {
                          setMarketActionLoading(true);
                          setMarketFeedback(null);
                          try {
                            const entry = await api.rateSkillMarketEntry(selectedMarket.id, {
                              rater: ratingUser.trim(),
                              score: Number(ratingScore),
                              comment: ratingComment.trim() || undefined,
                            });
                            await loadMarket();
                            setSelectedMarketId(entry.id);
                            setMarketFeedback("评分已提交");
                          } catch (error) {
                            setMarketFeedback(error instanceof ApiError ? error.message : "评分失败");
                          } finally {
                            setMarketActionLoading(false);
                          }
                        })();
                      }}
                    >
                      提交评分
                    </button>
                  </div>
                </section>

                <section className="editor-card compact">
                  <div className="editor-card-head">
                    <div>
                      <h2>举报</h2>
                    </div>
                  </div>
                  <div className="form-grid form-grid-2">
                    <label className="form-block">
                      <span>举报人</span>
                      <input className="input" value={reporter} onChange={(event) => setReporter(event.target.value)} />
                    </label>
                  </div>
                  <label className="form-block">
                    <span>原因</span>
                    <textarea className="textarea" value={reportReason} onChange={(event) => setReportReason(event.target.value)} />
                  </label>
                  <div className="skill-actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={marketActionLoading || !selectedMarket}
                      onClick={() => {
                        if (!selectedMarket) {
                          return;
                        }

                        void (async () => {
                          setMarketActionLoading(true);
                          setMarketFeedback(null);
                          try {
                            const entry = await api.reportSkillMarketEntry(selectedMarket.id, {
                              reporter: reporter.trim(),
                              reason: reportReason.trim(),
                            });
                            await loadMarket();
                            setSelectedMarketId(entry.id);
                            setMarketFeedback("举报已记录");
                          } catch (error) {
                            setMarketFeedback(error instanceof ApiError ? error.message : "举报失败");
                          } finally {
                            setMarketActionLoading(false);
                          }
                        })();
                      }}
                    >
                      提交举报
                    </button>
                  </div>
                </section>

                <section className="editor-card compact">
                  <div className="editor-card-head">
                    <div>
                      <h2>审核</h2>
                    </div>
                  </div>
                  <div className="segmented">
                    {MARKET_STATUS_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={moderationStatus === option ? "on" : ""}
                        onClick={() => setModerationStatus(option)}
                      >
                            {MARKET_STATUS_LABELS[option] ?? option}
                      </button>
                    ))}
                  </div>
                  <label className="switch-row" style={{ marginTop: 14 }}>
                    <input type="checkbox" checked={moderationCertified} onChange={(event) => setModerationCertified(event.target.checked)} />
                    <span>认证作者</span>
                  </label>
                  <div className="skill-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={marketActionLoading || !selectedMarket}
                      onClick={() => {
                        if (!selectedMarket) {
                          return;
                        }

                        void (async () => {
                          setMarketActionLoading(true);
                          setMarketFeedback(null);
                          try {
                            const entry = await api.moderateSkillMarketEntry(selectedMarket.id, {
                              status: moderationStatus,
                              certifiedAuthor: moderationCertified,
                            });
                            await loadMarket();
                            setSelectedMarketId(entry.id);
                            setMarketFeedback("审核状态已更新");
                          } catch (error) {
                            setMarketFeedback(error instanceof ApiError ? error.message : "审核失败");
                          } finally {
                            setMarketActionLoading(false);
                          }
                        })();
                      }}
                    >
                      更新审核
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </section>
        </div>
      )}
    </ViewShell>
  );
}
