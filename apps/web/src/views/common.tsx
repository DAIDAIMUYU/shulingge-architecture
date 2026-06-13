import { useEffect, useState, type ReactNode } from "react";
import { Inbox } from "lucide-react";

import { api, ApiError } from "../api/client.js";

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
}: {
  loading: boolean;
  error: string | null;
  vaultMissing: boolean;
  empty?: boolean;
  emptyText?: string;
}) {
  if (loading) {
    return (
      <div className="center-state">
        <div className="spinner" />
        <span>加载中…</span>
      </div>
    );
  }
  if (vaultMissing) {
    return (
      <div className="center-state">
        <Inbox size={32} className="empty-icon" />
        <div>尚未选择资料库</div>
        <div className="faint">在「写作」页顶部选择本地资料库后即可查看数据</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="center-state">
        <span style={{ color: "var(--danger)" }}>加载失败：{error}</span>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="center-state">
        <Inbox size={32} className="empty-icon" />
        <div>{emptyText ?? "暂无数据"}</div>
      </div>
    );
  }
  return null;
}

export function useTriState(loading: boolean, error: string | null, vaultMissing: boolean, count: number) {
  return loading || error !== null || vaultMissing || count === 0;
}
