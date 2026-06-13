import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  group?: string;
  disabled?: boolean;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "请选择",
  disabled = false,
  className,
  ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const enabledIndexes = useMemo(
    () => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0),
    [options],
  );
  const isDisabled = disabled || options.length === 0;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : enabledIndexes[0] ?? -1);
  }, [enabledIndexes, open, options, value]);

  const moveActive = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) {
      return;
    }
    const currentPosition = enabledIndexes.indexOf(activeIndex);
    const nextPosition = currentPosition < 0
      ? 0
      : (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextPosition]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const option = options[activeIndex];
      if (option && !option.disabled) {
        onChange(option.value);
        setOpen(false);
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  let lastGroup: string | undefined;

  return (
    <div className={`custom-select${className ? ` ${className}` : ""}`} ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className={`custom-select-trigger${selected ? "" : " placeholder"}`}
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown size={15} strokeWidth={1.8} />
      </button>

      {open ? (
        <div className="custom-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => {
            const showGroup = option.group && option.group !== lastGroup;
            lastGroup = option.group;

            return (
              <div key={`${option.group ?? "default"}:${option.value}:${index}`}>
                {showGroup ? <div className="custom-select-group">{option.group}</div> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={[
                    "custom-select-option",
                    option.value === value ? "selected" : "",
                    index === activeIndex ? "active" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={option.disabled}
                  onMouseEnter={() => {
                    if (!option.disabled) {
                      setActiveIndex(index);
                    }
                  }}
                  onClick={() => {
                    if (option.disabled) {
                      return;
                    }
                    onChange(option.value);
                    setOpen(false);
                    buttonRef.current?.focus();
                  }}
                >
                  <span>
                    <strong>{option.label}</strong>
                    {option.hint ? <small>{option.hint}</small> : null}
                  </span>
                  {option.value === value ? <Check size={14} strokeWidth={1.8} /> : null}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
