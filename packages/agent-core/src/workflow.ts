import { randomUUID } from "node:crypto";

import { CURRENT_SCHEMA_VERSION, type Agent, type RunNodeResult, type RunRecord, type RunStatus } from "@shulingge/shared";

import { createDefaultAgentCatalog, getAgentById } from "./agents.js";
import type {
  WorkflowControllerPayload,
  WorkflowExecutionContext,
  WorkflowExecutionInput,
  WorkflowFailurePayload,
  WorkflowGuardPayload,
  WorkflowHandlers,
  WorkflowNodeHandler,
  WorkflowNodeHandlerResult,
  WorkflowRunHandle,
  WorkflowRunOutcome,
  WorkflowRuntimeState,
  WorkflowSummaryPayload,
  WorkflowWriterPayload,
} from "./types.js";

const WORKFLOW_ID = "mvp-default-workflow";

const WORKFLOW_NODE_ORDER = [
  { agentId: "writer-agent", kind: "writer" },
  { agentId: "rule-guard-agent", kind: "ruleGuard" },
  { agentId: "voice-agent", kind: "voice" },
  { agentId: "relationship-agent", kind: "relationship" },
  { agentId: "timeline-agent", kind: "timeline" },
  { agentId: "canon-agent", kind: "canon" },
  { agentId: "polish-agent", kind: "polish" },
  { agentId: "summary-agent", kind: "summary" },
  { agentId: "controller-agent", kind: "controller" },
] as const;

class WorkflowEngineError extends Error {
  constructor(
    public readonly payload: WorkflowFailurePayload,
    public readonly status: RunStatus,
  ) {
    super(payload.message);
  }
}

function createEmptyNode(agentId: string): RunNodeResult {
  return {
    agentId,
    status: "skipped",
  };
}

function addTokens(
  left: { in: number; out: number },
  right?: { in: number; out: number },
): { in: number; out: number } {
  return {
    in: left.in + (right?.in ?? 0),
    out: left.out + (right?.out ?? 0),
  };
}

function parseJsonText<T>(rawText: string, kind: string): T {
  try {
    return JSON.parse(rawText) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WorkflowEngineError(
      {
        kind: "json-invalid",
        message: `${kind} returned invalid JSON: ${message}`,
      },
      "paused",
    );
  }
}

function resolveStructuredPayload<T>(result: WorkflowNodeHandlerResult, kind: string): T {
  if (result.structured) {
    return result.structured as T;
  }
  if (result.rawText) {
    return parseJsonText<T>(result.rawText, kind);
  }
  throw new WorkflowEngineError(
    {
      kind: "json-invalid",
      message: `${kind} returned no structured payload`,
    },
    "paused",
  );
}

function normalizeFailure(error: unknown): WorkflowEngineError {
  if (error instanceof WorkflowEngineError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/context/i.test(message) && /limit|over/i.test(message)) {
    return new WorkflowEngineError({ kind: "context-overlimit", message }, "paused");
  }
  if (/budget|cost/i.test(message)) {
    return new WorkflowEngineError({ kind: "budget-exceeded", message }, "paused");
  }
  if (/write/i.test(message)) {
    return new WorkflowEngineError({ kind: "write-failed", message }, "failed");
  }
  if (/cancel/i.test(message)) {
    return new WorkflowEngineError({ kind: "cancelled", message }, "paused");
  }

  return new WorkflowEngineError({ kind: "model-failed", message }, "paused");
}

async function runWithJsonRetries<T>(
  handler: WorkflowNodeHandler,
  context: WorkflowExecutionContext,
  kind: string,
  maxJsonRetries: number,
): Promise<{ payload: T; tokens: { in: number; out: number } }> {
  let lastError: WorkflowEngineError | null = null;

  for (let attempt = 0; attempt <= maxJsonRetries; attempt += 1) {
    try {
      const result = await handler({ ...context, attempt });
      return {
        payload: resolveStructuredPayload<T>(result, kind),
        tokens: result.tokens ?? { in: 0, out: 0 },
      };
    } catch (error) {
      const normalized = normalizeFailure(error);
      if (normalized.payload.kind !== "json-invalid" || attempt === maxJsonRetries) {
        throw normalized;
      }
      lastError = normalized;
    }
  }

  throw lastError ?? new WorkflowEngineError({ kind: "json-invalid", message: `${kind} failed` }, "paused");
}

function findRequiredAgent(agentId: string): Agent {
  const catalog = createDefaultAgentCatalog();
  const agent = getAgentById(catalog, agentId);
  if (!agent) {
    throw new Error(`Missing agent template: ${agentId}`);
  }
  return agent;
}

function toRunNodeStatus(status: "ok" | "fail" | "warn"): "ok" | "fail" | "warn" {
  return status;
}

function recordReviewNode(
  nodes: RunNodeResult[],
  index: number,
  agentId: string,
  payload: WorkflowGuardPayload,
): void {
  nodes[index] = {
    agentId,
    status: toRunNodeStatus(payload.status),
    score: payload.score,
    lockedViolations: payload.lockedViolations,
    hardViolations: payload.hardViolations,
    softViolations: payload.softViolations,
    mustRewrite: payload.mustRewrite,
    rewriteScope: payload.rewriteScope,
    rewriteInstructions: payload.rewriteInstructions,
  };
}

