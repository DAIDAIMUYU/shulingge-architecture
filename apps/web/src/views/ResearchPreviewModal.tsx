import { useMemo, useState } from "react";
import { ExternalLink, X } from "lucide-react";

export interface ResearchPreviewField {
  key: string;
  label: string;
  group?: string;
}

export interface ResearchPreviewSource {
  title: string;
  url: string;
  sourceName?: string;
}

interface ResearchPreviewModalProps {
  title?: string;
  source: ResearchPreviewSource;
  fields: ResearchPreviewField[];
  generated: Record<string, string>;
  existingValues: Record<string, string>;
  onApply(selected: Record<string, string>): void;
  onCancel(): void;
}

export function ResearchPreviewModal({
  title = "查询结果预览",
  source,
  fields,
  generated,
  existingValues,
  onApply,
  onCancel,
}: ResearchPreviewModalProps) {
  const rows = useMemo(() => fields
    .map((field) => {
      const suggested = (generated[field.key] ?? generated[field.label])?.trim() ?? "";
      const existing = existingValues[field.key]?.trim() ?? "";
      return {
        ...field,
        suggested,
        existing,
        willOverwrite: Boolean(existing),
      };
    })
    .filter((row) => row.suggested), [existingValues, fields, generated]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(rows.filter((row) => !row.willOverwrite).map((row) => row.key)),
  );

  const selectedCount = rows.filter((row) => selectedKeys.has(row.key)).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  const toggleKey = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const applySelected = () => {
    const selected: Record<string, string> = {};
    for (const row of rows) {
      if (selectedKeys.has(row.key)) {
        selected[row.key] = row.suggested;
        selected[row.label] = row.suggested;
      }
    }
    onApply(selected);
  };

  return (
    <div className="vault-modal-backdrop character-modal-backdrop" onMouseDown={onCancel}>
      <div className="vault-modal research-preview-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-modal-head compact">
          <div>
            <h2>{title}</h2>
            <p>
              资料来自：{source.sourceName ? `${source.sourceName} · ` : ""}
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
                <ExternalLink size={13} />
              </a>
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="research-preview-body">
          {rows.length === 0 ? (
            <div className="empty">没有可采纳的字段。</div>
          ) : rows.map((row) => {
            const checked = selectedKeys.has(row.key);
            return (
              <label className={`research-preview-row${row.willOverwrite ? " overwrite" : ""}`} key={row.key}>
                <input type="checkbox" checked={checked} onChange={() => toggleKey(row.key)} />
                <div className="research-preview-content">
                  <div className="research-preview-title">
                    <strong>{row.label}</strong>
                    {row.group ? <span>{row.group}</span> : null}
                    {row.willOverwrite ? <em>会覆盖已填内容</em> : <em className="safe">空字段，默认采纳</em>}
                  </div>
                  {row.existing ? (
                    <div className="research-preview-existing">
                      <span>当前已填</span>
                      <p>{row.existing}</p>
                    </div>
                  ) : null}
                  <div className="research-preview-suggested">
                    <span>AI 建议</span>
                    <p>{row.suggested}</p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="vault-modal-actions">
          <button
            type="button"
            className="btn"
            onClick={() => setSelectedKeys(allSelected ? new Set() : new Set(rows.map((row) => row.key)))}
            disabled={rows.length === 0}
          >
            {allSelected ? "取消全选" : "全选"}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={applySelected} disabled={selectedCount === 0}>
            采纳选中项 {selectedCount > 0 ? `(${selectedCount})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
