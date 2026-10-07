"use client";
import { useState } from "react";
import { money, type Package } from "@/lib/campaign-packages";
import s from "./campaign.module.css";
export function PackageCard({ plan, staff = false, onSelect }: { plan: Package; staff?: boolean; onSelect?: (plan: Package) => void }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(`${plan.name} — ${money(plan.price)} ${plan.cadence}\n${plan.features.map(f => `• ${f}`).join("\n")}\n${plan.notes.join("\n")}`); setStatus("Summary copied."); }
    catch { setStatus("Copy unavailable. Select and copy the details manually."); }
  }
  return <article className={s.card}><h3>{plan.name}</h3><p>{plan.bestFor}</p><div className={s.price}>{money(plan.price)} <small>{plan.cadence}</small></div>{plan.reels && <div className={s.pills}><span>{plan.reels} reels</span><span>{plan.photos} photo posts</span><span>{plan.shoots === "Not included" ? "Your raw content" : `${plan.shoots} shoots`}</span></div>}<details open={staff}><summary>What&apos;s included</summary><ul className={s.list}>{plan.features.map(f => <li key={f}>{f}</li>)}</ul></details>{staff ? <><details><summary>Confirm before quotation</summary><ul className={s.list}>{plan.notes.map(n => <li key={n}>{n}</li>)}</ul></details><div className={s.actions}><button className={s.button} onClick={copy}>Copy summary</button></div><p role="status" className={s.status}>{status}</p></> : <>{plan.shoots === "Not included" && <p className={s.fine}>You provide raw photos, videos & business information.</p>}{onSelect && <button className={`${s.button} ${s.secondary}`} onClick={() => onSelect(plan)}>Discuss this package ↗</button>}</>}</article>;
}