export function createMvpWorkflowRun(
  handlers: WorkflowHandlers,
  input: WorkflowExecutionInput,
): WorkflowRunHandle {
  const runId = randomUUID();
  let cancelled = false;

  const result = (async (): Promise<WorkflowRunOutcome> => {
    const state: WorkflowRuntimeState = {
      chapterContent: input.initialContent,
      repairRound: 0,
      reviewTrail: [],
    };
    const nodes: RunNodeResult[] = WORKFLOW_NODE_ORDER.map((node) => createEmptyNode(node.agentId));
    let status: RunStatus = "running";
    let totalTokens = { in: 0, out: 0 };
    const startedAt = new Date().toISOString();
    const maxRepairRounds = input.maxRepairRounds ?? 2;
    const maxJsonRetries = input.maxJsonRetries ?? 1;

    const ensureNotCancelled = () => {
      if (cancelled) {
        throw new WorkflowEngineError(
          {
            kind: "cancelled",
            message: "Workflow run cancelled",
          },
          "paused",
        );
      }
    };

    try {
      while (true) {
        state.reviewTrail = [];
        ensureNotCancelled();

        const writerAgent = findRequiredAgent("writer-agent");
        const writerResult = await runWithJsonRetries<WorkflowWriterPayload>(
          handlers.writer,
          { agent: writerAgent, state, attempt: 0 },
          "writer",
          maxJsonRetries,
        );
        state.chapterContent = writerResult.payload.content;
        totalTokens = addTokens(totalTokens, writerResult.tokens);
        nodes[0] = {
          agentId: writerAgent.id,
          status: "ok",
        };

        ensureNotCancelled();

        const reviewSteps: Array<{
          agentId: string;
          nodeIndex: number;
          kind: string;
          handler: WorkflowNodeHandler;
        }> = [
          { agentId: "rule-guard-agent", nodeIndex: 1, kind: "ruleGuard", handler: handlers.ruleGuard },
          { agentId: "voice-agent", nodeIndex: 2, kind: "voice", handler: handlers.voice },
          { agentId: "relationship-agent", nodeIndex: 3, kind: "relationship", handler: handlers.relationship },
          { agentId: "timeline-agent", nodeIndex: 4, kind: "timeline", handler: handlers.timeline },
          { agentId: "canon-agent", nodeIndex: 5, kind: "canon", handler: handlers.canon },
          { agentId: "polish-agent", nodeIndex: 6, kind: "polish", handler: handlers.polish },
        ];

        let shouldRewrite = false;

        for (const step of reviewSteps) {
          ensureNotCancelled();

          const reviewAgent = findRequiredAgent(step.agentId);
          const reviewResult = await runWithJsonRetries<WorkflowGuardPayload>(
            step.handler,
            { agent: reviewAgent, state, attempt: 0 },
            step.kind,
            maxJsonRetries,
          );
          totalTokens = addTokens(totalTokens, reviewResult.tokens);
          recordReviewNode(nodes, step.nodeIndex, reviewAgent.id, reviewResult.payload);
          state.reviewTrail?.push({
            agentId: reviewAgent.id,
            status: reviewResult.payload.status,
            rewriteInstructions: reviewResult.payload.rewriteInstructions,
          });

          if (reviewResult.payload.status === "fail" || reviewResult.payload.mustRewrite) {
            state.repairRound += 1;
            if (state.repairRound > maxRepairRounds) {
              throw new WorkflowEngineError(
                {
                  kind: "check-failed",
                  message: `Exceeded maxRepairRounds (${maxRepairRounds})`,
                  rewriteScope: reviewResult.payload.rewriteScope,
                  rewriteInstructions: reviewResult.payload.rewriteInstructions,
                },
                "paused",
              );
            }
            shouldRewrite = true;
            break;
          }
        }

        if (shouldRewrite) {
          continue;
        }

        const summaryAgent = findRequiredAgent("summary-agent");
        const summaryResult = await runWithJsonRetries<WorkflowSummaryPayload>(
          handlers.summary,
          { agent: summaryAgent, state, attempt: 0 },
          "summary",
          maxJsonRetries,
        );
        state.summary = summaryResult.payload.summary;
        totalTokens = addTokens(totalTokens, summaryResult.tokens);
        nodes[7] = {
          agentId: summaryAgent.id,
          status: "ok",
        };

        const controllerAgent = findRequiredAgent("controller-agent");
        const controllerResult = await runWithJsonRetries<WorkflowControllerPayload>(
          handlers.controller,
          { agent: controllerAgent, state, attempt: 0 },
          "controller",
          maxJsonRetries,
        );
        state.chapterContent = controllerResult.payload.finalText;
        totalTokens = addTokens(totalTokens, controllerResult.tokens);
        nodes[8] = {
          agentId: controllerAgent.id,
          status: "ok",
        };

        status = "ok";
        break;
      }
    } catch (error) {
      const normalized = normalizeFailure(error);
      status = normalized.status;
    }

    const run: RunRecord = {
      id: runId,
      chapterId: input.chapterId,
      workflowId: input.workflowId ?? WORKFLOW_ID,
      nodes,
      tokens: totalTokens,
      cost: 0,
      contextSources: [],
      startedAt,
      endedAt: new Date().toISOString(),
      status,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };

    return {
      run,
      state,
    };
  })();

  return {
    runId,
    cancel() {
      cancelled = true;
    },
    result,
  };
}
