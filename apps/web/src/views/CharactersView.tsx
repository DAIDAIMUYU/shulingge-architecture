import { useEffect, useMemo, useState } from "react";
import { BookOpen, PencilLine, Plus, Save, Search, Sparkles, Users } from "lucide-react";

import { api, ApiError, type Character, type Relation, type TimelineEvent } from "../api/client.js";
import {
  createCharacterFormDraft,
  filterCharacters,
  getCharacterRelations,
  getCharacterTimelineEvents,
  toCharacterPayload,
  type CharacterFormDraft,
} from "./characters-utils.js";
import { CenterState, ViewShell } from "./common.js";

type CharacterTab = "profile" | "voice" | "state" | "relations" | "knowledge" | "notes";
type EditorMode = "create" | "edit";

const TABS: Array<{ id: CharacterTab; label: string }> = [
  { id: "profile", label: "基础资料" },
  { id: "voice", label: "角色声音" },
  { id: "state", label: "当前状态" },
  { id: "relations", label: "关系" },
  { id: "knowledge", label: "知情范围" },
  { id: "notes", label: "笔记规则" },
];

const DEFAULT_PROJECT_ID = "demo-series";

function readStoredProjectId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_PROJECT_ID;
  }

  return window.localStorage.getItem("shulingge.web.projectId") ?? DEFAULT_PROJECT_ID;
}

function writeStoredProjectId(projectId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("shulingge.web.projectId", projectId);
}

function toCharacterSummary(character: Character): string {
  const worldbook = Array.isArray(character.relatedWorldbook) ? character.relatedWorldbook.length : 0;
  const links = Array.isArray(character.links) ? character.links.length : 0;
  if (worldbook || links) {
    return `${links} 条链接 · ${worldbook} 条世界书关联`;
  }

  return "尚未补充关联资料";
}

function renderRecordRows(record: Record<string, string | string[]> | undefined, emptyText: string) {
  const entries = Object.entries(record ?? {});
  if (!entries.length) {
    return <div className="faint">{emptyText}</div>;
  }

  return (
    <div className="stack-list">
      {entries.map(([key, value]) => (
        <div className="field" key={key}>
          <span className="k">{key}</span>
          <span className="v stack-align-start">{Array.isArray(value) ? value.join(" / ") : value}</span>
        </div>
      ))}
    </div>
  );
}

