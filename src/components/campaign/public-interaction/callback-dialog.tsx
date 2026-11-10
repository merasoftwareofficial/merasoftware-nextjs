"use client";

import { useEffect, type RefObject } from "react";
import { PhoneField } from "@/components/phone-field";
import { InlineLoader } from "@/components/loading/navigation";
import type { usePackageStart } from "@/components/offer-reservations";
import s from "./variant.module.css";

export function Arrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

type Start = ReturnType<typeof usePackageStart>;

/** The label of the "Arrange a callback" button: asked once, it stays as the answer. */
export const callbackLabel = (start: Pick<Start, "request">) => (start.request?.kind === "callback" ? "Callback requested · our team will contact you" : "Arrange a callback");

/**
 * "Arrange a callback" on a package (backend helpers/packageStart.js, kind callback): the one dialog both the package
 * page and its customize page use. Confirm tells the team and the customer once (only the team is reminded); the
 * dialog then closes and the button stays as "Callback requested". Not signed in, Confirm goes to sign-in and the
 * request is sent on return. The caller owns the dialog's ref, to open it from its button.
 */
export function PackageCallbackDialog({ dialogRef, start, name, price }: { dialogRef: RefObject<HTMLDialogElement | null>; start: Start; name: string; price?: string }) {
  const { error, errorKind, request } = start;
  // A refusal (e.g. after returning from sign-in) opens the dialog to explain it; success closes it. Only the callback's own errors count.
  useEffect(() => { if (error && errorKind === "callback" && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal(); }, [error, errorKind, dialogRef]);
  useEffect(() => { if (request?.kind === "callback" && !error) dialogRef.current?.close(); }, [request, error, dialogRef]);
  const mine = errorKind === "callback";
  return <dialog className={s.termsDialog} ref={dialogRef} aria-labelledby="callback-title" onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
    <div className={s.dialogContent}>
      <div className={s.dialogHeader}><h2 id="callback-title">Arrange a callback for this package?</h2><button type="button" aria-label="Close" onClick={() => dialogRef.current?.close()}>×</button></div>
      <p>{name}{price ? ` · ${price}` : ""}</p>
      <ul>
        <li>Our team will call you to help you start your project.</li>
        <li>No payment now. The price and scope are confirmed with you before work starts.</li>
        {!start.signedIn && <li>A callback needs an account. Sign in, or create one in a minute; you come back here and your request is sent.</li>}
      </ul>
      {mine && error && <p role="alert" className={s.reserveError}>{error}</p>}
      {mine && start.needsPhone && <PhoneField className="auth-field" countries={start.countries} value={start.phone} onChange={start.setPhone} />}
      <button type="button" className={s.claim} disabled={start.busy || request?.kind === "callback" || (mine && start.needsPhone && !start.phone.phone.trim())} onClick={() => start.confirm("callback")}>
        {start.busyKind === "callback" ? <><InlineLoader />Processing…</> : start.signedIn ? "Confirm" : "Continue to sign in"}<Arrow />
      </button>
    </div>
  </dialog>;
}
