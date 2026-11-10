"use client";

/**
 * A package's customize page (/package/<id>/customize, src/docs/package.md §3), built like the plan page
 * (components/plans/plan-builder.tsx, same steps and "Your package" card). The customer chooses how to buy
 * the package; every price is the portal backend's quote (helpers/salesPackages.js quoteChoice) through
 * /api/package-quote. "Proceed to pay" sends a package start request of kind "buy" with this choice
 * (helpers/packageStart.js: the team is told at once, the customer is not), then opens the payment popup (package-payment.tsx): the first payment creates
 * the customer's project (helpers/packagePurchase.js) and the portal runs it from there.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { PhoneField, type PhoneCountry } from "@/components/phone-field";
import { usePackageStart } from "@/components/offer-reservations";
import { InlineLoader } from "@/components/loading/navigation";
import { PackagePayment, type PurchaseResult } from "@/components/packages/package-payment";
import { Row, Step } from "@/components/plans/plan-builder";
import { CYCLE_MONTHS, PERIOD_WORDS, PURCHASE_LABELS, tenureLabel } from "@/lib/public-plans";
import {
  cleanPackageChoice, cycleChoices, filesChoices, lengthChoicesFor, packageChoiceQuery, PAYMENT_OPTION_WORDS, updatesChoices,
} from "@/lib/package-choice";
import type { PackageChoice, PackageChoiceQuote, PackageCycle, SalesPackage } from "@/lib/sales-packages";
import s from "@/components/plans/plans.module.css";

export type BuilderPackage = Pick<SalesPackage, "id" | "name" | "billing" | "portalUploads" | "paymentOptions" | "monthly" | "inclusions">;
const money = (value: number) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function QuoteBill({ item, quote, loading, error }: { item: BuilderPackage; quote: PackageChoiceQuote | null; loading: boolean; error: string }) {
  if (error) return <p className={s.error}>{error}</p>;
  if (!quote) return <p className={s.muted}>Working out the price…</p>;
  const offerRow = quote.offer && quote.discountAmount > 0 ? <Row good label={`${quote.offer.title} offer`} value={`− ${money(quote.discountAmount)}`} /> : null;
  if (quote.monthly) {
    const m = quote.monthly;
    const months = m.cycleMonths;
    return (
      <div className={s.bill} data-loading={loading || undefined} aria-live="polite">
        <div className={s.rows}>
          {m.pricing === "per_file"
            ? <Row label={`${m.files} files × ${m.updatesPerMonth} update${m.updatesPerMonth === 1 ? "" : "s"} a month`} value={money(m.perMonthPrice)} />
            : <Row label="Monthly price" value={money(m.perMonthPrice)} />}
          {months > 1 && <Row label={`× ${months} months`} value={money(m.perMonthPrice * months)} />}
          {m.discountPercent > 0 && <Row good label={`${m.discountPercent}% period discount`} value={`− ${money(m.perMonthPrice * months - m.cyclePrice)}`} />}
        </div>
        <div className={s.total}>
          <span>{months === 1 ? "Per month" : `Every ${PERIOD_WORDS[m.billingCycle]}`}</span>
          <strong>{money(m.cyclePrice)}</strong>
          <span className={s.totalNote}>{m.totalCycles > 1 ? `${m.totalCycles} payments, ${money(quote.finalPrice)} in total` : `${tenureLabel(m.tenureMonths)}, paid at the start`}</span>
        </div>
        {offerRow}
        <div className={s.gives}>
          {m.pricing === "per_file"
            ? <b>You get {m.updatesPerMonth} update{m.updatesPerMonth === 1 ? "" : "s"} a month · {m.files} files each</b>
            : <b>{item.portalUploads ? "Send your files any time while the package runs" : "Progress updates in your client portal"}</b>}
          <span>Runs for {tenureLabel(m.tenureMonths)}. You pay one {months === 1 ? "month" : "period"} at a time; work pauses while a payment is due.</span>
        </div>
      </div>
    );
  }
  const parts = quote.installments ?? [];
  return (
    <div className={s.bill} data-loading={loading || undefined} aria-live="polite">
      <div className={s.rows}>
        <Row label="Package price" value={money(quote.regularPrice)} />
        {offerRow}
        {parts.map(part => <Row key={part.installmentNumber} label={`Installment ${part.installmentNumber} (${part.percentage}%)${part.progressThreshold == null ? " · at the start" : ` · at ${part.progressThreshold}% progress`}`} value={money(part.amount)} />)}
      </div>
      <div className={s.total}>
        <span>{parts.length ? "Due at the start" : "Pay once"}</span>
        <strong>{money(quote.dueNow)}</strong>
        {parts.length > 0 && <span className={s.totalNote}>{money(quote.finalPrice)} in total</span>}
      </div>
      <div className={s.gives}>
        <b>{item.portalUploads ? "Send your files in your client portal while we build" : "Progress updates in your client portal"}</b>
      </div>
    </div>
  );
}

export function PackageBuilder({ item, terms, initial, signedIn, countries, path, portalUrl }: {
  item: BuilderPackage; terms: string[]; initial: PackageChoice; signedIn: boolean; countries: PhoneCountry[]; path: string; portalUrl: string;
}) {
  const monthly = item.billing === "monthly";
  const perFile = item.monthly?.pricing === "per_file";
  const [choice, setChoice] = useState<PackageChoice>(initial);
  const set = (part: Partial<PackageChoice>) => setChoice(current => ({ ...current, ...part }));
  const cycles = useMemo(() => cycleChoices(item), [item]);
  const lengths = useMemo(() => lengthChoicesFor(item, choice.billingCycle), [item, choice.billingCycle]);
  const files = useMemo(() => filesChoices(item), [item]);
  const updates = useMemo(() => updatesChoices(item), [item]);
  const clean = useMemo(() => cleanPackageChoice(item, choice), [item, choice]);

  // The quote; its JSON is also the key of the answer, so "loading" is "the last answer was for a different choice".
  const request = useMemo(() => JSON.stringify({ packageId: item.id, choice: clean }), [item.id, clean]);
  const [answer, setAnswer] = useState<{ request: string; error: string; quote: PackageChoiceQuote | null }>({ request: "", error: "", quote: null });
  const ticket = useRef(0);
  useEffect(() => {
    const mine = ++ticket.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/package-quote", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: request });
        const result = await response.json().catch(() => ({}));
        if (ticket.current !== mine) return;
        if (!response.ok || !result.quote) throw new Error(result.error || "The price could not be worked out right now.");
        setAnswer({ request, error: "", quote: result.quote });
      } catch (error) {
        if (ticket.current !== mine) return;
        setAnswer({ request, error: error instanceof Error ? error.message : "The price could not be worked out right now.", quote: null });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [request]);
  const loading = answer.request !== request;
  const error = loading ? "" : answer.error;
  const quote = answer.quote;
  const ready = Boolean(quote) && !loading && !error;

  // The request carries this choice; after sign-in the customer comes back to this same choice.
  const query = packageChoiceQuery(clean);
  const start = usePackageStart({ packageId: item.id, signedIn, countries, choice: clean, returnPath: `${path}${query ? `?${query}` : ""}` });
  // A buy that is open continues to the payment. This page only buys; a callback is asked for on the package page.
  const requested = start.request?.kind === "buy";
  const [paying, setPaying] = useState(false);
  const [purchased, setPurchased] = useState<PurchaseResult | null>(null);
  // "Proceed to pay" sends the request first (the team is told), then opens the payment popup.
  const wantsToPay = useRef(false);
  useEffect(() => { if (wantsToPay.current && start.request) { wantsToPay.current = false; setPaying(true); } }, [start.request]);
  const sideRef = useRef<HTMLElement>(null);
  function get() {
    if (signedIn && start.request) { setPaying(true); return; }
    wantsToPay.current = true;
    start.confirm("buy");
    if (start.needsPhone && window.matchMedia("(max-width: 900px)").matches) sideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // The phone bar has room for a short label only.
  const mainButton = (short = false) => (
    <button type="button" className={s.button} onClick={get} disabled={!ready || start.busy || !!purchased || (signedIn && !start.loaded) || (start.needsPhone && !start.phone.phone.trim())}>
      {start.busyKind === "buy" ? <><InlineLoader />Processing…</> : signedIn ? (short ? "Pay now →" : "Proceed to pay →") : short ? "Sign in →" : "Sign in to proceed →"}
    </button>
  );
  const price = quote && !loading ? (quote.monthly ? `${money(quote.monthly.cyclePrice)} / ${PERIOD_WORDS[quote.monthly.billingCycle]}` : money(quote.dueNow)) : "…";

  const steps = [];
  if (perFile && files.length) {
    steps.push(
      <Step key="files" title="How many files in each update?">
        <div className={s.bigNumber}><strong>{choice.files}</strong><span>files in each update</span></div>
        <input type="range" aria-label="Files per update" className={s.slider} min={files[0]} max={files[files.length - 1]} step={item.monthly?.files?.step || 1} value={choice.files ?? files[0]} onChange={event => set({ files: Number(event.target.value) })} />
        <div className={s.ends}><span>{files[0]}</span><span>{files[files.length - 1]}</span></div>
      </Step>,
      <Step key="updates" title="How many updates do you need each month?">
        <select aria-label="Updates per month" className={s.select} value={choice.updates ?? ""} onChange={event => set({ updates: Number(event.target.value) })}>
          {updates.map(value => <option key={value} value={value}>{value} update{value === 1 ? "" : "s"} per month</option>)}
        </select>
        <p className={s.hint}>Unused updates carry forward inside the billing period.</p>
      </Step>,
    );
  }
  if (monthly) {
    steps.push(
      <Step key="cycle" title="How often do you want to pay?">
        <div className={s.segs}>
          {cycles.map(option => (
            <button key={option.billingCycle} type="button" className={s.seg} aria-pressed={choice.billingCycle === option.billingCycle}
              onClick={() => { const next = lengthChoicesFor(item, option.billingCycle); set({ billingCycle: option.billingCycle as PackageCycle, tenureMonths: next.includes(choice.tenureMonths ?? 0) ? choice.tenureMonths : next[next.length - 1] }); }}>
              <b>{PURCHASE_LABELS[option.billingCycle]}</b>
              <span className={option.discountPercent ? s.good : undefined}>{option.discountPercent ? `save ${option.discountPercent}%` : `billed every ${PERIOD_WORDS[option.billingCycle]}`}</span>
            </button>
          ))}
        </div>
      </Step>,
      <Step key="length" title="For how long?">
        <div className={s.pills}>{lengths.map(months => <button key={months} type="button" className={s.pill} aria-pressed={choice.tenureMonths === months} onClick={() => set({ tenureMonths: months })}>{tenureLabel(months)}</button>)}</div>
        <p className={s.hint}>The package ends after this time. To continue, you buy it again.</p>
      </Step>,
    );
  } else {
    steps.push(
      <Step key="pay" title="How do you want to pay?">
        <div className={(item.paymentOptions?.length ?? 0) <= 2 ? `${s.segs} ${s.two}` : s.segs}>
          {(item.paymentOptions ?? []).map(option => (
            <button key={option} type="button" className={s.seg} aria-pressed={choice.paymentOption === option} onClick={() => set({ paymentOption: option })}>
              <b>{PAYMENT_OPTION_WORDS[option].title}</b><span>{PAYMENT_OPTION_WORDS[option].detail}</span>
            </button>
          ))}
        </div>
        {choice.paymentOption !== "full" && <p className={s.hint}>The first part starts your project; each next part is due as the work reaches its stage.</p>}
      </Step>,
    );
  }
  steps.push(
    <Step key="included" title="What's included">
      <ul className={s.hint}>{item.inclusions.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </Step>,
  );
  if (terms.length) steps.push(
    <Step key="terms" title="Terms & exclusions">
      <ul className={s.hint}>{terms.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </Step>,
  );

  const summary = monthly
    ? `${item.name}, ${choice.billingCycle ? PURCHASE_LABELS[choice.billingCycle].toLowerCase() : ""} for ${tenureLabel(choice.tenureMonths ?? CYCLE_MONTHS.monthly)}`
    : `${item.name}, ${choice.paymentOption ? PAYMENT_OPTION_WORDS[choice.paymentOption].title.toLowerCase() : ""}`;
  return (
    <div className={s.builder}>
      <div className={s.steps}>{steps}</div>
      <aside ref={sideRef} className={s.side} aria-label="Your package">
        <div><p className={s.fine}>Your package</p><h2 className={s.choiceTitle}>{summary}</h2></div>
        <QuoteBill item={item} quote={quote} loading={loading} error={error} />
        {purchased ? (
          <div className={s.sent} role="status">
            <b>✓ {purchased.approved ? "Payment received" : "Payment submitted"}</b>
            <span>{purchased.approved ? "Your project is created in your client portal. Your work will start within 4 to 24 hours." : "Your project is created. Once our team confirms your UPI payment, your work will start within 4 to 24 hours."}</span>
            <a className="text-link" href={`${portalUrl}/order-detail/${purchased.orderId}`}>Open my project in the portal →</a>
          </div>
        ) : <>
          {!requested && start.needsPhone && <PhoneField className="auth-field" countries={start.countries} value={start.phone} onChange={start.setPhone} />}
          <div className={s.actions}>{mainButton()}</div>
        </>}
        {start.error && <p className={s.error} role="alert">{start.error}</p>}
        {!purchased && <p className={s.note}>You pay the first payment now (wallet first, then UPI). Your project is created with it and runs in your client portal.</p>}
      </aside>
      {/* Phones: the price and the button stay in reach while the steps scroll. */}
      <div className={s.mobileBar}>
        <div><span>Your package</span><strong>{error ? "—" : price}</strong></div>
        {purchased ? <strong className={s.good}>✓ Paid</strong> : mainButton(true)}
      </div>
      {signedIn && quote && !loading && !error && (
        <PackagePayment open={paying} onClose={() => setPaying(false)} packageId={item.id} packageName={item.name} choice={clean} quote={quote} portalUrl={portalUrl} onPaid={setPurchased} />
      )}
    </div>
  );
}
