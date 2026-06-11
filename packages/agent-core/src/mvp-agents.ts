import { createDefaultAgentCatalog, getAgentById } from "./agents.js";
import { buildContext } from "./context-builder.js";
import type {
  MvpAgentRuntimeOptions,
  WorkflowControllerPayload,
  WorkflowGuardPayload,
  WorkflowHandlers,
  WorkflowSummaryPayload,
  WorkflowWriterPayload,
} from "./types.js";

function requireAgentModelId(agentId: string): string {
  const agent = getAgentById(createDefaultAgentCatalog(), agentId);
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }
  return agent.modelConfigId;
}

function parseJsonPayload<T>(content: string, label: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} returned invalid JSON: ${message}`);
  }
}

async function runReviewAgent(
  options: MvpAgentRuntimeOptions,
  catalog: ReturnType<typeof createDefaultAgentCatalog>,
  context: Parameters<WorkflowHandlers["ruleGuard"]>[0],
  config: {
    agentId: string;
    label: string;
    budget: number;
    maxTokens: number;
    systemPrompt: string;
  },
) {
  const built = await buildContext(options.vaultRoot, catalog, {
    agentId: config.agentId,
    chapterId: options.chapterId,
    projectId: options.projectId,
    novelId: options.novelId,
    forceInclude: [],
    exclude: [],
    tokenBudget: config.budget,
  });

  const response = await options.modelRunner.chat(requireAgentModelId(config.agentId), {
    jsonMode: true,
    maxTokens: config.maxTokens,
    messages: [
      {
        role: "system",
        content: config.systemPrompt,
      },
      {
        role: "user",
        content: `上下文来源：\n${built.content}\n\n待检查正文：\n${context.state.chapterContent}`,
      },
    ],
  });

  const payload = parseJsonPayload<WorkflowGuardPayload & { displayText?: string }>(
    response.content,
    config.label,
  );
  return {
    structured: {
      status: payload.status,
      score: payload.score,
      lockedViolations: payload.lockedViolations ?? 0,
      hardViolations: payload.hardViolations ?? 0,
      softViolations: payload.softViolations ?? 0,
      mustRewrite: payload.mustRewrite ?? false,
      rewriteScope: payload.rewriteScope,
      rewriteInstructions: payload.rewriteInstructions ?? [],
    },
    displayText: payload.displayText ?? `${config.label}: ${payload.status}`,
    tokens: response.usage,
  };
}

export function createMvpAgentHandlers(options: MvpAgentRuntimeOptions): WorkflowHandlers {
  const catalog = createDefaultAgentCatalog();

  return {
    async writer(context) {
      const built = await buildContext(options.vaultRoot, catalog, {
        agentId: "writer-agent",
        chapterId: options.chapterId,
        projectId: options.projectId,
        novelId: options.novelId,
        forceInclude: [],
        exclude: [],
        tokenBudget: 2400,
      });

      const rewriteInstructions = context.state.repairRound > 0
        ? "本轮为修复写作。只按上轮检查意见做局部修复，不能私自扩剧情。"
        : "本轮为首次写作。";

      const response = await options.modelRunner.chat(requireAgentModelId("writer-agent"), {
        jsonMode: true,
        maxTokens: 1200,
        messages: [
          {
            role: "system",
            content: "你是正文写作 Agent。输出 JSON：{\"content\":\"...\"}。只能返回正文，不得包含 frontmatter、元数据或解释。",
          },
          {
            role: "user",
            content: `${rewriteInstructions}\n\n当前上下文：\n${built.content}\n\n当前草稿：\n${context.state.chapterContent}`,
          },
        ],
      });

      const payload = parseJsonPayload<WorkflowWriterPayload>(response.content, "writer");
      return {
        structured: payload,
        displayText: `正文写作 Agent 已生成 ${payload.content.length} 字符草稿。`,
        tokens: response.usage,
      };
    },

    async ruleGuard(context) {
      const built = await buildContext(options.vaultRoot, catalog, {
        agentId: "rule-guard-agent",
        chapterId: options.chapterId,
        projectId: options.projectId,
        novelId: options.novelId,
        forceInclude: [],
        exclude: [],
        tokenBudget: 1800,
      });

      const response = await options.modelRunner.chat(requireAgentModelId("rule-guard-agent"), {
        jsonMode: true,
        maxTokens: 900,
        messages: [
          {
            role: "system",
            content:
              "你是规则守卫 Agent。必须返回 JSON，至少包含 status, score, mustRewrite, rewriteScope, rewriteInstructions, lockedViolations, hardViolations, softViolations, displayText。若发现 frontmatter、元信息混入正文、锁定/硬规则违规，则设 status=fail 并给出局部重写建议。",
          },
          {
            role: "user",
            content: `上下文来源：\n${built.content}\n\n待检查正文：\n${context.state.chapterContent}`,
          },
        ],
      });

      const payload = parseJsonPayload<WorkflowGuardPayload & { displayText?: string }>(
        response.content,
        "ruleGuard",
      );
      return {
        structured: {
          status: payload.status,
          score: payload.score,
          lockedViolations: payload.lockedViolations ?? 0,
          hardViolations: payload.hardViolations ?? 0,
          softViolations: payload.softViolations ?? 0,
          mustRewrite: payload.mustRewrite ?? false,
          rewriteScope: payload.rewriteScope,
          rewriteInstructions: payload.rewriteInstructions ?? [],
        },
        displayText:
          payload.displayText ??
          `规则守卫 Agent：status=${payload.status}, score=${payload.score ?? 0}`,
        tokens: response.usage,
      };
    },

    async voice(context) {
      return runReviewAgent(options, catalog, context, {
        agentId: "voice-agent",
        label: "voice",
        budget: 1600,
        maxTokens: 700,
        systemPrompt:
          "你是角色声音 Agent。必须返回 JSON，至少包含 status, score, mustRewrite, rewriteScope, rewriteInstructions, displayText。重点检查称呼、语气、口癖、典型台词和 OOC；若问题明显则返回 fail 并给出局部重写建议。",
      });
    },

    async relationship(context) {
      return runReviewAgent(options, catalog, context, {
        agentId: "relationship-agent",
        label: "relationship",
        budget: 1600,
        maxTokens: 700,
        systemPrompt:
          "你是关系/情感线 Agent。必须返回 JSON，至少包含 status, score, mustRewrite, rewriteScope, rewriteInstructions, displayText。重点检查关系推进、情绪跳变和互动自然度；若推进过快或不合关系阶段则返回 fail。",
      });
    },

    async timeline(context) {
      return runReviewAgent(options, catalog, context, {
        agentId: "timeline-agent",
        label: "timeline",
        budget: 1600,
        maxTokens: 700,
        systemPrompt:
          "你是时间线 Agent。必须返回 JSON，至少包含 status, score, mustRewrite, rewriteScope, rewriteInstructions, displayText。重点检查事件顺序、在场状态、知情范围与时间连续性；严重冲突返回 fail。",
      });
    },

    async canon(context) {
      return runReviewAgent(options, catalog, context, {
        agentId: "canon-agent",
        label: "canon",
        budget: 1600,
        maxTokens: 700,
        systemPrompt:
          "你是世界大纲/原作校对 Agent。必须返回 JSON，至少包含 status, score, mustRewrite, rewriteScope, rewriteInstructions, displayText。重点检查世界大纲设定、角色基础事实和原作硬冲突；出现硬冲突返回 fail。",
      });
    },

    async polish(context) {
      return runReviewAgent(options, catalog, context, {
        agentId: "polish-agent",
        label: "polish",
        budget: 1200,
        maxTokens: 600,
        systemPrompt:
          "你是润色/去 AI 味 Agent。必须返回 JSON，至少包含 status, score, mustRewrite, rewriteScope, rewriteInstructions, displayText。重点检查重复解释、模板化措辞和 AI 味；默认可返回 warn 提建议，必要时才返回 fail。",
      });
    },

    async summary(context) {
      const built = await buildContext(options.vaultRoot, catalog, {
        agentId: "summary-agent",
        chapterId: options.chapterId,
        projectId: options.projectId,
        novelId: options.novelId,
        forceInclude: [],
        exclude: [],
        tokenBudget: 1200,
      });

      const response = await options.modelRunner.chat(requireAgentModelId("summary-agent"), {
        jsonMode: true,
        maxTokens: 600,
        messages: [
          {
            role: "system",
            content: "你是摘要/状态更新 Agent。返回 JSON：{\"summary\":\"一句话摘要\"}。",
          },
          {
            role: "user",
            content: `参考上下文：\n${built.content}\n\n当前定稿正文：\n${context.state.chapterContent}`,
          },
        ],
      });

      const payload = parseJsonPayload<WorkflowSummaryPayload>(response.content, "summary");
      return {
        structured: payload,
        displayText: `摘要/状态更新 Agent：${payload.summary}`,
        tokens: response.usage,
      };
    },

    controller(context) {
      const payload: WorkflowControllerPayload = {
        finalText: context.state.chapterContent,
      };
      return {
        structured: payload,
        displayText: `总控 Agent：当前流程通过，摘要为「${context.state.summary ?? ""}」`,
        tokens: { in: 0, out: 0 },
      };
    },
  };
}
