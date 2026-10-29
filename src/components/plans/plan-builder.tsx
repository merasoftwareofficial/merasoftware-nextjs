"use client";

/**
 * One plan's own page (/plans/<name>-<id>): the visitor customizes the plan and sees its price,
 * without signing in. Same steps, order and wording as the portal builder
 * (frontend/src/components/PlanBuilder.js); every price is the portal backend's quote through
 * /api/plan-quote. Nothing is bought here: "Get this plan" leads to the portal (clients),
 * sign-in (visitors, the choice kept in the address) or the team (signed-in non-clients).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BUY_WORDS, canChooseRelease, choiceQuery, choiceSummary, CYCLE_MONTHS, fileChoices, filePresets, formatMoney, lengthChoices,
  PERIOD_WORDS, planPagePath, purchaseChoices, PURCHASE_LABELS, quoteRequest, slabRows, tenureLabel, updateChoices,
  type BillingCycle, type PlanChoice, type PlanQuote, type PublicPlan,
} from "@/lib/public-plans";
import s from "./plans.module.css";

export type PlanViewer = "visitor" | "member" | "client";

function Step({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className={s.step}>
      <div className={s.stepHead}><h3>{title}</h3>{extra}</div>
      {children}
    </div>
  );
}

// A small ⓘ button that opens a bubble; closes on a click outside or Escape.
function InfoBubble({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return (
    <span ref={ref} className={s.info}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(value => !value)}>ⓘ</button>
      {open && <div role="dialog" aria-label={label} className={s.bubble}>{children}</div>}
    </span>
  );
}

const Row = ({ label, value, good }: { label: string; value: string; good?: boolean }) => (
  <div className={good ? `${s.row} ${s.good}` : s.row}><span>{label}</span><span>{value}</span></div>
);

function QuoteBill({ plan, quote, loading, error }: { plan: PublicPlan; quote: PlanQuote | null; loading: boolean; error: string }) {
  if (error) return <p className={s.error}>{error}</p>;
  if (!quote) return <p className={s.muted}>Working out the price…</p>;
  const flexible = plan.pricingMode === "flexible";
  const oneTime = quote.purchase === "one_time";
  const months = Number(quote.cycleMonths) || 1;
  const period = oneTime ? "" : PERIOD_WORDS[quote.purchase as BillingCycle];
  return (
    <div className={s.bill} data-loading={loading || undefined} aria-live="polite">
      <div className={s.rows}>
        {flexible && quote.updatePrice != null && <Row label={`1 update · ${quote.files} files`} value={formatMoney(quote.updatePrice)} />}
        {flexible && <Row label={`× ${quote.updates} update${quote.updates === 1 ? "" : "s"}${oneTime ? "" : " per month"}`} value={formatMoney(oneTime ? quote.totalPrice : quote.perMonthPrice ?? 0)} />}
        {!oneTime && months > 1 && <Row label={`× ${months} months`} value={formatMoney(quote.subtotal)} />}
        {!oneTime && quote.discount > 0 && <Row good label={`${quote.discountPercent}% period discount`} value={`− ${formatMoney(quote.discount)}`} />}
      </div>
      {oneTime ? (
        <div className={s.total}><span>Pay once</span><strong>{formatMoney(quote.firstPayment)}</strong></div>
      ) : (
        <div className={s.total}>
          <span>{months === 1 ? "Per month" : "Works out to"}</span>
          <strong>{formatMoney(Math.round(Number(quote.cyclePrice) / months))}<small> / month</small></strong>
          <span className={s.totalNote}>{months === 1 ? "Billed monthly" : `Pay every ${period}`}</span>
          {months > 1 && <span className={`${s.totalNote} ${s.num}`}>{formatMoney(quote.firstPayment)}</span>}
        </div>
      )}
      <div className={s.gives}>
        {plan.capability === "upload_data" && quote.allowancePerCycle ? (
          <b>You get {quote.allowancePerCycle} update{quote.allowancePerCycle === 1 ? "" : "s"}{quote.files ? ` · ${quote.files} files each` : ""}{oneTime ? "" : ` every ${period}`}</b>
        ) : null}
        {!oneTime && (
          <span>{quote.totalCycles > 1
            ? `${quote.tenureMonths} months in total: ${quote.totalCycles} payments of ${formatMoney(quote.cyclePrice)} (${formatMoney(quote.totalPrice)}).`
            : `${quote.tenureMonths} month${quote.tenureMonths === 1 ? "" : "s"}, paid at the start.`}</span>
        )}
        {!oneTime && quote.releaseMode === "monthly" && <span>Updates open month by month.</span>}
        {oneTime && plan.capability === "upload_data" && quote.validityDays ? <span>Use your updates within {quote.validityDays} days.</span> : null}
      </div>
    </div>
  );
}

export function PlanBuilder({ plan, initial, viewer, portalUrl, intro }: {
  plan: PublicPlan; initial: PlanChoice; viewer: PlanViewer; portalUrl: string; intro: ReactNode;
}) {
  const flexible = plan.pricingMode === "flexible";
  const purchases = useMemo(() => purchaseChoices(plan), [plan]);
  const files = useMemo(() => fileChoices(plan), [plan]);
  const updates = useMemo(() => updateChoices(plan), [plan]);
  const presets = useMemo(() => filePresets(plan), [plan]);
  const slabs = useMemo(() => slabRows(plan), [plan]);
  const [choice, setChoice] = useState<PlanChoice>(initial);
  const oneTime = choice.purchase === "one_time";
  const cycleMonths = oneTime ? null : CYCLE_MONTHS[choice.purchase as BillingCycle];
  const lengths = useMemo(() => lengthChoices(plan, cycleMonths), [plan, cycleMonths]);
  const releaseChoice = canChooseRelease(plan, cycleMonths);
  const set = (part: Partial<PlanChoice>) => setChoice(current => ({ ...current, ...part }));

  // The quote request; its JSON is also the key of the answer, so "loading" is simply
  // "the last answer was for a different choice". Only the newest answer counts.
  const request = useMemo(() => JSON.stringify(quoteRequest(plan, choice)), [plan, choice]);
  const [answer, setAnswer] = useState<{ request: string; error: string; quote: PlanQuote | null }>({ request: "", error: "", quote: null });
  const ticket = useRef(0);
  useEffect(() => {
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
    }, 250);
    return () => clearTimeout(timer);
  }, [request]);
  const loading = answer.request !== request;
  const error = loading ? "" : answer.error;
  const quote = answer.quote;

  const choosePurchase = (value: PlanChoice["purchase"]) => set({ purchase: value, tenureMonths: purchases.find(option => option.value === value)?.months ?? null });

  // "Get this plan": clients buy in their portal; visitors sign in first and come back to this
  // same choice; signed-in non-clients reach the team (until the website request form exists).
  const summary = choiceSummary(plan, choice);
  const here = `${planPagePath(plan)}?${choiceQuery(plan, choice)}`;
  const cta = viewer === "client" && portalUrl
    ? { href: `${portalUrl}/service-plan-detail/${plan._id}`, note: "Opens this plan in your client portal." }
    : viewer === "visitor"
      ? { href: `/login?next=${encodeURIComponent(here)}`, note: "Sign in to continue. Your choices stay as they are." }
      : {
          href: `mailto:contact@merasoftware.com?subject=${encodeURIComponent(`${plan.serviceName} plan`)}&body=${encodeURIComponent(`Hello, I would like the ${plan.serviceName} plan: ${summary}${quote && !loading ? ` (${formatMoney(quote.firstPayment)} ${oneTime ? "one-time" : `every ${PERIOD_WORDS[choice.purchase as BillingCycle]}`})` : ""}. Please contact me.`)}`,
          note: "Our team will contact you to start this plan.",
        };
  const price = quote && !loading ? `${formatMoney(quote.firstPayment)} ${oneTime ? "one-time" : `/ ${PERIOD_WORDS[choice.purchase as BillingCycle]}`}` : "…";

  const steps: ReactNode[] = [];
  if (flexible && files.length) {
    steps.push(
      <Step key="files" title="How many files in each update?" extra={slabs.length > 0 && (
        <InfoBubble label="File pricing">
          <table aria-label="Price per file"><tbody>
            {slabs.map(row => <tr key={row.from} data-active={(choice.files ?? 0) >= row.from || undefined}><td>Files {row.from}–{row.to}</td><td>{formatMoney(row.rate)} / file</td></tr>)}
          </tbody></table>
        </InfoBubble>
      )}>
        <div className={s.bigNumber}><strong>{choice.files}</strong><span>files in each update</span></div>
        <input type="range" aria-label="Files per update" className={s.slider} min={files[0]} max={files[files.length - 1]} step={plan.files?.step || 1} value={choice.files ?? files[0]} onChange={event => set({ files: Number(event.target.value) })} />
        <div className={s.ends}><span>{files[0]}</span><span>{files[files.length - 1]}</span></div>
        {presets.length > 0 && <div className={s.pills}>{presets.map(value => <button key={value} type="button" className={s.pill} aria-pressed={choice.files === value} onClick={() => set({ files: value })}>{value} files</button>)}</div>}
      </Step>,
    );
  }
  if (flexible && updates.length) {
    steps.push(
      <Step key="updates" title={oneTime ? "How many updates do you need?" : "How many updates do you need each month?"}>
        <select aria-label={oneTime ? "Number of updates" : "Updates per month"} className={s.select} value={choice.updates ?? ""} onChange={event => set({ updates: Number(event.target.value) })}>
          {updates.map(value => <option key={value} value={value}>{value} update{value === 1 ? "" : "s"}{oneTime ? "" : " per month"}</option>)}
        </select>
        <p className={s.hint}>Each update gets its own {choice.files} files.</p>
      </Step>,
    );
  }
  if (purchases.length > 1 || !oneTime) {
    steps.push(
      <Step key="purchase" title="How do you want to pay?">
        <div className={s.segs}>
          {purchases.map(option => (
            <button key={option.value} type="button" className={s.seg} aria-pressed={choice.purchase === option.value} onClick={() => choosePurchase(option.value)}>
              <b>{PURCHASE_LABELS[option.value]}</b>
              <span className={option.discountPercent ? s.good : undefined}>{option.value === "one_time" ? "no repeat" : option.discountPercent ? `save ${option.discountPercent}%` : `billed every ${PERIOD_WORDS[option.value]}`}</span>
            </button>
          ))}
        </div>
      </Step>,
    );
  }
  if (!oneTime && lengths.length) {
    steps.push(
      <Step key="length" title="For how long?">
        <div className={s.pills}>{lengths.map(months => <button key={months} type="button" className={s.pill} aria-pressed={choice.tenureMonths === months} onClick={() => set({ tenureMonths: months })}>{tenureLabel(months)}</button>)}</div>
        <p className={s.hint}>The plan ends after this time. You pay one period at a time.</p>
      </Step>,
    );
  }
  if (!oneTime && releaseChoice) {
    steps.push(
      <Step key="release" title="When should your updates open?">
        <div className={`${s.segs} ${s.two}`}>
          <button type="button" className={s.seg} aria-pressed={choice.releaseMode === "all_at_once"} onClick={() => set({ releaseMode: "all_at_once" })}><b>All at once</b><span>use them any time in the period</span></button>
          <button type="button" className={s.seg} aria-pressed={choice.releaseMode === "monthly"} onClick={() => set({ releaseMode: "monthly" })}><b>Month by month</b><span>unused ones carry forward</span></button>
        </div>
      </Step>,
    );
  }

  return (
    <div className={s.builder}>
      <div className={s.left}>
        {intro}
        <div className={s.steps}>{steps.length ? steps : <Step title="One-time purchase"><p className={s.hint}>Nothing to choose: this plan is bought once.</p></Step>}</div>
      </div>
      <aside className={s.side} aria-label="Your plan">
        <div><p className={s.fine}>Your plan</p><h2 className={s.choiceTitle}>{flexible ? summary : `${plan.serviceName}, ${BUY_WORDS[choice.purchase]}`}</h2></div>
        <QuoteBill plan={plan} quote={quote} loading={loading} error={error} />
        <a className={s.button} href={cta.href}>Get this plan →</a>
        <p className={s.note}>{cta.note}</p>
      </aside>
      {/* Phones: the price and the button stay in reach while the steps scroll. */}
      <div className={s.mobileBar}>
        <div><span>Your plan</span><strong>{error ? "—" : price}</strong></div>
        <a className={s.button} href={cta.href}>Get this plan →</a>
      </div>
    </div>
  );
}
