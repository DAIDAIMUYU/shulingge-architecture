import { useEffect, useState } from "react";

import { api, type AgentInfo } from "../api/client.js";
import { ViewShell } from "./common.js";

const FALLBACK: AgentInfo[] = [
  { id: "writer", name: "正文写作 Agent", order: 1, role: "根据大纲与上下文产出正文" },
  { id: "rule-guard", name: "规则守卫 Agent", order: 2, role: "校验是否违反写作硬规则" },
  { id: "voice", name: "角色声音 Agent", order: 3, role: "确保对白符合角色声音库" },
  { id: "relation", name: "关系情感 Agent", order: 4, role: "维护人物关系与情感线推进" },
  { id: "timeline", name: "时间线 Agent", order: 5, role: "校对事件时序一致性" },
  { id: "worldbook", name: "世界书校对 Agent", order: 6, role: "比对世界书与原作设定" },
  { id: "polish", name: "润色去 AI 味 Agent", order: 7, role: "打磨文笔、去除 AI 腔" },
  { id: "summary", name: "摘要状态 Agent", order: 8, role: "更新章节摘要与状态库" },
  { id: "director", name: "总控 Agent", order: 9, role: "统筹调度、决定打回重写" },
];

export function AgentsView() {
  const [agents, setAgents] = useState<AgentInfo[]>(FALLBACK);

  useEffect(() => {
    void api
      .listAgents()
      .then((list) => {
        if (list.length) setAgents(list);
      })
      .catch(() => {});
  }, []);

  return (
    <ViewShell title="Agent" subtitle="9 位 Agent 的职责、顺序与启用状态（默认按流程顺序协作）">
      <div className="list-card">
        <div className="list-row head">
          <span style={{ width: 28 }}>#</span>
          <span className="col col-grow">Agent</span>
          <span className="col" style={{ width: 90 }}>状态</span>
        </div>
        {[...agents]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((a, i) => (
            <div className="list-row" key={a.id} style={{ cursor: "default" }}>
              <span className="faint" style={{ width: 28 }}>{a.order ?? i + 1}</span>
              <span className="col col-grow">
                <div className="col-name">{a.name}</div>
                {(a.role || a.description) && <div className="col-sub">{a.role ?? a.description}</div>}
              </span>
              <span className="col" style={{ width: 90 }}>
                <span className="tag primary">{a.enabled === false ? "停用" : "启用"}</span>
              </span>
            </div>
          ))}
      </div>
    </ViewShell>
  );
}
