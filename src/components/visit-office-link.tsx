"use client";

import Link from "@/components/link";

/** Use the office section on this page when available; otherwise open Contact. */
export function VisitOfficeLink({ className, showLabel = false, onActivate }: {
  className: string;
  showLabel?: boolean;
  onActivate?: () => void;
}) {
  return <Link className={className} href="/contact#visit-us" title="Visit our office" aria-label="Visit our office" onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const section = document.getElementById("visit-us");
    onActivate?.();
    if (!section) return;
    event.preventDefault();
    requestAnimationFrame(() => section.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }));
  }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
    {showLabel ? <span>Visit our office ↗</span> : null}
  </Link>;
}
