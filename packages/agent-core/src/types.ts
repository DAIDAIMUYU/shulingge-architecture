import type {
  Agent,
  ContextRequest,
  ContextResult,
  ContextSource,
  RunNodeResult,
  RunRecord,
  RunStatus,
  TokenUsage,
  WriteScope,
} from "@shulingge/shared";
import type { ChatResponse } from "@shulingge/provider-adapters";

export interface AgentCatalog {
  active: Agent[];
  reserved: Agent[];
  all: Agent[];
}

export interface BuildContextInput extends ContextRequest {
  projectId: string;
  novelId: string;
}

export interface BuiltContext extends ContextResult {
  agent: Agent;
  content: string;
  sourceContents: Array<ContextSource & { content: string }>;
}

export interface WorkflowRuntimeState {
  chapterContent: string;
  summary?: string;
  repairRound: number;
  reviewTrail?: Array<{
    agentId: string;
    status: "ok" | "fail" | "warn";
    message?: string;
    rewriteInstructions?: string[];
  }>;
}

export interface WorkflowExecutionInput {
  workflowId?: string;
  chapterId: string;
  initialContent: string;
  maxRepairRounds?: number;
  maxJsonRetries?: number;
}

export interface WorkflowExecutionContext {
  agent: Agent;
  state: WorkflowRuntimeState;
  attempt: number;
}

export interface WorkflowFailurePayload {
  kind:
    | "check-failed"
    | "model-failed"
    | "json-invalid"
    | "write-failed"
    | "context-overlimit"
    | "budget-exceeded"
    | "cancelled";
  message: string;
  rewriteScope?: WriteScope;
  rewriteInstructions?: string[];
}

export interface WorkflowWriterPayload {
  content: string;
}

export interface WorkflowSummaryPayload {
  summary: string;
}

export interface WorkflowControllerPayload {
  finalText: string;
}

export interface WorkflowGuardPayload extends Partial<RunNodeResult> {
  status: "ok" | "fail" | "warn";
  score?: number;
  mustRewrite?: boolean;
  rewriteScope?: WriteScope;
  rewriteInstructions?: string[];
}

export type WorkflowNodePayload =
  | WorkflowWriterPayload
  | WorkflowGuardPayload
  | WorkflowSummaryPayload
  | WorkflowControllerPayload;

export interface WorkflowNodeHandlerResult {
  structured?: WorkflowNodePayload;
  rawText?: string;
  displayText?: string;
  tokens?: TokenUsage;
}

export type WorkflowNodeHandler = (
  context: WorkflowExecutionContext,
) => Promise<WorkflowNodeHandlerResult> | WorkflowNodeHandlerResult;

export interface WorkflowHandlers {
  writer: WorkflowNodeHandler;
  ruleGuard: WorkflowNodeHandler;
  voice: WorkflowNodeHandler;
  relationship: WorkflowNodeHandler;
  timeline: WorkflowNodeHandler;
  canon: WorkflowNodeHandler;
  polish: WorkflowNodeHandler;
  summary: WorkflowNodeHandler;
  controller: WorkflowNodeHandler;
}

export interface WorkflowRunOutcome {
  run: RunRecord;
  state: WorkflowRuntimeState;
}

export interface WorkflowRunHandle {
  runId: string;
  cancel(): void;
  result: Promise<WorkflowRunOutcome>;
}

export interface MvpAgentRuntimeOptions {
  vaultRoot: string;
  projectId: string;
  novelId: string;
  chapterId: string;
  modelRunner: {
    chat(modelConfigId: string, request: {
      messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      stream?: boolean;
      jsonMode?: boolean;
      maxTokens?: number;
      temperature?: number;
    }): Promise<ChatResponse>;
  };
}
