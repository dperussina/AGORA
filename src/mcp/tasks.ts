import { randomBytes } from "node:crypto";

export type TaskStatus = "working" | "completed" | "failed" | "cancelled";

export interface McpTaskRecord {
  taskId: string;
  identityId: string;
  status: TaskStatus;
  statusMessage: string;
  createdAt: string;
  lastUpdatedAt: string;
  ttl: number;
  pollInterval: number;
  resolvesAtTick: number;
  result?: Record<string, unknown>;
}

export class TaskStore {
  private readonly tasks = new Map<string, McpTaskRecord>();

  create(identityId: string, resolvesAtTick: number, statusMessage: string, pollInterval = 2000): McpTaskRecord {
    const taskId = `task_${randomBytes(12).toString("hex")}`;
    const now = new Date().toISOString();
    const record: McpTaskRecord = {
      taskId,
      identityId,
      status: "working",
      statusMessage,
      createdAt: now,
      lastUpdatedAt: now,
      ttl: 300_000,
      pollInterval,
      resolvesAtTick,
    };
    this.tasks.set(taskId, record);
    return record;
  }

  get(taskId: string): McpTaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  listFor(identityId?: string): McpTaskRecord[] {
    return [...this.tasks.values()]
      .filter((t) => identityId === undefined || t.identityId === identityId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 50);
  }

  cancel(taskId: string, identityId: string): McpTaskRecord | null {
    const task = this.tasks.get(taskId);
    if (task === undefined || task.identityId !== identityId) {
      return null;
    }
    if (task.status === "working") {
      task.status = "cancelled";
      task.statusMessage = "Cancelled by caller";
      task.lastUpdatedAt = new Date().toISOString();
    }
    return task;
  }

  resolveUpToTick(tick: number, summaryBuilder: (task: McpTaskRecord) => Record<string, unknown>): void {
    const now = new Date().toISOString();
    for (const task of this.tasks.values()) {
      if (task.status === "working" && task.resolvesAtTick <= tick) {
        task.status = "completed";
        task.statusMessage = `Resolved at tick ${tick}`;
        task.lastUpdatedAt = now;
        task.result = summaryBuilder(task);
      }
    }
  }
}

export function publicTaskView(task: McpTaskRecord): Record<string, unknown> {
  return {
    taskId: task.taskId,
    status: task.status,
    statusMessage: task.statusMessage,
    createdAt: task.createdAt,
    lastUpdatedAt: task.lastUpdatedAt,
    ttl: task.ttl,
    pollInterval: task.pollInterval,
  };
}
