"use client";

/**
 * The two questions of a package purchase on the customize page (components/packages/package-builder.tsx), built
 * like the package terms popup (package-terms-button.tsx) so they look the same:
 * - AlreadyBoughtDialog: this package's project is still running (backend helpers/packagePurchase.js); the customer
 *   opens it in the portal, or says yes to a second purchase (owner decision 11 Nov 2026).
 * - PurchasedDialog: the payment is in; the customer goes to the project in the portal (on their own, or by itself
 *   after a short countdown) or stays on the website.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { ActivePackageProject } from "@/lib/offer-reservations";
import d from "@/components/campaign/public-interaction/variant.module.css";
import s from "@/components/plans/plans.module.css";

const REDIRECT_SECONDS = 8;
const projectHref = (portalUrl: string, orderId: string) => `${portalUrl}/order-detail/${orderId}`;
const dateWords = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "");

function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return ref;
}

export function AlreadyBoughtDialog({ project, portalUrl, onBuyAnother, onClose }: {
  project: ActivePackageProject | null; portalUrl: string; onBuyAnother: () => void; onClose: () => void;
}) {
  const ref = useModal(Boolean(project));
  const titleId = useId();
  return (
    <dialog className={d.termsDialog} ref={ref} aria-labelledby={titleId} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      {project && <div className={d.dialogContent}>
        <div className={d.dialogHeader}><h2 id={titleId}>You already bought this package</h2><button type="button" aria-label="Close" onClick={onClose}>×</button></div>
        <p>You bought <b>{project.name}</b>{project.boughtAt ? ` on ${dateWords(project.boughtAt)}` : ""}. {project.approved ? "Your project is running in your client portal." : "Your payment is being checked by our team."}</p>
        <p>Paying again creates a <b>second project</b> and charges you again.</p>
        <div className={s.actions}>
          <a className={s.button} href={projectHref(portalUrl, project.orderId)}>Open my project</a>
          <button type="button" className={s.payQuiet} onClick={onBuyAnother}>Yes, buy another one</button>
        </div>
      </div>}
    </dialog>
  );
}

export function PurchasedDialog({ orderId, approved, portalUrl, onStay }: { orderId: string | null; approved: boolean; portalUrl: string; onStay: () => void }) {
  const ref = useModal(Boolean(orderId));
  const titleId = useId();
  const [left, setLeft] = useState(REDIRECT_SECONDS);
  const [staying, setStaying] = useState(false);
  useEffect(() => {
    // One purchase per page (the pay button stays off after it), so the countdown starts once, from REDIRECT_SECONDS.
    if (!orderId || staying) return;
    const timer = setInterval(() => setLeft(value => value - 1), 1000);
    return () => clearInterval(timer);
  }, [orderId, staying]);
  useEffect(() => { if (orderId && !staying && left <= 0) window.location.assign(projectHref(portalUrl, orderId)); }, [left, orderId, staying, portalUrl]);
  const stay = () => { setStaying(true); onStay(); };
  return (
    <dialog className={d.termsDialog} ref={ref} aria-labelledby={titleId} onClose={stay}>
      {orderId && <div className={d.dialogContent} role="status">
        <div className={d.dialogHeader}><h2 id={titleId}>✓ {approved ? "Payment received" : "Payment submitted"}</h2></div>
        <p>{approved ? "Your project is created in your client portal. Your work will start within 4 to 24 hours."
          : "Your project is created. Once our team confirms your UPI payment, your work will start within 4 to 24 hours."}</p>
        {!staying && <p>Taking you to your project in {Math.max(left, 0)} second{left === 1 ? "" : "s"}…</p>}
        <div className={s.actions}>
          <a className={s.button} href={projectHref(portalUrl, orderId)}>Go to my project</a>
          <button type="button" className={s.payQuiet} onClick={stay}>Stay on the website</button>
        </div>
      </div>}
    </dialog>
  );
}
