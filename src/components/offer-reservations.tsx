"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@/components/loading/navigation";
import type { OfferReservation, PackageStartList, PackageStartRequest, ReservationList } from "@/lib/offer-reservations";
import { useServerTime } from "@/components/use-server-time";
import { type PhoneCountry, type PhoneValue } from "@/components/phone-field";
import type { Offer } from "@/lib/offers";
import type { PackageChoice } from "@/lib/sales-packages";
import { reservationHoldHours, reservationPhase, reserveCta } from "@/lib/offer-reservation-rules";

const INDIA: PhoneCountry[] = [{ code: "+91", label: "India", digits: 10 }];

const intentKey = "pending-offer-reservation";
const deadline = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
const price = (value: number) => `₹${value.toLocaleString("en-IN")}`;
function remaining(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s remaining`;
}
function ReservationCard({ row, now }: { row: OfferReservation; now: number }) {
  const review = row.status === "under_review";
  // Start my project pauses the clock until the team acts: never expired while paused.
  const paused = row.status === "start_requested";
  // The deadline in force (an admin extension moves it); the original stays as history.
  const due = row.deadline ?? row.expiresAt;
  const expired = row.status !== "confirmed" && !review && !paused && Date.parse(due) <= now;
  return <article className={`offer-reservation${expired ? " is-expired" : ""}`}>
    <h2>{row.title}</h2>
    <p className="offer-reservation-status"><b>{expired ? "Expired" : row.status === "confirmed" ? "Price locked" : review ? "Payment under review" : paused ? "Start requested" : "Reserved"}</b> {price(row.reservedPrice)}</p>
    {row.status === "reserved" && !expired && <p aria-live="off">{remaining(due, now)}</p>}
    {paused && <p>Paused – our team is setting up your project.</p>}
    {review && <p>Your payment was submitted before the deadline and is being verified. Your reserved price is held.</p>}
    <p className="offer-reservation-meta">Reserved: {deadline(row.reservedAt)}<br />Payment deadline: {paused ? "paused until your project is set up" : `${deadline(due)}${row.extendedUntil ? " (extended by our team)" : ""}`}</p>
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
  return <div>{error && <p role="alert" className="admin-empty">{error} <button className="text-link" onClick={() => void refresh()}>Retry</button></p>}
    {!rows && !error && <p className="admin-empty">Loading your offers…</p>}
    {rows?.length === 0 && <div className="admin-empty"><b>You have no reserved offers yet.</b><br />When an offer opens reservations, use Reserve on the offer page and it will appear here.</div>}
    {rows?.map(row => <ReservationCard key={row.id} row={row} now={now} />)}</div>;
}
/** What the offer page passes to its card; the card renders the state (page-content.tsx). */
export type ReservationConfig = { slug: string; quoteKey: string; signedIn: boolean; serverNow: string; countries?: PhoneCountry[] };
export type ReservationControl = ReturnType<typeof useOfferReservation>;

/**
 * The customer's reservation for one offer: load, reserve, sign-in continuation, phone request and
 * retry. It renders nothing itself; the offer card shows `cta` as its one main button and asks for
 * confirmation in a dialog (lib/offer-reservation-rules.ts). `config` is undefined when public
 * reservations are off or in previews; the hook then does nothing.
 */
export function useOfferReservation(config: ReservationConfig | undefined, offer: Pick<Offer, "status" | "endsAt" | "targets" | "reserveWindowHours" | "reservationHoldHours">) {
  const enabled = !!config, slug = config?.slug ?? "", quoteKey = config?.quoteKey ?? "", signedIn = !!config?.signedIn, endsAt = offer.endsAt;
  const countries = config?.countries ?? INDIA;
  const router = useNavigate();
  const [row, setRow] = useState<OfferReservation | null>(null);
  const [loaded, setLoaded] = useState(!signedIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  // Older accounts without a phone are asked once (HTTP 428); the number is sent with the reservation.
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phone, setPhoneState] = useState<PhoneValue>({ countryCode: countries[0].code, phone: "" });
  const phoneRef = useRef<PhoneValue | null>(null);
  const attempted = useRef(false);
  const now = useServerTime() ?? Date.parse(config?.serverNow ?? offer.endsAt);
  const reserve = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const contact = phoneRef.current ? { countryCode: phoneRef.current.countryCode, phone: phoneRef.current.phone.trim() } : {};
      const response = await fetch("/api/offer-reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerSlug: slug, quoteKey, ...contact }) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) sessionStorage.removeItem(intentKey);
        if (response.status === 428) setNeedsPhone(true);
        throw new Error(data.error || "Could not reserve this offer");
      }
      setRow(data.reservation); sessionStorage.removeItem(intentKey);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not reserve this offer"); }
    finally { setBusy(false); }
  }, [slug, quoteKey]);
  // Start my project: the team is told and the clock pauses (backend helpers/reservationStart.js).
  const startProject = useCallback(async (id: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/offer-reservations/${encodeURIComponent(id)}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send your request");
      setRow(data.reservation);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send your request"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    if (!enabled || !signedIn) return;
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
        const renewable = found?.status === 'expired' && !found.projectId && found.periodEndsAt && Date.parse(found.periodEndsAt) < Date.parse(endsAt);
        if (found && !renewable) { if (intent?.slug === slug) sessionStorage.removeItem(intentKey); return; }
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
  }, [enabled, signedIn, slug, quoteKey, endsAt, reserve, retry]);
  const phase = enabled ? reservationPhase(offer, row, loaded, now) : "none";
  return {
    phase, row, now, error, busy, loaded, signedIn, needsPhone, phone, countries,
    cta: reserveCta(phase, row, now, reservationHoldHours(offer)),
    setPhone(value: PhoneValue) { setPhoneState(value); phoneRef.current = value; },
    /** The dialog's confirm: reserve now, or keep the intent and sign in first (it reserves on return). */
    confirm() {
      if (signedIn) { void reserve(); return; }
      try { sessionStorage.setItem(intentKey, JSON.stringify({ slug, quoteKey, createdAt: Date.now() })); }
      catch { setError("Allow browser session storage to return to this reservation after signing in."); return; }
      router.push(`/login?next=${encodeURIComponent(`/offer/${slug}`)}`);
    },
    /** The dialog's confirm when the card shows Start my project. */
    start() { if (row) void startProject(row.id); },
    retry() { setError(""); setRetry(value => value + 1); },
  };
}

/** What a package page passes for Start my project without an offer; undefined while the feature is off.
 * The customize page (src/docs/package.md §3) adds the customer's choice and comes back to itself after sign-in. */
export type PackageStartConfig = { packageId: string; signedIn: boolean; countries?: PhoneCountry[]; choice?: PackageChoice; returnPath?: string };
const packageIntentKey = "pending-package-start";
/**
 * "Start my project" on a package without a running offer (backend helpers/packageStart.js): load the
 * person's open request, send one, continue after sign-in, ask for a missing phone (HTTP 428). It renders
 * nothing; the package card shows it as its main button and confirms in a dialog.
 */
export function usePackageStart(config: PackageStartConfig | undefined) {
  const enabled = !!config, packageId = config?.packageId ?? "", signedIn = !!config?.signedIn;
  // The newest choice, read when sending, so changing it never reloads the open request.
  const choiceRef = useRef(config?.choice);
  useEffect(() => { choiceRef.current = config?.choice; });
  const returnPath = config?.returnPath ?? `/package/${packageId}`;
  const countries = config?.countries ?? INDIA;
  const router = useNavigate();
  const [request, setRequest] = useState<PackageStartRequest | null>(null);
  const [loaded, setLoaded] = useState(!signedIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phone, setPhoneState] = useState<PhoneValue>({ countryCode: countries[0].code, phone: "" });
  const phoneRef = useRef<PhoneValue | null>(null);
  const attempted = useRef(false);
  const send = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const contact = phoneRef.current ? { countryCode: phoneRef.current.countryCode, phone: phoneRef.current.phone.trim() } : {};
      const response = await fetch("/api/package-starts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packageId, ...(choiceRef.current ? { choice: choiceRef.current } : {}), ...contact }) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 428) setNeedsPhone(true);
        else sessionStorage.removeItem(packageIntentKey);
        throw new Error(data.error || "Could not send your request");
      }
      setRequest(data.request); sessionStorage.removeItem(packageIntentKey);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send your request"); }
    finally { setBusy(false); }
  }, [packageId]);
  useEffect(() => {
    if (!enabled || !signedIn) return;
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/package-starts", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check your request");
        if (!active) return;
        const open = (data as PackageStartList).requests.find(row => row.packageId === packageId && row.status === "requested");
        setRequest(open || null); setLoaded(true);
        // Back from sign-in with a pending Start: send it once (15 minutes at most).
        let intent;
        try { intent = JSON.parse(sessionStorage.getItem(packageIntentKey) || "null"); } catch { sessionStorage.removeItem(packageIntentKey); }
        if (intent?.packageId !== packageId || attempted.current) return;
        attempted.current = true;
        if (open || !Number.isFinite(intent.createdAt) || Date.now() - intent.createdAt > 15 * 60000 || Date.now() < intent.createdAt) { sessionStorage.removeItem(packageIntentKey); return; }
        await send();
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Could not check your request"); }
    }
    void load();
    return () => { active = false; };
  }, [enabled, signedIn, packageId, send]);
  return {
    enabled, request, loaded, busy, error, signedIn, needsPhone, phone, countries,
    setPhone(value: PhoneValue) { setPhoneState(value); phoneRef.current = value; },
    /** The dialog's confirm: send now, or keep the intent and sign in first (it sends on return). */
    confirm() {
      if (signedIn) { void send(); return; }
      try { sessionStorage.setItem(packageIntentKey, JSON.stringify({ packageId, createdAt: Date.now() })); }
      catch { setError("Allow browser session storage to return here after signing in."); return; }
      router.push(`/login?next=${encodeURIComponent(returnPath)}`);
    },
  };
}
