"use client";
import { useEffect, useRef, useState } from "react";
import s from "./campaign.module.css";

export type SortOption<T extends string> = { value: T; label: string };

/** Capsule sort dropdown matching the header NavDropdown (opens on hover or click/tap). */
export function SortMenu<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly SortOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const lastPointer = useRef("");
  const current = options.find(item => item.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
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
      className={s.pkgSort}
      ref={box}
      data-open={open || undefined}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onPointerEnter={event => {
        if (event.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={event => {
        if (event.pointerType === "mouse") setOpen(false);
      }}
    >
      <button
        type="button"
        className={s.pkgSortTrigger}
        aria-expanded={open}
        aria-haspopup="listbox"
        onPointerDown={event => {
          lastPointer.current = event.pointerType;
        }}
        onClick={() => {
          const mouse = lastPointer.current === "mouse";
          lastPointer.current = "";
          setOpen(cur => (mouse ? true : !cur));
        }}
      >
        <span className={s.pkgSortLabel}>Sort by:</span>
        <b>{current.label}</b>
        <span className={s.pkgSortChev} aria-hidden="true">▾</span>
      </button>
      <div className={s.pkgSortPanel} role="listbox" aria-label="Sort by">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