function CharacterEditor({
  mode,
  draft,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  mode: EditorMode;
  draft: CharacterFormDraft;
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<CharacterFormDraft>) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const title = mode === "create" ? "新建角色" : `编辑角色 · ${draft.name || draft.id || "未命名"}`;

  return (
    <section className="editor-card">
      <div className="editor-card-head">
        <div>
          <h2>{title}</h2>
          <p className="view-sub">仅使用当前后端已定义的角色字段，不额外发明数据结构。</p>
        </div>
        <div className="view-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={saving || !draft.id.trim() || !draft.name.trim()}>
            <Save size={15} strokeWidth={2} />
            {saving ? "保存中…" : "保存角色"}
          </button>
        </div>
      </div>

      {error ? <div className="err-card">保存失败：{error}</div> : null}

      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>角色 ID</span>
          <input
            className="input"
            value={draft.id}
            onChange={(event) => onChange({ id: event.target.value })}
            disabled={mode === "edit"}
            placeholder="kanae"
          />
        </label>
        <label className="form-block">
          <span>显示名称</span>
          <input
            className="input"
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="香奈惠 / Kanae"
          />
        </label>
        <label className="form-block">
          <span>知情范围引用</span>
          <input
            className="input"
            value={draft.knowledgeScopeRef}
            onChange={(event) => onChange({ knowledgeScopeRef: event.target.value })}
            placeholder="states/knowledge/kanae.json"
          />
        </label>
        <label className="form-block">
          <span>当前状态引用</span>
          <input
            className="input"
            value={draft.currentStateRef}
            onChange={(event) => onChange({ currentStateRef: event.target.value })}
            placeholder="states/characters/kanae.state.json"
          />
        </label>
        <label className="form-block">
          <span>角色弧线引用</span>
          <input
            className="input"
            value={draft.arcRef}
            onChange={(event) => onChange({ arcRef: event.target.value })}
            placeholder="arc-healing"
          />
        </label>
        <label className="form-block">
          <span>关联世界书</span>
          <textarea
            className="textarea"
            value={draft.relatedWorldbookText}
            onChange={(event) => onChange({ relatedWorldbookText: event.target.value })}
            placeholder={"wb-butterfly-mansion\nwb-insect-corps"}
          />
        </label>
      </div>

      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>链接 / 设定线索</span>
          <textarea
            className="textarea"
            value={draft.linksText}
            onChange={(event) => onChange({ linksText: event.target.value })}
            placeholder={"[[Butterfly Mansion]]\n[[花香与药臼]]"}
          />
        </label>
        <label className="form-block">
          <span>禁止写法</span>
          <textarea
            className="textarea"
            value={draft.forbiddenWritesText}
            onChange={(event) => onChange({ forbiddenWritesText: event.target.value })}
            placeholder={"out-of-character rage\n无故泄密"}
          />
        </label>
      </div>

      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>常用台词</span>
          <textarea
            className="textarea"
            value={draft.typicalLinesText}
            onChange={(event) => onChange({ typicalLinesText: event.target.value })}
            placeholder={"请先冷静。\n先处理伤口。"}
          />
        </label>
        <label className="form-block">
          <span>禁用台词</span>
          <textarea
            className="textarea"
            value={draft.forbiddenLinesText}
            onChange={(event) => onChange({ forbiddenLinesText: event.target.value })}
            placeholder={"我不在乎任何人。"}
          />
        </label>
      </div>

      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>称呼表</span>
          <textarea
            className="textarea"
            value={draft.honorificsText}
            onChange={(event) => onChange({ honorificsText: event.target.value })}
            placeholder={"shinobu: 忍\nprotagonist: 你"}
          />
        </label>
        <label className="form-block">
          <span>按情境</span>
          <textarea
            className="textarea"
            value={draft.bySituationText}
            onChange={(event) => onChange({ bySituationText: event.target.value })}
            placeholder={"combat: 收束阵形 | 不要硬撑\nrest: 先喝茶 | 慢慢说"}
          />
        </label>
      </div>
      <div className="form-grid form-grid-2">
        <label className="form-block">
          <span>按情绪</span>
          <textarea
            className="textarea"
            value={draft.byEmotionText}
            onChange={(event) => onChange({ byEmotionText: event.target.value })}
            placeholder={"grief: 先别说话 | 我在这\ncalm: 先把呼吸稳住"}
          />
        </label>
        <label className="form-block">
          <span>按关系阶段</span>
          <textarea
            className="textarea"
            value={draft.byRelationStageText}
            onChange={(event) => onChange({ byRelationStageText: event.target.value })}
            placeholder={"trust: 我知道你的节奏 | 按约定来\nsuspicion: 先别急着下结论"}
          />
        </label>
      </div>
    </section>
  );
}

