import { Plus, ShieldAlert } from "lucide-react";

import { ViewShell } from "./common.js";

// 规则库：后端规则以 Vault 文件为真实数据、并提供冲突扫描接口；
// 规则列表 API 后续补齐，这里先展示分级示例与说明。
const SAMPLE = [
  { id: "r1", name: "角色行为规则", level: "硬规则", desc: "禁止 OOC（角色不能做违背设定的行为）" },
  { id: "r2", name: "世界观设定规则", level: "硬规则", desc: "不得违反已确立的世界书设定" },
  { id: "r3", name: "时间线连贯规则", level: "中规则", desc: "事件时序需与时间线一致" },
  { id: "r4", name: "文笔风格规则", level: "软规则", desc: "保持既定叙事语气与节奏" },
];

const levelClass = (lv: string) => (lv === "硬规则" ? "primary" : "");

export function RulesView() {
  return (
    <ViewShell
      title="规则"
      subtitle="分级规则与冲突检测：硬规则程序强制、软规则风格引导"
      actions={
        <>
          <button type="button" className="btn">
            <ShieldAlert size={15} strokeWidth={2} />
            冲突扫描
          </button>
          <button type="button" className="btn btn-primary">
            <Plus size={15} strokeWidth={2} />
            新建规则
          </button>
        </>
      }
    >
      <div className="list-card">
        <div className="list-row head">
          <span className="col col-grow">规则</span>
          <span className="col" style={{ width: 100 }}>等级</span>
          <span className="col" style={{ width: 90 }}>状态</span>
        </div>
        {SAMPLE.map((r) => (
          <div className="list-row" key={r.id} style={{ cursor: "default" }}>
            <span className="col col-grow">
              <div className="col-name">{r.name}</div>
              <div className="col-sub">{r.desc}</div>
            </span>
            <span className="col" style={{ width: 100 }}>
              <span className={`tag ${levelClass(r.level)}`}>{r.level}</span>
            </span>
            <span className="col" style={{ width: 90 }}>
              <span className="tag">启用</span>
            </span>
          </div>
        ))}
      </div>
      <p className="faint" style={{ marginTop: 14, fontSize: 12 }}>
        以上为规则分级示例；接入真实规则列表与冲突扫描结果属后续切片。
      </p>
    </ViewShell>
  );
}
