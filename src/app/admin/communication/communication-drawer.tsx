"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "@/components/link";
import s from "./communication.module.css";

const CLOSED = "/admin/communication";

/** A side panel over the control panel (?panel=…). Esc, the backdrop and Close return to the list. */
export function CommunicationDrawer({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const page = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    // Esc presses Close (same loader, no scroll jump). An open email dialog handles its own Esc first.
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) close.current?.click(); };
    document.addEventListener("keydown", onKey);
    return () => { document.documentElement.style.overflow = page; document.removeEventListener("keydown", onKey); };
  }, []);
  return <div className={s.drawerLayer}>
    <Link href={CLOSED} scroll={false} className={s.backdrop} aria-label="Close panel" tabIndex={-1} />
    <aside ref={panel} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="communication-panel-title" tabIndex={-1}>
      <header className={s.drawerHeader}>
        <div><h2 id="communication-panel-title">{title}</h2><p>{description}</p></div>
        <Link ref={close} href={CLOSED} scroll={false} className="admin-action">Close</Link>
      </header>
      <div className={s.drawerBody}>{children}</div>
    </aside>
  </div>;
}
