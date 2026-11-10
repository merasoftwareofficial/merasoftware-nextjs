"use client";

/**
 * The payment of a package's customize page (src/docs/package.md), shown inside the "Your package" card the way
 * the client portal's package page shows it (frontend pages/StartProjectPackage.js): the customer pays the first
 * payment of the choice they made and the project is created with it (backend helpers/packagePurchase.js). The
 * wallet pays first and settles at once; a UPI remainder is shown as a QR with the customer's reference, and
 * the team approves it. The price is the quote's; the backend works it out again and refuses a changed one.
 *
 * `usePackagePayment` holds the whole flow; `WalletSplit` (what the wallet and UPI will pay) and `UpiStep`
 * (the QR and the reference) are what the card shows.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

async function readPayInfo(): Promise<PayInfo> {
  const response = await fetch("/api/package-purchase", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not load your payment details");
  return data;
}

export function usePackagePayment({ packageId, packageName, choice, quote, signedIn, onPaid }: {
  packageId: string; packageName: string; choice: PackageChoice; quote: PackageChoiceQuote | null; signedIn: boolean; onPaid: (result: PurchaseResult) => void;
}) {
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [step, setStep] = useState<"review" | "upi">("review");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One key per choice: a retry of the same payment never makes a second project; a changed choice is a new one.
  const key = useRef({ signature: "", value: "" });
  const signature = JSON.stringify({ packageId, choice, quoteKey: quote?.quoteKey, dueNow: quote?.dueNow });
  if (key.current.signature !== signature) key.current = { signature, value: crypto.randomUUID() };

  // The wallet balance and the UPI payee, shown before the customer pays.
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    readPayInfo().then(value => { if (active) setInfo(value); }).catch(() => {});
    return () => { active = false; };
  }, [signedIn]);

  const split = useMemo(() => (info && quote ? packagePaymentSplit(quote.dueNow, info.walletBalance) : null), [info, quote]);
  const upiLink = info && split && split.upi > 0
    ? `upi://pay?pa=${info.upiId}&pn=${encodeURIComponent(info.payeeName)}&am=${split.upi}&cu=INR&tn=${encodeURIComponent(`${packageName} project`)}` : "";
  const referenceOk = /^\d{12,}$/.test(reference.trim());

  // The purchase: the quote's key and amount, never a price of this page's own.
  const buy = useCallback(async (upiReference: string) => {
    if (!quote) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/package-purchase", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, choice, quoteKey: quote.quoteKey, dueNow: quote.dueNow, creationKey: key.current.value,
          ...(upiReference ? { upiTransactionId: upiReference } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The payment could not be completed");
      onPaid(data);
    } catch (err) { setError(err instanceof Error ? err.message : "The payment could not be completed"); }
    finally { setBusy(false); }
  }, [packageId, choice, quote, onPaid]);

  /** After the buy request is sent: read the wallet again, then pay from it at once or ask for the UPI remainder. */
  const begin = useCallback(async () => {
    if (!quote) return;
    setBusy(true); setError("");
    try {
      const fresh = await readPayInfo();
      setInfo(fresh);
      if (packagePaymentSplit(quote.dueNow, fresh.walletBalance).upi > 0) { setReference(""); setStep("upi"); setBusy(false); return; }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load your payment details"); setBusy(false); return; }
    setBusy(false);
    await buy("");
  }, [quote, buy]);

  const upiOpen = step === "upi" && Boolean(upiLink);
  return {
    info, split, upiLink, step: upiOpen ? "upi" as const : "review" as const, busy, error, reference, referenceOk,
    setReference: (value: string) => setReference(value.replace(/\D/g, "")),
    begin, sendUpi: () => buy(reference.trim()), back: () => { setStep("review"); setError(""); },
  };
}

/** What the wallet and UPI will pay of this payment, before the customer pays. */
export function WalletSplit({ pay }: { pay: ReturnType<typeof usePackagePayment> }) {
  if (!pay.info || !pay.split) return null;
  return (
    <div className={s.gives}>
      <div className={s.row}><span>Paid from wallet</span><span>{money(pay.split.wallet)}</span></div>
      {pay.split.upi > 0 && <div className={s.row}><span>To pay by UPI</span><span>{money(pay.split.upi)}</span></div>}
      <span>Wallet balance: {money(pay.info.walletBalance)}. {pay.split.upi > 0 ? "The UPI part is checked by our team; your project starts when it is approved." : "Your wallet covers it, so your project is created at once."}</span>
    </div>
  );
}

/** The UPI remainder: the QR, the payee, the reference of the customer's payment and the button that sends it. */
export function UpiStep({ pay }: { pay: ReturnType<typeof usePackagePayment> }) {
  if (!pay.info || !pay.split) return null;
  return (
    <>
      {pay.split.wallet > 0 && <p className={s.note}>{money(pay.split.wallet)} comes from your wallet when you send this payment.</p>}
      <div className={s.payUpi}>
        <QRCodeSVG value={pay.upiLink} size={168} marginSize={2} title={`UPI payment of ${money(pay.split.upi)}`} />
        <p className={s.note}>Scan with any UPI app, or pay to <b>{pay.info.upiId}</b> ({pay.info.payeeName}), then enter the UPI reference (UTR) of your payment.</p>
        <a className={s.payQuiet} href={pay.upiLink}>Open my UPI app</a>
        <label className={s.payLabel}>UPI reference (12 digits or more)
          <input inputMode="numeric" autoComplete="off" disabled={pay.busy} value={pay.reference} onChange={event => pay.setReference(event.target.value)} aria-invalid={pay.reference !== "" && !pay.referenceOk} />
        </label>
      </div>
      <button type="button" className={s.button} onClick={pay.sendUpi} disabled={pay.busy || !pay.referenceOk}>
        {pay.busy ? <><InlineLoader />Processing…</> : `I have paid ${money(pay.split.upi)}`}
      </button>
      <button type="button" className={s.payQuiet} onClick={pay.back} disabled={pay.busy}>Back</button>
      <p className={s.note}>Your project is created with this payment. A UPI payment is checked by our team before work starts.</p>
    </>
  );
}
