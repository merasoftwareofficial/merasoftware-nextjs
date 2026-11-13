"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import s from "./communication.module.css";

/**
 * A small (i) icon. Click it to open a popup with the details; Escape or a click outside closes it.
 * Text lives here instead of on the page, so each screen shows only its data.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onClick = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);
  return <span className={s.infoTip} ref={box}>
    <button type="button" className={s.infoButton} aria-label={`About ${label}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>i</button>
    {open && <span id={id} role="note" className={s.infoBubble}>{children}</span>}
  </span>;
}
