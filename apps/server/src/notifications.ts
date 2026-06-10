import { buildHealthReport } from "./doctor.js";
import type { RemoteGatewayStatus } from "./types.js";
import { listWorkflowRuns } from "./workflows.js";

export interface ServerNotification {
  id: string;
  level: "info" | "warn";
  title: string;
  message: string;
  source: "health" | "workflow";
}

export async function listServerNotifications(
  vaultRoot: string,
  remote: RemoteGatewayStatus,
  scope?: { projectId?: string; novelId?: string; chapterId?: string },
): Promise<ServerNotification[]> {
  const health = await buildHealthReport(vaultRoot, remote);
  const notifications: ServerNotification[] = health.reminders.map((item) => ({
    ...item,
    source: "health",
  }));

  if (scope?.projectId && scope?.novelId) {
    const runs = await listWorkflowRuns(vaultRoot, {
      projectId: scope.projectId,
      novelId: scope.novelId,
      chapterId: scope.chapterId,
      limit: 5,
    });

    for (const run of runs.slice(0, 3)) {
      if (run.status === "failed" || run.status === "paused") {
        notifications.push({
          id: `workflow-${run.id}`,
          level: "warn",
          title: "运行需要处理",
          message: `${run.id} 当前状态为 ${run.status}，建议查看节点输出并决定是否重跑或回滚。`,
          source: "workflow",
        });
      } else if (run.status === "ok") {
        notifications.push({
          id: `workflow-${run.id}`,
          level: "info",
          title: "最近运行完成",
          message: `${run.id} 已完成，共执行 ${run.nodes.length} 个节点。`,
          source: "workflow",
        });
      }
    }
  }

  return notifications;
}
