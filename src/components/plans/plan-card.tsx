"use client";

/**
 * One plan on the public plans page (/plans): what it is, its price range and an estimator.
 * The estimator only lists the plan's own choices (lib/public-plans.ts); every price shown is the
 * portal backend's quote through /api/plan-quote. Plans are bought in the client portal, so the
 * call to action is an enquiry, like the package cards.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fileChoices, formatMoney, lengthChoices, purchaseChoices, PURCHASE_LABELS, rangeLabel, updateChoices,
  type PlanQuote, type PublicPlan,
} from "@/lib/public-plans";
import s from "./plans.module.css";

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const PERIOD_WORDS: Record<string, string> = { monthly: "month", quarterly: "3 months", half_yearly: "6 months", yearly: "year" };

export function PlanCard({ plan, categoryLabel, buyHref }: { plan: PublicPlan; categoryLabel: string; buyHref: string }) {
  const purchases = useMemo(() => purchaseChoices(plan), [plan]);
  const files = useMemo(() => fileChoices(plan), [plan]);
  const updates = useMemo(() => updateChoices(plan), [plan]);
  const [purchase, setPurchase] = useState(purchases[0]?.value ?? "");
  const cycleMonths = purchases.find(option => option.value === purchase)?.months ?? null;
  const lengths = useMemo(() => lengthChoices(plan, cycleMonths), [plan, cycleMonths]);
  const [tenureMonths, setTenureMonths] = useState<number | null>(purchases[0]?.months ?? null);
  const [fileCount, setFileCount] = useState<number | null>(files[0] ?? null);
  const [updateCount, setUpdateCount] = useState<number | null>(updates[0] ?? null);
  const flexible = plan.pricingMode === "flexible";
  const oneTime = purchase === "one_time";
  // The estimator's request; its JSON is also the key of the answer, so "loading" is simply
  // "the last answer was for a different choice".
  const request = useMemo(() => JSON.stringify({
    planId: plan._id, purchase,
    ...(oneTime ? {} : { tenureMonths: tenureMonths ?? undefined }),
    ...(flexible ? { files: fileCount ?? undefined, updates: updateCount ?? undefined } : {}),
  }), [plan._id, purchase, oneTime, tenureMonths, flexible, fileCount, updateCount]);
  const [answer, setAnswer] = useState<{ request: string; error: string; quote: PlanQuote | null }>({ request: "", error: "", quote: null });
  const ticket = useRef(0);

  useEffect(() => {
    if (!purchase) return;
    const mine = ++ticket.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/plan-quote", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: request });
        const result = await response.json().catch(() => ({}));
        if (ticket.current !== mine) return;
        if (!response.ok || !result.quote) throw new Error(result.error || "The price could not be worked out right now.");
        setAnswer({ request, error: "", quote: result.quote });
      } catch (error) {
        if (ticket.current !== mine) return;
        setAnswer({ request, error: error instanceof Error ? error.message : "The price could not be worked out right now.", quote: null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [purchase, request]);
  const state = { loading: answer.request !== request, error: answer.request === request ? answer.error : "", quote: answer.quote };

  const choosePurchase = (value: string) => {
    setPurchase(value as typeof purchase);
    setTenureMonths(purchases.find(option => option.value === value)?.months ?? null);
  };

  const quote = state.quote;
  const description = stripHtml(plan.description || "");
  const href = `mailto:contact@merasoftware.com?subject=${encodeURIComponent(`${plan.serviceName} plan enquiry`)}&body=${encodeURIComponent(`Hello, I am interested in the ${plan.serviceName} plan (${plan._id}). Please tell me more.`)}`;

  return (
    <article className={s.card}>
      <p className={s.fine}>{categoryLabel}</p>
      <h3>{plan.serviceName}</h3>
      {description && <p className={s.description}>{description}</p>}
      {rangeLabel(plan.priceRange) && <div className={s.range}>{rangeLabel(plan.priceRange)}</div>}

      <div className={s.estimator}>
        {flexible && files.length > 0 && (
          <label className={s.field}>
            <span>Files per update: <b>{fileCount}</b></span>
            <input type="range" min={files[0]} max={files[files.length - 1]} step={plan.files?.step || 1} value={fileCount ?? files[0]} onChange={event => setFileCount(Number(event.target.value))} />
          </label>
        )}
        {flexible && updates.length > 1 && (
          <div className={s.field}>
            <span>{oneTime ? "Number of updates" : "Updates per month"}</span>
            <div className={s.options}>
              {updates.map(value => <button key={value} type="button" className={s.option} aria-pressed={updateCount === value} onClick={() => setUpdateCount(value)}>{value}</button>)}
            </div>
          </div>
        )}
        {purchases.length > 1 && (
          <div className={s.field}>
            <span>How to pay</span>
            <div className={s.options}>
              {purchases.map(option => (
                <button key={option.value} type="button" className={s.option} aria-pressed={purchase === option.value} onClick={() => choosePurchase(option.value)}>
                  {PURCHASE_LABELS[option.value]}{option.discountPercent ? ` · save ${option.discountPercent}%` : ""}
                </button>
              ))}
            </div>
          </div>
        )}
        {!oneTime && lengths.length > 1 && (
          <div className={s.field}>
            <span>For how long</span>
            <div className={s.options}>
              {lengths.map(months => <button key={months} type="button" className={s.option} aria-pressed={tenureMonths === months} onClick={() => setTenureMonths(months)}>{months === 12 ? "1 year" : `${months} month${months === 1 ? "" : "s"}`}</button>)}
            </div>
          </div>
        )}

        <div className={s.quote} aria-live="polite" data-loading={state.loading || undefined}>
          {state.error ? <p className={s.error}>{state.error}</p> : !quote ? <p>Working out the price…</p> : (
            <>
              <div className={s.amount}>{formatMoney(quote.firstPayment)} <small>{oneTime ? "one-time" : `every ${PERIOD_WORDS[quote.purchase]}`}</small></div>
              {!oneTime && quote.discount > 0 && <p className={s.good}>{quote.discountPercent}% period discount: save {formatMoney(quote.discount)}</p>}
              {!oneTime && quote.totalCycles > 1 && <p>{quote.tenureMonths} months in total: {formatMoney(quote.totalPrice)}, paid one period at a time.</p>}
              {plan.capability === "upload_data" && quote.allowancePerCycle ? (
                <p>{quote.allowancePerCycle} update{quote.allowancePerCycle === 1 ? "" : "s"}{quote.files ? ` of ${quote.files} files` : ""}{oneTime ? "" : ` every ${PERIOD_WORDS[quote.purchase]}`}{oneTime && quote.validityDays ? `, to use within ${quote.validityDays} days` : ""}.</p>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className={s.actions}>
        {buyHref && <a className={s.button} href={buyHref}>Buy in the client portal →</a>}
        <a className={buyHref ? `${s.button} ${s.secondary}` : s.button} href={href}>Ask about this plan</a>
      </div>
    </article>
  );
}
