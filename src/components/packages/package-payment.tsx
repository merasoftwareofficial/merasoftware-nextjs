"use client";

/**
 * The payment popup of a package's customize page (src/docs/package.md): the customer pays the first payment
 * of the choice they made and the project is created with it (backend helpers/packagePurchase.js). The
 * wallet pays first and settles at once; a UPI remainder is shown as a QR with the customer's reference, and
 * the team approves it. The price is the quote's; the backend works it out again and refuses a changed one.
 * Afterwards the customer stays here or opens the project in the portal.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { InlineLoader } from "@/components/loading/navigation";
import type { PackageChoice, PackageChoiceQuote } from "@/lib/sales-packages";
import s from "@/components/plans/plans.module.css";

const money = (value: number) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const cents = (value: number) => Math.round(value * 100);
type PayInfo = { walletBalance: number; upiId: string; payeeName: string };
export type PurchaseResult = { orderId: string; approved: boolean; walletPaid?: number; upiPending?: number };

export function packagePaymentSplit(dueNow: number, walletBalance: number) {
  const wallet = Math.min(cents(walletBalance), cents(dueNow));
  return { wallet: wallet / 100, upi: (cents(dueNow) - wallet) / 100 };
}

export function PackagePayment({ open, onClose, packageId, packageName, choice, quote, portalUrl, onPaid }: {
  open: boolean; onClose: () => void; packageId: string; packageName: string; choice: PackageChoice; quote: PackageChoiceQuote; portalUrl: string;
  onPaid: (result: PurchaseResult) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PurchaseResult | null>(null);
  // One key per choice: a retry of the same payment never makes a second project; a changed choice is a new one.
  const key = useRef({ signature: "", value: "" });
  const signature = JSON.stringify({ packageId, choice, quoteKey: quote.quoteKey, dueNow: quote.dueNow });
  if (key.current.signature !== signature) key.current = { signature, value: crypto.randomUUID() };

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => {
    if (!open || done) return;
    let active = true;
    setError("");
    fetch("/api/package-purchase", { cache: "no-store" })
      .then(async response => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => { if (!active) return; if (!ok) throw new Error(data.error || "Could not load your payment details"); setInfo(data); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Could not load your payment details"); });
    return () => { active = false; };
  }, [open, done]);

  const split = useMemo(() => (info ? packagePaymentSplit(quote.dueNow, info.walletBalance) : null), [info, quote.dueNow]);
  const upiLink = info && split && split.upi > 0
    ? `upi://pay?pa=${info.upiId}&pn=${encodeURIComponent(info.payeeName)}&am=${split.upi}&cu=INR&tn=${encodeURIComponent(`${packageName} project`)}` : "";
  const needsReference = Boolean(split && split.upi > 0);
  const referenceOk = !needsReference || /^\d{12,}$/.test(reference.trim());

  async function pay() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/package-purchase", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, choice, quoteKey: quote.quoteKey, dueNow: quote.dueNow, creationKey: key.current.value,
          ...(needsReference ? { upiTransactionId: reference.trim() } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The payment could not be completed");
      setDone(data); onPaid(data);
    } catch (err) { setError(err instanceof Error ? err.message : "The payment could not be completed"); }
    finally { setBusy(false); }
  }

  return (
    <dialog ref={dialog} className={s.payDialog} aria-labelledby="package-pay-title" onClose={onClose}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={s.payContent}>
        <div className={s.payHead}><h2 id="package-pay-title">{done ? (done.approved ? "Your project is created" : "Payment submitted") : "Pay to start your project"}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>×</button></div>
        {done ? (
          <div className={s.payBody}>
            <div className={s.sent} role="status">
              <b>✓ {done.approved ? "Payment received" : "Waiting for our team to confirm your payment"}</b>
              <span>{done.approved
                ? "Your project is created in your client portal. Your work will start within 4 to 24 hours. Follow its progress, send files and see invoices there."
                : "Your project is created in your client portal. Once our team confirms your UPI payment, your work will start within 4 to 24 hours."}</span>
            </div>
            <a className={s.button} href={`${portalUrl}/order-detail/${done.orderId}`}>Open my project in the portal →</a>
            <button type="button" className={s.payQuiet} onClick={onClose}>Stay on this website</button>
          </div>
        ) : (
          <div className={s.payBody}>
            <p className={s.payName}>{packageName}</p>
            <div className={s.rows}>
              <div className={s.row}><span>Project price</span><span>{money(quote.finalPrice)}</span></div>
              <div className={s.row}><span>Pay now{quote.billing === "monthly" ? " (first cycle)" : quote.installments?.length ? " (first installment)" : ""}</span><b>{money(quote.dueNow)}</b></div>
              {split && split.wallet > 0 && <div className={s.row}><span>From your wallet ({money(info!.walletBalance)} available)</span><span className={s.good}>− {money(split.wallet)}</span></div>}
              {split && split.upi > 0 && <div className={s.row}><span>To pay by UPI</span><b>{money(split.upi)}</b></div>}
            </div>
            {!info && !error && <p className={s.muted}>Loading your payment details…</p>}
            {split && split.upi === 0 && <p className={s.note}>Your wallet covers this payment. Your project is created at once.</p>}
            {upiLink && info && (
              <div className={s.payUpi}>
                <QRCodeSVG value={upiLink} size={168} marginSize={2} title={`UPI payment of ${money(split!.upi)}`} />
                <p className={s.note}>Scan with any UPI app, or pay to <b>{info.upiId}</b> ({info.payeeName}), then enter the UPI reference (UTR) of your payment.</p>
                <a className={s.payQuiet} href={upiLink}>Open my UPI app</a>
                <label className={s.payLabel}>UPI reference (12 digits or more)
                  <input inputMode="numeric" autoComplete="off" value={reference} onChange={event => setReference(event.target.value.replace(/\D/g, ""))} aria-invalid={reference !== "" && !referenceOk} />
                </label>
              </div>
            )}
            {error && <p className={s.error} role="alert">{error}</p>}
            <button type="button" className={s.button} onClick={pay} disabled={busy || !info || !referenceOk || (needsReference && !reference)}>
              {busy ? <><InlineLoader />Processing…</> : split && split.upi > 0 ? `I have paid ${money(split.upi)}` : `Pay ${money(quote.dueNow)} from wallet`}
            </button>
            <p className={s.note}>Your project is created with this payment. A UPI payment is checked by our team before work starts.</p>
          </div>
        )}
      </div>
    </dialog>
  );
}
