import { useState } from "react";
import {
  BookOpenText,
  CheckCircle2,
  Feather,
  FolderOpen,
  FolderPlus,
  LibraryBig,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";

interface WelcomeGuideProps {
  initialVaultPath?: string | null;
  onSetVault: (path: string) => Promise<void>;
  onCreateProject: () => void;
  onFinish: () => void;
}

const flow = [
  { icon: FolderPlus, title: "建项目", text: "先开一本书" },
  { icon: LibraryBig, title: "填设定", text: "角色、世界观、大纲" },
  { icon: Sparkles, title: "AI 协作", text: "围绕你的设定写" },
  { icon: Wand2, title: "质检润色", text: "查矛盾、打磨文字" },
  { icon: CheckCircle2, title: "定稿", text: "沉淀成稿件" },
];

const strengths = [
  { icon: ShieldCheck, text: "数据本地自主：不上云、不订阅、隐私由你掌管" },
  { icon: BookOpenText, text: "AI 真读你的设定：基于角色、世界观和大纲创作" },
  { icon: Feather, text: "为认真写作者打造：规则、质检和设定驱动流程" },
];

export function WelcomeGuide({ initialVaultPath, onSetVault, onCreateProject, onFinish }: WelcomeGuideProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [vaultDraft, setVaultDraft] = useState(initialVaultPath ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickFolder = async (): Promise<string | null> => {
    setError("桌面版支持点击选择文件夹，网页版请手动填写文件夹完整路径。");
    return null;
  };

  const handlePickFolder = async () => {
    const picked = await pickFolder();
    if (picked) {
      setVaultDraft(picked);
      setError(null);
    }
  };

  const submitVault = async () => {
    const nextPath = vaultDraft.trim();
    if (!nextPath) {
      setError("请填写资料库文件夹的完整路径");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSetVault(nextPath);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "资料库位置保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="welcome-guide" role="dialog" aria-modal="true" aria-labelledby="welcome-guide-title">
      <section className="welcome-guide-card">
        <div className="welcome-guide-top">
          <div className="welcome-step-indicator" aria-label={`第 ${step} 步，共 3 步`}>
            {[1, 2, 3].map((item) => (
              <span key={item} className={step === item ? "on" : ""}>{item}</span>
            ))}
          </div>
          <span className="welcome-step-text">{step}/3</span>
        </div>

        {step === 1 ? (
          <div className="welcome-guide-body">
            <div className="welcome-guide-hero">
              <h1 id="welcome-guide-title">书灵阁</h1>
              <p>设定驱动的 AI 小说创作工具。</p>
            </div>

            <div className="welcome-guide-flow" aria-label="创作流程">
              {flow.map((item) => {
                const Icon = item.icon;
                return (
                  <div className="welcome-guide-step" key={item.title}>
                    <Icon size={18} strokeWidth={1.8} />
                    <strong>{item.title}</strong>
                    <span>{item.text}</span>
                  </div>
                );
              })}
            </div>

            <div className="welcome-guide-strengths">
              {strengths.map((item) => {
                const Icon = item.icon;
                return (
                  <div className="welcome-guide-strength" key={item.text}>
                    <Icon size={16} strokeWidth={1.9} />
                    <span>{item.text}</span>
                  </div>
                );
              })}
            </div>

            <div className="welcome-guide-actions">
              <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
                开始使用
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="welcome-guide-body">
            <div className="welcome-guide-copy">
              <h1>先选个地方存放你的创作</h1>
              <p>
                书灵阁会把你的小说正文、角色、世界观、大纲等所有创作内容，保存在你电脑的一个文件夹里。
                请填写一个文件夹的完整路径，例如 D:\我的小说。数据完全保存在你本地，由你自己掌管，以后也可以在设置里更换。
              </p>
            </div>

            <label className="form-block welcome-vault-field">
              <span>资料库文件夹路径</span>
              <div className="welcome-vault-input-row">
                <input
                  className="input"
                  value={vaultDraft}
                  placeholder="D:\\我的小说"
                  onChange={(event) => setVaultDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void submitVault();
                    }
                  }}
                />
                <button type="button" className="btn" disabled={saving} onClick={() => void handlePickFolder()}>
                  <FolderOpen size={15} strokeWidth={2} />
                  选择文件夹
                </button>
              </div>
              <small className="welcome-vault-hint">桌面版可直接点击选择文件夹；网页版请填写文件夹完整路径。</small>
            </label>
            {error ? <div className="err-card welcome-guide-error">{error}</div> : null}

            <div className="welcome-guide-actions">
              <button type="button" className="btn" disabled={saving} onClick={() => setStep(1)}>
                上一步
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void submitVault()}>
                {saving ? "保存中..." : "确认并继续"}
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="welcome-guide-body">
            <div className="welcome-guide-copy">
              <h1>准备好了，开始你的第一个故事</h1>
              <p>现在可以创建第一个项目，把正文、设定、规则和大纲都放进同一个创作空间里。</p>
            </div>
            <div className="welcome-ready-card">
              <FolderPlus size={24} strokeWidth={1.8} />
              <div>
                <strong>项目就是一本书或一个系列</strong>
                <span>创建后会自动进入写作工作台。</span>
              </div>
            </div>
            <div className="welcome-guide-actions">
              <button type="button" className="btn" onClick={() => setStep(2)}>
                上一步
              </button>
              <button type="button" className="btn btn-primary" onClick={onCreateProject}>
                创建第一个项目
              </button>
              <button type="button" className="btn" onClick={onFinish}>
                先进去看看
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
