"use client";

/**
 * A package's terms behind a link: the button and the popup it opens. The one place the popup is built,
 * so the package card and the customize page (components/packages/package-builder.tsx) show the same
 * thing. The lines are the caller's (each page already knows which terms apply); nothing is worked out here.
 */

import { useId, useRef } from "react";
import d from "@/components/campaign/public-interaction/variant.module.css";

export function PackageTermsButton({ name, lines, className }: { name: string; lines: string[]; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return <>
    <button type="button" className={className} onClick={() => dialog.current?.showModal()}>Terms &amp; exclusions</button>
    <dialog className={d.termsDialog} ref={dialog} aria-labelledby={titleId} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={d.dialogContent}>
        <div className={d.dialogHeader}><h2 id={titleId}>Terms &amp; exclusions</h2><button type="button" aria-label="Close terms and exclusions" onClick={() => dialog.current?.close()}>×</button></div>
        <p>{name}</p>
        <ul>{lines.map((line, i) => <li key={i}>{line}</li>)}</ul>
      </div>
    </dialog>
  </>;
}
