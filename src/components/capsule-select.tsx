"use client";

import { useEffect, useId, useRef, useState } from "react";

export type CapsuleOption<T extends string = string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

/**
 * Shared admin capsule dropdown matching the website SortMenu pattern:
 * opens on mouse hover (when openOnHover is true) or click/tap, closes on Escape / outside click.
 */
export function CapsuleSelect<T extends string>({
  id,
  prefix,
  ariaLabel,
  options,
  value,
  onChange,
  disabled = false,
  align = "left",
  openOnHover = true,
  className,
}: {
  id?: string;
  prefix?: string;
  ariaLabel?: string;
  options: readonly CapsuleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  align?: "left" | "right";
  openOnHover?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const lastPointer = useRef("");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = options.find(item => item.value === value) ?? options[0];

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  useEffect(() => () => clearClose(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearClose();
        setOpen(false);
      }
    };
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        clearClose();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div
      ref={box}
      className={className ? `capsule-select ${className}` : "capsule-select"}
      data-open={open && !disabled ? "true" : undefined}
      data-align={align}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          clearClose();
          setOpen(false);
        }
      }}
      onPointerEnter={event => {
        if (openOnHover && !disabled && event.pointerType === "mouse") {
          clearClose();
          setOpen(true);
        }
      }}
      onPointerLeave={event => {
        if (openOnHover && event.pointerType === "mouse") {
          clearClose();
          closeTimer.current = setTimeout(() => setOpen(false), 160);
        }
      }}
    >
      <button
        id={id}
        type="button"
        role="combobox"
        data-value={value}
        className="capsule-trigger"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-controls={listId}
        aria-expanded={open && !disabled}
        aria-haspopup="listbox"
        onPointerDown={event => {
          lastPointer.current = event.pointerType;
        }}
        onClick={() => {
          if (disabled) return;
          const mouse = openOnHover && lastPointer.current === "mouse";
          lastPointer.current = "";
          setOpen(cur => (mouse ? true : !cur));
        }}
      >
        {prefix && <span className="capsule-prefix">{prefix}</span>}
        <b>{current?.label ?? ""}</b>
        <span className="capsule-chev" aria-hidden="true">▾</span>
      </button>
      {open && !disabled && (
        <div id={listId} className="capsule-panel" role="listbox" aria-label={ariaLabel ?? prefix}>
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              role="option"
              data-value={option.value}
              disabled={option.disabled}
              aria-selected={option.value === value}
              onClick={() => {
                if (option.disabled) return;
                clearClose();
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
