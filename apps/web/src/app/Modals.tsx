import { useEffect, useRef, useState, type FormEvent } from "react";

export interface InputModalProps {
  title: string;
  placeholder?: string;
  defaultValue: string;
  confirmText?: string;
  onConfirm(value: string): void | Promise<void>;
  onCancel(): void;
}

export interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm(): void | Promise<void>;
  onCancel(): void;
}

export function InputModal({
  title,
  placeholder,
  defaultValue,
  confirmText = "确定",
  onConfirm,
  onCancel,
}: InputModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const node = inputRef.current;
    node?.focus();
    node?.select();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const nextValue = value.trim() || defaultValue.trim();
    if (!nextValue) {
      return;
    }
    void onConfirm(nextValue);
  };

  return (
    <div className="vault-modal-backdrop" onMouseDown={onCancel}>
      <form className="vault-modal input-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <input
          ref={inputRef}
          className="input"
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="vault-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="btn btn-primary">
            {confirmText}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ConfirmModal({
  title,
  message,
  confirmText = "确定",
  cancelText = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
      if (event.key === "Enter") {
        void onConfirm();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, onConfirm]);

  return (
    <div className="vault-modal-backdrop" onMouseDown={onCancel}>
      <div className="vault-modal confirm-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="vault-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {cancelText}
          </button>
          <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={() => void onConfirm()}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
