import { useState } from "react";
import { FolderOpen } from "lucide-react";

interface VaultPickerModalProps {
  onSelectVault: (path: string) => Promise<void>;
}

export function VaultPickerModal({ onSelectVault }: VaultPickerModalProps) {
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const nextPath = path.trim();
    if (!nextPath) {
      setError("请输入资料库目录绝对路径");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSelectVault(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "选择资料库失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="vault-modal-backdrop" role="presentation">
      <section className="vault-modal" role="dialog" aria-modal="true" aria-labelledby="vault-picker-title">
        <div className="vault-modal-mark">
          <FolderOpen size={22} strokeWidth={1.75} />
        </div>
        <h2 id="vault-picker-title">选择资料库</h2>
        <p>请选择书灵阁用于保存项目、正文、批注与规则的本地资料库目录。选择后可在设置页更换。</p>
        <label className="form-block">
          <span>资料库目录</span>
          <input
            className="input"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder={"输入资料库目录绝对路径，例如 C:\\书灵阁资料库"}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void submit();
              }
            }}
          />
        </label>
        {error ? <div className="err-card">{error}</div> : null}
        <div className="vault-modal-actions">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void submit()}>
            {saving ? "选用中..." : "选用"}
          </button>
        </div>
      </section>
    </div>
  );
}
