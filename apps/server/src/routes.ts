import {
  createChapter,
  createNovel,
  createProject,
  deleteChapter,
  deleteNovel,
  listChapters,
  loadEditorChapter,
  listNovels,
  listProjects,
  moveChapter,
  renameChapter,
  renameNovel,
  saveEditorAnnotations,
  saveEditorChapter,
  saveEditorLocks,
} from "./editor.js";
import {
  commitImport,
  createVaultBackup,
  exportProjectData,
  preparePublishPackage,
  previewImport,
  restoreVaultBackup,
} from "@shulingge/import-export";
import { rebuildIndex, searchIndex, type IndexDocumentType } from "@shulingge/indexer";
import { scanRuleConflicts } from "@shulingge/rule-core";
import type { Rule } from "@shulingge/shared";
import { initializeVault } from "@shulingge/vault-core";
import {
  createModel,
  deleteModel,
  getModel,
  listModels,
  storeModelApiKey,
  testModelConnection,
  updateModel,
} from "./models.js";
import { readFile } from "node:fs/promises";
import { completeBootstrap, getBootstrapStatus } from "./bootstrap.js";
import { exportDiagnosticsBundle } from "./diagnostics.js";
import { chatWithDirector, executeDirectorTask, reviewChapterWithDirector } from "./director-chat.js";
import { buildHealthReport } from "./doctor.js";
import {
  createAgent,
  deleteAgent,
  exportAgents,
  getAgent,
  importAgents,
  listAgents,
  updateAgent,
} from "./agents.js";
import {
  buildKnowledgeGraph,
  createCharacter,
  createKnowledgeItem,
  createRelation,
  createRule,
  createTimelineEvent,
  createWorldbookEntry,
  deleteCharacter,
  deleteKnowledgeItem,
  deleteRelation,
  deleteRule,
  deleteTimelineEvent,
  deleteWorldbookEntry,
  getCharacter,
  getKnowledgeItem,
  getRelation,
  getRule,
  getTimelineEvent,
  getWorldbookEntry,
  listCharacters,
  listKnowledgeItems,
  listRelations,
  listRules,
  listTimelineEvents,
  listWorldbookEntries,
  updateCharacter,
  updateKnowledgeItem,
  updateRelation,
  updateRule,
  updateTimelineEvent,
  updateWorldbookEntry,
} from "./knowledge.js";
import {
  buildContextPresetDiff,
  deleteContextPreset,
  getContextPreset,
  listContextPresets,
  saveContextPreset,
} from "./context-presets.js";
import { runConsistencyCheck } from "./consistency.js";
import { runAdvancedConsistencyCheck } from "./consistency.js";
import { listServerNotifications } from "./notifications.js";
import {
  finalizeChapter,
  listChapterTimeline,
  rollbackChapterFromSnapshot,
  unlockFinalizedChapter,
} from "./versioning.js";
import {
  cancelWorkflowRun,
  getWorkflowRun,
  listWorkflowRuns,
  startWorkflowRun,
  waitForWorkflowRun,
} from "./workflows.js";

import { importSkill, importSkillFromGitHub, listSkills } from "./skills.js";
import { executeSkill } from "./skills.js";
import { invokePluginHook, listPlugins, registerPlugin, updatePluginState } from "./plugins.js";
import { createCollaborationSession, listCollaborationSessions, updateCollaborationSession } from "./collaboration.js";
import { buildRelationReplay } from "./graph-replay.js";
import { assistCharacter } from "./assist-character.js";
import { getPublicResearchSettings, listSearchSources, researchCharacter, researchTimeline, researchWorldbook, updateResearchSettings } from "./assist-character-research.js";
import { assistWorldbook } from "./assist-worldbook.js";
import { assistTimeline } from "./assist-timeline.js";
import { loadDirectorConversation, saveDirectorConversation } from "./director-conversations.js";
import { listThemeCommunity, publishThemeCommunityEntry } from "./theme-market.js";
import {
  applyDownloadedUpdate,
  checkForAppUpdate,
  downloadAppUpdate,
  getUpdateStatus,
  prepareAutomaticUpdate,
  rollbackAppliedUpdate,
} from "./updates.js";
import {
  listSkillMarket,
  moderateSkillMarketEntry,
  publishSkillMarketEntry,
  rateSkillMarketEntry,
  reportSkillMarketEntry,
} from "./skill-market.js";

import { createHttpError } from "./errors.js";
import type { RouteDefinition, SearchRequestQuery, ServerContext } from "./types.js";

