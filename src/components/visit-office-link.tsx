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
    {showLabel ? <span>Visit our office ↗</span> : null}
  </Link>;
}