export function CharactersView() {
  const [projectId, setProjectId] = useState(readStoredProjectId);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<CharacterTab>("profile");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaultMissing, setVaultMissing] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [draft, setDraft] = useState<CharacterFormDraft>(createCharacterFormDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    writeStoredProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      setVaultMissing(false);

      try {
        const health = await api.health();
        if (!health.vaultSelected) {
          if (!alive) return;
          setVaultMissing(true);
          setCharacters([]);
          setRelations([]);
          setTimelineEvents([]);
          setLoading(false);
          return;
        }

        const [nextCharacters, nextRelations, nextTimeline] = await Promise.all([
          api.listCharactersByProject(projectId),
          api.listRelationsByProject(projectId),
          api.listTimelineByProject(projectId),
        ]);

        if (!alive) {
          return;
        }

        setCharacters(nextCharacters);
        setRelations(nextRelations);
        setTimelineEvents(nextTimeline);
        setSelectedCharacterId((current) => {
          if (current && nextCharacters.some((character) => character.id === current)) {
            return current;
          }
          return nextCharacters[0]?.id ?? null;
        });
        setLoading(false);
      } catch (loadError) {
        if (!alive) {
          return;
        }
        setError(loadError instanceof ApiError ? loadError.message : "加载失败");
        setLoading(false);
      }
    }

    void load();

    return () => {
      alive = false;
    };
  }, [projectId]);

  const filteredCharacters = useMemo(() => filterCharacters(characters, search), [characters, search]);

  const selectedCharacter = useMemo(() => {
    if (!filteredCharacters.length) {
      return characters.find((character) => character.id === selectedCharacterId) ?? null;
    }
    return filteredCharacters.find((character) => character.id === selectedCharacterId) ?? filteredCharacters[0] ?? null;
  }, [characters, filteredCharacters, selectedCharacterId]);

  const characterRelations = useMemo(
    () => (selectedCharacter ? getCharacterRelations(relations, selectedCharacter.id) : []),
    [relations, selectedCharacter],
  );
  const relatedEvents = useMemo(
    () => (selectedCharacter ? getCharacterTimelineEvents(timelineEvents, selectedCharacter.id) : []),
    [selectedCharacter, timelineEvents],
  );

  const showState = loading || error !== null || vaultMissing || filteredCharacters.length === 0;

  async function persistCharacter(mode: EditorMode) {
    setSaving(true);
    setSaveError(null);

    try {
      const payload = toCharacterPayload(draft);
      const savedCharacter =
        mode === "create"
          ? await api.createCharacter(projectId, payload)
          : await api.updateCharacter(projectId, draft.id, payload);

      const [nextCharacters, nextRelations, nextTimeline] = await Promise.all([
        api.listCharactersByProject(projectId),
        api.listRelationsByProject(projectId),
        api.listTimelineByProject(projectId),
      ]);

      setCharacters(nextCharacters);
      setRelations(nextRelations);
      setTimelineEvents(nextTimeline);
      setSelectedCharacterId(savedCharacter.id);
      setActiveTab("profile");
      setEditorMode(null);
    } catch (persistError) {
      setSaveError(persistError instanceof ApiError ? persistError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ViewShell
      title="角色"
      subtitle="人物档案、声音、关系、状态与知情范围"
      actions={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setDraft(createCharacterFormDraft());
            setEditorMode("create");
            setSaveError(null);
          }}
        >
          <Plus size={15} strokeWidth={2} />
          新建角色
        </button>
      }
    >
      <div className="toolbar-row">
        <div className="search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索角色、链接或规则…" />
        </div>
        <label className="project-inline-field">
          <span className="faint">Project</span>
          <input className="input" value={projectId} onChange={(event) => setProjectId(event.target.value)} />
        </label>
        <span className="grow" />
        <span className="faint">共 {filteredCharacters.length} / {characters.length} 位</span>
      </div>

      {editorMode ? (
        <CharacterEditor
          mode={editorMode}
          draft={draft}
          saving={saving}
          error={saveError}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onCancel={() => {
            setEditorMode(null);
            setSaveError(null);
          }}
          onSubmit={() => {
            void persistCharacter(editorMode);
          }}
        />
      ) : null}

      {showState ? (
        <CenterState
          loading={loading}
          error={error}
          vaultMissing={vaultMissing}
          empty={filteredCharacters.length === 0}
          emptyText={search ? "没有匹配的角色" : "还没有角色，点右上角「新建角色」"}
        />
      ) : (
        <div className="split-layout">
          <div className="list-card">
            <div className="list-row head">
              <span style={{ width: 38 }} />
              <span className="col col-grow">角色</span>
              <span className="col" style={{ width: 130 }}>声音</span>
              <span className="col" style={{ width: 90 }}>规则</span>
              <span className="col" style={{ width: 120 }}>更新时间</span>
            </div>
            {filteredCharacters.map((character) => {
              const typicalLines = Array.isArray(character.voice?.typicalLines) ? character.voice?.typicalLines.length : 0;
              const forbiddenWrites = Array.isArray(character.forbiddenWrites) ? character.forbiddenWrites.length : 0;
              return (
                <button
                  type="button"
                  className={`list-row ${selectedCharacter?.id === character.id ? "active" : ""}`}
                  key={character.id}
                  onClick={() => {
                    setSelectedCharacterId(character.id);
                    setActiveTab("profile");
                  }}
                >
                  <span className="avatar">{character.name?.slice(0, 1) ?? "角"}</span>
                  <span className="col col-grow">
                    <div className="col-name">{character.name}</div>
                    <div className="col-sub">{toCharacterSummary(character)}</div>
                  </span>
                  <span className="col" style={{ width: 130 }}>
                    <span className="tag primary">{typicalLines} 条</span>
                  </span>
                  <span className="col" style={{ width: 90 }}>
                    <span className="tag">{forbiddenWrites} 条</span>
                  </span>
                  <span className="col faint" style={{ width: 120 }}>{String(character.updatedAt ?? "—")}</span>
                </button>
              );
            })}
          </div>

          {selectedCharacter ? (
            <div className="detail-stack">
              <section className="hero-card">
                <div className="hero-card-main">
                  <span className="avatar lg">{selectedCharacter.name?.slice(0, 1) ?? "角"}</span>
                  <div>
                    <h2>{selectedCharacter.name}</h2>
                    <p className="view-sub">ID：{selectedCharacter.id}</p>
                    <div className="tag-row">
                      <span className="tag primary">{Array.isArray(selectedCharacter.voice?.typicalLines) ? selectedCharacter.voice?.typicalLines.length : 0} 条常用台词</span>
                      <span className="tag">{characterRelations.length} 条关系</span>
                      <span className="tag">{relatedEvents.length} 个相关事件</span>
                    </div>
                  </div>
                </div>
                <div className="view-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setDraft(createCharacterFormDraft(selectedCharacter));
                      setEditorMode("edit");
                      setSaveError(null);
                    }}
                  >
                    <PencilLine size={15} strokeWidth={2} />
                    编辑
                  </button>
                </div>
              </section>

              <div className="tab-strip">
                {TABS.map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    className={activeTab === tab.id ? "active" : ""}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="detail-grid">
                <div>
                  {activeTab === "profile" ? (
                    <section className="info-card">
                      <h3>基础资料</h3>
                      <div className="field"><span className="k">角色 ID</span><span className="v">{selectedCharacter.id}</span></div>
                      <div className="field"><span className="k">角色弧线</span><span className="v">{String(selectedCharacter.arcRef ?? "未设置")}</span></div>
                      <div className="field"><span className="k">链接数量</span><span className="v">{Array.isArray(selectedCharacter.links) ? selectedCharacter.links.length : 0}</span></div>
                      <div className="field"><span className="k">关联世界书</span><span className="v">{Array.isArray(selectedCharacter.relatedWorldbook) ? selectedCharacter.relatedWorldbook.length : 0}</span></div>
                      <div className="field"><span className="k">更新时间</span><span className="v">{String(selectedCharacter.updatedAt ?? "—")}</span></div>
                      <div className="field"><span className="k">创建时间</span><span className="v">{String(selectedCharacter.createdAt ?? "—")}</span></div>
                    </section>
                  ) : null}

                  {activeTab === "voice" ? (
                    <section className="info-card">
                      <h3>角色声音</h3>
                      <div className="detail-section">
                        <h4>常用台词</h4>
                        <div className="stack-list">
                          {(selectedCharacter.voice?.typicalLines as string[] | undefined)?.length ? (
                            (selectedCharacter.voice?.typicalLines as string[]).map((line) => (
                              <div className="quote-line" key={line}>{line}</div>
                            ))
                          ) : (
                            <div className="faint">尚未填写常用台词</div>
                          )}
                        </div>
                      </div>
                      <div className="detail-section">
                        <h4>禁用台词</h4>
                        <div className="stack-list">
                          {(selectedCharacter.voice?.forbiddenLines as string[] | undefined)?.length ? (
                            (selectedCharacter.voice?.forbiddenLines as string[]).map((line) => (
                              <div className="quote-line muted-line" key={line}>{line}</div>
                            ))
                          ) : (
                            <div className="faint">暂无禁用台词</div>
                          )}
                        </div>
                      </div>
                      <div className="detail-section">
                        <h4>称呼表</h4>
                        {renderRecordRows(selectedCharacter.voice?.honorifics as Record<string, string> | undefined, "暂无称呼表")}
                      </div>
                      <div className="detail-section">
                        <h4>按情境 / 情绪 / 关系阶段</h4>
                        {renderRecordRows(selectedCharacter.voice?.bySituation as Record<string, string[]> | undefined, "暂无情境话术")}
                        {renderRecordRows(selectedCharacter.voice?.byEmotion as Record<string, string[]> | undefined, "暂无情绪话术")}
                        {renderRecordRows(selectedCharacter.voice?.byRelationStage as Record<string, string[]> | undefined, "暂无关系阶段话术")}
                      </div>
                    </section>
                  ) : null}

                  {activeTab === "state" ? (
                    <section className="info-card">
                      <h3>当前状态</h3>
                      <div className="field"><span className="k">状态引用</span><span className="v stack-align-start">{String(selectedCharacter.currentStateRef ?? "未设置")}</span></div>
                      <div className="field"><span className="k">角色弧线</span><span className="v stack-align-start">{String(selectedCharacter.arcRef ?? "未设置")}</span></div>
                      <div className="field"><span className="k">最近活动</span><span className="v stack-align-start">{relatedEvents[0]?.title ?? "暂无事件"}</span></div>
                    </section>
                  ) : null}

                  {activeTab === "relations" ? (
                    <section className="info-card">
                      <h3>关系</h3>
                      {characterRelations.length ? (
                        <div className="stack-list">
                          {characterRelations.map((relation) => (
                            <div className="mini-card" key={relation.id}>
                              <div className="mini-card-title">{relation.type}</div>
                              <div className="mini-card-sub">
                                {relation.from} → {relation.to}
                              </div>
                              <div className="tag-row">
                                <span className="tag">{String(relation.stage ?? "未分阶段")}</span>
                                <span className="tag">{Array.isArray(relation.sourceChapters) ? relation.sourceChapters.length : 0} 章</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="faint">还没有与该角色绑定的关系。</div>
                      )}
                    </section>
                  ) : null}

                  {activeTab === "knowledge" ? (
                    <section className="info-card">
                      <h3>知情范围</h3>
                      <div className="field"><span className="k">知情范围引用</span><span className="v stack-align-start">{String(selectedCharacter.knowledgeScopeRef ?? "未设置")}</span></div>
                      <div className="detail-section">
                        <h4>关联世界书</h4>
                        <div className="tag-row">
                          {(selectedCharacter.relatedWorldbook as string[] | undefined)?.length ? (
                            (selectedCharacter.relatedWorldbook as string[]).map((entry) => <span className="tag primary" key={entry}>{entry}</span>)
                          ) : (
                            <span className="faint">暂无世界书关联</span>
                          )}
                        </div>
                      </div>
                      <div className="detail-section">
                        <h4>线索链接</h4>
                        <div className="stack-list">
                          {(selectedCharacter.links as string[] | undefined)?.length ? (
                            (selectedCharacter.links as string[]).map((entry) => <div className="quote-line" key={entry}>{entry}</div>)
                          ) : (
                            <div className="faint">暂无线索链接</div>
                          )}
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {activeTab === "notes" ? (
                    <section className="info-card">
                      <h3>笔记规则</h3>
                      <div className="detail-section">
                        <h4>禁止写法</h4>
                        <div className="stack-list">
                          {(selectedCharacter.forbiddenWrites as string[] | undefined)?.length ? (
                            (selectedCharacter.forbiddenWrites as string[]).map((entry) => <div className="quote-line muted-line" key={entry}>{entry}</div>)
                          ) : (
                            <div className="faint">暂无禁止写法</div>
                          )}
                        </div>
                      </div>
                    </section>
                  ) : null}
                </div>

                <div>
                  <section className="info-card">
                    <h3>关系列表</h3>
                    {characterRelations.length ? (
                      <div className="stack-list">
                        {characterRelations.map((relation) => (
                          <div className="field" key={relation.id}>
                            <span className="k">{relation.type}</span>
                            <span className="v stack-align-start">{relation.from === selectedCharacter.id ? relation.to : relation.from}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="faint">暂无关系绑定</div>
                    )}
                  </section>

                  <section className="info-card">
                    <h3>相关事件</h3>
                    {relatedEvents.length ? (
                      <div className="stack-list">
                        {relatedEvents.map((event) => (
                          <div className="mini-card" key={event.id}>
                            <div className="mini-card-title">{event.title}</div>
                            <div className="mini-card-sub">
                              线路 {String(event.line)} · 顺位 {String(event.order)}
                            </div>
                            <div className="tag-row">
                              <span className="tag primary">{Array.isArray(event.boundChapters) ? event.boundChapters.length : 0} 章</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="faint">暂无与该角色绑定的时间线事件</div>
                    )}
                  </section>

                  <section className="info-card">
                    <h3>角色信号</h3>
                    <div className="signal-list">
                      <div className="signal-item">
                        <Sparkles size={16} />
                        <div>
                          <div className="mini-card-title">声音库</div>
                          <div className="mini-card-sub">{Array.isArray(selectedCharacter.voice?.typicalLines) ? selectedCharacter.voice?.typicalLines.length : 0} 条常用台词</div>
                        </div>
                      </div>
                      <div className="signal-item">
                        <Users size={16} />
                        <div>
                          <div className="mini-card-title">关系密度</div>
                          <div className="mini-card-sub">{characterRelations.length} 条关系</div>
                        </div>
                      </div>
                      <div className="signal-item">
                        <BookOpen size={16} />
                        <div>
                          <div className="mini-card-title">世界书关联</div>
                          <div className="mini-card-sub">{Array.isArray(selectedCharacter.relatedWorldbook) ? selectedCharacter.relatedWorldbook.length : 0} 条引用</div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          ) : (
            <CenterState loading={false} error={null} vaultMissing={false} empty emptyText="请选择左侧角色查看详情" />
          )}
        </div>
      )}
    </ViewShell>
  );
}
