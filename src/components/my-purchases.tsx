"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/link";
import { offersLine, purchasesLine, type Purchase } from "@/lib/my-purchases";
import type { ReservationList } from "@/lib/offer-reservations";
import styles from "./my-purchases.module.css";

const boughtOn = (value: string | null) => value
  ? new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })
  : "";

async function readPurchases(): Promise<Purchase[]> {
  const response = await fetch("/api/my-purchases", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not load your purchases");
  return data.purchases ?? [];
}

/**
 * My Account → My purchases: every bought plan with its live status, each opening in the client portal.
 * `newOrderId` (from the portal checkout's return) marks the plan just bought and brings it into view.
 */
export function MyPurchases({ newOrderId }: { newOrderId?: string }) {
  const [rows, setRows] = useState<Purchase[] | null>(null);
  const [error, setError] = useState("");
  const freshRef = useRef<HTMLElement>(null);
  const refresh = useCallback(async () => {
    try { setRows(await readPurchases()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load your purchases"); }
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);
  useEffect(() => { if (rows) freshRef.current?.scrollIntoView({ block: "center" }); }, [rows]);

  return <div>
    <p className={styles.intro}>You use every plan in your client portal: send files, follow the work and see bills there.</p>
    {error && <p role="alert" className="admin-empty">{error} <button className="text-link" onClick={() => void refresh()}>Retry</button></p>}
    {!rows && !error && <p className="admin-empty">Loading your purchases…</p>}
    {rows?.length === 0 && <div className="admin-empty"><b>You have not bought anything yet.</b><br /><Link className="text-link" href="/plans">See plans →</Link></div>}
    {rows?.map(row => <article key={row.id} ref={row.id === newOrderId ? freshRef : undefined} className={`${styles.card}${row.id === newOrderId ? ` ${styles.fresh}` : ""}`}>
      {row.id === newOrderId && <p className={styles.freshLabel}>✓ Your new plan</p>}
      <div className={styles.head}>
        <h2>{row.name}</h2>
        <span className={styles.status} data-tone={row.tone}>{row.status}</span>
      </div>
      <p className={styles.meta}>Plan{row.boughtAt ? ` · bought ${boughtOn(row.boughtAt)}` : ""}</p>
      {row.code === "pending_approval" && <p>We are checking your payment. You can send your data once it is approved.</p>}
      {row.code === "rejected" && <p>Your payment was not approved. See the reason in your client portal.</p>}
      <a className={styles.open} href={row.href}>Open in portal →</a>
    </article>)}
  </div>;
}

/**
 * The live line on an Overview box (docs/plan.md decision 11): only My purchases and My offers have one.
 * The box itself is static and shows at once; this line fills in with a small loader.
 */
export function AccountLiveLine({ kind }: { kind: "purchases" | "offers" }) {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = kind === "purchases"
      ? readPurchases().then(purchasesLine)
      : fetch("/api/offer-reservations", { cache: "no-store" }).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error();
        const list = data as ReservationList;
        return offersLine(list.reservations, Date.parse(list.serverNow) || Date.now());
      });
    load.then(text => { if (live) setLine(text); }, () => { if (live) setLine(""); });
    return () => { live = false; };
  }, [kind]);
  if (line === "") return null;
  return <p className={styles.live} aria-live="polite">{line ?? <span className={styles.loading}>Checking…</span>}</p>;
}