function formatErrorReason(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function requireVaultRoot(context: ServerContext): string {
  if (!context.state.vaultRoot) {
    throw createHttpError(400, "SERVER_VAULT_NOT_SELECTED", "尚未选择资料库，请先选择 Vault");
  }

  return context.state.vaultRoot;
}

function parseSearchQuery(query: URLSearchParams): SearchRequestQuery {
  const types = query.getAll("type").filter(isIndexDocumentType);
  const tags = query.getAll("tag");
  const limit = query.get("limit");

  return {
    text: query.get("q") ?? undefined,
    projectId: query.get("project") ?? undefined,
    novelId: query.get("novel") ?? undefined,
    type: types.length > 1 ? types : types[0] ?? undefined,
    tags: tags.length > 0 ? tags : undefined,
    limit: limit ? Number(limit) : undefined,
    semantic: query.get("semantic") === "1" || query.get("semantic") === "true",
    semanticProvider: query.get("semanticProvider") === "cloud" ? "cloud" : "local",
  };
}

function isIndexDocumentType(value: string): value is IndexDocumentType {
  return [
    "manuscript",
    "chapter-metadata",
    "character",
    "worldbook",
    "relation",
    "timeline",
    "knowledge-item",
    "summary",
    "run",
  ].includes(value);
}

function getModelOptions(context: ServerContext) {
  return {
    credentialService: context.services.credentialService,
    fetchImpl: context.services.fetchImpl,
    endpoints: context.services.providerEndpoints as never,
  };
}

export const routeDefinitions: RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/v1/bootstrap/status",
    async handler(_request, context) {
      return await getBootstrapStatus(context.state.vaultRoot, getModelOptions(context));
    },
  },
  {
    method: "POST",
    path: "/api/v1/bootstrap/complete",
    async handler(request, context) {
      const body = request.body as
        | {
            rootPath?: string;
            createDemoProject?: boolean;
            preferredTheme?: string;
            preferredLanguage?: string;
          }
        | undefined;

      if (!body?.rootPath) {
        throw createHttpError(400, "BOOTSTRAP_INVALID_REQUEST", "rootPath is required");
      }

      const result = await completeBootstrap(body, getModelOptions(context));
      context.state.vaultRoot = result.vaultRoot;
      await context.services.remote.reloadForVault(context.state.vaultRoot);
      return result;
    },
  },
  {
    method: "GET",
    path: "/api/v1/health",
    async handler(_request, context) {
      return {
        status: "ok",
        host: "127.0.0.1",
        vaultSelected: Boolean(context.state.vaultRoot),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/health/report",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await buildHealthReport(vaultRoot, context.services.remote.getStatus());
    },
  },
  {
    method: "GET",
    path: "/api/v1/notifications",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        notifications: await listServerNotifications(vaultRoot, context.services.remote.getStatus(), {
          projectId: request.query.get("projectId") ?? undefined,
          novelId: request.query.get("novelId") ?? undefined,
          chapterId: request.query.get("chapterId") ?? undefined,
        }),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/vault",
    async handler(_request, context) {
      return {
        rootPath: context.state.vaultRoot,
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/vault/select",
    async handler(request, context) {
      const body = request.body as { rootPath?: string } | undefined;
      if (!body?.rootPath) {
        throw createHttpError(400, "SERVER_INVALID_VAULT_SELECTION", "rootPath is required");
      }

      let selectedRootPath: string;
      try {
        const initialized = await initializeVault({ rootPath: body.rootPath });
        selectedRootPath = initialized.rootPath;
        context.state.vaultRoot = initialized.rootPath;
      } catch (error) {
        throw createHttpError(
          400,
          "SERVER_INVALID_VAULT_SELECTION",
          `无法创建或初始化资料库目录，请检查路径是否合法、是否有写入权限。具体原因：${formatErrorReason(error)}`,
        );
      }

      try {
        await context.services.remote.reloadForVault(selectedRootPath);
      } catch (error) {
        throw createHttpError(
          500,
          "SERVER_VAULT_REMOTE_RELOAD_FAILED",
          `资料库已初始化，但刷新远程服务失败。具体原因：${formatErrorReason(error)}`,
        );
      }

      return {
        rootPath: selectedRootPath,
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/remote/status",
    async handler(_request, context) {
      return context.services.remote.getStatus();
    },
  },
  {
    method: "POST",
    path: "/api/v1/remote/enable",
    async handler(request, context) {
      const body = request.body as { password?: string; port?: number; autoStart?: boolean } | undefined;
      if (!body?.password) {
        throw createHttpError(400, "REMOTE_INVALID_ENABLE_REQUEST", "password is required");
      }

      return context.services.remote.enable({
        password: body.password,
        port: body.port,
        autoStart: body.autoStart,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/remote/disable",
    async handler(_request, context) {
      return context.services.remote.disable();
    },
  },
  {
    method: "POST",
    path: "/api/v1/remote/password",
    async handler(request, context) {
      const body = request.body as { password?: string } | undefined;
      if (!body?.password) {
        throw createHttpError(400, "REMOTE_INVALID_PASSWORD_REQUEST", "password is required");
      }

      return context.services.remote.updatePassword(body.password);
    },
  },
  {
    method: "GET",
    path: "/api/v1/search",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const query = parseSearchQuery(request.query);
      if (query.semanticProvider === "cloud") {
        throw createHttpError(
          400,
          "SEMANTIC_CLOUD_NOT_ENABLED",
          "Cloud semantic retrieval is not enabled in V1.5 server defaults; use local provider or add explicit cloud integration",
        );
      }

      const results = await searchIndex(vaultRoot, query);
      return { results };
    },
  },
  {
    method: "POST",
    path: "/api/v1/index/rebuild",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { incremental?: boolean } | undefined;
      const result = await rebuildIndex(vaultRoot, {
        incremental: body?.incremental ?? false,
      });
      return result;
    },
  },
  {
    method: "POST",
    path: "/api/v1/director/chat",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await chatWithDirector(
        vaultRoot,
        (request.body as Record<string, unknown> | undefined) ?? {},
        getModelOptions(context),
      );
    },
  },
  {
    method: "POST",
    path: "/api/v1/director/execute",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await executeDirectorTask(
        vaultRoot,
        (request.body as Record<string, unknown> | undefined) ?? {},
        getModelOptions(context),
      );
    },
  },
  {
    method: "POST",
    path: "/api/v1/director/review",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await reviewChapterWithDirector(
        vaultRoot,
        (request.body as Record<string, unknown> | undefined) ?? {},
        getModelOptions(context),
      );
    },
  },
  {
    method: "GET",
    path: "/api/v1/director/conversations/:chapterId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await loadDirectorConversation(vaultRoot, {
        projectId: request.query.get("projectId") ?? undefined,
        novelId: request.query.get("novelId") ?? undefined,
        chapterId: request.params.chapterId,
      });
    },
  },
  {
    method: "PUT",
    path: "/api/v1/director/conversations/:chapterId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { projectId?: string; novelId?: string; messages?: unknown[] } | undefined;
      return await saveDirectorConversation(
        vaultRoot,
        {
          projectId: body?.projectId,
          novelId: body?.novelId,
          chapterId: request.params.chapterId,
        },
        body?.messages ?? [],
      );
    },
  },
  {
    method: "POST",
    path: "/api/v1/assist/character",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await assistCharacter(
        vaultRoot,
        (request.body as Record<string, unknown> | undefined) ?? {},
        getModelOptions(context),
      );
    },
  },
  {
    method: "GET",
    path: "/api/v1/assist/search-sources",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await listSearchSources(vaultRoot, context.services.credentialService);
    },
  },
  {
    method: "GET",
    path: "/api/v1/assist/research-settings",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await getPublicResearchSettings(vaultRoot, context.services.credentialService);
    },
  },
  {
    method: "PUT",
    path: "/api/v1/assist/research-settings",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await updateResearchSettings(vaultRoot, request.body, context.services.credentialService);
    },
  },
  {
    method: "POST",
    path: "/api/v1/assist/character/research",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await researchCharacter(
        vaultRoot,
        (request.body as Record<string, unknown> | undefined) ?? {},
        getModelOptions(context),
      );
    },
  },
  {
    method: "POST",
    path: "/api/v1/assist/worldbook",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await assistWorldbook(
        vaultRoot,
        (request.body as Record<string, unknown> | undefined) ?? {},
        getModelOptions(context),
      );
    },
  },
  {
    method: "POST",
    path: "/api/v1/assist/worldbook/research",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await researchWorldbook(
        vaultRoot,
        (request.body as Record<string, unknown> | undefined) ?? {},
        getModelOptions(context),
      );
    },
  },
  {
    method: "POST",
    path: "/api/v1/assist/timeline",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await assistTimeline(
        vaultRoot,
        (request.body as Record<string, unknown> | undefined) ?? {},
        getModelOptions(context),
      );
    },
  },
  {
    method: "POST",
    path: "/api/v1/assist/timeline/research",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await researchTimeline(
        vaultRoot,
        (request.body as Record<string, unknown> | undefined) ?? {},
        getModelOptions(context),
      );
    },
  },
  {
    method: "GET",
    path: "/api/v1/routes",
    async handler() {
      return {
        registered: routeDefinitions.map((route) => ({
          method: route.method,
          path: route.path,
        })),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/agents",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      const agents = await listAgents(vaultRoot);
      return {
        agents,
        active: agents.filter((agent) => agent.enabled),
        reserved: agents.filter((agent) => !agent.enabled),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/agents/export",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await exportAgents(vaultRoot);
    },
  },
  {
    method: "POST",
    path: "/api/v1/agents/import",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as Record<string, unknown> | undefined) ?? {};
      const mode = body.mode === "skip" ? "skip" : "overwrite";
      return await importAgents(vaultRoot, body.payload ?? body.agents ?? body, mode);
    },
  },
  {
    method: "GET",
    path: "/api/v1/agents/:agentId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        agent: await getAgent(vaultRoot, request.params.agentId),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/agents",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        agent: await createAgent(vaultRoot, (request.body as Record<string, unknown> | undefined) ?? {}),
      };
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/agents/:agentId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        agent: await updateAgent(
          vaultRoot,
          request.params.agentId,
          (request.body as Record<string, unknown> | undefined) ?? {},
        ),
      };
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/agents/:agentId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await deleteAgent(vaultRoot, request.params.agentId);
    },
  },
  {
    method: "GET",
    path: "/api/v1/templates/community",
    async handler() {
      const templatePath = new URL("../../../templates/community/index.json", import.meta.url);
      const raw = await readFile(templatePath, "utf8");
      return JSON.parse(raw) as unknown;
    },
  },
  {
    method: "GET",
    path: "/api/v1/context-presets",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        presets: await listContextPresets(vaultRoot),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/context-presets",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as Record<string, unknown> | undefined) ?? {};
      if (typeof body.id !== "string" || typeof body.name !== "string") {
        throw createHttpError(400, "CONTEXT_PRESET_INVALID", "id and name are required");
      }
      return {
        preset: await saveContextPreset(vaultRoot, body as never),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/context-presets/:presetId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        preset: await getContextPreset(vaultRoot, request.params.presetId),
      };
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/context-presets/:presetId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await deleteContextPreset(vaultRoot, request.params.presetId);
    },
  },
  {
    method: "POST",
    path: "/api/v1/context-presets/diff",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            leftPresetId?: string;
            rightPresetId?: string;
            agentId?: string;
            projectId?: string;
            novelId?: string;
            chapterId?: string;
          }
        | undefined;
      if (!body?.agentId || !body.projectId || !body.novelId || !body.chapterId) {
        throw createHttpError(
          400,
          "CONTEXT_PRESET_DIFF_INVALID",
          "agentId, projectId, novelId, and chapterId are required",
        );
      }
      return {
        diff: await buildContextPresetDiff(vaultRoot, {
          leftPresetId: body.leftPresetId,
          rightPresetId: body.rightPresetId,
          agentId: body.agentId,
          projectId: body.projectId,
          novelId: body.novelId,
          chapterId: body.chapterId,
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/consistency/check",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { projectId?: string; novelId?: string } | undefined;
      if (!body?.projectId || !body.novelId) {
        throw createHttpError(400, "CONSISTENCY_INVALID_REQUEST", "projectId and novelId are required");
      }
      return await runConsistencyCheck(vaultRoot, {
        projectId: body.projectId,
        novelId: body.novelId,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/consistency/check/advanced",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { projectId?: string; novelId?: string } | undefined;
      if (!body?.projectId || !body.novelId) {
        throw createHttpError(400, "CONSISTENCY_INVALID_REQUEST", "projectId and novelId are required");
      }
      return await runAdvancedConsistencyCheck(vaultRoot, {
        projectId: body.projectId,
        novelId: body.novelId,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/import/preview",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            archivePath?: string;
            projectId?: string;
            novelId?: string;
            mode?: "keep" | "standard" | "standard+backup";
          }
        | undefined;

      if (!body?.archivePath || !body.projectId || !body.novelId) {
        throw createHttpError(
          400,
          "IMPORT_INVALID_PREVIEW_REQUEST",
          "archivePath, projectId, and novelId are required",
        );
      }

      return await previewImport(vaultRoot, {
        archivePath: body.archivePath,
        projectId: body.projectId,
        novelId: body.novelId,
        mode: body.mode,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/import/commit",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            previewId?: string;
            mode?: "keep" | "standard" | "standard+backup";
          }
        | undefined;

      if (!body?.previewId) {
        throw createHttpError(400, "IMPORT_INVALID_COMMIT_REQUEST", "previewId is required");
      }

      return await commitImport(vaultRoot, {
        previewId: body.previewId,
        mode: body.mode,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/export",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            projectId?: string;
            novelId?: string;
            chapterId?: string;
            scope?: "chapter" | "novel" | "series";
            format?: "md" | "txt" | "docx" | "pdf" | "epub";
            template?: "submission" | "reading" | "backup" | "web" | "epub-reader";
          }
        | undefined;

      if (!body?.projectId || !body.novelId || !body.scope || !body.format) {
        throw createHttpError(
          400,
          "EXPORT_INVALID_REQUEST",
          "projectId, novelId, scope, and format are required",
        );
      }

      return await exportProjectData(vaultRoot, {
        projectId: body.projectId,
        novelId: body.novelId,
        chapterId: body.chapterId,
        scope: body.scope,
        format: body.format,
        template: body.template,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/publish/prepare",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            projectId?: string;
            novelId?: string;
            chapterId?: string;
            scope?: "chapter" | "novel";
            platform?: string;
            title?: string;
            summary?: string;
            tags?: string[];
            authorNote?: string;
            sensitiveWords?: string[];
          }
        | undefined;

      if (!body?.projectId || !body.novelId || !body.scope || !body.platform || !body.title || !body.summary) {
        throw createHttpError(
          400,
          "PUBLISH_INVALID_REQUEST",
          "projectId, novelId, scope, platform, title, and summary are required",
        );
      }

      return await preparePublishPackage(vaultRoot, {
        projectId: body.projectId,
        novelId: body.novelId,
        chapterId: body.chapterId,
        scope: body.scope,
        platform: body.platform,
        title: body.title,
        summary: body.summary,
        tags: body.tags,
        authorNote: body.authorNote,
        sensitiveWords: body.sensitiveWords,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/backup",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            encrypt?: boolean;
            password?: string;
            label?: string;
          }
        | undefined;

      return await createVaultBackup(vaultRoot, {
        encrypt: body?.encrypt,
        password: body?.password,
        label: body?.label,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/backup/restore",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            backupPath?: string;
            password?: string;
          }
        | undefined;

      if (!body?.backupPath) {
        throw createHttpError(400, "BACKUP_RESTORE_INVALID_REQUEST", "backupPath is required");
      }

      return await restoreVaultBackup(vaultRoot, {
        backupPath: body.backupPath,
        password: body.password,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/diagnostics/export",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await exportDiagnosticsBundle(vaultRoot, context.services.remote.getStatus(), getModelOptions(context));
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/worldbook",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        entries: await listWorldbookEntries(vaultRoot, {
          projectId: request.query.get("projectId") ?? "",
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/knowledge/worldbook",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as { projectId?: string } & Record<string, unknown>) ?? {};
      return {
        entry: await createWorldbookEntry(vaultRoot, { projectId: body.projectId ?? "" }, body as never),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/worldbook/:entryId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        entry: await getWorldbookEntry(vaultRoot, { projectId: request.query.get("projectId") ?? "" }, request.params.entryId),
      };
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/knowledge/worldbook/:entryId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as { projectId?: string } & Record<string, unknown>) ?? {};
      return {
        entry: await updateWorldbookEntry(
          vaultRoot,
          { projectId: body.projectId ?? "" },
          request.params.entryId,
          body as never,
        ),
      };
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/knowledge/worldbook/:entryId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await deleteWorldbookEntry(vaultRoot, {
        projectId: request.query.get("projectId") ?? "",
      }, request.params.entryId);
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/characters",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        characters: await listCharacters(vaultRoot, {
          projectId: request.query.get("projectId") ?? "",
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/knowledge/characters",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as { projectId?: string } & Record<string, unknown>) ?? {};
      return {
        character: await createCharacter(vaultRoot, { projectId: body.projectId ?? "" }, body as never),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/characters/:characterId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        character: await getCharacter(vaultRoot, { projectId: request.query.get("projectId") ?? "" }, request.params.characterId),
      };
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/knowledge/characters/:characterId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as { projectId?: string } & Record<string, unknown>) ?? {};
      return {
        character: await updateCharacter(
          vaultRoot,
          { projectId: body.projectId ?? "" },
          request.params.characterId,
          body as never,
        ),
      };
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/knowledge/characters/:characterId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await deleteCharacter(vaultRoot, {
        projectId: request.query.get("projectId") ?? "",
      }, request.params.characterId);
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/relations",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        relations: await listRelations(vaultRoot, {
          projectId: request.query.get("projectId") ?? "",
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/knowledge/relations",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as { projectId?: string } & Record<string, unknown>) ?? {};
      return {
        relation: await createRelation(vaultRoot, { projectId: body.projectId ?? "" }, body as never),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/relations/:relationId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        relation: await getRelation(vaultRoot, { projectId: request.query.get("projectId") ?? "" }, request.params.relationId),
      };
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/knowledge/relations/:relationId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as { projectId?: string } & Record<string, unknown>) ?? {};
      return {
        relation: await updateRelation(
          vaultRoot,
          { projectId: body.projectId ?? "" },
          request.params.relationId,
          body as never,
        ),
      };
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/knowledge/relations/:relationId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await deleteRelation(vaultRoot, {
        projectId: request.query.get("projectId") ?? "",
      }, request.params.relationId);
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/timeline",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        events: await listTimelineEvents(vaultRoot, {
          projectId: request.query.get("projectId") ?? "",
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/knowledge/timeline",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as { projectId?: string } & Record<string, unknown>) ?? {};
      return {
        event: await createTimelineEvent(vaultRoot, { projectId: body.projectId ?? "" }, body as never),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/timeline/:eventId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        event: await getTimelineEvent(vaultRoot, { projectId: request.query.get("projectId") ?? "" }, request.params.eventId),
      };
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/knowledge/timeline/:eventId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as { projectId?: string } & Record<string, unknown>) ?? {};
      return {
        event: await updateTimelineEvent(
          vaultRoot,
          { projectId: body.projectId ?? "" },
          request.params.eventId,
          body as never,
        ),
      };
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/knowledge/timeline/:eventId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await deleteTimelineEvent(vaultRoot, {
        projectId: request.query.get("projectId") ?? "",
      }, request.params.eventId);
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/items",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        items: await listKnowledgeItems(vaultRoot, {
          projectId: request.query.get("projectId") ?? "",
          novelId: request.query.get("novelId") ?? "",
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/knowledge/items",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as { projectId?: string; novelId?: string } & Record<string, unknown>) ?? {};
      return {
        item: await createKnowledgeItem(
          vaultRoot,
          { projectId: body.projectId ?? "", novelId: body.novelId ?? "" },
          body as never,
        ),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/items/:itemId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        item: await getKnowledgeItem(vaultRoot, {
          projectId: request.query.get("projectId") ?? "",
          novelId: request.query.get("novelId") ?? "",
        }, request.params.itemId),
      };
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/knowledge/items/:itemId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as { projectId?: string; novelId?: string } & Record<string, unknown>) ?? {};
      return {
        item: await updateKnowledgeItem(
          vaultRoot,
          { projectId: body.projectId ?? "", novelId: body.novelId ?? "" },
          request.params.itemId,
          body as never,
        ),
      };
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/knowledge/items/:itemId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await deleteKnowledgeItem(vaultRoot, {
        projectId: request.query.get("projectId") ?? "",
        novelId: request.query.get("novelId") ?? "",
      }, request.params.itemId);
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/graph",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await buildKnowledgeGraph(vaultRoot, {
        projectId: request.query.get("projectId") ?? "",
        novelId: request.query.get("novelId") ?? "",
      });
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/replay",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const projectId = request.query.get("projectId") ?? "";
      const novelId = request.query.get("novelId") ?? "";
      if (!projectId || !novelId) {
        throw createHttpError(400, "KNOWLEDGE_REPLAY_INVALID", "projectId and novelId are required");
      }
      return await buildRelationReplay(vaultRoot, { projectId, novelId });
    },
  },
  {
    method: "GET",
    path: "/api/v1/models",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        models: await listModels(vaultRoot, getModelOptions(context)),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/runs",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const projectId = request.query.get("projectId") ?? undefined;
      const novelId = request.query.get("novelId") ?? undefined;

      if (!projectId || !novelId) {
        throw createHttpError(400, "WORKFLOW_INVALID_RUN_QUERY", "projectId and novelId are required");
      }

      return {
        runs: await listWorkflowRuns(vaultRoot, {
          projectId,
          novelId,
          chapterId: request.query.get("chapterId") ?? undefined,
          limit: request.query.get("limit") ? Number(request.query.get("limit")) : undefined,
        }),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/runs/:runId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const projectId = request.query.get("projectId") ?? undefined;
      const novelId = request.query.get("novelId") ?? undefined;

      if (!projectId || !novelId) {
        throw createHttpError(400, "WORKFLOW_INVALID_RUN_QUERY", "projectId and novelId are required");
      }

      return {
        run: await getWorkflowRun(vaultRoot, {
          projectId,
          novelId,
          runId: request.params.runId,
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/runs/:runId/cancel",
    async handler(request, context) {
      void request;
      return await cancelWorkflowRun(context.state.workflowRuns, request.params.runId);
    },
  },
  {
    method: "POST",
    path: "/api/v1/models",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        model: await createModel(
          vaultRoot,
          (request.body as Record<string, unknown> | undefined) ?? {},
          getModelOptions(context),
        ),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/models/:modelId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        model: await getModel(vaultRoot, request.params.modelId, getModelOptions(context)),
      };
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/models/:modelId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        model: await updateModel(
          vaultRoot,
          request.params.modelId,
          (request.body as Record<string, unknown> | undefined) ?? {},
          getModelOptions(context),
        ),
      };
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/models/:modelId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await deleteModel(vaultRoot, request.params.modelId, getModelOptions(context));
    },
  },
  {
    method: "POST",
    path: "/api/v1/models/:modelId/key",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { apiKey?: string } | undefined;
      return await storeModelApiKey(
        vaultRoot,
        request.params.modelId,
        body?.apiKey ?? "",
        getModelOptions(context),
      );
    },
  },
  {
    method: "POST",
    path: "/api/v1/models/:modelId/test",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      void request;
      return await testModelConnection(vaultRoot, request.params.modelId, getModelOptions(context));
    },
  },
  {
    method: "GET",
    path: "/api/v1/projects",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        projects: await listProjects(vaultRoot),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/projects",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { title?: unknown } | undefined;
      return await createProject(vaultRoot, {
        title: body?.title as never,
      });
    },
  },
  {
    method: "GET",
    path: "/api/v1/projects/:projectId/novels",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        novels: await listNovels(vaultRoot, request.params.projectId),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/projects/:projectId/novels",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { title?: unknown } | undefined;
      return await createNovel(vaultRoot, {
        projectId: request.params.projectId,
        title: body?.title as never,
      });
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/projects/:projectId/novels/:novelId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { title?: unknown } | undefined;
      return await renameNovel(vaultRoot, {
        projectId: request.params.projectId,
        novelId: request.params.novelId,
        title: body?.title as never,
      });
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/projects/:projectId/novels/:novelId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await deleteNovel(vaultRoot, {
        projectId: request.params.projectId,
        novelId: request.params.novelId,
      });
    },
  },
  {
    method: "GET",
    path: "/api/v1/projects/:projectId/novels/:novelId/chapters",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        chapters: await listChapters(vaultRoot, request.params.projectId, request.params.novelId),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/projects/:projectId/novels/:novelId/chapters",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { title?: unknown } | undefined;
      return await createChapter(vaultRoot, {
        projectId: request.params.projectId,
        novelId: request.params.novelId,
        title: body?.title as never,
      });
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/projects/:projectId/novels/:novelId/chapters/:chapterId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { title?: unknown; status?: unknown } | undefined;
      return await renameChapter(vaultRoot, {
        projectId: request.params.projectId,
        novelId: request.params.novelId,
        chapterId: request.params.chapterId,
        title: body?.title as never,
        status: body?.status as never,
      });
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/projects/:projectId/novels/:novelId/chapters/:chapterId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await deleteChapter(vaultRoot, {
        projectId: request.params.projectId,
        novelId: request.params.novelId,
        chapterId: request.params.chapterId,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/projects/:projectId/novels/:novelId/chapters/:chapterId/move",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { targetNovelId?: string } | undefined;
      return await moveChapter(vaultRoot, {
        projectId: request.params.projectId,
        novelId: request.params.novelId,
        chapterId: request.params.chapterId,
        targetNovelId: body?.targetNovelId as never,
      });
    },
  },
  {
    method: "GET",
    path: "/api/v1/editor/chapters/:chapterId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const projectId = request.query.get("projectId") ?? undefined;
      const novelId = request.query.get("novelId") ?? undefined;

      if (!projectId || !novelId) {
        throw createHttpError(
          400,
          "EDITOR_INVALID_CHAPTER_QUERY",
          "projectId and novelId are required",
        );
      }

      return loadEditorChapter(vaultRoot, {
        projectId,
        novelId,
        chapterId: request.params.chapterId,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/chapters/:chapterId/run",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            projectId?: string;
            novelId?: string;
            workflowId?: string;
            fallbackModelId?: string;
            maxRepairRounds?: number;
            maxJsonRetries?: number;
            wait?: boolean;
          }
        | undefined;

      if (!body?.projectId || !body.novelId) {
        throw createHttpError(400, "WORKFLOW_INVALID_RUN_REQUEST", "projectId and novelId are required");
      }

      const pendingRun = await startWorkflowRun(
        vaultRoot,
        context.state.workflowRuns,
        {
          credentialService: context.services.credentialService,
          fetchImpl: context.services.fetchImpl,
          endpoints: context.services.providerEndpoints,
        },
        {
          projectId: body.projectId,
          novelId: body.novelId,
          chapterId: request.params.chapterId,
          workflowId: body.workflowId,
          fallbackModelId: body.fallbackModelId,
          maxRepairRounds: body.maxRepairRounds,
          maxJsonRetries: body.maxJsonRetries,
        },
      );

      if (!body.wait) {
        return {
          runId: pendingRun.id,
          run: pendingRun,
        };
      }

      return {
        runId: pendingRun.id,
        run: await waitForWorkflowRun(vaultRoot, {
          projectId: body.projectId,
          novelId: body.novelId,
          runId: pendingRun.id,
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/editor/chapters/:chapterId/save",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            projectId?: string;
            novelId?: string;
            content?: string;
          }
        | undefined;

      return saveEditorChapter(vaultRoot, {
        projectId: body?.projectId ?? "",
        novelId: body?.novelId ?? "",
        chapterId: request.params.chapterId,
        content: body?.content ?? "",
      });
    },
  },
  {
    method: "PUT",
    path: "/api/v1/editor/chapters/:chapterId/annotations",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            projectId?: string;
            novelId?: string;
            annotations?: unknown[];
          }
        | undefined;

      return {
        annotations: await saveEditorAnnotations(vaultRoot, {
          projectId: body?.projectId ?? "",
          novelId: body?.novelId ?? "",
          chapterId: request.params.chapterId,
          annotations: body?.annotations as never[] ?? [],
        }),
      };
    },
  },
  {
    method: "PUT",
    path: "/api/v1/editor/chapters/:chapterId/locks",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            projectId?: string;
            novelId?: string;
            locks?: unknown[];
          }
        | undefined;

      return {
        locks: await saveEditorLocks(vaultRoot, {
          projectId: body?.projectId ?? "",
          novelId: body?.novelId ?? "",
          chapterId: request.params.chapterId,
          locks: body?.locks as never[] ?? [],
        }),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/version/chapters/:chapterId/timeline",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const projectId = request.query.get("projectId") ?? undefined;
      const novelId = request.query.get("novelId") ?? undefined;

      if (!projectId || !novelId) {
        throw createHttpError(
          400,
          "VERSION_INVALID_CHAPTER_QUERY",
          "projectId and novelId are required",
        );
      }

      return listChapterTimeline(vaultRoot, {
        projectId,
        novelId,
        chapterId: request.params.chapterId,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/version/chapters/:chapterId/finalize",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            projectId?: string;
            novelId?: string;
            actor?: string;
          }
        | undefined;

      return finalizeChapter(vaultRoot, {
        projectId: body?.projectId ?? "",
        novelId: body?.novelId ?? "",
        chapterId: request.params.chapterId,
        actor: body?.actor,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/version/chapters/:chapterId/unlock",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            projectId?: string;
            novelId?: string;
            actor?: string;
          }
        | undefined;

      return {
        metadata: await unlockFinalizedChapter(vaultRoot, {
          projectId: body?.projectId ?? "",
          novelId: body?.novelId ?? "",
          chapterId: request.params.chapterId,
          actor: body?.actor,
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/version/chapters/:chapterId/rollback",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            projectId?: string;
            novelId?: string;
            snapshotPath?: string;
            range?: { start: number; end: number };
          }
        | undefined;

      if (!body?.snapshotPath) {
        throw createHttpError(
          400,
          "VERSION_INVALID_ROLLBACK_REQUEST",
          "snapshotPath is required",
        );
      }

      return rollbackChapterFromSnapshot(vaultRoot, {
        projectId: body.projectId ?? "",
        novelId: body.novelId ?? "",
        chapterId: request.params.chapterId,
        snapshotPath: body.snapshotPath,
        range: body.range,
      });
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/rules",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        rules: await listRules(vaultRoot, {
          projectId: request.query.get("projectId") ?? "",
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/knowledge/rules",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as { projectId?: string } & Record<string, unknown>) ?? {};
      return {
        rule: await createRule(vaultRoot, { projectId: body.projectId ?? "" }, body as never),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/knowledge/rules/:ruleId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        rule: await getRule(vaultRoot, { projectId: request.query.get("projectId") ?? "" }, request.params.ruleId),
      };
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/knowledge/rules/:ruleId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as { projectId?: string } & Record<string, unknown>) ?? {};
      return {
        rule: await updateRule(
          vaultRoot,
          { projectId: body.projectId ?? "" },
          request.params.ruleId,
          body as never,
        ),
      };
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/knowledge/rules/:ruleId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await deleteRule(vaultRoot, {
        projectId: request.query.get("projectId") ?? "",
      }, request.params.ruleId);
    },
  },
  {
    method: "POST",
    path: "/api/v1/rules/conflicts/scan",
    async handler(request) {
      const body = request.body as { rules?: Rule[] } | undefined;
      return scanRuleConflicts(body?.rules ?? []);
    },
  },
  {
    method: "GET",
    path: "/api/v1/skills",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        skills: await listSkills(vaultRoot),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/skills/execute",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { skillId?: string; args?: Record<string, unknown>; dryRun?: boolean } | undefined;
      return {
        result: await executeSkill(vaultRoot, {
          skillId: body?.skillId,
          args: body?.args,
          dryRun: body?.dryRun,
        }),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/skills/market",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        market: await listSkillMarket(vaultRoot, {
          q: request.query.get("q") ?? undefined,
          category: request.query.get("category") ?? undefined,
          author: request.query.get("author") ?? undefined,
          status: request.query.get("status") ?? undefined,
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/skills/market",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            skillId?: string;
            name?: string;
            author?: string;
            summary?: string;
            categories?: string[];
            tags?: string[];
            certifiedAuthor?: boolean;
          }
        | undefined;
      if (!body?.skillId || !body.name || !body.author || !body.summary) {
        throw createHttpError(400, "SKILL_MARKET_INVALID", "skillId, name, author, and summary are required");
      }
      return {
        entry: await publishSkillMarketEntry(vaultRoot, {
          skillId: body.skillId,
          name: body.name,
          author: body.author,
          summary: body.summary,
          categories: body.categories ?? [],
          tags: body.tags ?? [],
          certifiedAuthor: body.certifiedAuthor,
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/skills/market/:entryId/rate",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { rater?: string; score?: number; comment?: string } | undefined;
      if (!body?.rater || typeof body.score !== "number") {
        throw createHttpError(400, "SKILL_MARKET_RATE_INVALID", "rater and numeric score are required");
      }
      return {
        entry: await rateSkillMarketEntry(vaultRoot, {
          marketEntryId: request.params.entryId,
          rater: body.rater,
          score: body.score,
          comment: body.comment,
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/skills/market/:entryId/report",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { reporter?: string; reason?: string } | undefined;
      if (!body?.reporter || !body.reason) {
        throw createHttpError(400, "SKILL_MARKET_REPORT_INVALID", "reporter and reason are required");
      }
      return {
        entry: await reportSkillMarketEntry(vaultRoot, {
          marketEntryId: request.params.entryId,
          reporter: body.reporter,
          reason: body.reason,
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/skills/market/:entryId/moderate",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { status?: "listed" | "hidden" | "removed"; certifiedAuthor?: boolean } | undefined;
      if (!body?.status) {
        throw createHttpError(400, "SKILL_MARKET_MODERATE_INVALID", "status is required");
      }
      return {
        entry: await moderateSkillMarketEntry(vaultRoot, {
          marketEntryId: request.params.entryId,
          status: body.status,
          certifiedAuthor: body.certifiedAuthor,
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/skills/import",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { manifest?: unknown; source?: string } | undefined;
      return {
        skill: await importSkill(vaultRoot, {
          manifest: body?.manifest,
          source: body?.source,
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/skills/import/github",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { url?: string } | undefined;
      return {
        skill: await importSkillFromGitHub(vaultRoot, {
          url: body?.url,
          fetchImpl: context.services.fetchImpl,
        }),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/plugins",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        plugins: await listPlugins(vaultRoot),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/themes/community",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        themes: await listThemeCommunity(vaultRoot),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/themes/community",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | { id?: string; name?: string; author?: string; description?: string; tokensCssPath?: string }
        | undefined;
      if (!body?.id || !body.name || !body.author || !body.description || !body.tokensCssPath) {
        throw createHttpError(400, "THEME_COMMUNITY_INVALID", "id, name, author, description, tokensCssPath are required");
      }
      return {
        theme: await publishThemeCommunityEntry(vaultRoot, {
          id: body.id,
          name: body.name,
          author: body.author,
          description: body.description,
          tokensCssPath: body.tokensCssPath,
        }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/plugins",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        plugin: await registerPlugin(vaultRoot, request.body),
      };
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/plugins/:pluginId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { enabled?: boolean } | undefined;
      if (typeof body?.enabled !== "boolean") {
        throw createHttpError(400, "PLUGIN_UPDATE_INVALID", "enabled is required");
      }
      return {
        plugin: await updatePluginState(vaultRoot, request.params.pluginId, { enabled: body.enabled }),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/plugins/:pluginId/hooks/:hookId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        result: await invokePluginHook(vaultRoot, request.params.pluginId, request.params.hookId),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/collaboration/sessions",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      return {
        sessions: await listCollaborationSessions(vaultRoot),
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/collaboration/sessions",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as Record<string, unknown> | undefined) ?? {};
      return {
        session: await createCollaborationSession(vaultRoot, body as never),
      };
    },
  },
  {
    method: "PATCH",
    path: "/api/v1/collaboration/sessions/:sessionId",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = (request.body as Record<string, unknown> | undefined) ?? {};
      return {
        session: await updateCollaborationSession(vaultRoot, request.params.sessionId, body as never),
      };
    },
  },
  {
    method: "GET",
    path: "/api/v1/app/update/status",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      return await getUpdateStatus(vaultRoot);
    },
  },
  {
    method: "POST",
    path: "/api/v1/app/update/check",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | { currentVersion?: string; targetVersion?: string; releaseNotes?: string }
        | undefined;
      if (!body?.targetVersion) {
        throw createHttpError(400, "APP_UPDATE_INVALID", "targetVersion is required");
      }
      return await checkForAppUpdate(vaultRoot, {
        currentVersion: body.currentVersion,
        targetVersion: body.targetVersion,
        releaseNotes: body.releaseNotes,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/app/update/download",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as
        | {
            currentVersion?: string;
            targetVersion?: string;
            artifactName?: string;
            downloadUrl?: string;
          }
        | undefined;
      if (!body?.targetVersion || !body.artifactName) {
        throw createHttpError(400, "APP_UPDATE_INVALID", "targetVersion and artifactName are required");
      }
      return await downloadAppUpdate(vaultRoot, {
        currentVersion: body.currentVersion,
        targetVersion: body.targetVersion,
        artifactName: body.artifactName,
        downloadUrl: body.downloadUrl,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/app/update/prepare",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { currentVersion?: string; targetVersion?: string } | undefined;
      if (!body?.targetVersion) {
        throw createHttpError(400, "APP_UPDATE_INVALID", "targetVersion is required");
      }
      return await prepareAutomaticUpdate(vaultRoot, {
        currentVersion: body.currentVersion,
        targetVersion: body.targetVersion,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/app/update/apply",
    async handler(request, context) {
      const vaultRoot = requireVaultRoot(context);
      const body = request.body as { currentVersion?: string; targetVersion?: string } | undefined;
      if (!body?.targetVersion) {
        throw createHttpError(400, "APP_UPDATE_INVALID", "targetVersion is required");
      }
      try {
        return await applyDownloadedUpdate(vaultRoot, {
          currentVersion: body.currentVersion,
          targetVersion: body.targetVersion,
        });
      } catch (error) {
        throw createHttpError(409, "APP_UPDATE_APPLY_FAILED", error instanceof Error ? error.message : "apply failed");
      }
    },
  },
  {
    method: "POST",
    path: "/api/v1/app/update/rollback",
    async handler(_request, context) {
      const vaultRoot = requireVaultRoot(context);
      try {
        return await rollbackAppliedUpdate(vaultRoot);
      } catch (error) {
        throw createHttpError(409, "APP_UPDATE_ROLLBACK_FAILED", error instanceof Error ? error.message : "rollback failed");
      }
    },
  },
];
