import {
  CURRENT_SCHEMA_VERSION,
  type Agent,
  type AgentOutputFormat,
  type AgentPermissionMode,
  type ProviderType,
} from "@shulingge/shared";

import type { AgentCatalog } from "./types.js";

interface AgentTemplateInput {
  id: string;
  name: string;
  description: string;
  type: AgentPermissionMode;
  modelConfigId: string;
  readScope: string[];
  outputFormat?: AgentOutputFormat;
  order: number;
  enabled?: boolean;
  speak?: Partial<Agent["speak"]>;
  permissions?: Partial<Agent["permissions"]>;
}

function createAgentTemplate(input: AgentTemplateInput): Agent {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    enabled: input.enabled ?? true,
    type: input.type,
    workflowId: "mvp-default-workflow",
    order: input.order,
    modelConfigId: input.modelConfigId,
    readScope: input.readScope,
    builtInRules: [],
    skills: [],
    outputFormat: input.outputFormat ?? "json+text",
    permissions: {
      canWriteDraft: false,
      canRewriteDraft: false,
      canPatchParagraph: false,
      canBlockWorkflow: false,
      canRequestRewrite: false,
      canWriteState: false,
      canUpdateRules: false,
      ...input.permissions,
    },
    speak: {
      speak: false,
      showReasoning: false,
      showStructured: true,
      onlyOnFailure: false,
      ...input.speak,
    },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export function createDefaultAgentCatalog(_defaultProvider: ProviderType = "openai-compatible"): AgentCatalog {
  const active: Agent[] = [
    createAgentTemplate({
      id: "controller-agent",
      name: "总控 Agent",
      description: "汇总各 Agent 结果并给出最终结论。",
      type: "controller",
      modelConfigId: "model-controller",
      readScope: ["runs", "summaries", "workflow-results"],
      order: 90,
      permissions: {},
      speak: { speak: true, onlyOnFailure: false },
    }),
    createAgentTemplate({
      id: "writer-agent",
      name: "正文写作 Agent",
      description: "唯一允许写正文的 Agent。",
      type: "writer",
      modelConfigId: "model-writer",
      readScope: ["manuscript", "outline", "worldbook", "characters", "summaries"],
      order: 10,
      permissions: {
        canWriteDraft: true,
        canRewriteDraft: true,
        canPatchParagraph: true,
      },
      speak: { speak: true },
    }),
    createAgentTemplate({
      id: "rule-guard-agent",
      name: "规则守卫 Agent",
      description: "检查锁定规则、硬规则与正文元信息混入。",
      type: "blocker",
      modelConfigId: "model-rule-guard",
      readScope: ["manuscript", "rules", "chapter-metadata"],
      order: 20,
      permissions: {
        canBlockWorkflow: true,
        canRequestRewrite: true,
      },
      speak: { speak: true, onlyOnFailure: true },
    }),
    createAgentTemplate({
      id: "voice-agent",
      name: "角色声音 Agent",
      description: "检查角色台词、称呼、语气与 OOC 风险。",
      type: "checker",
      modelConfigId: "model-voice",
      readScope: ["manuscript", "characters", "relations", "summaries"],
      order: 30,
      permissions: {
        canBlockWorkflow: true,
        canRequestRewrite: true,
      },
      speak: { speak: true, onlyOnFailure: true },
    }),
    createAgentTemplate({
      id: "relationship-agent",
      name: "关系/情感线 Agent",
      description: "检查关系推进、情感跃迁与互动自然度。",
      type: "checker",
      modelConfigId: "model-relationship",
      readScope: ["manuscript", "characters", "relations", "timeline", "summaries"],
      order: 40,
      permissions: {
        canBlockWorkflow: true,
        canRequestRewrite: true,
      },
      speak: { speak: true, onlyOnFailure: true },
    }),
    createAgentTemplate({
      id: "timeline-agent",
      name: "时间线 Agent",
      description: "检查事件顺序、在场状态、知情范围与时间连续性。",
      type: "checker",
      modelConfigId: "model-timeline",
      readScope: ["manuscript", "timeline", "states", "characters", "summaries"],
      order: 50,
      permissions: {
        canBlockWorkflow: true,
        canRequestRewrite: true,
      },
      speak: { speak: true, onlyOnFailure: true },
    }),
    createAgentTemplate({
      id: "canon-agent",
      name: "世界书/原作校对 Agent",
      description: "检查世界书设定、原作事实与本作改写冲突。",
      type: "checker",
      modelConfigId: "model-canon",
      readScope: ["manuscript", "worldbook", "characters", "timeline", "summaries"],
      order: 60,
      permissions: {
        canBlockWorkflow: true,
        canRequestRewrite: true,
      },
      speak: { speak: true, onlyOnFailure: true },
    }),
    createAgentTemplate({
      id: "polish-agent",
      name: "润色/去 AI 味 Agent",
      description: "检查重复表达、解释腔和 AI 味，默认给出润色建议。",
      type: "advisor",
      modelConfigId: "model-polish",
      readScope: ["manuscript", "summaries"],
      order: 70,
      permissions: {
        canRequestRewrite: true,
      },
      speak: { speak: true, onlyOnFailure: false },
    }),
    createAgentTemplate({
      id: "summary-agent",
      name: "摘要/状态更新 Agent",
      description: "定稿后生成摘要与状态变更。",
      type: "state-updater",
      modelConfigId: "model-summary",
      readScope: ["manuscript", "summaries", "states"],
      order: 80,
      permissions: {
        canWriteState: true,
      },
      speak: { speak: true },
    }),
  ];

  const reserved: Agent[] = [
    ["reserved-agent-01", "预留 Agent 01"],
    ["reserved-agent-02", "预留 Agent 02"],
    ["reserved-agent-03", "预留 Agent 03"],
    ["reserved-agent-04", "预留 Agent 04"],
  ].map(([id, name], index) =>
    createAgentTemplate({
      id,
      name,
      description: "结构预留，占位等待后续扩展接入。",
      type: "checker",
      modelConfigId: `model-${id}`,
      readScope: [],
      order: 100 + index,
      enabled: false,
      permissions: {},
      speak: { speak: false, onlyOnFailure: true },
    }),
  );

  const all = [...active, ...reserved].sort((left, right) => left.order - right.order);
  return { active, reserved, all };
}

export function getAgentById(catalog: AgentCatalog, agentId: string): Agent | undefined {
  return catalog.all.find((agent) => agent.id === agentId);
}
