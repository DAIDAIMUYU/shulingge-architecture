import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
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
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const enabledIndexes = useMemo(
    () => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0),
    [options],
  );
  const isDisabled = disabled || options.length === 0;

  const updateMenuPosition = () => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const viewportGap = 8;
    const width = Math.max(rect.width, 220);
    const availableBelow = window.innerHeight - rect.bottom - viewportGap * 2;
    const availableAbove = rect.top - viewportGap * 2;
    const openUpward = availableBelow < 180 && availableAbove > availableBelow;
    const maxHeight = Math.min(280, Math.max(160, openUpward ? availableAbove : availableBelow));
    const left = Math.min(Math.max(viewportGap, rect.left), Math.max(viewportGap, window.innerWidth - width - viewportGap));
    setMenuStyle({
      position: "fixed",
      top: openUpward ? Math.max(viewportGap, rect.top - maxHeight - viewportGap) : rect.bottom + viewportGap,
      left,
      width,
      maxHeight,
      zIndex: 1000,
    });
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    updateMenuPosition();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        ref.current && !ref.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onViewportChange = () => {
      updateMenuPosition();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
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
  const menu = open && typeof document !== "undefined" ? createPortal(
    <div
      ref={menuRef}
      className="custom-select-menu custom-select-menu-portal"
      role="listbox"
      aria-label={ariaLabel}
      style={menuStyle ?? undefined}
    >
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
    </div>,
    document.body,
  ) : null;

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

      {menu}
    </div>
  );
}
