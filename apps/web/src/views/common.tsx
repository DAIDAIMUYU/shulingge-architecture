import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Inbox, Info, Loader2, type LucideIcon } from "lucide-react";

import { api, ApiError } from "../api/client.js";

export type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type ToastListener = (items: ToastItem[]) => void;

let toastId = 0;
let toastItems: ToastItem[] = [];
const toastListeners = new Set<ToastListener>();

function emitToasts() {
  for (const listener of toastListeners) {
    listener(toastItems);
  }
}

export function showToast(message: string, kind: ToastKind = "info") {
  const next: ToastItem = { id: ++toastId, kind, message };
  toastItems = [...toastItems, next].slice(-4);
  emitToasts();

  globalThis.setTimeout(() => {
    toastItems = toastItems.filter((item) => item.id !== next.id);
    emitToasts();
  }, kind === "error" ? 4600 : 3200);
}

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>(toastItems);

  useEffect(() => {
    toastListeners.add(setItems);
    return () => {
      toastListeners.delete(setItems);
    };
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {items.map((item) => {
        const Icon = item.kind === "success" ? CheckCircle2 : item.kind === "error" ? AlertCircle : Info;
        return (
          <div className={`toast toast-${item.kind}`} key={item.id}>
            <Icon size={17} strokeWidth={1.9} />
            <span>{item.message}</span>
          </div>
        );
      })}
    </div>
  );
}

// 通用列表加载：先确认 Vault 已选，再拉数据；返回 loading/error/vaultMissing 三态。
export function useApiList<T>(loader: () => Promise<T[]>): {
  data: T[];
  loading: boolean;
  error: string | null;
  vaultMissing: boolean;
} {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaultMissing, setVaultMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const h = await api.health();
        if (!h.vaultSelected) {
          if (alive) {
            setVaultMissing(true);
            setLoading(false);
          }
          return;
        }
        const d = await loader();
        if (alive) {
          setData(d);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (alive) {
          setError(e instanceof ApiError ? e.message : "加载失败");
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { data, loading, error, vaultMissing };
}

export function ViewShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">{title}</h1>
          {subtitle && <p className="view-sub">{subtitle}</p>}
        </div>
        {actions && <div className="view-actions">{actions}</div>}
      </div>
      <div className="view-body">{children}</div>
    </div>
  );
}

export function CenterState({
  loading,
  error,
  vaultMissing,
  empty,
  emptyText,
  emptyTitle,
  emptyActionLabel,
  onEmptyAction,
}: {
  loading: boolean;
  error: string | null;
  vaultMissing: boolean;
  empty?: boolean;
  emptyText?: string;
  emptyTitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}) {
  if (loading) {
    return <LoadingState />;
  }
  if (vaultMissing) {
    return (
      <EmptyState
        icon={Inbox}
        title="尚未选择资料库"
        description="先选择本地资料库，书灵阁才能读取项目、角色和写作资料。"
      />
    );
  }
  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        tone="error"
        title="加载失败"
        description={error}
      />
    );
  }
  if (empty) {
    return (
      <EmptyState
        title={emptyTitle ?? "这里还没有内容"}
        description={emptyText ?? "先创建第一条内容，后续就会在这里汇总展示。"}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }
  return null;
}

export function LoadingState({ text = "正在整理内容…" }: { text?: string }) {
  return (
    <div className="center-state loading-state">
      <div className="loading-card" aria-label={text}>
        <div className="loading-head">
          <Loader2 size={18} className="spin-icon" />
          <span>{text}</span>
        </div>
        <div className="skeleton-stack" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  tone = "default",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "default" | "error";
}) {
  return (
    <div className={`center-state empty-state ${tone === "error" ? "error" : ""}`}>
      <div className="empty-state-mark">
        <Icon size={32} strokeWidth={1.7} className="empty-icon" />
      </div>
      <div className="empty-state-copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <button type="button" className="btn btn-primary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function useTriState(loading: boolean, error: string | null, vaultMissing: boolean, count: number) {
  return loading || error !== null || vaultMissing || count === 0;
}
