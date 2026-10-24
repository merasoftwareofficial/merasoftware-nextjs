"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/link";
import { useNavigate } from "@/components/loading/navigation";
import type { OfferReservation, ReservationList } from "@/lib/offer-reservations";
import { useServerTime } from "@/components/use-server-time";

const intentKey = "pending-offer-reservation";
const deadline = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
const price = (value: number) => `₹${value.toLocaleString("en-IN")}`;
function remaining(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s remaining`;
}
function ReservationCard({ row, now }: { row: OfferReservation; now: number }) {
  const expired = row.status !== "confirmed" && Date.parse(row.expiresAt) <= now;
  return <article style={{ padding: 24, marginBlock: 16, border: "1px solid #d1d5db", borderRadius: 16, ...(expired ? { background: "#f3f4f6", color: "#6b7280" } : {}) }}>
    <h2>{row.title}</h2><p><strong>{expired ? "Expired" : row.status === "confirmed" ? "Price locked" : "Reserved"}</strong> · {price(row.reservedPrice)}</p>
    {row.status === "reserved" && !expired && <p aria-live="off">{remaining(row.expiresAt, now)}</p>}
    <p>Reserved: {deadline(row.reservedAt)}<br />Payment deadline: {deadline(row.expiresAt)}</p>
    {!row.projectId && !expired && <p>Our team will help you create your project and complete payment.</p>}
    <details><summary>Reserved terms</summary><ul>{row.terms.map((term, index) => <li key={index}>{term}</li>)}</ul></details>
  </article>;
}
export function MyOffers({ serverNow }: { serverNow: string }) {
  const [rows, setRows] = useState<OfferReservation[] | null>(null);
  const [error, setError] = useState("");
  const now = useServerTime() ?? Date.parse(serverNow);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/offer-reservations", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load offers");
      const list = data as ReservationList; setRows(list.reservations); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load offers"); }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh); const timer = setInterval(() => void refresh(), 60000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  return <div>{error && <p role="alert">{error} <button onClick={() => void refresh()}>Retry</button></p>}
    {!rows && !error && <p>Loading your offers…</p>}
    {rows?.length === 0 && <p>You have no reserved offers yet.</p>}
    {rows?.map(row => <ReservationCard key={row.id} row={row} now={now} />)}</div>;
}
export function ReserveOffer({ slug, quoteKey, endsAt, signedIn, serverNow }: { slug: string; quoteKey: string; endsAt: string; signedIn: boolean; serverNow: string }) {
  const router = useNavigate();
  const [row, setRow] = useState<OfferReservation | null>(null);
  const [loaded, setLoaded] = useState(!signedIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const attempted = useRef(false);
  const now = useServerTime() ?? Date.parse(serverNow);
  const reserve = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/offer-reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerSlug: slug, quoteKey }) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) sessionStorage.removeItem(intentKey);
        throw new Error(data.error || "Could not reserve this offer");
      }
      setRow(data.reservation); sessionStorage.removeItem(intentKey);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not reserve this offer"); }
    finally { setBusy(false); }
  }, [slug, quoteKey]);
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/offer-reservations", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check your reservation");
        if (!active) return;
        const found = (data as ReservationList).reservations.find(item => item.offerSlug === slug);
        setRow(found || null); setLoaded(true);
        let intent;
        try { intent = JSON.parse(sessionStorage.getItem(intentKey) || "null"); } catch { sessionStorage.removeItem(intentKey); }
        if (found) { if (intent?.slug === slug) sessionStorage.removeItem(intentKey); return; }
        if (intent?.slug !== slug || attempted.current) return;
        attempted.current = true;
        if (intent.quoteKey !== quoteKey || !Number.isFinite(intent.createdAt) || Date.now() - intent.createdAt > 15 * 60000 || Date.now() < intent.createdAt) {
          sessionStorage.removeItem(intentKey); setError("Please review the current offer and reserve again."); return;
        }
        await reserve();
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Could not check your reservation"); }
    }
    void load();
    return () => { active = false; };
  }, [signedIn, slug, quoteKey, reserve, retry]);
  const left = Date.parse(endsAt) - now;
  if (row) return <div style={{ marginTop: 16 }}><ReservationCard row={row} now={now} /><Link href="/account/offers">My offers →</Link></div>;
  if (!(left > 0 && left <= 24 * 3600000) && !error) return null;
  return <div style={{ marginTop: 16 }}>
    <h2>Reserve this offer for 72 hours</h2><p>The 72 hours start when your reservation is saved. Complete the required first payment before your reservation deadline.</p>
    {error && <p role="alert">{error}</p>}
    <button className="button button-primary" disabled={busy || !loaded || left <= 0} onClick={() => {
      if (signedIn) { void reserve(); return; }
      try { sessionStorage.setItem(intentKey, JSON.stringify({ slug, quoteKey, createdAt: Date.now() })); }
      catch { setError("Allow browser session storage to return to this reservation after signing in."); return; }
      router.push(`/login?next=${encodeURIComponent(`/offer/${slug}`)}`);
    }}>{busy ? "Reserving…" : !loaded ? "Checking reservation…" : "Reserve offer"}</button>
    {!loaded && error && <button onClick={() => setRetry(value => value + 1)}>Retry</button>}
  </div>;
}
